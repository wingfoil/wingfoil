---
id: "bug-066-global-setup-cannot-recover-from-root-owned-dist"
type: bug
title: "A root-owned `dist/` left by a container run makes every later host test run die with `EACCES` in `globalSetup`, before any test executes and with nothing naming the cause"
status: triaged
severity: "low"
release-origin: "v0.2"
release: "v0.4"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`test/global-setup.cjs` opens with an unguarded `rmSync(join(repoRoot, 'dist'), { recursive: true,
force: true })` so that `dist/` is compiled exactly once before the worker pool exists. When the
repository has been used from a container that runs as root — the documented `act` recipe, and the
`docker run` recipe used to reproduce runner-only defects — `dist/` is left owned by root, and the
next run on the host fails with `EACCES` inside `globalSetup`, before a single test executes. Nothing
in the error mentions a container.

## Steps to Reproduce

1. Run the suite from a container that mounts the worktree and runs as root (the recipe in
   `.github/workflows/publish.yml`'s header comment, or any `docker run -v <worktree>:/w` without
   `--user`). `globalSetup` rebuilds `dist/` as root.
2. Run `npx jest` on the host, as your normal user.
3. It fails in `globalSetup` with `EACCES … rmdir '…/dist/cli'`, with no test having run.

`test/global-setup.cjs` performs the removal with no `try`/`catch` and no diagnostic. `dist/` is
gitignored (`.gitignore` line 3, `dist/`), so no commit is ever affected — only the working tree.

## Expected Behavior

Either the failure explains itself — naming the likely cause and the fix — or the documented
container recipe prevents it in the first place by running as the invoking user.

## Actual Behavior

A raw `EACCES` from a file the developer never touched, in a setup step that runs before any test,
with the actual cause (a container run that may have happened days earlier) nowhere in the message.
This has already cost real time twice in this release: it is why `task-077`'s worktree could not be
removed without `sudo`, and the reviewer of `task-082` hit it again independently.

## Notes

Two halves, and only one belongs here.

**The defect** is the unguarded removal: an error a developer cannot act on. The fix is a `catch`
around the `rmSync` that rethrows with a diagnostic naming the container cause and the remedy, or an
ownership pre-check with the same message. That is determinate and is what this bug tracks.

**The other half is not a defect and is deliberately not filed here.** The container recipe should
pass `--user $(id -u):$(id -g)` — but *where that recipe lives durably* is an open question, not a
bug: today it exists only inside task Execution Notes, which nothing revisits once a task is `done`.
`dl-076-toolchain-divergence-unexercised-until-tag` (`in-discussion`) already owns the question of
how this repository's container and toolchain procedures are declared rather than remembered, and the
`--user` flag belongs in whatever it ratifies. Filing it twice would create two answers to one
question.

## Triage & Execution Notes

- triage (2026-09-22): **low**. It blocks nothing permanently — `sudo rm -rf dist` clears it — and it
  reaches only developers who run the suite in a container, which today means whoever is reproducing
  a runner-only defect. It is filed because the error is undiagnosable from its own text, and because
  it has already been paid for twice.
- No fix task filed: a `catch` with a message is a few lines and is a natural companion to whatever
  work next touches the test harness, or to `dl-076`'s ratification.
