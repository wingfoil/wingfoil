---
id: "task-186-revisit-personas-morgan-primary-casey-through-read-only"
type: task
title: "Revisit the personas: Morgan primary, Casey through read-only views, a maintainer persona"
status: done
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "vision", "docs"]
ref: "dl-113"
bug: ["bug-212"]
depends_on: ["task-141-reposition-brief-governance-layer-make-determinism-index-composite"]
tmpl_version: 260703
---

## Description

The personas predate any use. Morgan becomes primary, Casey's goals become views over Memory and workflow state, and a Persona 7 (maintainer receiving AI-generated contributions) is added. No persona is renamed or removed.

## Acceptance Criteria

- (characterization) `04_personas.md`: "Primary persona" note, Morgan's agents-as-team line, Casey's goals as read-only views, Persona 7 as dl-113 Q3 (x) profiles it; version/date bumped.
- (characterization) `01_product-brief.md` Target Users lists Morgan first; the v0.4 GTM phase names Casey's views; `00_index.md` updated.

## Implementation Notes

- **Size:** S · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-113 (Q1 (A), Q2 (a), Q3 (x)).
- **Notes:** Proposal key: D28. Persona 7's journeys are not written here; they enter through task-212's vision-change process.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-06)

- **Inputs.** `depends_on: [task-141]`, `done` (`grep -m1 '^status' docs/04_memory/v0.3/task-141-*.md`). Its notes
  hand over two things: it re-indexed `docs/01_vision/00_index.md` with a one-line range check (re-used below), and
  it named this task as the next editor of `04_personas.md`, the brief and the index. `dl-113` is `ready`, ratified
  with Q1 (A), Q2 (a), Q3 (x) (`git log --follow --format=%B -- docs/04_memory/design/dls/dl-113-*.md | grep -A2
  'approve'`). `bug-212` was absorbed here with the ruling "the DNA-section wording of docs/01_vision is reconciled
  with spec-002 there" (`git show -s 84be9373`), so its six lines are in scope even outside the three files dl-113
  names. `spec-002` is `approved`; it defines `modules`, `stacks`, `team`, `paths` and no `conventions`
  (`grep -n 'not.* a top-level field' docs/04_memory/design/specs/spec-002-*.md` → line 55).
- **AC classification.** Both ACs are documentation: **characterization**. No `src/` or `test/` file changes
  (`git diff --stat 02fd6102..HEAD -- src test` prints nothing), so no red is fabricated.
- **Doc-versioning.** Each edited vision file was committed on main before this edit (`git log -1 --format=%h
  02fd6102 -- docs/01_vision/<f>.md`: brief 7e2ddf57, is-isnot 5cb10729, personas 0927f5df, journeys and canvas
  e7deb40b, features 370ee013), so each bumps once, dated 2026-10-06. `00_index.md` has no version; its
  *Last indexed* date moves.

### red / green (2026-10-06)

No red (characterization only). One commit, `b113065a` `docs(vision)`:
- `04_personas.md` 1.0 → **1.1**: *Primary persona — Morgan* note (L9–20) with the evidence of use
  (`.wingfoil/dna.yaml` `team`: one member, one agent with `executes_as: [developer, reviewer, qa, architect]`,
  `approval_authority: false`); Morgan's profile gains "it may consist mostly of AI agents directed by one person";
  Casey's goals restated as read-only views (decisions and reasons, pending approvals, release progress,
  methodology), with the UI deferred per `dl-008`; **Persona 7** (L129–149) with dl-113 Q3 (x)'s profile, pain,
  goals and AI usage level; the closing note names Morgan primary and says Persona 7's journeys enter through the
  vision-change process (`dl-132`), not here. No persona renamed or removed (`grep -c '^## Persona' 04_personas.md`
  → 7).
- `01_product-brief.md` 1.6 → **1.7**: Target Users opens with the primary-persona note and lists **Morgan first**
  (L111), then Alex, Sam, Jordan, Casey (goal = read-only views) and a summary of the maintainer; the v0.4 GTM
  phase names Casey's views (decisions and their reasons, pending approvals, release progress) through read
  commands, UI out of the MVP (`dl-008`).
