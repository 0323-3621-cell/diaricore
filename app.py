"""
DiariCore — Flask app serving static HTML/CSS/JS and JSON API for auth.
Deploy on Railway with PostgreSQL (DATABASE_URL). Local dev uses SQLite.
"""

import os
import json
import uuid
import random
import secrets
import urllib.parse
import io
import urllib.request
from datetime import date, datetime, timedelta, timezone

import pyotp
import segno
from flask import Flask, jsonify, request, send_from_directory, abort, session
from werkzeug.security import check_password_hash

import db
import space_nlp

INSIGHT_TEMPLATES = {
    "anxious": [
        "Your anxiety spikes when {k} shows up in what you write.",
        "You often feel anxious on days when your entries mention {k}.",
        "Themes like {k} keep appearing alongside anxious moods in your journal.",
    ],
    "happy": [
        "{k} seems to be a recurring bright spot when you're feeling happy.",
        "Your happiest entries often touch on {k}.",
        "Joy in your diary frequently lines up with mentions of {k}.",
    ],
    "sad": [
        "Sad days in your journal often cluster around {k}.",
        "When you're low, {k} tends to show up in your writing.",
        "Heavy moods and mentions of {k} often appear together for you.",
    ],
    "angry": [
        "Frustration in your entries often centers on {k}.",
        "You sound angriest when {k} is on your mind.",
        "Irritation shows up a lot alongside topics like {k}.",
    ],
    "neutral": [
        "Even balanced days still note {k} fairly often.",
        "Neutral moods in your diary still reference {k} regularly.",
        "When you're steady, {k} still appears as a quiet theme.",
    ],
}

STRESS_TRIGGER_TEMPLATES = [
    "You tend to feel more stressed when {tag} comes up.",
    "Stress often shows up alongside mentions of {tag}.",
    "When {tag} is on your mind, your mood leans more tense.",
    "Mentions of {tag} frequently appear in your tougher days.",
    "{tag} seems to be a common theme when you're feeling overwhelmed.",
    "Your stress-related entries often include {tag}.",
    "You often sound more pressured when you write about {tag}.",
    "{tag} is a recurring topic on days that feel heavy.",
    "When {tag} appears, your mood is more likely to dip into stress.",
    "Your stress trigger pattern points to {tag} as a frequent factor.",
    "Your journal suggests {tag} is linked to your stressful moments.",
    "Hard days often include {tag} in what you write.",
]

HAPPINESS_TRIGGER_TEMPLATES = [
    "Your mood improves when you mention {tag}.",
    "{tag} often shows up in your happiest entries.",
    "You seem to feel lighter when {tag} is part of your day.",
    "Positive entries frequently include {tag}.",
    "{tag} looks like a consistent source of joy for you.",
    "You often sound more hopeful when you write about {tag}.",
    "When {tag} appears, your mood trends more positive.",
    "{tag} seems to be a bright spot in your recent entries.",
    "Your happiest moments often connect to {tag}.",
    "You tend to feel better on days that include {tag}.",
    "{tag} shows up a lot when you're in a good place.",
    "Your journal points to {tag} as a recurring mood booster.",
]

STRESS_COUNT_JUSTIFICATION_TEMPLATES = [
    "{count} of your stress-related entries include {tag}.",
    "{tag} appears in {count} entries that were detected as stress moods.",
    "Across your stressed days, {tag} showed up {count} times.",
    "{count} stressed entries mention {tag}, which is why it ranks at the top.",
]

HAPPINESS_COUNT_JUSTIFICATION_TEMPLATES = [
    "{count} of your happy entries include {tag}.",
    "{tag} appears in {count} entries detected as happy.",
    "In your positive days, {tag} showed up {count} times.",
    "{count} happy entries mention {tag}, which is why it ranks at the top.",
]


def _pick_template(templates: list[str], *, tag: str) -> str:
    safe_tag = _to_title_case(tag) if tag else "that topic"
    pool = templates or ["{tag} keeps showing up in your entries."]
    return random.choice(pool).format(tag=safe_tag)

def _pick_count_template(templates: list[str], *, tag: str, count: int) -> str:
    safe_tag = _to_title_case(tag) if tag else "that topic"
    safe_count = max(0, int(count or 0))
    pool = templates or ["{count} entries include {tag}."]
    return random.choice(pool).format(tag=safe_tag, count=safe_count)


def _random_insight_line(emotion: str, top_keyword: str) -> str:
    emo = (emotion or "neutral").lower()
    k = (top_keyword or "").strip() or "these themes"
    templates = INSIGHT_TEMPLATES.get(emo) or INSIGHT_TEMPLATES["neutral"]
    return random.choice(templates).format(k=k)


def _to_title_case(text: str) -> str:
    s = str(text or "").strip()
    return " ".join(p[:1].upper() + p[1:] if p else "" for p in s.split(" "))


def _trigger_query_user_id():
    raw = (request.args.get("userId") or request.args.get("user_id") or "").strip()
    if not raw.isdigit():
        return None
    return int(raw)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")
