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
| `api-tester` | ✅ [`api-tester/SKILL.md`](api-tester/SKILL.md) | `ollama/llama3.2:latest` | REST endpoint contracts: status codes, payloads, auth boundaries, error shapes |
| `security-tester` | ✅ [`security-tester/SKILL.md`](security-tester/SKILL.md) | `ollama/qwen2.5:14b` | Auth bypass, CSRF, injection, XSS, rate limiting, timing attacks |
| `ui-tester` | _planned (PR #5)_ | `ollama/llama3.2:latest` | End-to-end browser flows with Playwright; happy paths and error states |
| `data-tester` | _planned_ | `ollama/llama3.1:8b` | Model integrity, migration safety, login-attempt logging fidelity |
| `exploratory-tester` | _planned_ | `ollama/qwen2.5:14b` | Free-form "try to break it" sessions for high-risk releases |

**Model policy:** all specialists run on local Ollama models (free, no
hosted-API calls). Q (the manager) is the only role on a hosted model
(`opus`). Each specialist's `SKILL.md` documents the recommended model
in its "Recommended dispatch config" section.

**⚠️ Output verification:** specialist findings are first-pass triage.
Local models are smaller and weaker than frontier ones, so Q **must**
re-verify every finding before promoting it to `qa/findings.md`. See
each specialist's "Output verification" note.

When a specialist exists, its row gets a ✅ and the `Status` column shows
the file path.

## Conventions for specialist skills

Each `qa/specialists/<name>/SKILL.md` should:

1. **Start with YAML frontmatter** (`name`, `description`) so it can be
   discovered as a skill.
2. **Have a single, narrow focus.** No "general security tester that also
   does API contract testing." If you need both, dispatch both.
3. **List inputs** the specialist needs to do its job (file paths, URLs,
   credentials, throwaway account naming convention).
4. **Define the output format** explicitly — markdown findings ready to
   merge into `qa/findings.md`, with severity, repro, expected/actual, and
   suggested fix. Q (the manager) does the synthesis; specialists deliver
   raw findings in a known shape.
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
