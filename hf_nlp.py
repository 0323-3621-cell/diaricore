"""
Hugging Face Inference API client for sentiment + emotion.

Designed for Railway free tier:
- No torch/transformers dependency
- Short timeouts
- Safe fallback if API token missing or provider errors
"""

from __future__ import annotations

import os
import time
from typing import Dict, Optional, Tuple

import httpx

HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "").strip()

# Multilingual sentiment model
SENTIMENT_MODEL = os.environ.get("HF_SENTIMENT_MODEL", "cardiffnlp/twitter-xlm-roberta-base-sentiment").strip()

# Multilingual emotion model (19 languages; best-effort for Tagalog)
EMOTION_MODEL = os.environ.get("HF_EMOTION_MODEL", "MilaNLProc/xlm-emo-t").strip()

HF_BASE_URL = "https://api-inference.huggingface.co/models"
HF_ROUTER_BASE_URL = "https://router.huggingface.co/hf-inference/models"
HF_PIPELINE_BASE_URL = "https://api-inference.huggingface.co/pipeline"


def _hf_headers() -> Dict[str, str]:
    if not HF_API_TOKEN:
        return {"Content-Type": "application/json"}
    return {"Authorization": f"Bearer {HF_API_TOKEN}", "Content-Type": "application/json"}


def _normalize_sentiment(label: str) -> str:
    raw = (label or "").strip().lower()
    if "positive" in raw:
        return "positive"
    if "negative" in raw:
        return "negative"
    return "neutral"


def _normalize_emotion(label: str) -> str:
    raw = (label or "").strip().lower()
    # Keep UI-compatible categories
    mapping = {
        "joy": "happy",
        "happiness": "happy",
        "love": "happy",
        "sadness": "sad",
        "anger": "angry",
        "fear": "stressed",
        "surprise": "excited",
        "neutral": "neutral",
    }
    return mapping.get(raw, raw or "neutral")


def _fallback(text: str) -> Dict[str, object]:
    t = (text or "").lower()
    # Simple heuristic fallback
    neg = any(w in t for w in ["sad", "galit", "angry", "anxious", "stress", "stressed", "pagod", "tired", "iyak"])
    pos = any(w in t for w in ["happy", "masaya", "grateful", "salamat", "excited", "calm", "peace", "okay"])
    if pos and not neg:
        sent = ("positive", 0.65)
        emo = ("happy", 0.62)
    elif neg and not pos:
        sent = ("negative", 0.65)
        emo = ("sad", 0.62)
    else:
        sent = ("neutral", 0.55)
        emo = ("neutral", 0.58)
    return {
        "sentimentLabel": sent[0],
        "sentimentScore": float(sent[1]),
        "emotionLabel": emo[0],
        "emotionScore": float(emo[1]),
        "engine": "fallback",
    }


def _pick_best_label(api_payload) -> Tuple[Optional[str], Optional[float]]:
    """
    HF Inference responses vary:
    - sentiment/emotion usually returns list[ {label, score}, ... ] or list[list[...]]
    We return the highest score label.
    """
    if api_payload is None:
        return None, None

    candidates = api_payload
    if isinstance(candidates, list) and len(candidates) == 1 and isinstance(candidates[0], list):
        candidates = candidates[0]

    if not isinstance(candidates, list):
        return None, None

    best = None
    for item in candidates:
        if not isinstance(item, dict):
            continue
        label = item.get("label")
        score = item.get("score")
        try:
            score_f = float(score)
        except Exception:
            score_f = None
        if best is None or (score_f is not None and (best[1] is None or score_f > best[1])):
            best = (label, score_f)
    return (best[0], best[1]) if best else (None, None)


def analyze(text: str) -> Dict[str, object]:
    clean = (text or "").strip()
    if not clean:
        return _fallback(clean)

    if not HF_API_TOKEN:
        return _fallback(clean)

    started = time.time()
    timeout = httpx.Timeout(10.0, connect=5.0)
    with httpx.Client(timeout=timeout, headers=_hf_headers()) as client:
        def _call_model(model_name: str, task_hint: str):
            """
            Try multiple Hugging Face endpoint patterns because provider routing differs by model.
            """
            urls = [
                f"{HF_ROUTER_BASE_URL}/{model_name}",
                f"{HF_BASE_URL}/{model_name}",
                f"{HF_PIPELINE_BASE_URL}/text-classification/{model_name}",
            ]
            if task_hint == "sentiment":
                urls.append(f"{HF_PIPELINE_BASE_URL}/sentiment-analysis/{model_name}")
            last_response = None
            for url in urls:
                try:
                    response = client.post(
                        url,
                        json={
                            "inputs": clean[:2000],
                            "options": {"wait_for_model": True, "use_cache": True},
                        },
                    )
                    last_response = response
                    # Try another endpoint on deprecations / unsupported routes.
                    if response.status_code in (404, 410):
                        continue
                    return response
                except Exception:
                    continue
            return last_response

        try:
            sent_resp = _call_model(SENTIMENT_MODEL, "sentiment")
            if sent_resp is None:
                return _fallback(clean)
            if sent_resp.status_code != 200:
                try:
                    err = sent_resp.json()
                except Exception:
                    err = {"error": "non-json error"}
                print(f"[HF NLP] sentiment error status={sent_resp.status_code} body_keys={list(err)[:5]}")
                return _fallback(clean)
            sent_json = sent_resp.json()
            if isinstance(sent_json, dict) and ("error" in sent_json or "estimated_time" in sent_json):
                print(f"[HF NLP] sentiment error body_keys={list(sent_json)[:5]}")
                return _fallback(clean)
            sent_label_raw, sent_score = _pick_best_label(sent_json)
            sentiment_label = _normalize_sentiment(sent_label_raw or "")
            sentiment_score = float(sent_score or 0.5)
            if sent_label_raw is None:
                return _fallback(clean)

            emo_resp = _call_model(EMOTION_MODEL, "emotion")
            if emo_resp is None:
                return _fallback(clean)
            if emo_resp.status_code != 200:
                try:
                    err = emo_resp.json()
                except Exception:
                    err = {"error": "non-json error"}
                print(f"[HF NLP] emotion error status={emo_resp.status_code} body_keys={list(err)[:5]}")
                return _fallback(clean)
            emo_json = emo_resp.json()
            if isinstance(emo_json, dict) and ("error" in emo_json or "estimated_time" in emo_json):
                print(f"[HF NLP] emotion error body_keys={list(emo_json)[:5]}")
                return _fallback(clean)
            emo_label_raw, emo_score = _pick_best_label(emo_json)
            emotion_label = _normalize_emotion(emo_label_raw or "")
            emotion_score = float(emo_score or 0.5)
            if emo_label_raw is None:
                return _fallback(clean)

            return {
                "sentimentLabel": sentiment_label,
                "sentimentScore": round(sentiment_score, 4),
                "emotionLabel": emotion_label,
                "emotionScore": round(emotion_score, 4),
                "engine": "hf",
                "ms": int((time.time() - started) * 1000),
            }
        except Exception:
            return _fallback(clean)

