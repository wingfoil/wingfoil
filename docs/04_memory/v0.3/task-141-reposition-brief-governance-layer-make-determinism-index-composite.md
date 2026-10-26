---
id: "task-141-reposition-brief-governance-layer-make-determinism-index-composite"
type: task
title: "Reposition the brief as a governance layer and make the Determinism Index composite"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "process", "vision", "docs"]
ref: "dl-112"
bug: ["bug-160"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

The brief positions WingFoil only against flat rule files, and uses "determinism" for both the context WingFoil assembles and code it does not control. One change edits the vision set together, so the Solution paragraph changes once (dl-131 Action 2), and reconciles the vision index that both decisions require updated in the same commit.

## Acceptance Criteria

- (characterization) `01_product-brief.md`: Vision Statement *Unlike* replaced (Q1 (B)); Key Differentiators restructured into "Replaces" / "Works with" (Q2 (c)); determinism sentence per Q3 (i) and dl-131 Decisions 1–2 in the same commit; v1.0 line "Determinism Index reported (I, P, O)"; every competitor fact sourced and dated in References (approve `Reason:` of dl-112).
- (characterization) `02_product-vision.md` Vision Statement; `08_mvp-canvas.md` (North Star clause, problem statement, v1.0 line); `03_is-isnot.md` (IS NOT line, DOES line narrowed); `06_features.md` (Determinism Index row); `07_sequencer.md` (v1.0 DoD); `minor-v1.0.md` Success Criteria and summary — each with its `doc-versioning` bump.
- (characterization) a proposed `REQ-STATE-10` (process conformance P computed from git and the configuration, fit criterion on dl-131 Decision 3's checks) added to `03_state-context.md` with traceability to the P measures; the approver ratifies it at review.
- (characterization) bug-160: `00_index.md`'s map shows each file's header version, date and line count, and its line ranges point at the named sections — verified by a one-line script in Execution Notes; task-186 updates it again for its files.

## Implementation Notes

- **Size:** M · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-112 (Q1 (B), Q2 (c), Q3 (i), Q4 (x)); dl-131 (Q1 (b), Actions 2–7).
- **Notes:** Proposal key: D27. README follows through `align-user-docs` (dl-112 Action 4), not here. Deviation from the brief: 00_index.md staleness is fixed here rather than left to user-docs because bug-160 must be named by a task and dl-112/dl-132 require the index updated with the edits.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-01)

- **Inputs read.** `depends_on: []`, so no upstream Execution Notes (dl-015). Decisions applied, both `ready`
  (`grep -m1 '^status' docs/04_memory/design/dls/dl-112-*.md docs/04_memory/design/dls/dl-131-*.md`):
  `dl-112` ratified with Q1 (B), Q2 (c), Q3 (i), Q4 (x) and "any competitor fact is sourced and dated"
  (`git show -s 0f8e99ff`); `dl-131` ratified with Q1 (b), ruling R1 (`git show -s 29afc556`). `dl-132`
  (element 5: the vision index moves in the same commit) and `dl-089` (D01) are `ready` too. No tech-spec is cited.
- **AC classification.** All four ACs are documentation, so all are **characterization**: no behaviour of
  `src/` changes (`git diff --stat 5b885fd5..HEAD -- src test` prints nothing), and no red is fabricated.
- **No overlap in batch B2.** None of tasks 132, 134, 135, 137, 138, 161, 167 names a vision or SARD file
  (`grep -c -E '01_vision|03_sard|02_requirements' docs/04_memory/v0.3/task-{132,134,...}-*.md` → 0 for each).
  `task-186` (later wave) edits `04_personas.md`, the brief and the index again.
- **`minor-v1.0.md` cannot be edited here.** The AC lists its Success Criteria and summary, but `release` is
  `amendable: false` (`git show main:.wingfoil/memory.yaml | grep -n -A0 'amendable: false'` → lines 91, 108,
  143). dl-131 Action 5 predates that ruling ("edited in place"). Left unedited; see *Approver ruling needed*.

### red / green (2026-10-01)

No red (characterization only). Two commits:
- `5cb10729` `docs(vision)` — the whole vision set in one commit, so the brief's Solution paragraph changes once
  (dl-131 Action 2) and the index moves with the files (dl-132 element 5):
  - `01_product-brief.md` 1.5 → **1.6**: *Unlike* clause per Q1 (B); Key Differentiators restructured into
    **Replaces** / **Works with** (Q2 (c)), with the context-window argument kept as a *Replaces* row
    ("Brute-force context"), as dl-112's Q1 (B) rationale asks; the Solution sentence as a goal measured by the
    Index (Q3 (i)) followed by *Who controls what* (dl-131 Decision 2); under the North Star the behavioural
    definition (Decision 1) and the I/P/O table (Decision 3); v1.0 line "Determinism Index reported (I, P, O)".
  - `02_product-vision.md` 1.1 → **1.2** (Vision Statement); `03_is-isnot.md` 1.2 → **1.3** (IS NOT line; DOES
    line narrowed); `06_features.md` 1.6 → **1.7** (v1.0 row); `07_sequencer.md` 1.7 → **1.8** (v1.0 DoD);
    `08_mvp-canvas.md` 1.5 → **1.6** (problem line, North Star clause, v1.0 line). Each was committed before
    this edit (`git log -1 --format=%h -- <file>`: b44a58a2, 0927f5df, 0927f5df, f5a25fca, c2b65b3e, c2b65b3e),
    so each bumps once, dated 2026-10-01 (doc-versioning).
  - **Competitor facts (dl-112 approve `Reason:`).** The new text names categories, not products, so it states
    no fact about a third-party tool. The old row "CLAUDE.md / .cursorrules — Single flat file" was such a fact,
    unsourced; it became "Flat agent-rule files". The brief's References say so and require a source and date
    for any later edit that names a tool (`grep -n -iE 'cursorrules|CLAUDE\.md' docs/01_vision/01_product-brief.md`
    → nothing).
  - **bug-160.** `00_index.md`: the document map is regenerated from each header and its line count,
    and every section range and anchor is recomputed; "Last indexed" now reads 2026-10-01. The stale workshop
    shorthands (`0_product-brief`, `1A`, `5B`, a non-existent `X_coherence-audit`) became file names. The range
    rule is now stated (heading to the line before the next heading of the same or higher level). The canvas
    appendix stops copying versions and points at the index, as bug-160's Notes suggest.
- `7761ff96` `docs(requirements)` — **REQ-STATE-10** (proposed) in `03_state-context.md`. It defines process
  conformance P, computed from git and the configuration only. The fit criterion lists dl-131 Decision 3's
  checks plus a determinism check on the measure itself. Traceability: dl-131 D3 / A7, dl-089 catalogue v2
  (task-222), P1.2, P1.7, P1.10, P1.13, P4.1, P4.13; no BDD scenario yet. SARD index: registry row, STATE 9 → 10,
  total 43 → 44. SARD files carry no `version` header (`grep -c '^\*\*Version' docs/02_requirements/03_sard/*.md`
  → 0), so there is nothing to bump.

**bug-160 verification (one-line script, run in `docs/01_vision/`).** It checks the map's version, date and
line count against each file, and that every `Lx–Ly` range in the section maps starts on a heading and ends
where that section ends. The `#` lines inside `06_features.md`'s YAML fences (380, 414) are excluded:

```
python3 -c "import re;I=open('00_index.md').read();R=lambda f:open(f).read().splitlines();bad=[(f,v,d,n) for f,v,d,n in re.findall(r'^\| \[\`([^\`]+)\`\][^|]*\| (\S+) +\| (\S+) +\| [^|]+\| (\d+)',I,re.M) if (v,d,int(n))!=((re.findall(r'^\*\*Version:\*\* (\S+)',open(f).read(),re.M) or ['—'])[0],re.findall(r'^\*\*Date:\*\* (\S+)',open(f).read(),re.M)[0],len(R(f)))];H=lambda f:{i:len(m[1]) for i,l in enumerate(R(f),1) if (m:=re.match(r'(#+) ',l)) and not (f=='06_features.md' and i in (380,414))};E=lambda f,a,h:min([j-1 for j in h if j>a and h[j]<=h[a]]+[len(R(f))]);bad+=[(f,a,b) for s in re.split(r'^### \`',I.split('## Per-document')[1],flags=re.M)[1:] for f in [s.split('\`')[0]] for h in [H(f)] for a,b in [(int(x),int(y)) for x,y in re.findall(r'L(\d+)–(\d+)',s.split('\n---')[0])] if a not in h or E(f,a,h)!=b];print('mismatches:',bad)"
```

On this branch the script prints `mismatches: []`. On `main` (`5b885fd5`, extracted with `git archive`) the
same script reports **42** mismatches. A deliberately broken range (`L22–37` for Core Problem) was caught.

### refactor (gates, 2026-10-01, run on the branch at 7761ff96)

- `npm test`: 177 suites, **2969 / 2969 passed**.
- `npm run test:coverage`: All files **98.82 stmts / 95.06 branches / 94.44 funcs / 99.52 lines**. In that run,
  one test failed under load: `query-latency.test.ts` REQ-PERF-02 `memory history` p95, 1148 ms against 1000 ms.
  Run alone (`npx jest test/core/query-latency.test.ts`) it passed 4/4, and it also passed in the plain `npm test`
  above. This is the wall-clock flake the brief describes, not a regression: the branch changes no `src/` or
  `test/` file, so coverage is identical to main by construction.
- `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` exit 0.
- BDD: no feature file covers the vision or SARD documents. REQ-STATE-10 has no scenario, and its
  Traceability says so.

### review (self, reviewer, 2026-10-01)

| AC | Status | Evidence |
|---|---|---|
| 1 — brief | met | diff of `5cb10729` on `01_product-brief.md`; `grep -n 'Determinism Index reported (I, P, O)' docs/01_vision/01_product-brief.md` |
| 2 — vision, canvas, is-isnot, features, sequencer, minor-v1.0 | met; `minor-v1.0` as a pending amendment (uncommitted) | `grep -rn 'Determinism Index validated\|Determinism validation' docs/01_vision docs/04_memory/planning` → nothing, with the uncommitted edit |
| 3 — REQ-STATE-10 | met, **ratified** 2026-10-01 | `grep -n 'REQ-STATE-10' docs/02_requirements/03_sard/*.md` |
| 4 — bug-160 | met | one-line script above → `mismatches: []` |

### Approver rulings (Roberto, 2026-10-01)

- **`minor-v1.0.md`:** the proposed wording is applied as an edit **left uncommitted** in the worktree (Scope
  line 16, Pillar Focus line 20, Success Criteria line 33). `release` is `amendable: false`, so the coordinator
  records it at the gate as a one-off hand commit (below).
- **REQ-STATE-10 ratified.** Its `Status:` line and the SARD index row no longer say "proposed" (`0e08ea41` commit
  below; `grep -rn proposed docs/02_requirements/03_sard | grep STATE-10` → nothing).
- **"Brute-force context" under *Replaces*** is confirmed. The three phrases left unchanged on purpose (problem
  description, v0.1 go-to-market, input-side value language) stay as they are.

### Pending amendments (approver)

- `minor-v1.0` (release, `amendable: false`, one-off hand commit `wf(release): amend minor-v1.0 [planning → planning]`).
  Proposed `--reason`: "dl-131 Q1 (b), ruling R1: the Determinism Index becomes a reported metric (Input,
  Process conformance, Outcome equivalence) instead of a v1.0 validation objective, so the Scope, Pillar
  Focus and Success Criteria lines stop promising equivalent outputs, as task-141 did for the vision
  documents."

