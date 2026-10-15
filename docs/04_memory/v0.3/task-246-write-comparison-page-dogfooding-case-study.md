---
id: "task-246-write-comparison-page-dogfooding-case-study"
type: task
title: "Write the comparison page and the dogfooding case study"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "presentation", "docs"]
ref: "dl-128"
bug: []
depends_on: ["task-141-reposition-brief-governance-layer-make-determinism-index-composite", "task-234-publish-documentation-site-api-reference-llms-txt-index", "task-241-compare-runs-write-proposals-backfill"]
tmpl_version: 260703
---

## Description

Places WingFoil beside the tools dl-112 names and shows how WingFoil develops itself.

## Acceptance Criteria

- (characterization) `docs/comparison.md` from dl-112's ratified position; every fact about another tool carries its source and date read; content integrated, not linked (D2).
- (characterization) `docs/case-study.md` with figures from the committed release-health reports (task-241), each with its definition and measurement point.
- (characterization) both in `user-docs.yaml` `produces:`; version bumped.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-128 items 3–4 (Q3 (a) order).
- **Notes:** Proposal key: D37.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (developer, 2026-10-15)

- **Start.** Branch `task/task-246-write-comparison-page-dogfooding-case-study` cut from `main` `2de79ef9`;
  `wf(task): start` `f39261ea` (`git log --oneline -1`). Started under batch B8, round 3 (`w3-b8-notes.md`).
- **depends_on read (dl-015)**, all `done` (`grep -m1 '^status' docs/04_memory/v0.3/task-{141,234,241}-*.md`):
  - `task-141`: the brief (now 1.10) carries dl-112 Q1 (B), Q2 (c) **Replaces / Works with**, Q3 (i); its References
    note says the brief "names categories of tools, not products" and states no third-party fact
    (`grep -n "Other tools" docs/01_vision/01_product-brief.md`). Its follow-up, not mine: README's *Value
    Proposition* and *Success Metric* still say the process is made "deterministic" (`grep -n deterministic README.md`)
    — owner `align-user-docs`; candidate finding below.
  - `task-234`: `docs/site.yaml` (`version: 1.0`) is the one declaration of `pages`, `files` and `llms`;
    `node scripts/build-site.cjs llms` regenerates `llms.txt`; `checkSiteManifest` refuses a page holding `{{` or `{%`
    (Liquid); a relative link to a file outside the site is rewritten to the repository blob, so the case study may link
    `docs/08_health/*.json`. `test/docs/llms-txt.test.ts` pins `llms.txt` = render, byte for byte, and the user-docs
    `1.6 dl-129` history line by "contains" (bug-314), so a 1.7 entry keeps it green.
  - `task-241`: the two committed baselines and their limits — v0.1 at `5b16ab61` (`released-transition`, window the
    whole history, 399 non-merge commits), v0.2 at `v0.2.1` = `9833e00a` (`published-tag`, previous = the v0.1
    report); both `--offline --any-node --max-workers 2`; v0.1's toolchain half not measurable (`npm ci` `EUSAGE`
    under npm 11.6.2); no root `.wingfoil/` at either point, so the static and Memory half and G05/G07/G12 are
    not measurable (ruling A); G14's 29 blocking findings are the secret scanner's own test fixtures. No v0.2.2 report
    exists (`ls docs/08_health/*.json` → v0.1, v0.2): the backfill measured those two only.
- **Decisions cited are ratified:** `grep -m1 '^status' docs/04_memory/design/dls/dl-{112,128,089,131,129,116}-*.md`
  → all `ready`. dl-112 approve `0f8e99ff` `Reason:` "Q1 (B), Q2 (c), Q3 (i), Q4 (x); any competitor fact is sourced
  and dated". No tech-spec governs the user docs; no spec edit is required.
