import os
import json
import time
import threading
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from flask import Flask, jsonify, request
from huggingface_hub import hf_hub_download
import transformers
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
CALIBRATION_THRESHOLDS = {
    "angry": 1.40,
    "sad": 1.30,
    "neutral": 1.35,
    "happy": 0.75,
    "anxious": 0.70,
}
CONFIDENCE_THRESHOLD = 0.45
MIN_KEYWORD_HITS = 2
KEYWORD_SIGNALS = {
    "sad": {
        "en": [
            "grief",
            "grieving",
            "mourning",
            "lost someone",
            "passed away",
            "lonely",
            "alone again",
            "no one",
            "empty inside",
            "hollow",
            "crying",
            "sobbing",
            "heartbroken",
            "broke my heart",
            "i miss you",
            "i miss them",
            "i miss her",
            "i miss him",
            "namimiss kita",
            "namimiss ko siya",
        ],
        "tl": [
            "malungkot",
            "lungkot",
            "nalulungkot",
            "umiiyak",
            "umiyak",
            "nag-iisa",
            "mag-isa",
            "nawala",
            "nawalan",
            "nawala na",
            "hindi ko na mababawi",
            "hindi na babalik",
        ],
    },
    "anxious": {
        "en": [
            "what if",
            "what will happen",
            "scared of",
            "afraid of",
            "worried about",
            "i keep worrying",
            "cant stop worrying",
            "can't stop worrying",
            "heart racing",
            "cant breathe",
            "can't breathe",
            "panic",
            "panicking",
            "anxious about",
            "overthinking",
            "overthought",
            "dreading",
            "terrified of",
            "nervous about",
        ],
        "tl": [
            "nababahala",
            "nag-aalala",
            "natatakot",
            "kabado",
            "kinakabahan",
            "hindi makatulog",
            "di makatulog",
            "di mapakali",
            "hindi mapakali",
            "palagi akong nag-iisip",
            "hindi ko maiwasang mag-isip",
        ],
    },
}
AMBIGUOUS_WORDS = {
    "miss",
    "feel",
    "think",
    "sad",
    "happy",
    "angry",
    "bad",
    "good",
    "okay",
    "ok",
    "fine",
    "lost",
    "hard",
    "difficult",
    "tired",
    "pagod",
}

app = Flask(__name__)