- **bug-212**, the six lines of its Steps to Reproduce: brief L51, `05_journeys.md` L52 (1.3 → **1.4**),
  `06_features.md` L43 and L50 (1.8 → **1.9**, line count kept at 518 so no range moves), `08_mvp-canvas.md` L30
  and L70 (1.6 → **1.7**) now read modules, stacks, team, resource paths. Same class, fixed too:
  `03_is-isnot.md` L43 named the retired `tech-stack` key (1.3 → **1.4**, now "`stacks`
  (technologies/methodologies)").
- `00_index.md`: document-map rows and section ranges for every edited file; a new quick-lookup row for the primary
  persona. **Same-class drift fixed:** `X_cli-cmds.md`'s row (1.3/393 → 1.5/2026-10-05/399) and its last seven
  ranges were stale on main after task-179/task-188 (the check below reported 8 mismatches, all X_cli-cmds,
  before the fix).

### refactor (gates, 2026-10-06, branch at b113065a)

- `npm test`: 270 suites, **5010 / 5010 passed**.
- `npm run test:coverage`: All files **99.13 stmts / 96.39 branches / 96.53 funcs / 99.69 lines**; no `src/` or
  `test/` change, so identical to main by construction.
- `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` exit 0; `node scripts/check-governance.cjs --base 02fd6102` exit 0.
- BDD: no feature file covers the vision documents (`grep -rln 01_vision test/` → only a comment in
  `test/cli/journey-0a.integration.test.ts`).
- Vision index check (task-141's one-line script, run in `docs/01_vision/`) → `mismatches: []`.

### review (self, reviewer, 2026-10-06)

| AC | Status | Evidence |
|---|---|---|
| 1 — personas | met | `grep -n '^## Primary persona\|AI agents directed by one person\|read-only\|^## Persona 7\|^\*\*Version\|^\*\*Date' docs/01_vision/04_personas.md` |
| 2 — brief + index | met | `grep -n '^### ' docs/01_vision/01_product-brief.md \| sed -n 4,9p` → Morgan first; `grep -n 'read-only views' docs/01_vision/01_product-brief.md` (Casey, v0.4 GTM); index script → `mismatches: []` |
| bug-212 | met | its Steps-to-Reproduce grep, restricted to DNA lines (`grep -n -i "tech stack\|tech-stack\|conventions" docs/01_vision/{01_product-brief,06_features,08_mvp-canvas,03_is-isnot}.md \| grep -i dna`) → nothing |

Left as written, on purpose: "conventions" where it means a team's rules (bug-212's Notes), and the journeys' uses
of "tech stack" as a concept (`05_journeys.md` L15, L31, L50). `README.md`'s persona list follows through
`align-user-docs` (dl-113 Action 3).

### Candidate findings (not filed)

- `05_journeys.md` L223 (Journey 5, Casey): `wingfoil dna show` is said to tell Casey "team size, tech stack, current
  phase, risks"; DNA holds no phase and no risks (spec-002 top-level fields). Under dl-113 Q2 (a) that step should
  name a read-only view over workflow state instead.
- `08_mvp-canvas.md` *Target Users* table still lists Alex first and has no Persona 7 row; dl-113 names only the
  personas file, the brief and the index, so it was not changed here.
- The vision index still has no test: `X_cli-cmds.md` drifted on main within a day of task-141's re-index.

### review fixes (independent review: approve with fixes, 2026-10-06)

Applied in `2c874368`, with no re-bump of files already bumped on this branch: (1) claim-evidence — the
primary-persona note said Morgan's notification goal shipped in v0.2; X1 has no code (`grep -rli notif src` →
nothing), so it now says rule encoding shipped in v0.2 and notification (X1) arrives in v0.3. (2) Same class as
bug-212 — `02_product-vision.md` L54 put conventions inside DNA (1.2 → **1.3**, 2026-10-06); the sweep
`grep -n -i "conventions\|tech.stack" docs/01_vision/*.md | grep -i dna` also found `05_journeys.md` L62 (DNA
inference "may miss implicit conventions") and L223 (`dna show` → "tech stack"), both reworded; L15 is left, since it
already maps conventions to directives. L223's "current phase, risks" stays a candidate finding. (3) One of the two
consecutive `---` before Persona 7 removed, so Taylor is now L111–126 and Persona 7 L127–147 (147 lines). Index rows
and ranges updated; task-141's index check → `mismatches: []`; `node scripts/check-governance.cjs --base 02fd6102`
exit 0. Status stays `in-review`.
