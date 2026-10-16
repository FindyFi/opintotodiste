# CLAUDE.md

## Start of every chat: check for a plan

Look for `/Users/samuel/github/opintotodiste/PLAN.md`. It is deliberately
**not committed**, so it is missing from worktrees; use that absolute path.
If it exists:

- Read it before doing anything else, and follow its **Working agreement**:
  claim a task, work in your own worktree and branch, and don't push.
- If the user's request matches a task in the plan, work on that task. If it
  doesn't, ask whether it should be added to the plan before you start.
- Keep the task's status and the Log in PLAN.md up to date.

If there is no PLAN.md, work normally.

## When you finish a piece of work

1. Make sure the tests pass (`npm test`; the database-backed tests need
   Postgres, see `CONTRIBUTING.md`), the work is committed on its branch, and
   PLAN.md is updated if there is one.
2. Ask the user one **yes/no** question: "Approve this work? (merge to main
   and clean up the branch and worktree)".
   - **Yes**: merge and clean up exactly as PLAN.md's Working agreement
     describes (local `--no-ff` merge, re-run the tests on main, remove the
     worktree, delete the branch). Don't push unless asked.
   - **No**: leave everything in place and ask what should change.
3. Suggest the next steps: which tasks are now unblocked and which of them can
   run in parallel. For each, give:
   - **Model:** Opus 5.5 for spec- or crypto-heavy work, interop debugging and
     design decisions; Sonnet 5.5 for well-specified implementation; Haiku 5.5
     for mechanical config and doc edits.
   - **Same chat or new chat:** continue here when the next task builds
     directly on context from this chat and the conversation is still short.
     Start a new chat (or a subagent) when the task is independent, should run
     in parallel, or this chat's context is already long. PLAN.md carries the
     state across chats.

Subagents don't ask the user or merge. They report back to the chat that
spawned them, and that chat does steps 2–3.

## Project notes

- Node 20+, ES modules, Express 5, PostgreSQL; tests use `node --test`.
- Signing is delegated: `ldp_vc` via digitalcredentials/signing-service, and
  wallet delivery via FindyFi/oid4vci-issuer (sibling checkout at
  `~/github/oid4vci-issuer`).
- New app env vars must also go into `APP_ENV_KEYS` in `test/helpers/app.js`.
