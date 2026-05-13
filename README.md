# Django login app

A small Django application for testing sign-in, registration, and login-attempt logging. It includes a public login page, account creation, a protected page that lists every login attempt, and optional deployment to Vercel with a Neon Postgres database.

## Features

- **Sign in** with username and password; failed attempts show a red error on the login page.
- **Create account** from the login page; usernames must be unique (case-insensitive).
- **Login attempts** table (time in UTC, username, success or failed) after a successful sign-in.
- **Log out** from the attempts page.
- **Django admin** at `/admin/` for managing users and viewing `LoginAttempt` records.

Successful sign-ins and the first session after registration are recorded in the database.

## Routes

| Path | Description |
|------|-------------|
| `/` | Login |
| `/register/` | Create account |
| `/attempts/` | Login attempts (requires authentication) |
| `/logout/` | End session (POST) |
| `/admin/` | Django admin |

## Local development

Requirements: Python 3.10+ (3.9 may work for local dev; Vercel uses 3.12).

```bash
cd django-login-app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Open http://127.0.0.1:8000/. Without `DATABASE_URL`, the app uses SQLite (`db.sqlite3` in the project directory).

## Production on Vercel

The project is configured for [Vercel’s Django support](https://vercel.com/docs/frameworks/full-stack/django): WSGI entrypoint in `pyproject.toml`, build script `build_vercel.py` (runs migrations), and static files via WhiteNoise.

1. Link a **Neon Postgres** database in the Vercel project and ensure a Postgres connection string is available at build and runtime.
2. Set **environment variables** (Production, and Preview if you use preview deploys):
   - `DJANGO_SECRET_KEY` — long random string (e.g. `openssl rand -hex 32`)
   - `DATABASE_URL` — or Neon-injected names such as `POSTGRES_URL` / `DATABASE_URL_POSTGRES_PRISMA_URL` (see `config/settings.py`)
3. Deploy with the Vercel CLI or by connecting this repository to Vercel.
4. Create a user against the **production** database (not local SQLite), for example after `vercel env pull`:

   ```bash
   export DATABASE_URL="…"
   export DJANGO_SECRET_KEY="…"
   python manage.py createsuperuser
   ```

**Note:** SQLite in the deployment bundle is read-only on Vercel; production must use Postgres.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DJANGO_SECRET_KEY` | Required on Vercel; signs sessions and cookies |
| `DATABASE_URL` / Neon `POSTGRES_*` vars | Postgres connection (required on Vercel) |
| `DJANGO_DEBUG` | Set to `true` for local debug mode (default off in production) |
| `DJANGO_ALLOWED_HOSTS` | Optional comma-separated extra hosts |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Optional comma-separated origins for CSRF |

Vercel sets `VERCEL`, `VERCEL_URL`, and related values automatically.

## Project layout

- `config/` — Django settings and root URLs
- `accounts/` — views, `LoginAttempt` model, templates
- `build_vercel.py` — Vercel build: verify Postgres URL, run migrations
- `pyproject.toml` — Python dependencies and Vercel entrypoint

## License

Use and modify as needed for testing and learning.
