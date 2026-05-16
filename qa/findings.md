# QA Findings — django-login-app

Top-level **index** of all findings across specialists, plus manager-direct
findings (things Q catches outside any specialist run).

See [`README.md`](README.md) for the ID-prefix scheme and conventions.

**Last updated:** 2026-05-16 (after api-tester run1 + security-tester run1)

---

## Verdict (release readiness)

🚫 **NO-GO for any new user growth.** The current production deployment has two
🔴 Critical issues that combine into a credible attack chain: CSRF is silently
off on `/api/login/` and `/api/register/` (BUG-SEC-002 / BUG-API-001), and
logout does not invalidate the session cookie (BUG-SEC-001) because of the
`signed_cookies` session engine on Vercel. Multiple 🟠 High issues amplify
this (no rate limiting, register enumeration, `/api/attempts/` leaks the
whole table, ~2 s CPU per registration with no password length cap).

Fix order: **BUG-SEC-002 → BUG-SEC-001 → BUG-002 → BUG-SEC-003 → BUG-API-002 → the rest.**

## Index by source

| Source | File | Open | Fixed | Verified | Won't-fix |
|---|---|---:|---:|---:|---:|
| Manager-direct (`BUG-NNN`) | [`findings.md`](findings.md) (this file) | 2 | 0 | 0 | 0 |
| api-tester (`BUG-API-NNN`) | [`specialists/api-tester/findings.md`](specialists/api-tester/findings.md) | 7 | 0 | 0 | 0 |
| security-tester (`BUG-SEC-NNN`) | [`specialists/security-tester/findings.md`](specialists/security-tester/findings.md) | 11 | 0 | 0 | 0 |
| ui-tester (`BUG-UI-NNN`) | _planned_ | — | — | — | — |
| data-tester (`BUG-DATA-NNN`) | _planned_ | — | — | — | — |
| exploratory-tester (`BUG-EXP-NNN`) | _planned_ | — | — | — | — |
| **Total** | | **20** | **0** | **0** | **0** |

> Note: BUG-API-001 and BUG-SEC-002 describe the same root-cause bug from
> two angles (contract drift vs. CSRF bypass). BUG-SEC-002 is canonical;
> BUG-API-001 cross-references it. They're counted once each above because
> each file owns one entry, but they should be fixed as a single change.

## Index by severity (across all files)

