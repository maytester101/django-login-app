# Django login app

A small full-stack app for testing sign-in, registration, and login-attempt logging. The **Next.js** app in `frontend/` is the user interface. **Django** exposes a JSON API under `/api/` and stores data in **Neon Postgres** on Vercel.

## Features

- **Sign in** with username and password; failed attempts show a red error on the login page.
- **Create account** from the login page; usernames must be unique (case-insensitive).
- **Login attempts** table (time in UTC, username, success or failed) after a successful sign-in.
- **Log out** from the attempts page.
- **Django admin** on the API host at `/admin/` for managing users and viewing `LoginAttempt` records.

Successful sign-ins and the first session after registration are recorded in the database.

## Production URLs

| URL | Role |
|-----|------|
| https://django-login-app.vercel.app | Next.js UI (`/`, `/register`, `/attempts`) |
| https://django-login-api.vercel.app | Django API and admin |
| https://django-login-web.vercel.app | Alternate hostname for the Next.js deployment |

The browser UI calls the API host directly in production (session cookies and CSRF). Locally, Next.js proxies `/api/*` to Django on port 8000.

## Next.js frontend

| Path | Description |
|------|-------------|
| `/` | Sign in |
| `/register` | Create account |
| `/attempts` | Login attempts (requires authentication) |

## Django API

| Path | Method | Description |
|------|--------|-------------|
| `/api/csrf/` | GET | CSRF token for browser clients |
| `/api/login/` | POST | Sign in |
| `/api/register/` | POST | Create account |
| `/api/logout/` | POST | End session |
| `/api/me/` | GET | Current user |
| `/api/attempts/` | GET | Login attempts |

## Local development

Requirements: **Python 3.10+** for the API (Vercel uses 3.12) and **Node.js** for the frontend.

```bash
# Terminal 1 — Django API
cd django-login-app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # optional
python manage.py runserver 127.0.0.1:8000

# Terminal 2 — Next.js
cd django-login-app/frontend
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open **http://127.0.0.1:3000**. Use **http** (not **https**) for local servers.

Without `DATABASE_URL`, Django uses SQLite (`db.sqlite3` in the project directory). On your machine, `DJANGO_DEBUG` defaults to **on** when `VERCEL` is not set.

If port **8000** is already in use, stop the existing process or run Django on another port and set `API_BACKEND_URL` when starting Next.js (for example `http://127.0.0.1:8001`).

## Production on Vercel

Production uses **two Vercel projects** from this repository:

| Vercel project | Root directory | Purpose |
|----------------|----------------|---------|
| `django-login-api` | Repository root (`django-login-app` on disk) | Django API, migrations, Neon Postgres |
| `django-login-web` | `frontend/` | Next.js UI |

The UI project’s production domain **django-login-app.vercel.app** is aliased to the latest Next.js deployment. The API project serves **django-login-api.vercel.app**.

### Django API project (`django-login-api`)

Configured for [Vercel’s Django support](https://vercel.com/docs/frameworks/full-stack/django): WSGI entrypoint in `pyproject.toml`, build script `build_vercel.py` (runs migrations), and static files via WhiteNoise.

1. Link **Neon Postgres** and ensure a Postgres URL is available at **build** and **runtime**.
2. Set **Production** environment variables (see table below). At minimum: `DJANGO_SECRET_KEY` and a Postgres URL (`DATABASE_URL` or Neon-injected names such as `DATABASE_URL_POSTGRES_PRISMA_URL`).
3. Set `FRONTEND_ORIGIN` to `https://django-login-app.vercel.app` so CORS and CSRF trust the UI origin.
4. Deploy from the repository root (for example `vercel deploy --prod` with the project linked to `django-login-api`).
5. Create users against the **production** database, not local SQLite:

   ```bash
   vercel env pull .env.production.vercel --environment=production
   # load DATABASE_URL and DJANGO_SECRET_KEY from that file, then:
   python manage.py createsuperuser
   ```

SQLite in the deployment bundle is read-only on Vercel; production must use Postgres.

### Next.js UI project (`django-login-web`)

1. Set **Root Directory** to `frontend/` in the Vercel project settings (or deploy from the `frontend/` folder with the CLI).
2. Set **Production** environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://django-login-api.vercel.app`
   - `API_BACKEND_URL` = `https://django-login-api.vercel.app` (used by `next.config.ts` rewrites when applicable)
3. Deploy (for example `cd frontend && vercel deploy --prod`).
4. Point **django-login-app.vercel.app** at the production deployment if you use a custom alias.

`frontend/vercel.json` marks the app as Next.js for Vercel. The client reads the CSRF token from the API response and sends session cookies on cross-origin requests to the API host.

## Environment variables

### Django (`django-login-api`)

| Variable | Purpose |
|----------|---------|
| `DJANGO_SECRET_KEY` | Required on Vercel; signs sessions and cookies |
| `DATABASE_URL` / Neon `POSTGRES_*` vars | Postgres connection (required on Vercel) |
| `DJANGO_DEBUG` | Set to `true` for explicit local debug; defaults to **off** on Vercel |
| `FRONTEND_ORIGIN` | UI origin for CORS/CSRF (production: `https://django-login-app.vercel.app`) |
| `CORS_ALLOWED_ORIGINS` | Optional extra CORS origins (comma-separated) |
| `DJANGO_ALLOWED_HOSTS` | Optional comma-separated extra hosts |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Optional comma-separated CSRF origins |

Vercel sets `VERCEL`, `VERCEL_URL`, and related values automatically.

### Next.js (`django-login-web`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Public API base URL in the browser (production: `https://django-login-api.vercel.app`) |
| `API_BACKEND_URL` | Rewrite target for `/api/*` in `next.config.ts` (default locally: `http://127.0.0.1:8000`) |

## Project layout

- `config/` — Django settings and root URLs
- `accounts/` — API views, auth services, `LoginAttempt` model
- `frontend/` — Next.js UI (`app/`, `lib/api.ts`, `vercel.json`)
- `build_vercel.py` — Vercel API build: require Postgres URL, run migrations
- `pyproject.toml` — Python dependencies and Django Vercel entrypoint

## License

Use and modify as needed for testing and learning.
