import json
import os
import threading
import time
from typing import Dict, Optional, Tuple

import numpy as np
import onnxruntime as ort
from flask import Flask, jsonify, request
from huggingface_hub import hf_hub_download
from transformers import AutoTokenizer


HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "sseia/diari-core-mood").strip()
HF_TOKEN = os.environ.get("HF_TOKEN", "").strip()

MAX_LEN = int(os.environ.get("MODEL_MAX_LEN", "256"))
WORD_MIN = int(os.environ.get("MODEL_WORD_MIN", "3"))
WORD_MAX = int(os.environ.get("MODEL_WORD_MAX", "300"))

# Hugging Face repo filenames (try several because exports differ slightly).
ONNX_CANDIDATE_FILENAMES = [
    "diari-core-model.onnx",
    "diari-core_model.onnx",
    "diari-core-model.onnx",
]
LABEL_MAP_FILENAME = os.environ.get("HF_LABEL_MAP_FILENAME", "label_map.json").strip()

# Keep caches in writable dirs on Railway containers.
os.environ.setdefault("HF_HOME", "/tmp/hf")
os.environ.setdefault("HF_HUB_CACHE", "/tmp/hf/hub")


app = Flask(__name__)

_STATE: dict = {
    "loaded": False,
    "loading": False,
    "error": None,
    "loaded_at": None,
}
_LOAD_LOCK = threading.Lock()

_TOKENIZER = None
_SESSION: Optional[ort.InferenceSession] = None
_LABELS = None
_ORT_INPUT_NAMES = None


def _derive_sentiment_from_emotion(label: str) -> str:
    raw = (label or "").strip().lower()
    if raw == "happy":
        return "positive"
    if raw in ("angry", "anxious", "sad"):
        return "negative"
    return "neutral"


def _hf_kwargs() -> dict:
    return {"token": HF_TOKEN} if HF_TOKEN else {}


def _download_first_available(repo_id: str, filenames: list[str]) -> Tuple[str, str]:
    last_err: Optional[Exception] = None
    for fn in filenames:
        try:
            path = hf_hub_download(repo_id=repo_id, filename=fn, **_hf_kwargs())
            return fn, path
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"Could not download ONNX file. Last error: {type(last_err).__name__}: {last_err}")


def _softmax(logits: np.ndarray) -> np.ndarray:
    # logits: [batch, num_classes]
    x = logits - np.max(logits, axis=-1, keepdims=True)
    e = np.exp(x)
    return e / np.sum(e, axis=-1, keepdims=True)


def _load_model_if_needed() -> Tuple[bool, Optional[str]]:
    global _TOKENIZER, _SESSION, _LABELS, _ORT_INPUT_NAMES

    if _STATE["loaded"]:
        return True, None
    if _STATE["loading"]:
        return False, "loading"

    with _LOAD_LOCK:
        if _STATE["loaded"]:
            return True, None
        if _STATE["loading"]:
            return False, "loading"

        _STATE["loading"] = True
        _STATE["error"] = None
        try:
            # Download required artifacts from Hugging Face.
            onnx_filename, onnx_path = _download_first_available(HF_MODEL_ID, ONNX_CANDIDATE_FILENAMES)
            label_map_path = hf_hub_download(
                repo_id=HF_MODEL_ID,
                filename=LABEL_MAP_FILENAME,
                **_hf_kwargs(),
            )

            with open(label_map_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            indexed = sorted(((int(k), str(v).strip().lower()) for k, v in raw.items()), key=lambda x: x[0])
            _LABELS = [label for _, label in indexed]

            _TOKENIZER = AutoTokenizer.from_pretrained(HF_MODEL_ID, **_hf_kwargs())

            sess = ort.InferenceSession(
                onnx_path,
                providers=["CPUExecutionProvider"],
            )
            _SESSION = sess

            # Map ONNX input names to tokenizer outputs.
            input_names = [i.name for i in sess.get_inputs()]
            _ORT_INPUT_NAMES = input_names

            _STATE["loaded"] = True
            _STATE["loaded_at"] = int(time.time())
            return True, None
        except Exception as e:
            _STATE["error"] = f"{type(e).__name__}: {str(e)[:240]}"
            return False, "error"
        finally:
            _STATE["loading"] = False


def _start_background_load():
    if _STATE["loaded"] or _STATE["loading"]:
        return
    t = threading.Thread(target=_load_model_if_needed, daemon=True)
    t.start()


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "modelId": HF_MODEL_ID,
            "loaded": bool(_STATE["loaded"]),
            "loading": bool(_STATE["loading"]),
            "error": _STATE["error"],
            "labels": _LABELS,
            "onnxInputNames": _ORT_INPUT_NAMES,
        }
    )


