"""
Hugging Face Inference API — automatic speech recognition (Whisper).

Used when the browser Web Speech API is blocked (e.g. Brave Shields) but the
client still captured audio with MediaRecorder.
"""

from __future__ import annotations

import os
import time
from typing import Optional, Tuple

import httpx

HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "").strip()
# Small model for faster cold starts on HF serverless; override via env if needed.
HF_SPEECH_MODEL = os.environ.get("HF_SPEECH_MODEL", "openai/whisper-base").strip()
# Must match hf_nlp.py — legacy api-inference.huggingface.co returns 404.
HF_INFERENCE_ROOT = os.environ.get("HF_INFERENCE_ROOT", "https://router.huggingface.co/hf-inference").rstrip("/")
HF_ASR_URL = f"{HF_INFERENCE_ROOT}/models/{HF_SPEECH_MODEL}"


def _format_hf_error(status_code: int, detail: str) -> str:
    """Avoid dumping full HTML error pages into the UI."""
    d = (detail or "").strip()
    if "<!DOCTYPE" in d or "<html" in d.lower():
        if "Cannot POST" in d:
            return (
                f"Transcription HTTP {status_code}: Hugging Face inference URL is wrong or deprecated. "
                "Deploy the latest app (uses router.huggingface.co/hf-inference)."
            )
        return f"Transcription HTTP {status_code}: unexpected HTML response from inference service."
    return f"Transcription HTTP {status_code}: {d}"[:600]


def transcribe_upload_bytes(data: bytes, content_type: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns (transcript_text, error_message). On success error_message is None.
    """
    if not data:
        return None, "Empty audio."
    if not HF_API_TOKEN:
        return (
            None,
            "Server voice transcription is not configured (set HF_API_TOKEN on the host).",
        )

    ct = (content_type or "application/octet-stream").split(";")[0].strip().lower()
    if ct in ("", "application/octet-stream"):
        ct = "audio/webm"

    headers = {
        "Authorization": f"Bearer {HF_API_TOKEN}",
        "Content-Type": ct,
    }

    last_err: Optional[str] = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=120.0) as client:
                r = client.post(HF_ASR_URL, headers=headers, content=data)
        except httpx.RequestError as exc:
            last_err = f"Network error calling transcription service: {exc}"
            time.sleep(1.5 * (attempt + 1))
            continue

        if r.status_code == 503:
            # Model cold start on HF — brief backoff then retry.
            time.sleep(min(10.0, 2.0 * (attempt + 1)))
            last_err = "Transcription service is warming up; try again in a moment."
            continue

        if r.status_code != 200:
            try:
                payload = r.json()
                detail = payload.get("error") or payload.get("message") or r.text
            except Exception:
                detail = r.text or r.reason_phrase
            last_err = _format_hf_error(r.status_code, str(detail))
            break

        try:
            payload = r.json()
        except Exception:
            last_err = "Unexpected response from transcription service."
            break

        if isinstance(payload, dict):
            if "error" in payload and not payload.get("text"):
                last_err = str(payload.get("error") or "Transcription error")[:500]
                break
            text = payload.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip(), None
        last_err = "Transcription returned no text."
        break

    return None, last_err or "Transcription failed."
