---
id: "task-245-correct-x-cli-cmds-md-stale-claims-unify"
type: task
title: "Correct `X_cli-cmds.md`'s stale claims, unify positional notation and add every v0.3 command row"
status: in-progress
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "process", "docs", "vision"]
ref: ""
bug: ["bug-099", "bug-100", "bug-274", "bug-275"]
depends_on: ["task-127-add-memory-amend-id-reason-approver-gated-verb", "task-138-dna-yaml-declares-team-agents-adapter-runs-paths", "task-169-make-directive-assign-refuse-whole-file-rewrite-unless", "task-180-add-memory-park-declared-returns-edge-optional-per", "task-204-reshape-workflow-list-add-workflow-show-both-answering", "task-210-add-dry-run-mutating-verb-through-commit-primitive", "task-211-add-workflow-create-workflow-remove-req-sec", "task-216-add-workflow-next-naming-next-step-verb-role", "task-217-add-workflow-start-workflow-end-recording-instance-plan", "task-220-wingfoil-agent-show-run-id-prints-recorded-run", "task-225-add-workflow-status-pending-approvals-role-routing-fallback", "task-226-add-workflow-finalize-which-records-checkpoint-or-uncarried", "task-227-link-added-element-workflow-step-memory-add-workflow", "task-228-agent-execute-launches-agent-forwards-right-signals-records", "task-235-agent-execute-next-workflow-ref-step-key-take", "task-240-wingfoil-agent-list-past-waiting-lists-recorded-runs"]
tmpl_version: 260703
---

## Description

The CLI vision reference declares sync against the retired `tech-stack` key, repeats false "interactive" claims, and mixes `<ANGLE>` and `[BRACKET]` positionals. It is edited once, after the v0.3 commands exist, so the workflow, agent and Memory rows are written in one notation matching the shipped grammar.

## Acceptance Criteria

- (characterization) `bug-099`: `grep -n "tech-stack\|interactive or flag-based" docs/01_vision/X_cli-cmds.md` → no hit (positive control at the base commit recorded); the `--dry-run` row is kept and now matches task-210's shipped global flag (`dl-106` W2, `spec-008` §2) instead of being deleted.
- (characterization) bug-100: every required positional is `<ANGLE>`; the pillar note at line ~251 removed; `grep -c "\[[a-z-]*-id\]"` → 0.
- (characterization) the nine `workflow` commands (spec-017) and `agent execute|list|show` (spec-016) rows match the approved specs' spelling; version bumped with a dated entry.
- (characterization) the P2.5 `paths` category list and the `--entry-<field>` list gain `runs` / `--entry-adapter` (task-138); `directive assign --force` (task-169) and `memory amend`/`memory park` (task-127, task-180) rows are present in the same notation.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** plan Appendix C (`X_cli-cmds.md` amendment from spec-016 and spec-017); single owner of `X_cli-cmds.md` for v0.3.
- **Features:** P2.5, P4.2, P4.3, P4.4, P4.5, P4.6, P4.7, P4.8, P4.9, P5.3.1.
- **Notes:** Proposal key: D29. Single owner of `X_cli-cmds.md` in v0.3 (task-138, task-228 and the workflow tasks hand their rows here); runs late on purpose.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from the W2 B4b triage (2026-10-06).** `bug-274` and `bug-275` are absorbed here. `bug-275`: nine
  vision lines still give the default state machine a `rejected` state (`X_cli-cmds.md`, `06_features.md`,
  `07_sequencer.md`, `08_mvp-canvas.md`), and `X_cli-cmds.md`'s 1.5 bump (`833ec080`, `task-179`) wrote no revision
  entry. `bug-274`: `docs/design.md:138` places tasks under `.wingfoil/memory/task/`; widen `task-259`'s
  `test/docs/memory-store-location-text.test.ts` guard to `docs/*.md` with the fix.
