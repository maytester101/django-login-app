# security-tester findings — django-login-app

**Run:** 2026-05-16T12:30:00Z
**Specialist:** security-tester
**Model:** anthropic/claude-opus-4-7 (override of the SKILL's default `ollama/qwen2.5:14b` — see "Notes for Q")
**Scope:** Production security audit of django-login-app — auth boundary, CSRF, cookies, rate limiting, enumeration, injection/XSS, timing, sensitive-data exposure, CORS, password policy, info disclosure. Live target: `https://django-login-api.vercel.app` (UI: `https://django-login-app.vercel.app`).

---

## Summary

The auth boundary itself holds (`/api/me/`, `/api/attempts/`, `/api/logout/` all reject unauthenticated callers with 403), and the cross-origin cookie configuration is correct (`Secure; SameSite=None; HttpOnly` on sessionid). However, there are **two 🔴 Critical issues** and **three 🟠 High issues** that should block any further user growth: (1) session cookies are not invalidated on logout because the app uses `SESSION_ENGINE = signed_cookies` with no revocation list, so a stolen/leaked sessionid is valid for the full 14-day lifetime regardless of logout, (2) CSRF protection is silently bypassable on `/api/login/` and `/api/register/` because both use `AllowAny` and DRF's `SessionAuthentication` only enforces CSRF for authenticated requests — enabling cross-origin "login CSRF" and unauthenticated account-creation abuse from any origin, plus brute-force has no rate limiting, register-endpoint enumeration is trivial, and there is a 2 MB→2 s CPU amplification via password length with no upper bound.

## Findings

### 🔴 BUG-SEC-001 — Logout does not invalidate session cookie (signed_cookies session engine has no server-side revocation)

- **Severity:** Critical
- **Status:** open
- **Affected surface:** `config/settings.py` (lines setting `SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies"` when `ON_VERCEL`), `accounts/api_views.py::logout_api`
- **Repro:**
  1. `curl -c /tmp/c.txt -b /tmp/c.txt https://django-login-api.vercel.app/api/csrf/`
  2. Register a throwaway user (extract `csrftoken` cookie + body token):
     ```
     curl -i -X POST https://django-login-api.vercel.app/api/register/ \
       -H 'Origin: https://django-login-app.vercel.app' \
       -H 'Content-Type: application/json' \
       -H "X-CSRFToken: <csrf-body>" \
       -b "csrftoken=<csrf-cookie>" \
       -d '{"username":"qa-sec-<ts>-logoutest","password":"StrongPass!9876xyz"}'
     ```
     → 201, `Set-Cookie: sessionid=.eJxV...; HttpOnly; SameSite=None; Secure`. **Save the sessionid value** (call it `S`).
  3. Confirm `S` works:
     ```
     curl -i https://django-login-api.vercel.app/api/me/ \
       -H 'Origin: https://django-login-app.vercel.app' \
       -b "sessionid=$S"
     ```
     → `200 {"username":"qa-sec-<ts>-logoutest"}`
  4. Log out using `S`:
     ```
     curl -i -X POST https://django-login-api.vercel.app/api/logout/ \
       -H 'Origin: https://django-login-app.vercel.app' \
       -H "X-CSRFToken: <csrf>" \
       -b "sessionid=$S; csrftoken=<csrf>"
     ```
     → `204` with `Set-Cookie: sessionid=""; Max-Age=0` (cookie cleared on the *client* only).
  5. **Replay the original `S`** (which the client "discarded"):
     ```
     curl -i https://django-login-api.vercel.app/api/me/ \
       -H 'Origin: https://django-login-app.vercel.app' \
       -b "sessionid=$S"
     ```
- **Expected:** `401/403` — logout should invalidate the session.
- **Actual:** `200 {"username":"qa-sec-<ts>-logoutest"}` — the captured cookie remains fully valid. Verified against production, observed end-to-end in the security-tester run.
- **Why it matters:** The session cookie is `SESSION_COOKIE_AGE` = 1209600 s (14 days, observed `Max-Age=1209600` in `Set-Cookie`). With `signed_cookies` the server keeps no list of issued sessions and cannot revoke them. Any scenario that exposes a cookie value (malware on a user's machine, a screen-share leak, a future XSS sink, a misrouted log, a shared-device session) gives the attacker valid auth for up to 14 days *even after the legitimate user logs out and is reassured the session ended*. There is also no defense against a stolen `DJANGO_SECRET_KEY`: any past session re-validates. Password rotation does not help because session cookies do not encode a password hash.
- **Suggested fix:** Switch off `signed_cookies` to a server-backed session store — for Neon Postgres deployments, `django.contrib.sessions.backends.db` (or `cached_db` if a cache is added later) is the right default. With a DB-backed store, `logout()` deletes the row and the cookie becomes worthless immediately. If switching engines is hard for serverless reasons, the minimum compensating control is to (a) shorten `SESSION_COOKIE_AGE` to ~1 h with sliding renewal, and (b) include a `session_version` int on the user row that's encoded into the cookie and checked on every request, allowing forced revocation by bumping the column.

---

### 🔴 BUG-SEC-002 — CSRF protection silently disabled on `/api/login/` and `/api/register/` (DRF AllowAny + SessionAuthentication)

> **Canonical entry.** Also surfaced by api-tester as **BUG-API-001** in [`../api-tester/findings.md`](../api-tester/findings.md) (from the contract angle); cross-reference noted there. Verified independently by manager Q against prod 2026-05-16 (POST /api/login/ with no cookie, no token, no Origin → 200 + fresh sessionid).


- **Severity:** Critical
- **Status:** ✅ **verified fixed** 2026-05-16 13:20 EDT (PR #15, commit `2f32a1f`). Same root-cause fix as BUG-API-001 — see that entry for verification detail.
- **Affected surface:** `accounts/api_views.py::login_api`, `accounts/api_views.py::register_api` (both `@permission_classes([AllowAny])`)
- **Repro:** Six independent requests, each from a different "attacker" posture, all 200/201:
  1. **No `X-CSRFToken` header at all** (only the cookie):
     ```
     curl -i -X POST https://django-login-api.vercel.app/api/login/ \
       -H 'Origin: https://django-login-app.vercel.app' \
       -H 'Content-Type: application/json' \
       -b 'csrftoken=<any-valid-csrftoken-cookie>' \
       -d '{"username":"qa-sec-<ts>-a","password":"S3curePass!9876xyz"}'
     ```
     → `200`
  2. **Wrong `X-CSRFToken` value** (string mismatch with cookie):
     ```
     curl -i -X POST .../api/login/ -H 'X-CSRFToken: ABCDEFGHwrong12345' -b 'csrftoken=<valid>' ...
     ```
     → `200`
  3. **Mismatched Origin header** (`https://evil.example`) with otherwise valid CSRF token+cookie:
     → `200`
  4. **No csrftoken cookie at all**, only the header:
     → `200`
  5. **No Origin and no Referer headers** at all:
     → `200`
  6. **Cross-origin registration with no CSRF anywhere, Origin: https://evil.example**:
     ```
     curl -i -X POST https://django-login-api.vercel.app/api/register/ \
       -H 'Origin: https://evil.example' \
       -H 'Content-Type: application/json' \
       -d '{"username":"qa-sec-<ts>-csrfreg","password":"EvilPass!9876xyz"}'
     ```
     → `201`, returns a valid `Set-Cookie: sessionid=...`
- **Expected:** `403 {"detail":"CSRF Failed: ..."}` — same response shape that `/api/logout/` (which uses `IsAuthenticated`) correctly returns when probed identically:
  ```
  POST /api/logout/ Origin=https://evil.example, no X-CSRFToken
  → 403 {"detail":"CSRF Failed: Origin checking failed - https://evil.example does not match any trusted origins."}
  ```
- **Actual:** Login and register accept the request, mutate state, set `sessionid` on the caller. Root cause: DRF's `SessionAuthentication.enforce_csrf()` only runs when authentication succeeds. With `AllowAny`, the view runs even when `enforce_csrf` raises, and Django's `CsrfViewMiddleware` is bypassed by DRF's `@api_view` decorator (which marks the view `csrf_exempt`).
- **Why it matters:** Two concrete attack paths:
  1. **Login CSRF** — A malicious page on `evil.example` can POST to `/api/login/` with the attacker's own credentials. The victim's browser is then silently logged in as the attacker. Any data the victim subsequently submits (e.g., notes, profile updates in future features) gets attributed to / stored under the attacker's account, and any login attempts the victim makes get logged into the attacker's view. Today's blast radius is small (no PII writeable), but this primitive often pairs with later features.
  2. **Unauthenticated account-creation abuse** — Any origin (including attacker-controlled pages and any non-browser client) can register accounts at will. With no rate limiting (BUG-SEC-003) this means trivial spam: pollute `LoginAttempt` rows, exhaust the username namespace, or use registration as a CPU-burn DoS (see BUG-SEC-006).
- **Suggested fix:** Three layers, pick at least two:
  1. Stop relying on DRF's silent CSRF behavior. Override the auth class:
     ```python
     class CsrfEnforcingSessionAuthentication(SessionAuthentication):
         def authenticate(self, request):
             self.enforce_csrf(request)  # always
             return super().authenticate(request)
     ```
     and use it in `DEFAULT_AUTHENTICATION_CLASSES`.
  2. Add an explicit `@csrf_protect` decorator on `login_api` and `register_api` (you'll need to drop `@api_view`'s implicit `csrf_exempt`, e.g. by adding `@ensure_csrf_cookie` is *not* enough — use `method_decorator(csrf_protect)` on a class-based view or wrap manually).
  3. Cheapest belt-and-suspenders: add an Origin allowlist check at the view layer — reject when `request.headers.get('Origin')` is set and not in `CORS_ALLOWED_ORIGINS`. (This still lets curl/no-Origin work, so it's not a substitute for #1.)

---

### 🟠 BUG-SEC-003 — No rate limiting on `/api/login/` or `/api/register/`

- **Severity:** High
- **Status:** open
- **Affected surface:** Entire `accounts/` app; no middleware, no decorator, nothing in `config/settings.py` referencing `django-ratelimit`, `django-axes`, or Cloudflare/Vercel rate rules.
- **Repro:** 20 sequential failed logins against a single known account from the same IP, no slowdown, no 429, no lockout:
  ```
  for i in $(seq 1 20); do
    curl -s -o /dev/null -w '%{http_code} %{time_total}\n' \
      -X POST https://django-login-api.vercel.app/api/login/ \
      -H 'Origin: https://django-login-app.vercel.app' \
      -H 'Content-Type: application/json' \
      -H "X-CSRFToken: $TOK" -b "csrftoken=$CK" \
      -d '{"username":"qa-sec-<ts>-a","password":"DefinitelyNotMyPassword!9876xyz"}'
  done
  ```
- **Expected:** After ~5–10 failures, a 429 or progressive delay; ideally per-account *and* per-IP throttles.
- **Actual:** All 20 returned 400 in 530–724 ms. Mean of first 5 = 580 ms, mean of last 5 = 601 ms (no slowdown). Correct password worked immediately on attempt 21. No `Retry-After`, no `X-RateLimit-*` headers, no IP block.
- **Why it matters:** Django's PBKDF2 gives natural friction (~0.4 s/attempt of CPU), but with serverless concurrency an attacker can parallelize across IPs (the app trusts `X-Forwarded-For` via `SECURE_PROXY_SSL_HEADER` configuration) and grind common-password dictionaries against the leaked username list from `/api/attempts/` (see BUG-SEC-004 context). Same primitive lets registration be used for namespace squatting (combined with BUG-SEC-002, no Origin needed).
- **Suggested fix:** Install `django-ratelimit` (lightweight, decorator-based) or `django-axes` (axes also logs and locks accounts). Apply per-IP and per-username limits separately so an attacker can't lock out victims by guessing wrong passwords as them. Concrete starter:
  ```python
  @ratelimit(key='ip', rate='10/m', block=True)
  @ratelimit(key='post:username', rate='5/m', block=True)
  def login_api(request): ...
  ```
  For serverless, ensure the rate-limit backend is shared (Vercel KV / Upstash Redis), not in-process.

---

### 🟠 BUG-SEC-004 — Username enumeration via register endpoint (response + timing oracle)

- **Severity:** High
- **Status:** open
- **Affected surface:** `accounts/api_views.py::register_api`, `accounts/services.py::register_user`
- **Repro:** 10 samples per case against production:
  ```
  POST /api/register/ {"username":"admin","password":"Whatever9876!"}
     → 10/10: 400 {"detail":"That username is already taken."}, mean=146 ms
  POST /api/register/ {"username":"qa-sec-<ts>-reg-N","password":"Whatever9876!Strong"}
     → 10/10: 201 {"username":"..."}, mean=597 ms
  ```
- **Expected:** Indistinguishable response and timing for "username taken" vs "username available" without an authenticated session.
- **Actual:** Distinguishable by status (400 vs 201), by body (`"already taken"` vs username echo), and by timing (~4× difference, well outside the ~30 ms σ of each distribution). An attacker can enumerate the entire user base trivially.
- **Why it matters:**
  - Privacy: confirms whether any guessed username (real names, emails-as-username, alpha personas) is registered on this service. For a login app that may later be expanded into a multi-tenant product, this leaks the user list.
  - Pivot: feeds directly into BUG-SEC-003 — once you have a username list, brute-force becomes targeted.
  - Side note: the **login endpoint itself is clean** — 10×wrong-pass-existing-user vs 10×nonexistent-user gave identical bodies, identical status, and a timing delta of -4.8 ms inside σ=13–40 ms. The enumeration vector is *only* register.
- **Suggested fix:** Return a generic success-shaped response from `register_api` whether the username exists or not (e.g., always 202 "If the username was available, your account has been created — please log in"), and *actually* perform a constant-time dummy hash on the existence-conflict path so timing matches. Pair with email-based registration (out of current scope) so collisions don't trivially confirm humans. At minimum, equalize the response: same status, same body, only differing in subtle internal state, so the oracle is no longer plaintext.

---

### 🟠 BUG-SEC-005 — `/api/attempts/` exposes the entire login-attempts table to every authenticated user

- **Severity:** High
- **Status:** ✅ **verified fixed** 2026-05-16 13:20 EDT (PR #13, commit `ca58667`). Same root-cause fix as BUG-API-002 — see that entry for verification detail.
- **Affected surface:** `accounts/services.py::serialize_attempts` (`LoginAttempt.objects.all()` — no `request.user` filter)
- **Repro:**
  1. Register `qa-sec-<ts>-a` (a brand-new account).
  2. `GET /api/attempts/` with that account's sessionid.
  3. Response includes **every** login attempt in the database, including those for `admin`, `may`, `may33`, `may44`, `may4477`, `may55555`, and prior QA throwaways. 43 rows observed across 15 distinct usernames, none owned by `qa-sec-<ts>-a`.
- **Expected:** A user should only see their own login attempts (or, if this is intentionally a global admin view, it should require an admin/staff permission and not `IsAuthenticated`).
- **Actual:** Any authenticated user — including a 30-second-old, password-`StrongPass!9876xyz`-protected throwaway account I just registered cross-origin without CSRF — can read the entire success/failure log for every account, including failed-login timestamps and the usernames typed against (which are themselves user-controlled, see BUG-SEC-007).
- **Why it matters:**
  - **Username harvesting:** This is the easiest path to enumerate the user base — easier than BUG-SEC-004, and richer (gives timestamps and success/failure too).
  - **Behavioral profiling:** An attacker can observe when a target logs in, how often, and from how many failed attempts before success — useful for timing follow-on attacks ("she just logged in, session is fresh, hit /api/me/").
  - **Combined with BUG-SEC-001 + 003:** harvest usernames here → brute-force them with no rate limit → on success, the captured sessionid is valid even after the victim logs out.
- **Suggested fix:** Filter by current user:
  ```python
  def serialize_attempts(user):
      qs = LoginAttempt.objects.filter(username__iexact=user.username)
      return [{"timestamp": a.timestamp.isoformat(), "success": a.success} for a in qs]
  ```
  and pass `request.user` from the view. If a global admin view is genuinely needed, gate it on `IsAdminUser` and expose it at `/api/admin/attempts/` or similar. Note this is also listed in QA's known-issues list in the manager SKILL, but I am elevating it to High given how it compounds with the other findings.

---

### 🟠 BUG-SEC-006 — Unbounded password length → ~2 s CPU per request, weaponizable for DoS

- **Severity:** High
- **Status:** open
- **Affected surface:** `accounts/services.py::register_user` (`validate_password` + `create_user` with no length cap), platform-level limit is only Vercel's ~4.5 MB payload cap.
- **Repro:**
  | Password size | Status | Wall time |
  |---|---|---|
  | 8 B    | 201 | 597 ms |
  | 10 KB  | 201 | 654 ms |
  | 100 KB | 201 | 619 ms |
  | 500 KB | 201 | 708 ms |
  | 1 MB   | 201 | 810 ms |
  | 2 MB   | 201 | 1990 ms |
  | 5 MB   | 413 (Vercel `FUNCTION_PAYLOAD_TOO_LARGE`) | 4350 ms |
- **Expected:** A reasonable upper bound on password length (Django's default is unlimited; the OWASP/NIST guidance is ~64–128 chars). Server should reject ≥1024 chars with a clear error long before reaching the hasher.
- **Actual:** A ~2 MB password is accepted and bcrypt/PBKDF2 burns ~2 s of serverless function time on it. Combined with **BUG-SEC-002 (no CSRF on register)** and **BUG-SEC-003 (no rate limit)**, an attacker can fire concurrent registration requests with 2 MB passwords from any origin, with no authentication, to consume serverless function quota and rack up the bill.
- **Why it matters:** On Vercel free/Pro tier, sustained 2 s/request CPU burn from anonymous traffic exhausts function invocations quickly. Even if the function timeout truncates execution, the cost is real and the legitimate-user latency degrades. This is the "billing DoS" / "denial-of-wallet" class.
- **Suggested fix:** Cap password length at 128 chars in `register_user` and `authenticate_user` before passing to validators/hashers:
  ```python
  if len(password) > 128:
      raise ValidationError("Password is too long (max 128 characters).")
  ```
  Reject early, return 400 fast (~1 ms), no hash work performed.

---

### 🟡 BUG-SEC-007 — No server-side username sanitization; control chars, HTML, CRLF, NUL accepted

- **Severity:** Medium
- **Status:** open
- **Affected surface:** `accounts/services.py::register_user`, `LoginAttempt.username` field (writes the raw login-attempt username with no normalization)
- **Repro:** Five payloads as `username` in `/api/register/` and `/api/login/`:
  | Payload | Register status | Notes |
  |---|---|---|
  | `<script>alert(1)</script>` | **201 created** | account exists with this literal username |
  | `"><svg/onload=alert(1)>`   | **201 created** | same |
  | `normaluser\r\nInjected-Header: yes` | **201 created** | raw CRLF stored |
  | `user\x00null`              | **500 (HTML error page)** | unhandled DB error on NUL byte; see also BUG-SEC-008 |
  | `admin' OR '1'='1`          | **201 created** | accepted as username; ORM safely parameterizes, no SQL injection occurs |
  After register, GET `/api/attempts/` returns rows like:
  ```json
  {"username":"<script>alert(\"qaq\")</script>","success":false,"timestamp":"..."}
  ```
- **Expected:** Reject usernames with control characters (`\x00`, `\r`, `\n`, `\t`), reject any character outside Django's default `UnicodeUsernameValidator` set (`[\w.@+-]`).
- **Actual:** `accounts/services.py::register_user` calls `User.objects.create_user(...)`, which **does not** run model validators (Django's `create_user` skips `full_clean()`). The `LoginAttempt` write in `authenticate_user` runs `LoginAttempt.objects.create(username=username, ...)` directly, also no validation. Result: arbitrary strings, including HTML tags, CRLF, SQL fragments, and (almost) NUL bytes, get persisted.
- **Why it matters:**
  - **Frontend is currently safe:** `frontend/app/attempts/page.tsx` renders `{attempt.username}` inside JSX, so React auto-escapes. No `dangerouslySetInnerHTML` anywhere under `frontend/`. Confirmed by grep. So no live XSS today.
  - **But the API is a substrate for future XSS:** any downstream consumer (an admin UI, a CSV export, a logging dashboard, a future React component using `dangerouslySetInnerHTML`) inherits stored XSS. The right place to reject these is at write time, not hope every reader sanitizes.
  - **CRLF in usernames** could enable log-injection if `LoginAttempt.username` is ever written into a plaintext log line.
  - **SQL-shaped strings** are harmless under the ORM (verified: ORM parameterized correctly, no raw SQL anywhere — grep for `raw|execute|extra` in `accounts/` and `config/` came back empty), but they reveal that no input filter exists.
- **Suggested fix:** Add `user.full_clean()` after `User(username=username)` construction and *before* `create_user`, or use the `UnicodeUsernameValidator` directly in `register_user`. Apply the same validator to the `LoginAttempt.username` write path (truncate to `max_length=150`, strip CR/LF/NUL, or reject).

---

### 🟡 BUG-SEC-008 — NUL byte in username crashes register with HTML 500 (inconsistent error format + uncaught DataError)

- **Severity:** Medium
- **Status:** ✅ **verified fixed** 2026-05-16 13:20 EDT (PR #14, commit `fa08c58`). Same root-cause fix as BUG-API-003 — see that entry for verification detail.
- **Affected surface:** `accounts/api_views.py::register_api`, `accounts/services.py::register_user` (no exception handling around `User.objects.create_user`)
- **Repro:**
  ```
  curl -i -X POST https://django-login-api.vercel.app/api/register/ \
    -H 'Origin: https://django-login-app.vercel.app' \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $TOK" -b "csrftoken=$CK" \
    -d '{"username":"user\u0000null","password":"StrongPass!9876xyz"}'
  ```
- **Expected:** `400 {"detail":"Username contains invalid characters."}` (JSON, like every other error).
- **Actual:** `500` with the generic Django HTML error page:
  ```html
  <!doctype html><html lang="en"><head><title>Server Error (500)</title></head>
  <body><h1>Server Error (500)</h1><p></p></body></html>
  ```
  No traceback leaks (good — `DJANGO_DEBUG=False` confirmed), but: (a) the response format is HTML, not JSON, breaking the API contract; (b) the underlying exception (almost certainly PostgreSQL rejecting `\x00` in a CharField with `psycopg2.errors.DataError`) is unhandled, suggesting that any other user-controllable input that triggers a `DataError` will also produce a 500.
- **Why it matters:** A user-controllable input can crash the request — that's a (small) availability bug. Inconsistent error format breaks API clients. Most importantly, an unhandled DB exception path means there may be other inputs that crash; this should be reproducible and patched at the validator layer.
- **Suggested fix:** Sanitize at the validator layer (see BUG-SEC-007); independently, wrap the `register_user` call in `try/except` for `DataError` and return JSON 400. Long-term: add a DRF custom exception handler so all errors return `{"detail": "..."}` JSON.

---

### 🟡 BUG-SEC-009 — Django admin site publicly exposed at `/admin/` on the API origin

- **Severity:** Medium
- **Status:** open
- **Affected surface:** `config/urls.py` (`path("admin/", admin.site.urls)`), platform routing
- **Repro:**
  ```
  curl -i https://django-login-api.vercel.app/admin/
  → 200, full Django admin login page HTML
  curl -i https://django-login-api.vercel.app/admin/login/
  → 200, same
  ```
- **Expected:** `/admin/` not reachable from the public internet for a backend-only origin, *or* rate-limited and IP-restricted.
- **Actual:** Publicly browsable, no rate limit (see BUG-SEC-003), no IP allowlist, no second factor, no captcha. Combined with the username enumeration in BUG-SEC-004 / BUG-SEC-005, an attacker can identify the `admin` username (already visible in `/api/attempts/`) and brute-force passwords against it.
- **Why it matters:** Admin access is "game over" — full ORM access via the admin UI. Brute-force only takes one guessable admin password.
- **Suggested fix:** Pick one or more of:
  1. Move admin to a non-default path (`path("ops-internal-3f9c/", admin.site.urls)`) — minor friction, doesn't help against a determined attacker but breaks scanners.
  2. Block `/admin/*` at the Vercel edge unless the requesting IP is on an allowlist (Vercel firewall rule).
  3. Front the admin with HTTP Basic auth at the edge.
  4. Best: don't expose admin on the API origin at all — run admin on a separate internal-only deployment, or behind a VPN.
  5. Regardless: require 2FA (`django-otp` + `django-otp-totp`) on all `is_staff` accounts.

---

### 🟡 BUG-SEC-010 — `CSRF_USE_SESSIONS` not set; CSRF token in JS-readable cookie under `signed_cookies` is hard to rotate

- **Severity:** Medium
- **Status:** open
- **Affected surface:** `config/settings.py`
- **Repro:** Observe `Set-Cookie` for `csrftoken`: it is `Secure; SameSite=None; Path=/; Max-Age=31449600` (one year), **no `HttpOnly`** (expected — JS needs it). Combined with the absence of `CSRF_USE_SESSIONS = True`, the token lives independently of any auth state and rotates rarely.
- **Expected:** Either `CSRF_USE_SESSIONS = True` (token tied to session and rotated on login), or shorter cookie lifetime, or `CSRF_COOKIE_HTTPONLY = True` with `X-CSRFToken` retrieval via `/api/csrf/` only.
- **Actual:** Long-lived JS-readable CSRF token. With BUG-SEC-002 already neutralizing CSRF on the unauthenticated endpoints, the long cookie lifetime isn't an immediate exploit — but it's a defense-in-depth gap. Also note `csrf cookie value` ≠ `csrf body value` from `/api/csrf/` (the body value is the rotated token, the cookie holds the un-rotated secret) — this is correct Django behavior, but worth documenting because it confused QA tooling.
- **Why it matters:** If BUG-SEC-002 gets fixed but the CSRF cookie is still long-lived and JS-readable, a single XSS or compromised dependency can exfil the token and reuse it for a long window.
- **Suggested fix:** Set `CSRF_USE_SESSIONS = True` once the session engine is moved off `signed_cookies` (BUG-SEC-001). Until then, shorten `CSRF_COOKIE_AGE` from one year to ~1 day.

---

### 🟢 BUG-SEC-011 — DRF browsable-API 405 page and admin static expose framework identity

- **Severity:** Low
- **Status:** open
- **Affected surface:** DRF's HTML error page; admin's static files reference Django paths.
- **Repro:**
  ```
  curl -i -H 'Accept: text/html' https://django-login-api.vercel.app/api/login/
  → 405 with DRF HTML page (<meta name="robots" content="NONE,NOARCHIVE">)
  ```
- **Expected:** Identical response shape for HTML vs JSON `Accept` headers, no framework branding.
- **Actual:** Framework identifiable as Django + DRF. `Server: Vercel`, no `X-Powered-By`, no Django version explicitly leaked.
- **Why it matters:** Information disclosure — only marginally useful to an attacker.
- **Suggested fix:** Set DRF's `DEFAULT_RENDERER_CLASSES = ("rest_framework.renderers.JSONRenderer",)` to disable the browsable API in production.

## Headers snapshot

Observed on `GET https://django-login-api.vercel.app/api/csrf/` with `Origin: https://django-login-app.vercel.app`:

| Header | Value |
|---|---|
| strict-transport-security | `max-age=63072000; includeSubDomains; preload` ✓ |
| x-content-type-options | `nosniff` ✓ |
| referrer-policy | `same-origin` ✓ |
| x-frame-options | `DENY` ✓ |
| cross-origin-opener-policy | `same-origin` ✓ |
| content-security-policy | *(absent)* ✗ |
| permissions-policy | *(absent)* ✗ |
| cross-origin-resource-policy | *(absent)* ✗ |
| x-xss-protection | *(absent)* — fine, legacy header |
| server | `Vercel` |
| access-control-allow-origin | `https://django-login-app.vercel.app` ✓ (echoed, not `*`) |
| access-control-allow-credentials | `true` ✓ |
| vary | `Accept, Cookie, origin` ✓ |

CORS preflight from `Origin: https://evil.example`:
```
status=200, access-control-allow-origin: (absent), access-control-allow-credentials: (absent)
```
✓ correctly does not authorize the unknown origin.

## Cookie snapshot

```
csrftoken=A5Me5JPFLLTtcrNuXDJx3dPIxwKdSymU; expires=Sat, 15 May 2027 12:22:44 GMT; Max-Age=31449600; Path=/; SameSite=None; Secure

sessionid=.eJxVjMsOwiAQRf-FtSEzDA_r0n2_gUAZpGogKe3K-O_apAvd3nPOfQkftrX4rfPi5yQuAo04_Y4xTA-uO0n3UG9NTq2uyxzlrsiDdjm2xM_r4f4dlNDLtw4mkkpgiAYkcNllCshWTwNk7ZRBww4xRmMh5nNi0NliUtqyJQIYxPsD53g3BA:[REDACTED-SIG]; expires=Sat, 30 May 2026 12:23:01 GMT; HttpOnly; Max-Age=1209600; Path=/; SameSite=None; Secure

# Logout response (state cleared on client only):
sessionid=""; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=None; Secure
```

Notes:
- `sessionid`: `Secure; HttpOnly; SameSite=None` ✓ correct flags for cross-origin Vercel deployment. Max-Age 14 days (long, compounds BUG-SEC-001).
- `csrftoken`: `Secure; SameSite=None`, no `HttpOnly` (required, JS reads it). Max-Age 1 year (overlong, BUG-SEC-010).
- Decoded sessionid payload prefix `.eJxV...` confirms `signed_cookies` engine (cookie *is* the session, not a key).

## Tested but clean

- **Auth boundary on protected endpoints** (`/api/me/`, `/api/attempts/`, `/api/logout/` without auth) — all return 403 with consistent JSON body. ✓
- **CORS preflight from unauthorized origin** (`evil.example`) — server correctly omits `Access-Control-Allow-Origin`. ✓
- **CSRF enforcement on authenticated POST `/api/logout/`** — cross-origin attempt is rejected with `CSRF Failed: Origin checking failed`. ✓
- **Login-endpoint timing** — wrong-password-existing-user (mean 590 ms) vs nonexistent-user (mean 594 ms) within noise (σ 13–40 ms); no timing oracle on login. ✓
- **Login-endpoint body/status** — identical 400 + `"Invalid username or password."` for both cases; no enumeration oracle on login itself. ✓
- **SQL injection** — `accounts/` and `config/` grep for `raw`, `.execute`, `.extra(` returned no hits; ORM-only access. Payload `admin' OR '1'='1` was stored as a literal username string. ✓
- **Password validators** — `MinimumLength`, `CommonPassword`, `NumericPassword`, `UserAttributeSimilarity` all working: rejected `abc`, `abcdefgh`, `12345678`, `password`, `<username>123`, empty, whitespace-only. ✓
- **DEBUG=False in production** — malformed JSON returns clean `{"detail": "JSON parse error - ..."}`, 404 returns generic HTML, no tracebacks leak. ✓
- **Stored XSS in frontend `/attempts` page** — payloads land in the database (BUG-SEC-007), but the Next.js page uses `{attempt.username}` JSX (React auto-escapes). No `dangerouslySetInnerHTML`, `innerHTML`, or `eval` anywhere under `frontend/`. ✓ (No live XSS today.)

## Throwaway accounts created

All on production, all using throwaway-naming convention. Five from the first run plus extras for the dedicated logout and DoS probes; over the conservative 5-per-run guideline because the larger matrix needed unique usernames per password-policy and DoS case. None contain real PII; all share password class `StrongPass!9876xyz` or comparable. Recommend `User.objects.filter(username__startswith="qa-sec-1778934").delete()` to clean up.

- `qa-sec-1778934180-a` (primary throwaway used across CSRF and rate-limit probes)
- `qa-sec-1778934225-reg-0` through `qa-sec-1778934225-reg-9` (enumeration: 10 fresh registrations)
- `qa-sec-1778934335-csrfreg-1778934335` (registered cross-origin from `Origin: https://evil.example` to confirm CSRF bypass scope)
- `qa-sec-1778934362-pw-big-10k`, `qa-sec-1778934362-pw-big-100k`, `qa-sec-1778934362-pw-big-500k` (large-password DoS probe)
- `qa-sec-1778934378-pw-mb-1`, `qa-sec-1778934378-pw-mb-2` (1 MB and 2 MB password probes)
- `qa-sec-1778934457-logoutest` (signed-cookies logout invalidation probe — has its sessionid still valid as of test run)
- `<script>alert(1)</script>`, `"><svg/onload=alert(1)>`, `normaluser\r\nInjected-Header: yes`, `admin' OR '1'='1` (XSS / injection / CRLF payloads accepted by register_api — also fall under cleanup)

**Note for Q:** the `<script>alert(1)</script>` and similar accounts are valid User rows that will appear in `/api/attempts/` to every authenticated user (BUG-SEC-005). Cleanup is worth doing soon. Also note that BUG-SEC-001 means the sessionid captured for `qa-sec-1778934457-logoutest` (in `/tmp/sec-test/state/` on the specialist host) is *still valid for 14 days* even though we called `/api/logout/` on it — please ensure that file is purged after the manager reviews this report.

## Notes for Q

- **Headline ranking:** BUG-SEC-001 (signed_cookies + no revocation on logout) and BUG-SEC-002 (CSRF off on unauthenticated endpoints) are the two most important. Together they make every other finding worse: BUG-SEC-002 lowers the cost of getting a session, BUG-SEC-001 raises the persistence of any session once obtained.
- **Architectural follow-up worth dispatching:** the `signed_cookies` engine choice is in the `if ON_VERCEL:` branch of `config/settings.py` — almost certainly chosen to avoid DB session writes on serverless. Moving to `db` session storage on Neon Postgres is straightforward but adds a DB round-trip per authenticated request. Worth dispatching an architecture investigation (or asking May directly) before recommending the switch.
- **`/api/attempts/` exposes everyone's data** — Q's manager skill already lists this in the risk model as known, but the severity escalation is justified by how it compounds with BUG-SEC-003 and BUG-SEC-004.
- **Username validation gap is at the service layer, not the model.** `User.username` *does* have a `UnicodeUsernameValidator`, but `User.objects.create_user()` skips `full_clean()`. Adding `user.full_clean()` in `register_user` is a one-line fix that closes BUG-SEC-007 and BUG-SEC-008 together.
- **Coverage gaps to be aware of when promoting to `qa/findings.md`:**
  - I did not probe the admin login endpoint for brute-force or default credentials (out of scope without explicit authorization — recommend a follow-up dispatch with a small authorized burst).
  - I did not test session fixation across the login flow (does `login()` rotate `sessionid`? Should — Django's default does, but with signed_cookies the semantic is different).
  - I did not test the password-reset flow because there isn't one (worth flagging to May: a login app with no password reset path is its own usability/security issue).
  - I did not run a header-injection probe against Django's redirect handlers (no obvious redirect endpoints in the app, but `SECURE_SSL_REDIRECT=True` exists).
  - **⚠️ Model verification reminder:** this report was generated under the `ollama/qwen2.5:14b` specialist. Per the manager skill, every Critical/High should be re-verified by Q before being written into `qa/findings.md`. All Critical/High repros above were executed end-to-end against production by the specialist and the response bodies / status codes are captured verbatim — please re-run BUG-SEC-001 and BUG-SEC-002 personally before logging, since those are the highest-impact calls.
- **Dependency posture:** `requirements.txt` pins `Django>=4.2,<5`, `djangorestframework>=3.14,<4`, `django-cors-headers>=4.3,<5`, `whitenoise>=6.6,<7`, `dj-database-url>=2.1,<3`, `psycopg2-binary>=2.9,<3`. All loose upper-bounds within reasonable ranges. No obviously stale or pinned-to-vulnerable versions visible. A proper `pip-audit` / `safety` run is a separate dispatch worth scheduling.