@app.post("/warmup")
def warmup():
    _start_background_load()
    return jsonify(
        {
            "success": True,
            "message": "Warmup started",
            "loading": bool(_STATE["loading"]),
            "loaded": bool(_STATE["loaded"]),
            "error": _STATE["error"],
        }
    ), 202


@app.post("/predict")
def predict():
    if not _STATE["loaded"]:
        _start_background_load()
    if not _STATE["loaded"]:
        # Ensure web retries can detect warmup.
        return jsonify({"success": False, "error": "model is loading"}), 503
    if _SESSION is None or _TOKENIZER is None or _LABELS is None:
        return jsonify({"success": False, "error": _STATE.get("error") or "model not initialized"}), 500
    if not _ORT_INPUT_NAMES:
        return jsonify({"success": False, "error": "missing ONNX input names"}), 500

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    word_count = len(text.split())
    if not text:
        return jsonify({"success": False, "error": "text is required"}), 400
    if word_count < WORD_MIN:
        return jsonify({"success": False, "error": "text is too short"}), 400
    if word_count > WORD_MAX:
        return jsonify({"success": False, "error": "text is too long"}), 400

    started = time.time()
    encoding = _TOKENIZER(
        text,
        max_length=MAX_LEN,
        padding="max_length",
        truncation=True,
        return_tensors="np",
    )

    # Build ort inputs based on actual model input names.
    ort_inputs: Dict[str, np.ndarray] = {}
    for name in _ORT_INPUT_NAMES:
        if "attention" in name:
            ort_inputs[name] = encoding["attention_mask"]
        else:
            ort_inputs[name] = encoding["input_ids"]

    try:
        outputs = _SESSION.run(None, ort_inputs)
        logits = outputs[0]  # expected: [batch, num_classes]
        probs = _softmax(logits)[0]
    except Exception as e:
        _STATE["error"] = f"{type(e).__name__}: {str(e)[:240]}"
        return jsonify({"success": False, "error": _STATE["error"]}), 500

    pairs = list(zip(_LABELS, probs.tolist()))
    pairs.sort(key=lambda x: x[1], reverse=True)
    primary_label, primary_prob = pairs[0]

    primary_label = str(primary_label).strip().lower()
    if primary_label not in ("angry", "anxious", "happy", "neutral", "sad"):
        primary_label = "neutral"

    emotion_label = primary_label
    emotion_score = float(primary_prob)
    sentiment_label = _derive_sentiment_from_emotion(emotion_label)
    sentiment_score = emotion_score

    return jsonify(
        {
            "success": True,
            "engine": "ml-service-onnx",
            "emotionLabel": emotion_label,
            "emotionScore": round(emotion_score, 6),
            "sentimentLabel": sentiment_label,
            "sentimentScore": round(float(max(0.0, min(1.0, sentiment_score))), 6),
            "primary_mood": emotion_label,
            "primary_prob": round(emotion_score, 6),
            "all_probs": {k: round(float(v), 6) for k, v in pairs},
            "ms": int((time.time() - started) * 1000),
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)

