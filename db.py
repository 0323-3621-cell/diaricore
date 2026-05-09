"""
DiariCore database layer — same pattern as AnemoCheck: PostgreSQL on Railway
(via DATABASE_URL) or SQLite locally.
"""

import os
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
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS emotion_triggers (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    emotion VARCHAR(32) NOT NULL,
                    keyword VARCHAR(128) NOT NULL,
                    count INTEGER NOT NULL DEFAULT 1,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, emotion, keyword)
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_emotion_triggers_user
                ON emotion_triggers (user_id);
                """
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
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS emotion_triggers (
                    user_id INTEGER NOT NULL,
                    emotion TEXT NOT NULL,
                    keyword TEXT NOT NULL,
                    count INTEGER NOT NULL DEFAULT 1,
                    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, emotion, keyword),
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_emotion_triggers_user ON emotion_triggers (user_id);"
            )
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
):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                INSERT INTO journal_entries
                (user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, created_at
                """,
                (user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score),
            )
            row = cur.fetchone()
            conn.commit()
            return row_to_dict(row)

        cur.execute(
            """
            INSERT INTO journal_entries
            (user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score),
        )
        entry_id = cur.lastrowid
        conn.commit()
        cur.execute(
            """
            SELECT id, user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, created_at
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
                SELECT id, user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, created_at
                FROM journal_entries
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
        else:
            cur.execute(
                """
                SELECT id, user_id, text_content, tags_json, sentiment_label, sentiment_score, emotion_label, emotion_score, created_at
                FROM journal_entries
                WHERE user_id = ?
                ORDER BY datetime(created_at) DESC
                """,
                (user_id,),
            )
        return [row_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def upsert_emotion_triggers(*, user_id: int, emotion: str, keywords: list):
    """Increment counts for (user_id, emotion, keyword); insert new rows as needed."""
    emo = (emotion or "").strip().lower()
    if not emo or user_id <= 0:
        return 0
    seen = set()
    cleaned = []
    for raw in keywords or []:
        if raw is None:
            continue
        k = str(raw).strip().lower()
        if len(k) < 2:
            continue
        k = k[:128]
        if k in seen:
            continue
        seen.add(k)
        cleaned.append(k)
    if not cleaned:
        return 0

    conn = get_conn()
    cur = conn.cursor()
    n = 0
    try:
        if USE_POSTGRES:
            for kw in cleaned:
                cur.execute(
                    """
                    INSERT INTO emotion_triggers (user_id, emotion, keyword, count, last_updated)
                    VALUES (%s, %s, %s, 1, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, emotion, keyword) DO UPDATE SET
                        count = emotion_triggers.count + 1,
                        last_updated = CURRENT_TIMESTAMP
                    """,
                    (user_id, emo, kw),
                )
                n += cur.rowcount if cur.rowcount else 1
        else:
            for kw in cleaned:
                cur.execute(
                    """
                    INSERT INTO emotion_triggers (user_id, emotion, keyword, count, last_updated)
                    VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id, emotion, keyword) DO UPDATE SET
                        count = count + 1,
                        last_updated = CURRENT_TIMESTAMP
                    """,
                    (user_id, emo, kw),
                )
                n += 1
        conn.commit()
        return n
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_emotion_trigger_rows_for_user(user_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute(
                """
                SELECT emotion, keyword, count, last_updated
                FROM emotion_triggers
                WHERE user_id = %s
                ORDER BY emotion ASC, count DESC, keyword ASC
                """,
                (user_id,),
            )
        else:
            cur.execute(
                """
                SELECT emotion, keyword, count, last_updated
                FROM emotion_triggers
                WHERE user_id = ?
                ORDER BY emotion ASC, count DESC, keyword ASC
                """,
                (user_id,),
            )
        return [row_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_top_triggers_by_emotion(user_id: int, per_emotion: int = 3):
    """Return list of {emotion, keywords: [str, ...]} for emotions that have data."""
    rows = get_emotion_trigger_rows_for_user(user_id)
    grouped = {}
    for r in rows:
        emo = (r.get("emotion") or "").lower()
        if not emo:
            continue
        grouped.setdefault(emo, []).append(r)
    out = []
    for emo in sorted(grouped.keys()):
        kws = [x["keyword"] for x in grouped[emo][:per_emotion]]
        if kws:
            out.append({"emotion": emo, "keywords": kws})
    return out
