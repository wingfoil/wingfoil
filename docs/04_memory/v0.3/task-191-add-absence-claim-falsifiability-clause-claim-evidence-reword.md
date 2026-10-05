---
id: "task-191-add-absence-claim-falsifiability-clause-claim-evidence-reword"
type: task
title: "Add the absence-claim falsifiability clause to claim-evidence and reword the determinism directive to the I/P/O split"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "directives"]
ref: "dl-097"
bug: []
depends_on: ["task-139-extend-documentation-doc-versioning-testing-directives-ratified-clauses", "task-141-reposition-brief-governance-layer-make-determinism-index-composite", "task-161-revise-command-baseline-which-verbs-read-head-filesystem"]
tmpl_version: 260703
---

## Description

`claim-evidence` gains `dl-097` §1's falsifiability clause for absence claims, and the `determinism` directive stops promising "substantially equivalent software" as an input guarantee, which `dl-131` retires. The audience, `spec-006` §6 and filesystem-effect revisions of the same directives (`dl-084`/`dl-085`/`dl-086`) are task-161's, which lands first.

## Acceptance Criteria

- (characterization) `claim-evidence.md` carries dl-097 §1's clause verbatim in *Absence and presence*.
- (characterization) `determinism.md`'s first rule is reworded to the I/P/O split of dl-131 Decision 3 (WingFoil guarantees I; P measured; O reported, never promised).

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-097 §1; dl-131 Action 9 (directive half).
- **Features:** P3.5.
- **Notes:** Proposal key: D04. coordinate with domain C, which owns `dl-084`'s cli-reference/spec-008 fix of the same family. Reduced after dedupe: `dl-085`/`dl-086` (audience, normative `spec-006` §6, the filesystem-effect category, the TSDoc status words) are owned by task-161.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect)

**Dependencies (dl-015).** `task-139`, `task-141`, `task-161` are `done`
(`grep -m1 '^status:' docs/04_memory/v0.3/task-1{39,41,61}-*.md` → three `done`). Read their notes:
- `task-161` gave `claim-evidence` its *Who this reaches* section and applied doc-versioning V1:
  `claim-evidence` declares no version, so it is not given one. Same here for both files:
  `grep -n -i version .wingfoil/directives/custom/{determinism,claim-evidence}.md` prints only two
  prose hits in `claim-evidence.md` (the `--version` examples, lines 41 and 56) — the positive case
  that the pattern matches — and no `version:` field in either file. So no bump.
- `task-139` added the D1 pointer in *How a claim is recorded*; untouched here.
- `task-141` wrote the I/P/O table into `docs/01_vision/01_product-brief.md` (*North Star*); the
  directive wording below follows its component names and promises
  (`grep -n 'I — Input\|O — Outcome' docs/01_vision/01_product-brief.md` → lines 165, 167).

**Sources.** `dl-097` and `dl-131` are `ready` (`grep -h '^status:' docs/04_memory/design/dls/dl-{097,131}-*.md`
→ two `ready`). No tech-spec is cited by the ACs, none edited.

**Scope.** Only `claim-evidence.md` and `determinism.md` (B2 notes). The clause was absent before:
`grep -rn "could have found" .wingfoil/` → nothing (exit 1) at `acc699de`, while the same grep after
the edit hits `claim-evidence.md` (positive case).

**AC classification.**

| AC | Class | Why |
|---|---|---|
| 1 — `claim-evidence` carries dl-097 §1 verbatim | characterization (directive text) | no behaviour; the directive loader already reads the file |
| 2 — `determinism` first rule on the I/P/O split | characterization (directive text) | no behaviour |

No red-first AC, so no failing-test commit (testing directive: never fabricate a red). No test pins
directive prose in this repo; the evidence is the greps below and the loader run.

### red

None: both ACs are characterization (above).

### green — `a38e6e2a`

- `claim-evidence.md`, *Absence and presence*: dl-097 §1's clause as a paragraph of the bullet, plus
  where it applies (dl-097 §1's second paragraph). *Why this is written down* gains the `task-079`
  instance (`e693a289`) the clause exists for. Verified: `git log -1 --format=%s e693a289` →
  "… correct an overclaim in the review summary"; `git grep -c 'REQ-' a20b346c -- docs/02_requirements/02_bdd/features/`
  prints nothing, while `git grep -l 'US-' a20b346c -- docs/02_requirements/02_bdd/features/ | wc -l` → `63`.
- `determinism.md`, first rule: the Index is composite (dl-131 Decision 3); I guaranteed by WingFoil
  and tested (REQ-SYS-07, REQ-STATE-09); P measured on every run; O reported, never promised. The
  only remaining "substantially equivalent software" in the file is the sentence forbidding it as a
  guarantee (`grep -n 'substantially equivalent software' .wingfoil/directives/custom/*.md` → one
  hit, `determinism.md:24`).

### refactor (gates, at `a38e6e2a`)

- `npm test` → 233 suites, 4289 tests passed.
- `npm run test:coverage` → 233/4289 passed; All files 98.99 stmts / 96.16 branches / 96.08 funcs /
  99.61 lines. No source or test change (`git diff --stat 0b297169 -- src test` → empty), so coverage
  cannot regress against main.
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`,
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0 each.
- `node scripts/check-governance.cjs --base 0b297169` → exit 0, 0 findings.
- `npm run build && node dist/cli.js directives list` → exit 0, both `claim-evidence` and
  `determinism` listed after the commit.
- No CLI command/help touched; no BDD scenario covers directive prose (P3.5 features describe
  loading, not this text).

### review (self, reviewer)

| AC | Status | Evidence |
|---|---|---|
| 1 | met | a whitespace-normalised substring check of dl-097 §1's quoted clause against `claim-evidence.md` → `True` (python one-liner over both files) |
| 2 | met | `determinism.md` first bullet; `grep -n 'never promised' .wingfoil/directives/custom/determinism.md` → line 22 |

Same-class sweep: `grep -rln 'substantially equivalent' --include=*.md --include=*.yaml .` outside
Memory/plans lists `CLAUDE.md`, `README.md`, `docs/agents.md`, `docs/01_vision/*` and `.wingfoil/dna.yaml`.
All state the North Star, which dl-131 Decision 1 keeps; `CLAUDE.md`'s is dl-131 Action 9's other
half (owned by `user-docs`' `align-agent-docs`), and `dna.yaml` belongs to task-251 in this batch. Not
edited here; reported to the coordinator.

Pending amendments (approver): none.
