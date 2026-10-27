---
id: "task-132-read-approver-identity-once-use-authority-check-approver"
type: task
title: "Read the approver's identity once and use it for the authority check, the `Approver:` line and the commit author"
status: done
release: "v0.3"
kind: "fix"
priority: "high"
tags: ["v0.3", "core", "security", "memory"]
ref: "dl-064"
bug: ["bug-142", "bug-149", "bug-153"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`readGitIdentity` (`src/core/git-identity.ts:61`) reads `git config`, but the commit is authored by git's own precedence (`GIT_AUTHOR_*` first), so the approved identity and the recorded one can differ (`bug-149`). `dl-064` B.1 gives this task the change: `requireGitIdentity` returns the identity and it feeds authority, `Approver:` and `--author`. The identity → prepare-transition preamble is copied in four verbs (`bug-142`), which is where the single read belongs; `isValidAttribution` accepts RFC 2606 reserved domains (`bug-153`).

## Acceptance Criteria

- (red-first) with `GIT_AUTHOR_EMAIL` set to an address other than `user.email`, `memory approve` either uses one identity for the check, the `Approver:` line and the author, or refuses; never two (the rule chosen in design, stated in `spec-006`).
- (red-first) one shared preamble helper is called by submit/approve/reject/deprecate (and `amend` from task-127, `park` from task-180 when present); a structural test asserts no verb calls `requireGitIdentity` directly.
- (red-first) `isValidAttribution` rejects `.invalid`, `.example`, `.test`, `.localhost` domains.
- (characterization) `spec-006` states the order usage checks → identity → transition legality → authority, scoped to `approve`/`reject` (A.1), with a Revision note.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-064 A.1 (pre-flight order in spec-006, approve/reject), B.1; REQ-SEC-01; REQ-SEC-03.
- **Features:** P1.7, P1.8.
- **Notes:** Proposal key: C13.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect)

- `depends_on: []` — no upstream Execution Notes to read (`dl-015`). Inputs read: `dl-064` (`ready`;
  A.1, B.1, Review addendum, Scheduling addendum, Code addendum 2026-09-29), `bug-142`, `bug-149`,
  `bug-153`, `spec-006-core-domain-api` (`status: approved` — `grep -n '^status' docs/04_memory/design/specs/spec-006-core-domain-api.md`).
  `memory amend` (task-127) is registered; `memory park` (task-180) is not
  (`grep -n "fn: memory" src/core/index.ts` → add, history, search, submit, approve, reject, deprecate, amend).
- **The AC1 rule chosen (approver to confirm):** *use one identity*, not *refuse*. The identity is
  resolved once, in `git commit`'s own author order — `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`, then
  `author.*`, then `user.*`, per field (git's `EMAIL` variable and hostname guess deliberately not
  followed: REQ-SEC-01 refuses an identity nobody configured) — and that value gates authority, fills
  `Approver:` and is pinned as the commit's `--author`. Consequence: with `GIT_AUTHOR_EMAIL` naming a
  non-approver, `approve`/`reject`/`amend` now refuse; naming the approver, they succeed under that
  identity even when `user.email` is not an approver. This follows `bug-149`'s Expected Behavior/Fix.
  The committer stays git's own (the audit reads the author). `--author` outranks `GIT_AUTHOR_*`
  (verified on git 2.43: `GIT_AUTHOR_EMAIL=env@y.org git commit --author "Pin <pin@z.org>"` → `%an <%ae>` = `Pin <pin@z.org>`).
  *Superseded at the independent review:* the author is pinned through `GIT_AUTHOR_*` in the commit's
  environment, not `--author`, and the committer must resolve too (finding 1, 2 below).
- Order kept from task-125: usage checks → identity → transition legality → authority (approve,
  reject); amend's authority check stays right after its confinement check.
- `requireApprovalAuthority` takes the identity as a parameter (`dl-064` B.1: "a pure predicate"
  over the identity) — 13 call sites in `test/core/approval-authority.test.ts` updated.
- Scope: the non-transition mutating ops (`dna *`, `memory add`, `directive *`, `init`) still call
  `requireGitIdentity` directly and do not pin `--author`; they have no `Approver:` line and no
  authority check, so `bug-149`'s divergence cannot arise there. Listed as a candidate finding.
- AC classification:

| AC | Class | Why |
|----|-------|-----|
| AC1 one identity for check / `Approver:` / author | red-first | today `approve` with `GIT_AUTHOR_EMAIL` set commits `Approver:` = config, author = env |
| AC2 shared preamble + structural test | red-first | `beginMemoryTransition` does not exist; five verbs inline the pair |
| AC3 `isValidAttribution` rejects `.invalid/.example/.test/.localhost` | red-first | all four return `true` today (`bug-153` repro) |
| AC4 `spec-006` states the order, scoped to approve/reject, with a Revision note | characterization | documentation of an order the code already has (task-125) |

### red

