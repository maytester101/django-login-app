# api-tester findings — django-login-app

**Run:** 2026-05-16T17:00:27Z
**Specialist:** api-tester
**Model:** anthropic/claude-opus-4-7
**Run type:** ⚠️ **Manager-inline fallback** — the dispatched specialist on `ollama/qwen2.5:14b` produced no output (qa/specialists/api-tester/findings.md was unchanged on disk after the dispatch ended), so per the model-policy paragraph in `qa/SKILL.md`, the manager (Q) executed the api-tester checklist inline on opus and wrote this file directly. **Not a clean specialist dispatch.**
**Environment:** Production — `https://django-login-api.vercel.app` (UI cross-origin: `https://django-login-web.vercel.app`)
**Scope:** Full contract sweep of all six `/api/*` endpoints. 51 probes total. Probe harness archived at `/tmp/qa-api-inline-1778950827/`.

---

## Summary

Two **🔴 Critical** contract violations: (1) CSRF is not enforced on `POST /api/login/` — a request from any origin with no token of any kind (no cookie, no header, no Origin/Referer) returns 200 with a fresh session cookie; (2) `GET /api/attempts/` returns **every user's** login attempts to any authenticated caller (167 rows visible from a 30-second-old throwaway account, of which only 1 belonged to that account).

One **🔴 Critical** server-error contract drift: usernames containing a NUL byte, or longer than 150 characters, return an HTML `500` page from the API instead of a JSON `400` — `frontend/lib/api.ts`'s `.json()` call will throw a SyntaxError.

🟠 **High:** a password of 8 spaces is accepted; case-insensitive uniqueness on register but case-sensitive on login; logout doesn't invalidate the server-side session.

🟡 **Medium / contract drift:** unauthenticated calls to protected endpoints return 403 instead of 401; wrong-method on a protected endpoint returns 403 (unauth) before the 405 (method); usernames are stored without sanitization (script-tag accepted as a valid username).

🟢 **Low:** none worth listing this run.

---

## Findings

### 🔴 BUG-API-001 — CSRF is not enforced on `POST /api/login/`, `/api/register/`, `/api/logout/`

