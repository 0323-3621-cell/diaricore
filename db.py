"""
DiariCore database layer — same pattern as AnemoCheck: PostgreSQL on Railway
(via DATABASE_URL) or SQLite locally.
"""

import os
import json
import sqlite3
from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash

USE_POSTGRES = bool(os.environ.get("DATABASE_URL"))
SQLITE_PATH = os.environ.get("DATABASE_PATH", "diaricore.db")


def _connect_postgres():
    import psycopg2
    from psycopg2.extras import RealDictCursor

    url = os.environ["DATABASE_URL"]
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return psycopg2.connect(url, cursor_factory=RealDictCursor)


def _connect_sqlite():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_conn():
    if USE_POSTGRES:
        return _connect_postgres()
    return _connect_sqlite()


def _ensure_journal_all_probs_column(cur):
    """Add all_probs_json to journal_entries on existing deployments."""
    if USE_POSTGRES:
        cur.execute("ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS all_probs_json TEXT")
    else:
        cur.execute("PRAGMA table_info(journal_entries)")
        cols = [r[1] for r in cur.fetchall()]
        if "all_probs_json" not in cols:
            cur.execute("ALTER TABLE journal_entries ADD COLUMN all_probs_json TEXT")


def _ensure_user_tags_icon_column(cur):
    """Add icon_name to user_tags on existing deployments."""
    if USE_POSTGRES:
        cur.execute("ALTER TABLE user_tags ADD COLUMN IF NOT EXISTS icon_name TEXT")
    else:
        cur.execute("PRAGMA table_info(user_tags)")
        cols = [r[1] for r in cur.fetchall()]
        if "icon_name" not in cols:
            cur.execute("ALTER TABLE user_tags ADD COLUMN icon_name TEXT")


def row_to_dict(row):
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    return dict(row)


