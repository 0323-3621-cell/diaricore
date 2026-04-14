"""
DiariCore — Flask app serving static HTML/CSS/JS and JSON API for auth.
Deploy on Railway with PostgreSQL (DATABASE_URL). Local dev uses SQLite.
"""

import os
from datetime import date, datetime

from flask import Flask, jsonify, request, send_from_directory, abort

import db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False


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

    if not nickname or len(nickname) < 2:
        return jsonify({"success": False, "field": "nickname", "error": "Nickname is required."}), 400
    if not email:
        return jsonify({"success": False, "field": "signUpEmail", "error": "Email is required."}), 400
    if not password or len(password) < 6:
        return jsonify({"success": False, "field": "signUpPassword", "error": "Password must be at least 6 characters."}), 400
    if not first_name or len(first_name) < 2:
        return jsonify({"success": False, "field": "firstName", "error": "First name is required."}), 400
    if not last_name or len(last_name) < 2:
        return jsonify({"success": False, "field": "lastName", "error": "Last name is required."}), 400
    if not gender:
        return jsonify({"success": False, "field": "gender", "error": "Gender is required."}), 400
    if not birthday:
        return jsonify({"success": False, "field": "birthday", "error": "Date of birth is required."}), 400

    result = db.create_user(
        nickname=nickname,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        gender=gender,
        birthday=birthday,
    )
    if not result[0]:
        _, field_id, message = result
        if field_id:
            return jsonify({"success": False, "field": field_id, "error": message}), 409
        return jsonify({"success": False, "error": message}), 400

    user_row = result[1]
    return jsonify({"success": True, "user": serialize_user(user_row)}), 201


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"success": False, "error": "Email and password are required."}), 400

    ok, result = db.verify_login(email, password)
    if not ok:
        return jsonify({"success": False, "error": result}), 401

    return jsonify({"success": True, "user": serialize_user(result)}), 200


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    if filename.startswith("api/"):
        abort(404)
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