- **Severity:** Critical
- **Status:** ✅ **verified fixed** 2026-05-16 13:20 EDT (PR #15, commit `2f32a1f`). All 6 adversarial postures that returned 200 + sessionid this morning now return 403 against live prod. Happy-path login through the full CSRF flow still returns 200. Same root-cause fix also resolves the cross-referenced BUG-SEC-002.
- **Endpoint:** `POST /api/login/` (also `/api/register/`, same root cause; `/api/logout/` is partially protected — see "Logout CSRF behavior" note below)
- **Repro:** Six independent probes, every one returns 200 + fresh `sessionid`:

  ```bash
  # 1. No X-CSRFToken header, only the csrftoken cookie
  curl -i -X POST https://django-login-api.vercel.app/api/login/ \
    -H 'Origin: https://django-login-web.vercel.app' \
    -H 'Content-Type: application/json' \
    -b 'csrftoken=<any-valid-csrftoken-cookie>' \
    -d '{"username":"qa-api-1778950827-csrf","password":"***"}'
  # -> 200 {"username":"qa-api-1778950827-csrf"}

  # 2. Wrong X-CSRFToken value (string mismatch with the cookie)
  curl -i -X POST .../api/login/ \
    -H 'X-CSRFToken: ABCDEFGHwrong12345' \
    -b 'csrftoken=<valid>' \
    -d '{"username":"...","password":"***"}'
  # -> 200

  # 3. NO csrftoken cookie at all, only the header
  curl -i -X POST .../api/login/ \
    -H 'X-CSRFToken: someTokenValue' \
    -d '{"username":"...","password":"***"}'
  # -> 200

  # 4. No Origin AND no Referer AND no cookie AND no header
  curl -i -X POST .../api/login/ \
    -H 'Content-Type: application/json' \
    -d '{"username":"...","password":"***"}'
  # -> 200

  # 5. Origin: https://evil.example (cross-origin from anywhere)
  curl -i -X POST .../api/login/ \
    -H 'Origin: https://evil.example' \
    -d '{"username":"...","password":"***"}'
  # -> 200

  # 6. Form-encoded body (the classic CSRF-attack content-type)
  curl -i -X POST .../api/login/ \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=...&password=***'
  # -> 200, with Set-Cookie: sessionid=...
  ```

- **Expected:** 403 `{"detail":"CSRF Failed: ..."}` on every one of the 6 cases, the same way `/api/logout/` returns 403 for a mismatched Origin (see "Logout CSRF behavior" note).
- **Actual:** All 6 return `200 {"username":"..."}` with a fresh `sessionid` set on the caller. Root cause: DRF's `SessionAuthentication.enforce_csrf()` only fires when authentication succeeds. With `@permission_classes([AllowAny])`, the view runs even when there's no session, so CSRF is never checked. `@api_view` also marks the view `csrf_exempt` for Django's `CsrfViewMiddleware`.
- **Why it matters:** Any third-party site can POST to `/api/login/` from a victim's browser. With the attacker's credentials, the victim is silently logged in as the attacker (login CSRF — primitive for later attribution attacks). With registration, any origin can create accounts at will (combine with no rate limiting and the namespace can be polluted at scale). The entire `/api/csrf/` round-trip the UI does is currently security theater for these endpoints.
- **Suggested fix:** Custom auth class that enforces CSRF on every request:
  ```python
  # accounts/auth.py
  from rest_framework.authentication import SessionAuthentication

  class CsrfEnforcingSessionAuthentication(SessionAuthentication):
      def authenticate(self, request):
          self.enforce_csrf(request)
          return super().authenticate(request)
  ```
  Wire it into `REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"]` in `config/settings.py`. Verify `frontend/lib/api.ts` still works after — the UI already fetches `/api/csrf/` before any POST, so it should be unaffected.
- **Source reference:** `accounts/api_views.py:27-31` (`login_api` with `AllowAny`), `accounts/api_views.py:38-49` (`register_api` with `AllowAny`).

#### Logout CSRF behavior (note, not a separate finding)

`POST /api/logout/` uses `@permission_classes([IsAuthenticated])`, so DRF's `SessionAuthentication.authenticate()` actually runs against the session — and that path *does* enforce CSRF. Observed during this run with an authenticated cookie + Origin `https://django-login-web.vercel.app`:

```
POST /api/logout/  Origin: https://django-login-web.vercel.app
  -> 403 {"detail":"CSRF Failed: Origin checking failed —
                    https://django-login-web.vercel.app does not match
                    any trusted origins."}
```

So **`/api/logout/` enforces CSRF correctly**, but `django-login-web.vercel.app` is not in `CSRF_TRUSTED_ORIGINS`. Means the new public hostname can't actually log out users today — see **BUG-API-006** below.

---

### 🔴 BUG-API-002 — `GET /api/attempts/` exposes every user's login attempts

- **Severity:** Critical
- **Status:** ✅ **verified fixed** 2026-05-16 13:20 EDT (PR #13, commit `ca58667`). Re-verified the original repro live: registered a fresh account, caused an anonymous failed-login attempt for a different username, then `GET /api/attempts/` as the new account — returned **1 row** (own auto-login event), **0 rows** belonging to other users. Same root-cause fix also resolves the cross-referenced BUG-002 (manager-direct) and BUG-SEC-005 (security-tester's elevated view).
- **Endpoint:** `GET /api/attempts/`
- **Repro:** Register two throwaway accounts X and Y in separate sessions. Cause a failed login for X from a third (anonymous) session. Log in as Y. `GET /api/attempts/`:

  ```bash
  curl -s -b 'sessionid=<Y session id>' \
    https://django-login-api.vercel.app/api/attempts/ | jq 'length, .[0:3]'
  ```

  Result during this run:
  ```
  attempts as Y: total=167 rows | own (Y)=1 row | X=2 rows | OTHER=164 rows
  ```
- **Expected:** Y sees only Y's own rows (1 in this case). If a global view is genuinely wanted, expose it under a separate admin-gated endpoint.
- **Actual:** All 167 `LoginAttempt` rows in the database are returned — including failed-login records for accounts Y has never heard of. (Note: 164 of those rows are QA-throwaway noise from earlier today, but the leak is structural — a real user would see all real users.)
- **Why it matters:**
  - **Account enumeration** — anyone with a real account can list every other username.
  - **Brute-force intelligence** — attackers can see who's being attacked, when, and what wrong-passwords are being guessed.
  - **Privacy** — a "login attempts" log is reasonable for the account owner to see; never for arbitrary peers.
- **Suggested fix:**
  ```python
  # accounts/services.py
  def serialize_attempts(user):
      qs = LoginAttempt.objects.filter(username__iexact=user.username)
      return [{"timestamp": a.timestamp.isoformat(),
               "username": a.username,
               "success": a.success} for a in qs]
  ```
  And in the view:
  ```python
  # accounts/api_views.py
  @api_view(["GET"])
  @permission_classes([IsAuthenticated])
  def attempts_api(request):
      return Response(services.serialize_attempts(request.user))
  ```
- **Source reference:** `accounts/services.py:31-39` (`serialize_attempts` uses `LoginAttempt.objects.all()` with no filter).

---

### 🔴 BUG-API-003 — Username with NUL byte or length >150 returns HTML 500 instead of JSON 400

- **Severity:** Critical (contract-breaking; the UI's `.json()` call throws a SyntaxError)
- **Status:** ✅ **verified fixed** 2026-05-16 13:20 EDT (PR #14, commit `fa08c58`). Both the 151-char and NUL-byte cases now return `400 application/json` with the documented `{"detail": "..."}` shape ("Username must be 150 characters or fewer." and "Username contains invalid characters."). The 150-char boundary still returns 201. Same root-cause fix also resolves the cross-referenced BUG-SEC-008 (NUL-byte handling).
- **Endpoint:** `POST /api/register/`
- **Repro:**

  ```bash
  # Length boundary
  curl -i -X POST https://django-login-api.vercel.app/api/register/ \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$(python3 -c 'print("u"*151)')\",\"password\":\"ValidPass!42x\"}"
  # -> HTTP/2 500, Content-Type: text/html; charset=utf-8
  # body: "<!doctype html>...Server Error (500)..."

  # Length 150 returns 201 (works exactly at the boundary)
  # Length 200, 300: also 500

  # NUL byte anywhere in the username
  curl -i -X POST .../api/register/ \
    -d $'{"username":"qa-api-1778950827-nul\u0000x","password":"ValidPass!42x"}'
  # -> 500 HTML
  ```
- **Expected:** `400 {"detail":"<reason>"}` JSON for both. The view's documented contract is "every error path returns `{detail: <string>}`."
- **Actual:** Uncaught exceptions in `accounts/services.py::register_user`. The 151-char case is `DataError` (column overflow); the NUL-byte case is `ValueError: A string literal cannot contain NUL (0x00) characters` from psycopg2. Both bypass the `try/except ValidationError` in `register_api` and become a Django 500 HTML page.
- **Why it matters:**
  - The UI does `await response.json()` after every API call; this branch crashes the UI with a JSON parse error instead of showing a clean form error.
  - Returning HTML from a JSON API is information leakage and contract drift.
- **Suggested fix:** Validate length and forbidden characters before hitting the database, raise `ValidationError`:
  ```python
  # accounts/services.py::register_user
  if len(username) > 150:
      raise ValidationError("Username must be 150 characters or fewer.")
  if "\x00" in username:
      raise ValidationError("Username contains invalid characters.")
  ```
  Or cleaner: `User._meta.get_field("username").run_validators(username)` and let Django's field-level validators raise.

---

### 🟠 BUG-API-004 — Whitespace-only password (8 spaces) passes registration

- **Severity:** High
- **Status:** open
- **Endpoint:** `POST /api/register/`
- **Repro:**

  ```bash
  curl -i -X POST https://django-login-api.vercel.app/api/register/ \
    -H 'Content-Type: application/json' \
    -d '{"username":"qa-api-1778950827-wsp","password":"        "}'
  # -> 201 {"username":"qa-api-1778950827-wsp"}
  ```

  Subsequent login with the same 8-space password also returns 200.
- **Expected:** Reject as invalid. At minimum, password should be `.strip()`-ed and re-validated.
- **Actual:** Django's default validators accept `"        "`: 8 chars, not similar to username, not in CommonPasswordValidator, not entirely numeric. Real account created, auto-logged-in.
- **Suggested fix:** Either strip the password before `validate_password` and reject if the stripped value is too short, or add a custom validator that rejects `password.strip() == ""` or `len(password.strip()) < 8`. Most defensible: strip + revalidate.
- **Source reference:** `accounts/services.py:21` (`validate_password(password, ...)` is called on the raw, unstripped value).

---

### 🟠 BUG-API-005 — Username uniqueness is case-insensitive, but login is case-sensitive

- **Severity:** High (contract inconsistency + lockout risk)
- **Status:** open
- **Endpoint:** `POST /api/register/` vs. `POST /api/login/`
- **Repro:**

  ```bash
  # 1. Register Alice
  POST /api/register/ {"username":"Alice-1778950827","password":"..."}
  # -> 201

  # 2. Try to register alice (lowercase)
  POST /api/register/ {"username":"alice-1778950827","password":"..."}
  # -> 400 {"detail":"That username is already taken."}     ← case-insensitive

  # 3. But login as alice (the rejected lowercase form) fails:
  POST /api/login/ {"username":"alice-1778950827","password":"<correct>"}
  # -> 400 {"detail":"Invalid username or password."}        ← case-sensitive

  # 4. Login as ALICE: also 400
  # 5. Login as Alice (exact case): 200
  ```
- **Expected:** Either login is case-insensitive (same as uniqueness), or registration stores the username lowercased so the views agree.
- **Actual:** Registration checks duplicates with `username__iexact` (so `alice` collides with `Alice`), but `authenticate(username=username)` uses the default `ModelBackend` which does an exact (`username=`) lookup, case-sensitive on PostgreSQL.
- **Why it matters:** A user who types their username with different capitalization at login time gets "Invalid username or password" — indistinguishable from a wrong-password error. Support can't tell the two apart. Combined with no rate limiting, those wrong-case attempts also accumulate as real failed-login events.
- **Suggested fix:** Normalize username to lowercase on store (`username = username.strip().lower()` in `register_user` and `authenticate_user`). Simpler than installing a case-insensitive auth backend, and it also resolves the related case-handling ambiguity at the storage layer.
- **Source reference:** `accounts/services.py:9-15` (login path; un-normalized), `accounts/services.py:19` (duplicate check is case-insensitive).

---

### 🟠 BUG-API-006 — `CSRF_TRUSTED_ORIGINS` doesn't include the public UI hostname (`django-login-web.vercel.app`)

- **Severity:** High (the public UI cannot perform any authenticated POST today — logout is broken)
- **Status:** open
- **Endpoint:** Any authenticated POST. Observed on `/api/logout/`.
- **Repro:**

  ```bash
  # After a successful login (sessionid + csrftoken cookies in hand)
  curl -i -X POST https://django-login-api.vercel.app/api/logout/ \
    -H 'Origin: https://django-login-web.vercel.app' \
    -H 'X-CSRFToken: <token>' \
    -b 'sessionid=...; csrftoken=...'
  # -> 403 {"detail":"CSRF Failed: Origin checking failed —
  #                  https://django-login-web.vercel.app does not match
  #                  any trusted origins."}
  ```
- **Expected:** 204 No Content.
- **Actual:** 403 because `CSRF_TRUSTED_ORIGINS` in `config/settings.py` does not include `https://django-login-web.vercel.app`. (The list is built from `FRONTEND_ORIGIN`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL`, and an env var — none of which currently produce the `-web` hostname.)
- **Why it matters:** This is the *new* public UI hostname (we switched from `django-login-app.vercel.app` to `django-login-web.vercel.app` today after a Vercel project shuffle). The UI can register and log in (those endpoints don't enforce CSRF — see BUG-API-001), but logged-in users **cannot log out**, because logout is the one endpoint that *does* enforce it. Demo will break on logout.
- **Suggested fix:** Add `https://django-login-web.vercel.app` to `CSRF_TRUSTED_ORIGINS` (and `CORS_ALLOWED_ORIGINS` for completeness) via the `FRONTEND_ORIGIN` env var on the API's Vercel project, or hardcode it as a default in `config/settings.py`.
- **Source reference:** `config/settings.py:201-225` (CSRF_TRUSTED_ORIGINS assembly).

---

### 🟠 BUG-API-007 — Logout does not invalidate server-side session

- **Severity:** High
- **Status:** open
- **Endpoint:** `POST /api/logout/`
- **Repro:**

  ```python
  # 1. Register + auto-login. Capture the sessionid cookie.
  saved_sid = "...captured value..."

  # 2. GET /api/me/ with that sessionid -> 200 (works as expected)

  # 3. POST /api/logout/ with the same sessionid -> 204 (cookie cleared client-side)

  # 4. Replay the OLD sessionid value (the user "lost" on logout):
  GET /api/me/  Cookie: sessionid=<the saved value>
  # -> 200 {"username":"..."} ← still authenticated
  ```

  Verified end-to-end this run: probe 12.
- **Expected:** 401/403 after step 4 — logout should invalidate the session server-side.
- **Actual:** The captured cookie remains fully valid. Root cause: `SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies"` on Vercel (`config/settings.py:236`). With signed cookies, the server keeps no record of issued sessions, so `logout()` can only clear the cookie on the client; it can't revoke it. Any scenario that exposes a cookie value (malware, screen-share, shared device, future XSS) gives an attacker valid auth for the cookie's lifetime — `SESSION_COOKIE_AGE = 1209600` by default = 14 days.
- **Suggested fix:** Switch to `django.contrib.sessions.backends.db` (or `cached_db` if a cache is added). Sessions live in `django_session`, `logout()` deletes the row, the cookie becomes worthless immediately. Adds 1 DB round-trip per authenticated request; on Neon serverless that's fine.

  Alternative if staying on `signed_cookies`: add a `session_version` int on the User model that's encoded into the session and verified on every request; bumping it forces invalidation.
- **Source reference:** `config/settings.py:236` (`SESSION_ENGINE = "signed_cookies"` when `ON_VERCEL`).

---

### 🟡 BUG-API-008 — Username is stored unsanitized; script tags accepted

- **Severity:** Medium (no live XSS sink found, but the data is on file)
- **Status:** open
- **Endpoint:** `POST /api/register/`
- **Repro:**

  ```bash
  curl -i -X POST .../api/register/ \
    -d '{"username":"qa-api-1778950827-<script>alert(1)</script>","password":"Pa55w0rd!xyz"}'
  # -> 201 {"username":"qa-api-1778950827-<script>alert(1)</script>"}
  ```

  Account exists; the literal string `<script>alert(1)</script>` is stored as the username.
- **Expected:** Either reject usernames containing HTML special characters and control characters, or guarantee they are escaped at every render site (admin, attempts list, etc.) and document the policy.
- **Actual:** No server-side validation beyond Django's default `AbstractUser.username` field validator, which is permissive. The username appears verbatim in `/api/attempts/` responses and in the Django admin (the admin escapes it; the JSON response is consumed by React which also escapes by default — but any future renderer that doesn't escape is a stored XSS site).
- **Why it matters:** Low immediate impact; high "first thing an attacker tries" exposure. Also: this combines with BUG-API-002 (the attempts table is world-readable) to make stored XSS payloads visible to every authenticated user.
- **Suggested fix:** Add a username validator that allows letters/numbers/`_`/`-`/`.`/`@` and rejects everything else, similar to Django's `UnicodeUsernameValidator` but tightened. Or set an explicit allow-list regex on the model.

---

### 🟡 BUG-API-009 — Unauthenticated → 403 instead of 401 on protected endpoints

- **Severity:** Medium (contract drift; RFC 7235 says 401 when no credentials are presented)
- **Status:** open
- **Endpoint:** `GET /api/me/`, `GET /api/attempts/`, `POST /api/logout/`
- **Repro:**

  ```bash
  curl -i https://django-login-api.vercel.app/api/me/
  # -> 403 {"detail":"Authentication credentials were not provided."}
  ```

  All three protected endpoints behave the same way.
- **Expected:** `401 Unauthorized` when no credentials are presented; `403 Forbidden` only for "authenticated but not allowed."
- **Actual:** DRF's default behavior. `IsAuthenticated` returns 403 regardless of whether credentials were attempted, because DRF doesn't try to inspect the auth attempt class.
- **Suggested fix:** Either accept this as a DRF convention and document it, or add a custom `IsAuthenticatedOr401` permission class. Marked Medium — the api-tester SKILL says `401 or 403` is acceptable contract; calling this out because the semantic difference matters to API consumers and might mask BUG-API-001 from clients that branch on 401-vs-403.

---

### 🟡 BUG-API-010 — Wrong-method on protected endpoint returns 403 (unauth) instead of 405 (method)

- **Severity:** Medium (contract drift; auth runs before method dispatch)
- **Status:** open
- **Endpoint:** `GET /api/logout/`, `DELETE /api/me/`, `PUT /api/me/`, etc.
- **Repro:**

  ```bash
  curl -i -X GET https://django-login-api.vercel.app/api/logout/
  # -> 403 {"detail":"Authentication credentials were not provided."}
  # Expected: 405 Method Not Allowed
  ```

  By contrast, `/api/csrf/` (which doesn't require auth) correctly returns 405 on POST/PUT/DELETE/PATCH.
- **Expected:** 405 — the method isn't allowed regardless of auth.
- **Actual:** DRF's permission classes run before method dispatch, so unauthenticated callers see 403 even on disallowed methods. Once authenticated, you'd see 405. Information disclosure is minimal but the contract is confusing.
- **Suggested fix:** Acceptable as DRF default. Marked Medium for completeness; would only fix if the contract becomes load-bearing.

---

## Tested but clean

- `GET /api/csrf/` — returns `{"csrfToken":"..."}` with `Set-Cookie: csrftoken=...; SameSite=None; Secure; Max-Age=31449600; Path=/` (no `HttpOnly`, which is correct since JS needs to read it). ✓
- `POST/PUT/DELETE/PATCH /api/csrf/` — all return 405 with JSON `{"detail":"Method ... not allowed."}`. ✓ (Note this is correct because `/api/csrf/` is `AllowAny`, so the method check actually fires before auth.)
- Empty username on register — 400 `{"detail":"Username is required."}` (also fires for whitespace-only after strip). ✓
- Missing username key on register — same 400. ✓
- 7-char password — rejected by `MinimumLengthValidator`. ✓
- Numeric-only password — rejected by `NumericPasswordValidator`. ✓
- Password equal to username — rejected by `UserAttributeSimilarityValidator`. ✓
- `"password"` literal — rejected by `CommonPasswordValidator`. ✓
- Username at exactly 150 chars — 201 accepted. ✓ (Cliff is at 151; see BUG-API-003.)
- Unicode emoji username (`🎉happy`) — 201, stored and queryable. ✓
- Whitespace-padded username — stored stripped. ✓
- Duplicate registration (exact case) — 400 `{"detail":"That username is already taken."}`. ✓
- Duplicate registration (different case) — same 400 (BUT see BUG-API-005). ✓
- `text/plain` body on `/api/login/` — 415 `{"detail":"Unsupported media type \"text/plain\" in request."}`. ✓
- Auto-login after register — `GET /api/me/` immediately after `POST /api/register/` on the same session returns 200 with the new username. ✓
- Method enforcement on `/api/me/`, `/api/attempts/`, `/api/logout/` — *for authenticated callers* would be 405; unauthenticated callers get 403 first (BUG-API-010).

## Cookie snapshot

```
Set-Cookie: csrftoken=<32 chars>; expires=Sat, 15 May 2027 17:00:27 GMT;
            Max-Age=31449600; Path=/; SameSite=None; Secure

Set-Cookie: sessionid=.eJxV...; expires=Sat, 30 May 2026 17:00:50 GMT;
            HttpOnly; Max-Age=1209600; Path=/; SameSite=None; Secure
```

`sessionid` is `HttpOnly`, `Secure`, `SameSite=None`. `csrftoken` is `Secure`, `SameSite=None`, no `HttpOnly` (correct — JS needs to read it). Cross-origin cookie config is correct for the two-origin deployment. ✓

## Throwaway accounts created

All prefixed `qa-api-1778950827-`:

- `qa-api-1778950827-wsp` (whitespace-only password)
- `qa-api-1778950827-150c` (and one with 150 `a`s)
- `qa-api-1778950827-🎉happy` (unicode emoji)
- `qa-api-1778950827-ws` (whitespace-padded username, stored stripped)
- `qa-api-1778950827-<script>alert(1)</script>` (XSS payload as username)
- `Alice-1778950827` (case-sensitivity probe)
- `qa-api-1778950827-auto` (auto-login probe)
- `qa-api-1778950827-csrf` (CSRF probes)
- `qa-api-1778950827-leakX`, `qa-api-1778950827-leakY` (attempts-leak probe)
- `qa-api-1778950827-li` (logout-invalidation probe)

11 throwaway accounts total. Cleanup tracked at the bottom of `qa/findings.md`.

## What I did NOT test

- **Rate limiting** — out of scope (security-tester).
- **Timing attacks** on login — out of scope (security-tester).
- **Brute-force / DoS** payloads — explicitly not allowed.
- **Local stack** — only production was probed.
- **`frontend/lib/api.ts` consumer parity** — I read the API contract from the API side; cross-checking the UI's expectations is a follow-up. BUG-API-003 (HTML 500) almost certainly breaks the UI today; BUG-API-006 (logout CSRF) definitely does.
- **Admin site** (`/admin/`) — out of scope (security-tester).

## Notes for Q (manager)

- **Run type disclosure:** this report was produced by the manager (Q) running probes inline on opus after the dispatched specialist (`ollama/qwen2.5:14b`) finished empty. Per the model-policy paragraph in `qa/SKILL.md`, that fallback is permitted and must be disclosed; this section satisfies that requirement.
- **Headline:** BUG-API-001 (CSRF off) is the single highest-impact finding. Fixing it also makes BUG-API-006 (CSRF_TRUSTED_ORIGINS missing) actually matter end-to-end; right now BUG-API-006 only affects `/api/logout/` because that's the only authenticated POST. Order of operations matters when fixing.
- **Database bloat:** the `LoginAttempt` table now has 167 rows, ~98% QA noise. Cleanup query at the bottom of `qa/findings.md`.
- **Compared to this morning's run:** new findings this round are BUG-API-006 (CSRF_TRUSTED_ORIGINS — surfaced by today's switch to `-web` as the public hostname) and a tightened reading of BUG-API-003 (NUL byte + length both produce the same 500 HTML path). Everything else is consistent with the 08:40 run.
