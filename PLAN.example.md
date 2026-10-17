# PLAN.example.md

A template for your own `PLAN.md`. Copy it to the **main checkout** as `PLAN.md`
and keep it out of git (`echo PLAN.md >> .git/info/exclude`). A plan is
personal: it says what *you* (and the Claude chats you run) will do and in
what order. Anything other developers depend on goes in an issue or pull
request, not only here (see `CONTRIBUTING.md`). `CLAUDE.md` says how Claude uses
the plan: claim a task, work in its own worktree, ask before merging. This file
has only the content. Delete the hints in italics once you have the idea.

- Developer id: `ab` (short, stable; goes in branch and worktree names: `ab/T2-short-slug`)
- Worktree root: `~/work/worktrees` (outside the repos; one subfolder per repo)
- Started: 2026-01-15

## Goal

Two or three lines: what is true when the whole plan is done, and what is
deliberately *not* part of it. *A task that doesn't serve the goal doesn't belong here.*

## Decisions others depend on

*Interfaces between repos or tasks, fixed up front so tasks can run in
parallel. Change one by editing this section first and adding a Log entry. If
another developer relies on it, also open an issue.*

- `POST /offers` takes `{ configId, claims }` and returns `{ offerUri }`. The
  issuer rejects reserved claims (`iss`, `iat`) with 400.

## Tasks

*Status: `todo` · `in progress (<branch>, <worktree>, <date>)` · `review` (done,
waiting for the user) · `done (<merge commit>)` · `blocked (<why>)`.*
*Model: the Claude model that fits (Opus for spec- or crypto-heavy work,
interop debugging, design decisions; Sonnet for well-specified implementation;
Haiku for mechanical config and docs).*
*Each task says what "done" means. State dependencies and what can run in
parallel explicitly: that is what lets several chats work at once.*

### T1: Add the env manifest test
- Repo: app · Model: Sonnet · Depends: none · Parallel with: T2, T3 · Status: `done (a1b2c3d)`
- Every `process.env.X` read outside `test/` is listed in `.env.example` with a tag.
- Done when: `npm test` fails on an untagged variable.

### T2: Issuer rejects reserved claims
- Repo: issuer · Model: Sonnet · Depends: none · Parallel with: T1, T3 · Status: `in progress (ab/T2-reserved-claims, ~/work/worktrees/issuer/ab-T2, 2026-01-16)`
- Offers containing `iss`, `iat` or `cnf` get 400; tests cover each.
- Done when: the issuer suite is green and its README lists the reserved claims.

### T3: Document the local stack
- Repo: app (README and compose only) · Model: Haiku · Depends: the decision above · Parallel with: anything · Status: `todo`
- Why it is safe in parallel: it touches no file the other tasks touch.

### T4: End-to-end check with a real wallet
- Repos: app + issuer · Model: Opus (with the user, hands-on) · Depends: T1, T2, T3 · Status: `blocked (needs T2)`
- A task spanning two repos uses one worktree per repo with the same branch name.
- Record the results as a table in the Log. Decide what T5 should be.

### T5 (contingent): switch the wallet format
- Depends: a T4 decision · Status: `todo`
- *Detail a contingent task only once it is needed; a sketch is enough until then.*

### Dependency graph

```
T1 ─┐
T2 ─┼─► T4 ─► T5?
T3 ─┘
```
T1, T2 and T3 can run at the same time, in three chats (or subagents), in
three worktrees. T4 waits for all three. *Draw it: it is the quickest way to see
what can run in parallel, and what a change of plan blocks.*

## Log

*Newest last. `date · task · who/model · note`. Record decisions with their
reason, test results, surprises, ports of running processes, and anything the
next chat needs. Facts only; the plan is not a diary.*

- 2026-01-15 · plan · Opus · Drafted. Decision: the issuer owns `iss` and `iat`; coordinators never send them.
- 2026-01-16 · T1 · Sonnet · Done on ab/T1-env-manifest, 84/84 tests green. Surprise: `PGPASSWORD` is read by `pg` itself, so it is listed as `optional secret`.
- 2026-01-16 · T1 · Sonnet · Approved and merged (a1b2c3d); worktree and branch removed. Not pushed.
