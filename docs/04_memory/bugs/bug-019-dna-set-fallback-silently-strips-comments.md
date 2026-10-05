---
id: "bug-019-dna-set-fallback-silently-strips-comments"
type: bug
title: "When `dna set` falls back to the whole-file dump it strips every comment with no warning at all"
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

`task-063` made `wingfoil dna set` a minimal in-place edit that preserves comments — but it keeps a
fallback to the old whole-file `js-yaml dump()` for shapes the in-place path cannot handle safely, and
**that fallback still strips every comment in the file**. It succeeds silently: the user gets
`ok=true` and a commit sha while 44 comments and 23 `[SPEC]`/`[AUTHORING]` provenance markers
disappear from `dna.yaml`.

## Steps to Reproduce

1. In a repo whose `.wingfoil/dna.yaml` is the project's own comment-rich file:
   `wingfoil dna set project.north_star short`
2. Exit 0, a commit is created.
3. `grep -c '^\s*#' .wingfoil/dna.yaml` → **0**. Every comment is gone.

`project.description` reproduces it identically — measured at 22 insertions / 65 deletions, 0 of 44
comments surviving.

## Expected Behavior

Either the fallback preserves comments too, or the user is told it could not. A successful exit that
destroys the file's entire provenance annotation with no signal is the worst of the three options.

## Actual Behavior

Silent total loss. `CoreResult` carries no warning channel and none was added, so nothing distinguishes
a comment-preserving edit from a destructive one at the call site or on stdout.

## Notes

**Bounded, and narrower than it first looks.** `task-063`'s review enumerated every dotted path in the
real `dna.yaml`: only five existing leaves edit in place, and every container or sequence path falls
back **and then fails `DnaYaml` validation before writing** — `VALIDATION`, exit 1, file untouched. The
only fallbacks that actually write are the two `>-` block scalars, because `Project` types them as
optional strings. So the reachable surface today is exactly two keys:

- **`project.north_star`** — named in `task-063`'s Execution Notes.
- **`project.description`** — found by the review, *not* named there; a reader of those notes would
  believe `north_star` is the only affected key in WingFoil's own config. It is not.

**Two further fallback triggers the review found, both fail-closed but undocumented:**
- **CRLF line endings make the whole fix inert.** `KEY_LINE`'s `(.*)$` cannot span a `\r`, so on a
  CRLF-authored `dna.yaml` no key line ever matches and *every* `dna set` takes the destructive path.
- A leading `---` document-start marker forces total fallback, even though the file is a single valid
  document.

**Minimum viable fix:** surface a warning on `CoreResult` when `setDnaValueInText` returns `undefined`
yet the write proceeds. That is cheap and turns a silent destruction into a visible one.

**Fuller fix** — making the fallback itself comment-preserving — needs a CST YAML library, which
`dl-010-minimal-dependencies` excludes as a "secondary convenience package" and would require an
explicit approver exemption. `task-063` deliberately did not take that route, and was right not to
decide it inside a task.

Why this matters beyond tidiness: CLAUDE.md §9 makes `[SPEC]`/`[AUTHORING]` annotations load-bearing —
removing or renaming a `[SPEC]` field requires changing the referenced specification first. A tool
that silently erases them defeats a governance rule, which is why `bug-004` was worth fixing at all and
why this residue is worth tracking rather than filing under "known limitation".

## Triage & Execution Notes

- capture (`bug-ingest`): raised by `task-063`'s review as the condition on its approval — the residue
  must not live only in a done task's Execution Notes, since nothing reschedules those. `bug-004` is
  **not** closed by `task-063`; this bug carries what that fix deliberately left.