def init_db():
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    nickname VARCHAR(64) NOT NULL UNIQUE,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    password_hash VARCHAR(256) NOT NULL,
                    first_name VARCHAR(64),
                    last_name VARCHAR(64),
                    gender VARCHAR(32),
                    birthday DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS pending_registrations (
                    email VARCHAR(255) PRIMARY KEY,
                    nickname VARCHAR(64) NOT NULL,
                    password_hash VARCHAR(256) NOT NULL,
                    first_name VARCHAR(64),
                    last_name VARCHAR(64),
                    gender VARCHAR(32),
                    birthday DATE,
                    otp_code VARCHAR(6) NOT NULL,
                    otp_expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS password_resets (
                    email VARCHAR(255) PRIMARY KEY,
                    reset_code VARCHAR(6) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS journal_entries (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    text_content TEXT NOT NULL,
                    tags_json TEXT,
                    sentiment_label VARCHAR(32) NOT NULL,
                    sentiment_score REAL NOT NULL,
                    emotion_label VARCHAR(32) NOT NULL,
                    emotion_score REAL NOT NULL,
                    all_probs_json TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_tags (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    tag VARCHAR(128) NOT NULL,
                    icon_name TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, tag)
                );
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags (user_id);"
            )
        else:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nickname TEXT NOT NULL UNIQUE,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    first_name TEXT,
                    last_name TEXT,
                    gender TEXT,
                    birthday TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS pending_registrations (
                    email TEXT PRIMARY KEY,
                    nickname TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    first_name TEXT,
                    last_name TEXT,
                    gender TEXT,
                    birthday TEXT,
                    otp_code TEXT NOT NULL,
                    otp_expires_at TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS password_resets (
                    email TEXT PRIMARY KEY,
                    reset_code TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS journal_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    text_content TEXT NOT NULL,
                    tags_json TEXT,
                    sentiment_label TEXT NOT NULL,
                    sentiment_score REAL NOT NULL,
                    emotion_label TEXT NOT NULL,
                    emotion_score REAL NOT NULL,
                    all_probs_json TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_tags (
                    user_id INTEGER NOT NULL,
                    tag TEXT NOT NULL,
                    icon_name TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, tag),
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags (user_id);")
        _ensure_journal_all_probs_column(cur)
        _ensure_user_tags_icon_column(cur)
        if USE_POSTGRES:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS system_settings (
                    key VARCHAR(128) PRIMARY KEY,
                    value TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
        else:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS system_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
        conn.commit()
    finally:
        conn.close()


def _normalize_tag_value(tag: str) -> str:
    s = str(tag or "").strip()
    s = " ".join(s.split())
    return s[:128]


def list_user_tags(user_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                SELECT tag, icon_name, created_at
                FROM user_tags
                WHERE user_id = %s
                ORDER BY created_at ASC, tag ASC
                """,
                (user_id,),
            )
        else:
            cur.execute(
                """
                SELECT tag, icon_name, created_at
                FROM user_tags
                WHERE user_id = ?
                ORDER BY datetime(created_at) ASC, tag ASC
                """,
                (user_id,),
            )
        return [row_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def add_user_tag(*, user_id: int, tag: str, icon_name: str | None = None) -> bool:
    t = _normalize_tag_value(tag)
    icon = str(icon_name or "").strip().lower()[:96] or None
    if not t or user_id <= 0:
        return False
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                INSERT INTO user_tags (user_id, tag, icon_name)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id, tag) DO UPDATE SET
                    icon_name = COALESCE(EXCLUDED.icon_name, user_tags.icon_name)
                """,
                (user_id, t, icon),
            )
        else:
            cur.execute(
                """
                INSERT INTO user_tags (user_id, tag, icon_name, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, tag) DO UPDATE SET
                    icon_name = COALESCE(excluded.icon_name, user_tags.icon_name)
                """,
                (user_id, t, icon),
            )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def get_user_by_email(email: str):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                "SELECT id, nickname, email, password_hash, first_name, last_name, gender, birthday, created_at FROM users WHERE email = %s",
                (email.lower().strip(),),
            )
        else:
            cur.execute(
                "SELECT id, nickname, email, password_hash, first_name, last_name, gender, birthday, created_at FROM users WHERE lower(email) = ?",
                (email.lower().strip(),),
            )
        return row_to_dict(cur.fetchone())
    finally:
        conn.close()


def get_user_by_nickname(nickname: str):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                "SELECT id, nickname, email, password_hash, first_name, last_name, gender, birthday, created_at FROM users WHERE lower(nickname) = %s",
                (nickname.lower().strip(),),
            )
        else:
            cur.execute(
                "SELECT id, nickname, email, password_hash, first_name, last_name, gender, birthday, created_at FROM users WHERE lower(nickname) = ?",
                (nickname.lower().strip(),),
            )
        return row_to_dict(cur.fetchone())
    finally:
        conn.close()


def get_user_by_username(username: str):
    return get_user_by_nickname(username)


def get_user_by_id(user_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                "SELECT id, nickname, email, password_hash, first_name, last_name, gender, birthday, created_at FROM users WHERE id = %s",
                (user_id,),
            )
        else:
            cur.execute(
                "SELECT id, nickname, email, password_hash, first_name, last_name, gender, birthday, created_at FROM users WHERE id = ?",
                (user_id,),
            )
        return row_to_dict(cur.fetchone())
    finally:
        conn.close()


def create_user(
    nickname: str,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    gender: str,
    birthday: str,
):
    """Returns (True, user_dict) or (False, field_id, error_message)."""
    password_hash = generate_password_hash(password)
    email_norm = email.lower().strip()
    nickname_norm = nickname.strip()

    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                INSERT INTO users (nickname, email, password_hash, first_name, last_name, gender, birthday)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, nickname, email, first_name, last_name, gender, birthday, created_at
                """,
                (nickname_norm, email_norm, password_hash, first_name.strip(), last_name.strip(), gender, birthday),
            )
            row = cur.fetchone()
            conn.commit()
            u = row_to_dict(row)
            u.pop("password_hash", None)
            return True, u
        else:
            cur.execute(
                """
                INSERT INTO users (nickname, email, password_hash, first_name, last_name, gender, birthday)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    nickname_norm,
                    email_norm,
                    password_hash,
                    first_name.strip(),
                    last_name.strip(),
                    gender,
                    birthday,
                ),
            )
            uid = cur.lastrowid
            conn.commit()
            cur.execute(
                "SELECT id, nickname, email, first_name, last_name, gender, birthday, created_at FROM users WHERE id = ?",
                (uid,),
            )
            u = row_to_dict(cur.fetchone())
            return True, u
    except Exception as e:
        conn.rollback()
        err = str(e).lower()
        if any(s in err for s in ("unique", "duplicate", "already exists")):
            if "nickname" in err:
                return False, "nickname", "Username already exists."
            if "email" in err:
                return False, "signUpEmail", "Email already exists."
        return False, None, "Could not create account. Please try again."
    finally:
        conn.close()