#
# Uploads must live somewhere persistent across deploys (Railway volume, etc).
# If `UPLOADS_DIR` is not set, we fall back to the local container path.
#
UPLOADS_DIR = os.environ.get("UPLOADS_DIR") or os.path.join(STATIC_DIR, "img", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


def _cleanup_removed_entry_uploads(old_urls: list[str], new_urls: list[str]) -> None:
    """Remove files under UPLOADS_DIR that were dropped from an entry's image list."""
    old_set = {str(u).strip() for u in (old_urls or []) if isinstance(u, str) and str(u).strip()}
    new_set = {str(u).strip() for u in (new_urls or []) if isinstance(u, str) and str(u).strip()}
    uploads_root = os.path.normpath(UPLOADS_DIR)
    for url in old_set - new_set:
        if not url.startswith("/uploads/"):
            continue
        fname = url[len("/uploads/") :].replace("\\", "/")
        if not fname or ".." in fname or "/" in fname:
            continue
        abs_path = os.path.normpath(os.path.join(UPLOADS_DIR, fname))
        if not abs_path.startswith(uploads_root + os.sep) and abs_path != uploads_root:
            continue
        if os.path.isfile(abs_path):
            try:
                os.remove(abs_path)
            except OSError:
                pass


app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False
app.secret_key = os.environ.get("SECRET_KEY", "diaricore-dev-secret")


def _generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def _send_otp_email(email: str, otp_code: str, nickname: str) -> bool:
    api_key = os.environ.get("BREVO_API_KEY") or db.get_system_setting("brevo_api_key")
    sender_email = os.environ.get("BREVO_SENDER_EMAIL") or db.get_system_setting("brevo_sender_email")
    sender_name = os.environ.get("BREVO_SENDER_NAME") or db.get_system_setting("brevo_sender_name", "DiariCore")
    enable_notifications = (db.get_system_setting("enable_email_notifications", "true") or "true").lower() == "true"

    if not enable_notifications:
        print(f"[OTP DISABLED] Email notifications disabled. OTP for {email}: {otp_code}")
        return True

    if not api_key or not sender_email:
        print(f"[OTP DEV MODE] {email} -> {otp_code}")
        return True

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": nickname or email.split("@")[0]}],
        "subject": "DiariCore verification code",
        "htmlContent": f"""
            <html><body style='font-family: Arial, sans-serif; color: #2F3E36;'>
            <h2>Verify your DiariCore account</h2>
            <p>Hello {nickname or 'there'},</p>
            <p>Your verification code is:</p>
            <p style='font-size: 28px; font-weight: bold; letter-spacing: 6px;'>{otp_code}</p>
            <p>This code expires in 10 minutes.</p>
            </body></html>
        """,
        "textContent": f"Your DiariCore verification code is {otp_code}. It expires in 10 minutes.",
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "api-key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15):
            return True
    except Exception:
        return False


def _send_password_reset_email(email: str, reset_code: str, nickname: str) -> bool:
    api_key = os.environ.get("BREVO_API_KEY") or db.get_system_setting("brevo_api_key")
    sender_email = os.environ.get("BREVO_SENDER_EMAIL") or db.get_system_setting("brevo_sender_email")
    sender_name = os.environ.get("BREVO_SENDER_NAME") or db.get_system_setting("brevo_sender_name", "DiariCore")
    enable_notifications = (db.get_system_setting("enable_email_notifications", "true") or "true").lower() == "true"

    if not enable_notifications:
        print(f"[PASSWORD RESET DISABLED] OTP for {email}: {reset_code}")
        return True

    if not api_key or not sender_email:
        print(f"[PASSWORD RESET DEV MODE] {email} -> {reset_code}")
        return True

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": nickname or email.split("@")[0]}],
        "subject": "DiariCore password reset code",
        "htmlContent": f"""
            <html><body style='font-family: Arial, sans-serif; color: #2F3E36;'>
            <h2>Reset your DiariCore password</h2>
            <p>Hello {nickname or 'there'},</p>
            <p>Use this code to reset your password:</p>
            <p style='font-size: 28px; font-weight: bold; letter-spacing: 6px;'>{reset_code}</p>
            <p>This code expires in 10 minutes.</p>
            </body></html>
        """,
        "textContent": f"Your DiariCore password reset code is {reset_code}. It expires in 10 minutes.",
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "api-key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15):
            return True
    except Exception:
        return False


def _send_login_totp_recovery_email(email: str, recovery_code: str, nickname: str) -> bool:
    """Email a one-time code used to disable TOTP when the user cannot access their authenticator app."""
    api_key = os.environ.get("BREVO_API_KEY") or db.get_system_setting("brevo_api_key")
    sender_email = os.environ.get("BREVO_SENDER_EMAIL") or db.get_system_setting("brevo_sender_email")
    sender_name = os.environ.get("BREVO_SENDER_NAME") or db.get_system_setting("brevo_sender_name", "DiariCore")
    enable_notifications = (db.get_system_setting("enable_email_notifications", "true") or "true").lower() == "true"

    if not enable_notifications:
        print(f"[TOTP RECOVERY EMAIL DISABLED] {email} -> {recovery_code}")
        return True

    if not api_key or not sender_email:
        print(f"[TOTP RECOVERY DEV MODE] {email} -> {recovery_code}")
        return True

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": nickname or email.split("@")[0]}],
        "subject": "DiariCore sign-in — authenticator recovery code",
        "htmlContent": f"""
            <html><body style='font-family: Arial, sans-serif; color: #2F3E36;'>
            <h2>Authenticator recovery</h2>
            <p>Hello {nickname or 'there'},</p>
            <p>Someone started sign-in to DiariCore and asked to recover access without an authenticator app code.
            If this was you, enter this one-time code on the website:</p>
            <p style='font-size: 28px; font-weight: bold; letter-spacing: 6px;'>{recovery_code}</p>
            <p>This code expires in 15 minutes. If you did not request this, you can ignore this email and your password
            still protects your account.</p>
            <p><strong>Note:</strong> using this code will turn off authenticator sign-in for your account until you enable it again in Profile.</p>
            </body></html>
        """,
        "textContent": (
            f"DiariCore authenticator recovery code: {recovery_code}. Expires in 15 minutes. "
            "Using it turns off authenticator sign-in until you set it up again in Profile."
        ),
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "api-key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15):
            return True
    except Exception:
        return False


def _parse_db_datetime(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        dt = val
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    s = str(val).strip()
    if not s:
        return None
    if s.endswith("Z") or s.endswith("z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _serialize_value(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def entry_created_at_iso_utc(created_at):
    """
    Journal entries must expose `date` as an absolute instant (UTC + Z).
    Naive datetimes from Postgres TIMESTAMP (no tz) / SQLite are treated as UTC wall time
    so browsers do not mis-read them as *local* and shift the calendar day.
    """
    if created_at is None:
        return ""
    if isinstance(created_at, datetime):
        dt = created_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(created_at, date):
        dt = datetime.combine(created_at, datetime.min.time(), tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    s = str(created_at).strip()
    if not s:
        return s
    norm = s.replace(" ", "T", 1)
    parse_s = norm[:-1] + "+00:00" if norm.endswith("Z") or norm.endswith("z") else norm
    try:
        dt = datetime.fromisoformat(parse_s)
    except ValueError:
        return s
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _truthy_db_flag(v) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return int(v) != 0
    s = str(v).strip().lower()
    return s in ("1", "true", "t", "yes", "on")


def _normalize_totp_code(raw) -> str:
    return "".join(c for c in str(raw or "") if c.isdigit())


def _verify_totp_code(secret: str, code: str) -> bool:
    s = (secret or "").strip()
    digits = _normalize_totp_code(code)
    if not s or len(digits) != 6:
        return False
    return bool(pyotp.TOTP(s).verify(digits, valid_window=1))


def _totp_qr_data_uri(otpauth_url: str) -> str:
    buf = io.BytesIO()
    segno.make(otpauth_url).save(buf, kind="svg", scale=3, border=1, xmldecl=False)
    svg = buf.getvalue().decode("utf-8")
    return "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(svg)


def serialize_user(row):
    if not row:
        return None
    out = {}
    for k, v in row.items():
        if k in ("password_hash", "totp_secret", "totp_setup_secret", "totp_setup_expires"):
            continue
        out[k] = _serialize_value(v)
    # camelCase for frontend localStorage parity
    mapped = {
        "id": out.get("id"),
        "nickname": out.get("nickname"),
        "email": out.get("email"),
        "firstName": out.get("first_name"),
        "lastName": out.get("last_name"),
        "fullName": f"{out.get('first_name') or ''} {out.get('last_name') or ''}".strip(),
        "gender": out.get("gender"),
        "birthday": out.get("birthday"),
        "createdAt": out.get("created_at"),
        "totpEnabled": _truthy_db_flag(out.get("totp_enabled")),
    }
    av = out.get("avatar_data_url")
    if isinstance(av, str) and av.strip():
        mapped["avatarDataUrl"] = av.strip()
    else:
        mapped["avatarDataUrl"] = None
    return mapped


def serialize_entry(row):
    if not row:
        return None
    tags = []
    tags_raw = row.get("tags_json")
    if tags_raw:
        try:
            parsed = json.loads(tags_raw)
            if isinstance(parsed, list):
                tags = parsed
        except Exception:
            tags = []
    created_at = row.get("created_at")
    entry_dt_raw = row.get("entry_datetime_utc")
    date_value = entry_created_at_iso_utc(entry_dt_raw) if entry_dt_raw else entry_created_at_iso_utc(created_at)
    emotion_label = (row.get("emotion_label") or "neutral").lower()
    all_probs = {}
    probs_raw = row.get("all_probs_json")
    if probs_raw:
        try:
            parsed = json.loads(probs_raw)
            if isinstance(parsed, dict):
                all_probs = parsed
        except Exception:
            all_probs = {}
    image_urls = []
    image_raw = row.get("image_urls_json")
    if image_raw:
        try:
            parsed = json.loads(image_raw)
            if isinstance(parsed, list):
                image_urls = [str(x) for x in parsed if isinstance(x, str)]
        except Exception:
            image_urls = []
    return {
        "id": row.get("id"),
        "userId": row.get("user_id"),
        "text": row.get("text_content") or "",
        "title": row.get("title") or "",
        "tags": tags,
        "imageUrls": image_urls,
        "date": date_value,
        "createdAt": entry_created_at_iso_utc(created_at),
        "updatedAt": entry_created_at_iso_utc(row.get("updated_at")) if row.get("updated_at") else None,
        "sentimentLabel": (row.get("sentiment_label") or "neutral").lower(),
        "sentimentScore": float(row.get("sentiment_score") or 0.5),
        "emotionLabel": emotion_label,
        "emotionScore": float(row.get("emotion_score") or 0.5),
        "all_probs": all_probs,
        # Keep existing UI compatibility
        "feeling": emotion_label,
    }


def _parse_ph_local_to_utc_iso(local_dt: str) -> str | None:
    s = str(local_dt or "").strip()
    if not s:
        return None
    # Expect datetime-local format like "2026-05-12T17:30"
    try:
        naive = datetime.fromisoformat(s)
    except ValueError:
        return None
    ph_tz = timezone(timedelta(hours=8))
    aware = naive.replace(tzinfo=ph_tz)
    return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _allowed_image_extension(filename: str) -> bool:
    ext = os.path.splitext(str(filename or ""))[1].lower()
    return ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@app.before_request
def ensure_db():
    """Lazy init once per process."""
    if not getattr(app, "_db_ready", False):
        db.init_db()
        app._db_ready = True


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "database": "postgres" if db.USE_POSTGRES else "sqlite"})


@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or {}
    nickname = (data.get("nickname") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    first_name = (data.get("firstName") or "").strip()
    last_name = (data.get("lastName") or "").strip()
    gender = (data.get("gender") or "").strip()
    birthday = (data.get("birthday") or "").strip()

    if not nickname:
        return jsonify({"success": False, "field": "nickname", "error": "Username is required."}), 400
    if len(nickname) < 4 or len(nickname) > 64:
        return jsonify(
            {"success": False, "field": "nickname", "error": "Field must be between 4 and 64 characters long."}
        ), 400
    if not email:
        return jsonify({"success": False, "field": "signUpEmail", "error": "Email is required."}), 400
    # Keep backend email validation simple but consistent with frontend.
    if "@" not in email or "." not in email:
        return jsonify({"success": False, "field": "signUpEmail", "error": "Please enter a valid email."}), 400
    if not password:
        return jsonify({"success": False, "field": "signUpPassword", "error": "Password is required."}), 400
    if len(password) < 8:
        return jsonify({"success": False, "field": "signUpPassword", "error": "Password must be at least 8 characters."}), 400
    if not first_name:
        return jsonify({"success": False, "field": "firstName", "error": "First name is required."}), 400
    if not last_name:
        return jsonify({"success": False, "field": "lastName", "error": "Last name is required."}), 400
    if not gender:
        return jsonify({"success": False, "field": "gender", "error": "Gender is required."}), 400
    if not birthday:
        return jsonify({"success": False, "field": "birthday", "error": "Date of birth is required."}), 400

    otp_code = _generate_otp()
    otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    if not db.store_pending_registration(
        nickname=nickname,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        gender=gender,
        birthday=birthday,
        otp_code=otp_code,
        otp_expires_at=otp_expires_at,
    ):
        return jsonify({"success": False, "error": "Could not start verification. Please try again."}), 500

    if not _send_otp_email(email, otp_code, nickname):
        return jsonify({"success": False, "error": "Failed to send verification code. Please try again."}), 500

    return jsonify({"success": True, "message": "Verification code sent to your email.", "email": email}), 200


@app.route("/api/register/verify", methods=["POST"])
def api_register_verify():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp_code = (data.get("otpCode") or "").strip()
    if not email or not otp_code:
        return jsonify({"success": False, "error": "Email and verification code are required."}), 400

    pending = db.get_pending_registration(email)
    if not pending:
        return jsonify({"success": False, "error": "No pending registration found. Please sign up again."}), 404

    expires_raw = pending.get("otp_expires_at")
    try:
        if isinstance(expires_raw, str):
            expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
        else:
            expires_at = expires_raw
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except Exception:
        expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    if datetime.now(timezone.utc) > expires_at:
        return jsonify({"success": False, "error": "Invalid or expired verification code. Please try again."}), 400

    if pending.get("otp_code") != otp_code:
        return jsonify({"success": False, "error": "Invalid or expired verification code. Please try again."}), 400

    created, payload = db.create_user_from_pending(pending)
    if not created:
        field_id, message = payload
        if field_id:
            return jsonify({"success": False, "field": field_id, "error": message}), 409
        return jsonify({"success": False, "error": message}), 400

    db.delete_pending_registration(email)
    return jsonify({"success": True, "user": serialize_user(payload)}), 201


@app.route("/api/register/resend", methods=["POST"])
def api_register_resend():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"success": False, "error": "Email is required."}), 400

    pending = db.get_pending_registration(email)
    if not pending:
        return jsonify({"success": False, "error": "No pending registration found."}), 404

    otp_code = _generate_otp()
    otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    if not db.update_pending_otp(email, otp_code, otp_expires_at):
        return jsonify({"success": False, "error": "Could not refresh verification code."}), 500

    if not _send_otp_email(email, otp_code, pending.get("nickname") or ""):
        return jsonify({"success": False, "error": "Failed to resend verification code."}), 500

    return jsonify({"success": True, "message": "Verification code resent."}), 200


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or data.get("email") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"success": False, "error": "Username and password are required."}), 400

    if username.lower() == "admin" and password == "admin123":
        session["is_admin"] = True
        admin_user = {
            "id": 0,
            "nickname": "admin",
            "email": "admin",
            "firstName": "System",
            "lastName": "Admin",
            "fullName": "System Admin",
            "gender": None,
            "birthday": None,
            "createdAt": None,
            "isAdmin": True,
        }
        return jsonify({"success": True, "user": admin_user}), 200

    ok, result = db.verify_login(username, password)
    if not ok:
        return jsonify({"success": False, "error": result}), 401

    session.pop("is_admin", None)

    if _truthy_db_flag(result.get("totp_enabled")) and (result.get("totp_secret") or "").strip():
        token = db.create_login_totp_challenge(int(result["id"]))
        if not token:
            return jsonify({"success": False, "error": "Could not start two-factor sign-in. Please try again."}), 500
        return jsonify({"success": True, "requiresTwoFactor": True, "challengeToken": token}), 200

    return jsonify({"success": True, "user": serialize_user(result)}), 200


