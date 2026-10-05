---
id: "task-183-gate-four-versioned-config-files-version-bump-pending"
type: task
title: "Gate the four versioned config files on a `version:` bump in the pending change"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "directives", "gates"]
ref: "dl-047"
bug: ["bug-143"]
depends_on: ["task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses"]
tmpl_version: 260703
---

## Description

Nine v0.2-era content commits to `dna.yaml`/`memory.yaml`/`workflows.yaml` left `version:` unchanged and nothing checks it (`bug-143`). Once task-139 has scoped `doc-versioning` to documents that carry a `version:` (dl-047 option 1), a `test/lint/` check enforces the bump on the four versioned config files (`dna.yaml`, `memory.yaml`, `workflows.yaml`, `roles.yaml`) for the pending change.

## Acceptance Criteria

- (red-first) a `test/lint/` check fails when the working tree changes one of the four files (`dna.yaml`, `memory.yaml`, `workflows.yaml`, `roles.yaml`)' content relative to `HEAD` without changing `version:` (a check on the pending change, so it runs in every dev-loop refactor; history is not re-judged).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-047 option 1 (the check half; the directive text is task-139); doc-versioning.
- **Notes:** Proposal key: C39. The directive wording (dl-047 V1) is task-139's; task-208's governance CI runs the suite, so the check is also enforced on push. `bug-143` is owned here only.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-183-gate-four-versioned-config-files-version-bump-pending`, worktree
`../.wf2-wt/task-183`, cut from `main` at `0cf8b131`; start `76f7da66`; `bug-143`
`[planned → in-progress]` `cd4a31b1`. Batch W2-B3; merges last.

### design (architect)

**`depends_on` read (dl-015).** `task-139` is `done` (`grep -n '^status' task-139-*.md` → `done`).
Its V1 clause in `doc-versioning.md` scopes the bump rule to documents that declare a version, and
its bump rule takes `main` as the baseline: one bump per task branch, review fixes do not re-bump
(approver ruling 2026-10-01). No deferral to this task in its notes.

**Decisions and specs.** `dl-047` is `ready` (`grep -n '^status'` → `ready`), option 1. No
tech-spec is cited; none is needed (the check is a test-suite gate, not product behaviour). No BDD
feature covers doc-versioning (`grep -rln "doc-versioning\|version bump" docs/02_requirements/02_bdd/features`
→ nothing), so none is extended.

**Design.** A test-only helper `test/lint/helpers/version-bump.ts` (`checkPendingVersionBumps(root)`)
and the suite `test/lint/version-bump.test.ts`, which runs it on this repository and on fixture repos.

- *Pending change* = the working tree (staged or not) against `HEAD`. A file whose bytes equal `HEAD`
  is not judged, so a clean committed tree always passes and history is never re-judged (AC).
- *Content* = any byte change, comments included: comments carry the `[SPEC]`/`[AUTHORING]`
  provenance annotations, which are part of the file's content. `bug-143`'s fix sketch said
  "non-comment content"; the AC says "content". **Approver to confirm** (see Decisions).
- *Version* = the top-level `version:` as `js-yaml` reads it, so `1.10` after `1.1` is no bump
  (`memory.yaml`'s own annotation warns of exactly that). A removed `version:` or an unparsable file
  fails with its own reason.
- *Baseline is `main`* (the doc-versioning ruling): when the working tree keeps `HEAD`'s version, the
  edit still passes if `HEAD`'s version already differs from the file's version at
  `git merge-base HEAD main` — the branch bumped once, and a further (e.g. review-fix) edit does not
  bump again. Without this, the gate would fail every uncommitted review fix and push agents to
  re-bump against the ruling. `main` is named as the trunk by `git-conventions` §2; the name is the
  exported constant `TRUNK_BRANCH`. With no `main` branch (e.g. a CI checkout), the judgement is
  against `HEAD` alone. On `main` itself the merge-base is `HEAD`, so every unbumped edit fails.
- A file absent at `HEAD` (new) or deleted from the working tree has no pending edit to judge.
- Inside jest: the suite reads only the worktree it runs in (`REPO_ROOT`); other agents' worktrees are
  separate checkouts. A developer's own uncommitted edit to one of the four files fails only if the
  version is unchanged and the branch has not already bumped it.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `test/lint/` check fails on a pending content change to one of the four files without a `version:` change | **red-first** | no such check exists (`ls test/lint` before the task: no version check) |

### red (developer)

`993659da` adds `test/lint/version-bump.test.ts` (17 tests). `npx jest test/lint/version-bump.test.ts`
→ `Test Suites: 1 failed` — `Cannot find module './helpers/version-bump'`: the check does not exist.

### green (developer)

`3d29ab4f` adds `test/lint/helpers/version-bump.ts`. The first run had one failure: the message read
`version: is still 1` for a file written `1.0` (YAML reads it as a number). The message now quotes the
token as written, and says `1.10 reads as 1.1 in YAML, the same as HEAD's 1.1` when the tokens differ
but the values do not; the 1.10 test's expected message was updated with it, in the same commit.
`npx jest test/lint/version-bump.test.ts` → `17 passed`.

Probe on this repository: appending `# probe` to `.wingfoil/dna.yaml` →
`.wingfoil/dna.yaml: content differs from HEAD but version: is still 1.4` (1 failed); with
`version: 1.5` as well → passed; the file was then restored with `git checkout --`.

`3da84021` adds one bullet to `doc-versioning.md` *The bump rule* naming the gate, what it judges and
what it does not (directive declares no version: `grep -c '^version:'` → `0`, so no bump).
`node dist/cli.js directives list --role developer` → exit `0`, `"warnings": []`.

### refactor (developer)

- `npm test` → `Test Suites: 244 passed, 244 total`, `Tests: 4630 passed, 4630 total`.
- `npm run test:coverage` → All files `99.07 | 96.21 | 96.18 | 99.68`, `4630 passed`. A first coverage
  run under batch load had 2 failures in 1 suite; the re-run alone passed all 4630. No file under
  `src/` changed (`git diff --stat 0cf8b131 -- src` → empty), so coverage cannot move versus `main`.
- `npm run lint` → `0`; `npm run docs:api` → `0`; `npx tsc --noEmit -p tsconfig.json` → `0`;
  `npx tsc -p tsconfig.build.json --noEmit` → `0`;
  `node scripts/check-governance.cjs --base 0cf8b131` → `0`.

### review (reviewer, self)

- AC 1: met — tests "fails a content edit that leaves version: unchanged…", "fails a staged edit…",
  "fails a comment-only edit…", "compares versions as YAML reads them…", plus the repository probe
  above. Clean tree passes ("passes a clean committed tree", and the suite passes on this branch).
- Determinism: fixed ordered file list; verdict depends only on git objects and file bytes.
- `git` errors are swallowed only where absence is the meaning (`git show HEAD:<path>` of a file not
  at `HEAD`, an absent `main`); stderr of those calls is not echoed.
- Limit, stated in the directive bullet: the gate judges the pending change only. A commit made
  without running the suite is not caught, and on a clean CI checkout (`task-208`'s `governance.yml`)
  the gate has nothing to judge — `task-208`'s note that the suite there enforces `bug-143` holds only
  for uncommitted edits, which CI never has. Reported to the coordinator, not filed.

### Decisions for the approver

1. Comments count as content (any byte change needs a bump), against `bug-143`'s "non-comment
   content" sketch.
2. The `main`-baseline relaxation (an already-bumped branch passes further edits), from the
   doc-versioning ruling of 2026-10-01, beyond the AC's literal "relative to `HEAD`".

### Pending amendments (approver)

None.
