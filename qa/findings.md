# QA Findings — django-login-app

Top-level **index** of all findings across specialists, plus manager-direct
findings (things Q catches outside any specialist run).

See [`README.md`](README.md) for the ID-prefix scheme and conventions.

**Last updated:** 2026-05-16 (after 3 Critical fixes shipped & verified live — PRs #13, #14, #15)

---

## Verdict (release readiness)

🟡 **Improved but not yet GO.** Today's three Critical fixes are live on
prod and verified, but one 🔴 Critical is still open (BUG-SEC-001 — logout
doesn't invalidate the server-side session because of `signed_cookies`),
and seven 🟠 Highs remain. Demo URL is unblocked: logout now works from
`django-login-web.vercel.app` (BUG-API-006 was bundled into the CSRF fix).

**What shipped today (2026-05-16):**

| PR | Commit | Resolved | Verified live |
|----|--------|----------|---------------|
| #13 | `ca58667` | BUG-API-002 / BUG-002 / BUG-SEC-005 (attempts scope) | ✅ 1 row to own user, 0 to others |
| #14 | `fa08c58` | BUG-API-003 / BUG-SEC-008 (long & NUL-byte usernames) | ✅ both return JSON 400, not HTML 500 |
| #15 | `2f32a1f` | BUG-API-001 / BUG-SEC-002 (CSRF enforcement) + BUG-API-006 (CSRF_TRUSTED_ORIGINS for `-web`) | ✅ 6/6 attacker postures now 403; happy path login still 200 |

**Suggested remaining fix order:**
  1. **BUG-SEC-001** — switch to DB-backed sessions so logout actually
     revokes the server-side session (currently a 14-day stolen-cookie
     window). Architectural; needs the migration to land.
  2. **BUG-API-007** — cross-ref of BUG-SEC-001; will be resolved by the
     same change.
  3. **BUG-SEC-003** — add `django-axes` for rate limiting (or a similar
     Postgres-backed solution).
  4. **BUG-API-005** — normalize username case so login and register
     agree (one-line change in `register_user` + `authenticate_user`).
  5. **BUG-API-004** — reject whitespace-only passwords.
  6. Remaining 🟡 Mediums per the specialist files.

## Index by source

| Source | File | Open | Verified | Won't-fix |
|---|---|---:|---:|---:|
| Manager-direct (`BUG-NNN`) | [`findings.md`](findings.md) (this file) | 1 | 1 | 0 |
| api-tester (`BUG-API-NNN`) | [`specialists/api-tester/findings.md`](specialists/api-tester/findings.md) | 7 | 3 | 0 |
| security-tester (`BUG-SEC-NNN`) | [`specialists/security-tester/findings.md`](specialists/security-tester/findings.md) | 8 | 3 | 0 |
| ui-tester (`BUG-UI-NNN`) | [`specialists/ui-tester/findings.md`](specialists/ui-tester/findings.md) | 0 _(no runs yet)_ | — | — |
| data-tester (`BUG-DATA-NNN`) | [`specialists/data-tester/findings.md`](specialists/data-tester/findings.md) | 0 _(no runs yet)_ | — | — |
| exploratory-tester (`BUG-EXP-NNN`) | [`specialists/exploratory-tester/findings.md`](specialists/exploratory-tester/findings.md) | 0 _(no runs yet)_ | — | — |
| **Total** | | **16** | **7** | **0** |

> Notes on cross-references:
>
> - **BUG-API-001** and **BUG-SEC-002** are the same root-cause bug from two
>   angles (contract drift vs. CSRF bypass). Counted once in each file.
> - **BUG-API-002** (api-tester run2) and **BUG-002** (manager-direct, this
>   file) are also the same root-cause bug. BUG-API-002 is now canonical (it
>   has the live repro and is owned by the specialist); BUG-002 stays here as
>   a manager-pointer with cross-reference.
>
> The 23 in the total is literal heading count across files; the number of
> distinct **unique** bugs is 21.

## Index by severity (across all files)

Literal heading counts of OPEN findings (verified-fixed not included).
Unique-bug count is lower because of cross-references.

| Severity | Open | Highlights |
|---|---:|---|
| 🔴 Critical | 1 | **BUG-SEC-001** (logout doesn't invalidate session — `signed_cookies` engine has no server-side revocation) |
| 🟠 High | 7 | **API-004** (whitespace-only password accepted), **API-005** (case-insensitive register vs case-sensitive login), **API-007** (logout invalidation — cross-ref of **SEC-001**), **SEC-003** (no rate limiting), **SEC-004** (register-endpoint enumeration), **SEC-006** (password-length CPU DoS) |
| 🟡 Medium | 6 | **API-008** (username stored unsanitized; script-tag accepted), **API-009** (unauth → 403 not 401), **API-010** (wrong-method on protected endpoint → 403 not 405), **SEC-007** (username control-char gaps), **SEC-009** (public admin), **SEC-010** (long-lived CSRF cookie) |
| 🟢 Low | 2 | **BUG-001** (API host root bare 404), **SEC-011** (DRF browsable-API HTML leak) |

**Open totals:** 1 🔴 + 7 🟠 + 6 🟡 + 2 🟢 = **16 open findings.**
**Verified totals:** 5 🔴 + 1 🟠 + 1 🟡 + 0 🟢 = **7 verified-fixed** (across 3 fix-PRs landed today).

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
- **Status:** ✅ **verified fixed** 2026-05-16 13:20 EDT — see canonical entry **BUG-API-002** in [`specialists/api-tester/findings.md`](specialists/api-tester/findings.md). Fix shipped in PR #13 (commit `ca58667`); verification against live prod confirmed only own-rows are returned now.
- **Found:** 2026-05-16 by Q (verified against live prod)
- **Where:** `GET https://django-login-api.vercel.app/api/attempts/`
  - Code: `accounts/api_views.py::attempts_api` → `accounts/services.py::serialize_attempts`

> **Cross-references (updated 2026-05-16, api-tester run2):**
> - **BUG-API-002** in [`specialists/api-tester/findings.md`](specialists/api-tester/findings.md) is now the canonical entry for this bug. It has the latest live repro (167 rows visible from a 30-second-old throwaway account, 164 owned by other users).
> - **BUG-SEC-005** in [`specialists/security-tester/findings.md`](specialists/security-tester/findings.md) is the security-tester's view, elevated to High because of how the leak compounds with the rate-limit gap and register enumeration.
> - This entry (**BUG-002**) is kept as a manager-direct pointer for historical continuity — it's the first place the bug was logged. Body below remains accurate; the live counts have grown.

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
