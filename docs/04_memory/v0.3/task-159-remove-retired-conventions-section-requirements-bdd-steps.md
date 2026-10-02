---
id: "task-159-remove-retired-conventions-section-requirements-bdd-steps"
type: task
title: "Remove the retired `conventions` section from requirements, BDD steps and the v0.1 backlog JSON"
status: in-review
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "process", "docs", "requirements"]
ref: ""
bug: ["bug-105", "bug-106", "bug-107"]
depends_on: []
tmpl_version: 260703
---

## Description

`conventions` survives in US-0A narrative, three P2 features and two BDD steps that would fail once a BDD runner exists; the v0.1 backlog JSON quotes moved scenarios with no sign it is frozen.

## Acceptance Criteria

- (characterization) bug-105: `01_init-migrate.md:23,33,92,99`, `P2.1…:2`, `P2.3…:3`, `P2.4…:2` no longer name `conventions` as a DNA section (US first, then BDD, per the chain).
- (characterization) bug-106: `P2.4…:11` and `P2.2…:9` steps assert sections the schema has; the `tech_stack` alias at `P2.2:13-14` left alone.
- (characterization) bug-107: `backlog.json` (or its directory) carries a header stating it is a frozen v0.1 archive; its content is not rewritten.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** .
- **Features:** P2.1, P2.2, P2.3, P2.4.
- **Notes:** Proposal key: D31. coordinate with the DNA domain if it also edits P2 features.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-02)

- `depends_on: []` — no upstream Execution Notes to read (dl-015). Spec cited: `spec-002-dna-yaml-schema`,
  `status: approved` (`grep -n '^status' docs/04_memory/design/specs/spec-002-dna-yaml-schema.md`). Its
  top-level table declares `version, project?, modules, stacks, team, paths`, and states `conventions` is not
  a field (spec-002 "Top-level fields"); `src/dna/schema.ts` `DnaYaml` matches it.
- Measured on this branch's build in a throwaway `init --template Scrum` repo:
  `node dist/cli.js dna show --format json` → keys `version, project, modules, stacks, team, paths`;
  `node dist/cli.js dna show conventions` → `error: no DNA key named 'conventions'`, exit 1.
- No BDD runner exists: `grep -rn '02_bdd' test/` finds only doc-comments citing feature files, so the
  `.feature` edits are contract edits checked by reading, plus the guard test below.
- AC classification (confirmed): all three **characterization** — the tool behaviour already exists; the task
  corrects documents that misdescribe it. No red is fabricated.

| AC | Class | Pinned by |
|----|-------|-----------|
| bug-105 narrative | characterization | `test/docs/bdd-dna-sections.test.ts` (no `conventions` in p2-dna features or in US-0A-05/0A-08/0B-03/0B-E1) |
| bug-106 steps | characterization | same file: P2.4 and P2.2 section steps quote exactly `DnaYaml`'s required sections; behaviour by `test/core/dna-show.test.ts` AC(a) and `test/storage/templates.test.ts` (scaffold round-trips `DnaYaml`) |
| bug-107 header | characterization | evidence by command (header text; JSON untouched) — no test, a wording pin would add nothing |

- Order per the chain (bug-105 Notes): US first (`86001f5d`), then BDD (`fbf27978`).
- SARD / name-resolvability: `grep -n conventions -r docs/02_requirements/03_sard` → nothing, and
  `test/docs/name-resolvability.allowlist.ts` has no `conventions` entry (`grep -ci convention` → 0), so no
  allowlist entry goes stale; the SARD is not edited by this task.

### red / green

- No red phase: every AC is characterization. The guard test was nonetheless run once against the pre-fix
  features (after the US commit) to show it discriminates: `npx jest test/docs/bdd-dna-sections.test.ts` →
  3 failed, 5 passed of 8 (P2.4 step, P2.2 step, the four feature files naming `conventions`). After the BDD
  edit: 8 passed.
- Edits:
  - `01_init-migrate.md`: US-0A-05 "(modules, stacks, team, resource paths)"; US-0A-08 "modules, stacks, and
    team"; US-0B-03 "real modules and stacks"; US-0B-E1 "missed modules and stacks".
  - `P2.1`/`P2.3`/`P2.4` narrative lines transcribe the corrected stories (P2.4 also drops "tech stack").
  - `P2.4` scenario 1: `declares the sections "modules", "stacks", "team", "paths"`.
  - `P2.2` scenario 1: `the output includes the sections "modules", "stacks", "team", "paths"` — rewritten into
    the quoted form so it is machine-checkable like P2.4. `P2.2:13-14` (`tech_stack` alias) untouched
    (`sed -n 12,14p` unchanged); `P2.1`'s `tech_stack` refusal scenario untouched.
  - `docs/03_backlog/04_backlog/00_index.md`: "Status: frozen archive — not maintained" header. JSON cannot
    carry a comment and `schema.json` has `additionalProperties: false` over an array root, so the header lives
    on the directory's index (the AC's "or its directory"). `git diff --stat main..HEAD --
    docs/03_backlog/04_backlog/backlog.json docs/03_backlog/04_backlog/by-release
    docs/03_backlog/04_backlog/schema.json` → empty.

### refactor (gates, worktree at `739457ae`)

- `npm test` → 209 suites, 3531 tests passed.
- `npm run test:coverage` → All files 98.86 stmts / 95.45 branch / 95.29 funcs / 99.57 lines; no `src/` change,
  so coverage cannot regress vs main.
- `npm run lint` → exit 0. `npm run docs:api` → exit 0.
- `npx tsc --noEmit -p tsconfig.json` → first run failed (TS2322/TS2532 in the new test, indexed access);
  fixed in `739457ae`, re-run exit 0. `npx tsc -p tsconfig.build.json --noEmit` → exit 0.

### review (self, reviewer)

- `grep -rn -i conventions docs/02_requirements/02_bdd/features/p2-dna/` → nothing;
  `grep -n -i conventions docs/02_requirements/01_user_story_map/01_init-migrate.md` → nothing.
- Same class, outside this task's ACs and not edited (upstream vision, reported for the coordinator):
  `docs/01_vision/01_product-brief.md:51` lists DNA as "Modules, tech stack, conventions, resource paths";
  `docs/01_vision/05_journeys.md:52` "DNA reflects reality: actual modules, tech stack, conventions". US-0B-03
  now diverges from the journey line it downcasts.

### Pending amendments (approver)

- None.
