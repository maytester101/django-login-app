#!/usr/bin/env python
"""Vercel build: require a real Postgres URL, then migrate (avoid silent SQLite migrate)."""
import os
import subprocess
import sys


def _has_db_url() -> bool:
    for key in (
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_PRISMA_URL",
        "NEON_DATABASE_URL",
        "DATABASE_URL_POSTGRES_PRISMA_URL",
        "DATABASE_URL_POSTGRES_URL",
        "DATABASE_URL_POSTGRES_URL_NON_POOLING",
    ):
        v = os.environ.get(key)
        if not v or not v.strip():
            continue
        s = v.strip().lower()
        if "..." in s and s.startswith("postgres"):
            continue
        if s in ("postgresql://...", "postgres://..."):
            continue
        return True
    return False


def main() -> int:
    if os.environ.get("VERCEL") and not _has_db_url():
        print(
            "Build error: No Postgres URL for this build. Link Neon to the project and "
            "ensure DATABASE_URL or POSTGRES_URL is available for Production builds "
            "(Vercel → Settings → Environment Variables → enable for Builds), then redeploy.",
            file=sys.stderr,
        )
        return 1
    subprocess.check_call([sys.executable, "manage.py", "migrate", "--noinput"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
