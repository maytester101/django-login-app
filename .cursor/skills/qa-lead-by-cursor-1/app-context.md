# django-login-app context

Use this as the baseline system map. Re-read `README.md`, `accounts/`, `config/`, and `frontend/` when preparing a strategy so recommendations match the current code.

## Purpose

Full-stack app for sign-in, registration, and login-attempt logging. Next.js UI; Django JSON API; Neon Postgres on Vercel in production.

## Production topology

| Host | Role |
|------|------|
| `https://django-login-app.vercel.app` | Next.js UI (`/`, `/register`, `/attempts`) |
| `https://django-login-api.vercel.app` | Django API and `/admin/` |
| `https://django-login-web.vercel.app` | Alternate UI hostname |

The browser calls the API host directly in production (session cookies + CSRF). Locally, Next.js rewrites `/api/*` to Django (`API_BACKEND_URL`, default `http://127.0.0.1:8000`).

## UI routes (`frontend/app/`)

| Path | Behavior |
|------|----------|
| `/` | Sign in; redirects to `/attempts` if `api.me()` succeeds; shows API error on failed login |
| `/register` | Create account; same authenticated redirect; navigates to `/attempts` on success |
| `/attempts` | Requires auth; loads `me` + attempts; 401 → `/`; logout → `/` |

Client API wrapper: `frontend/lib/api.ts` — CSRF prefetch on mutating requests, `credentials: "include"`, `ApiError` from JSON `detail`.

## API (`accounts/urls.py` → `api_views.py`)

| Path | Method | Auth | Notes |
|------|--------|------|-------|
| `/api/csrf/` | GET | Public | Sets CSRF cookie; returns `csrfToken` |
| `/api/login/` | POST | Public | 400 + `detail` on failure; 200 + `username` on success |
| `/api/register/` | POST | Public | 201 on success; 400 on validation (incl. duplicate username) |
| `/api/logout/` | POST | Required | 204 |
| `/api/me/` | GET | Required | `username` |
| `/api/attempts/` | GET | Required | List of `{ timestamp, username, success }` |

Default DRF permissions require authentication except where views use `AllowAny`.

## Domain logic (`accounts/services.py`)

- **Login**: strip username; failed auth creates `LoginAttempt` with `success=False` (empty username stored as `—`); success creates success attempt and `login()`.
- **Register**: strip username; reject empty; case-insensitive unique username; Django password validators; success attempt + session; `IntegrityError` mapped to duplicate username message.
- **Attempts list**: all rows, newest first (`LoginAttempt.Meta.ordering`).

Model: `LoginAttempt` — `username`, `success`, `timestamp` (auto, UTC in settings).

## Stack and layout

- **API**: Django 4.x, DRF, `django-cors-headers`, WhiteNoise; `config/settings.py` CORS/CSRF from `FRONTEND_ORIGIN` and Vercel URLs.
- **UI**: Next.js 15, React 19, Turbopack; scripts: `dev`, `build`, `start`, `lint` (no test script in `package.json` today).
- **Dirs**: `config/`, `accounts/`, `frontend/`, `build_vercel.py`, `pyproject.toml`, `requirements.txt`.

## Testing baseline (verify in repo)

As of skill authoring: no dedicated `tests/` tree or pytest config surfaced in the app root; Playwright appears only as an optional Next.js peer in the lockfile. Treat automated coverage as **greenfield** unless a later scan finds suites.

## Local run (for E2E / manual)

- API: venv, `pip install -r requirements.txt`, `migrate`, `runserver 127.0.0.1:8000`
- UI: `frontend/` → `npm install`, `npm run dev -- --hostname 127.0.0.1 --port 3000`
- Use **http** locally. Default DB: SQLite `db.sqlite3` without `DATABASE_URL`.

## Env vars (strategy-relevant)

**Django**: `DJANGO_SECRET_KEY`, `DATABASE_URL` / Neon vars, `FRONTEND_ORIGIN`, `CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `DJANGO_DEBUG`.

**Next.js**: `NEXT_PUBLIC_API_URL`, `API_BACKEND_URL`.
