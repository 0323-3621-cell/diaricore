"""
DiariCore Inference API — HuggingFace Space
FastAPI server that loads the mood classification model and serves predictions.

Loading strategy (in priority order):
  1. If model.onnx exists in cache → use ONNX directly (fastest)
  2. If pytorch_model.bin exists → export it to ONNX, then use ONNX
  3. If neither exists → download pytorch_model.bin, export to ONNX

Replicates the notebook's predict_mood() pipeline exactly:
  tokenize -> ONNX forward -> softmax -> calibration -> keyword layer
"""

from __future__ import annotations

import os, threading, time
from typing import Dict, Optional, Tuple

import numpy as np
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "sseia/diari-core-mood").strip()
HF_TOKEN    = os.environ.get("HF_TOKEN", "").strip() or None
CACHE_DIR   = "/tmp/diaricore"
MAX_LEN     = 256

ALLOWED_LABELS = ("angry", "anxious", "happy", "neutral", "sad")

# Must match notebook predict_mood() THRESHOLDS exactly
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

_LOCK      = threading.Lock()
_SESSION   = None
_TOKENIZER = None
_LOAD_ERR  = None
_LOADED    = False

# ---------------------------------------------------------------------------
# Keyword layer
# ---------------------------------------------------------------------------

def _keyword_score(text: str) -> Dict[str, int]:
    t = text.lower()
    scores = {e: 0 for e in KEYWORD_SIGNALS}
    for emotion, langs in KEYWORD_SIGNALS.items():
        for kws in langs.values():
            for kw in kws:
                if kw.strip() in AMBIGUOUS_WORDS:
                    continue
                if kw in t:
                    scores[emotion] += 1
    return scores


def _apply_keyword_layer(text, primary, prob) -> Tuple[str, float, bool, Optional[str]]:
    if prob >= CONFIDENCE_THRESHOLD:
        return primary, prob, False, None
    if primary not in ("sad", "anxious"):
        return primary, prob, False, None
    scores = _keyword_score(text)
    best   = max(scores, key=scores.__getitem__)
    hits   = scores[best]
    if hits < MIN_KEYWORD_HITS or scores["sad"] == scores["anxious"]:
        return primary, prob, False, None
    if best != primary:
        reason = (f"keyword override: '{best}' signals={hits} "
                  f"vs '{primary}' signals={scores.get(primary, 0)}")
        return best, prob, True, reason
    return primary, prob, False, None

# ---------------------------------------------------------------------------
# Model loading — PyTorch → ONNX export pipeline
# ---------------------------------------------------------------------------

