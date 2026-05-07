import json
import os
import urllib.error
import urllib.request


ML_API_URL = os.environ.get("ML_API_URL", "http://127.0.0.1:5001/predict").strip()
ML_API_TIMEOUT_SECONDS = float(os.environ.get("ML_API_TIMEOUT_SECONDS", "12").strip() or "12")


def _fallback():
    return {
        "sentimentLabel": "neutral",
        "sentimentScore": 0.5,
        "emotionLabel": "neutral",
        "emotionScore": 0.5,
        "engine": "fallback",
    }


def analyze(text: str):
    clean = (text or "").strip()
    if not clean:
        return _fallback()

    payload = json.dumps({"text": clean}).encode("utf-8")
    req = urllib.request.Request(
        ML_API_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=ML_API_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body or "{}")
    except urllib.error.HTTPError as e:
        # HTTPError is a subclass of URLError; we handle it separately for status/body visibility.
        try:
            err_body = (e.read() or b"").decode("utf-8", errors="ignore")[:500]
        except Exception:
            err_body = ""
        print(f"[ml_client] ML HTTPError status={getattr(e, 'code', None)} url={ML_API_URL} body={err_body}")
        return _fallback()
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"[ml_client] ML request failed url={ML_API_URL} err={type(e).__name__}: {e}")
        return _fallback()
    except Exception:
        return _fallback()

    if not isinstance(data, dict):
        return _fallback()

    sentiment_label = str(data.get("sentimentLabel") or "neutral").lower()
    if sentiment_label not in ("positive", "negative", "neutral"):
        sentiment_label = "neutral"

    emotion_label = str(data.get("emotionLabel") or "neutral").lower()
    if emotion_label not in ("happy", "sad", "angry", "anxious", "neutral", "stressed", "calm", "excited"):
        emotion_label = "neutral"

    try:
        sentiment_score = float(data.get("sentimentScore", 0.5))
    except Exception:
        sentiment_score = 0.5
    try:
        emotion_score = float(data.get("emotionScore", 0.5))
    except Exception:
        emotion_score = 0.5

    sentiment_score = max(0.0, min(1.0, sentiment_score))
    emotion_score = max(0.0, min(1.0, emotion_score))

    return {
        "sentimentLabel": sentiment_label,
        "sentimentScore": sentiment_score,
        "emotionLabel": emotion_label,
        "emotionScore": emotion_score,
        "engine": str(data.get("engine") or "ml-service"),
    }