@app.route("/api/login/totp", methods=["POST"])
def api_login_totp():
    data = request.get_json(silent=True) or {}
    challenge_token = (data.get("challengeToken") or "").strip()
    code = data.get("code") or ""
    if not challenge_token or not code:
        return jsonify({"success": False, "error": "Verification code is required."}), 400

    user_id = db.peek_login_totp_challenge_user_id(challenge_token)
    if not user_id:
        return jsonify({"success": False, "error": "This sign-in step expired. Please sign in again."}), 401

    user = db.get_user_by_id(user_id)
    if not user or not _truthy_db_flag(user.get("totp_enabled")):
        db.delete_login_totp_challenge(challenge_token)
        return jsonify({"success": False, "error": "Two-factor authentication is not active for this account."}), 400

    secret = (user.get("totp_secret") or "").strip()
    if not secret or not _verify_totp_code(secret, code):
        return jsonify({"success": False, "error": "Invalid authentication code."}), 401

    db.delete_login_totp_recovery_otp_for_challenge(challenge_token)
    db.delete_login_totp_challenge(challenge_token)
    out = {k: v for k, v in user.items() if k != "password_hash"}
    return jsonify({"success": True, "user": serialize_user(out)}), 200


@app.route("/api/login/totp/recovery/request", methods=["POST"])
def api_login_totp_recovery_request():
    """Email a 6-digit recovery code for the pending TOTP login challenge (lost authenticator)."""
    data = request.get_json(silent=True) or {}
    challenge_token = (data.get("challengeToken") or "").strip()
    if len(challenge_token) < 8:
        return jsonify({"success": False, "error": "Unable to send recovery email."}), 400

    user_id = db.peek_login_totp_challenge_user_id(challenge_token)
    if not user_id:
        return jsonify({"success": False, "error": "Unable to send recovery email."}), 400

    user = db.get_user_by_id(user_id)
    if not user or not _truthy_db_flag(user.get("totp_enabled")):
        return jsonify({"success": False, "error": "Unable to send recovery email."}), 400

    row = db.get_login_totp_recovery_otp_row(challenge_token)
    if row and row.get("created_at"):
        cre = _parse_db_datetime(row.get("created_at"))
        if cre:
            elapsed = (datetime.now(timezone.utc) - cre).total_seconds()
            if elapsed < 55:
                retry = max(1, int(55 - elapsed) + 1)
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": "Please wait a minute before requesting another code.",
                            "retryAfterSeconds": retry,
                        }
                    ),
                    429,
                )

    code = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    if not db.upsert_login_totp_recovery_otp(challenge_token, user_id, code, expires_at):
        return jsonify({"success": False, "error": "Could not start recovery."}), 500

    email_to = (user.get("email") or "").strip()
    if not email_to:
        db.delete_login_totp_recovery_otp_for_challenge(challenge_token)
        return jsonify({"success": False, "error": "Unable to send recovery email."}), 500

    if not _send_login_totp_recovery_email(email_to, code, user.get("nickname") or ""):
        db.delete_login_totp_recovery_otp_for_challenge(challenge_token)
        return jsonify({"success": False, "error": "Could not send email. Try again later."}), 500

    return jsonify({"success": True, "message": "If this account has a valid sign-in in progress, a code was sent."}), 200


