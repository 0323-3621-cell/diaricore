"""
Session CSRF checks and lightweight in-memory rate limits (no extra DB round-trips).
"""

from __future__ import annotations

import secrets
import time
from collections import defaultdict
from threading import Lock
from typing import Any, Dict, List, Optional

_lock = Lock()
_hits: Dict[str, List[float]] = defaultdict(list)


def client_ip(request) -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return forwarded or (request.remote_addr or "unknown")


def rate_limit_check(request, scope: str, limit: int, window_sec: float) -> Optional[str]:
    """Return an error message if rate limited, else None."""
    if limit <= 0:
        return None
    key = f"{scope}:{client_ip(request)}"
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        bucket[:] = [t for t in bucket if now - t < window_sec]
        if len(bucket) >= limit:
            return "Too many requests. Please wait a moment and try again."
        bucket.append(now)
    return None


def validate_csrf(request, session_map: Any) -> Optional[str]:
    """Same-origin session POST protection without per-request DB access."""
    token = session_map.get("csrf_token")
    if not token:
        return "Session expired. Please sign in again."

    header = (request.headers.get("X-CSRF-Token") or "").strip()
    if header and secrets.compare_digest(header, token):
        return None

    origin = (request.headers.get("Origin") or "").strip()
    if origin:
        try:
            from urllib.parse import urlparse

            o = urlparse(origin)
            host = (request.host or "").split(":")[0]
            if o.hostname and host and o.hostname == host:
                return None
        except Exception:
            pass

    referer = (request.headers.get("Referer") or "").strip()
    if referer:
        try:
            from urllib.parse import urlparse

            r = urlparse(referer)
            host = (request.host or "").split(":")[0]
            if r.hostname and host and r.hostname == host:
                return None
        except Exception:
            pass

    return "Invalid request. Refresh the page and try again."
