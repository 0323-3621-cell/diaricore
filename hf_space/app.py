"""
DiariCore Inference API — HuggingFace Space
FastAPI server that loads the mood classification model and serves predictions.

Loading strategy (in priority order):
  1. If pytorch_model.bin exists and is newer than model.onnx → re-export ONNX
  2. If model.onnx exists and is up-to-date → use directly
  3. Download pytorch_model.bin → export to ONNX → serve

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
# If "1"/"true", never run torch.export — use model.onnx from the Hub only (helps when Space export fails).
SKIP_ONNX_EXPORT = (os.environ.get("SKIP_ONNX_EXPORT", "").strip().lower() in ("1", "true", "yes"))

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
_LOAD_ERR        = None
_LAST_EXPORT_ERR = None  # surfaced in /health when export fails but Hub fallback might work
_LOADED    = False
_RAKE_READY = False
_RAKE_LOCK  = threading.Lock()

# ---------------------------------------------------------------------------
# RAKE keywords (for DiariCore trigger analytics; NLTK data downloaded once)
# ---------------------------------------------------------------------------

def _ensure_rake_nltk() -> None:
    global _RAKE_READY
    if _RAKE_READY:
        return
    with _RAKE_LOCK:
        if _RAKE_READY:
            return
        try:
            import nltk

            for pkg in ("punkt", "punkt_tab", "stopwords"):
                try:
                    nltk.download(pkg, quiet=True)
                except Exception:
                    pass
        except Exception as e:
            print(f"[inference] NLTK / RAKE prep warning: {e}")
        _RAKE_READY = True


def extract_rake_keywords(text: str, max_keywords: int = 12) -> list:
    """RAKE-ranked phrases (length 1–3 tokens), lowercase, deduped."""
    _ensure_rake_nltk()
    try:
        from rake_nltk import Rake

        rake = Rake(min_length=1, max_length=3)
        rake.extract_keywords_from_text(text or "")
        phrases = rake.get_ranked_phrases()
        out, seen = [], set()
        for p in phrases:
            s = (p or "").strip().lower()
            if len(s) < 2:
                continue
            s = s[:128]
            if s in seen:
                continue
            seen.add(s)
            out.append(s)
            if len(out) >= max_keywords:
                break
        return out
    except Exception as e:
        print(f"[inference] RAKE extract error: {e}")
        return []


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
# Custom model architecture (must match training notebook exactly)
# ---------------------------------------------------------------------------

def _build_custom_model():
    """
    XLMRobertaMoodClassifier — mirrors the training notebook architecture:
    xlm-roberta-base backbone + custom head:
      Dropout(0.4) -> Linear(768, 384) -> LayerNorm(384) -> GELU -> Dropout(0.2) -> Linear(384, 5)
    """
    import torch.nn as nn
    from transformers import AutoModelForSequenceClassification

    class XLMRobertaMoodClassifier(nn.Module):
        def __init__(self, num_classes=5, dropout=0.4):
            super().__init__()
            self.xlm_roberta = AutoModelForSequenceClassification.from_pretrained(
                "xlm-roberta-base",
                num_labels=num_classes,
                hidden_dropout_prob=0.1,
                attention_probs_dropout_prob=0.1,
                ignore_mismatched_sizes=True,
            )
            hidden_size = self.xlm_roberta.config.hidden_size
            self.xlm_roberta.classifier = nn.Sequential(
                nn.Dropout(dropout),
                nn.Linear(hidden_size, hidden_size // 2),
                nn.LayerNorm(hidden_size // 2),
                nn.GELU(),
                nn.Dropout(dropout / 2),
                nn.Linear(hidden_size // 2, num_classes),
            )

        def forward(self, input_ids, attention_mask):
            outputs = self.xlm_roberta.roberta(
                input_ids=input_ids, attention_mask=attention_mask
            )
            cls_output = outputs.last_hidden_state[:, 0, :]
            return self.xlm_roberta.classifier(cls_output)

    return XLMRobertaMoodClassifier


def _export_pytorch_to_onnx(bin_path: str, tok_dir: str, onnx_path: str) -> Tuple[bool, str]:
    """Load the custom XLM-RoBERTa weights and export to ONNX. Returns (ok, error_message)."""
    try:
        import torch
    except ImportError as e:
        msg = f"torch not available for export: {e}"
        print(f"[inference] {msg}")
        return False, msg

    print("[inference] Building model for ONNX export ...")
    try:
        XLMRobertaMoodClassifier = _build_custom_model()
        try:
            state = torch.load(bin_path, map_location="cpu", weights_only=True)
        except TypeError:
            state = torch.load(bin_path, map_location="cpu")
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model = XLMRobertaMoodClassifier(num_classes=len(ALLOWED_LABELS))
        missing, unexpected = model.load_state_dict(state, strict=False)
        print(f"[inference] Weights loaded — missing={len(missing)} unexpected={len(unexpected)}")
        model = model.to(dtype=torch.float32)
        model.eval()
    except Exception as e:
        msg = f"PyTorch load for export: {e}"
        print(f"[inference] Could not load PyTorch model: {e}")
        return False, msg

    try:
        tok = _TOKENIZER
        dummy = tok(
            "Today I feel really mixed emotions about everything.",
            add_special_tokens=True,
            max_length=MAX_LEN,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        input_ids      = dummy["input_ids"]
        attention_mask = dummy["attention_mask"]

        with torch.no_grad():
            torch.onnx.export(
                model,
                (input_ids, attention_mask),
                onnx_path,
                opset_version=14,
                input_names=["input_ids", "attention_mask"],
                output_names=["logits"],
                dynamic_axes={
                    "input_ids":      {0: "batch"},
                    "attention_mask": {0: "batch"},
                    "logits":         {0: "batch"},
                },
                do_constant_folding=True,
                export_params=True,
                dynamo=False,
            )
        size_mb = os.path.getsize(onnx_path) / 1e6
        print(f"[inference] ONNX exported successfully — {size_mb:.0f} MB")
        return True, ""
    except Exception as e:
        msg = str(e)
        print(f"[inference] ONNX export failed: {e}")
        if os.path.exists(onnx_path):
            os.remove(onnx_path)
        return False, msg

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _load_model():
    global _SESSION, _TOKENIZER, _LOADED, _LOAD_ERR, _LAST_EXPORT_ERR
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

    # ── Step 1: Download tokenizer ───────────────────────────────────────────
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

    # ── Step 2: Download pytorch_model.bin (always fresh) ───────────────────
    print(f"[inference] Downloading pytorch_model.bin from {HF_MODEL_ID} ...")
    try:
        dl = hf_hub_download(
            repo_id=HF_MODEL_ID,
            filename="pytorch_model.bin",
            local_dir=CACHE_DIR,
            force_download=True,
            **hf_kwargs,
        )
        if os.path.abspath(dl) != os.path.abspath(bin_path):
            import shutil
            shutil.copy2(dl, bin_path)
        print(f"[inference] pytorch_model.bin ready ({os.path.getsize(bin_path)/1e6:.0f} MB)")
        bin_available = True
    except Exception as e:
        print(f"[inference] pytorch_model.bin not found: {e}")
        bin_available = False

    # ── Step 3: Decide whether to (re-)export ONNX ──────────────────────────
    _LAST_EXPORT_ERR = None
    need_export = False
    if not SKIP_ONNX_EXPORT and bin_available:
        if not os.path.exists(onnx_path):
            need_export = True
        elif os.path.getmtime(bin_path) > os.path.getmtime(onnx_path):
            print("[inference] pytorch_model.bin is newer — re-exporting ONNX ...")
            os.remove(onnx_path)
            need_export = True
    elif SKIP_ONNX_EXPORT and bin_available:
        print("[inference] SKIP_ONNX_EXPORT set — skipping torch ONNX export")

    if need_export:
        ok, export_msg = _export_pytorch_to_onnx(bin_path, tok_dir, onnx_path)
        if not ok:
            _LAST_EXPORT_ERR = export_msg
            print("[inference] Export failed — will try pre-built model.onnx from Hub if missing")

    # Fallback: download model.onnx if still missing
    if not os.path.exists(onnx_path):
        print(f"[inference] Downloading model.onnx from {HF_MODEL_ID} ...")
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
        except Exception as e:
            parts = ["Could not download model.onnx from Hub."]
            if _LAST_EXPORT_ERR:
                parts.append(f"ONNX export error: {_LAST_EXPORT_ERR}")
            parts.append(str(e))
            _LOAD_ERR = " ".join(parts)
            print(f"[inference] {_LOAD_ERR}")
            return

    # ── Step 4: Load ONNX session ────────────────────────────────────────────
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
    # alphabetical order: angry=0, anxious=1, happy=2, neutral=3, sad=4
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
    rake_kw = extract_rake_keywords(text or "")
    return {
        "sentimentLabel": _derive_sentiment(best),
        "sentimentScore": round(all_probs[best], 4),
        "emotionLabel":   best,
        "emotionScore":   round(all_probs[best], 4),
        "all_probs":      all_probs,
        "engine":         "fallback",
        "keywords":       rake_kw,
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

        rake_kw = extract_rake_keywords(clean)
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
            "keywords":        rake_kw,
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


def _warmup_background():
    _ensure_rake_nltk()
    _ensure_loaded()


@app.on_event("startup")
def startup():
    threading.Thread(target=_warmup_background, daemon=True).start()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": _LOADED,
        "model_error":  _LOAD_ERR,
        "export_error": _LAST_EXPORT_ERR if (not _LOADED and _LAST_EXPORT_ERR) else None,
        "skipOnnxExport": SKIP_ONNX_EXPORT,
        "hf_model_id": HF_MODEL_ID,
        "hint": None
        if _LOADED
        else (
            "Upload model.onnx to HF_MODEL_ID repo, set SKIP_ONNX_EXPORT=1, or check Space logs for export_error."
            if _LAST_EXPORT_ERR
            else "Check Space logs; ensure sseia/diari-core-mood has model.onnx or exportable pytorch_model.bin."
        ),
    }


@app.post("/predict")
def predict(req: PredictRequest):
    result = analyze(req.text)
    return JSONResponse(content=result)