@app.route("/api/login/totp/recovery/verify", methods=["POST"])
def api_login_totp_recovery_verify():
    """Verify email recovery code, disable TOTP, and complete login (same session as normal TOTP verify)."""
    data = request.get_json(silent=True) or {}
    challenge_token = (data.get("challengeToken") or "").strip()
    code = _normalize_totp_code(data.get("code") or "")
    if len(challenge_token) < 8 or len(code) != 6:
        return jsonify({"success": False, "error": "Invalid or expired recovery code."}), 400

    user_id = db.peek_login_totp_challenge_user_id(challenge_token)
    if not user_id:
        return jsonify({"success": False, "error": "This sign-in step expired. Please sign in again."}), 401

    row = db.get_login_totp_recovery_otp_row(challenge_token)
    if not row:
        return jsonify({"success": False, "error": "Invalid or expired recovery code."}), 400

    exp = _parse_db_datetime(row.get("expires_at"))
    if exp is None or datetime.now(timezone.utc) > exp:
        db.delete_login_totp_recovery_otp_for_challenge(challenge_token)
        return jsonify({"success": False, "error": "Invalid or expired recovery code."}), 401

    stored = (row.get("code") or "").strip()
    if len(stored) != 6 or not secrets.compare_digest(stored, code):
        return jsonify({"success": False, "error": "Invalid or expired recovery code."}), 401

    user = db.get_user_by_id(user_id)
    if not user or not _truthy_db_flag(user.get("totp_enabled")):
        db.delete_login_totp_recovery_otp_for_challenge(challenge_token)
        db.delete_login_totp_challenge(challenge_token)
        return jsonify({"success": False, "error": "Two-factor authentication is not active for this account."}), 400

    if not db.disable_totp_for_user(user_id):
        return jsonify({"success": False, "error": "Could not complete recovery. Try again."}), 500

    db.delete_login_totp_recovery_otp_for_challenge(challenge_token)
    db.delete_login_totp_challenge(challenge_token)
    user_after = db.get_user_by_id(user_id)
    if not user_after:
        return jsonify({"success": False, "error": "Recovery failed."}), 500
    out = {k: v for k, v in user_after.items() if k != "password_hash"}
    return jsonify({"success": True, "user": serialize_user(out), "totpWasReset": True}), 200