def _export_pytorch_to_onnx(bin_path: str, tok_dir: str, onnx_path: str) -> bool:
    """
    Load XLM-RoBERTa fine-tuned weights from bin_path and export to ONNX.
    Returns True on success.
    """
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
    except ImportError as e:
        print(f"[inference] torch/transformers not available for export: {e}")
        return False

    print("[inference] Loading PyTorch model for ONNX export ...")
    try:
        model = AutoModelForSequenceClassification.from_pretrained(
            tok_dir,                       # config + tokenizer already there
            state_dict=torch.load(bin_path, map_location="cpu"),
            num_labels=len(ALLOWED_LABELS),
        )
    except Exception:
        # Fallback: try loading from a saved_model directory layout
        try:
            model = AutoModelForSequenceClassification.from_pretrained(
                os.path.dirname(bin_path),
                num_labels=len(ALLOWED_LABELS),
            )
        except Exception as e2:
            print(f"[inference] Could not load PyTorch model: {e2}")
            return False

    model.eval()

    try:
        tok = _TOKENIZER  # already loaded
        dummy = tok(
            "test",
            add_special_tokens=True,
            max_length=MAX_LEN,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        import torch
        with torch.no_grad():
            torch.onnx.export(
                model,
                (dummy["input_ids"], dummy["attention_mask"]),
                onnx_path,
                input_names=["input_ids", "attention_mask"],
                output_names=["logits"],
                dynamic_axes={
                    "input_ids":      {0: "batch"},
                    "attention_mask": {0: "batch"},
                    "logits":         {0: "batch"},
                },
                opset_version=14,
            )
        size_mb = os.path.getsize(onnx_path) / 1e6
        print(f"[inference] ONNX exported successfully — {size_mb:.0f} MB")
        return True
    except Exception as e:
        print(f"[inference] ONNX export failed: {e}")
        # Clean up broken file
        if os.path.exists(onnx_path):
            os.remove(onnx_path)
        return False


def _load_model():
    global _SESSION, _TOKENIZER, _LOADED, _LOAD_ERR
    try:
        import onnxruntime as ort
        from transformers import AutoTokenizer
        from huggingface_hub import hf_hub_download, snapshot_download
    except ImportError as e:
        _LOAD_ERR = str(e)
        print(f"[inference] Import error: {e}")
        return

    os.makedirs(CACHE_DIR, exist_ok=True)
    hf_kwargs = {"token": HF_TOKEN} if HF_TOKEN else {}

    onnx_path = os.path.join(CACHE_DIR, "model.onnx")
    bin_path  = os.path.join(CACHE_DIR, "pytorch_model.bin")
    tok_dir   = os.path.join(CACHE_DIR, "tokenizer")
    tok_config = os.path.join(tok_dir, "tokenizer_config.json")

    # ── Step 1: Download tokenizer (always needed) ──────────────────────────
    if not os.path.exists(tok_config):
        print(f"[inference] Downloading tokenizer from {HF_MODEL_ID} ...")
        try:
            snapshot_download(
                repo_id=HF_MODEL_ID,
                local_dir=tok_dir,
                ignore_patterns=["*.onnx", "*.bin", "*.pt", "*.safetensors"],
                **hf_kwargs,
            )
        except Exception as e:
            _LOAD_ERR = f"Tokenizer download failed: {e}"
            print(f"[inference] {_LOAD_ERR}")
            return

    try:
        _TOKENIZER = AutoTokenizer.from_pretrained(tok_dir)
        print("[inference] Tokenizer ready")
    except Exception as e:
        _LOAD_ERR = f"Tokenizer load error: {e}"
        print(f"[inference] {_LOAD_ERR}")
        return

    # ── Step 2: Ensure we have a valid ONNX model ───────────────────────────
    # Check if the existing ONNX is stale: compare against HF commit sha
    # (simple heuristic: if pytorch_model.bin is newer than model.onnx, re-export)
    need_onnx = not os.path.exists(onnx_path)
    if not need_onnx and os.path.exists(bin_path):
        # Re-export if .bin is newer than .onnx (fresh upload scenario)
        if os.path.getmtime(bin_path) > os.path.getmtime(onnx_path):
            print("[inference] pytorch_model.bin is newer than model.onnx — re-exporting ...")
            need_onnx = True

    if need_onnx:
        # Try downloading pytorch_model.bin first (preferred: exact new weights)
        print(f"[inference] Downloading pytorch_model.bin from {HF_MODEL_ID} ...")
        try:
            dl = hf_hub_download(
                repo_id=HF_MODEL_ID,
                filename="pytorch_model.bin",
                local_dir=CACHE_DIR,
                force_download=True,   # always get the freshest weights
                **hf_kwargs,
            )
            if os.path.abspath(dl) != os.path.abspath(bin_path):
                import shutil
                shutil.copy2(dl, bin_path)
            print(f"[inference] pytorch_model.bin downloaded ({os.path.getsize(bin_path)/1e6:.0f} MB)")
        except Exception as e:
            print(f"[inference] pytorch_model.bin not found ({e}), trying model.onnx ...")
            # Fall back to downloading model.onnx directly
            try:
                dl = hf_hub_download(
                    repo_id=HF_MODEL_ID,
                    filename="model.onnx",
                    local_dir=CACHE_DIR,
                    force_download=True,
                    **hf_kwargs,
                )
                if os.path.abspath(dl) != os.path.abspath(onnx_path):
                    import shutil
                    shutil.copy2(dl, onnx_path)
                print(f"[inference] model.onnx downloaded ({os.path.getsize(onnx_path)/1e6:.0f} MB)")
            except Exception as e2:
                _LOAD_ERR = f"Could not download model weights: bin={e}, onnx={e2}"
                print(f"[inference] {_LOAD_ERR}")
                return

        # Export PyTorch → ONNX if we got the .bin
        if os.path.exists(bin_path) and not os.path.exists(onnx_path):
            if not _export_pytorch_to_onnx(bin_path, tok_dir, onnx_path):
                _LOAD_ERR = "ONNX export from PyTorch weights failed"
                print(f"[inference] {_LOAD_ERR}")
                return
        elif os.path.exists(bin_path) and need_onnx:
            # Re-export because bin is newer
            if os.path.exists(onnx_path):
                os.remove(onnx_path)
            if not _export_pytorch_to_onnx(bin_path, tok_dir, onnx_path):
                _LOAD_ERR = "ONNX re-export from PyTorch weights failed"
                print(f"[inference] {_LOAD_ERR}")
                return

    # ── Step 3: Load ONNX session ────────────────────────────────────────────
    try:
        opts = ort.SessionOptions()
        opts.log_severity_level   = 3
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 2
        _SESSION = ort.InferenceSession(
            onnx_path,
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        size_mb = os.path.getsize(onnx_path) / 1e6
        print(f"[inference] ONNX session ready — model size: {size_mb:.0f} MB")
        _LOADED = True
    except Exception as e:
        _LOAD_ERR = f"ONNX session error: {e}"
        print(f"[inference] {_LOAD_ERR}")


def _ensure_loaded() -> bool:
    global _LOADED
    if _LOADED:
        return True
    with _LOCK:
        if not _LOADED:
            _load_model()
        return _LOADED

# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def _derive_sentiment(label: str) -> str:
    if label == "happy":      return "positive"
    if label in ("angry", "anxious", "sad"): return "negative"
    return "neutral"


def _run_inference(text: str) -> Dict[str, float]:
    enc = _TOKENIZER(
        text,
        add_special_tokens=True,
        max_length=MAX_LEN,
        padding="max_length",
        truncation=True,
        return_tensors="np",
    )
    outputs = _SESSION.run(
        ["logits"],
        {
            "input_ids":      enc["input_ids"].astype("int64"),
            "attention_mask": enc["attention_mask"].astype("int64"),
        },
    )
    logits = outputs[0][0]
    exp_v  = np.exp(logits - logits.max())
    probs  = exp_v / exp_v.sum()
    # ALLOWED_LABELS is alphabetical = same as training LabelEncoder
    return {lbl: float(probs[i]) for i, lbl in enumerate(ALLOWED_LABELS)}


def _apply_calibration(raw: Dict[str, float]) -> Dict[str, float]:
    cal   = {lbl: raw.get(lbl, 0.0) * CALIBRATION.get(lbl, 1.0) for lbl in ALLOWED_LABELS}
    total = sum(cal.values()) or 1.0
    return {lbl: round(v / total, 6) for lbl, v in cal.items()}


def _fallback(text: str) -> dict:
    t   = (text or "").lower()
    neg = any(w in t for w in ["sad","galit","angry","anxious","stress","iyak","malungkot"])
    pos = any(w in t for w in ["happy","masaya","grateful","salamat","excited","calm"])
    emo = "happy" if (pos and not neg) else ("sad" if (neg and not pos) else "neutral")
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


def analyze(text: str) -> dict:
    clean = (text or "").strip()
    if not clean:
        return _fallback(clean)

    started = time.time()
    if not _ensure_loaded():
        return _fallback(clean)

    try:
        raw_probs  = _run_inference(clean)
        all_probs  = _apply_calibration(raw_probs)
        ranked     = sorted(all_probs.items(), key=lambda x: x[1], reverse=True)
        primary_label, primary_prob = ranked[0]
        secondary_label = ranked[1][0] if ranked[1][1] >= 0.15 else None

        final_label, final_prob, overridden, reason = _apply_keyword_layer(
            clean, primary_label, primary_prob
        )
        if overridden:
            print(f"[inference] keyword override: {reason}")

        return {
            "sentimentLabel":  _derive_sentiment(final_label),
            "sentimentScore":  round(final_prob, 4),
            "emotionLabel":    final_label,
            "emotionScore":    round(final_prob, 4),
            "all_probs":       all_probs,
            "secondaryMood":   secondary_label,
            "keywordOverride": overridden,
            "engine":          "onnx-space",
            "ms":              int((time.time() - started) * 1000),
        }
    except Exception as e:
        print(f"[inference] error: {e}")
        return _fallback(clean)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="DiariCore Mood Inference API", version="2.0.0")


class PredictRequest(BaseModel):
    text: str


@app.on_event("startup")
def startup():
    # Load model in background so the health endpoint works immediately
    t = threading.Thread(target=_ensure_loaded, daemon=True)
    t.start()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": _LOADED,
        "model_error":  _LOAD_ERR,
    }


@app.post("/predict")
def predict(req: PredictRequest):
    result = analyze(req.text)
    return JSONResponse(content=result)
