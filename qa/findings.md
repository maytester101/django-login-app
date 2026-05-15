# QA Findings — django-login-app

Running log of bugs, UX issues, and risks. See [`README.md`](README.md) for conventions.

**Last updated:** 2026-05-15

---

## Open

### 🟢 BUG-001 — API host root returns bare 404 with no guidance

- **Severity:** Low
- **Status:** open
- **Found:** 2026-05-15 by Q (reported by May)
- **Where:** https://django-login-api.vercel.app/ (Django API host, root path)

**Repro:**
1. Open `https://django-login-api.vercel.app/` in any browser.
2. Observe response.

**Expected:** A helpful response — either a redirect to the UI (`https://django-login-app.vercel.app/`) or a minimal landing page that says something like "This is the API for django-login-app. The app lives at \_\_\_."

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

## Fixed / Verified / Won't-fix

_(none yet)_
