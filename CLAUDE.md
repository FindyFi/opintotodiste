# CLAUDE.md

## Start of every chat: check for a plan

Look for `PLAN.md` in the repository's **main checkout**: the first path
printed by `git worktree list`. It is deliberately **not committed** (each
developer keeps their own, for their own work), so it is missing from
worktrees; always read and edit it at that path. If it exists:

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
2. **If the work changed code and the tests pass, leave it running** and give
   the user a link to try it (skip this for doc-only or config-only changes
   that the app can't show). Several chats may run at once, so don't use
   fixed ports or stop other chats' processes:
   - Shared services (once; skip if already up, check with `docker compose ps`):
     `docker compose up -d db signing-service oid4vci-issuer` from the main
     checkout. They stay up between chats. If the task changed
     oid4vci-issuer, rebuild it from the local checkout/worktree first (see
     README, "Running a local oid4vci-issuer checkout").
   - The app, from your own worktree: pick a free port (`lsof -iTCP:<port>
     -sTCP:LISTEN` to check; start from 3001, leave 3000 to the compose
     `app` service), then run `npm start` in the background with `PORT=<port>`
     and `ORIGIN=http://localhost:<port>` (WebAuthn checks the origin) plus the
     rest of the env from `docker-compose.yml`'s `app` service, pointing
     `DATABASE_URL`, `SIGNING_SERVICE_URL` and `OID4VCI_ISSUER_URL` at
     `localhost`. Use `run_in_background`, and confirm it answers
     (`curl -sf http://localhost:<port>/`) before reporting.
   - Give the user `http://localhost:<port>` and a line on what to look at.
     Record the port and process in PLAN.md's Log if there is one.
   - If a service can't be started (no Docker, port in use, build fails), say
     so and why; don't claim it is running.
   - When the work is approved and merged, or abandoned, stop **your own** app
     process. Leave the shared compose services running.
3. Ask the user one **yes/no** question: "Approve this work? (merge to main
   and clean up the branch and worktree)".
   - **Yes**: merge and clean up exactly as PLAN.md's Working agreement
     describes (local `--no-ff` merge, re-run the tests on main, remove the
     worktree, delete the branch). Don't push unless asked.
   - **No**: leave everything in place (including the running app) and ask
     what should change.
4. Suggest the next steps: which tasks are now unblocked and which of them can
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
- Wallet delivery goes through FindyFi/oid4vci-issuer, which signs the SD-JWT
  credentials (`dc+sd-jwt`) itself. Only `ldp_vc` (downloads, collections) is
  signed by digitalcredentials/signing-service. The issuer's own checkout is a
  sibling of this repository on the maintainer's machine; other setups differ,
  so find its path (`git worktree list`, or ask) instead of assuming one.
- New env vars go into `.env.example` with an `# @env required|optional [secret]` tag (the test
  enforces it and `APP_ENV_KEYS` in `test/helpers/app.js`), and deployment config
  (FindyFi/aws-environment, the image builder's integration compose) must follow.