@app.route("/api/user/totp/setup", methods=["POST"])
def api_user_totp_setup():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        user_id = 0
    password = data.get("password") or ""
    if user_id <= 0 or not password:
        return jsonify({"success": False, "error": "User ID and password are required."}), 400

    if not db.verify_user_password_by_id(user_id, password):
        return jsonify({"success": False, "error": "Incorrect password."}), 401

    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"success": False, "error": "User not found."}), 404
    if _truthy_db_flag(user.get("totp_enabled")) and (user.get("totp_secret") or "").strip():
        return jsonify({"success": False, "error": "Two-factor authentication is already enabled."}), 400

    secret = pyotp.random_base32()
    if not db.set_totp_setup_pending(user_id, secret):
        return jsonify({"success": False, "error": "Could not start authenticator setup."}), 500

    label = (user.get("email") or user.get("nickname") or str(user_id)).strip()
    otpauth_url = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name="DiariCore")
    return jsonify(
        {
            "success": True,
            "otpauthUrl": otpauth_url,
            "qrDataUri": _totp_qr_data_uri(otpauth_url),
            "totpSecret": secret,
        }
    ), 200


@app.route("/api/user/totp/confirm", methods=["POST"])
def api_user_totp_confirm():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        user_id = 0
    code = data.get("code") or ""
    if user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400

    pending = db.get_totp_setup_pending_secret(user_id)
    if not pending:
        return jsonify({"success": False, "error": "No pending authenticator setup. Start setup again."}), 400

    if not _verify_totp_code(pending, code):
        return jsonify({"success": False, "error": "Invalid code. Check the time on your phone and try again."}), 400

    if not db.commit_totp_secret_enabled(user_id, pending):
        return jsonify({"success": False, "error": "Could not enable two-factor authentication."}), 500

    row = db.get_user_by_id(user_id)
    return jsonify({"success": True, "user": serialize_user(row)}), 200


@app.route("/api/user/totp/disable", methods=["POST"])
def api_user_totp_disable():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        user_id = 0
    password = data.get("password") or ""
    code = data.get("code") or ""
    if user_id <= 0 or not password or not code:
        return jsonify({"success": False, "error": "Password and authenticator code are required."}), 400

    if not db.verify_user_password_by_id(user_id, password):
        return jsonify({"success": False, "error": "Incorrect password."}), 401

    user = db.get_user_by_id(user_id)
    if not user or not _truthy_db_flag(user.get("totp_enabled")):
        return jsonify({"success": False, "error": "Two-factor authentication is not enabled."}), 400

    secret = (user.get("totp_secret") or "").strip()
    if not secret or not _verify_totp_code(secret, code):
        return jsonify({"success": False, "error": "Invalid authentication code."}), 401

    if not db.disable_totp_for_user(user_id):
        return jsonify({"success": False, "error": "Could not disable two-factor authentication."}), 500

    row = db.get_user_by_id(user_id)
    return jsonify({"success": True, "user": serialize_user(row)}), 200