- **Reading the ACs against the rules (dl-102 §4).** One gap, no contradiction: dl-112 ratified **categories**, not
  products (the brief's *Replaces* / *Works with* rows), while dl-128 item 3 asks for the tools "a reader is likely to
  know". Decision **D1** below. dl-112 Q3 (i) binds both pages: determinism is a goal the Determinism Index measures
  (I / P / O, dl-131), never a property achieved; D01 and P06 are not measurable at either point.
- **`produces:` shape.** Since task-175/task-199 an entry is a string **or** `{ type, path }` (`src/workflow/schema.ts`
  `Produces`, `producesPath`); `{ type, path }` is for a Memory element the phase adds (dl-104 D3, e.g.
  `release-planning.yaml` `record-adrs`). `align-user-docs` lists plain files as strings, so the two pages are strings.

#### Design — `docs/comparison.md`

No `**Version:**` line (the user docs carry none: `head -5 docs/user-guide.md docs/agents.md`); it names the WingFoil
version it describes and the date the sources were read. Sections, in this order (exact H2 headings, pinned):

1. `# How WingFoil compares` + intro: the governance layer (dl-112 Decision), complementary to the tools that produce
   specifications, plans and code; what it is not (`03_is-isnot.md`: not a code generator, not a spec validator).
   A *How to read this page* paragraph: a fact about another tool carries `[S<n>]`, resolved in *Sources* with its URL
   and the date read; a cell no source read settles says exactly `not stated in the sources read`; WingFoil's facts
   are about this repository's build and are checkable here.
2. `## What WingFoil replaces` — table `| Approach | How it works | What WingFoil does instead |`, rows: flat
   agent-rule files (named formats: `AGENTS.md`, Claude Code's `CLAUDE.md`, Cursor project rules, GitHub Copilot
   repository instructions), README + scattered docs, brute-force context, manual governance, implicit workflow state
   (the brief's five rows). "How it works" is the third-party column.
3. `## What WingFoil works with` — `### Spec-driven development tools`: axes as rows, tools as columns
   `| Axis | WingFoil | GitHub Spec Kit | Kiro | OpenSpec |`. Axes: what it produces · where its artefacts live ·
   phases and gates · record of who approved what, when and why · per-artefact state machine · rules bound to roles ·
   agent interface · agents supported · licence and distribution. `### Coding agents` (Claude Code, Codex CLI —
   the two built-in adapters, task-236/237) and `### IDEs` (reached through MCP and the CLI, no plugin), each a short
   table of the same shape. Then `### Using WingFoil beside a spec-driven tool`: WingFoil-only facts (a spec any tool
   writes can be registered as a `tech-spec` element and pass its approval gate; tasks, rules and audit trail around
   it), stated as what WingFoil does, with no claim of a built integration.
4. `## Ideas seen elsewhere, not adopted` — dl-112 Q4 (x): phase-gated specification steps, change-delta
   specifications, property-based tests derived from a specification; each attributed only where a source states it;
   any re-enters through its own decision-log.
5. `## Determinism, stated as a goal` — Q3 (i): the Index (I guaranteed by tests, P measured, O measured and never
   promised); the first figures are in the case study.
6. `## Sources` — one line per source: `- [S<n>] <title> — <https://…> — read YYYY-MM-DD.`, numbered from 1.

**Sources to read in session 3** (official pages only, read-only `WebFetch`; the list may shrink, never grow to
secondary sources): GitHub Spec Kit — `https://github.com/github/spec-kit` (README) and its `spec-driven.md`; Kiro —
`https://kiro.dev/docs/specs/` (and its steering page for rules); OpenSpec — `https://github.com/Fission-AI/OpenSpec`
(README); AGENTS.md — `https://agents.md/`; Claude Code memory — `https://docs.claude.com/en/docs/claude-code/memory`;
Cursor rules — `https://docs.cursor.com/context/rules`; Copilot repository instructions —
`https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot`;
Codex CLI — `https://github.com/openai/codex` (README); MCP — `https://modelcontextprotocol.io/specification`; VS Code
MCP servers — `https://code.visualstudio.com/docs/copilot/chat/mcp-servers`. A licence cell is read from the tool's
repository licence file or official terms, else `not stated in the sources read`. Nothing from any private repository;
no benchmark repository is named in either page.

#### Design — `docs/case-study.md`

Rule of the page: **every figure comes from `docs/08_health/release-health-v0.{1,2}.json`**; every other statement
is non-numeric and names the file or command that settles it (claim-evidence). Sections:

1. `# Case study: WingFoil develops WingFoil` + summary (no figure that is not in the tables).
2. `## How this repository is governed` — `.wingfoil/` config, Memory under `docs/04_memory/`, the pinned build
   (dl-095), one `wf()` commit per state change, the human `approver`, agents as developer / qa / reviewer, dev-loop's
   design → red (separate qa agent) → green → independent review (dl-134). Where the configuration lived before
   task-111 (`docs/self/`), because it explains the not-measurable block.
3. `## How it was measured` — release-health (dl-089), catalogue `docs/08_health/metrics.yaml` v2, the script and the
   exact commands of task-241's runs; a table of the two points from each report's `measurement_point` and `previous`
   (ref, commit, basis, previous, window), toolchain node / npm; the window and snapshot scopes defined as in
   `metrics.yaml`'s header. v0.1 is a **partial baseline**.
4. `## Figures` — columns exactly `| id | Metric | Definition | Scope | Kind | v0.1 at 5b16ab61 | v0.2 at v0.2.1 (9833e00a) |`;
   one row per catalogue metric **measured in at least one report**, in catalogue order (23 today: G01–G04, G06,
   G08–G11, G13–G16, Q02–Q04, Q11, P01–P05, P07); Metric / Definition / Scope from `metrics.yaml`; Kind = `kind`,
   plus `floor` for a floor; a value cell is `not measurable` (+ reason) or the value with its raw counts.
5. `## What the figures say` — prose over the table: floors held and breached (G01 at v0.1, G06, G10, G14 and why,
   Q04, P01, P02, P05), Q03, Q11, G13, P07; what is tracked, by element id, only where an element exists.
6. `## Not measurable yet` — columns `| id | Metric | v0.1 | v0.2 |`, one row per metric not measurable in **both**
   reports (26 today: G05, G07, G12, Q01, Q05–Q10, Q12–Q20, D01, P06, E01–E05 — the test computes the set from the
   JSON, not from this list), each cell the report's `reason`. Grouped causes in prose: no root configuration at either point; v0.1's
   `npm ci` refusal; offline runs; D01/P06 wait for the benchmark runs (the benchmark is the `service` element
   `svc-020`, named by id only); v0.2.2 has no report. Then what v0.3's run is expected to measure, marked as
   expected.
7. `## Reproduce` — the commands, fenced.

#### `docs/site.yaml`, `llms.txt`, `user-docs.yaml`, README (ruling D5 and AC 3)

- `docs/site.yaml` 1.0 → **1.1** (`version: 1.1   # 1.1 dl-128 items 3–4 (task-246): + docs/comparison.md,
  docs/case-study.md`): both under `pages` after `docs/agents.md`; two `llms` entries in **Optional**, after
  `API reference`, before `Changelog` (Docs stays dl-129 Decision 3's four documents). `llms.txt` regenerated with
  `node scripts/build-site.cjs llms`.
- `.wingfoil/workflows/custom/user-docs.yaml` 1.6 → **1.7**: `align-user-docs` `produces:` + `"docs/comparison.md"`,
  `"docs/case-study.md"` (strings) under a `# dl-128 items 3–4` comment; history `1.7 dl-128 items 3–4 (task-246):
  align-user-docs produces the comparison page and the case study, checked by presentation.current`; the
  `presentation.current` comment widened. `checks.post` keeps its three entries (D2).
- `.wingfoil/WORKFLOW.md`: the `AU` node gains one line `docs/comparison.md · docs/case-study.md (dl-128)`.
- `README.md` *Documentation* table: two rows (Comparison, Case study) — D3. `docs/user-guide.md`: unchanged.
- Neither page says Memory documents live under `.wingfoil/memory/` (task-245 widens
  `test/docs/memory-store-location-text.test.ts` to `docs/*.md`), and neither holds `{{` or `{%`.

#### AC classification (corrected, T1) and what the qa agent pins

The ACs say "characterization", but neither page exists (`ls docs/comparison.md docs/case-study.md` → No such file),
`produces:` names neither (`grep -c 'comparison\|case-study' .wingfoil/workflows/custom/user-docs.yaml` → 0, while
`grep -c 'site.yaml'` → 2 on the same file) and `docs/site.yaml` is 1.0: every pin below fails today → **red-first**
for all three ACs (as task-282 AC 2). The existing `llms.txt` parity (`llms-txt.test.ts`) is characterization: it
holds now and must hold after the regeneration. Suite: per D2 (a), new `describe` blocks titled `task-246 — AC n` in
`test/docs/presentation.test.ts` (dl-128's suite, bound as `presentation.current`); helpers: `read`, `js-yaml`
`load`, `producesPath` semantics (`typeof e === 'string' ? e : e.path`). No clock: the date bound is a constant.

- **AC 1 — `docs/comparison.md`.**
  C1 the file exists; H1 `# How WingFoil compares`; the six H2 above, in that order.
  C2 *Sources*: every non-blank line matches `^- \[S(\d+)\] .+ — <?(https://[^\s>]+)>? — read (\d{4}-\d{2}-\d{2})\.$`;
  ids `1..n` consecutive; URLs unique; each date a real calendar date ≥ `2026-10-15`; n ≥ 1.
  C3 every `[S<n>]` outside *Sources* resolves to an entry; every entry is cited at least once outside *Sources*.
  C4 integrated, not linked: no `http://` or `https://` outside *Sources*; no list item outside *Sources* consisting
  only of a link.
  C5 in every table under *What WingFoil replaces* and *What WingFoil works with*, every body cell of a column whose
  header neither contains `WingFoil` nor is the first column (`Approach`, `Axis`) contains `[S<n>]` or is exactly
  `not stated in the sources read`; the Spec-driven table has ≥ 3 third-party columns.
  C6 every relative link (`](x)` not starting with `http`/`#`) resolves inside the repository (`existsSync`, path
  normalized, never above the root); no Sources URL under `github.com/robypomper/`.
  C7 no `/\b(ensures|guarantees) determinism\b|\b(is|makes [^.]{0,40}) deterministic\b/i` in either page.
- **AC 2 — `docs/case-study.md`.**
  F1 file exists; H1 `# Case study: WingFoil develops WingFoil`; the six H2 above in order.
  F2 *Figures* header row exactly as above; each report's `measurement_point.ref` and commit's first 8 hex in it.
  F3 the ids of *Figures* ∪ *Not measurable yet* = every `metrics.yaml` id, each exactly once; *Figures* = ids
  `measured` in at least one report, *Not measurable yet* = the rest; both in catalogue order.
  F4 Metric = catalogue `name`; Definition = catalogue `definition` (whitespace collapsed); Scope = `scope`; Kind
  starts with `kind`.
  F5 value cell: report status `not-measurable` ⇒ starts `not measurable`; `measured` ⇒ does not, and every number
  (`-?\d+(?:\.\d+)?`) in it is a numeric leaf of that metric's `value` ∪ `raw` ∪ `items` in that report, with ≥ 1
  number unless `value` is a boolean or null-valued object (P07, G08).
  F6 *Not measurable yet* cells contain the report's `reason` (whitespace collapsed).
  F7 outside the tables and fenced code, every `\d+(?:\.\d+)?\s?%` and `\d+/\d+` uses numbers present in a *Figures*
  value cell or a catalogue `floor`.
  F8 C4's "no list item that is only a link" and C6 (relative links resolve) apply here too.
- **AC 3 — produces and versions; site and llms (ruling D5).**
  U1 `align-user-docs` `produces:` contains `docs/comparison.md` and `docs/case-study.md`; U2 `version` > 1.6 and the
  version line contains `1.7 dl-128` (bug-314: "≥" + history); U3 `checks.post` still contains `presentation.current`.
  S1 `docs/site.yaml` `pages` contain both; the `llms` section `Optional` has an entry with each `path`; `version` ≥ 1.1
  and its line contains `1.1 dl-128`. S2 `llms.txt` contains `…/docs/comparison.md` and `…/docs/case-study.md`
  (render parity stays `llms-txt.test.ts`'s). R1 (if D3 (a)) README's *Documentation* table links both.

#### Files (session 3)

`docs/comparison.md`, `docs/case-study.md` (new); `docs/site.yaml` 1.0 → 1.1; `llms.txt` (regenerated);
`.wingfoil/workflows/custom/user-docs.yaml` 1.6 → 1.7; `.wingfoil/WORKFLOW.md` (the `AU` node); `README.md`
(*Documentation* table, D3). Red: `test/docs/presentation.test.ts` (D2 (a)). No `src/`, no bindings, no spec, no
Memory amendment expected. Gates: targeted `npx jest test/docs --maxWorkers=2` under the slot, then the dev-loop
refactor set.

#### Decisions for the approver (recommendation first)

- **D1 — which tools the comparison names.** (a) the brief's categories, each with representative products named and
  every product fact sourced and dated: Spec Kit, Kiro, OpenSpec (spec-driven); the four rule-file formats; Claude
  Code and Codex CLI; IDEs through MCP; (b) categories only, no product (no third-party fact to source, but dl-128
  item 3's "tools a reader is likely to know" is not met). **Recommended (a)**; the brief stays category-level (its
  References note), the products appear only on this page.
- **D2 — where the checks live.** (a) the pins go in `test/docs/presentation.test.ts`, so the bound
  `presentation.current` covers the two pages with no `bindings.yaml` change (dl-128 Action 2: `checks.post` covers
  them); (b) a new `test/docs/comparison-case-study.test.ts` added to `presentation.current`'s run vector
  (`bindings.yaml` 2.1 → 2.2, re-bumped at the gate after task-282 — a writer the B8 notes do not list). **Recommended
  (a).**
- **D3 — README / user guide.** (a) two rows in README's *Documentation* table, user guide unchanged; (b) none.
  **Recommended (a)** (README is `align-user-docs`' own product; no B8 task writes it).
- **D4 — breaches shown as they are.** The case study shows the v0.2 floor breaches (G06, G10, G14, Q04, P01, P02,
  P05) and v0.1's (G01, P01) with their explanation, and nothing is filed from them here (task-241: "Nothing is filed
  from the backfill"). **Recommended: yes.**

#### Risks and candidate findings (not filed)

- Third-party pages change; a source unreadable in session 3 leaves its cells `not stated in the sources read` rather
  than filled from memory. Facts go stale per release: `align-user-docs` re-reads them (the page says so).
- Merge order: last in B8 (D1). task-245's widened store-location test applies to these pages once merged; task-242
  and task-282 write other `WORKFLOW.md` paragraphs (keep-both at the gate).
- Candidate finding: README still leads with determinism as achieved — `grep -n deterministic README.md` → lines 12,
  52, 219 (*Value Proposition*), 352 — and so does `docs/site.yaml`'s `summary` (hence `llms.txt`'s blockquote:
  "A structured harness for deterministic AI-assisted software development"), against dl-112 Q3 (i) / dl-131
  (task-141's follow-up). Owner `align-user-docs`; in scope here only if the approver rules it, since the comparison
  page states the opposite.

### red (qa, 2026-10-15)

- **Red commit `52c75032`** (T4 is measured from it). File: `test/docs/presentation.test.ts` only (D2 (a)), three new
  `describe` blocks `task-246 — AC 1/2/3`; the existing task-224 blocks are untouched. Pages are read with a
  `readIfExists` helper, so a missing page fails on an assertion, not on `ENOENT`. No clock: the read-date bound is
  the constant `READ_DATE_FLOOR = '2026-10-15'`. No value the reports hold is typed in the test: the Figures header,
  the measured / not-measurable split, names, definitions, scopes, kinds, reasons and allowed numbers are all read
  from `docs/08_health/release-health-v0.1.json`, `-v0.2.json` and `metrics.yaml`.
- **T1: red-first for all three ACs** (design's reclassification, approver ruling 2026-10-15). `llms-txt.test.ts`'s
  render parity stays characterization (passes now; must pass after the regeneration).
- **Per-AC mapping.** AC 1 → `C1`–`C6`, `C7` (×2, one per page). AC 2 → `F1`–`F8`. AC 3 → `U1` (×2), `U2`, `U3`,
  `S1` (×2 + version), `S2` (×2), `R1` (×2).
- **Run.** `npx jest test/docs/presentation.test.ts test/docs/llms-txt.test.ts --maxWorkers=2` → presentation
  26 failed / 23 passed; llms-txt 22 passed (0 failed). Totals 26 failed, 45 passed, 71. Failing: every C*, F*, U1,
  U2, S1, S2, R1 — each on its first assertion (`existsSync(...)` false; `figures` undefined; `produced` lacks
  the path; `version` 1.6 / 1 below the bound; README table links lack the two pages). `U3` passes today (by design:
  it guards that `presentation.current` stays).
- **Positive check (not committed).** Two throw-away pages generated from the JSON and the catalogue in the
  worktree, then deleted: every C* and F* passed except F7, which correctly flagged a `210/211` in prose that the
  fixture's value cells did not carry — so the pins are satisfiable as written.
- **Readings the design left open (for the developer and reviewer):**
  - F2: the column for a point whose `ref` equals its commit is `v<version> at <commit 8>`, otherwise
    `v<version> at <ref> (<commit 8>)` — reproducing the design's literal header.
  - F3/F6: id cells are compared with backticks stripped; the *Not measurable yet* header is `id | Metric | v0.1 |
    v0.2` (from `release.version`) and its Metric cell must equal the catalogue `name` (F6).
  - F5: a number glued to a word (`p90`, `over_500`, `G01`) is not a stated figure, and numbers inside the JSON's
    own keys count as the report's (`share_over_72`); a value written with a thousands separator (`1,453`) fails.
    Exempt from "≥ 1 number": a boolean `value` or an object `value` with a `null` member (P07, G08).
  - F7: shares (`n %`) and ratios (`a/b`) preceded by a word character, `.`, `/` or `-` are not checked (so
    `dl-089/099` is prose, not a ratio); inline code is still prose.
  - C1/F1: the H2 list is exact (5 in the comparison, 6 in the case study); C4 applies outside *Sources*, F8 to the
    whole case study; C5 also requires at least one table under *What WingFoil replaces* and the
    `### Spec-driven development tools` subsection's first table.

### green (developer, 2026-10-15)

- **Rulings applied** (approver, 2026-10-15, `w3-b8-notes.md`): D1 (a) categories with named products, every product
  fact sourced and dated; D2 (a) the checks in `test/docs/presentation.test.ts`; D3 (a) two README rows; D4 breaches
  shown as measured, nothing filed. The README / `docs/site.yaml` `summary` determinism wording is not touched (a
  user-docs handover): `git diff 2de79ef9 -- README.md` adds only the two table rows; `git diff 2de79ef9 --
  docs/site.yaml | grep summary` → nothing.
- **Red's six readings** (`### red (qa)`) are all met as written; none needed a send-back. F2's header is the one the
  test derives from each report's `measurement_point`; F5's value cells carry only numbers of the metric's
  `value`/`raw`/`items`, with no thousands separator; F7's prose shares and ratios are cells' figures or catalogue
  floors; the H2 lists are exact; C5 has a table under *What WingFoil replaces* and under `### Spec-driven
  development tools`.
- **Sources** — read 2026-10-15 with read-only `WebFetch`, official pages only, 16 in all (the *Sources* list of
  `docs/comparison.md`). Three of the planned URLs redirected and the page cites where they now live:
  `docs.claude.com/en/docs/claude-code/memory` → `code.claude.com/docs/en/memory`, `docs.cursor.com/context/rules` →
  `cursor.com/docs/context/rules`, the Codex `developers.openai.com` pages → `learn.chatgpt.com`. Added beyond the
  design's list, each a page of a tool already named: Kiro's feature-specs and steering pages, Claude Code's MCP
  page, Codex's MCP and AGENTS.md pages. Cells no source settled say `not
  stated in the sources read` (Kiro: artefact location, licence; Spec Kit and OpenSpec: approval record; Claude
  Code: licence; and others, see the tables). The quoted phrases were checked against the fetched text where it was
  returned verbatim (Kiro's Quick Spec sentence was asked for verbatim); WebFetch returns a summary of each page, so a
  reviewer re-reading a source is the stronger check.
- **Case study tables** are generated from the JSON and the catalogue by a scratch script (not committed), then pasted:
  23 rows in *Figures*, 26 in *Not measurable yet* (the split the test computes). The prose cites findings without new
  numbers beyond the cells, and explains each breach from the report's own `failing` lists (read with a one-off
  `python3` over `docs/08_health/release-health-v0.2.json`: P01's reasons are mostly non-canonical brackets, missing
  brackets and AI trailers on approval commits; G14's findings sit mostly in `test/validation/secret-scan.test.ts`).
- **Config:** `docs/site.yaml` 1.0 → 1.1 (both pages, Optional llms entries), `llms.txt` regenerated (`node
  scripts/build-site.cjs llms` → `build-site: wrote llms.txt`), `user-docs.yaml` 1.6 → 1.7 (two string `produces:`
  entries, history `1.7 dl-128 items 3–4 (task-246)`), `WORKFLOW.md` `AU` node one line, README two rows.
- **red → green:** `npx jest test/docs/presentation.test.ts test/docs/llms-txt.test.ts test/docs/workflow-md.test.ts
  test/docs/community-health.test.ts test/docs/memory-store-location-text.test.ts test/docs/build-site-extras.test.ts
  test/docs/build-site-confinement.test.ts --maxWorkers=2` → 7 suites, `Tests: 125 passed, 125 total` (red: 26 failed
  in presentation). Commit `8af5af64`.

### refactor (developer, 2026-10-15) — gates pending

- The full coverage run, lint, docs:api, typecheck, lint-claims and check-governance wait for the dl-170 slot
  (`waitslot.sh`, ticket queued 18:25). Not run yet: at 20:27 the slot was still held by task-242's
  `jest --coverage` (started 18:25), which hangs in `docs/examples/06-workflow-approval/run.sh`: its shim
  `/tmp/wingfoil-smoke-journey-*/wingfoil` is `exec 'wingfoil' "$@"`, which resolves to itself on `PATH` and spins
  (`ps -o pid,ppid,etime,args` → 1:59 h, parent `run.sh`, grandparent task-242's jest worker). Load average ~157.
