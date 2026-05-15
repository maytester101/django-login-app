# qa/ — QA workspace for django-login-app

Home for all QA artifacts: findings, test plans, strategies, manual checklists, and (later) automated test scaffolding.

Owned by **Q** (QA manager). Updated as we go.

## Files

| File | Purpose |
|------|---------|
| `findings.md` | Running bug log. Every bug, UX issue, or risk gets an ID and an entry here. |
| _(more to come)_ | Test plans, strategy docs, exploratory checklists, automation. |

## Conventions

### Finding IDs

- Format: `BUG-NNN` (sequential, zero-padded to 3 digits)
- Once assigned, **never reused**. Even if a bug is closed, its ID stays in the log.

### Severity

| Level | Meaning |
|-------|---------|
| 🔴 **Critical** | Security hole, data loss, auth bypass, total outage. Drop everything. |
| 🟠 **High** | Core flow broken for many users. Fix before next release. |
| 🟡 **Medium** | Functional bug or significant UX issue. Schedule a fix. |
| 🟢 **Low** | Minor polish, edge case, dev-experience nit. Fix when convenient. |

### Status

- `open` — found, not yet fixed
- `in-progress` — someone's working on it
- `fixed` — fix merged, awaiting verification
- `verified` — fix confirmed in production
- `wontfix` — accepted as designed, with reason

### Logging a bug

Add an entry to `findings.md` under the right severity. Include:

- **What** — one-line summary
- **Where** — URL, endpoint, file, or screen
- **Repro** — steps a human can follow
- **Expected vs actual**
- **Why it matters** — user impact, not just "it's wrong"
- **Suggested fix** (optional, but helpful)

Keep findings short. Long investigations get their own file under `qa/investigations/`.
