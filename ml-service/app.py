import os
import time

import torch
import torch.nn.functional as F
from flask import Flask, jsonify, request
from transformers import AutoModelForSequenceClassification, AutoTokenizer


HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "sseia/diari-core-mood").strip()
HF_TOKEN = os.environ.get("HF_TOKEN", "").strip()
MAX_LEN = int(os.environ.get("MODEL_MAX_LEN", "256"))
WORD_MIN = int(os.environ.get("MODEL_WORD_MIN", "3"))
WORD_MAX = int(os.environ.get("MODEL_WORD_MAX", "300"))

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

ALLOWED_LABELS = ("angry", "anxious", "happy", "neutral", "sad")

app = Flask(__name__)


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


TOKENIZER = AutoTokenizer.from_pretrained(HF_MODEL_ID, **_model_kwargs())
MODEL = AutoModelForSequenceClassification.from_pretrained(HF_MODEL_ID, **_model_kwargs()).to(DEVICE)
MODEL.eval()

LABELS = None
try:
    cfg = getattr(MODEL, "config", None)
    if cfg and isinstance(getattr(cfg, "id2label", None), dict) and cfg.id2label:
        LABELS = [str(cfg.id2label[i]).strip().lower() for i in range(len(cfg.id2label))]
except Exception:
    LABELS = None


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "modelId": HF_MODEL_ID,
            "device": str(DEVICE),
            "labels": LABELS,
        }
    )


@app.post("/predict")
def predict():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    word_count = len(text.split())
    if not text:
        return jsonify({"success": False, "error": "text is required"}), 400
    if word_count < WORD_MIN:
        return jsonify({"success": False, "error": "text is too short"}), 400
    if word_count > WORD_MAX:
        return jsonify({"success": False, "error": "text is too long"}), 400

    encoding = TOKENIZER(text, max_length=MAX_LEN, padding=True, truncation=True, return_tensors="pt")
    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)

    started = time.time()
    with torch.no_grad():
        out = MODEL(input_ids=input_ids, attention_mask=attention_mask)
        logits = out.logits
        probs = F.softmax(logits, dim=1).detach().cpu().numpy()[0].tolist()

    labels = LABELS or [str(i) for i in range(len(probs))]
    pairs = sorted(zip(labels, probs), key=lambda x: x[1], reverse=True)
    primary_label, primary_prob = pairs[0]
    primary_label = str(primary_label).strip().lower()
    if primary_label not in ALLOWED_LABELS:
        primary_label = "neutral"
    sentiment_label = _derive_sentiment_from_emotion(primary_label)
    sentiment_score = float(primary_prob)

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
