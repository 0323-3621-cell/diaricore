"""
Hugging Face Inference API client for DiariCore mood analysis.
"""

from __future__ import annotations

import os
import time
from typing import Dict, Optional, Tuple

import httpx

HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "").strip()

EMOTION_MODEL = os.environ.get("HF_EMOTION_MODEL", "sseia/diari-core-mood").strip()
HF_BASE_URL = "https://api-inference.huggingface.co/models"


def _hf_headers() -> Dict[str, str]:
    if not HF_API_TOKEN:
        return {"Content-Type": "application/json"}
    return {"Authorization": f"Bearer {HF_API_TOKEN}", "Content-Type": "application/json"}


def _derive_sentiment_from_emotion(emotion_label: str) -> str:
    raw = (emotion_label or "").strip().lower()
    if raw == "happy":
        return "positive"
    if raw in ("angry", "anxious", "sad"):
        return "negative"
    return "neutral"


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
        try:
            url = f"{HF_BASE_URL}/{EMOTION_MODEL}"
            response = client.post(
                url,
                json={
                    "inputs": clean[:2000],
                    "options": {"wait_for_model": True, "use_cache": True},
                },
            )
            if response.status_code != 200:
                try:
                    err = response.json()
                except Exception:
                    err = {"error": "non-json error"}
                print(
                    f"[HF NLP] emotion error status={response.status_code} model={EMOTION_MODEL} url={url} body_keys={list(err)[:5]}"
                )
                return _fallback(clean)

            payload = response.json()
            if isinstance(payload, dict) and ("error" in payload or "estimated_time" in payload):
                print(f"[HF NLP] emotion error body_keys={list(payload)[:5]}")
                return _fallback(clean)

            emotion_label_raw, emotion_score = _pick_best_label(payload)
            if not emotion_label_raw:
                return _fallback(clean)

            emotion_label = str(emotion_label_raw).strip().lower()
            if emotion_label not in ("angry", "anxious", "happy", "neutral", "sad"):
                return _fallback(clean)

            emotion_score_f = float(emotion_score or 0.5)
            sentiment_label = _derive_sentiment_from_emotion(emotion_label)
            sentiment_score = emotion_score_f

            return {
                "sentimentLabel": sentiment_label,
                "sentimentScore": round(sentiment_score, 4),
                "emotionLabel": emotion_label,
                "emotionScore": round(emotion_score_f, 4),
                "engine": "hf-custom",
                "ms": int((time.time() - started) * 1000),
            }
        except Exception:
            return _fallback(clean)

