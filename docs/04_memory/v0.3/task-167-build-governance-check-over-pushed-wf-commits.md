---
id: "task-167-build-governance-check-over-pushed-wf-commits"
type: task
title: "Build the governance check over pushed wf() commits"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "governance", "ci"]
ref: "dl-103"
bug: []
depends_on: ["task-126-declare-closed-wf-operation-grammar-bracket-set-state", "task-127-add-memory-amend-id-reason-approver-gated-verb"]
tmpl_version: 260703
wave: "w1"
---

## Description

Governance rules on `wf()` commits are checked by nobody. A read-only script checks a commit range: subject grammar with the ratified verb set, canonical bracket, `Approver:`/`Reason:` shape (dl-067), authority (author is a `team.members` approver, dl-094) and state legality (`verifyTransitionConsistency`). It hard-fails on commits after its introduction and reports older history without failing.

## Acceptance Criteria

- (red-first) one fixture repo per rule with a violating and a conforming commit; each violation is reported with sha and rule; exit 1 on a violation after the introduction commit, 0 with a report for history before it.
- (characterization) reuses `src/memory` parsers (commit-message, audit, state-machine) rather than re-implementing them; not shipped in the tarball (`npm pack --dry-run`, spec-015).
- (characterization) run over `main` at the task's base: the report's counts recorded (history is reported, not failed).

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-103 §1 (checks), starting mode.
- **Features:** P1.10, P4.14.
- **Planning ruling:** Approver ruling 2026-09-30 (plan R19): `dl-103` §2 (iii), signed approvals, is out of v0.3 (v0.4 at the earliest, possibly v1.0).
- **Notes:** Proposal key: D21.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 0 (2026-10-01, `task-126`'s independent review).** `verifyTransitionConsistency(root, path, machine?)` (`src/memory/audit.ts`) has no product caller yet; this check is its first. Pass the type's machine (loaded from `memory.yaml` at the checked commit) so `illegal-hop` findings fire, because without it only a chain's endpoints are compared. Known historical drift the "report older history without failing" mode will list: `6437dbc4`, `50e57a04`, `28e41379` (a multi-hop `sync` whose bracket starts at `in-review` while the frontmatter was `planned`), 7 single-hop mismatches and 11 unparseable multi-bracket `sync` subjects (e.g. `02b77f97`, `764eb2a6`). Since the approver's 2026-10-01 ruling, the verb set is eleven, with `assign` (no bracket, no `Approver:`).

## Execution Notes

Branch `task/task-167-build-governance-check-over-pushed-wf-commits`, worktree `../.wf2-wt/task-167`,
cut from `main` at `5b885fd5`. Start `5019ed19`. `bug: []`, so there are no bug syncs.

### design (architect)

**`depends_on`** (dl-015). `task-126` and `task-127` are `done`, and their Execution Notes were read,
along with the handover note above. What this task takes from them:
- From `task-126`: the closed verb list `MEMORY_OPERATIONS` (eleven verbs, with `assign` only in its
  canonical form), `CONFIGURATION_SCOPES`, `parseMemoryOperation`, the chain reader, and
  `verifyTransitionConsistency(root, path, machine?)`, which has no caller yet. Without a machine it
  judges no hop, so the check passes one.
- From `task-127`: `amend` is an approval. Its body carries `Approver:` and `Reason:`, its bracket is
  `[s → s]`, and it needs approver authority.
- From `task-166` (merged `c670ff38`): `reasonDefect`/`reasonRefusalMessage` refuse C0 control
  characters other than tab and newline, and the reserved keys `Approver:`, `Reason:` and
  `WingFoil-Version:` in any letter case. The `dl-078` extension to DEL, C1 and U+2028/2029 belongs to
  `task-173` and is not in code yet. The check therefore reads exactly what the writer refuses today,
  and it will follow `task-173` without change, because it calls the same function.

**Specs and decisions cited** (`awk '/^status:/{print $2;exit}'` on each): `spec-008` and `spec-015`
are `approved`. `dl-103`, `dl-094`, `dl-067`, `dl-078`, `dl-079` and `dl-108` are `ready`. No spec
is missing or needs revision. `dl-103` Action 2 says to amend `spec-015` "if the script ships; it
should not", and it does not ship (AC2), so there is no amendment.

**Where it lives.** `scripts/check-governance.cjs` (+ `.d.cts`), like the other repository checks
(`check-release-tag`, `check-lockfile-pins`, `check-mcp-registration`). `npm run check:governance`
runs it. It loads `src/memory`, `src/core`, `src/validation` and `src/dna/schema` from the compiled
`dist/`, so `npm run build` comes first. If `dist/` is missing it exits 2 and says so. The tests run
after jest's `globalSetup` build.

**The rules** (the script's module comment is the full text):

| Rule | What fails | Reused from `src` |
|---|---|---|
| subject | a verb outside the eleven; an `assign` outside its canonical form; a `{type}` that the `memory.yaml` committed at the commit does not declare; an id list not separated by `, ` | `parseMemoryOperation`, `MEMORY_OPERATIONS`, `CONFIGURATION_SCOPES` (config scopes are skipped) |
| bracket | a bracket on `add`/`submit`/`assign`; none on the other verbs; any bracket other than `[a → b]` with U+2192, single spaces, at the end (the ASCII `->` included); a chain on any verb but `sync`; `deprecate` not into `deprecated`; `amend` not `[s → s]`; `park` not `[in-progress → backlog]` | `DEPRECATED_STATE` |
| body | `approve`/`reject`/`amend` without `Approver: Name <email> (role)` as the first body line, or with a role other than `approver`; any of them without `Reason:`; `Approver:` on `assign`; more than one `Approver:` or `Reason:` key line (any case); a `Reason:` key not written `Reason:`; a reason `reasonRefusalMessage` refuses | `parseApprovalMetadata`, `parseCommitReason`, `reasonRefusalMessage`, `APPROVER_ROLE` |
| authority | an approval whose author holds no `approver` role in the `dna.yaml` committed at its **first parent**, or none is committed there; an `Approver:` line naming someone other than the author (`dl-094`) | `hasApproverRole`, `DnaYaml` |
| state | on every Memory `wf()` commit, whatever its verb. **Bracketed**: `verifyTransitionConsistency` on each named document, with the type's machine **from the `memory.yaml` at the checked commit** (`mismatch`, `unparseable`, `illegal-hop`), plus a single hop that is not an edge (`isMachineEdge`; `amend` and `park` exempt). **Bracketless**, from the frontmatter: `submit` must move a named document along an edge, `add` must leave it in the initial state (`sequence[0]`), and `assign` must leave its status unchanged. **Every commit**: a touched document the subject does not name, whose status the commit changed. **Gated commit** whose `memory.yaml` is missing or does not validate: a finding (history: *state not checked*) | `verifyTransitionConsistency`, `reconstructMemoryTransitions`, `resolveStateMachine`, `isMachineEdge`, `parseBracketHops` (now exported) |

**Design decisions** (to confirm at review):
1. **Introduction commit.** By default it is the commit on `HEAD`'s first-parent line that added
   `scripts/check-governance.cjs` (`git log --first-parent --diff-filter=A`). On this branch that is
   `0bdf4ce4`. On `main` it is the merge that lands the file, so the commits merged with it are
   history. `--introduced-at <rev>` overrides it, and `task-208` does not need to. *History* means the
   introduction commit and its ancestors, and only findings outside that set fail. (Amended at
   review: the first version took the oldest adding commit, which made `main`'s parallel commits
   gated.)
2. **Authority is read at the first parent.** That is the `dna.yaml` the approval rested on
   (`requireApprovalAuthority` reads `HEAD` before the commit). A commit cannot grant itself the role.
   This is tested: a grant made in the approving commit is a finding.
3. **`Approver:` outside `approve`/`reject`/`amend`** is not refused, except on `assign`, where the
   2026-10-01 ruling forbids it. Wherever it appears, it records an approval (`memory history` reads it
   whatever the verb), so its shape and its author's authority are checked. On `main`, 11 `wf(plan):
   finalize` commits carry one (`d13c390f`, …). Forbidding it outright would be a new rule. That is the
   approver's choice.
4. **A single hop is judged too.** `verifyTransitionConsistency` judges only a chain's hops and leaves
   a single hop to the write-time engine. Hand-written commits never met that engine (`bug-075`
   history), so the check applies `isMachineEdge` to single hops. `amend` and `park` are exempt,
   because the bracket rule pins their brackets.
5. **Documents a commit touches.** A document the subject names (by full id, or by short id with the
   slug left out) gets the full consistency check. Any other touched document is a finding only when
   the commit changed its status. That is `dl-103` §1's "each touched element".
6. **Configuration is read only at `.wingfoil/`.** Before `16fd0f02` (task-111), the configuration lived
   under `docs/self/.wingfoil/`. Older commits therefore have no machine (their hops are not judged and
   are listed under *state not checked*) and no `dna.yaml` (an authority finding). Both are history and
   reported only. A fallback to the old location would be specific to this repository.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — per-rule fixtures (violating + conforming, sha + rule), exit 1 after the introduction, 0 with a report before it | **red-first** | no check existed |
| 2 — reuses the `src/memory` parsers; not in the tarball | characterization | reuse is structural (the table above); `npm pack --dry-run` already lists no `scripts/` (`files: [dist, README.md]`) |
| 3 — run over `main` at the base, counts recorded | characterization | a measurement |

### red (developer)

`9075fec2`: `test/cli/check-governance.test.ts` and the `.d.cts`. There is one fixture repository for
each rule, plus one for the starting mode and one for packaging. Each is a throwaway `git init` whose
identities are passed per commit through `GIT_AUTHOR_*` (`dl-094` (ii)). `npx jest
test/cli/check-governance.test.ts` → the **suite failed to run**: `Cannot find module
'../../scripts/check-governance.cjs'`.

### green (developer)

`0bdf4ce4`: the script, `"check:governance"` in `package.json`, and `parseBracketHops` +
`BracketHop` exported from `src/memory/audit.ts` and the barrel. `npx jest
test/cli/check-governance.test.ts` → 26 passed.

The first run over the full history then found three gaps. Each was fixed with a test that failed
first (`-t` on the new case, with the fix stashed: 1 failed):
- `4cf02924`: the run **crashed**. `verifyTransitionConsistency` throws `E_YAML_PARSE_ERROR` on a
  revision whose frontmatter does not parse (`docs/self/docs/04_memory/v0.2/task-070-license-file.md@a651335d`).
  The document's commits are now listed under *state not checked* with the error (7 on `main`).
- `59dcc409` + `8a9f25c5`: the multi-bracket `sync` subjects (`02b77f97`, `764eb2a6`) have no parsable
  id list and name documents by short id, so no document was checked. Touched documents are now
  matched against every token of the subject, by full id or by short id.
- `596a7a16`: the per-file survey `task-126` ran over `docs/04_memory/bugs` (rerun here:
  `verifyTransitionConsistency` on every file, `mismatch` only) lists 10 mismatches. Four were missing.
  `6f5795aa`, `f7cd7b15` and `720d36b3` move a bug their subject does not name, which is decision 5.
  `3e9a73b3` uses the undeclared verb `plan`, so state is now checked on every bracketed subject,
  whatever the verb.

`npx jest test/cli/check-governance.test.ts` → **30 passed**.

### Full history (AC3)

`node scripts/check-governance.cjs --json` on `596a7a16`. That is `5b885fd5` plus this task's commits,
and the only `wf()` one among them, `5019ed19`, has no finding. The introduction commit is
`0bdf4ce4`, so every commit is history. Result: **exit 0**, 362 s (1174 s for an earlier run under a
load average of ~80).

- **1952 `wf()` commits checked** (configuration scopes excluded). 0 gated. **795 findings on 562
  commits**, all reported, none failing.
- **authority 466** on 328 commits:
  - 328 have no `.wingfoil/dna.yaml` at the parent. These are approvals before `16fd0f02`, under
    decision 6.
  - 138 have an `Approver:` line naming the approver while `probe@example.invalid` authored the
    commit (`dl-103`'s "approver and author disagree", `dl-094`).
- **bracket 250**:
  - 166 use the ASCII `->` (`bug-137`).
  - 83 are `submit` commits with a bracket (`dl-054`: none).
  - 1 is a `deprecate` into `superseded` (`a7d783aa`).
- **subject 47**:
  - 45 use a verb outside the eleven. 27 are the verbless `wf(task): task-…`, then `plan` 7,
    `schedule` 3, `start-fix` 3, `enter-releasing` 2, `mark-released` 2 and `deferred` 1. That is the
    45 `task-126` counted.
  - 2 have id lists that do not parse (`02b77f97`, `764eb2a6`).
- **state 31** on 22 commits:
  - 11 unparseable brackets.
  - 7 mismatches: the 3 chain drifts `6437dbc4`, `50e57a04` and `28e41379`, plus `417e223f`,
    `901b3fb5` and `3e9a73b3` ×2.
  - 13 documents moved without being named (`6f5795aa`, `f7cd7b15`, `720d36b3`, …).
  - Every drift the handover lists is in the report.
- **body 1**: `1ce90aea`'s blank `Reason:` (`dl-103`).
- **state not checked: 817 entries on 810 distinct commits.** All 810 have no machine at their
  commit (bracketed, before `16fd0f02`). The 7 parse-error entries fall on commits already among
  them. That is the independent reviewer's count, and the run below confirms the shape:
  1203 commits = 1203 no-machine entries, plus 9 parse-error entries on those same commits.
- After the review fixes (§ review (independent)), the same run gives the same 795 findings, and
  *state not checked* rises to 1212 entries on 1203 commits.

### refactor (developer)

Gates on `596a7a16` + this commit's comment fix. Only `scripts/check-governance.cjs`'s comment
changed after the run.

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 178 suites / 3000 tests; 98.82 / 95.06 / 94.44 / 99.52 (stmts / branches / funcs / lines). `main` `5b885fd5` (task-135's base worktree, same command): 98.82 / 95.06 / 94.44 / 99.52, so no regression. `scripts/` is outside `collectCoverageFrom`, and the `src` change is two `export` keywords |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| copy of the script with no `dist/` beside it | exit 2, `… dist is not built: run \`npm run build\` first` |

BDD: `P1.10-memory-history.feature` and `P4.14-approval-routing.feature` have no scenario about a
commit-range check. `grep -rli "governance\|verifyTransition\|bracket"
docs/02_requirements/02_bdd/features/` finds only `P2.5-paths.feature`, where `governance` is the
`paths` category. No AC asks for a scenario, so none was added.

No CLI command or help text changed, so `docs/cli-reference.md` is unaffected (the script is not a
`wingfoil` command). `CLAUDE.md` and `COLLABORATION.md` list no repository checks to extend. `task-208`
wires the check into CI and hooks.

### review (reviewer)

Evidence per AC:
- **AC1.** `test/cli/check-governance.test.ts` has one `describe` per rule: subject, bracket, body,
  authority and state. Each has violating commits (`rulesOf(report, sha)` names the rule) and
  conforming ones (`[]`). Each finding carries `sha` and `rule`, and the command prints both (the "as a
  command" test). The starting-mode block covers a violation after the introduction (gated, exit 1), the
  same before it (reported, exit 0), the default introduction commit, `--base`, and exit 2 on a bad
  option.
- **AC2.** The table in design names each reused `src` function. `npm pack --dry-run --json
  --ignore-scripts` lists nothing under `scripts/` (packaging test).
- **AC3.** § Full history above.

Same-class search in the files touched:
- `src/memory/audit.ts`'s module comment for `parseBracketHops` now names its second caller.
  `verifyTransitionConsistency`'s comment still says a single hop "is the write-time engine's to
  refuse". That is true of that function, and the script states its own extension.
- `readStatusAt`'s parse failure also breaks `wingfoil memory history`. `node dist/cli.js memory
  history task-070-license-file` → exit 2, `error: bad indentation of a mapping entry (5:264)`. That is
  `src/memory/audit.ts` behaviour outside this task's scope. It goes to the coordinator as a candidate
  bug, not a fix here.

Pending amendments (approver): none.

### review (independent)

A separate review of `20422c6a` (coordinator, 2026-10-01) returned **APPROVE WITH FIXES**. The task
stays `in-review`. Red `4c515e89`: `npx jest test/cli/check-governance.test.ts` → **4 failed, 32
passed** (the two conforming and lenient cases pass, which is characterization). Green `c521030f`:
36 passed.

1. **Exit 1 was not only "a gated finding".** `main` rethrew every error that was not a
   `UsageError`, and Node exits 1 on an uncaught throw. Run from a directory that is not a
   repository, with no `--root`, it exited 1. Now every failure to run exits 2 with `error: <message>`,
   and the header documents that. An empty repository says `… is not a git repository, or has no
   commit at HEAD` instead of `HEAD HEAD is not a commit`.
2. **A gated commit without a readable `memory.yaml` was silently unchecked.** The reviewer's probe
   was `types: [` plus `wf(task): start a [in-progress → done]` → exit 0. On a gated commit, a missing
   or invalid `memory.yaml` is now a `state` finding. An unknown type under a valid `memory.yaml` was
   already a `subject` finding. History keeps the leniency (*state not checked*).
3. **Bracketless commits were never state-checked.** Now covered:
   - `submit` must move a named document along an edge.
   - `add` must leave it in `sequence[0]`.
   - `assign` must not change its status.
   - The unnamed-document check runs on every commit.

   The reviewer's probe (`submit task-1` draft → done; `add task-2` moving `task-1`) gives exit 1 with
   both findings. The rule table above matches the code.
4. **Decision 1:** the introduction commit is taken on the first-parent line. A merge simulation shows
   it. In a clone, `main` (`050c938c`) was merged `--no-ff` with this branch, then
   `node scripts/check-governance.cjs --root <clone> --base 5b885fd5` ran: the introduction is the
   merge commit, the 13 `wf()` commits in the range are history, 0 findings, exit 0. On this branch,
   `--base 5b885fd5` gives 2 `wf()` commits, 0 findings, exit 0. The fixture test merges a side branch
   that adds the script.
5. The *state not checked* wording above has been corrected.

Re-run on `c521030f` (`npm run build` by jest's `globalSetup`):

| Command | Result |
|---|---|
| `node scripts/check-governance.cjs --json` (full history) | exit 0, 386 s; 1953 `wf()` commits (1 gated: `20422c6a`, no finding); 795 findings, all history, same counts by rule as above |
| `npm run test:coverage` | exit 0; 178 suites / 3006 tests; 98.82 / 95.06 / 94.44 / 99.52, equal to `main` `5b885fd5` |
| `npm run -s lint`, `npm run -s docs:api`, both `tsc` | exit 0 |

**Follow-ups for the coordinator to file** (not fixed here, at the reviewer's direction):
- Pairing the verb with the kind of edge: `reject` on a forward edge, `approve` on a reject edge,
  `finalize` not into the last state, and a `sync` across a reject edge that cites no reject sha
  (`dl-061` B.1).
- Status changes made in non-`wf()` commits are invisible to the check (decision-log material).
- Documents deleted at `HEAD` are only partly checked (*state not checked*).
- `task-208` needs `fetch-depth: 0` and a build step in CI.
- `readStatusAt` crashes `memory history` on a revision whose YAML is bad (separate bug,
  `task-070-license-file`).

