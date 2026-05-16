# Agent Bug Report

Shared bug log for findings reported by the persistent QA agents `C-API` and
`C-UI`.

## How To Use

- Add new findings under the agent that found them.
- Keep reproduction steps short and specific.
- Use the severity scale: Critical, High, Medium, Low.
- Do not mark a bug fixed until it has been retested.

## C-API Findings

### Run Metadata

- **Agent:** `C-API`
- **Configured AI model:** Ollama `qwen2.5:14b`
- **Testing target:** `https://django-login-api.vercel.app`
- **Testing started:** 2026-05-16 7:26 PM UTC-4
- **Testing ended:** 2026-05-16 7:29 PM UTC-4
- **Result:** No reproducible C-API bugs found.

No C-API findings logged yet.

## C-UI Findings

### Run Metadata

- **Agent:** `C-UI`
- **Configured AI model:** Ollama `gpt-oss:20b`
- **Testing target:** `https://django-login-web.vercel.app`
- **Testing started:** 2026-05-16 7:45 PM UTC-4
- **Testing ended:** 2026-05-16 7:50 PM UTC-4
- **Result:** Core UI auth flows passed; one stale report-content issue was
  found and corrected in this report update.
- **Note:** Local Ollama triage with `gpt-oss:20b` stalled without output; the
  findings below are browser-confirmed from the C-UI pass.

### Medium Invalid Login Has No Visible Error

- **Status:** Verified fixed on 2026-05-16 7:47 PM UTC-4
- **Where:** Sign-in page `/`
- **Repro:**
  1. Open `https://django-login-web.vercel.app/`.
  2. Enter an invalid username and password.
  3. Click `Sign in`.
- **Expected:** A clear red error message appears.
- **Actual:** The API rejects the login, but the page shows no visible error.
- **Evidence:** `POST https://django-login-api.vercel.app/api/login/` returned
  `400`; the browser stayed on `/` with no visible error text.
- **Retest evidence:** Invalid login with `qa-c-ui-no-such-user-2` showed the
  visible red alert `Invalid username or password.`.

### Medium Duplicate Username Has No Visible Error

- **Status:** Verified fixed on 2026-05-16 7:48 PM UTC-4
- **Where:** Create account page `/register`
- **Repro:**
  1. Open `https://django-login-web.vercel.app/register`.
  2. Enter a username that already exists.
  3. Enter any valid password.
  4. Click `Create account`.
- **Expected:** A clear duplicate-username error appears.
- **Actual:** The API rejects the registration, but the page shows no visible
  error.
- **Evidence:** `POST https://django-login-api.vercel.app/api/register/`
  returned `400`; the browser stayed on `/register` with no visible error text.
- **Retest evidence:** Duplicate registration for `qa-c-ui-1778975250` showed
  the visible red alert `That username is already taken.`.

### Low Agent Bug Report Had Stale C-UI Metadata

- **Status:** Verified fixed on 2026-05-16 7:54 PM UTC-4
- **Where:** Agent bug report page `/agent-bugs`
- **Repro:**
  1. Open `https://django-login-web.vercel.app/agent-bugs`.
  2. Inspect the C-UI run metadata.
- **Expected:** The report shows the latest configured C-UI model and current
  statuses from the latest C-UI run.
- **Actual:** The deployed page showed stale C-UI model metadata and old open
  statuses after C-UI was switched to `gpt-oss:20b`.
- **Evidence:** During the 2026-05-16 7:45 PM UTC-4 C-UI run, `/agent-bugs`
  rendered `qwen2.5:32b` and old open findings while `C-UI.json` configured
  `gpt-oss:20b`.
- **Retest evidence:** This report now records `gpt-oss:20b` and marks the
  previously fixed C-UI findings as verified fixed.

### Low Attempts Table May Have Accessibility Exposure Issue

- **Status:** Open
- **Where:** Login attempts page `/attempts`
- **Repro:**
  1. Register or log in with a valid throwaway user.
  2. Land on `https://django-login-web.vercel.app/attempts`.
  3. Inspect the page with the browser accessibility snapshot.
- **Expected:** The attempts table headers and rows are exposed in the
  accessibility tree.
- **Actual:** The table was visible on screen, but the accessibility snapshot
  exposed only `Login attempts`, the signed-in text, and `Log out`.
- **Evidence:** Visual screenshot showed the attempts table; accessibility
  snapshot omitted table headers and rows.
