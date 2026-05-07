"""
DiariCore — Flask app serving static HTML/CSS/JS and JSON API for auth.
Deploy on Railway with PostgreSQL (DATABASE_URL). Local dev uses SQLite.
"""

import os
import json
import random
import urllib.request
from datetime import date, datetime, timedelta, timezone

from flask import Flask, jsonify, request, send_from_directory, abort, session
from werkzeug.security import check_password_hash

import db
import hf_nlp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

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


def _serialize_value(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def serialize_user(row):
    if not row:
        return None
    out = {}
    for k, v in row.items():
        if k == "password_hash":
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
    }
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
    date_value = created_at.isoformat() if isinstance(created_at, (datetime, date)) else str(created_at)
    emotion_label = (row.get("emotion_label") or "neutral").lower()
    return {
        "id": row.get("id"),
        "userId": row.get("user_id"),
        "text": row.get("text_content") or "",
        "tags": tags,
        "date": date_value,
        "sentimentLabel": (row.get("sentiment_label") or "neutral").lower(),
        "sentimentScore": float(row.get("sentiment_score") or 0.5),
        "emotionLabel": emotion_label,
        "emotionScore": float(row.get("emotion_score") or 0.5),
        # Keep existing UI compatibility
        "feeling": emotion_label,
    }


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
    return jsonify({"success": True, "user": serialize_user(result)}), 200


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
    return send_from_directory(BASE_DIR, "admin.html")


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


@app.route("/api/entries", methods=["POST"])
def api_entries_post():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    text = (data.get("text") or "").strip()
    tags = data.get("tags") or []

    if not isinstance(user_id, int) or user_id <= 0:
        return jsonify({"success": False, "error": "Valid userId is required."}), 400
    if not text:
        return jsonify({"success": False, "error": "Entry text is required."}), 400
    if not isinstance(tags, list):
        tags = []

    user = db.get_user_by_id(user_id) if hasattr(db, "get_user_by_id") else None
    if not user:
        return jsonify({"success": False, "error": "User not found."}), 404

    analysis = hf_nlp.analyze(text)
    row = db.create_journal_entry(
        user_id=user_id,
        text_content=text,
        tags_json=json.dumps(tags),
        sentiment_label=analysis["sentimentLabel"],
        sentiment_score=float(analysis["sentimentScore"]),
        emotion_label=analysis["emotionLabel"],
        emotion_score=float(analysis["emotionScore"]),
    )
    return jsonify({"success": True, "entry": serialize_entry(row), "analysisEngine": analysis.get("engine", "hf-custom")}), 201


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "login.html")


@app.route("/index.html")
def legacy_index_page():
    return send_from_directory(BASE_DIR, "login.html")


@app.route("/<path:filename>")
def static_files(filename):
    if filename.startswith("api/"):
        abort(404)
    if filename == "admin.html" and not session.get("is_admin"):
        abort(403)
    safe = os.path.normpath(filename)
    if ".." in safe or safe.startswith(os.sep):
        abort(404)
    full = os.path.join(BASE_DIR, safe)
    if not os.path.abspath(full).startswith(os.path.abspath(BASE_DIR)):
        abort(404)
    if os.path.isfile(full):
        return send_from_directory(BASE_DIR, safe)
    abort(404)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
