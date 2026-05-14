#!/usr/bin/env python3
"""
Clear TOTP (Google Authenticator) for a user who lost their app entry and cannot log in.

DiariCore has no self-service "lost authenticator" flow yet; this must be run by someone
with database access (e.g. Railway shell with DATABASE_URL, or local SQLite).

Usage
-----
PostgreSQL (Railway / production), after pulling env that includes DATABASE_URL::

    railway run python scripts/reset_user_totp.py --email you@example.com --yes

Local SQLite::

    python scripts/reset_user_totp.py --email you@example.com --yes

By numeric user id::

    python scripts/reset_user_totp.py --user-id 42 --yes

Raw SQL (PostgreSQL), if you prefer a SQL client::

    UPDATE users
    SET totp_secret = NULL, totp_enabled = FALSE,
        totp_setup_secret = NULL, totp_setup_expires = NULL
    WHERE lower(email) = lower('you@example.com');

    DELETE FROM login_totp_challenges WHERE user_id = (SELECT id FROM users WHERE lower(email) = lower('you@example.com'));

SQLite::

    UPDATE users
    SET totp_secret = NULL, totp_enabled = 0,
        totp_setup_secret = NULL, totp_setup_expires = NULL
    WHERE lower(email) = lower('you@example.com');

    DELETE FROM login_totp_challenges WHERE user_id = (SELECT id FROM users WHERE lower(email) = lower('you@example.com'));
"""

from __future__ import annotations

import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import db  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Disable 2FA for a DiariCore user (lost authenticator recovery)."
    )
    parser.add_argument("--email", help="Account email (matched case-insensitively)")
    parser.add_argument("--user-id", type=int, help="Numeric user id (alternative to --email)")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip interactive confirmation (required for non-interactive shells)",
    )
    args = parser.parse_args()

    if not args.email and not args.user_id:
        parser.error("Provide --email or --user-id")

    if args.user_id:
        user = db.get_user_by_id(args.user_id)
        if not user:
            print(f"No user with id={args.user_id}.", file=sys.stderr)
            return 1
        uid = int(user["id"])
        label = f"id={uid} ({user.get('email') or user.get('nickname') or '?'})"
    else:
        user = db.get_user_by_email(args.email)
        if not user:
            print(f"No user with email={args.email!r}.", file=sys.stderr)
            return 1
        uid = int(user["id"])
        label = f"{user.get('email')!r} (id={uid})"

    if not args.yes:
        try:
            line = input(f"Disable 2FA for {label}? Type YES to confirm: ")
        except EOFError:
            print("Non-interactive shell: pass --yes to confirm.", file=sys.stderr)
            return 2
        if line.strip() != "YES":
            print("Aborted.")
            return 0

    db.clear_login_totp_challenges_for_user(uid)
    ok = db.disable_totp_for_user(uid)
    if not ok:
        print("UPDATE did not affect a row (unexpected).", file=sys.stderr)
        return 1

    print(f"OK: 2FA cleared for {label}. They can sign in with password only, then set up authenticator again in Profile.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