- Commit `a02f4ab7` — `test/core/approver-identity-single-read.test.ts` (new, AC1, approve/reject/amend
  × generic, refusal and env-approver cases, plus submit/deprecate author pin),
  `test/core/memory-transition-preamble.test.ts` (new, AC2: enumerates `CORE_MODULES` memory ops with
  `mutates: true` except `memoryAdd`, reads each `fn.toString()`; `park` joins by being registered),
  `test/memory/audit.test.ts` (AC3, 6 reserved + 3 ordinary domains), `test/core/git-identity.test.ts`
  (requireGitIdentity returns the identity; readGitIdentity precedence, checked against the author
  git itself records).
- Run: `npx jest test/core/approver-identity-single-read.test.ts test/core/memory-transition-preamble.test.ts test/memory/audit.test.ts test/core/git-identity.test.ts`
  → `Tests: 30 failed, 73 passed, 103 total`, 4 suites failed. The AC1 generic case failed with
  `Expected: "Env Author <env-author@example.invalid>" Received: "WingFoil Test <wf-test@example.invalid>"`
  (Approver line vs author) — the defect itself. The submit/deprecate pin passed (git already authors
  with env there): a pin, not a red.

### green

- Commit `56f08b2a`. `src/core/git-identity.ts`: `readGitIdentity` resolves in git's author order with
  ONE `git config -z --get-regexp '^(author|user)\.(name|email)$'` subprocess (was two per read, three
  reads per approval); `requireGitIdentity` returns `CoreResult<GitIdentity>`.
  `src/core/memory-transition.ts`: `beginMemoryTransition` (identity → `prepareMemoryTransition`) and
  `BegunMemoryTransition`; `commitMemoryTransition` takes it and passes `{ author: identity }`.
  `src/storage/commit.ts`: `CommitOptions.author` → `--author`. `src/core/approval-authority.ts`: takes
  the identity. `src/core/index.ts`: the five verbs call `beginMemoryTransition`; `readGitIdentity`
  no longer imported (`grep -n "readGitIdentity" src/core/index.ts` → nothing).
  `src/memory/audit.ts`: `hasReservedDomain` (top-level label only, case-insensitive).
- Same-class fixes: `makeTempGitRepo` commits as `wf-test@example.invalid`, so three audit tests that
  assert "every commit is valid" now configure their own author email
  (`test/memory/audit.test.ts`, `versioning-audit-trail.test.ts`, `git-log-framing.test.ts`); the
  global fixture identity is left as is (it is used as the approver email in dozens of fixtures).
  First pass used `wf-test@wingfoil-fixture.org`; the review pass switched it to `example.org` (see below).
- `docs/cli-reference.md` § Git identity: names `memory amend` among the approver-gated commands and
  states the resolution order and the one-identity rule.

### refactor

- `npm test` (as `npx jest --coverage`) → `Test Suites: 179 passed, 179 total`, `Tests: 3008 passed, 3008 total`.
- Coverage: Statements 98.82% (4383/4435), Branches 95.12% (2342/2462), Functions 94.34% (734/778),
  Lines 99.52% (3810/3828). `main`-equivalent baseline at `5b885fd5` (same worktree, before any change):
  98.82 / 95.06 / 94.44 (731/774) / 99.52. Functions −0.10pp: every touched source file is at 100%
  functions (`coverage/coverage-summary.json`: git-identity 5/5, approval-authority 5/5,
  memory-transition 8/8, audit 14/14, commit 11/11); the one newly uncovered function is the CJS
  re-export getter of `prepareMemoryTransition` in `src/core/index.ts`, which `memory-submit.test.ts`
  no longer imports through the barrel. Recorded, not hidden.
- `npm run lint` → clean. `npm run docs:api` → exit 0. `npx tsc --noEmit -p tsconfig.json` and
  `npx tsc -p tsconfig.build.json --noEmit` → clean. `test/docs/cli-reference.test.ts` green (in the full run).
- BDD: P1.7/P1.8 feature files unchanged (no AC asks for a scenario); their suites pass in the full run.

### review (self, reviewer)

- AC1 met: `approver-identity-single-read.test.ts` 21/21 with the preamble test
  (`npx jest test/core/memory-transition-preamble.test.ts test/core/approver-identity-single-read.test.ts` → 21 passed).
- AC2 met: the structural test enumerates five verbs (11 tests = 1 + 5×2), none calls
  `requireGitIdentity`/`readGitIdentity`/`prepareMemoryTransition`.
- AC3 met: `test/memory/audit.test.ts` reserved-domain cases pass; `dev@test.example.com`,
  `dev@contest.org`, `dev@company.testing` still valid.
- AC4: `spec-006` §7 + Revision (2026-10-01) written — a pending amendment, uncommitted (below).
- Unasserted (testing T1): nothing in the ACs; the committer identity is deliberately not asserted.

### review (independent) — reject → fix in-task

The coordinator's independent review found two defects and five same-class items; the task stayed
`in-review` and was fixed on this branch, red first.

