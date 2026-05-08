"""
Hugging Face Inference API client for DiariCore mood analysis.

Calls the HF Inference API (free, serverless) which serves the ONNX model
uploaded to sseia/diari-core-mood. Returns the same shape as ml-service/app.py
including all_probs and calibrated scores so the UI shows full emotion breakdown.
"""

from __future__ import annotations

import os
import time
from typing import Dict, List, Optional, Tuple

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HF_API_TOKEN   = os.environ.get("HF_API_TOKEN", "").strip()
EMOTION_MODEL  = os.environ.get("HF_EMOTION_MODEL", "sseia/diari-core-mood").strip()
HF_BASE_URL    = "https://api-inference.huggingface.co/models"

ALLOWED_LABELS = ("angry", "anxious", "happy", "neutral", "sad")

# Must match ml-service/app.py exactly so scores are consistent
CALIBRATION_THRESHOLDS: Dict[str, float] = {
    "angry":   1.40,
    "sad":     1.30,
    "neutral": 1.35,
    "happy":   0.75,
    "anxious": 0.70,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hf_headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if HF_API_TOKEN:
        headers["Authorization"] = f"Bearer {HF_API_TOKEN}"
    return headers


def _derive_sentiment_from_emotion(label: str) -> str:
    raw = (label or "").strip().lower()
    if raw == "happy":
        return "positive"
    if raw in ("angry", "anxious", "sad"):
        return "negative"
    return "neutral"


def _apply_calibration(raw_probs: Dict[str, float]) -> Dict[str, float]:
    """Apply per-class calibration multipliers and re-normalise."""
    calibrated = {
        lbl: raw_probs.get(lbl, 0.0) * CALIBRATION_THRESHOLDS.get(lbl, 1.0)
        for lbl in ALLOWED_LABELS
    }
    total = sum(calibrated.values()) or 1.0
    return {lbl: round(v / total, 6) for lbl, v in calibrated.items()}


def _parse_all_probs(api_payload) -> Optional[Dict[str, float]]:
    """
    Parse HF text-classification response into a {label: score} dict.
    HF returns list[{label, score}] or list[list[{label, score}]].
    """
    if not isinstance(api_payload, list):
        return None

    candidates = api_payload
    if len(candidates) == 1 and isinstance(candidates[0], list):
        candidates = candidates[0]

    result: Dict[str, float] = {}
    for item in candidates:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip().lower()
        try:
            score = float(item.get("score") or 0.0)
        except Exception:
            score = 0.0
        if label in ALLOWED_LABELS:
            result[label] = score

    return result if result else None


def _fallback(text: str) -> Dict[str, object]:
    """Keyword heuristic used when the HF API is unavailable."""
    t = (text or "").lower()
    neg = any(w in t for w in [
        "sad", "galit", "angry", "anxious", "stress", "stressed",
        "pagod", "tired", "iyak", "malungkot", "lungkot", "nalulungkot",
        "natatakot", "nababahala", "kabado",
    ])
    pos = any(w in t for w in [
        "happy", "masaya", "grateful", "salamat", "excited",
        "calm", "peace", "okay", "saya", "maligaya",
    ])
    if pos and not neg:
        emo, raw_score = "happy", 0.62
    elif neg and not pos:
        emo, raw_score = "sad", 0.62
    else:
        emo, raw_score = "neutral", 0.58

    raw_probs = {lbl: 0.0 for lbl in ALLOWED_LABELS}
    raw_probs[emo] = raw_score
    all_probs = _apply_calibration(raw_probs)
    best_lbl = max(all_probs, key=all_probs.__getitem__)
    best_score = all_probs[best_lbl]

    return {
        "sentimentLabel": _derive_sentiment_from_emotion(best_lbl),
        "sentimentScore": round(best_score, 4),
        "emotionLabel":   best_lbl,
        "emotionScore":   round(best_score, 4),
        "all_probs":      all_probs,
        "engine":         "fallback",
    }


# ---------------------------------------------------------------------------
# Main API call
# ---------------------------------------------------------------------------

def analyze(text: str) -> Dict[str, object]:
    clean = (text or "").strip()
    if not clean:
        return _fallback(clean)

    if not HF_API_TOKEN:
        print("[HF NLP] HF_API_TOKEN not set — using keyword fallback. "
              "Set HF_API_TOKEN on Railway to enable model inference.")
        return _fallback(clean)

    started = time.time()

    # Generous timeout: HF serverless can be slow on cold start
    timeout = httpx.Timeout(30.0, connect=10.0)
    payload = {
        "inputs": clean[:2000],
        "parameters": {"top_k": 5},
        "options": {"wait_for_model": True, "use_cache": True},
    }

    response = None
    used_url = None

    # Try the standard Inference API endpoint only — most reliable for custom models
    urls = [
        f"{HF_BASE_URL}/{EMOTION_MODEL}",
    ]

    with httpx.Client(timeout=timeout, headers=_hf_headers()) as client:
        try:
            for url in urls:
                used_url = url
                try:
                    response = client.post(url, json=payload)
                except Exception as e:
                    print(f"[HF NLP] request failed url={url} err={e}")
                    response = None
                    continue

                if response is None:
                    continue
                if response.status_code in (404, 410):
                    print(f"[HF NLP] model not found at {url} (status={response.status_code})")
                    continue
                break

            if response is None:
                return _fallback(clean)

            if response.status_code == 503:
                # Model still loading on HF side — this is normal for cold starts
                try:
                    body = response.json()
                    wait = body.get("estimated_time", "?")
                except Exception:
                    wait = "?"
                print(f"[HF NLP] model loading on HF (estimated_time={wait}s) — fallback")
                return _fallback(clean)

            if response.status_code != 200:
                try:
                    err = response.json()
                except Exception:
                    err = {"error": response.text or "non-json error"}
                print(
                    f"[HF NLP] error status={response.status_code} "
                    f"url={used_url} error={str(err.get('error') or '')[:200]}"
                )
                return _fallback(clean)

            api_payload = response.json()

            # HF sometimes returns {"error": ..., "estimated_time": ...} at 200
            if isinstance(api_payload, dict) and ("error" in api_payload or "estimated_time" in api_payload):
                print(f"[HF NLP] unexpected body keys={list(api_payload)[:5]}")
                return _fallback(clean)

            # Parse all 5 emotion scores from the response
            raw_probs = _parse_all_probs(api_payload)
            if not raw_probs:
                print(f"[HF NLP] could not parse response: {str(api_payload)[:200]}")
                return _fallback(clean)

            # Fill in any missing labels with 0
            for lbl in ALLOWED_LABELS:
                raw_probs.setdefault(lbl, 0.0)

            # Apply calibration (matches ml-service/app.py behaviour)
            all_probs = _apply_calibration(raw_probs)

            # Best label after calibration
            best_lbl = max(all_probs, key=all_probs.__getitem__)
            best_score = all_probs[best_lbl]

            if best_lbl not in ALLOWED_LABELS:
                return _fallback(clean)

            sentiment_label = _derive_sentiment_from_emotion(best_lbl)

            return {
                "sentimentLabel": sentiment_label,
                "sentimentScore": round(best_score, 4),
                "emotionLabel":   best_lbl,
                "emotionScore":   round(best_score, 4),
                "all_probs":      all_probs,
                "engine":         "hf-custom",
                "ms":             int((time.time() - started) * 1000),
            }

        except Exception as e:
            print(f"[HF NLP] unexpected exception: {type(e).__name__}: {e}")
            return _fallback(clean)
