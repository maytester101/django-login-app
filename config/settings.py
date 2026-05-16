import os
from pathlib import Path
from typing import Optional

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _database_url() -> Optional[str]:
    """Resolve DB URL from Vercel/Neon (plain or Storage-integration prefixed names)."""
    for key in (
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_PRISMA_URL",
        "NEON_DATABASE_URL",
        # Vercel Marketplace Neon often exposes only these (plain DATABASE_URL may be empty):
        "DATABASE_URL_POSTGRES_PRISMA_URL",
        "DATABASE_URL_POSTGRES_URL",
        "DATABASE_URL_POSTGRES_URL_NON_POOLING",
    ):
        v = os.environ.get(key)
        if not v or not v.strip():
            continue
        s = v.strip()
        low = s.lower()
        if low in ("postgresql://...", "postgres://..."):
            continue
        if "..." in low and low.startswith("postgres"):
            continue
        return s
    return None


ON_VERCEL = bool(os.environ.get("VERCEL"))

SECRET_KEY = (os.environ.get("DJANGO_SECRET_KEY") or "").strip() or (
    "dev-only-change-in-production-not-for-production-use"
)

if ON_VERCEL and not (os.environ.get("DJANGO_SECRET_KEY") or "").strip():
    raise ImproperlyConfigured(
        "Set DJANGO_SECRET_KEY in Vercel → Settings → Environment Variables."
    )

DEBUG = os.environ.get(
    "DJANGO_DEBUG",
    "False" if ON_VERCEL else "True",
).lower() in ("1", "true", "yes")

VERCEL_URL = os.environ.get("VERCEL_URL", "")

if ON_VERCEL and not _database_url():
    raise ImproperlyConfigured(
        "SQLite cannot be written on Vercel. Add DATABASE_URL or POSTGRES_URL (Neon), "
        "enable it for Production (and for Builds if you use migrate in build), "
        "redeploy, then run createsuperuser against that database."
    )

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    ".vercel.app",
]
if VERCEL_URL and VERCEL_URL not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(VERCEL_URL)

_vercel_prod = os.environ.get("VERCEL_PROJECT_PRODUCTION_URL", "")
if _vercel_prod and _vercel_prod not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_vercel_prod)

_vercel_branch = os.environ.get("VERCEL_BRANCH_URL", "")
if _vercel_branch and _vercel_branch not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_vercel_branch)

_extra_hosts = os.environ.get("DJANGO_ALLOWED_HOSTS", "")
if _extra_hosts.strip():
    ALLOWED_HOSTS.extend(h.strip() for h in _extra_hosts.split(",") if h.strip())

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "accounts",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

_db_url = _database_url()
if _db_url:
    os.environ.setdefault("DATABASE_URL", _db_url)
    # Serverless: avoid holding DB connections between invocations (Neon/serverless friendly).
    _conn_max_age = 0 if ON_VERCEL else 600
    # Neon requires SSL; DEBUG=True on Vercel would otherwise disable ssl_require.
    _ssl_required = ON_VERCEL or not DEBUG
    DATABASES = {
        "default": dj_database_url.parse(
            _db_url,
            conn_max_age=_conn_max_age,
            ssl_require=_ssl_required,
            conn_health_checks=bool(_conn_max_age),
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "/admin/login/"

_cors_origins = []
_frontend_origin = os.environ.get("FRONTEND_ORIGIN", "").strip().rstrip("/")
if _frontend_origin:
    _cors_origins.append(_frontend_origin)
else:
    _cors_origins.extend(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    )

for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(","):
    origin = origin.strip().rstrip("/")
    if origin and origin not in _cors_origins:
        _cors_origins.append(origin)

CORS_ALLOWED_ORIGINS = _cors_origins
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # CsrfEnforcingSessionAuthentication enforces CSRF on every request,
        # not just authenticated ones. Stock DRF's SessionAuthentication only
        # runs the CSRF check after authenticate() resolves a user, which
        # combined with @permission_classes([AllowAny]) made /api/login/ and
        # /api/register/ effectively csrf_exempt (BUG-API-001 / BUG-SEC-002).
        "accounts.auth.CsrfEnforcingSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
    # Production public UI hostnames. Without these, the new
    # CsrfEnforcingSessionAuthentication will 403 every POST from the UI
    # with "Origin checking failed - <host> does not match any trusted
    # origins." (BUG-API-006). FRONTEND_ORIGIN env var still wins if set,
    # but baking these in keeps the repo self-sufficient when env vars
    # are missing or temporarily misconfigured.
    "https://django-login-web.vercel.app",
    "https://django-login-app.vercel.app",
]
if VERCEL_URL:
    CSRF_TRUSTED_ORIGINS.append(f"https://{VERCEL_URL}")

if _vercel_prod:
    CSRF_TRUSTED_ORIGINS.append(f"https://{_vercel_prod}")

if _vercel_branch:
    CSRF_TRUSTED_ORIGINS.append(f"https://{_vercel_branch}")

for origin in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(","):
    origin = origin.strip()
    if origin:
        CSRF_TRUSTED_ORIGINS.append(origin)

for origin in _cors_origins:
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

if ON_VERCEL:
    SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies"

SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

if _frontend_origin:
    SESSION_COOKIE_SAMESITE = "None"
    CSRF_COOKIE_SAMESITE = "None"
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

if not DEBUG and ON_VERCEL:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "WARNING",
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}
