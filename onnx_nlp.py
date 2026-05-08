"""
onnx_nlp.py - Direct ONNX inference for DiariCore mood analysis.

Downloads the quantized ONNX model from HuggingFace Hub on first call,
caches it to /tmp, and runs inference locally with onnxruntime.
Replicates the exact predict_mood() pipeline from the training notebook:
  tokenize -> model forward -> softmax -> calibration -> keyword layer
"""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HF_MODEL_ID  = os.environ.get("HF_MODEL_ID", "sseia/diari-core-mood").strip()
HF_TOKEN     = (os.environ.get("HF_TOKEN") or os.environ.get("HF_API_TOKEN") or "").strip() or None
CACHE_DIR    = os.environ.get("ONNX_CACHE_DIR", "/tmp/diaricore")
MAX_LEN      = 256

ALLOWED_LABELS = ("angry", "anxious", "happy", "neutral", "sad")

# Must match notebook predict_mood() exactly
CALIBRATION: Dict[str, float] = {
    "angry":   1.40,
    "sad":     1.30,
    "neutral": 1.35,
    "happy":   0.75,
    "anxious": 0.70,
}

CONFIDENCE_THRESHOLD = 0.45
MIN_KEYWORD_HITS     = 2

KEYWORD_SIGNALS = {
    "sad": {
        "en": [
            "grief", "grieving", "mourning", "lost someone", "passed away",
            "lonely", "alone again", "no one", "empty inside", "hollow",
            "crying", "sobbing", "heartbroken", "broke my heart",
            "i miss you", "i miss them", "i miss her", "i miss him",
            "namimiss kita", "namimiss ko siya",
        ],
        "tl": [
            "malungkot", "lungkot", "nalulungkot", "umiiyak", "umiyak",
            "nag-iisa", "mag-isa", "nawala", "nawalan", "nawala na",
            "hindi ko na mababawi", "hindi na babalik",
        ],
    },
    "anxious": {
        "en": [
            "what if", "what will happen", "scared of", "afraid of",
            "worried about", "i keep worrying", "cant stop worrying",
            "can't stop worrying", "heart racing", "cant breathe",
            "can't breathe", "panic", "panicking", "anxious about",
            "overthinking", "overthought", "dreading", "terrified of",
            "nervous about",
        ],
        "tl": [
            "nababahala", "nag-aalala", "natatakot", "kabado", "kinakabahan",
            "hindi makatulog", "di makatulog", "di mapakali", "hindi mapakali",
            "palagi akong nag-iisip", "hindi ko maiwasang mag-isip",
        ],
    },
}

AMBIGUOUS_WORDS = {
    "miss", "feel", "think", "sad", "happy", "angry", "bad", "good",
    "okay", "ok", "fine", "lost", "hard", "difficult", "tired", "pagod",
}

# ---------------------------------------------------------------------------
# Runtime state
# ---------------------------------------------------------------------------

_LOCK     = threading.Lock()
_SESSION  = None   # onnxruntime.InferenceSession
_TOKENIZER = None  # transformers AutoTokenizer
_LOAD_ERR  = None
_LOADED    = False


# ---------------------------------------------------------------------------
# Keyword layer (mirrors ml-service/app.py exactly)
# ---------------------------------------------------------------------------

def _keyword_score(text: str) -> Dict[str, int]:
    t = text.lower()
    scores: Dict[str, int] = {e: 0 for e in KEYWORD_SIGNALS}
    for emotion, langs in KEYWORD_SIGNALS.items():
        for kws in langs.values():
            for kw in kws:
                if kw.strip() in AMBIGUOUS_WORDS:
                    continue
                if kw in t:
                    scores[emotion] += 1
    return scores


