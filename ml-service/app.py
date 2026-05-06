import json
import os
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from flask import Flask, jsonify, request
from transformers import AutoModelForSequenceClassification, AutoTokenizer


BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"
LABEL_MAP_PATH = MODEL_DIR / "label_map.json"
MODEL_PATH = Path(os.environ.get("MOOD_MODEL_PATH", str(MODEL_DIR / "best_xlmr_mood.pt")))
MODEL_NAME = os.environ.get("MODEL_NAME", "xlm-roberta-base")
MAX_LEN = int(os.environ.get("MODEL_MAX_LEN", "256"))
WORD_MIN = int(os.environ.get("MODEL_WORD_MIN", "3"))
WORD_MAX = int(os.environ.get("MODEL_WORD_MAX", "300"))

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CALIBRATION = {
    "angry": 1.40,
    "sad": 1.30,
    "neutral": 1.35,
    "happy": 0.75,
    "anxious": 0.70,
}


class XLMRobertaMoodClassifier(nn.Module):
    def __init__(self, model_name=MODEL_NAME, num_classes=5, dropout=0.4):
        super().__init__()
        self.xlm_roberta = AutoModelForSequenceClassification.from_pretrained(
            model_name,
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
        outputs = self.xlm_roberta.roberta(input_ids=input_ids, attention_mask=attention_mask)
        cls_output = outputs.last_hidden_state[:, 0, :]
        logits = self.xlm_roberta.classifier(cls_output)
        return logits


def _normalize_sentiment_from_probs(prob_by_label):
    neg = prob_by_label.get("sad", 0.0) + prob_by_label.get("angry", 0.0) + prob_by_label.get("anxious", 0.0)
    pos = prob_by_label.get("happy", 0.0)
    if neg > pos + 0.15:
        return "negative", float(neg)
    if pos > neg + 0.15:
        return "positive", float(pos)
    return "neutral", float(prob_by_label.get("neutral", 0.0))


def _load_label_order():
    raw = json.loads(LABEL_MAP_PATH.read_text(encoding="utf-8"))
    indexed = sorted(((int(k), str(v).lower()) for k, v in raw.items()), key=lambda x: x[0])
    return [label for _, label in indexed]


LABEL_ORDER = _load_label_order()
TOKENIZER = AutoTokenizer.from_pretrained(MODEL_NAME)
MODEL = XLMRobertaMoodClassifier(num_classes=len(LABEL_ORDER)).to(DEVICE)
STATE_DICT = torch.load(MODEL_PATH, map_location=DEVICE)
if isinstance(STATE_DICT, dict) and "model_state_dict" in STATE_DICT:
    STATE_DICT = STATE_DICT["model_state_dict"]
MODEL.load_state_dict(STATE_DICT, strict=False)
MODEL.eval()

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "modelPath": str(MODEL_PATH),
            "device": str(DEVICE),
            "labels": LABEL_ORDER,
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

    encoding = TOKENIZER(
        text,
        add_special_tokens=True,
        max_length=MAX_LEN,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(DEVICE)
    attention_mask = encoding["attention_mask"].to(DEVICE)

    with torch.no_grad():
        logits = MODEL(input_ids, attention_mask)
        probs = F.softmax(logits, dim=1).cpu().numpy()[0]

    calibrated = probs.copy()
    for idx, label in enumerate(LABEL_ORDER):
        calibrated[idx] *= CALIBRATION.get(label, 1.0)
    denom = float(calibrated.sum()) or 1.0
    calibrated = calibrated / denom

    pairs = sorted(zip(LABEL_ORDER, calibrated.tolist()), key=lambda x: x[1], reverse=True)
    primary_label, primary_prob = pairs[0]
    secondary_label, secondary_prob = (pairs[1] if len(pairs) > 1 and pairs[1][1] >= 0.15 else (None, 0.0))
    prob_by_label = {label: float(score) for label, score in pairs}
    sentiment_label, sentiment_score = _normalize_sentiment_from_probs(prob_by_label)

    return jsonify(
        {
            "success": True,
            "engine": "xlmr-local",
            "primary_mood": primary_label,
            "primary_prob": round(float(primary_prob), 6),
            "secondary_mood": secondary_label,
            "secondary_prob": round(float(secondary_prob), 6),
            "all_probs": {k: round(v, 6) for k, v in prob_by_label.items()},
            "emotionLabel": primary_label,
            "emotionScore": round(float(primary_prob), 6),
            "sentimentLabel": sentiment_label,
            "sentimentScore": round(float(max(0.0, min(1.0, sentiment_score))), 6),
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
