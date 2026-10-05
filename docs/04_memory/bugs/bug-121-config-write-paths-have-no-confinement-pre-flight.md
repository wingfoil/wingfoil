---
id: "bug-121-config-write-paths-have-no-confinement-pre-flight"
type: bug
title: "`dna set`, `directive assign` and `directive create` write through a symlinked config file to a target outside the project root — the same crossing as `bug-044` and `bug-120`, in the DNA and Directives stores"
status: in-review
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`task-105` and `task-106` confined the **Memory** write paths. The **configuration** write paths were
never confined at all: none of them calls `requireConfinedTarget` or `requireConfinedWriteTarget`.

Measured on `task-106`'s build by its reviewer, with the target file a **committed symlink** to a
location outside the project:

```
$ wingfoil dna set project.name --value probe
error: Command failed: git -C … commit --only …                     exit 1
  .wingfoil/dna.yaml -> outside file REWRITTEN   md5 93740c55… -> d723afcc…, `name: probe` present
  git log: no commit                              git status --short: empty
```

The reviewer widened the measurement beyond the original report: **`directive assign`** through a
symlinked `roles.yaml` does the same, and **`directive create`** through a *committed dangling* link
writes 216 bytes outside. Three commands, one class.

## Steps to Reproduce

As above, in a throwaway `wingfoil init --template Scrum` repository, with the outside directory in
its own `mktemp -d`.

## Expected Behavior

REQ-SEC-06's boundary is the project root and does not distinguish which pillar's file is being
written.

## Actual Behavior

It holds for Memory and for `directive remove`, and not for the four config writers —
`dna set` (`core/index.ts`), `directive create` (`core/index.ts`), `directive assign`
(`directive-assign.ts`) and `init`'s `scaffoldFiles` (`storage/layout.ts`).

## Notes

**The bound matters as much as the finding, and it came from the review rather than the report.**
**None of the three commits.** That is `bug-120`'s D2 severity, not D1's: the property that made
`bug-120` `high` — a truthful-looking `wf(...)` subject in history for something the repository does
not contain — **does not reproduce outside Memory**. A blocking decision should rest on that bound.

One sub-case is milder still: `directive create` through an *untracked* link is incidentally saved by
its own uncommitted-changes pre-flight. That is luck rather than design, and should not be read as
coverage.

**The fix is cheap because `task-106` already built it.** `requireConfinedWriteTarget`
(`src/core/confinement.ts`) is exactly the guard these paths lack — confinement plus the `lstat`
symlinked-target refusal — and it reaches the barrel through an existing `export *`. The work is
wiring, not design.

**Why it was not absorbed.** `task-106`'s AC6 scoped it out deliberately: its enumeration started at
`writeFileSync` and identified six `writeDocument` call sites, two Memory and four config, and taking
the other four would have widened a release blocker's fix task into a second pillar.

**`init`'s `scaffoldFiles` deserves separate thought when this is scheduled.** It writes the config
into a project that does not have one yet, so "the boundary" is being established by the same command
that would be checked against it.

## Triage & Execution Notes

- triage (2026-09-25): **medium**, on the reviewer's bound. It writes outside the project root, which
  is the same crossing; it does not commit, which is what separated `high` from `medium` on the two
  Memory bugs.
- **Whether it blocks `v0.2` has not been decided.** Filed without a `release:` stamp so the choice is
  explicit rather than inherited — the same handling `bug-098` and `bug-117` received.
