---
id: "task-182-build-secret-shaped-fixtures-runtime-gate-test-scanner"
type: task
title: "Build secret-shaped fixtures at runtime, gate `test/` with the scanner, and narrow the scan's claim"
status: done
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "security", "tests"]
ref: "dl-122"
bug: ["bug-055", "bug-190", "bug-228"]
depends_on: ["task-135-make-init-scan-builtin-templates-secrets-refuse-reinitialize"]
tmpl_version: 260703
---

## Description

The scanner's own tests hold secret-shaped literals; one blocked the repository's first push (`test/validation/secret-scan.test.ts:68`; `bug-055`). Ratified `dl-122` (b): fixtures are assembled at runtime, and a suite test runs `scanText` over tracked `test/` files. `dl-073` (C) narrows what a clean scan claims ("0 findings on the configuration store"); `spec-007` §1 still names the pre-`task-111` `docs/self/` roots while `SCAN_SURFACE_ROOTS` is `['.wingfoil','docs/04_memory']`.

## Acceptance Criteria

- (red-first) a suite test scans every tracked file under `test/` and fails on a blocking finding; it fails on a planted literal and passes after the fixtures are rewritten.
- (characterization) each rewritten fixture builds a value byte-identical to the literal it replaces.
- (characterization) `security-secrets.md` gains S1 (version bump); `spec-007` §1 names the real roots and the narrowed claim (Revision note); a `service` element records the push-protection exception through `service-ingest` (dl-073 S3 / dl-122 Action 4), or the task records why it cannot.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-122 (b) + Action 2 (security-secrets S1); dl-073 (C)+S1, S2, S3; spec-007 §1.
- **Notes:** Proposal key: C34.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect)

- **depends_on.** `task-135` is `done` (`grep -n '^status' docs/04_memory/v0.3/task-135-*.md` → `done`);
  its Execution Notes hand nothing to this task (`grep -n "task-182\|bug-055\|dl-122" <that file>` → no
  line). It left the dotenv prefix that `bug-190` widens.
- **Specs and decisions.** `spec-007` is `approved`; `dl-122` and `dl-073` are `ready` (frontmatter). `dl-073`
  was ratified with (C) + S1, (B) delivered by `dl-122`, S2 (REQ-SEC-08 unchanged), S3 (a `service`),
  (A) declined until S4 is measured (`git log -1 --format=%B 99957437`). `dl-122` Q1 is (b), as the
  task's first AC states.
- **Scope added by triage.** `bug-190` (dotenv false negatives) and `bug-228` (prose read as a key)
  came in through `bug-ingest-rel-v0.3-w1b2-review-findings-plan` and
  `bug-ingest-rel-v0.3-w1b6-review-findings-plan`. Neither has an AC in this file; both are revisions of
  `spec-007` §2, so they ride the same pending amendment. Each gets a red-first test.
- **AC 3, "spec-007 §1 names the real roots", was already true.** `grep -n "docs/self" spec-007` → only
  line 214, inside the Revision note of 2026-09-29 (`task-111`), which had already set §1 to `.wingfoil/`
  and `docs/04_memory/`, the value of `SCAN_SURFACE_ROOTS` (`src/validation/secret-scan.ts`). What §1
  lacked is the narrowed claim, which this task adds.
- **Population measured.** On pre-batch main, the pattern set over every tracked file under `test/`
  (node one-liner over `git ls-files -z -- test` with `scanText`) → 270 files, **27** blocking findings in
  3 files: `test/validation/secret-scan.test.ts` (the 24 `bug-055` counted),
  `test/core/builtin-template-secret-scan.test.ts` (2 PEM headers), `test/storage/builtin-directives.test.ts`
  (1 PEM header). All 27 are rewritten (bug-055's "one or all" question: all, through a shared helper
  module, its third shape).
- **bug-228 shape chosen.** Of the bug's three proposals, the narrowest: a value made only of lower-case
  words joined by hyphens is not a key (a case-sensitive negative lookahead). A word boundary before the
  key word was rejected: `_` is a word character, so `client_secret:` and `API_TOKEN=` would stop
  matching. "At least one digit or upper-case letter" was rejected as wider: it would also exempt a
  mixed-case or lower-case value with underscores. JS on Node 22 has no `(?-i:…)` group
  (`node -e 'new RegExp("(?-i:a)b","i")'` → `SyntaxError: Invalid group`, Node v22.21.0), so the code
  drops the `i` flag on this one pattern and case-folds its key words letter by letter (`caseless`);
  spec-007's YAML keeps the PCRE form.
