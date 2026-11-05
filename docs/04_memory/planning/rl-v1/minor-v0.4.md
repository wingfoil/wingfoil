---
id: "minor-v0.4"
type: release
title: "WingFoil v0.4 - Interaction Layer + Polish"
status: planning
version: "v0.4"
pillar: "P5"
features: [P1.4, P2.3, P4.18, P4.19, P4.20, P4.21, P5.1.1, P5.1.2, P5.1.3, P5.1.4, P5.2.3]
requirements: "docs/03_backlog/04_backlog/by-release/v0.4.json"
release-line: "v1"
tmpl_version: 260703
---

## Scope

v0.4 completes the Interaction Layer (P5): the MCP Tools through which agents submit deliverables and update workflow
state, an agent run that works without a terminal and is recorded, and the agent instruction files generated from the
project's own configuration. Around that core it delivers the reference workflow templates (P4.18–P4.20) as packs, the
third verb of Element Provenance (P4.21, `transfer`), the migration path for projects already in development, and CLI
polish. Scope as ruled at release-planning's `define-scope` (approver, 2026-11-05, `release-planning-rel-v0.4-plan`
R6 and S2):

- **Tier 1, the Interaction Layer.** P5.2.3 MCP Tools; P5.1.4 CLI UX (compact listings, `dl-215`; reading workflow
  runs, `bug-485` … `bug-487`); P4.18–P4.20 through packs (`dl-138`, `dl-178`; the published `software` pack adopted
  in `w0`); P4.21 `transfer` (`dl-187`). Agents: the headless work run (`dl-181`, `dl-183`, `dl-188`), approval binding
  L0 (`dl-212`), the `coordinator` role and the hand-driven cycle (`dl-203` Q3, Q4), permissions per role if ratified
  (`dl-223`). The generator (`dl-143`, refined by `dl-208`) with `dl-209`'s alternative B — `agent sync` and
  `agent context` in v0.4, the hook engine in `v1.0` — and `dl-210` D1–D3 and D7. Positioning: `dl-140` Action 2 on
  every public surface, with its runnable example and its announcement.
- **Tier 2, migration** (Journeys 5 and 6): P1.4 `memory import` (`dl-144`, OpenSpec first), P2.3 `dna infer`, P5.1.2
  `init --mode infer`, P5.1.3 `audit`. If the release's budget does not hold, this tier moves to `v1.0` as a whole.
- **Deferred to `v1.0`:** P5.4.5 (agent-assisted init wizard, removed from `features:`), `dl-209`'s hook engine, `dl-210` D4–D6, and the
  decision-logs that place themselves after v1.0.
- **Change-proposals:** `cp-001` (a feature for the vision-change process, P4.22) is accepted into v0.4; its
  `update-vision`, downcasts and `schedule` run as one task, and P4.22 joins `features:` when `schedule` stamps it.

**Budget and reservation** (`dl-100` §4 (b), `dl-191`, `dl-133`): about 110–120 tasks, about 75 feature tasks for
tiers 1 and 2 and about 40 fix tasks. At least 20 % of the task budget is reserved for bug fixes and governance debt,
and within it at least 10 % goes to the oldest low-severity bugs. Every medium bug, and the low bugs of the modules the
features touch, are fixed in v0.4 (about 2.5 bugs per fix task); the other low bugs are stamped `v0.4.1`, a patch whose
element is added after the `v0.4.0` tag. No element in scope is left without a release.

## Pillar Focus

**Pillar 5 (Interaction Layer)** provides the dual interface — CLI for humans, MCP for agents — that makes WingFoil accessible and deterministic. v0.4 shifts focus from greenfield project setup (v0.1) to migration and adoption of existing projects. By inferring DNA from codebase structure, auto-importing scattered documentation, and exposing state mutations via MCP Tools, v0.4 removes friction from the onboarding journey. Polish to help text and error messages ensures the tool stays intuitive as feature surface grows.

## Success Criteria

Per `docs/01_vision/07_sequencer.md` (Week 4 Definition of Done):

- All v0.3 features stable (no regressions)
- `wingfoil init --mode infer` functional
- `wingfoil audit` functional
- `wingfoil dna infer` functional (or simplified fallback)
- `wingfoil memory import` functional
- MCP server stable (Resources + Tools + Prompts all working)
- Reference workflow templates (Scrum, Kanban, Lean, Trunk-Based) functional
- CLI help + error messages polished
- >80% test coverage on all modules
- npm package v0.4.0 published
- Journey 5 (Casey - PM) and Journey 6 (Morgan - evolution) manually tested

## Execution Notes

### Planning (release-planning)

<!-- identify-specs: artefacts discovered late or missed; build-backlog: scope/estimation
     surprises, bugs selected for this release and their derived fix tasks. -->

**Scope change recorded during v0.3's define-scope (2026-09-29).** P4.18, P4.19 and P4.20 moved
here from `minor-v0.3` on the approver's ruling (`release-planning-rel-v0.3-plan` R3). The Success
Criteria already listed the reference templates. Carried with them for this release's planning: the
idea of composable **methodology packs** (directives + workflows + configuration per methodology,
selectable at `init` and addable afterwards, the first packs extracted from WingFoil's own workflows),
which the planning conversation proposed for this release. `bug-144` (the Kanban template includes a
workflow by path) stays in v0.3: the Kanban template already ships with `init --template`.
Also moved here from v0.3 (2026-09-30, plan R13): the git-hook half of the notification system
(X1.1); v0.3 notifies through the CLI output only.

### Implementation (dev-loop, per task)

<!-- Recurring blockers across tasks, tech-specs revised mid-release, review rejections and why,
     anything that deviated from the plan in Scope/Pillar Focus above. -->

### Submit & Publishing

<!-- pre-release-checks failures and fixes, approve-release rejections, publishing issues. -->
