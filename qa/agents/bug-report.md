# Agent Bug Report

Shared bug log for findings reported by the persistent QA agents `C-API` and
`C-UI`.

## How To Use

- Add new findings under the agent that found them.
- Keep reproduction steps short and specific.
- Use the severity scale: Critical, High, Medium, Low.
- Do not mark a bug fixed until it has been retested.

## C-API Findings

No C-API findings logged yet.

## C-UI Findings

### Medium Invalid Login Has No Visible Error

- **Status:** Open
- **Where:** Sign-in page `/`
- **Repro:**
  1. Open `https://django-login-web.vercel.app/`.
  2. Enter an invalid username and password.
  3. Click `Sign in`.
- **Expected:** A clear red error message appears.
- **Actual:** The API rejects the login, but the page shows no visible error.
- **Evidence:** `POST https://django-login-api.vercel.app/api/login/` returned
  `400`; the browser stayed on `/` with no visible error text.

### Medium Duplicate Username Has No Visible Error

- **Status:** Open
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