@app.route("/api/user/avatar", methods=["POST"])
def api_user_avatar():
    """Save or clear the signed-in user's profile photo (data URL stored server-side)."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    if not isinstance(user_id, int):
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            user_id = 0
    if user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400

    raw = data.get("avatarDataUrl")
    if raw is None:
        avatar = None
    elif isinstance(raw, str):
        s = raw.strip()
        if not s:
            avatar = None
        elif len(s) > 1_200_000:
            return jsonify({"success": False, "error": "Image data is too large."}), 400
        elif not s.startswith("data:image/"):
            return jsonify({"success": False, "error": "avatarDataUrl must be a data:image/… URL."}), 400
        else:
            avatar = s
    else:
        return jsonify({"success": False, "error": "Invalid avatarDataUrl."}), 400

    if not db.get_user_by_id(user_id):
        return jsonify({"success": False, "error": "User not found."}), 404

    if not db.update_user_avatar_data_url(user_id, avatar):
        return jsonify({"success": False, "error": "Could not save profile photo."}), 500

    row = db.get_user_by_id(user_id)
    return jsonify({"success": True, "user": serialize_user(row)}), 200


@app.route("/api/password/forgot", methods=["POST"])
def api_password_forgot():
    data = request.get_json(silent=True) or {}
    email = (data.get("identifier") or data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"success": False, "error": "Email address is required."}), 400
    if "@" not in email or "." not in email:
        return jsonify({"success": False, "error": "Please enter a valid email."}), 400

    user = db.get_user_by_email(email)
    if not user:
        return jsonify({"success": False, "error": "This email doesn’t appear to be associated with any account yet."}), 404

    reset_code = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    if not db.store_password_reset(user["email"], reset_code, expires_at):
        return jsonify({"success": False, "error": "Could not start password reset. Please try again."}), 500

    if not _send_password_reset_email(user["email"], reset_code, user.get("nickname") or ""):
        return jsonify({"success": False, "error": "Failed to send reset code. Please try again."}), 500

    return jsonify({"success": True, "message": "Reset code sent. Check your email."}), 200


@app.route("/api/password/reset", methods=["POST"])
def api_password_reset():
    data = request.get_json(silent=True) or {}
    email = (data.get("identifier") or "").strip().lower()
    reset_code = (data.get("code") or "").strip()
    new_password = data.get("newPassword") or ""

    if not email:
        return jsonify({"success": False, "error": "Email address is required."}), 400
    if "@" not in email or "." not in email:
        return jsonify({"success": False, "error": "Please enter a valid email address."}), 400
    if not reset_code:
        return jsonify({"success": False, "error": "Reset code is required."}), 400
    if len(new_password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters."}), 400

    user = db.get_user_by_email(email)
    if not user:
        return jsonify({"success": False, "error": "Invalid reset request."}), 400

    if check_password_hash(user.get("password_hash") or "", new_password):
        return jsonify({"success": False, "error": "Please enter a password different from your previous one."}), 400

    reset_row = db.get_password_reset(user["email"])
    if not reset_row:
        return jsonify({"success": False, "error": "Invalid or expired reset code."}), 400

    expires_raw = reset_row.get("expires_at")
    try:
        if isinstance(expires_raw, str):
            expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
        else:
            expires_at = expires_raw
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except Exception:
        expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    if datetime.now(timezone.utc) > expires_at or (reset_row.get("reset_code") or "") != reset_code:
        return jsonify({"success": False, "error": "Invalid or expired reset code."}), 400

    if not db.update_user_password_by_email(user["email"], new_password):
        return jsonify({"success": False, "error": "Could not update password. Please try again."}), 500

    db.delete_password_reset(user["email"])
    return jsonify({"success": True, "message": "Password updated successfully. You can now sign in."}), 200


@app.route("/api/password/verify-code", methods=["POST"])
def api_password_verify_code():
    data = request.get_json(silent=True) or {}
    email = (data.get("identifier") or "").strip().lower()
    reset_code = (data.get("code") or "").strip()

    if not email:
        return jsonify({"success": False, "error": "Email address is required."}), 400
    if "@" not in email or "." not in email:
        return jsonify({"success": False, "error": "Please enter a valid email."}), 400
    if not reset_code:
        return jsonify({"success": False, "error": "Reset code is required."}), 400

    user = db.get_user_by_email(email)
    if not user:
        return jsonify({"success": False, "error": "Invalid reset request."}), 400

    reset_row = db.get_password_reset(user["email"])
    if not reset_row:
        return jsonify({"success": False, "error": "Invalid or expired reset code."}), 400

    expires_raw = reset_row.get("expires_at")
    try:
        if isinstance(expires_raw, str):
            expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
        else:
            expires_at = expires_raw
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except Exception:
        expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    if datetime.now(timezone.utc) > expires_at or (reset_row.get("reset_code") or "") != reset_code:
        return jsonify({"success": False, "error": "Invalid or expired reset code."}), 400

    return jsonify({"success": True, "message": "Code verified."}), 200


@app.route("/api/admin/settings", methods=["GET"])
def api_admin_settings_get():
    if not session.get("is_admin"):
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    api_key = db.get_system_setting("brevo_api_key", "")
    masked = ""
    if api_key:
        if len(api_key) <= 8:
            masked = "*" * len(api_key)
        else:
            masked = f"{api_key[:4]}{'*' * (len(api_key) - 8)}{api_key[-4:]}"
    return jsonify(
        {
            "success": True,
            "settings": {
                "hasApiKey": bool(api_key),
                "maskedApiKey": masked,
                "senderEmail": db.get_system_setting("brevo_sender_email", ""),
                "senderName": db.get_system_setting("brevo_sender_name", "DiariCore"),
                "enableEmailNotifications": (db.get_system_setting("enable_email_notifications", "true") or "true").lower() == "true",
            },
        }
    )


@app.route("/api/admin/settings", methods=["POST"])
def api_admin_settings_save():
    if not session.get("is_admin"):
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    api_key = (data.get("apiKey") or "").strip()
    sender_email = (data.get("senderEmail") or "").strip()
    sender_name = (data.get("senderName") or "").strip()
    enable_notifications = bool(data.get("enableEmailNotifications"))

    if sender_email and ("@" not in sender_email or "." not in sender_email):
        return jsonify({"success": False, "error": "Sender email is invalid."}), 400

    if api_key:
        db.set_system_setting("brevo_api_key", api_key)
    if sender_email:
        db.set_system_setting("brevo_sender_email", sender_email)
    if sender_name:
        db.set_system_setting("brevo_sender_name", sender_name)
    db.set_system_setting("enable_email_notifications", "true" if enable_notifications else "false")
    return jsonify({"success": True, "message": "Settings saved successfully."}), 200


@app.route("/api/admin/logout", methods=["POST"])
def api_admin_logout():
    session.pop("is_admin", None)
    return jsonify({"success": True})


@app.route("/admin")
def admin_page():
    if not session.get("is_admin"):
        return abort(403)
    return send_from_directory(TEMPLATES_DIR, "admin.html")


@app.route("/api/check-availability")
def api_check_availability():
    field = (request.args.get("field") or "").strip().lower()
    value = (request.args.get("value") or "").strip()

    if field not in ("nickname", "email"):
        return jsonify({"success": False, "error": "Invalid field."}), 400
    if not value:
        return jsonify({"success": False, "error": "Value is required."}), 400

    if field == "nickname":
        exists = db.get_user_by_nickname(value) is not None
        return jsonify(
            {
                "success": True,
                "field": "nickname",
                "available": not exists,
                "message": None if not exists else "Username already exists.",
            }
        )

    exists = db.get_user_by_email(value) is not None
    return jsonify(
        {
            "success": True,
            "field": "signUpEmail",
            "available": not exists,
            "message": None if not exists else "Email already exists.",
        }
    )


@app.route("/api/entries", methods=["GET"])
def api_entries_get():
    user_id_raw = (request.args.get("userId") or "").strip()
    if not user_id_raw.isdigit():
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    user_id = int(user_id_raw)
    user = db.get_user_by_id(user_id) if hasattr(db, "get_user_by_id") else None
    if not user:
        return jsonify({"success": False, "error": "User not found."}), 404
    rows = db.get_journal_entries_by_user(user_id)
    return jsonify({"success": True, "entries": [serialize_entry(r) for r in rows]}), 200


@app.route("/api/tags", methods=["GET"])
def api_tags_get():
    uid = _trigger_query_user_id()
    if uid is None or uid <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not db.get_user_by_id(uid):
        return jsonify({"success": False, "error": "User not found."}), 404
    rows = db.list_user_tags(uid)
    items = []
    for r in rows:
        if not r or not r.get("tag"):
            continue
        items.append(
            {
                "tag": r.get("tag"),
                "iconName": (r.get("icon_name") or "").strip().lower() or None,
            }
        )
    # Keep legacy `tags` for old clients while returning richer `tagItems`.
    tags = [x["tag"] for x in items]
    return jsonify({"success": True, "tags": tags, "tagItems": items}), 200


@app.route("/api/tags", methods=["POST"])
def api_tags_post():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    tag = (data.get("tag") or "").strip()
    icon_name = (data.get("iconName") or "").strip().lower()
    if not isinstance(user_id, int) or user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not tag:
        return jsonify({"success": False, "error": "Tag is required."}), 400
    if not db.get_user_by_id(user_id):
        return jsonify({"success": False, "error": "User not found."}), 404
    ok = db.add_user_tag(user_id=user_id, tag=tag, icon_name=icon_name or None)
    if not ok:
        return jsonify({"success": False, "error": "Could not save tag."}), 500
    return jsonify({"success": True}), 201


@app.route("/api/tags", methods=["DELETE"])
def api_tags_delete():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    tag = (data.get("tag") or "").strip()
    if not isinstance(user_id, int) or user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not tag:
        return jsonify({"success": False, "error": "Tag is required."}), 400
    if not db.get_user_by_id(user_id):
        return jsonify({"success": False, "error": "User not found."}), 404
    ok = db.delete_user_tag(user_id=user_id, tag=tag)
    if not ok:
        return jsonify({"success": False, "error": "Could not delete tag."}), 500
    return jsonify({"success": True}), 200


@app.route("/api/triggers/summary", methods=["GET"])
def api_triggers_summary():
    uid = _trigger_query_user_id()
    if uid is None or uid <= 0:
        return jsonify({"success": False, "error": "Valid user_id or userId is required."}), 400
    if not db.get_user_by_id(uid):
        return jsonify({"success": False, "error": "User not found."}), 404

    summary = db.get_tag_trigger_summary(uid, min_entries_per_bucket=3)
    stress_list = [x for x in (summary.get("topStressTriggers") or []) if x]
    happy_list = [x for x in (summary.get("topHappinessTriggers") or []) if x]
    stress_rank = [x for x in (summary.get("stressRanking") or []) if x]
    happy_rank = [x for x in (summary.get("happinessRanking") or []) if x]
    stress_counts = summary.get("stressCounts") or {}
    happy_counts = summary.get("happinessCounts") or {}

    # Primary tags (what we display as "Top ... trigger")
    stress_primary = stress_rank[0] if stress_rank else (stress_list[0] if stress_list else None)
    happy_primary = happy_rank[0] if happy_rank else (happy_list[0] if happy_list else None)

    stress = _to_title_case(stress_primary) if stress_primary else None
    happy = _to_title_case(happy_primary) if happy_primary else None
    stress_top_count = int(stress_counts.get(stress_primary) or 0) if stress_primary else 0
    happy_top_count = int(happy_counts.get(happy_primary) or 0) if happy_primary else 0

    stress_desc = (
        _pick_template(STRESS_TRIGGER_TEMPLATES, tag=stress_primary)
        if stress_primary
        else "Add more tagged stress-related entries to unlock your stress trigger insight."
    )
    happy_desc = (
        _pick_template(HAPPINESS_TRIGGER_TEMPLATES, tag=happy_primary)
        if happy_primary
        else "Add more tagged happy entries to unlock your positive trigger insight."
    )
    stress_justification = (
        _pick_count_template(STRESS_COUNT_JUSTIFICATION_TEMPLATES, tag=stress_primary, count=stress_top_count)
        if stress_primary and stress_top_count > 0
        else None
    )
    happiness_justification = (
        _pick_count_template(HAPPINESS_COUNT_JUSTIFICATION_TEMPLATES, tag=happy_primary, count=happy_top_count)
        if happy_primary and happy_top_count > 0
        else None
    )

    return jsonify(
        {
            "success": True,
            "topStressTrigger": stress,
            "topHappinessTrigger": happy,
            "topStressTriggers": [_to_title_case(x) for x in stress_list],
            "topHappinessTriggers": [_to_title_case(x) for x in happy_list],
            "stressDescription": stress_desc,
            "happinessDescription": happy_desc,
            "stressTopCount": stress_top_count,
            "happinessTopCount": happy_top_count,
            "stressJustification": stress_justification,
            "happinessJustification": happiness_justification,
            "stressTaggedEntries": int(summary.get("stressTaggedEntries") or 0),
            "happinessTaggedEntries": int(summary.get("happinessTaggedEntries") or 0),
            "minRequiredEntries": int(summary.get("minRequiredEntries") or 3),
        }
    ), 200


@app.route("/api/entries", methods=["POST"])
def api_entries_post():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    title = (data.get("title") or "").strip()
    entry_date_time_local = (data.get("entryDateTimeLocal") or "").strip()
    text = (data.get("text") or "").strip()
    tags = data.get("tags") or []
    image_urls = data.get("imageUrls") or []

    if not isinstance(user_id, int) or user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not text:
        return jsonify({"success": False, "error": "Entry text is required."}), 400
    if not isinstance(tags, list):
        tags = []
    if not isinstance(image_urls, list):
        image_urls = []
    clean_images = [str(x).strip() for x in image_urls if isinstance(x, str) and str(x).strip()]

    user = db.get_user_by_id(user_id) if hasattr(db, "get_user_by_id") else None
    if not user:
        return jsonify({"success": False, "error": "User not found."}), 404

    analysis = space_nlp.analyze(text)
    entry_dt_utc = _parse_ph_local_to_utc_iso(entry_date_time_local)
    if entry_dt_utc:
        try:
            parsed_dt = datetime.fromisoformat(entry_dt_utc.replace("Z", "+00:00"))
            if parsed_dt > datetime.now(timezone.utc):
                return jsonify({"success": False, "error": "Future entry date/time is not allowed."}), 400
        except Exception:
            return jsonify({"success": False, "error": "Invalid entry date/time."}), 400
    row = db.create_journal_entry(
        user_id=user_id,
        text_content=text,
        title=title,
        entry_datetime_utc=entry_dt_utc,
        tags_json=json.dumps(tags),
        image_urls_json=json.dumps(clean_images),
        sentiment_label=analysis["sentimentLabel"],
        sentiment_score=float(analysis["sentimentScore"]),
        emotion_label=analysis["emotionLabel"],
        emotion_score=float(analysis["emotionScore"]),
        all_probs_json=json.dumps(analysis.get("all_probs") or {}),
    )
    response_entry = serialize_entry(row)
    response_entry["secondaryMood"] = analysis.get("secondaryMood")
    return jsonify({"success": True, "entry": response_entry, "analysisEngine": analysis.get("engine", "hf-custom")}), 201


@app.route("/api/entries/analyze-text", methods=["POST"])
def api_entries_analyze_text():
    """Run mood/NLP on text only (no DB write). Used by entry view / modal re-run."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    text = (data.get("text") or "").strip()
    if not isinstance(user_id, int) or user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not text:
        return jsonify({"success": False, "error": "Entry text is required."}), 400
    if not db.get_user_by_id(user_id):
        return jsonify({"success": False, "error": "User not found."}), 404
    analysis = space_nlp.analyze(text)
    return (
        jsonify(
            {
                "success": True,
                "sentimentLabel": (analysis.get("sentimentLabel") or "neutral"),
                "sentimentScore": float(analysis.get("sentimentScore") or 0.5),
                "emotionLabel": (analysis.get("emotionLabel") or "neutral"),
                "emotionScore": float(analysis.get("emotionScore") or 0.5),
                "all_probs": analysis.get("all_probs") or {},
                "analysisEngine": analysis.get("engine", "hf-custom"),
            }
        ),
        200,
    )