| # | Finding | Red (`00b8a65f`) | Fix (`08c2b6bb`) |
|---|---------|------------------|------------------|
| 1 | BLOCKER, REQ-SEC-01 regression vs 0.2.1: author from `GIT_AUTHOR_*`/`author.*` with no `user.*` passed the check, then `git commit` died on "Committer identity unknown" after the write, leaving the document modified and staged | `test/core/identity-preflight-committer.test.ts`: `memory approve`, `memory submit`, `memory add`, `dna set` → exit 1, REQ-SEC-01 message, HEAD unmoved, `git status --porcelain` empty; failed with `Committer identity unknown` from `git commit` | `requireGitIdentity` resolves the committer too (`GIT_COMMITTER_*` → `committer.*` → `user.*`) and refuses with the REQ-SEC-01 message; shared by every mutating op |
| 2 | `--author "<name> <<email>>"` is re-parsed by git: `Ann <x` recorded `ae=x ann@…`; a newline in the name forged `Approver:` lines | `test/storage/commit.test.ts` (recorded `%ae` equals the given email; `author` outranks `env`); `test/core/git-identity.test.ts` (`<`, `>`, newline, tab, BEL in name/email, from env or config) | `commitPaths` pins `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` in the commit's env; `requireGitIdentity` refuses `<`, `>`, C0/DEL in any of the four values: `git identity not usable: the <role> <field> contains '<', '>' or a control character` (exit 1) |
| 3 | `docs/cli-reference.md` § Git identity said `user.*` only | — (docs) | states author and committer sources, the blank-variable rule and both refusal messages |
| 4 | a set-but-blank `GIT_AUTHOR_*` fell through to `user.*`; git refuses a blank name and records a blank email as `<>` | `git-identity.test.ts`: `''`/whitespace in `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_EMAIL` → refused | a defined variable wins even when blank (resolves to `''`); the check refuses both |
| 5 | `src/core` re-exported `prepareMemoryTransition`, a bypass of the identity preamble | — (structural; `grep -rn "prepareMemoryTransition" test src --include=*.ts` → no importer outside `src/core/memory-transition.ts`) | re-export dropped; `export type { BegunMemoryTransition }` added |
| 6 | `a@foo.test.` passed the reserved-TLD check | `audit.test.ts`: `foo.test.`, `foo.invalid..` | trailing dots stripped before taking the top-level label |
| 7 | fixture domain `wingfoil-fixture.org` is registrable | — | switched to `example.org` (IANA-reserved at the second level, which the top-level-only rule accepts; a future RFC 2606 second-level rule would have to move it again) |

- Red run: `npx jest test/core/identity-preflight-committer.test.ts test/core/git-identity.test.ts test/storage/commit.test.ts test/memory/audit.test.ts test/memory/versioning-audit-trail.test.ts test/memory/git-log-framing.test.ts`
  → `Tests: 20 failed, 121 passed, 141 total`.
- **Audit impact** (finding 7), measured with this build (`npm run build`, then
  `node -e "require('./dist/memory/audit.js').auditAttribution('/home/robypomper/Workspaces/WingFoil2', ['.'])…"`)
  on the main working tree at `69eeef3f`: **1177/3290** commits invalid, every one
  `Probe <probe@example.invalid>` (the `dl-094` contamination); over
  `docs/04_memory`, `docs/05_plans`, `.wingfoil`: **69/1141**, same author. The reviewer measured
  1177/3285 at `58342a45`. `auditAttribution` is wired to no CLI command
  (`grep -rn auditAttribution src --include=*.ts` → only `src/memory/audit.ts`, `src/memory/index.ts`
  and a doc comment in `src/memory/git-log.ts`), so no user-visible output changes today.
- Re-review: APPROVE, with one wording fix applied — a blank variable is refused "as git refuses it"
  was true only for names (git 2.43 records a blank email as `<>`); `docs/cli-reference.md`, the
  `resolveField` comment and `spec-006` §7 now say so.
- Gates after the fix: full `npx jest --coverage` → `Test Suites: 180 passed`, `Tests: 3032 passed`;
  coverage Statements 98.83% (4393/4445), Branches 95.10% (2349/2470), Functions 94.48% (736/779),
  Lines 99.53% (3820/3838) — all at or above the baseline (98.82 / 95.06 / 94.44 / 99.52); the
  function dip of the first pass is gone with the re-export. `npm run lint` clean, `npm run docs:api`
  exit 0, both `tsc --noEmit` clean.

### Pending amendments (approver)

- `spec-006-core-domain-api` — new §7 (pre-flight order of the memory transition verbs; one identity;
  what the identity check refuses) and Revision note (2026-10-01), updated after the independent
  review. Proposed `--reason`: "task-132: adds section 7, the pre-flight order usage checks, identity,
  transition legality, authority, scoped to approve and reject (dl-064 A.1 as corrected by its Review
  and Code addenda), and the one-identity rule of dl-064 B.1 that bug-149 needed: the author is
  resolved once in git's order and pinned through the commit's environment, and the check also
  requires a committer and refuses blank ident variables, angle brackets and control characters, as implemented by
  beginMemoryTransition and requireGitIdentity."
- Merge order: `task-161` also edits `spec-006` (its §6) and merges first; this amendment adds §7 and
  appends a Revision note at the end of Process Notes — rebase onto 161 before running the amend.
  `task-138` edits `src/core/index.ts` (paths description) and merges first.

