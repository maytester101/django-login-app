# qa/agents

Persistent named agent profiles for this project.

These are different from `qa/specialists/`:

- `qa/specialists/` contains role-specific playbooks that Q can hand to
  ephemeral specialist subagents.
- `qa/agents/` contains named agent profiles with both human-readable
  instructions and machine-readable configuration.

## Roster

| Agent | Role | Provider | Model | Files |
|---|---|---|---|---|
| `C-API` | API tester | Ollama | `qwen2.5:14b` | [`C-API.md`](C-API.md), [`C-API.json`](C-API.json) |
| `C-UI` | UI tester | Ollama | `gpt-oss:20b` | [`C-UI.md`](C-UI.md), [`C-UI.json`](C-UI.json) |

## Agent C-API

C-API is an API tester for `/api/csrf/`, `/api/register/`, `/api/login/`,
`/api/logout/`, `/api/me/`, and `/api/attempts/`. C-API verifies endpoint
contracts, auth/session boundaries, login-attempt visibility, duplicate
username handling, JSON error shapes, and CORS/CSRF behavior.

Use `C-API.md` when a human or AI needs instructions. Use `C-API.json` when an
automation needs stable config values such as model, provider, targets, and
constraints.

## Agent C-UI

C-UI is a UI tester for the Next.js pages `/`, `/register`, `/attempts`, and
`/findings`. C-UI verifies browser flows, visible errors, redirects, loading and
disabled states, basic accessibility, and console/network errors.

Use `C-UI.md` when a human or AI needs instructions. Use `C-UI.json` when an
automation needs stable config values such as model, provider, targets, and
constraints.

## Run Reports

Testing buttons on the local login page save per-run reports in `allReports/`.
Generated report files are local artifacts and are ignored by Git.