@app.route("/api/entries/<int:entry_id>", methods=["GET"])
def api_entries_one(entry_id: int):
    user_id_raw = (request.args.get("userId") or "").strip()
    if not user_id_raw.isdigit():
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    user_id = int(user_id_raw)
    if not db.get_user_by_id(user_id):
        return jsonify({"success": False, "error": "User not found."}), 404
    row = db.get_journal_entry_by_id(entry_id, user_id)
    if not row:
        return jsonify({"success": False, "error": "Entry not found."}), 404
    return jsonify({"success": True, "entry": serialize_entry(row)}), 200


@app.route("/api/entries/<int:entry_id>", methods=["PATCH"])
def api_entries_patch(entry_id: int):
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    title = (data.get("title") or "").strip()
    text = (data.get("text") or "").strip()
    tags = data.get("tags") or []
    reanalyze = bool(data.get("reanalyze"))

    if not isinstance(user_id, int) or user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not text:
        return jsonify({"success": False, "error": "Entry text is required."}), 400
    if not isinstance(tags, list):
        tags = []
    clean_tags = [str(t).strip() for t in tags if str(t or "").strip()]
    if not db.get_user_by_id(user_id):
        return jsonify({"success": False, "error": "User not found."}), 404

    existing = db.get_journal_entry_by_id(entry_id, user_id)
    if not existing:
        return jsonify({"success": False, "error": "Entry not found."}), 404

    old_img_raw = existing.get("image_urls_json") or "[]"
    try:
        old_image_list = json.loads(old_img_raw) if isinstance(old_img_raw, str) else []
        if not isinstance(old_image_list, list):
            old_image_list = []
    except Exception:
        old_image_list = []

    if "imageUrls" in data:
        raw_images = data.get("imageUrls") or []
        if not isinstance(raw_images, list):
            raw_images = []
        clean_images = [str(x).strip() for x in raw_images if isinstance(x, str) and str(x).strip()]
        if len(clean_images) > 10:
            return jsonify({"success": False, "error": "At most 10 images per entry."}), 400
        _cleanup_removed_entry_uploads(old_image_list, clean_images)
        images_json = json.dumps(clean_images)
    else:
        clean_images = [str(x).strip() for x in old_image_list if isinstance(x, str) and str(x).strip()]
        images_json = json.dumps(clean_images)

    engine = None
    if reanalyze:
        analysis = space_nlp.analyze(text)
        sentiment_label = analysis["sentimentLabel"]
        sentiment_score = float(analysis["sentimentScore"])
        emotion_label = analysis["emotionLabel"]
        emotion_score = float(analysis["emotionScore"])
        all_probs_json = json.dumps(analysis.get("all_probs") or {})
        engine = analysis.get("engine", "hf-custom")
    else:
        sentiment_label = existing.get("sentiment_label") or "neutral"
        sentiment_score = float(existing.get("sentiment_score") or 0.5)
        emotion_label = existing.get("emotion_label") or "neutral"
        emotion_score = float(existing.get("emotion_score") or 0.5)
        all_probs_json = existing.get("all_probs_json") or "{}"

    row = db.update_journal_entry(
        entry_id,
        user_id,
        title=title,
        text_content=text,
        tags_json=json.dumps(clean_tags),
        sentiment_label=str(sentiment_label).lower()[:32],
        sentiment_score=sentiment_score,
        emotion_label=str(emotion_label).lower()[:32],
        emotion_score=emotion_score,
        all_probs_json=all_probs_json,
        image_urls_json=images_json,
    )
    if not row:
        return jsonify({"success": False, "error": "Could not update entry."}), 500
    response_entry = serialize_entry(row)
    if reanalyze:
        response_entry["secondaryMood"] = None
    return jsonify({"success": True, "entry": response_entry, "analysisEngine": engine if reanalyze else None}), 200