def _apply_keyword_layer(
    text: str, primary: str, prob: float
) -> Tuple[str, float, bool, Optional[str]]:
    if prob >= CONFIDENCE_THRESHOLD:
        return primary, prob, False, None
    if primary not in ("sad", "anxious"):
        return primary, prob, False, None

    scores = _keyword_score(text)
    best   = max(scores, key=scores.__getitem__)
    hits   = scores[best]

    if hits < MIN_KEYWORD_HITS:
        return primary, prob, False, None
    if scores["sad"] == scores["anxious"]:
        return primary, prob, False, None
    if best != primary:
        reason = (
            f"keyword override: '{best}' signals={hits} "
            f"vs '{primary}' signals={scores.get(primary, 0)} "
            f"(model was {prob*100:.1f}% confident)"
        )
        return best, prob, True, reason
    return primary, prob, False, None


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _model_file() -> str:
    return os.path.join(CACHE_DIR, "model_quantized.onnx")


def _tok_dir() -> str:
    return os.path.join(CACHE_DIR, "tokenizer")


def _load_model() -> None:
    global _SESSION, _TOKENIZER, _LOADED, _LOAD_ERR
    try:
        import onnxruntime as ort
        from transformers import AutoTokenizer
        from huggingface_hub import hf_hub_download, snapshot_download
    except ImportError as e:
        _LOAD_ERR = f"Missing dependency: {e}. Run: pip install onnxruntime transformers huggingface_hub sentencepiece"
        return

    os.makedirs(CACHE_DIR, exist_ok=True)
    hf_kwargs = {"token": HF_TOKEN} if HF_TOKEN else {}

    # Download quantized ONNX
    onnx_path = _model_file()
    if not os.path.exists(onnx_path):
        print(f"[onnx_nlp] Downloading model_quantized.onnx from {HF_MODEL_ID} ...")
        try:
            dl = hf_hub_download(
                repo_id=HF_MODEL_ID,
                filename="model_quantized.onnx",
                local_dir=CACHE_DIR,
                **hf_kwargs,
            )
            # hf_hub_download may return a path inside a subdir; normalise
            if os.path.abspath(dl) != os.path.abspath(onnx_path):
                import shutil
                shutil.copy2(dl, onnx_path)
        except Exception as e:
            _LOAD_ERR = f"Failed to download model_quantized.onnx: {e}"
            print(f"[onnx_nlp] {_LOAD_ERR}")
            return

    # Download tokenizer files if needed
    tok_dir = _tok_dir()
    tok_config = os.path.join(tok_dir, "tokenizer_config.json")
    if not os.path.exists(tok_config):
        print(f"[onnx_nlp] Downloading tokenizer from {HF_MODEL_ID} ...")
        try:
            snapshot_download(
                repo_id=HF_MODEL_ID,
                local_dir=tok_dir,
                ignore_patterns=["*.onnx", "*.bin", "*.pt"],
                **hf_kwargs,
            )
        except Exception as e:
            _LOAD_ERR = f"Failed to download tokenizer: {e}"
            print(f"[onnx_nlp] {_LOAD_ERR}")
            return

    # Load tokenizer
    try:
        _TOKENIZER = AutoTokenizer.from_pretrained(tok_dir)
        print("[onnx_nlp] Tokenizer loaded OK")
    except Exception as e:
        _LOAD_ERR = f"Tokenizer load failed: {e}"
        print(f"[onnx_nlp] {_LOAD_ERR}")
        return

    # Load ONNX session (CPU only)
    try:
        opts = ort.SessionOptions()
        opts.log_severity_level  = 3
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        _SESSION = ort.InferenceSession(onnx_path, sess_options=opts, providers=["CPUExecutionProvider"])
        print(f"[onnx_nlp] ONNX session ready ({os.path.getsize(onnx_path)/1e6:.0f} MB)")
        _LOADED = True
    except Exception as e:
        _LOAD_ERR = f"ONNX session failed: {e}"
        print(f"[onnx_nlp] {_LOAD_ERR}")


def _ensure_loaded() -> bool:
    global _LOADED
    if _LOADED:
        return True
    with _LOCK:
        if _LOADED:
            return True
        _load_model()
        return _LOADED