### review follow-up — same-class drift (coordinator, 2026-10-01)

Fixed in `e7deb40b`, in files this task already touched (the fix-same-class rule):
- `08_mvp-canvas.md` *Competitive Advantage* (now L124–142) follows the brief's **Replaces / Works with**: it names
  categories, has no product rows and no "Deterministic + cheaper". No second bump, because v1.6 is not yet on main.
- `02_product-vision.md` *Key Decisions*: "Differentiator vs. CLAUDE.md / .cursorrules" becomes "vs. flat
  agent-rule files". No second bump (v1.2 is not on main).
- `05_journeys.md` 1.2 → **1.3**, 2026-10-01: the last edit was `0927f5df`, so this edit bumps it. Journey 1's
  success line says the agent receives the same context for the same inputs (the Index's *Input*), instead of
  saying "deterministic".
- `00_index.md`: document-map rows for both files and every range of `05_journeys` / `08_mvp-canvas`. The bug-160
  one-line script above re-run → `mismatches: []`.
- Check: `grep -rn -iE "cursorrules|Deterministic \+ cheaper|Why WingFoil Wins" docs/01_vision` → only
  `X_lean-inception-plan.md:28`, the workshop's session log (a historical record with no version header),
  left as it is.
- Left as they are, outside what the coordinator named: "Impact: Reduced determinism" (`01_product-brief.md:35`,
  `08_mvp-canvas.md:20`), "Focus: Determinism for memory + architecture" (`01_product-brief.md:201`, v0.1 GTM)
  and "Core value language: Deterministic" (`02_product-vision.md:26`, a workshop decision). The first two
  describe the problem, and the third is the input side; none of them promises equivalent code.

### review (independent, 2026-10-01): approve with fixes

Fixed, with no version re-bump (the coordinator's reading is one bump per branch; the approver will rule on
clarifying `doc-versioning`):
- `dfa2d13c`: REQ-STATE-10's `Status:` line is removed. It was the only requirement with one
  (`grep -c '^\* \*\*Status' docs/02_requirements/03_sard/*.md` → 0 in every file). The ratification is
  recorded in *Approver rulings* above and in `0e08ea41`. The SARD index note no longer says "ratified".
- `7e2ddf57`: the brief's **P** row now carries all of dl-131 Decision 3, adding "by distinct actors where the
  workflow requires it" and "between two runs, similar git trees". The References note now says the brief
  states no fact about **what a specific third-party tool does**. Products are named elsewhere in the brief, as
  personas' tools (Alex's profile) and GTM partners, but nothing is said about their behaviour.
- The bug-160 index script, re-run → `mismatches: []`. Both edits kept the brief's line count.

Follow-ups for the coordinator (not in this task's scope, not filed):
- The North Star wording in `README.md`, `docs/agents.md` and `CLAUDE.md` still says "produce substantially
  equivalent software" without the I/P/O qualification. Owner: `user-docs` (`align-user-docs`, dl-112 Action 4;
  `align-agent-docs`, dl-025).
- `task-222` (release-health catalogue v2) should add the P entries that REQ-STATE-10's fit criterion lists.
  REQ-STATE-10 still needs a user story and a BDD scenario (its Traceability says "no BDD scenario yet").

### Candidate findings (not filed)

- The canvas, product-vision and journeys findings first listed here are fixed (follow-up above).
- The vision index has no test. The one-line script above could become a `test/docs/` check, as bug-160's
  Notes suggest; until then every vision edit can re-open the drift.