def store_pending_registration(
    *,
    nickname: str,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    gender: str,
    birthday: str,
    otp_code: str,
    otp_expires_at,
):
    email_norm = email.lower().strip()
    nickname_norm = nickname.strip()
    password_hash = generate_password_hash(password)

    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                INSERT INTO pending_registrations
                (email, nickname, password_hash, first_name, last_name, gender, birthday, otp_code, otp_expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                    nickname = EXCLUDED.nickname,
                    password_hash = EXCLUDED.password_hash,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    gender = EXCLUDED.gender,
                    birthday = EXCLUDED.birthday,
                    otp_code = EXCLUDED.otp_code,
                    otp_expires_at = EXCLUDED.otp_expires_at,
                    created_at = CURRENT_TIMESTAMP
                """,
                (email_norm, nickname_norm, password_hash, first_name.strip(), last_name.strip(), gender, birthday, otp_code, otp_expires_at),
            )
        else:
            cur.execute(
                """
                INSERT INTO pending_registrations
                (email, nickname, password_hash, first_name, last_name, gender, birthday, otp_code, otp_expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(email) DO UPDATE SET
                    nickname = excluded.nickname,
                    password_hash = excluded.password_hash,
                    first_name = excluded.first_name,
                    last_name = excluded.last_name,
                    gender = excluded.gender,
                    birthday = excluded.birthday,
                    otp_code = excluded.otp_code,
                    otp_expires_at = excluded.otp_expires_at,
                    created_at = CURRENT_TIMESTAMP
                """,
                (
                    email_norm,
                    nickname_norm,
                    password_hash,
                    first_name.strip(),
                    last_name.strip(),
                    gender,
                    birthday,
                    otp_code,
                    str(otp_expires_at),
                ),
            )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def get_pending_registration(email: str):
    email_norm = email.lower().strip()
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute("SELECT * FROM pending_registrations WHERE email = %s", (email_norm,))
        else:
            cur.execute("SELECT * FROM pending_registrations WHERE lower(email) = ?", (email_norm,))
        return row_to_dict(cur.fetchone())
    finally:
        conn.close()


def update_pending_otp(email: str, otp_code: str, otp_expires_at):
    email_norm = email.lower().strip()
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                "UPDATE pending_registrations SET otp_code = %s, otp_expires_at = %s WHERE email = %s",
                (otp_code, otp_expires_at, email_norm),
            )
        else:
            cur.execute(
                "UPDATE pending_registrations SET otp_code = ?, otp_expires_at = ? WHERE lower(email) = ?",
                (otp_code, str(otp_expires_at), email_norm),
            )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_pending_registration(email: str):
    email_norm = email.lower().strip()
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute("DELETE FROM pending_registrations WHERE email = %s", (email_norm,))
        else:
            cur.execute("DELETE FROM pending_registrations WHERE lower(email) = ?", (email_norm,))
        conn.commit()
    finally:
        conn.close()


def create_user_from_pending(pending: dict):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                INSERT INTO users (nickname, email, password_hash, first_name, last_name, gender, birthday)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, nickname, email, first_name, last_name, gender, birthday, created_at
                """,
                (
                    (pending.get("nickname") or "").strip(),
                    (pending.get("email") or "").lower().strip(),
                    pending.get("password_hash"),
                    (pending.get("first_name") or "").strip(),
                    (pending.get("last_name") or "").strip(),
                    pending.get("gender"),
                    pending.get("birthday"),
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return True, row_to_dict(row)
        cur.execute(
            """
            INSERT INTO users (nickname, email, password_hash, first_name, last_name, gender, birthday)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (pending.get("nickname") or "").strip(),
                (pending.get("email") or "").lower().strip(),
                pending.get("password_hash"),
                (pending.get("first_name") or "").strip(),
                (pending.get("last_name") or "").strip(),
                pending.get("gender"),
                pending.get("birthday"),
            ),
        )
        uid = cur.lastrowid
        conn.commit()
        cur.execute(
            "SELECT id, nickname, email, first_name, last_name, gender, birthday, created_at FROM users WHERE id = ?",
            (uid,),
        )
        return True, row_to_dict(cur.fetchone())
    except Exception as e:
        conn.rollback()
        err = str(e).lower()
        if "nickname" in err:
            return False, ("nickname", "Username already exists.")
        if "email" in err:
            return False, ("signUpEmail", "Email already exists.")
        return False, (None, "Could not create account. Please try again.")
    finally:
        conn.close()


def get_system_setting(key: str, default=None):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute("SELECT value FROM system_settings WHERE key = %s", (key,))
        else:
            cur.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
        row = cur.fetchone()
        if not row:
            return default
        if isinstance(row, dict):
            return row.get("value", default)
        return row[0] if row[0] is not None else default
    finally:
        conn.close()


def set_system_setting(key: str, value: str):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                INSERT INTO system_settings (key, value, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, value),
            )
        else:
            cur.execute(
                """
                INSERT INTO system_settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, value),
            )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def verify_login(identifier: str, password: str):
    """Returns (True, user_dict) or (False, error_message)."""
    raw = (identifier or "").strip()
    if not raw:
        return False, "Invalid username or password."

    user = None
    if "@" in raw:
        user = get_user_by_email(raw)
    if not user:
        user = get_user_by_username(raw)
    if not user:
        return False, "Invalid username or password."
    if not check_password_hash(user["password_hash"], password):
        return False, "Invalid username or password."
    out = {k: v for k, v in user.items() if k != "password_hash"}
    return True, out


def store_password_reset(email: str, reset_code: str, expires_at):
    email_norm = (email or "").strip().lower()
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                INSERT INTO password_resets (email, reset_code, expires_at, created_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (email) DO UPDATE SET
                    reset_code = EXCLUDED.reset_code,
                    expires_at = EXCLUDED.expires_at,
                    created_at = CURRENT_TIMESTAMP
                """,
                (email_norm, reset_code, expires_at),
            )
        else:
            cur.execute(
                """
                INSERT INTO password_resets (email, reset_code, expires_at, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(email) DO UPDATE SET
                    reset_code = excluded.reset_code,
                    expires_at = excluded.expires_at,
                    created_at = CURRENT_TIMESTAMP
                """,
                (email_norm, reset_code, str(expires_at)),
            )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def get_password_reset(email: str):
    email_norm = (email or "").strip().lower()
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute("SELECT * FROM password_resets WHERE email = %s", (email_norm,))
        else:
            cur.execute("SELECT * FROM password_resets WHERE lower(email) = ?", (email_norm,))
        return row_to_dict(cur.fetchone())
    finally:
        conn.close()


def delete_password_reset(email: str):
    email_norm = (email or "").strip().lower()
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute("DELETE FROM password_resets WHERE email = %s", (email_norm,))
        else:
            cur.execute("DELETE FROM password_resets WHERE lower(email) = ?", (email_norm,))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def update_user_password_by_email(email: str, password: str):
    email_norm = (email or "").strip().lower()
    password_hash = generate_password_hash(password)
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE email = %s",
                (password_hash, email_norm),
            )
        else:
            cur.execute(
                "UPDATE users SET password_hash = ? WHERE lower(email) = ?",
                (password_hash, email_norm),
            )
        conn.commit()
        return cur.rowcount > 0
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def create_journal_entry(
    *,
    user_id: int,
    text_content: str,
    tags_json: str,
    sentiment_label: str,
    sentiment_score: float,
    emotion_label: str,
    emotion_score: float,
    all_probs_json: str | None = None,
):
    probs = all_probs_json if all_probs_json is not None else "{}"
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                INSERT INTO journal_entries
                (user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, all_probs_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, all_probs_json, created_at
                """,
                (user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, probs),
            )
            row = cur.fetchone()
            conn.commit()
            return row_to_dict(row)

        cur.execute(
            """
            INSERT INTO journal_entries
            (user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, all_probs_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, probs),
        )
        entry_id = cur.lastrowid
        conn.commit()
        cur.execute(
            """
            SELECT id, user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, all_probs_json, created_at
            FROM journal_entries
            WHERE id = ?
            """,
            (entry_id,),
        )
        return row_to_dict(cur.fetchone())
    finally:
        conn.close()


def get_journal_entries_by_user(user_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                SELECT id, user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, all_probs_json, created_at
                FROM journal_entries
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
        else:
            cur.execute(
                """
                SELECT id, user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, all_probs_json, created_at
                FROM journal_entries
                WHERE user_id = ?
                ORDER BY datetime(created_at) DESC
                """,
                (user_id,),
            )
        return [row_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_tag_trigger_summary(user_id: int, min_entries_per_bucket: int = 3):
    """
    Build top tag triggers from saved entry tags (not NLP keywords).

    Buckets:
      - stress: anxious + sad + angry
      - happiness: happy
    """
    rows = get_journal_entries_by_user(user_id)
    min_entries = max(1, int(min_entries_per_bucket or 1))

    def _norm_tags(tags_raw):
        try:
            parsed = json.loads(tags_raw or "[]")
        except Exception:
            parsed = []
        if not isinstance(parsed, list):
            return []
        out = []
        seen = set()
        for t in parsed:
            s = str(t or "").strip().lower()
            if not s:
                continue
            if s in seen:
                continue
            seen.add(s)
            out.append(s)
        return out

    stress_emotions = {"anxious", "sad", "angry"}
    happy_emotions = {"happy"}
    stress_counts = {}
    happy_counts = {}
    stress_entries_with_tags = 0
    happy_entries_with_tags = 0

    for r in rows:
        emo = str(r.get("emotion_label") or "").strip().lower()
        tags = _norm_tags(r.get("tags_json"))
        if not tags:
            continue
        if emo in stress_emotions:
            stress_entries_with_tags += 1
            for tag in tags:
                stress_counts[tag] = stress_counts.get(tag, 0) + 1
        if emo in happy_emotions:
            happy_entries_with_tags += 1
            for tag in tags:
                happy_counts[tag] = happy_counts.get(tag, 0) + 1

    def _pick_top_with_ties(counter, max_items: int = 2):
        if not counter:
            return []
        ordered = sorted(counter.items(), key=lambda x: (-x[1], x[0]))
        top_count = ordered[0][1]
        ties = [tag for tag, cnt in ordered if cnt == top_count]
        return ties[: max(1, int(max_items or 1))]

    def _rank_all(counter):
        if not counter:
            return []
        return [tag for tag, _cnt in sorted(counter.items(), key=lambda x: (-x[1], x[0]))]

    top_stress = _pick_top_with_ties(stress_counts, 2) if stress_entries_with_tags >= min_entries else []
    top_happy = _pick_top_with_ties(happy_counts, 2) if happy_entries_with_tags >= min_entries else []
    return {
        "topStressTriggers": top_stress,
        "topHappinessTriggers": top_happy,
        "stressRanking": _rank_all(stress_counts) if stress_entries_with_tags >= min_entries else [],
        "happinessRanking": _rank_all(happy_counts) if happy_entries_with_tags >= min_entries else [],
        "stressCounts": stress_counts if stress_entries_with_tags >= min_entries else {},
        "happinessCounts": happy_counts if happy_entries_with_tags >= min_entries else {},
        "stressTaggedEntries": stress_entries_with_tags,
        "happinessTaggedEntries": happy_entries_with_tags,
        "minRequiredEntries": min_entries,
    }
