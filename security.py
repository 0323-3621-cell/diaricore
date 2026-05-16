"""
Server-side security helpers for DiariCore.

Journal entry text is validated (length/word count) but never rewritten or HTML-stripped
so mood analysis receives the same content the user typed.
"""

from __future__ import annotations

import imghdr
import logging
import os
import re
import secrets
from typing import Any, Optional, Tuple

from flask import Flask, Response, jsonify, request, session

logger = logging.getLogger("diaricore.security")

ENTRY_WORD_MAX = int(os.environ.get("ENTRY_WORD_MAX", "300"))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_REQUEST_BYTES = int(os.environ.get("MAX_REQUEST_BYTES", str(12 * 1024 * 1024)))
MAX_ENTRY_IMAGES = 10

PUBLIC_API_PREFIXES = (
    "/api/health",
    "/api/register",
    "/api/login",
    "/api/password/",
    "/api/check-availability",
)

_UPLOAD_URL_RE = re.compile(
    r"^/uploads/entry_(\d+)_[a-f0-9]{8,64}\."
    r"(?:jpg|jpeg|jfif|png|webp|gif|bmp|tif|tiff|avif|heic|heif)$",
    re.IGNORECASE,
)

_limiter = None


def is_production() -> bool:
    env = (
        os.environ.get("RAILWAY_ENVIRONMENT")
        or os.environ.get("FLASK_ENV")
        or os.environ.get("ENV")
        or ""
    ).lower()
    return env in ("production", "prod")


def allow_dev_admin_login() -> bool:
    raw = os.environ.get("ALLOW_DEV_ADMIN", "").strip().lower()
    if raw in ("1", "true", "yes"):
        return True
    if raw in ("0", "false", "no"):
        return False
    return not is_production()


def configure_app_security(app: Flask) -> None:
    app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES
    app.config.setdefault("SESSION_COOKIE_HTTPONLY", True)
    app.config.setdefault("SESSION_COOKIE_SAMESITE", "Lax")
    if is_production():
        app.config["SESSION_COOKIE_SECURE"] = True


def init_rate_limiter(app: Flask):
    global _limiter
    try:
        from flask_limiter import Limiter
        from flask_limiter.util import get_remote_address
    except ImportError:
        _limiter = None
        return None

    storage = os.environ.get("REDIS_URL") or "memory://"
    _limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        default_limits=[],
        storage_uri=storage,
    )
    return _limiter


def limit(rule: str):
    """Apply rate limit when Flask-Limiter is installed."""
    if _limiter is None:
        def noop(f):
            return f
        return noop
    return _limiter.limit(rule)


def apply_security_headers(response: Response) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    if is_production():
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    csp = (os.environ.get("CSP_POLICY") or "").strip()
    if csp:
        response.headers["Content-Security-Policy"] = csp
    else:
        response.headers["Content-Security-Policy-Report-Only"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
            "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https:; "
            "frame-ancestors 'none';"
        )
    return response


def is_public_api_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in PUBLIC_API_PREFIXES)


def entry_word_count(text: str) -> int:
    t = (text or "").strip()
    if not t:
        return 0
    return len(t.split())


def entry_word_limit_error(text: str) -> Optional[Tuple[Any, int]]:
    wc = entry_word_count(text)
    if wc > ENTRY_WORD_MAX:
        return (
            jsonify(
                {
                    "success": False,
                    "error": (
                        f"Please keep your entry to {ENTRY_WORD_MAX} words or fewer "
                        f"(you have {wc})."
                    ),
                }
            ),
            400,
        )
    return None


def ensure_csrf_token() -> str:
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def verify_csrf() -> Optional[Tuple[Any, int]]:
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    path = request.path or ""
    if is_public_api_path(path):
        return None
    token = (request.headers.get("X-CSRF-Token") or request.headers.get("X-Csrf-Token") or "").strip()
    expected = session.get("csrf_token")
    if not expected or not token or not secrets.compare_digest(str(token), str(expected)):
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Invalid or missing security token. Please refresh the page and try again.",
                }
            ),
            403,
        )
    return None


def establish_user_session(user_id: int) -> str:
    session.pop("is_admin", None)
    session["user_id"] = int(user_id)
    session.permanent = True
    return ensure_csrf_token()


def clear_user_session() -> None:
    session.pop("user_id", None)
    session.pop("csrf_token", None)


def get_session_user_id() -> Optional[int]:
    if session.get("is_admin"):
        return None
    uid = session.get("user_id")
    if isinstance(uid, int) and uid > 0:
        return uid
    try:
        parsed = int(uid)
        if parsed > 0:
            return parsed
    except (TypeError, ValueError):
        pass
    return None


def require_authenticated_user(
    client_user_id: Any,
) -> Tuple[Optional[int], Optional[Tuple[Any, int]]]:
    session_uid = get_session_user_id()
    if not session_uid:
        return None, (jsonify({"success": False, "error": "Sign in required."}), 401)
    if client_user_id is not None:
        try:
            cid = int(client_user_id)
        except (TypeError, ValueError):
            return None, (jsonify({"success": False, "error": "Valid userId is required."}), 400)
        if cid != session_uid:
            log_security_event("auth_user_mismatch", user_id=session_uid, detail=f"client={cid}")
            return None, (jsonify({"success": False, "error": "Not allowed."}), 403)
    return session_uid, None


def validate_entry_image_urls(
    urls: list,
    user_id: int,
    *,
    allowed_legacy: Optional[set] = None,
) -> Tuple[list[str], Optional[str]]:
    clean: list[str] = []
    legacy = allowed_legacy or set()
    if not isinstance(urls, list):
        return [], "Invalid image list."
    for raw in urls:
        url = str(raw or "").strip()
        if not url:
            continue
        if url in legacy:
            clean.append(url)
            continue
        match = _UPLOAD_URL_RE.match(url)
        if not match:
            return [], "One or more image links are not allowed. Upload images through the app."
        owner = int(match.group(1))
        if owner != int(user_id):
            return [], "One or more images do not belong to your account."
        clean.append(url)
    if len(clean) > MAX_ENTRY_IMAGES:
        return [], f"At most {MAX_ENTRY_IMAGES} images per entry."
    return clean, None


def validate_uploaded_image_stream(file) -> Optional[str]:
    try:
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
    except Exception:
        return "Could not read uploaded file."
    if size <= 0:
        return "Empty file."
    if size > MAX_UPLOAD_BYTES:
        mb = max(1, MAX_UPLOAD_BYTES // (1024 * 1024))
        return f"Image is too large (max {mb} MB)."
    header = file.read(512)
    file.seek(0)
    if imghdr.what(None, header):
        return None
    return None


def log_security_event(event: str, user_id: Optional[int] = None, detail: str = "") -> None:
    safe_detail = (detail or "")[:240]
    logger.warning(
        "security_event=%s user_id=%s detail=%s path=%s",
        event,
        user_id if user_id is not None else "-",
        safe_detail,
        (request.path if request else "-"),
    )