| Severity | Open | Highlights |
|---|---:|---|
| 🔴 Critical | 4 | [BUG-SEC-002 / BUG-API-001](specialists/security-tester/findings.md) (CSRF off), [BUG-SEC-001](specialists/security-tester/findings.md) (logout doesn't invalidate session), [BUG-002](#-bug-002--apiattempts-leaks-all-users-login-attempts-to-any-authenticated-user) (attempts table leaks), [BUG-API-002](specialists/api-tester/findings.md) (500 HTML on long usernames) |
| 🟠 High | 6 | No rate limiting, register-endpoint enumeration, password-length DoS, whitespace-only password accepted, case-insensitive register vs case-sensitive login, attempts table escalation |
| 🟡 Medium | 6 | Username sanitization gaps, NUL-byte 500, public admin, long-lived CSRF cookie, 403-instead-of-401 contract drift, wrong-method 403-instead-of-405 |
| 🟢 Low | 3 | API root bare 404 (BUG-001), DRF browsable-API HTML leak, NFC/NFD unicode normalization mismatch |

---

## Manager-direct findings

These are bugs Q caught during recon, PR review, prod smoke, or other work
that didn't go through a specialist. ID prefix: `BUG-NNN`.

### Open

#### 🟢 BUG-001 — API host root returns bare 404 with no guidance

- **Severity:** Low
- **Status:** open
- **Found:** 2026-05-15 by Q (reported by May)
- **Where:** https://django-login-api.vercel.app/ (Django API host, root path)

**Repro:**
1. Open `https://django-login-api.vercel.app/` in any browser.
2. Observe response.

**Expected:** A helpful response — either a redirect to the UI (`https://django-login-app.vercel.app/`) or a minimal landing page that says something like "This is the API for django-login-app. The app lives at ___."

**Actual:**
```
Not Found
The requested resource was not found on this server.
```

A bare 404 page. No branding, no link, no hint that the user is on the wrong host.

**Why it matters:**
- Users who type the wrong URL (easy mistake — the two hosts differ by only `app` vs `api`) or follow an outdated link hit a dead end with zero guidance.
- The project owner (May) hit this herself when sanity-checking the deployment. If the developer trips on it, real users will too.
- Cheap to fix; meaningful UX improvement.

**Suggested fix (pick one):**
1. Add a Django URL pattern at `/` that returns a 200 with a short HTML page linking to the UI.
2. Or 301/302 redirect `/` to `FRONTEND_ORIGIN` (the env var already exists in `config/settings.py`).
3. At minimum, customize the 404 page to mention this is the API and link to the UI host.

**Notes:**
- Strictly speaking, returning 404 for `/` on an API host is *correct* — there's no resource there. This is a UX finding, not a functional defect. Logged as Low for that reason.
- `/api/csrf/` and `/admin/` on the same host work as expected.

---

#### 🔴 BUG-002 — `/api/attempts/` leaks all users' login attempts to any authenticated user

- **Severity:** Critical (privacy / info disclosure / aids account enumeration)
- **Status:** open
- **Found:** 2026-05-16 by Q (verified against live prod)
- **Where:** `GET https://django-login-api.vercel.app/api/attempts/`
  - Code: `accounts/api_views.py::attempts_api` → `accounts/services.py::serialize_attempts`

> **Cross-ref:** the security-tester elevated this same bug to a High in
> their own queue as [`BUG-SEC-005`](specialists/security-tester/findings.md)
> because of how it compounds with their other findings (rate-limit gap,
> register enumeration). BUG-002 here is canonical; BUG-SEC-005 stays as
> an in-context cross-reference.

**Repro (verified against prod 2026-05-16):**

1. Register two throwaway accounts E and F in separate sessions.
2. From an unauthenticated session, attempt a failed login as E.
3. Log in as F.
4. `GET /api/attempts/` while authenticated as F.

**Expected:**
F sees only F's own login attempts (or, if intentionally global, this should be admin-only behind `IsAdminUser` and clearly documented as such).

**Actual:**
F receives **every** `LoginAttempt` row in the database: 42 rows total, of which 39 belong to other users (including the just-created failed-login event for user E and historical attempts from prior QA accounts).

```text
attempts as F: 200
  total 42 | E:2 F:1 OTHER:39
  sample OTHER rows include:
    {"timestamp":"2026-05-16T12:20:39.487013+00:00","username":"qa-q-1778934037-c","success":false}
```

**Why it matters:**
- Any registered user can enumerate every other account's username (account enumeration).
- Failed-login patterns are visible, which is **attack-pattern intelligence**: an attacker can see who's being brute-forced, when, and from what guessed usernames.
- Combined with no rate limiting (BUG-SEC-003) and CSRF off (BUG-SEC-002 / BUG-API-001), this lowers the bar for credential-stuffing campaigns considerably.
- This is privacy-relevant: a "login attempts" log is reasonable to expose to *the account's owner*, never to arbitrary peers.

**Suggested fix:**
1. Scope the queryset to the current user:
   ```python
   def serialize_attempts(user):
       qs = LoginAttempt.objects.filter(username__iexact=user.username)
       return [...]
   ```
   And in the view: `services.serialize_attempts(request.user)`.
2. If a global view is genuinely wanted for staff, add a separate `/api/admin/attempts/` gated by `IsAdminUser`.
3. Consider also storing a FK to `User` (nullable for failed attempts on unknown usernames) instead of just `username: CharField`, so filtering is on a real relationship rather than a stringly-typed column.

**Notes:**
- Caught by manager (Q) during recon, before specialists ran, by reading `services.py::serialize_attempts` which does `LoginAttempt.objects.all()` with no user filter.
- The model has no `user` FK at all (`username: CharField(150)`), which is intentional for logging failures on unknown usernames but makes correct scoping a string-equality check on the authenticated user's username.

---

### Fixed / Verified / Won't-fix

_(none yet)_

---

## Cross-file cleanup / follow-ups

| Item | Owner | Notes |
|---|---|---|
| Clean up QA throwaway accounts in prod DB | May (or Q via admin) | Anything matching `username LIKE 'qa-q-%' OR 'qa-api-%' OR 'qa-sec-%' OR 'qa-verify-%'`. Plus 4 payload-named accounts from the XSS probe: `<script>alert(1)</script>`, `"><svg/onload=alert(1)>`, `normaluser\r\nInjected-Header: yes`, `admin' OR '1'='1`. |
| Add a management command `python manage.py purge_qa_accounts` | _unassigned_ | Would let QA self-clean future runs without admin UI. |
| Confirm BUG-SEC-002 fix doesn't break the Next.js UI flow | _ui-tester (when it exists)_ | Once CSRF is correctly enforced, `frontend/lib/api.ts` must still work — it already fetches `/api/csrf/` first, so it *should* keep working, but verify. |
| Decide on session-engine direction | May | BUG-SEC-001 fix requires a real call: move off `signed_cookies` (DB-backed sessions, 1 extra round-trip per request on Neon), or add a session-version revocation column. Architectural, not pure QA. |
| Rotate `DJANGO_SECRET_KEY` after the session-engine fix lands | May | Existing signed cookies stay valid until the key changes. |
| `pip-audit` / `safety` dependency scan | _security-tester (next dispatch)_ | Not done this run. |