_MODEL_STATE: dict = {
    "loaded": False,
    "loading": False,
    "error": None,
    "loaded_at": None,
    "loader_path": None,
    "label_source": None,
    "hf_snapshot": None,
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


def _resolve_labels_from_hf() -> Optional[list]:
    try:
        label_map_path = hf_hub_download(
            repo_id=HF_MODEL_ID,
            filename="label_map.json",
            **_model_kwargs(),
        )
        with open(label_map_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            labels = [str(v).strip().lower() for v in data]
        elif isinstance(data, dict):
            # Supports both {"0":"sad",...} and {"sad":0,...}
            if all(str(k).strip().isdigit() for k in data.keys()):
                ordered = sorted(((int(k), v) for k, v in data.items()), key=lambda x: x[0])
                labels = [str(v).strip().lower() for _, v in ordered]
            else:
                ordered = sorted(((int(v), k) for k, v in data.items()), key=lambda x: x[0])
                labels = [str(k).strip().lower() for _, k in ordered]
        else:
            return None
        labels = [l for l in labels if l in ALLOWED_LABELS]
        return labels if len(labels) == 5 else None
    except Exception:
        return None


def keyword_score(text: str) -> dict:
    text_lower = (text or "").lower()
    scores = {emotion: 0 for emotion in KEYWORD_SIGNALS}
    for emotion, lang_dict in KEYWORD_SIGNALS.items():
        for keywords in lang_dict.values():
            for kw in keywords:
                if kw.strip() in AMBIGUOUS_WORDS:
                    continue
                if kw in text_lower:
                    scores[emotion] += 1
    return scores


def apply_keyword_layer(text: str, primary_label: str, primary_prob: float) -> tuple:
    if primary_prob >= CONFIDENCE_THRESHOLD:
        return primary_label, primary_prob, False, None, {"sad": 0, "anxious": 0}

    if primary_label not in ("sad", "anxious"):
        return primary_label, primary_prob, False, None, {"sad": 0, "anxious": 0}

    scores = keyword_score(text)
    sad_hits = int(scores.get("sad", 0))
    anxious_hits = int(scores.get("anxious", 0))
    best_emotion = max(scores, key=scores.get)
    best_hits = int(scores.get(best_emotion, 0))

    if best_hits < MIN_KEYWORD_HITS:
        return primary_label, primary_prob, False, None, {"sad": sad_hits, "anxious": anxious_hits}

    if sad_hits == anxious_hits:
        return primary_label, primary_prob, False, None, {"sad": sad_hits, "anxious": anxious_hits}

    if best_emotion != primary_label:
        reason = (
            f"keyword override: '{best_emotion}' signals={best_hits} "
            f"vs '{primary_label}' signals={scores.get(primary_label, 0)} "
            f"(model was {primary_prob * 100:.1f}% confident)"
        )
        return best_emotion, primary_prob, True, reason, {"sad": sad_hits, "anxious": anxious_hits}

    return primary_label, primary_prob, False, None, {"sad": sad_hits, "anxious": anxious_hits}


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


def _resolve_labels_from_model(mdl) -> Optional[list]:
    labels = _resolve_labels_from_hf()
    if labels:
        return labels
    cfg = getattr(mdl, "config", None)
    if cfg and isinstance(getattr(cfg, "id2label", None), dict) and cfg.id2label:
        vals = [str(cfg.id2label[i]).strip().lower() for i in range(len(cfg.id2label))]
        vals = [l for l in vals if l in ALLOWED_LABELS]
        if len(vals) == 5:
            return vals
    return None


def _download_state_dict() -> tuple:
    state_path = hf_hub_download(
        repo_id=HF_MODEL_ID,
        filename="pytorch_model.bin",
        **_model_kwargs(),
    )
    snap_parts = state_path.replace("\\", "/").split("/snapshots/")
    snapshot = snap_parts[1].split("/")[0] if len(snap_parts) > 1 else None
    state = torch.load(state_path, map_location="cpu")
    if isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]
    return state, snapshot


def _looks_like_custom_checkpoint(state) -> bool:
    if not isinstance(state, dict):
        return False
    keys = list(state.keys())
    # Custom notebook checkpoint uses prefixed module keys.
    return any(str(k).startswith("xlm_roberta.") for k in keys)


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
            state, snapshot = _download_state_dict()
            _MODEL_STATE["hf_snapshot"] = snapshot

            # IMPORTANT: force custom loader for custom-saved checkpoints.
            # Using from_pretrained on these can silently initialize missing layers and skew predictions.
            if not _looks_like_custom_checkpoint(state):
                try:
                    direct = AutoModelForSequenceClassification.from_pretrained(
                        HF_MODEL_ID,
                        low_cpu_mem_usage=True,
                        **_model_kwargs(),
                    ).to(DEVICE)
                    direct = direct.to(dtype=torch.float32)
                    direct.eval()
                    labels = _resolve_labels_from_model(direct) or ["angry", "anxious", "happy", "neutral", "sad"]
                    _TOKENIZER, _MODEL, _LABELS = tok, direct, labels
                    _MODEL_STATE["loaded"] = True
                    _MODEL_STATE["loaded_at"] = int(time.time())
                    _MODEL_STATE["loader_path"] = "direct_hf"
                    _MODEL_STATE["label_source"] = "label_map_or_config"
                    return _TOKENIZER, _MODEL, _LABELS, None
                except Exception as direct_err:
                    print(f"[ml-service] direct from_pretrained load failed, trying custom checkpoint path: {type(direct_err).__name__}")

            # Download raw state dict and load through compatible custom class.
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
            labels = _resolve_labels_from_model(mdl) or ["angry", "anxious", "happy", "neutral", "sad"]

            _TOKENIZER, _MODEL, _LABELS = tok, mdl, labels
            _MODEL_STATE["loaded"] = True
            _MODEL_STATE["loaded_at"] = int(time.time())
            _MODEL_STATE["loader_path"] = "custom_state_dict"
            _MODEL_STATE["label_source"] = "label_map_or_config"
            return _TOKENIZER, _MODEL, _LABELS, None
        except Exception as e:
            # If lower precision fails due to operator incompatibilities, retry in float32.
            try:
                tok = AutoTokenizer.from_pretrained(HF_MODEL_ID, **_model_kwargs())
                state, snapshot = _download_state_dict()
                _MODEL_STATE["hf_snapshot"] = snapshot
                try:
                    if _looks_like_custom_checkpoint(state):
                        raise RuntimeError("custom checkpoint format")
                    mdl = AutoModelForSequenceClassification.from_pretrained(HF_MODEL_ID, low_cpu_mem_usage=True, **_model_kwargs()).to(
                        DEVICE
                    )
                    _MODEL_STATE["loader_path"] = "direct_hf_retry"
                except Exception:
                    mdl = XLMRobertaMoodClassifier(model_name="xlm-roberta-base", num_classes=5).to(DEVICE)
                    mdl.load_state_dict(state, strict=False)
                    _MODEL_STATE["loader_path"] = "custom_state_dict_retry"
                mdl = mdl.to(dtype=torch.float32)
                mdl.eval()
                labels = _resolve_labels_from_model(mdl) or ["angry", "anxious", "happy", "neutral", "sad"]
                _TOKENIZER, _MODEL, _LABELS = tok, mdl, labels
                _MODEL_STATE["loaded"] = True
                _MODEL_STATE["loaded_at"] = int(time.time())
                _MODEL_STATE["label_source"] = "label_map_or_config"
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
            "transformersVersion": transformers.__version__,
            "torchVersion": torch.__version__,
            "loaded": bool(_MODEL_STATE["loaded"]),
            "loading": bool(_MODEL_STATE["loading"]),
            "error": _MODEL_STATE["error"],
            "labels": _LABELS,
            "loaderPath": _MODEL_STATE.get("loader_path"),
            "labelSource": _MODEL_STATE.get("label_source"),
            "hfSnapshot": _MODEL_STATE.get("hf_snapshot"),
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

    encoding = _TOKENIZER(
        text,
        add_special_tokens=True,
        max_length=MAX_LEN,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )
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
        # Match notebook behavior: apply per-class calibration multipliers.
        calibrated_probs = list(probs)
        for idx, label in enumerate(labels):
            calibrated_probs[idx] *= CALIBRATION_THRESHOLDS.get(str(label).strip().lower(), 1.0)
        total = float(sum(calibrated_probs)) or 1.0
        calibrated_probs = [float(v) / total for v in calibrated_probs]

        pairs = sorted(zip(labels, calibrated_probs), key=lambda x: x[1], reverse=True)
        primary_label, primary_prob = pairs[0]
        primary_label = str(primary_label).strip().lower()
        if primary_label not in ALLOWED_LABELS:
            primary_label = "neutral"
        final_label, final_prob, was_overridden, override_reason, keyword_hits = apply_keyword_layer(
            text, primary_label, float(primary_prob)
        )
        final_label = str(final_label).strip().lower()
        if final_label not in ALLOWED_LABELS:
            final_label = "neutral"
        sentiment_label = _derive_sentiment_from_emotion(final_label)
        sentiment_score = float(final_prob)
    except Exception as e:
        _MODEL_STATE["error"] = f"{type(e).__name__}: {str(e)[:240]}"
        return jsonify({"success": False, "error": _MODEL_STATE["error"], "ms": int((time.time() - started) * 1000)}), 500

    return jsonify(
        {
            "success": True,
            "engine": "ml-service",
            "primary_mood": final_label,
            "primary_prob": round(float(final_prob), 6),
            "all_probs": {str(k).strip().lower(): round(float(v), 6) for k, v in pairs},
            "emotionLabel": final_label,
            "emotionScore": round(float(final_prob), 6),
            "sentimentLabel": sentiment_label,
            "sentimentScore": round(float(max(0.0, min(1.0, sentiment_score))), 6),
            "modelPrimaryLabel": primary_label,
            "modelPrimaryProb": round(float(primary_prob), 6),
            "keywordHits": keyword_hits,
            "keywordOverrideApplied": bool(was_overridden),
            "keywordOverrideReason": override_reason,
            "loaderPath": _MODEL_STATE.get("loader_path"),
            "labelSource": _MODEL_STATE.get("label_source"),
            "hfSnapshot": _MODEL_STATE.get("hf_snapshot"),
            "ms": int((time.time() - started) * 1000),
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