- **bug-190 shape chosen.** The prefix adds a `#` comment (`#+\s*`), a list marker before the keyword,
  `readonly` and `declare` with flags (`-x`), and `$env:`. `local` and `set` are left out (not in the bug,
  and `local` widens the indented-code false positives `task-135` documented).
- **Impact measured before choosing** (prototype regexes over every tracked `.md/.yaml/.feature/.ts/.js/
  .cjs/.json/.sh` file, old vs new): generic loses 4 matches, all prose (the 3 example lines of bug-228
  and the plan's quotation at `dev-loop-rel-v0.3-plan.md:511`), gains 0; dotenv gains 1,
  `.github/workflows/scorecard.yml:19`, a commented shell example outside both scan surfaces, loses 0.
- **The gate's surface.** `scanProjectSurface(repoRoot, { surfaceRoots: ['test'] })`: the shipped
  procedure on the index, so the `.wingfoil/security-ignore` and the other §3 exclusions stay available;
  the production `SCAN_SURFACE_ROOTS` is unchanged (`dl-073` (A) declined).
- **Directive version.** AC 3 says "(version bump)", but `security-secrets.md` declares no version
  (`grep -n '^version' .wingfoil/directives/custom/*.md` → only `command-baseline.md`), and `doc-versioning`
  says "A document that declares no version is not given one in order to satisfy this rule." So no version
  is added. **Approver to confirm.**

**AC classification (T1).**

| AC | Class | Why |
|----|-------|-----|
| 1 — suite test scans tracked `test/`, fails on a planted literal, passes after the rewrite | red-first | new check; fails on the 27 existing literals |
| 2 — each rewritten fixture is byte-identical to its literal | characterization | the values exist; pinned by SHA-256 of the pre-batch literal |
| 3 — S1 in `security-secrets`, spec-007 §1, `service` element | characterization | documentation; the `service` is prepared, not added (below) |
| bug-190 — four dotenv shapes block | red-first | new behaviour |
| bug-228 — prose is not a key | red-first | new behaviour; controls that must still block are characterization |

### red

Commit `198a2e1c`. `npx jest test/validation/secret-scan.test.ts` (with the file staged, since the gate
reads the index) → **10 failed, 75 passed, 85 total**: 6 bug-190 shapes, 3 bug-228 prose lines, and the
gate (`dl-122 S1 … matches 0 blocking secret patterns across the tracked files under test/`). The
node count over the same index → 270 files, **30** blocking (the 27 above plus the 3 prose lines the
test adds). The planted-literal case, the non-vacuity floor and the bug-228 controls pass on first run.

### green

Commit `5ee1220a`.

- `src/validation/secret-scan.ts`: both regexes, the `caseless` helper, the header comment (it said
  "Two" patterns use `(?i)`; four do).
- `test/validation/helpers/secret-fixtures.ts`: ten values, each joined from fragments no pattern
  matches alone. `test/validation/secret-fixtures.test.ts` pins each by length and SHA-256 of the literal
  it replaced, taken from `git show 0b297169:<file>` (AC 2).
- The three suites import from it; no other assertion changed.
- `.wingfoil/directives/custom/security-secrets.md`: the narrowed claim (`dl-073` (C) + S1) and rule S1
  (`dl-122`), with the gate and the helper named; the ignore-path example no longer suggests it for a
  scanner fixture.
- `spec-007` §1 (claim, the S1 check's surface), §2 (both regexes, notes), Revision note — **uncommitted,
  pending amendment**.

Evidence: `npx jest test/validation test/core/builtin-template-secret-scan.test.ts
test/storage/builtin-directives.test.ts` → 10 suites, 200 tests passed. After `npm run -s build`:
`scanProjectSurface('.', { surfaceRoots: ['test'] })` → 272 files, 0 blocking;
`scanProjectSurface('.')` → 732 files, 0 blocking. The bug-190 repro lines each give `1` blocking; the
bug-228 lines give no finding.

### refactor

Run with the `spec-007` amendment in the working tree.

- `npm test`, first run: 1 failure, `test/docs/name-resolvability.test.ts` (`spec-007 … config|cmd.exe`, a
  backticked Windows shell name read as a config file). Reworded in the spec; re-run → 11/11.
- `npm run test:coverage` → **234 suites, 4324 tests passed**; coverage **98.99 / 96.16 / 96.08 / 99.61**,
  equal to `main` at `a5ef0b75` (plan, B1 gates).
- `npm run lint` exit 0; `npm run docs:api` exit 0, 0 warnings; `npx tsc --noEmit -p tsconfig.json`
  exit 0; `npx tsc -p tsconfig.build.json --noEmit` exit 0.
- `node scripts/check-governance.cjs --base 0b297169` → 0 findings, exit 0.
- No BDD scenario covers the scanner's patterns (`grep -rli secret docs/02_requirements/02_bdd/features/`
  → only `P3.8-builtin-directive-templates.feature`, whose secret scenario is about `init`'s message,
  unchanged).

### review (self, code-review directive)

- AC 1 met: the "dl-122 S1" block in `test/validation/secret-scan.test.ts` failed at red (30) and passes
  at green (0), with a non-vacuity floor (>100 files) and a planted-literal case on a temp repo. AC 2
  met: `test/validation/secret-fixtures.test.ts`, 10 cases. AC 3: S1 and the claim in the directive;
  spec-007 §1 (pending amendment); the `service` element is prepared below, not added (coordinator
  instruction: it needs the approver).
- Same class in touched files: every secret-shaped literal under `test/` is gone (gate = 0). The bug-228
  "still blocks" controls are written as key and value halves joined at runtime so they hold no literal.
- Not done, by B2's file ownership: `dl-073` Action 3 also asks for a cross-reference to S1 from the
  `testing` directive; `testing.md` is `task-173`'s in this batch. Candidate follow-up.
- Residual, not verifiable here: whether GitHub's detectors accept the new file. No line of the touched
  files other than the digest test holds a 40-character value-alphabet run and the word `aws`
  (`grep -nE "[A-Za-z0-9/+=]{40}" <the four files> | grep -i aws` → no line); `secret-fixtures.test.ts` puts 64-hex
  SHA-256 digests on the same line as fixture names. Only a push settles it (as `bug-055` says).

### Pending amendments (approver)

- `spec-007-secret-hygiene-patterns` — proposed `--reason`: "task-182: §1 states what a clean scan
  claims (0 findings on the configuration store, not a pre-publication check; dl-073 (C) + S1, S2) and
  that the security-secrets S1 check over test/ does not widen the surface; §2 dotenv-style-secret-line
  accepts a comment, a list marker before the keyword, readonly, declare and $env: (bug-190), and
  generic-api-key-assignment refuses a value made only of lower-case words joined by hyphens (bug-228).
  Revision note dated 2026-10-05."

### Proposed `service` element (approver; not added)

The push-protection exception (`dl-073` S3, `dl-122` Action 4). `service-ingest` would `memory add` it;
proposed content:

- **title:** "GitHub push-protection bypasses for the secret-scan test fixture"
- **provider:** "GitHub" · **kind:** "setting" · **owner_role:** "approver"
- **verify:** `gh api 'repos/wingfoil/wingfoil/secret-scanning/alerts?state=open' --jq '.[] | {number, secret_type, push_protection_bypassed, push_protection_bypassed_by: .push_protection_bypassed_by.login, push_protection_bypassed_at}'`
  (proposed, not run by this task: it reads the remote; the approver confirms the endpoint and the
  expected output, and whether the bypass alerts were resolved or remain open)
- **url:** "https://github.com/wingfoil/wingfoil/security/secret-scanning" · **account:** "wingfoil/wingfoil"
- **renews:** "" · **repo_refs:** `["test/validation/secret-scan.test.ts", "test/validation/helpers/secret-fixtures.ts"]`
- **decision:** "dl-122-no-secret-shaped-literals-in-fixtures" · **set_up_in:** "v0.2"
- **Purpose:** GitHub push protection rejected pushes over a fake AWS secret-access-key fixture in
  `test/validation/secret-scan.test.ts`; each was cleared with a bypass, recorded so the allowance is
  not discovered later as unexplained. Without it, a push of history that contains those commits is
  rejected again.
- **Configuration:** three bypasses are recorded in the repository: the first push, 2026-09-21
  (`bug-055`, five commits); the v0.2.2 dev-loop push, 2026-09-29 (`3513ecc5`, `bug-055` Triage notes);
  the v0.3 wave 1 B2 push, 2026-10-02 (`448e6df5`, `a7bb4b64`; `dev-loop-rel-v0.3-plan` B2 entry). All
  name the same file and the "Amazon AWS Secret Access Key" detection. The first two were on
  `robypomper/wingfoil`, before the transfer to `wingfoil/wingfoil`. No value is recorded: the literal
  is fake, and quoting it would recreate the problem.
- **Verification:** the `verify` command lists the alerts the bypasses created, with who bypassed and
  when.
- **Management:** the bypasses cannot be withdrawn while any commit that carries the literal is
  pushed, and those commits are never rewritten (`dl-035`). Since `task-182`, no new commit carries a
  secret-shaped literal under `test/` (the "dl-122 S1" suite test), so no new bypass should be needed.
  Closing the alerts as "used in tests" is the approver's choice. Retire with `memory deprecate` only if
  the history that carries the literal stops being pushed anywhere.
