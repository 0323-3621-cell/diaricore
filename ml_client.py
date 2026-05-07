import json
import os
import time
import urllib.error
import urllib.request


ML_API_URL = os.environ.get("ML_API_URL", "http://127.0.0.1:5001/predict").strip()
ML_API_TIMEOUT_SECONDS = float(os.environ.get("ML_API_TIMEOUT_SECONDS", "25").strip() or "25")
ML_API_LOADING_RETRIES = int(os.environ.get("ML_API_LOADING_RETRIES", "8").strip() or "8")
ML_API_LOADING_SLEEP_SECONDS = float(os.environ.get("ML_API_LOADING_SLEEP_SECONDS", "2").strip() or "2")


def _fallback():
    return {
        "sentimentLabel": "neutral",
        "sentimentScore": 0.5,
        "emotionLabel": "neutral",
        "emotionScore": 0.5,
        "all_probs": {
            "sad": 0.0,
            "anxious": 0.0,
            "angry": 0.0,
            "happy": 0.0,
            "neutral": 1.0,
        },
        "engine": "fallback",
    }


def analyze(text: str):
    clean = (text or "").strip()
    if not clean:
        return _fallback()

    payload = json.dumps({"text": clean}).encode("utf-8")
    def _make_req():
        return urllib.request.Request(
            ML_API_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

    last_err = None
    for attempt in range(max(1, ML_API_LOADING_RETRIES)):
        try:
            with urllib.request.urlopen(_make_req(), timeout=ML_API_TIMEOUT_SECONDS) as resp:
                body = resp.read().decode("utf-8")
                data = json.loads(body or "{}")
                last_err = None
                break
        except urllib.error.HTTPError as e:
            # HTTPError is a subclass of URLError; we handle it separately for status/body visibility.
            code = getattr(e, "code", None)
            try:
                err_body = (e.read() or b"").decode("utf-8", errors="ignore")[:500]
            except Exception:
                err_body = ""

            # If model is still warming up, wait and retry instead of falling back immediately.
            if code == 503 and ("model is loading" in err_body.lower()):
                last_err = f"503 loading (attempt {attempt + 1}/{ML_API_LOADING_RETRIES})"
                time.sleep(ML_API_LOADING_SLEEP_SECONDS)
                continue

            print(f"[ml_client] ML HTTPError status={code} url={ML_API_URL} body={err_body}")
            return _fallback()
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            last_err = f"{type(e).__name__}: {e}"
            print(f"[ml_client] ML request failed url={ML_API_URL} err={type(e).__name__}: {e}")
            return _fallback()
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            return _fallback()

    if last_err is not None:
        print(f"[ml_client] ML still loading after retries url={ML_API_URL} last_err={last_err}")
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

    raw_probs = data.get("all_probs") if isinstance(data.get("all_probs"), dict) else {}
    normalized_probs = {}
    for key in ("sad", "anxious", "angry", "happy", "neutral"):
        try:
            normalized_probs[key] = max(0.0, min(1.0, float(raw_probs.get(key, 0.0))))
        except Exception:
            normalized_probs[key] = 0.0

    return {
        "sentimentLabel": sentiment_label,
        "sentimentScore": sentiment_score,
        "emotionLabel": emotion_label,
        "emotionScore": emotion_score,
        "all_probs": normalized_probs,
        "engine": str(data.get("engine") or "ml-service"),
    }
