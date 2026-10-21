# CLAUDE.md

How Claude works in this repository. Working practices that apply to every
developer, with or without Claude (branches, worktrees, checking for other
people's changes, tests), are in `CONTRIBUTING.md`: follow them. Each developer
may keep their own plan; see `PLAN.example.md` for the format.

## Start of every chat: check for a plan

Look for `PLAN.md` in the repository's **main checkout**: the first path
printed by `git worktree list`. It is deliberately **not committed** (each
developer keeps their own, for their own work), so it is missing from
worktrees; always read and edit it at that path. If it exists:

- Read it before doing anything else.
- **Check it against the repository** before trusting it: `git fetch`, then
  `git log origin/main -20` and `git branch -a`. If a task's status or the Log
  disagrees with what is merged or pushed, tell the user and correct the plan.
- If the user's request matches a task in the plan, work on that task: claim
  it (status `in progress (<branch>, <worktree>, <date>)`) before doing
  anything else. If it doesn't match, ask whether it should be added to the
  plan before you start.
- Keep the task's status and the Log in PLAN.md up to date. Other chats edit it
  concurrently, so make small, targeted edits and append to the Log; never
  rewrite the file. Change only your own task's lines.
- Never commit PLAN.md.

If there is no PLAN.md, work normally.

## While you work

- One task = one branch = one worktree, named with the developer id from
  PLAN.md's header, as `CONTRIBUTING.md` describes. Never work on `main`.
- Stay in scope: touch only what the task lists. If you need to change an
  interface contract or another task's files, stop and ask the user, then
  record the decision in the Log.
- Commit in small steps in the repository's style. End each commit message
  with the `Co-Authored-By` line for the model that actually did the work.
- **Don't push** unless the user asks for that in this chat.
- **Don't stop processes you didn't start** (other chats may be running apps
  and issuers). Find your own by the port you chose; never `pkill` by name.
- Subagents don't ask the user or merge. They report back to the chat that
  spawned them, and that chat does the steps below.

## When you finish a piece of work

1. Make sure the tests pass (`npm test`; the database-backed tests need
   Postgres, see `CONTRIBUTING.md`), the work is committed on its branch,
   it is rebased on `main`, and PLAN.md is updated if there is one (status
   `review`, plus a Log entry: what changed, the test result, anything
   surprising).
2. **If the work changed code and the tests pass, leave it running** and give
   the user a link to try it (skip this for doc-only or config-only changes
   that the app can't show). Several chats may run at once, so don't use
   fixed ports:
   - Shared services (once; skip if already up, check with `docker compose ps`):
     `docker compose up -d db signing-service oid4vci-issuer` from the main
     checkout. They stay up between chats. If the task changed
     oid4vci-issuer, rebuild it from a local checkout first (see README,
     "Running a local oid4vci-issuer checkout").
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
   - **Yes**, from the main checkout: `git status --short` must be clean
     (apart from PLAN.md), otherwise stop and ask. Then
     `git merge --no-ff <branch>`, re-run the tests on `main`,
     `git worktree remove <worktree>`, `git branch -d <branch>`, and drop the
     task's test database. Set the task to `done (<merge commit>)` and add a
     Log entry. Don't push unless asked.
   - **No**: leave everything in place (including the running app), record
     what the user wants changed, and ask what should change.
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

## Project notes

- Node 20+, ES modules, Express 5, PostgreSQL; tests use `node --test`.
- Wallet delivery goes through FindyFi/oid4vci-issuer, which signs the SD-JWT
  credentials (`dc+sd-jwt`) itself. Only `ldp_vc` (downloads, collections) is
  signed by digitalcredentials/signing-service. The issuer's own checkout may
  sit anywhere on a developer's machine; find its path (`git worktree list` in
  that repository, or ask) instead of assuming one.
- User-visible text is written in Finnish (the source language) and translated with the existing mechanism:
  mark it `lang="fi"` (`el(tag, { lang: 'fi' }, text)` in public/*.js) and add its English to
  `public/translations.json` (translate-element swaps it in, HTML such as a link included), or hand-author
  the pair (a `lang="en"` sibling, or i18n.js's `t(fi, en)` for native dialogs). Messages the server sends
  for the UI to show are Finnish too, with `lang: 'fi'` in the response: throw a `UserError`
  (src/user-error.js) or answer with `refuse()` / `sendError()` in index.js, and show it with i18n.js's
  `errorContent()`. Technical failures get a Finnish fallback; their details go to the log. A missing page
  is `views.notFoundPage()`, never plain text. Don't add English-only UI text; `test/translations.test.js`
  fails on it. Wording
  rules: credential = "todiste", never "todistus"; verifying = "tarkastaa".
- New env vars go into `.env.example` with an `# @env required|optional [secret]` tag (the test
  enforces it and `APP_ENV_KEYS` in `test/helpers/app.js`), and deployment config
  (FindyFi/aws-environment, the image builder's integration compose) must follow.