- **Handover from wave 3 B1 (2026-10-07, `task-210`, `task-209`).** `--dry-run` is not a root or global flag: it is registered on each of the 14 mutating commands, after the verb, and read commands, `init` and `mcp` refuse it (exit `2`). The `X_cli-cmds.md` row must say so (`spec-008` §2). A refused commit now fails with `E_COMMIT_FAILED` (`spec-008` §6), and `memory submit`'s commit body may carry one `Carries content:` line (`spec-008` §2).
- **Handover from wave 3 B3 (2026-10-09, `task-204`; W3 B3 follow-ups).** `docs/01_vision/X_cli-cmds.md`'s
  `workflow show [--name NAME] [--format json/yaml]` row should read `workflow show <ref>`: since `task-204` the
  workflow (or an open instance id) is a positional and there is no `--name` (`node dist/cli.js workflow --help` →
  `show <ref>`).

- **Handover from wave 3 B6 (2026-10-12, W3 B6 follow-ups, `bug-ingest-rel-v0.3-w3b6-review-findings-plan` item B4;
  `task-211`'s developer notes and independent review).** Since `task-211`, `workflow create <name>` and `workflow
  remove <ref>` take positionals and `remove` always checks the includes (`node dist/cli.js workflow create --help`,
  `node dist/cli.js workflow remove --help`; `workflow start <name>` and `workflow end [ref]` likewise). `docs/01_vision/X_cli-cmds.md` still
  shows `[--name NAME]` on `workflow start`, `end`, `create` and `remove` and the `--verify-includes` flag (lines 165,
  166, 169, 170 and 180 on `main` `0da232cb`), and US-6-02 (`docs/02_requirements/01_user_story_map/07_workflow-config.md`
  lines 21–22) still promises an "interactive or flag-based" `workflow create`, while the interactive form is
  post-v0.3 (`06_features.md` P4.8, `task-211`). Both are in this task's ground; US-6-02's wording takes a
  `doc-versioning` bump of its file.

## Execution Notes

### design (developer, 2026-10-15)

- **Start.** Branch cut from `main` `2de79ef9`: `wf(task): start` (`d9c8b95d`) and the four bug syncs
  `planned → in-progress` (`5b4e445f` bug-099, `9d039635` bug-100, `1851cb71` bug-274, `30578f21` bug-275).
  `git diff --stat 2de79ef9 -- src` → empty, so the build of this head is `main`'s code:
  `npm ci`, then `npm run build` under the dl-170 slot (granted 15:03, load 8.56) →
  `dist/build-info.json` commit `30578f21`.
- **Specs and DLs cited are ratified:** `grep -m1 '^status' docs/04_memory/design/specs/spec-00{8,1}-*.md
  docs/04_memory/design/specs/spec-01{6,7}-*.md` → all `approved`. Every row below is what spec-008 §1–§2 and
  §12, spec-016 §3.1/§5/§6 and spec-017 §7 already state; no AC contradicts them, and **no spec edit is
  required**. spec-017 Consequences (`docs/01_vision/X_cli-cmds.md` bullet) and spec-016 Consequences
  (Agent Execution section, P2.5's `runs`) are the two places that name this file's changes; both are met by
  the row list.
- **depends_on read (dl-015).** The handovers that bear on the rows, each checked against the shipped
  `--help`: task-210 (`--dry-run` is registered on each mutating command after the verb, not on the root;
  read commands, `init`, `mcp` refuse it — `node dist/cli.js dna show --dry-run` → `error: unknown option
  '--dry-run'`, exit 2); task-204 (`workflow show <ref>`, no `--name`); task-211 (`workflow create <name>`,
  `workflow remove <ref>`, the include check always runs, no `--verify-includes`; interactive creation is
  post-v0.3); task-217 (`workflow start <name>`, `workflow end [<ref>]`); task-216/225/226 (`next`, `status`,
  `finalize`); task-227 (`memory add --workflow <ref> [--step <key>]`); task-228/235/240/220 (`agent execute`
  step forms, `--role`, `--agent`; `agent list`; `agent show <run-id>`); task-138 (`runs` category,
  `--entry-adapter`; its notes leave `X_cli-cmds.md` lines 74/91 to this task); task-169 (`directive assign
  --force`); task-127/180 (`memory amend`, `memory park`). The shipped categories are seven, not six:
  `node dist/cli.js paths --help` → `sources, tests, docs, config, governance, runs or health`.
- **Shipped surface (the source of every row).** `node dist/cli.js <noun> --help` → 33 leaf commands
  (`init`, `mcp`, `paths`; `dna` 5; `memory` 9; `directives list`; `directive` 3; `workflow` 9; `agent` 3).
  `--dry-run` appears in the `--help` of exactly 20 (`memory add/submit/approve/reject/deprecate/park/amend`,
  `dna set/add/update/remove`, `directive create/assign/remove`, `workflow start/end/finalize/create/remove`,
  `agent execute`) — spec-008 §2's list. Root options (`node dist/cli.js --help`): `--format`, `--verbose`,
  `--no-color`, `--no-interactive`, `-V/--version`, `-h/--help`. A subcommand's `--help` still lists no
  `--format` (`node dist/cli.js memory search --help`), bug-099 item 4's code half.
- **Base measurements** (head `30578f21`, `X_cli-cmds.md` byte-identical to `2de79ef9`):
  `grep -n "tech-stack\|interactive or flag-based" docs/01_vision/X_cli-cmds.md` → 11 lines (57, 101, 106,
  114, 169, 190, 196, 206 above `## Revision history`; 391, 394, 402 inside 1.3's entry);
  `grep -c "\[[a-z-]*-id\]" docs/01_vision/X_cli-cmds.md` → 6 (lines 28–32, 252); command rows
  (`grep -c '^| \`wingfoil' …`) → 31, of which 10 carry `[--format json/yaml]`; rows missing for 5 shipped
  commands (`memory park`, `memory amend`, `workflow finalize`, `agent list`, `agent show`);
  `grep -nE "approved/rejected|approved, rejected" docs/01_vision/*.md` → 9 (X 18, 26, 48; 06 90, 379;
  07 248, 401, 450; 08 88 — bug-275's nine, two of them drifted from its L375/L81);
  `grep -n '\.wingfoil/memory' docs/*.md | grep -v 'memory\.yaml\|memory/templates'` → 1
  (`docs/design.md:138`).

#### Row list (`docs/01_vision/X_cli-cmds.md`, 1.6 → 1.7)

Rule for every row (decision D2/D4 below): the synopsis cell is the **shipped** grammar, spelled as the
approved spec and `docs/cli-reference.md` spell it (help's positional names, `<x>` required, `[<x>]`
optional, `\|` inside table cells); a planned flag or command a feature/BDD/spec declares stays, in the Notes
cell (flag) or as its own row (command), marked `*Not built*` with its feature and release; a flag no feature,
story, scenario or spec declares, and no build registers, is dropped and named in the 1.7 entry. No per-row
`[--format json/yaml]`: `--format` is stated once, in Global Options.

- **Pillar 1.** Philosophy L18: default machine `draft → pending → approved`, `reject` back to `draft`,
  `deprecated` from any state (bug-275). Rows: `memory add --type <type> --title <title> [--tags <t1,t2>]
  [--set <name>=<value> ...] [--workflow <ref> [--step <key>]]` (notes: id from the type's `id_pattern`, not
  "UUID or slug"); `memory search [<keyword>] [--type <type>] [--status <status>] [--tag <tag>]` (L26 state
  list without `rejected`); `memory import` row kept, `*Not built*` (v0.4); `memory submit <id>` (`--notes`
  dropped: not registered, `node dist/cli.js memory submit --help`); `memory approve <id> --reason <text>`; `memory reject <id>
  --reason <text>`; `memory deprecate <id> [--reason <text>]`; **new** `memory park <id> --reason <text>`
  (task-180, returns edge); **new** `memory amend <id> --reason <text>` (task-127, approver-gated);
  `memory history <id>`. Parameters: `document-id` → `id` (L38, L40), `--notes` row removed, `--workflow` /
  `--step` / `--set` rows added, `status` row L48 without `rejected` (bug-275).
- **Pillar 2.** Philosophy L54–58: the sync sentence marked `*Not built*` (D5); L57 reworded without the
  string `tech-stack` ("the fixed-key stack field `spec-002` retired"). Rows respelled lowercase:
  `dna set <path> --value <value> [--force]`, `dna add <path> --value <value> [--entry-<field> <value> ...]
  [--force]`, `dna update <path> [--value <value>] [--entry-<field> <value> ...] [--force]`, `dna remove
  <path> [--value <value>] [--force]`, `dna show [<section>]` (sections: `project, modules, stacks, team,
  paths` — `version` is not one, `node dist/cli.js dna show --help`), `dna infer` kept `*Not built*`,
  `paths [<category>] [--list]` (seven categories, `runs` and `health` added; task-138, spec-016 §4.1).
  Parameters: `PATH`/`SECTION` → `<path>`/`<section>`; the `--entry-<field>` row gains `--entry-adapter`
  (eleven fields, as `node dist/cli.js dna add --help` lists them); the `category` row lists the seven;
  a `--force` row added (dl-062, task-193).
- **Pillar 3.** Philosophy L101 and *Sync Process* L106–110: without `tech-stack`, marked `*Not built*`
  (D5). Rows: `directive create --name <name>` ("from a scaffold"; `(interactive or flag-based)` replaced by
  a pointer to *On interactivity*; `--file-format`, `--template` dropped, D4); `directive assign --directive
  <name[,name...]> --role <role> [--force]` (`--scope` dropped; global binding is `roles.yaml` `global:`);
  `directive remove <name>` (the referrer check always runs; `--verify-usage` dropped); `directives list
  [--role <role>]` (`--built-in/--custom/--all` dropped). Parameters follow (`NAME`, `DIRECTIVE_ID` →
  `<name>`; `SCOPE`, `TEMPLATE`, `--file-format`, `--verify-usage`, `--built-in…` rows removed; `--force` row).
- **Pillar 4.** *Kinds* paragraph: `startable` / `includable` (dl-109 K1 (a); `--kind main|sub` the alias).
  *Active workflow context* L150–153: commands take the active instance unless a `<ref>` (or `agent
  execute --workflow <ref>`) selects another; the Memory verbs take an `<id>`, they do not "target" the
  workflow; no `--name`. *Sync Process* L155–159 marked `*Not built*` (D5). The nine rows, spec-017 §7's
  grammar: `workflow start <name> [--element <type>:<id>] [--title <title>] [--set phase=<v>] [--set
  scope=<v>]`, `workflow end [<ref>]`, `workflow next [<ref>] [--assigned-to <who>]`, `workflow status
  [<ref>]` (`--filter` dropped, spec-017 Consequences), **new** `workflow finalize [<ref>] [--step <key>]
  [--reason <text>]`, `workflow list [--all]` (startable/includable, not `kind`), `workflow show <ref>`,
  `workflow create <name> (--kind main\|sub \| [--startable] [--includable]) [--element <type>]
  [--description <text>]` (flag-based; interactive post-v0.3, as P4.8), `workflow remove <ref>` (the include
  and open-instance checks always run). Parameters: `NAME` → `<name>`/`<ref>`; `STATUS`, `--verify-includes`
  rows removed; `--element`, `--title`, `--set`, `--step`, `--reason`, `--kind`/`--startable`/`--includable`,
  `--description` rows added.
- **Pillar 5.** Philosophy L186–192: `init` prompts in a terminal and takes `--template` (shipped); the
  inferred mode `*Not built*` (P5.1.2, v0.4); "tech-stack + methodology" → the DNA's `stacks`. Rows:
  `init [--template <Scrum\|Kanban>]` (notes: `--mode infer` `*Not built*`, P5.1.2 v0.4; `--tech-stack`,
  `--team-size`, `--confirm` dropped, D4); `audit` kept `*Not built*` (P5.1.3, v0.4); the `mcp` row is kept as written.
  Parameters: `--mode` row marked `*Not built*`; `STACK` (L206, `tech-stack:`), `--team-size`, init's
  `--confirm` rows removed.
- **Agent Execution.** `agent execute [--next] [--workflow <ref>] [--step <key>] [--element <type>:<id>]
  [--role <role>] [--agent <name>]` (spec-016 §3.1; at least one of `--next`/`--workflow`/`--step`/`--element`;
  `--resume`/`--ref` v0.4); **new** `agent list [--past] [--waiting] [--element <type>:<id>] [--phase <name>]`
  (spec-016 §5); **new** `agent show <run-id>` (§6). Parameters: `--workflow`, `--step`, `--agent`,
  `--past`, `--waiting`, `--phase`, `<run-id>` rows added.
- **Global Options.** "All commands support" → every command, except `--dry-run`. Rows: `--format`,
  `--verbose`, `--no-color`, `--no-interactive`, `-h/--help`, `-V/--version` (top level), and `--dry-run`
  rewritten as spec-008 §2 states it (task-210 handover): taken by the 20 commands named, after the verb;
  any other command refuses it as an unknown option, exit `2`; prints the plan, writes nothing.
- **Command-Line Syntax Conventions.** The pillar note L250–252 removed (bug-100); the missing-argument
  bullet L253–257 corrected to task-179's shape (`missing required argument: <id>`, then `hint: usage: …` —
  `node dist/cli.js memory approve` in a scratch repository, exit 2); *State and commits* L270–274 lists the
  20 mutating commands.
- **Release Timeline v0.3** gains `workflow finalize`, `agent list`, `agent show`, `memory park`,
  `memory amend`, `--dry-run`. **Personas** L355: `workflow status --filter pending` → `workflow status`.
- **Revision history:** a **1.7** entry (date of the edit; task-245, bug-099/100/274/275 and the handovers;
  every dropped flag named with its reason; written without the strings the AC 1/2 pins refuse) and the
  missing **1.5** entry between 1.6 and 1.4: `task-179` (`833ec080`, 2026-10-05) — the *On interactivity*
  example respelled to the missing-operand shape (`error: missing required argument: <path>`, then the usage
  hint); no row changed. 1.3's entry is left as written (D1).

#### The other files

- `docs/01_vision/06_features.md` 1.14 → 1.15 (L90 P4.11, L379 `defaults` block); `07_sequencer.md`
  1.9 → 1.10 (L248, L401, L450); `08_mvp-canvas.md` 1.11 → 1.12 (L88): each line rewritten in place, keeping
  the line count where the wrap allows, `**Date:**` updated.
- `docs/01_vision/00_index.md`: the four document-map rows (version, date, lines), every `X_cli-cmds`
  section range (and any range of the other three that moves), *Last indexed* — in the same commit as the
  vision edits (dl-132 element 5). `test/docs/vision-index.test.ts` is the check (`vision-index.current`
  in `bindings.yaml`); it runs in `npm test`, so dev-loop's gates enforce it with no vision-change instance.
- `docs/design.md:138`: tasks tracked at the path `memory.yaml` declares for `task`
  (`docs/04_memory/{release}/{id}.md`). No version header → no bump (doc-versioning, dl-047 option 1).
- `docs/02_requirements/01_user_story_map/07_workflow-config.md`: US-6-02 L21–22 → `wingfoil workflow
  create <name>` (flag-based; interactive post-v0.3, as P4.8 L87); same class, US-6-01 L15–16
  `workflow show [workflow]` → `workflow show <ref>`. The file declares no version
  (`grep -c Version …` → 0) → **no bump**, contrary to the batch notes' "(bump)" (D8).
- Pending amendments (session 3, uncommitted): `### Retrospective` in bug-099, bug-100, bug-274, bug-275
  (`grep -c Retrospective` → 0 in each), dl-115 Q2 (a).

#### AC classification (testing directive, T1) and what the qa agent pins

Every assertion below fails at `2de79ef9` because the text it asserts is absent there (the base measurements above), so the
documentation ACs are **red-first** (precedent: task-219, task-243, task-282 reclassified doc pins whose
asserted text is new). Nothing is characterization except the existing suites that must stay green
(`test/docs/vision-index.test.ts`, `test/docs/cli-reference.test.ts`, `test/docs/memory-store-location-text.test.ts`'s
other cases). New file `test/docs/x-cli-cmds.test.ts` (AC 1–4, H3); new file
`test/docs/vision-default-machine-text.test.ts` (H1); widened `test/docs/memory-store-location-text.test.ts` (H2).
Inputs: `docs/01_vision/X_cli-cmds.md` split at `## Revision history` (*body* = before, *history* = from it);
a *command row* is a body line starting ``| `wingfoil ``; its *synopsis* is the first code span, with `\|`
read as `|`. The shipped surface is `buildProgram(CORE_MODULES, { resolveRoot: () => repoRoot,
buildParams: () => ({}) })`, exactly as `test/docs/cli-reference.test.ts` builds it: leaf commands, their
`registeredArguments` (name, `required`) and `options` (long flags).

| AC | Class | What qa pins (base `2de79ef9` → expected) |
|---|---|---|
| 1 (bug-099) | red-first | (a) body lines matching `/tech-stack\|interactive or flag-based/` → `[]` (base 8: L57, 101, 106, 114, 169, 190, 196, 206; history's 3 not asserted, D1). (b) every body paragraph that starts `**Sync Process:**` contains `*Not built*` (base 2 paragraphs, 0 marked). (c) the Global Options row starting ``| `--dry-run` `` names, as code spans, exactly the commands whose `options` include `--dry-run` in the shipped program (20) — no more, no fewer — and contains `after the verb` and `` exit `2` `` (base: names none). (d) every root-program long option (`--format`, `--verbose`, `--no-color`, `--no-interactive`, `--version`, `--help`) has a Global Options row (base: `--no-color`, `--no-interactive`, `--version` missing). (e) no command row contains `--format` (base 10). |
| 2 (bug-100) | red-first | (a) whole-file count of `/\[[a-z-]*-id\]/` → 0 (base 6; the 1.7 entry must not quote the old spelling). (b) the body has no line containing `predate the convention` (base 1, L251). (c) for every command row of a shipped command: each `required` registered argument `a` appears as `<a>`, each optional one as `[<a>]`; each registered long option except `--dry-run` and `--help` appears; every `--x` token in the synopsis is registered on that command (base: fails on every Pillar 1/3/4 row and on `dna show`/`paths`). |
| 3 | red-first | (a) every shipped leaf command has exactly one command row whose synopsis begins `wingfoil <path>` followed by a space or the end (base: 5 missing — `memory park`, `memory amend`, `workflow finalize`, `agent list`, `agent show`); the nine `workflow` and three `agent` rows pass AC 2 (c) — that is the "spelling of the approved specs" pin, since spec-017 §7 / spec-016 §3.1, §5, §6 and the help agree. (b) every command row whose command does not ship (`memory import`, `dna infer`, `audit`) contains `*Not built*` (base: only `dna infer`). (c) header `**Version:**` ≥ 1.7 numerically (bug-314: "≥", never `toBe`), and history has, in descending order, entries starting `**Version 1.7 (` and `**Version 1.5 (`; the 1.7 entry names `task-245`, the 1.5 entry names `task-179` (base: 1.6, no 1.5 or 1.7 entry). |
| 4 | red-first | (a) the Pillar 2 parameter row starting ``| `--entry-<field>` `` names every `--entry-*` option `dna add` registers (eleven, `--entry-adapter` included; base: ten). (b) the `paths` row and the `category` parameter row each name every category in `paths`' argument description — parse the help text `sources, tests, docs, config, governance, runs or health`, or assert the literal seven (base: five). (c) rows exist for `directive assign` with `--force`, and for `memory amend` and `memory park` — covered by AC 3 (a) and AC 2 (c); qa may assert them by name for readability. |
| H1 (bug-275) | red-first | `docs/01_vision/*.md` lines matching `/approved\/rejected\|approved, rejected/`, X_cli-cmds' history excluded → `[]` (base 9, listed above). Each of the four files' `**Version:**` is ≥ its bumped value (X 1.7, 06 1.15, 07 1.10, 08 1.12) — "≥", bug-314. |
| H2 (bug-274) | red-first | `SCANNED` gains the regular `.md` files directly under `docs/` (non-recursive: `docs/*.md`), same filter; base → 1 hit (`docs/design.md:138`), expected `[]`. The describe title may say "vision, requirements or top-level docs". |
| H3 (B6 handover) | red-first | in `07_workflow-config.md`, the US-6-02 bullet (its lines joined, up to the next `* **[`) contains `wingfoil workflow create <name>` and not `interactive or flag-based`; US-6-01's contains `wingfoil workflow show <ref>` (base: neither). |

H1–H3 are not in the task's AC list, which predates the absorptions; they are the handovers' ACs (D6).
`npm test -- test/docs/x-cli-cmds.test.ts test/docs/vision-default-machine-text.test.ts
test/docs/memory-store-location-text.test.ts` at red: every new case fails for the reason above, the
untouched memory-store cases pass.

#### Decisions for the approver (recommendation first)

- **D1** AC 1's grep: assert the body only; the 1.3 entry keeps its three historical mentions (rewriting a
  revision record would falsify it). Alternative: literal whole-file grep → edit 1.3's entry.
- **D2** Notation: one notation, the shipped one — help's names, `<x>`/`[<x>]`, as spec-017 §7, spec-016 §3.1
  and `docs/cli-reference.md` write it; Pillar 2's `<PATH> --value VALUE` is respelled `<path> --value
  <value>` too, so the AC 2 (c) pin is mechanical. Alternative: keep uppercase placeholders (`<ID>`,
  `[<REF>]`), converting only the brackets — then AC 2 (c) needs a case-insensitive match.
- **D3** `--format` stated once (Global Options), per-row annotations removed: bug-099 item 4's second
  option, which its Notes say spec-008 §2 already rules for; item 4 is then closed by the document, the
  help-listing gap left as is (no code change in a docs-only task).
- **D4** The drop/keep rule above: dropped (no feature, story, scenario or spec declares them):
  `--notes`, `--file-format`, `--template` (directive), `--scope`, `--verify-usage`,
  `--built-in/--custom/--all`, `--filter`, `--verify-includes`, `--name` (workflow), `--tech-stack`,
  `--team-size`, init's `--confirm`; kept `*Not built*`: `memory import`, `dna infer`, `audit`, `init --mode
  infer`.
- **D5** The four DNA-sync passages: keep as intent, marked `*Not built*` and noting that no feature
  schedules them (`grep -n -i sync docs/01_vision/06_features.md` → nothing), rather than delete them;
  scheduling them is a vision-change matter.
- **D6** bug-274/275 and the B6 US-6-02 handover pinned as H1–H3 by red, the task's AC list left as planned.
- **D7** No `vision-change` instance: the edits restore the vision to approved specs (spec-001, spec-008,
  spec-016, spec-017), as task-240 (`202cddfe`) and task-244 (`c73905ba`) edited vision files in-task; the
  index is kept current in the same commit.
- **D8** `07_workflow-config.md` and `docs/design.md` declare no version → no bump.
- **D9** Same-class lines inside the sections rewritten are corrected too (missing-argument bullet,
  `dna show` sections, "UUID or slug", active-context and kinds paragraphs, personas `--filter`, v0.3
  timeline, *State and commits*, US-6-01); out of scope and left: bug-302's P4.13 row (its owners are the
  user-docs phases), the v0.4 timeline's `init --template` (USM's dual tag).

#### Risks for the batch

- task-246 merges after this task: the widened guard (H2) scans its new `docs/comparison.md` and
  `docs/case-study.md`; a line naming `.wingfoil/memory` without `memory.yaml`/`memory/templates` fails it.
- Any later task that edits a vision file re-bumps it and re-syncs `00_index.md` at the gate; none in B8 does
  (B8 notes' hazard list).
- spec-016 cites `X_cli-cmds.md:216,223` (§3.1 table, L364, L376, L418) and spec-017 `:163-170`: those line
  citations go stale with the edit (the dl-075 class). Candidate finding, no amendment proposed: they cite
  the text the spec was written against.

### red (qa, 2026-10-15)

- **Red commit `98f06f0c`** (test files only: `git show --stat 98f06f0c`). Base: head `ff141954`, docs
  byte-identical to `main` `2de79ef9`; dist/ = `main`'s code.
- **Files.** New `test/docs/x-cli-cmds.test.ts` (AC 1–4, H3; 16 cases), new
  `test/docs/vision-default-machine-text.test.ts` (H1; 5 cases), widened
  `test/docs/memory-store-location-text.test.ts` (H2: `docs/*.md`, regular files, non-recursive, same filter;
  describe/it titles and header comment updated, the other five cases untouched).
- **One deviation from the design's wording.** Commander's `registeredArguments` are all optional variadic
  (`[x...]`) in the shipped program, so a positional's required-ness is read from the command's `usage()` (the
  line `--help` prints, built by `program.ts` from the operation's declared positional: `<id>`, `[ref]`).
  Options are `command.options[].long`; root options `program.options` plus `--help`.
- **Per AC** (all red-first, approver ruling 2026-10-15):
  - AC 1 → `no body line names tech-stack or says "interactive or flag-based"` (base 8 lines: 57, 101, 106,
    114, 169, 190, 196, 206 — the design's positive control); `every **Sync Process:** paragraph is marked
    *Not built* (D5)` (2 unmarked; asserts ≥ 1 paragraph); `the --dry-run row names exactly the commands that
    register --dry-run, after the verb, exit 2 for the rest` (code spans naming a shipped command must equal
    the 20 takers; base names none); `every root-program long option has a Global Options row` (missing
    `--version`, `--no-color`, `--no-interactive`); `no command row carries a per-row --format` (base 10 rows).
  - AC 2 → `no [<word>-id] bracketed positional is left anywhere in the file` (base 6 `[document-id]`);
    `the pillar note that some rows "predate the convention" is removed` (base 1, L251); `every shipped
    command's row spells its positional and its options as the CLI registers them` (required `<x>` and not
    `[<x>]`, optional `[<x>]`; every registered long option but `--dry-run`/`--help` named; every `--x` token
    registered; `--entry-<field>` covers the `--entry-*` family; base 96 findings across Pillars 1–5 and agent).
  - AC 3 → `every shipped leaf command has exactly one command row` (base: `agent list`, `agent show`,
    `memory amend`, `memory park`, `workflow finalize` at 0); `every row of a command no build ships is marked
    *Not built*` (base: `memory import`, `audit` unmarked); `the header is at version 1.7 or later, with a
    dated 1.7 entry (task-245) and the missing 1.5 entry (task-179)` ("≥", bug-314; history versions strictly
    descending; base header 1.6).
  - AC 4 → `the --entry-<field> parameter row names every --entry-* option dna add registers` (base: missing
    `--entry-adapter`); `the paths row and the category parameter row name every category paths' --help lists`
    (categories parsed from `paths`' argument description; base: both miss `runs`, `health`); `directive assign
    --force, memory amend and memory park have rows in the shipped notation` (synopsis starts `wingfoil memory
    amend <id> --reason <text>` / `… park …`; base: no `--force`).
  - H1 (bug-275) → the `approved/rejected|approved, rejected` grep over `docs/01_vision/*.md`, X_cli-cmds'
    history excluded (base the 9 hits: 06:90, 379; 07:248, 401, 450; 08:88; X:18, 26, 48); four "≥" version
    pins (X 1.7, 06 1.15, 07 1.10, 08 1.12; base 1.6, 1.14, 1.9, 1.11). Comparison is numeric `major.minor`, so
    07's pin passes at 1.10 or at 2.0.
  - H2 (bug-274) → `bug-256's step-1 grep, widened to docs/*.md, returns nothing` (base 1:
    `docs/design.md:138`).
  - H3 → `US-6-02 names wingfoil workflow create <name> and no "interactive or flag-based" form`, `US-6-01
    names wingfoil workflow show <ref>` (bullet lines joined, whitespace collapsed; base: neither).
- **Run.** `npx jest test/docs/x-cli-cmds.test.ts test/docs/vision-default-machine-text.test.ts
  test/docs/memory-store-location-text.test.ts test/docs/vision-index.test.ts test/docs/cli-reference.test.ts
  --maxWorkers=2` → 3 suites failed, 2 passed; 22 failed, 22 passed: x-cli-cmds 16 failed / 0 passed,
  vision-default-machine-text 5 / 0, memory-store-location-text 1 / 5, vision-index 0 / 13, cli-reference 0 / 4.
  Every failure is an `expect(…)` on document text (first assertion of each: `toEqual([])` on the hit/finding
  list, `toBe(true)` on the header version, `toContain` on the US bullets and the `directive assign` row); no
  crash, no missing file. `npx eslint` on the three files → clean.
