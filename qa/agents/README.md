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
| `C` | Tester | Ollama | `qwen2.5:14b` | [`C.md`](C.md), [`C.json`](C.json) |

## Agent C

C is a tester for registration, login, logout, login-attempt visibility,
duplicate usernames, UI error states, and cross-origin CSRF/session behavior.

Use `C.md` when a human or AI needs instructions. Use `C.json` when an
automation needs stable config values such as model, provider, targets, and
constraints.
