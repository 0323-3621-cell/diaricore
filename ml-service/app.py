import os
import time
import threading
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from flask import Flask, jsonify, request
from huggingface_hub import hf_hub_download
from transformers import AutoModelForSequenceClassification, AutoTokenizer


HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "sseia/diari-core-mood").strip()
HF_TOKEN = os.environ.get("HF_TOKEN", "").strip()
MAX_LEN = int(os.environ.get("MODEL_MAX_LEN", "256"))
WORD_MIN = int(os.environ.get("MODEL_WORD_MIN", "3"))
WORD_MAX = int(os.environ.get("MODEL_WORD_MAX", "300"))
MODEL_DTYPE = (os.environ.get("MODEL_DTYPE", "").strip() or "float32").lower()
USE_DYNAMIC_QUANT = (os.environ.get("MODEL_DYNAMIC_QUANT", "false").strip() or "false").lower() == "true"

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
    # Default to float32 for stability and parity with training.
    if MODEL_DTYPE in ("float16", "fp16"):
        return torch.float16
    if MODEL_DTYPE in ("bfloat16", "bf16"):
        return torch.bfloat16
    if MODEL_DTYPE in ("float32", "fp32"):
        return torch.float32

    return torch.float32


class XLMRobertaMoodClassifier(nn.Module):
    """
    Compatible loader for checkpoints saved from the custom training class
    where keys are prefixed with `xlm_roberta.*`.
    """

    def __init__(self, model_name: str, num_classes: int = 5, dropout: float = 0.4):
        super().__init__()
        self.xlm_roberta = AutoModelForSequenceClassification.from_pretrained(
            model_name,
            num_labels=num_classes,
            hidden_dropout_prob=0.1,
            attention_probs_dropout_prob=0.1,
            ignore_mismatched_sizes=True,
            **_model_kwargs(),
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
        outputs = self.xlm_roberta.roberta(input_ids=input_ids, attention_mask=attention_mask)
        cls_output = outputs.last_hidden_state[:, 0, :]
        return self.xlm_roberta.classifier(cls_output)


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

            # Download raw state dict and load through compatible custom class.
            state_path = hf_hub_download(
                repo_id=HF_MODEL_ID,
                filename="pytorch_model.bin",
                **_model_kwargs(),
            )
            state = torch.load(state_path, map_location="cpu")
            if isinstance(state, dict) and "model_state_dict" in state:
                state = state["model_state_dict"]

            mdl = XLMRobertaMoodClassifier(model_name="xlm-roberta-base", num_classes=5).to(DEVICE)
            missing, unexpected = mdl.load_state_dict(state, strict=False)
            print(f"[ml-service] checkpoint load missing={len(missing)} unexpected={len(unexpected)}")
            # Keep everything in float32 for runtime stability on CPU.
            mdl = mdl.to(dtype=torch.float32)
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
            if not labels:
                labels = ["angry", "anxious", "happy", "neutral", "sad"]

            _TOKENIZER, _MODEL, _LABELS = tok, mdl, labels
            _MODEL_STATE["loaded"] = True
            _MODEL_STATE["loaded_at"] = int(time.time())
            return _TOKENIZER, _MODEL, _LABELS, None
        except Exception as e:
            # If lower precision fails due to operator incompatibilities, retry in float32.
            try:
                tok = AutoTokenizer.from_pretrained(HF_MODEL_ID, **_model_kwargs())
                state_path = hf_hub_download(
                    repo_id=HF_MODEL_ID,
                    filename="pytorch_model.bin",
                    **_model_kwargs(),
                )
                state = torch.load(state_path, map_location="cpu")
                if isinstance(state, dict) and "model_state_dict" in state:
                    state = state["model_state_dict"]

                mdl = XLMRobertaMoodClassifier(model_name="xlm-roberta-base", num_classes=5).to(DEVICE)
                mdl.load_state_dict(state, strict=False)
                mdl = mdl.to(dtype=torch.float32)
                mdl.eval()
                cfg = getattr(mdl, "config", None)
                labels = None
                if cfg and isinstance(getattr(cfg, "id2label", None), dict) and cfg.id2label:
                    labels = [str(cfg.id2label[i]).strip().lower() for i in range(len(cfg.id2label))]
                if not labels:
                    labels = ["angry", "anxious", "happy", "neutral", "sad"]
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
            # Custom wrapper returns raw logits tensor; transformers models return object with .logits.
            logits = out.logits if hasattr(out, "logits") else out
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