@app.route("/api/entries/<int:entry_id>", methods=["DELETE"])
def api_entries_delete(entry_id: int):
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    if not isinstance(user_id, int) or user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not db.get_user_by_id(user_id):
        return jsonify({"success": False, "error": "User not found."}), 404
    existing = db.get_journal_entry_by_id(entry_id, user_id)
    if not existing:
        return jsonify({"success": False, "error": "Entry not found."}), 404
    if not db.delete_journal_entry(entry_id, user_id):
        return jsonify({"success": False, "error": "Could not delete entry."}), 500
    return jsonify({"success": True}), 200


@app.route("/api/uploads/image", methods=["POST"])
def api_upload_image():
    user_id = request.form.get("userId", type=int)
    if not user_id or user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not db.get_user_by_id(user_id):
        return jsonify({"success": False, "error": "User not found."}), 404
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"success": False, "error": "Image file is required."}), 400
    if not _allowed_image_extension(file.filename):
        return jsonify({"success": False, "error": "Unsupported file type."}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    safe_name = f"entry_{user_id}_{uuid.uuid4().hex}{ext}"
    abs_path = os.path.join(UPLOADS_DIR, safe_name)
    file.save(abs_path)
    return jsonify({"success": True, "url": f"/uploads/{safe_name}"}), 201


@app.route("/uploads/<path:filename>")
def uploaded_images(filename):
    safe = os.path.normpath(filename)
    if ".." in safe or safe.startswith(os.sep):
        abort(404)
    if not _allowed_image_extension(safe):
        abort(404)
    return send_from_directory(UPLOADS_DIR, safe)


@app.route("/")
def index():
    return send_from_directory(TEMPLATES_DIR, "login.html")


@app.route("/index.html")
def legacy_index_page():
    return send_from_directory(TEMPLATES_DIR, "login.html")


@app.route("/<path:filename>")
def static_files(filename):
    if filename.startswith("api/"):
        abort(404)
    if filename == "admin.html" and not session.get("is_admin"):
        abort(403)

    safe = os.path.normpath(filename)
    if ".." in safe or safe.startswith(os.sep):
        abort(404)

    ext = os.path.splitext(safe)[1].lower()
    template_exts = {".html"}
    static_dir_map = {
        ".css": "css",
        ".js": "js",
        ".json": "img",
        ".woff": "css",
        ".woff2": "css",
        ".ttf": "css",
        ".eot": "css",
        ".png": "img",
        ".jpg": "img",
        ".jpeg": "img",
        ".gif": "img",
        ".webp": "img",
        ".svg": "img",
        ".ico": "img",
    }

    if ext in template_exts:
        full = os.path.join(TEMPLATES_DIR, safe)
        if os.path.abspath(full).startswith(os.path.abspath(TEMPLATES_DIR)) and os.path.isfile(full):
            return send_from_directory(TEMPLATES_DIR, safe)
        abort(404)

    subdir = static_dir_map.get(ext)
    if subdir:
        full = os.path.join(STATIC_DIR, subdir, safe)
        static_base = os.path.join(STATIC_DIR, subdir)
        if os.path.abspath(full).startswith(os.path.abspath(static_base)) and os.path.isfile(full):
            return send_from_directory(static_base, safe)

    # Fallback for remaining root-level files that are intentionally kept.
    full = os.path.join(BASE_DIR, safe)
    if os.path.abspath(full).startswith(os.path.abspath(BASE_DIR)) and os.path.isfile(full):
        return send_from_directory(BASE_DIR, safe)
    abort(404)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
