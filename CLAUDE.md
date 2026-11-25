# CLAUDE.md

How Claude works in this repository. Working practices that apply to every
developer, with or without Claude (branches, worktrees, checking for other
people's changes, tests), are in `CONTRIBUTING.md`: follow them.

## Personal plans

A developer may keep a personal plan for their own work. It is never
committed to this repository; anything other developers depend on goes in an
issue or a pull request instead (see `CONTRIBUTING.md`).

- Where the plan lives and how it is kept is each developer's choice. If the
  developer's own Claude setup (their global `CLAUDE.md`, planning skills)
  defines a plan, follow it. Otherwise look for `PLAN.md` in the main
  checkout, the first path `git worktree list` prints; `PLAN.example.md`
  describes that format. Either way it stays out of git through
  `.git/info/exclude`, never `.gitignore`.
- If there is a plan, read it before starting and check it against the
  repository: `git fetch`, then `git log origin/main -20` and `git branch -a`.
  If the plan disagrees with what is merged or pushed, trust the repository,
  tell the user and correct the plan.
- If the user's request matches a task in the plan, work on it as that task,
  following the plan's own rules for claiming it and recording progress.
  Before suggesting or claiming a task, make sure it isn't already merged or
  claimed (`git log origin/main --oneline | grep <id>`). If the request
  doesn't match a task, ask whether it should be added to the plan first.
- If there is no plan, work normally.

## While you work

- One task = one branch = one worktree, named with your developer id as
  `CONTRIBUTING.md` describes (worktrees outside the repository). Never work
  on `main`.
- Stay in scope: touch only what the task lists. If you need to change an
  interface contract or another task's files, stop and ask the user, then
  record the decision in the plan if there is one.
- Commit in small steps in the repository's style. End each commit message
  with the `Co-Authored-By` line for the model that actually did the work.
- **Don't push** unless the user asks for that in this chat.
- **Don't stop processes you didn't start** (other chats may be running apps
  and issuers). Find your own by the port you chose; never `pkill` by name.
- Subagents don't ask the user or merge. They report back to the chat that
  spawned them, and that chat does the steps below.

## Verify

- `npm test` (`node --test`). The database-backed tests need Postgres; when
  several worktrees run tests at once, give each its own database (see "One
  database per worktree" in `CONTRIBUTING.md`).
- Before tagging a release, also the secret scan (see "Releasing" in
  `CONTRIBUTING.md`).

## Try it

Several chats may run the app at once, so don't use fixed ports:

- Shared services (once; skip if already up, check with `docker compose ps`):
  `docker compose up -d db signing-service oid4vci-issuer` from the main
  checkout. They stay up between chats. If the task changed oid4vci-issuer,
  rebuild it from a local checkout first (see README, "Running a local
  oid4vci-issuer checkout").
- The app, from your own worktree: pick a free port (`lsof -iTCP:<port>
  -sTCP:LISTEN` to check; start from 3001, leave 3000 to the compose `app`
  service), then run `npm start` in the background with `PORT=<port>` and
  `ORIGIN=http://localhost:<port>` (WebAuthn checks the origin) plus the rest
  of the env from `docker-compose.yml`'s `app` service, pointing
  `DATABASE_URL`, `SIGNING_SERVICE_URL` and `OID4VCI_ISSUER_URL` at
  `localhost`. Use `run_in_background`, and confirm it answers
  (`curl -sf http://localhost:<port>/`) before reporting.
- Give the user `http://localhost:<port>` and a line on what to look at.
- If a service can't be started (no Docker, port in use, build fails), say so
  and why; don't claim it is running.
- When the work is approved and merged, or abandoned, stop **your own** app
  process. Leave the shared compose services running.

## When you finish a piece of work

1. Make sure the tests pass (see "Verify"), the work is committed on its
   branch and rebased on `main`, and the plan, if there is one, is updated
   as its rules say: the task waits for review, and a log entry records what
   changed, the test result and anything surprising.
2. **If the work changed code and the tests pass, leave it running** as "Try
   it" describes, and give the user the link (skip this for doc-only or
   config-only changes that the app can't show). Record the port and process
   in the plan's log if there is one.
3. If your plan's workflow hands the result to another chat that merges (for
   example a task dispatched to its own chat), report there and stop.
   Otherwise ask the user one **yes/no** question: "Approve this work? (merge
   to main and clean up the branch and worktree)".
   - **Yes**, from the main checkout: `git status --short` must be clean
     (apart from untracked personal files such as a plan), otherwise stop and
     ask. Then `git merge --no-ff <branch>`, re-run the tests on `main`,
     `git worktree remove <worktree>`, `git branch -d <branch>`, and drop the
     task's test database. Mark the task done in the plan with the merge
     commit, and add a log entry. Don't push unless asked.
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
     in parallel, or this chat's context is already long. The plan, if there
     is one, carries the state across chats.

## Release

Use the `/release` skill (`.claude/skills/release/SKILL.md`). Never dispatch
the image build until every check on the tagged commit, CodeQL included, is
green.

## Project notes

- Node 20+, ES modules, Express 5, PostgreSQL; tests use `node --test`.
- Wallet delivery goes through FindyFi/oid4vci-issuer, which signs the SD-JWT
  credentials (`dc+sd-jwt`) itself. Only `ldp_vc` (downloads, collections) is
  signed by digitalcredentials/signing-service. The issuer's own checkout may
  sit anywhere on a developer's machine; find its path (`git worktree list` in
  that repository, or ask) instead of assuming one.
- User-visible text follows "Translations" in `CONTRIBUTING.md` (Finnish source,
  English via the existing mechanism, wording rules).
- For any change to data persistence, privacy or retention, restate what is
  stored, for whom and for how long, and wait for the user's confirmation
  before implementing.
- New env vars go into `.env.example` with an `# @env required|optional [secret]` tag (the test
  enforces it and `APP_ENV_KEYS` in `test/helpers/app.js`), and deployment config
  (FindyFi/aws-environment, the image builder's integration compose) must follow.
- The privacy notice and terms of use (/policy, `src/views/policy.js`): any change to
  their text needs the user's approval of the new wording **in every language the
  policy is published in** (today Finnish and English) before it is committed. Every
  change also raises the version number and sets the date in `updated` (both
  languages). Several changes that haven't been released yet may share one version;
  once a version is released, the next change starts a new one.
