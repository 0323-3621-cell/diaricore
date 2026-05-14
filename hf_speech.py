"""
Hugging Face automatic speech recognition (Whisper).

Uses huggingface_hub.InferenceClient so HF can route to a provider that actually
hosts the model. Raw POSTs to hf-inference only work for models that provider
exposes — e.g. openai/whisper-base is not on hf-inference (HTTP 400).
"""

from __future__ import annotations

import os
import time
from typing import Optional, Tuple

HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "").strip()
# openai/whisper-large-v3 is on hf-inference; whisper-base is not deployed there.
HF_SPEECH_MODEL = os.environ.get("HF_SPEECH_MODEL", "openai/whisper-large-v3").strip()


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

    try:
        from huggingface_hub import InferenceClient
        from huggingface_hub.errors import HfHubHTTPError
    except ImportError:
        return (
            None,
            "Server is missing the huggingface_hub package; redeploy with updated requirements.txt.",
        )

    # content_type reserved for future format-specific handling
    _ = content_type

    client = InferenceClient(token=HF_API_TOKEN)
    model_id = HF_SPEECH_MODEL or "openai/whisper-large-v3"

    last_err: Optional[str] = None
    for attempt in range(3):
        try:
            out = client.automatic_speech_recognition(data, model=model_id)
            text = getattr(out, "text", None)
            if isinstance(text, str) and text.strip():
                return text.strip(), None
            last_err = "Transcription returned no text."
            break
        except HfHubHTTPError as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None) or 0
            detail = str(exc).strip() or getattr(exc, "message", "") or "HTTP error"
            if status == 503 or "503" in detail or "loading" in detail.lower():
                time.sleep(min(10.0, 2.0 * (attempt + 1)))
                last_err = "Transcription service is warming up; try again in a moment."
                continue
            last_err = f"Transcription HTTP {status or '?'}: {detail}"[:650]
            break
        except Exception as exc:
            last_err = f"Transcription error: {exc}"[:650]
            break

    return None, last_err or "Transcription failed."
