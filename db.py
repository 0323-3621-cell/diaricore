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
                return False, "nickname", "Nickname already exists."
            if "email" in err:
                return False, "signUpEmail", "Email already exists."
        return False, None, "Could not create account. Please try again."
    finally:
        conn.close()


def verify_login(email: str, password: str):
    """Returns (True, user_dict) or (False, error_message)."""
    user = get_user_by_email(email)
    if not user:
        return False, "Invalid email or password."
    if not check_password_hash(user["password_hash"], password):
        return False, "Invalid email or password."
    out = {k: v for k, v in user.items() if k != "password_hash"}
    return True, out
