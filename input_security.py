"""
Lightweight input validation for DiariCore APIs.

Journal entry body text is only normalized (strip + null-byte removal) so mood
analysis receives the user's real words. HTML stripping is not applied to entries.
XSS is handled in the browser via escapeHtml when rendering user content.
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

# Tags, titles, profile fields
TAG_MAX_LEN = 40
TITLE_MAX_LEN = 180
ICON_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,62}$")
TAG_RE = re.compile(r"^[\w\s\-'.+#&]{1,40}$", re.UNICODE)
MAX_TAGS_PER_ENTRY = 20
MAX_ENTRY_IMAGES = 10


def strip_null_bytes(value: str) -> str:
    if not value:
        return ""
    return value.replace("\x00", "")


def normalize_entry_text(text: str) -> str:
    """Prepare diary text for storage and mood analysis — do not strip HTML/tags."""
    return strip_null_bytes((text or "").strip())


def validate_title(title: str) -> Tuple[bool, str, Optional[str]]:
    t = strip_null_bytes((title or "").strip())
    if len(t) > TITLE_MAX_LEN:
        return False, "", f"Title must be {TITLE_MAX_LEN} characters or fewer."
    return True, t, None


def validate_tag(tag: str) -> Tuple[bool, str, Optional[str]]:
    t = strip_null_bytes((tag or "").strip())
    if not t:
        return False, "", "Tag is required."
    if len(t) > TAG_MAX_LEN:
        return False, "", f"Tag must be {TAG_MAX_LEN} characters or fewer."
    if "<" in t or ">" in t:
        return False, "", "Tag cannot contain < or >."
    if not TAG_RE.match(t):
        return False, "", "Tag contains invalid characters."
    return True, t, None


def validate_icon_name(icon_name: str) -> Tuple[bool, Optional[str], Optional[str]]:
    raw = strip_null_bytes((icon_name or "").strip().lower())
    if not raw:
        return True, None, None
    if not ICON_NAME_RE.match(raw):
        return False, None, "Invalid icon name."
    return True, raw, None


def sanitize_tags_list(tags: list) -> Tuple[bool, List[str], Optional[str]]:
    if not isinstance(tags, list):
        return False, [], "Tags must be a list."
    if len(tags) > MAX_TAGS_PER_ENTRY:
        return False, [], f"At most {MAX_TAGS_PER_ENTRY} tags per entry."
    out: List[str] = []
    seen = set()
    for item in tags:
        ok, cleaned, err = validate_tag(str(item or ""))
        if not ok:
            return False, [], err
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return True, out, None


def validate_image_url(url: str) -> Tuple[bool, str, Optional[str]]:
    u = strip_null_bytes(str(url or "").strip())
    if not u:
        return False, "", "Empty image URL."
    if not u.startswith("/uploads/"):
        return False, "", "Invalid image URL."
    fname = u[len("/uploads/") :].replace("\\", "/")
    if not fname or ".." in fname or "/" in fname:
        return False, "", "Invalid image URL."
    return True, u, None


def sanitize_image_urls(urls: list) -> Tuple[bool, List[str], Optional[str]]:
    if not isinstance(urls, list):
        return False, [], "imageUrls must be a list."
    if len(urls) > MAX_ENTRY_IMAGES:
        return False, [], f"At most {MAX_ENTRY_IMAGES} images per entry."
    out: List[str] = []
    for item in urls:
        if not isinstance(item, str):
            return False, [], "Invalid image URL."
        ok, cleaned, err = validate_image_url(item)
        if not ok:
            return False, [], err
        out.append(cleaned)
    return True, out, None
