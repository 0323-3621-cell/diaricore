"""
Shared password strength rules for registration and password reset.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Optional, Tuple

# Hardcoded weak passwords (lowercase exact match). Keep in sync with static/js/password-policy.js
COMMON_PASSWORDS = frozenset(
    {
        "password",
        "12345678",
        "123456789",
        "qwerty",
        "qwerty123",
        "111111",
        "iloveyou",
        "admin",
        "welcome",
        "monkey",
        "dragon",
        "letmein",
        "abc123",
        "password1",
    }
)

_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:'\",.<>?/`~\\"


def _has_special(p: str) -> bool:
    return any(ch in p for ch in _SPECIAL_CHARS)

_MIN_LEN = 12
_MAX_LEN = 64


def _norm(s: Optional[str]) -> str:
    return (s or "").strip()


def _contains_personal(password_lower: str, token: str) -> bool:
    t = _norm(token).lower()
    if len(t) < 2:
        return False
    return t in password_lower


def password_rule_checklist(
    password: str,
    *,
    nickname: str = "",
    email: str = "",
    first_name: str = "",
    last_name: str = "",
) -> dict[str, bool]:
    """Individual rule flags (for tests / parity with frontend)."""
    p = password or ""
    pl = p.lower()
    return {
        "len12": len(p) >= _MIN_LEN,
        "upper": bool(re.search(r"[A-Z]", p)),
        "lower": bool(re.search(r"[a-z]", p)),
        "digit": bool(re.search(r"[0-9]", p)),
        "special": _has_special(p),
        "no_space": " " not in p,
        "no_personal": not any(
            _contains_personal(pl, x)
            for x in (_norm(nickname), _norm(email), _norm(first_name), _norm(last_name))
        ),
    }


def validate_new_password(
    password: str,
    *,
    nickname: str = "",
    email: str = "",
    first_name: str = "",
    last_name: str = "",
) -> Tuple[bool, Optional[str], str]:
    """
    Returns (ok, field_id_for_client, message).
    field_id is 'signUpPassword' or 'resetNewPassword' style — caller may remap.
    """
    p = password if isinstance(password, str) else ""
    if not p.strip():
        return False, "signUpPassword", "Password is required."
    if len(p) > _MAX_LEN:
        return False, "signUpPassword", f"Password must not exceed {_MAX_LEN} characters."
    if " " in p:
        return False, "signUpPassword", "Password must not contain spaces."
    if len(p) < _MIN_LEN:
        return False, "signUpPassword", f"Password must be at least {_MIN_LEN} characters."
    if not re.search(r"[A-Z]", p):
        return False, "signUpPassword", "Password must include at least one uppercase letter (A–Z)."
    if not re.search(r"[a-z]", p):
        return False, "signUpPassword", "Password must include at least one lowercase letter (a–z)."
    if not re.search(r"[0-9]", p):
        return False, "signUpPassword", "Password must include at least one digit (0–9)."
    if not _has_special(p):
        return (
            False,
            "signUpPassword",
            "Password must include at least one special character "
            "(!@#$%^&*()_+-=[]{}|;':\",.<>?/`).",
        )
    pl = p.lower()
    if p.lower() in COMMON_PASSWORDS:
        return False, "signUpPassword", "This password is too common. Choose a less predictable password."

    for label, val in (
        ("username", nickname),
        ("email address", email),
        ("first name", first_name),
        ("last name", last_name),
    ):
        if _contains_personal(pl, val):
            return (
                False,
                "signUpPassword",
                f"Password must not contain your {label}.",
            )

    return True, None, ""


def validate_new_password_for_user_row(
    password: str, user: Mapping[str, Any]
) -> Tuple[bool, Optional[str], str]:
    """Password reset: validate using stored user profile fields."""
    return validate_new_password(
        password,
        nickname=str(user.get("nickname") or ""),
        email=str(user.get("email") or ""),
        first_name=str(user.get("first_name") or ""),
        last_name=str(user.get("last_name") or ""),
    )
