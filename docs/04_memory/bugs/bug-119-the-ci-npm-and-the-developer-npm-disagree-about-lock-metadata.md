---
id: "bug-119-the-ci-npm-and-the-developer-npm-disagree-about-lock-metadata"
type: bug
title: "npm 10.9.0 strips `\"peer\": true` from twelve lock entries that npm 11 writes, so the lockfile has two authors who disagree and either one produces a diff nobody asked for"
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

On a checkout **containing `task-104`'s fix**, `npm install --package-lock-only` under **npm 10.9.0**
— the version `.github/workflows/publish.yml` pins through Node 22.12.0 — reports `up to date` and
strips `"peer": true` from twelve entries:

`@babel/core`, `@emnapi/core`, `@emnapi/runtime`, `@typescript-eslint/parser`, `acorn`,
`browserslist`, `eslint`, `express`, `hono`, `jest`, `typescript`, `zod`.

Comparing the two locks entry by entry, **zero** differ in `version`, `resolved` or `integrity`. It is
metadata only.

## Steps to Reproduce

Fresh clone at a revision carrying `task-104`. Run `npm install --package-lock-only` under npm 10.9.0
and `git diff package-lock.json`.

## Expected Behavior

The lockfile has one author, or the difference between its two authors is recorded so that a developer
who produces it knows it is expected.

## Actual Behavior

A developer running the CI's npm produces a twelve-line diff that nobody asked for and that carries no
semantic change, and a developer running npm 11 produces its inverse.

## Notes

**Not a duplicate of `bug-063`, and not made by it.** `bug-063` was the *pruning* of two hoisted
entries — a semantic change that broke `npm ci` on the pinned npm. `task-104` fixed that and added a
check that fails if it recurs. This is the residue that fix does not touch, and it exists on both
sides of it.

**Harmless to `npm ci`**, which is what the release gate runs, and `npm run check:lockfile` stays green
under either author. So there is nothing to protect — only noise to explain.

**`task-080` saw this from the other direction and left it in a `done` task's notes**, where nothing
schedules it. That is the second time this specific fact has been measured and not filed, which is why
it is filed now rather than carried again.

**A caution for whoever measures it next, recorded because it nearly went wrong here.** `task-104`'s
first version of the twelve-package list was **incorrect** — read off an interleaved `git diff -U6`
whose context lines misaligned with the deletions, naming `zod-to-json-schema` (not in the set) and
omitting `browserslist` (in it). It was caught only because writing the list into a plan document made
it a durable citation and forced an entry-by-entry re-derivation. The measurement was real; the
reading of it was not. Compare the two locks programmatically, not by eye.

## Triage & Execution Notes

- triage (2026-09-25): **low**. No behaviour, no install, and no gate is affected; the cost is a
  spurious diff and the doubt it creates about whether the lockfile is in a good state.
- Found by `task-104` and confirmed by its reviewer.
