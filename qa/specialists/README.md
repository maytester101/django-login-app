# qa/specialists/ — The QA team

Each subdirectory here is one **specialist QA role** with its own focused
playbook (a `SKILL.md`).

These aren't persistent agents — they're **playbooks that Q (the QA manager)
hands to ephemeral subagents** when a focused task needs that specialist's
perspective. Think of each one as a job description plus a checklist a
contractor reads before showing up to work.

See [`../SKILL.md`](../SKILL.md) for how Q decides which specialist to invoke
and how to dispatch them.

## Roster

| Specialist | Status | Model | Focus |
|---|---|---|---|
| `api-tester` | ✅ [`api-tester/SKILL.md`](api-tester/SKILL.md) | `ollama/qwen2.5:14b` | REST endpoint contracts: status codes, payloads, auth boundaries, error shapes |
| `security-tester` | ✅ [`security-tester/SKILL.md`](security-tester/SKILL.md) | `ollama/qwen2.5:14b` | Auth bypass, CSRF, injection, XSS, rate limiting, timing attacks |
| `ui-tester` | ✅ [`ui-tester/SKILL.md`](ui-tester/SKILL.md) | `ollama/qwen2.5:14b` | End-to-end browser flows with Playwright; happy paths, error states, cross-origin cookie behavior |
| `data-tester` | ✅ [`data-tester/SKILL.md`](data-tester/SKILL.md) | `ollama/qwen2.5:14b` | Schema integrity, migration safety, login-attempt logging fidelity, SQLite vs Neon parity |
| `exploratory-tester` | ✅ [`exploratory-tester/SKILL.md`](exploratory-tester/SKILL.md) | `ollama/qwen2.5:14b` | Free-form "try to break it" sessions for high-risk releases and bug-class follow-ups |

**Model policy:** all specialists default to **`ollama/qwen2.5:14b`** per
May's direction on 2026-05-16. **No opus fallback for specialist work** —
if a dispatch returns empty or malformed findings, the manager (Q) must
report the failure to the user and stop, NOT run the probes inline on
opus or retry against another local model. Q (the manager) still uses
opus for its own planning / review / synthesis work; specialist runs
stay on the local model regardless of outcome. If the local model
can't drive the workflow, the dispatch fails and the manager surfaces
that as a failed run.

**⚠️ Output verification:** specialist findings are first-pass triage.
Local models are smaller and weaker than frontier ones, so Q **must**
spot-check findings (especially high-severity ones) before relying on
them. See each specialist's "Output verification" note.

When a specialist exists, its row gets a ✅ and the `Status` column shows
the file path.

## Where findings go

Each specialist owns its own findings file. A placeholder findings.md
exists in each specialist directory; the first dispatch overwrites it.

- `qa/specialists/api-tester/findings.md`         (IDs: `BUG-API-NNN`)  — 7 open
- `qa/specialists/security-tester/findings.md`    (IDs: `BUG-SEC-NNN`)  — 11 open
- `qa/specialists/ui-tester/findings.md`          (IDs: `BUG-UI-NNN`)   — placeholder, no runs yet
- `qa/specialists/data-tester/findings.md`        (IDs: `BUG-DATA-NNN`) — placeholder, no runs yet
- `qa/specialists/exploratory-tester/findings.md` (IDs: `BUG-EXP-NNN`)  — placeholder, no runs yet

Specialists write **only** to their own file. The manager (Q) maintains
the top-level `qa/findings.md` as an **index** plus a "manager-direct"
section for things caught outside any specialist run (`BUG-NNN`).
See `qa/README.md` for the full ID-prefix scheme.

## Conventions for specialist skills

Each `qa/specialists/<name>/SKILL.md` should:

1. **Start with YAML frontmatter** (`name`, `description`) so it can be
   discovered as a skill.
2. **Have a single, narrow focus.** No "general security tester that also
   does API contract testing." If you need both, dispatch both.
3. **List inputs** the specialist needs to do its job (file paths, URLs,
   credentials, throwaway account naming convention).
4. **Define the output format** explicitly — the specialist writes its
   full report to `qa/specialists/<name>/findings.md` (overwriting prior
   content), using its own ID prefix (e.g. `BUG-API-NNN`). Findings must
   include severity, repro, expected/actual, and suggested fix. The
   specialist's final assistant message should be a short rollup (counts +
   file path); the manager reads the file directly.
5. **State constraints**: read-only by default, no prod writes without
   approval, never push to git, never modify code.
6. **Be self-contained.** A subagent reading the SKILL.md cold should be
   able to do the job without further conversation.

## Adding a specialist

1. Create `qa/specialists/<name>/SKILL.md` following the conventions above.
2. Add the row to the roster table here, marked ✅.
3. Update `qa/SKILL.md`'s "team" table with the new specialist and its
   trigger conditions.
4. Open a PR. Don't merge to `main` without review by May (see Q's
   manager skill — no self-merge for non-trivial additions).
