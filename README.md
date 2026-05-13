# Django login app

A small Django application for testing sign-in, registration, and login-attempt logging. The **Next.js** app in `frontend/` is the UI; **Django** serves JSON under `/api/` and uses Neon Postgres on Vercel.

## Features

- **Sign in** with username and password; failed attempts show a red error on the login page.
- **Create account** from the login page; usernames must be unique (case-insensitive).
- **Login attempts** table (time in UTC, username, success or failed) after a successful sign-in.
- **Log out** from the attempts page.
- **Django admin** at `/admin/` for managing users and viewing `LoginAttempt` records.

Successful sign-ins and the first session after registration are recorded in the database.

## Next.js frontend

| Path | Description |
|------|-------------|
| `/` | Sign in |
| `/register` | Create account |
| `/attempts` | Login attempts (requires authentication) |

Run the API and UI together locally:

```bash
# Terminal 1 — Django API
cd django-login-app
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000

# Terminal 2 — Next.js
cd django-login-app/frontend
npm install
npm run dev
```

Open http://localhost:3000. Next.js rewrites `/api/*` to `http://127.0.0.1:8000` (override with `API_BACKEND_URL`).

## Django API

| Path | Method | Description |
|------|--------|-------------|
| `/api/csrf/` | GET | CSRF cookie for browser clients |
| `/api/login/` | POST | Sign in |
| `/api/register/` | POST | Create account |
| `/api/logout/` | POST | End session |
| `/api/me/` | GET | Current user |
| `/api/attempts/` | GET | Login attempts |

Legacy server-rendered HTML routes under `/`, `/register/`, and `/attempts/` remain for now.

## Legacy Django HTML routes

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
| `FRONTEND_ORIGIN` | Next.js origin for CORS/CSRF (e.g. `http://localhost:3000` or your Vercel frontend URL) |
| `CORS_ALLOWED_ORIGINS` | Optional extra CORS origins (comma-separated) |
| `API_BACKEND_URL` | Next.js rewrite target for `/api/*` (default `http://127.0.0.1:8000`) |

Vercel sets `VERCEL`, `VERCEL_URL`, and related values automatically.

## Project layout

- `config/` — Django settings and root URLs
- `accounts/` — views, API, `LoginAttempt` model, templates
- `frontend/` — Next.js UI
- `build_vercel.py` — Vercel build: verify Postgres URL, run migrations
- `pyproject.toml` — Python dependencies and Vercel entrypoint

## License

Use and modify as needed for testing and learning.