def start_background_load() -> None:
    """Call once at app startup to warm the model in the background."""
    t = threading.Thread(target=_ensure_loaded, daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

def _derive_sentiment(label: str) -> str:
    if label == "happy":
        return "positive"
    if label in ("angry", "anxious", "sad"):
        return "negative"
    return "neutral"


def _run_inference(text: str) -> Dict[str, float]:
    """Tokenize + ONNX forward + softmax. Returns raw {label: prob} dict."""
    import numpy as np

    enc = _TOKENIZER(
        text,
        add_special_tokens=True,
        max_length=MAX_LEN,
        padding="max_length",
        truncation=True,
        return_tensors="np",   # numpy output avoids torch dependency at runtime
    )

    outputs = _SESSION.run(
        ["logits"],
        {
            "input_ids":      enc["input_ids"].astype("int64"),
            "attention_mask": enc["attention_mask"].astype("int64"),
        },
    )
    logits = outputs[0][0]  # shape (5,)

    # Softmax
    logits -= logits.max()
    exp    = __import__("math").e ** logits  # avoid numpy import at top level
    import numpy as np
    exp_v  = np.exp(logits - logits.max())
    probs  = exp_v / exp_v.sum()

    # alphabetical order matches training LabelEncoder
    return {lbl: float(probs[i]) for i, lbl in enumerate(ALLOWED_LABELS)}


def _apply_calibration(raw: Dict[str, float]) -> Dict[str, float]:
    cal = {lbl: raw.get(lbl, 0.0) * CALIBRATION.get(lbl, 1.0) for lbl in ALLOWED_LABELS}
    total = sum(cal.values()) or 1.0
    return {lbl: round(v / total, 6) for lbl, v in cal.items()}


# ---------------------------------------------------------------------------
# Fallback
# ---------------------------------------------------------------------------

def _fallback(text: str) -> Dict[str, object]:
    t = (text or "").lower()
    neg = any(w in t for w in ["sad", "galit", "angry", "anxious", "stress",
                                "pagod", "tired", "iyak", "malungkot", "natatakot"])
    pos = any(w in t for w in ["happy", "masaya", "grateful", "salamat",
                                "excited", "calm", "peace", "okay"])
    if pos and not neg:
        emo = "happy"
    elif neg and not pos:
        emo = "sad"
    else:
        emo = "neutral"

    raw = {lbl: 0.0 for lbl in ALLOWED_LABELS}
    raw[emo] = 0.62
    all_probs = _apply_calibration(raw)
    best      = max(all_probs, key=all_probs.__getitem__)

    return {
        "sentimentLabel": _derive_sentiment(best),
        "sentimentScore": round(all_probs[best], 4),
        "emotionLabel":   best,
        "emotionScore":   round(all_probs[best], 4),
        "all_probs":      all_probs,
        "engine":         "fallback",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze(text: str) -> Dict[str, object]:
    clean = (text or "").strip()
    if not clean:
        return _fallback(clean)

    started = time.time()

    if not _ensure_loaded():
        print(f"[onnx_nlp] Model not loaded ({_LOAD_ERR}) — using fallback")
        return _fallback(clean)

    try:
        # 1. Model inference
        raw_probs = _run_inference(clean)

        # 2. Calibration (matches notebook THRESHOLDS exactly)
        all_probs = _apply_calibration(raw_probs)

        # Sort descending
        ranked = sorted(all_probs.items(), key=lambda x: x[1], reverse=True)
        primary_label, primary_prob = ranked[0]
        secondary_label = ranked[1][0] if ranked[1][1] >= 0.15 else None

        # 3. Keyword layer (only runs when model is unsure)
        final_label, final_prob, overridden, reason = _apply_keyword_layer(
            clean, primary_label, primary_prob
        )

        if overridden:
            print(f"[onnx_nlp] keyword override applied: {reason}")

        sentiment = _derive_sentiment(final_label)

        return {
            "sentimentLabel":  sentiment,
            "sentimentScore":  round(final_prob, 4),
            "emotionLabel":    final_label,
            "emotionScore":    round(final_prob, 4),
            "all_probs":       all_probs,
            "secondaryMood":   secondary_label,
            "keywordOverride": overridden,
            "engine":          "onnx-local",
            "ms":              int((time.time() - started) * 1000),
        }

    except Exception as e:
        print(f"[onnx_nlp] inference error: {type(e).__name__}: {e}")
        return _fallback(clean)
