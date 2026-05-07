import os
import time
import threading
from typing import Optional, Tuple

import torch
import torch.nn.functional as F
from flask import Flask, jsonify, request
from transformers import AutoModelForSequenceClassification, AutoTokenizer


HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "sseia/diari-core-mood").strip()
HF_TOKEN = os.environ.get("HF_TOKEN", "").strip()
MAX_LEN = int(os.environ.get("MODEL_MAX_LEN", "256"))
WORD_MIN = int(os.environ.get("MODEL_WORD_MIN", "3"))
WORD_MAX = int(os.environ.get("MODEL_WORD_MAX", "300"))
MODEL_DTYPE = (os.environ.get("MODEL_DTYPE", "").strip() or "").lower()
USE_DYNAMIC_QUANT = (os.environ.get("MODEL_DYNAMIC_QUANT", "true").strip() or "true").lower() == "true"

# Keep cache in a writable dir on Railway containers.
os.environ.setdefault("HF_HOME", "/tmp/hf")
os.environ.setdefault("TRANSFORMERS_CACHE", "/tmp/hf/transformers")
os.environ.setdefault("HF_HUB_CACHE", "/tmp/hf/hub")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
ALLOWED_LABELS = ("angry", "anxious", "happy", "neutral", "sad")

app = Flask(__name__)

_MODEL_STATE: dict = {
    "loaded": False,
    "loading": False,
    "error": None,
    "loaded_at": None,
}
_TOKENIZER = None
_MODEL = None
_LABELS = None
_LOAD_LOCK = threading.Lock()


def _derive_sentiment_from_emotion(label: str) -> str:
    raw = (label or "").strip().lower()
    if raw == "happy":
        return "positive"
    if raw in ("angry", "anxious", "sad"):
        return "negative"
    return "neutral"


def _model_kwargs():
    if HF_TOKEN:
        return {"token": HF_TOKEN}
    return {}


def _choose_torch_dtype():
    # Reduce RAM usage on CPU by using lower precision.
    if torch.cuda.is_available():
        return torch.float16

    if MODEL_DTYPE in ("float16", "fp16"):
        return torch.float16
    if MODEL_DTYPE in ("bfloat16", "bf16"):
        return torch.bfloat16

    # Default CPU: bf16
    return torch.bfloat16


def _load_model_if_needed() -> Tuple[Optional[object], Optional[object], Optional[list], Optional[str]]:
    global _TOKENIZER, _MODEL, _LABELS
    if _MODEL_STATE["loaded"]:
        return _TOKENIZER, _MODEL, _LABELS, None
    if _MODEL_STATE["loading"]:
        return None, None, None, "loading"

    with _LOAD_LOCK:
        if _MODEL_STATE["loaded"]:
            return _TOKENIZER, _MODEL, _LABELS, None
        if _MODEL_STATE["loading"]:
            return None, None, None, "loading"

        _MODEL_STATE["loading"] = True
        _MODEL_STATE["error"] = None
        try:
            # Reduce memory pressure on small instances.
            try:
                torch.set_num_threads(int(os.environ.get("TORCH_NUM_THREADS", "1")))
            except Exception:
                pass

            tok = AutoTokenizer.from_pretrained(HF_MODEL_ID, **_model_kwargs())
            dtype = _choose_torch_dtype()
            # low_cpu_mem_usage helps reduce peak RAM when loading weights.
            mdl = AutoModelForSequenceClassification.from_pretrained(
                HF_MODEL_ID,
                low_cpu_mem_usage=True,
                torch_dtype=dtype,
                **_model_kwargs(),
            ).to(DEVICE)
            mdl.eval()
            if USE_DYNAMIC_QUANT and DEVICE.type == "cpu":
                # Dynamic quantization reduces RAM a lot for Linear layers (int8 weights).
                try:
                    mdl = torch.quantization.quantize_dynamic(mdl, {torch.nn.Linear}, dtype=torch.qint8)
                except Exception:
                    pass
            labels = None
            cfg = getattr(mdl, "config", None)
            if cfg and isinstance(getattr(cfg, "id2label", None), dict) and cfg.id2label:
                labels = [str(cfg.id2label[i]).strip().lower() for i in range(len(cfg.id2label))]

            _TOKENIZER, _MODEL, _LABELS = tok, mdl, labels
            _MODEL_STATE["loaded"] = True
            _MODEL_STATE["loaded_at"] = int(time.time())
            return _TOKENIZER, _MODEL, _LABELS, None
        except Exception as e:
            # If lower precision fails due to operator incompatibilities, retry in float32.
            try:
                tok = AutoTokenizer.from_pretrained(HF_MODEL_ID, **_model_kwargs())
                mdl = AutoModelForSequenceClassification.from_pretrained(
                    HF_MODEL_ID,
                    low_cpu_mem_usage=True,
                    torch_dtype=torch.float32,
                    **_model_kwargs(),
                ).to(DEVICE)
                mdl.eval()
                cfg = getattr(mdl, "config", None)
                labels = None
                if cfg and isinstance(getattr(cfg, "id2label", None), dict) and cfg.id2label:
                    labels = [str(cfg.id2label[i]).strip().lower() for i in range(len(cfg.id2label))]
                _TOKENIZER, _MODEL, _LABELS = tok, mdl, labels
                _MODEL_STATE["loaded"] = True
                _MODEL_STATE["loaded_at"] = int(time.time())
                return _TOKENIZER, _MODEL, _LABELS, None
            except Exception:
                _MODEL_STATE["error"] = f"{type(e).__name__}: {str(e)[:240]}"
                return None, None, None, "error"
        finally:
            _MODEL_STATE["loading"] = False


