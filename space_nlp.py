"""
space_nlp.py - Calls the DiariCore HuggingFace Space inference API.

The Space (sseia/diaricore-inference) runs the FP32 ONNX model on
HF's free 16GB CPU tier. Railway calls this over HTTP — no local model needed.
Falls back to keyword heuristic if the Space is unreachable.
"""

from __future__ import annotations

import os
import time
from typing import Dict

import httpx

SPACE_URL  = os.environ.get("SPACE_URL", "https://sseia-diaricore-inference.hf.space").rstrip("/")
ALLOWED    = ("angry", "anxious", "happy", "neutral", "sad")


def _derive_sentiment(label: str) -> str:
    if label == "happy":
        return "positive"
    if label in ("angry", "anxious", "sad"):
        return "negative"
    return "neutral"


def _fallback(text: str) -> Dict[str, object]:
    t   = (text or "").lower()
    neg = any(w in t for w in ["sad", "galit", "angry", "anxious", "stress",
                                "iyak", "malungkot", "pagod", "tired", "natatakot"])
    pos = any(w in t for w in ["happy", "masaya", "grateful", "salamat",
                                "excited", "calm", "peace", "okay"])
    emo = "happy" if (pos and not neg) else ("sad" if (neg and not pos) else "neutral")
    score = 0.62 if emo != "neutral" else 0.58
    return {
        "sentimentLabel": _derive_sentiment(emo),
        "sentimentScore": score,
        "emotionLabel":   emo,
        "emotionScore":   score,
        "all_probs":      {lbl: (score if lbl == emo else 0.0) for lbl in ALLOWED},
        "engine":         "fallback",
    }


def analyze(text: str) -> Dict[str, object]:
    clean = (text or "").strip()
    if not clean:
        return _fallback(clean)

    started = time.time()
    try:
        # Generous timeout: Space might have a cold start (30-60s first request)
        with httpx.Client(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
            resp = client.post(f"{SPACE_URL}/predict", json={"text": clean})

        if resp.status_code != 200:
            print(f"[space_nlp] Space returned {resp.status_code}: {resp.text[:200]}")
            return _fallback(clean)

        data = resp.json()

        # Validate the response has expected keys
        if "emotionLabel" not in data:
            print(f"[space_nlp] Unexpected response keys: {list(data)[:5]}")
            return _fallback(clean)

        print(f"[space_nlp] OK — {data.get('emotionLabel')} "
              f"({data.get('emotionScore',0)*100:.1f}%) "
              f"engine={data.get('engine')} ms={int((time.time()-started)*1000)}")
        return data

    except httpx.TimeoutException:
        print(f"[space_nlp] Timeout after {int((time.time()-started))}s — using fallback")
        return _fallback(clean)
    except Exception as e:
        print(f"[space_nlp] Error: {type(e).__name__}: {e} — using fallback")
        return _fallback(clean)
