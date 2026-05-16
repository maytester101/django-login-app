# qa/ — QA workspace for django-login-app

Home for all QA artifacts: findings, test plans, strategies, manual checklists, and (later) automated test scaffolding.

Owned by **Q** (QA manager). Updated as we go.

## Files & directories

| Path | Purpose |
|------|---------|
| `SKILL.md` | Q's manager playbook — how Q operates as QA lead for this repo. |
| `findings.md` | **Index** of all findings: counts, links to per-specialist files, and manager-direct findings (things Q catches outside any specialist's lane). |
| `specialists/<name>/findings.md` | Per-specialist findings file. Each specialist writes only into their own file. |
| `specialists/` | Specialist QA skills (api-tester, security-tester, ui-tester, etc.). Q dispatches these to ephemeral subagents. See [`specialists/README.md`](specialists/README.md). |
| `plans/` | Test plans for specific features or releases. _(empty for now)_ |
| `investigations/` | Long-form investigations that don't fit in a single finding. _(empty for now)_ |
| `release-notes/` | Per-release go/no-go writeups. _(empty for now)_ |

## Conventions

### Finding IDs

IDs are namespaced so it's obvious at a glance which specialist (or the manager) found a bug:

| Prefix | Owner / file |
|--------|--------------|
| `BUG-NNN` | Manager-direct findings (caught by Q during recon, PR review, prod smoke, etc.). Lives in `qa/findings.md`. |
| `BUG-API-NNN` | `api-tester` findings. Lives in `qa/specialists/api-tester/findings.md`. |
| `BUG-SEC-NNN` | `security-tester` findings. Lives in `qa/specialists/security-tester/findings.md`. |
| `BUG-UI-NNN` | `ui-tester` findings. Lives in `qa/specialists/ui-tester/findings.md`. |
| `BUG-DATA-NNN` | `data-tester` findings. Lives in `qa/specialists/data-tester/findings.md`. |
| `BUG-EXP-NNN` | `exploratory-tester` findings. Lives in `qa/specialists/exploratory-tester/findings.md`. |

Rules:

- Each prefix has its own sequential counter (zero-padded to 3 digits): e.g. `BUG-API-001`, `BUG-API-002`, ...
- Once assigned, **never reused**. Even if a bug is closed, its ID stays in the log.
- A bug is owned by **exactly one file**. If two specialists independently surface the same root cause, the manager picks the earliest/most-fitting file as canonical and cross-references it from the other (`See BUG-SEC-003`).
- The top-level `qa/findings.md` is an **index only** for specialist findings, plus a full entry for each manager-direct `BUG-NNN`.

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

Figure out the right file first:

- **You're a specialist** → append to your own `qa/specialists/<name>/findings.md` using your `BUG-<PREFIX>-NNN` counter.
- **You're the manager (Q)** finding something during recon / PR review / smoke → append to `qa/findings.md` under the "Manager-direct" section with a `BUG-NNN` id.

Include:

- **What** — one-line summary
- **Where** — URL, endpoint, file, or screen
- **Repro** — steps a human can follow
- **Expected vs actual**
- **Why it matters** — user impact, not just "it's wrong"
- **Suggested fix** (optional, but helpful)

After writing a specialist finding, the manager (Q) updates the **index** in `qa/findings.md` so the top-level counts and links stay current.

Keep findings short. Long investigations get their own file under `qa/investigations/`.