def _start_background_load():
    if _MODEL_STATE["loaded"] or _MODEL_STATE["loading"]:
        return
    t = threading.Thread(target=_load_model_if_needed, daemon=True)
    t.start()


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "modelId": HF_MODEL_ID,
            "device": str(DEVICE),
            "loaded": bool(_MODEL_STATE["loaded"]),
            "loading": bool(_MODEL_STATE["loading"]),
            "error": _MODEL_STATE["error"],
            "labels": _LABELS,
        }
    )


@app.post("/warmup")
def warmup():
    _start_background_load()
    return jsonify(
        {
            "success": True,
            "message": "Model warmup started",
            "loading": bool(_MODEL_STATE["loading"]),
            "loaded": bool(_MODEL_STATE["loaded"]),
            "error": _MODEL_STATE["error"],
        }
    ), 202


@app.post("/predict")
def predict():
    if not _MODEL_STATE["loaded"]:
        _start_background_load()

    _, _, _, state = _load_model_if_needed()
    if state == "loading":
        return jsonify({"success": False, "error": "model is loading"}), 503
    if state == "error":
        return jsonify({"success": False, "error": _MODEL_STATE["error"] or "model failed to load"}), 500

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    word_count = len(text.split())
    if not text:
        return jsonify({"success": False, "error": "text is required"}), 400
    if word_count < WORD_MIN:
        return jsonify({"success": False, "error": "text is too short"}), 400
    if word_count > WORD_MAX:
        return jsonify({"success": False, "error": "text is too long"}), 400

    encoding = _TOKENIZER(text, max_length=MAX_LEN, padding=True, truncation=True, return_tensors="pt")
    started = time.time()
    try:
        input_ids = encoding["input_ids"].to(DEVICE)
        attention_mask = encoding["attention_mask"].to(DEVICE)

        with torch.no_grad():
            out = _MODEL(input_ids=input_ids, attention_mask=attention_mask)
            logits = out.logits
            probs = F.softmax(logits, dim=1).detach().cpu().numpy()[0].tolist()

        labels = _LABELS or [str(i) for i in range(len(probs))]
        pairs = sorted(zip(labels, probs), key=lambda x: x[1], reverse=True)
        primary_label, primary_prob = pairs[0]
        primary_label = str(primary_label).strip().lower()
        if primary_label not in ALLOWED_LABELS:
            primary_label = "neutral"
        sentiment_label = _derive_sentiment_from_emotion(primary_label)
        sentiment_score = float(primary_prob)
    except Exception as e:
        _MODEL_STATE["error"] = f"{type(e).__name__}: {str(e)[:240]}"
        return jsonify({"success": False, "error": _MODEL_STATE["error"], "ms": int((time.time() - started) * 1000)}), 500

    return jsonify(
        {
            "success": True,
            "engine": "ml-service",
            "primary_mood": primary_label,
            "primary_prob": round(float(primary_prob), 6),
            "all_probs": {str(k).strip().lower(): round(float(v), 6) for k, v in pairs},
            "emotionLabel": primary_label,
            "emotionScore": round(float(primary_prob), 6),
            "sentimentLabel": sentiment_label,
            "sentimentScore": round(float(max(0.0, min(1.0, sentiment_score))), 6),
            "ms": int((time.time() - started) * 1000),
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
