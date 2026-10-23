# AGENTS.md — Agent entry point for the WingFoil project

This file orients any AI coding agent working in this repository: what the project is, where every piece
of information lives, and which workflows and directives to respect. Read it first; follow the links
rather than guessing. `CLAUDE.md` holds only an import of this file, for agents that read that name.

The part between the `wingfoil:generated` begin and end markers (two HTML comments, around §3–§7) is the
projection of this repository's WingFoil configuration — `dna.yaml`, `memory.yaml`, `workflows.yaml`,
`roles.yaml` and the directives. A future `wingfoil` export will own and regenerate that region; the rest of
the file belongs to the project (`dl-137` R3/R4). Until the export exists the region is written by hand, and
the marker pair is provisional: the tech-spec of `dl-137` part (b) fixes the format.

---

## 1. What this project is

**WingFoil** is an open-source **harness for AI-assisted software development** that makes the process
**deterministic**: it gives humans and AI agents a structured, authoritative interface to a project
through five pillars — **Project Memory, Project DNA, Project Directives, Project Workflow, Interaction
Layer (CLI + MCP)**.

- **North Star:** the *Determinism Index* — two independent runs from the same specs + WingFoil config,
  using different AI agents, produce substantially equivalent software.
- **License:** MIT · **Distribution:** npm (public) · **Tech:** TypeScript / Node.js 22.12+.

> **Project status: implementation under way.** The release line `rl-v1` is `active`; `minor-v0.1`,
> `minor-v0.2` and the patch `patch-v0.2.2` are `released` (`wingfoil@0.2.2` on npm), and **`minor-v0.3`
> is `in-development`** (`docs/04_memory/planning/`). The repository carries a real implementation under
> `src/` — ten modules: `core, validation, storage, memory, dna, directives, workflow, cli, mcp, agent` — a
> packaged `wingfoil` CLI (`package.json` `bin` → `dist/cli.js`) and an MCP server (`wingfoil mcp`), all
> covered by a full Jest suite (`npm test`). Read, run, test and reason about `src/` as you would in any
> other codebase.
>
> **The command surface** is derived mechanically from `CORE_MODULES` (`src/core/index.ts`) — 33 commands,
> each with an entry in `docs/cli-reference.md`:
> - top level: `init`, `mcp`, `paths`;
> - `dna`: `show`, `set`, `add`, `update`, `remove`;
> - `memory`: `add` (with `--set <name>=<value>` for `id_pattern` tokens), `submit`, `approve`, `reject`,
>   `deprecate`, `amend`, `park`, `history`, `search`;
> - `directive`: `create`, `assign`, `remove`; `directives`: `list`;
> - `workflow`: `list`, `show`, `start`, `next`, `status`, `finalize`, `end`, `create`, `remove`;
> - `agent`: `execute`, `list`, `show`.
>
> **What is not built yet is a subset of what the specs describe (§6):** the workflow commands track a
> workflow's state — they deduce it, start and end a run, print the next step and record what nothing else
> completes — but **no step is executed** and **no `checks` runner** evaluates a check (P4.10/P4.12, v1.0).
> Run `node dist/cli.js --help` rather than trusting this list, and where the code and the specs in
> `docs/01_vision/` / `docs/02_requirements/` disagree about *what should be built*, the specs win (§10.1).

---

## 2. Documentation map — where to find what

| Path                                      | Contains                                                                                                                                                                                                                                                                                                         |
|-------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `docs/01_vision/`                         | Product vision package. `01_product-brief.md` (identity, north star, tech stack), `04_personas.md`, `05_journeys.md`, **`06_features.md`** (the feature list **P1–P5**, the canonical feature IDs), `07_sequencer.md` (release waves v0.1→v1.0), `08_mvp-canvas.md`, `X_cli-cmds.md`, `X_lean-inception-plan.md` |
| `docs/02_requirements/`                   | Engineering requirements (downcast of the vision)                                                                                                                                                                                                                                                                |
| `docs/02_requirements/01_user_story_map/` | User Story Map (US-* stories, per journey)                                                                                                                                                                                                                                                                       |
| `docs/02_requirements/02_bdd/features/`   | BDD `.feature` files by pillar (`p1-memory/`…`p5-interaction/`, plus `x1-notification/`) — the **acceptance contracts**                                                                                                                                                                                          |
| `docs/02_requirements/03_sard/`           | SARD requirements: `01_architecture.md` (**REQ-SYS-***), `02_performance-nfr.md` (**REQ-PERF-***), `03_state-context.md` (**REQ-STATE-***), `04_integrations.md` (**REQ-INT-***), `05_security-compliance.md` (**REQ-SEC-***)                                                                                    |
| `docs/03_backlog/04_backlog/`             | Operational backlog: `backlog.json`, `schema.json`, `by-release/{v0.1..v1.0}.json` (tasks + REQ infra tasks per release)                                                                                                                                                                                         |
| `.wingfoil/`                              | **WingFoil's own configuration** (dogfooding — see §3) + `WORKFLOW.md`; the Memory it governs is `docs/04_memory/`                                                                                                                                                                                               |
| `docs/04_memory/change-proposals/`        | The `change-proposal` Memory type (`cp-{n}-{slug}`): a change to the vision after inception, run through the `vision-change` workflow (`dl-132`)                                                                                                                                                                  |
| `docs/05_plans/`                          | **Phase plans** — the `plan` Memory type (§5), one per started workflow phase, nested by scope (`rl-v1/`, `rl-v1/rel-v0.3/`, …). `X_*.md` at the top level are grandfathered ad-hoc plans (dl-019)                                                                                                               |
| `docs/06_runs/`                           | The agent run log (`dna.yaml` `paths.runs`): one `<element-id>.jsonl` per element, written and committed by `wingfoil agent execute` (`spec-016`)                                                                                                                                                                 |
| `docs/08_health/`                         | The release-health catalogue `metrics.yaml`, its report schema and the committed reports (`dna.yaml` `paths.health`), read by `scripts/release-health/` (`dl-089`)                                                                                                                                                |
| `src/`                                    | **The implementation.** One directory per `dna.yaml` module (§4) — `core, validation, storage, memory, dna, directives, workflow, cli, mcp, agent` — plus `cli.ts`, the `bin` entry point                                                                                                                       |
| `test/`                                   | Jest suites, mirroring `src/` one directory per module, plus `release-health/`, `docs/` (the documentation-parity gates: API docs, `cli-reference`, `workflow-md`, `llms-txt`, `community-health`, the enumeration parities, …) and `lint/` (the `lint.clean` and version-bump gates)                          |
| `scripts/`                                | Repository tooling run by npm scripts and CI: `integration-branch.cjs` (a branch's integration branch, `dl-159`), `npm-dist-tag.cjs` (the dist-tag a publish takes), `check-governance.cjs` (`npm run check:governance`), `lint-claims.cjs`, `e2e-smoke.cjs`, `build-site.cjs`, `changelog-section.cjs`, `release-health/`, … |
| `.githooks/`, `.github/`                  | The opt-in `pre-push` hook (the governance check, `git-conventions` §9); CI, publishing and Pages workflows (`.github/workflows/`, incl. `pages.yml`) and the issue/PR templates                                                                                                                                |
| `docs/design.md`                          | Index of the **documentary chain** Lean Inception → USM → BDD → SARD → backlog: where each phase lives, what it produces, and its stop-check                                                                                                                                                                     |
| `README.md`                               | The **user-facing** entry point (problem, pillars, personas, quick start) — the human counterpart to this file. Owned by the `user-docs` release gate's `align-user-docs` phase (dl-013); this file is owned by the `agent-docs` workflow's `align-agent-docs` phase (dl-025), which `user-docs` and `release-line-cycle` both include |
| `docs/user-guide.md`, `docs/cli-reference.md`, `docs/examples/` (`01`–`06`, incl. `06-workflow-approval`), `CHANGELOG.md` | **User documentation** for projects that *use* WingFoil: step-by-step guide, one entry per command (kept complete by `test/docs/cli-reference.test.ts`), runnable self-checking scripts, release notes. Produced by `align-user-docs` (dl-013) |
| `docs/comparison.md`, `docs/case-study.md` | User-facing: WingFoil against neighbouring tools (dated, sourced facts), and the case study measured on this repository                                                                                                                                                                                           |
| `docs/site.yaml`, `llms.txt`              | The documentation site's page list (rendered by `scripts/build-site.cjs`, published by `.github/workflows/pages.yml`) and its generated `llms.txt` (`test/docs/llms-txt.test.ts`)                                                                                                                               |
| `docs/agents.md`                          | Guide for AI agents working in a project that **uses** WingFoil — the document counterpart of the MCP server. Not for agents developing WingFoil (that is this file); in no phase's `produces:`, aligned by `user-docs` with the approver's confirmation                                                          |
| `docs/assets/`                            | The **logo, mark, social-preview banners, organisation avatar and demo GIF** — sources plus rendered files, with the regeneration commands in its `README.md`. The uploaded images are recorded by `svc-001` (avatar) and `svc-004` (social preview) |
| `COLLABORATION.md`                        | How external contributors file **intent as Memory artifacts** rather than pull requests (`dl-020-contribution-model`)                                                                                                                                                                                           |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` | The community-health files (`test/docs/community-health.test.ts`): how to contribute, the code of conduct, the supported versions and how to report a vulnerability                                                                                                                                |
| `server.json`, `glama.json`, `.mcp.json`  | The MCP Registry and Glama listings of the published server; `.mcp.json` registers this repository's own `wingfoil` MCP server (pinned build, `npm run check:mcp`)                                                                                                                                                |

**Feature IDs** are `P<pillar>.<n>` (e.g. `P1.13`). **Requirement IDs** are `REQ-<AREA>-<nn>`.
Traceability chain: **feature (P*) → user story (US-*) → BDD scenario → SARD requirement (REQ-*) → task**.

---

<!-- wingfoil:generated:begin -->

## 3. WingFoil self-configuration (dogfooding)

WingFoil manages its own development. The config is hand-authored under `.wingfoil/` at the repository
root, and Memory **content** lives under `docs/04_memory/` (the `docs/04_memory/` paths in
`memory.yaml`, resolved against the repository root). `task-111` moved both there from `docs/self/`
with `git mv` (`bug-075`), so `wingfoil memory history --follow` keeps each element's history across
the move. Start from `.wingfoil/README.md`.

**Which build runs what** — the `wingfoil-cli` directive (§1) is the rule; in short:

| Job | Build | How, from the repository root |
|-----|-------|-------------------------------|
| **Memory operations** — every verb that writes a `wf()` commit (`memory add`, `submit`, `approve`, `reject`, `deprecate`, `amend`, `park`), and the workflow commands that write a commit (`workflow start`, `finalize`, `end`, `create`, `remove`) | the **code build**, compiled from your worktree | `npm run build`, then `node dist/cli.js <command>` |
| **Read commands** — `dna show`, `paths`, `directives list`, `memory search`, `memory history`, `workflow list`, `show`, `next`, `status` — and **MCP** | the **pinned build**, the devDependency `wingfoil-released` (`dl-095`) | `npm run -s wingfoil -- <command>`; the MCP server `.mcp.json` registers (`npm run check:mcp`) |

- The pinned version is what `package.json` declares for `wingfoil-released`; `npm run -s wingfoil --
  --version` prints it. It moves forward only, to published builds, through `release-planning`'s
  `advance-pinned-build` phase. Its known surprises are the bugs tagged `pinned-build`
  (`npm run -s wingfoil -- memory search --type bug --tag pinned-build`).
- Do **not** use `npx wingfoil`: once `dist/` is built it runs this repository's own CLI, whichever build
  you meant.
- The workflow reads (`workflow list`, `show`, `next`, `status`, the MCP resource `wingfoil://workflows`) run on
  the pinned build since the pin reached a build that reads the `{ type, path }` form of a `produces` entry
  (`dl-104` D3); the workflow commands that write a commit stay on the code build with the Memory operations.

| File                                                       | Pillar                 | What it holds                                                                                                                                                                                        |
|------------------------------------------------------------|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `.wingfoil/dna.yaml`                                       | DNA (P2.4)             | Modules, **stacks** (technologies + methodologies), **team & roles** (incl. `team.agents`, the AI attribution identity), resource paths (`conventions` removed in v1.1 — rules moved to `directives/custom/`; see spec-002) |
| `.wingfoil/memory.yaml`                                    | Memory (P1.13)         | Element **types** (`release-line, release, task, adr, decision-log, tech-spec, bug, plan, service, change-proposal`), per-type **state machines**, `amendable`, and per-type `template:` scaffolds |
| `.wingfoil/memory/templates/`                              | Memory (P1.13)         | One Markdown scaffold per element type (`frontmatter.required` enforced on submit)                                                                                                                   |
| `docs/04_memory/planning/{id}.md`                          | Memory (P1.11)         | The **release-line** roadmap (one file per major version, e.g. `rl-v1.md`)                                                                                                                           |
| `docs/04_memory/planning/rl-{release-line}/{id}.md`        | Memory (P1.11)         | That release-line's releases: the minors (v0.1→v1.0 for `rl-v1`) and the patches (`patch-v0.2.2`, `dl-092`)                                                                                          |
| `.wingfoil/directives/custom/`                             | Directives (P3.5/P3.8) | Rules: P3.8 template **stand-ins** (`code-quality, testing, code-review, architecture, security, documentation`) + WingFoil-specific (`determinism, doc-versioning, security-secrets, traceability, command-baseline, claim-evidence, git-conventions, wingfoil-cli`) |
| `.wingfoil/roles.yaml`                                     | Directives (P3.2/P3.7) | Role → directive bindings                                                                                                                                                                            |
| `.wingfoil/workflows.yaml` + `workflows/custom/`           | Workflow (P4.1)        | `sw-life-cycle` (main) + its sub-workflows + five more startable mains: four ingest mains and `vision-change`                                                                                        |
| `.wingfoil/workflows/bindings.yaml`                        | Workflow (P4.10/P4.12) | The command each project-bound `actions:` / `checks:` token runs — binding kind `run` (an argument vector), or `manual: true` (`spec-003` Layer 3, `dl-090`); unbound prose checks stay `W_WORKFLOW_UNBOUND_TOKEN` warnings |
| `.wingfoil/agents/`                                        | Interaction (P5.3)     | Agent adapters for `wingfoil agent execute` (`spec-016`): `built-in/claude-code.yaml`, and `custom/` (empty)                                                                                           |

> The tool ships the official P3.8 **built-in** directive templates (`task-057`: `wingfoil init`
> installs them under `.wingfoil/directives/built-in/`), but this hand-authored config predates them and
> still keeps the six as stand-ins in `custom/` (`kind: custom`, `ref: [P3.8]`); `dl-155` (`ready`,
> recommendation (A): adopt the shipped templates and keep WingFoil's own clauses in separately named
> custom directives) owns the reconciliation. `directives/built-in/` and `workflows/built-in/` hold nothing
> but a `.gitkeep` — they are reserved for assets shipped by the npm package (spec-011), which is why
> `built-in/` vs `custom/` is the structural discriminator REQ-SEC-07 keys removability on.

---

## 4. Project DNA — quick reference (`dna.yaml` is authoritative)

- **Modules:** `core, validation, storage, memory, dna, directives, workflow, cli, mcp-server, agent` — all
  ten exist under `src/`, each at its `dna.yaml` `path:` (note `mcp-server` lives at `src/mcp`).
- **Stacks** (`stacks.technologies`): TypeScript · Node.js 22.12+ · npm · Commander.js (CLI) · MCP
  over stdio via `@modelcontextprotocol/sdk` · js-yaml (all git-backed YAML) · Zod (validation) · Jest
  (testing, coverage **>80%**) · TypeDoc (API-docs gate) · git storage · semver. ADR-004 framed the MCP
  server around the Anthropic SDK; it was built on `@modelcontextprotocol/sdk` instead. `task-117`
  (`bug-138`) removed the two runtime dependencies nothing in `src/` imported, `@anthropic-ai/sdk` and
  `chalk`, and `test/cli/runtime-dependencies.test.ts` keeps it that way.
  **Methodologies** (`stacks.methodologies`): Lean Inception · User Story Mapping · Specification by
  Example (BDD) · SARD · TDD.
- **Roles:** `developer, reviewer, qa, architect, product-owner, tech-lead, facilitator, approver`.
  AI agents execute as `developer/reviewer/qa/architect/facilitator` and **never hold approval authority** — all
  approvals route to the `approver` role (the human, Roberto).
- **Paths:** query categories `sources, tests, docs, config, governance, runs, health` (`dna.yaml`
  `paths:`; `wingfoil paths <category>`).

---

## 5. Memory model (`memory.yaml`)

State is **derived from each document's frontmatter** at a commit — there is **no `.wingfoil/state/`
index** (REQ-SYS-03). Every transition is validated against the type's state machine (REQ-STATE-01): the
engine is `src/memory/state-machine.ts`, and the CLI verbs that drive it ship (§5.1) and run on this
repository's own Memory through the code build (§3). Whenever you edit WingFoil's own frontmatter by hand,
the validation is your responsibility.

Each type's machine is encoded in `memory.yaml` as `sequence` (the ordered forward chain) + `gates`
(per-state `{state: {reject: target}}`: that state's forward edge needs `approve` rather than plain
`submit`) + `waiting` (states advanced only by a workflow/engine action, no CLI verb) + `returns` (the
backward edge `memory park` takes from a started state) — see `spec-001-memory-yaml-schema` for the full
schema. There is **no `rejected` status** anywhere: `reject` lands on the gate's declared target, and the
reason lives in the commit body (P1.7) and in the document's `rejection_reason`. `deprecated` is an
implicit target legal from any state, never declared in a machine.

`amendable` says whether `memory amend` may record a content correction without a state change: `true`
for every type except `release-line`.

| Type              | Path (resolved against the repository root)          | State machine (forward chain; `reject` targets in parentheses; `returns` after ⟲)                    |
|-------------------|------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `release-line`    | `docs/04_memory/planning/{id}.md`                    | draft→planning(→draft)→active→done (·→deprecated); not amendable                                      |
| `release`         | `docs/04_memory/planning/rl-{release-line}/{id}.md`  | draft→planning→in-development→releasing→released (·→deprecated)                                       |
| `task`            | `docs/04_memory/{release}/{id}.md`                   | draft→pending(→draft)→backlog→in-progress→in-review(→in-progress)→approved→done; ⟲ in-progress→backlog |
| `adr`             | `docs/04_memory/design/adrs/{id}.md`                 | draft→pending(→draft)→accepted→superseded                                                             |
| `decision-log`    | `docs/04_memory/design/dls/{id}.md`                  | draft→in-discussion(→draft)→ready (·→deprecated)  [in-develop/done removed per dl-017]                |
| `tech-spec`       | `docs/04_memory/design/specs/{id}.md`                | draft→pending(→draft)→approved→superseded (mirrors `adr`)                                             |
| `bug`             | `docs/04_memory/bugs/{id}.md`                        | draft→open(→closed)→triaged(→closed)→planned(→closed)→in-progress→in-review(→in-progress)→resolved(→in-progress)→closed; ⟲ in-progress→planned |
| `plan`            | `docs/05_plans/{scope}/{id}.md`                      | draft→active→done (·→deprecated)  [dl-019 — phase-plan execution scaffold; `X_*` grandfathered]       |
| `service`         | `docs/04_memory/services/{id}.md`                    | draft→pending(→draft)→active (·→deprecated)  [dl-088 — external state; never a secret value; approve = the approver ran `verify`]. `kind`: `account, credential, listing, setting, domain, handle, repository`; a `repository` may name its `feedback_inbox` (dl-163) |
| `change-proposal` | `docs/04_memory/change-proposals/{id}.md`            | draft→in-analysis(→draft)→accepted→scheduled (·→deprecated)  [dl-132 — run by `vision-change`]        |

---

## 5.1. Memory operations — commit format

Each operation is a git commit scoped to **one element type**, with a fixed, non-overlapping scope. Never
conflate operations or batch content across operations into one commit. Subject line convention —
**present-tense verb**, matching the operation name exactly:

```
wf({type}): {verb} {id1}, {id2}, ... [{from} → {to}]
```

The verbs are a closed list (`dl-079` (A), `spec-008-cli-grammar` §2, `MEMORY_OPERATIONS` in
`src/memory/audit.ts`), each with its bracket rule:

| Verb | The operation it records (`spec-008` §2) — and what writes it today | Bracket |
|------|------------|---------|
| `add` | `memory add` | none |
| `submit` | `memory submit` | none |
| `approve` / `reject` | `memory approve` / `memory reject` | `[from → to]` |
| `deprecate` | `memory deprecate` | `[from → deprecated]` |
| `start` | a `set_state` that opens work on an element — written by hand | `[from → to]` |
| `finalize` | a `set_state` into the last state of a `sequence` — written by `workflow end` (a plan) and the `supersedes:` trigger, otherwise by hand | `[from → to]` |
| `sync` | `<type>.sync_state` (`bug.sync_state`, `dl-045`) — written by hand (`workflow next` prints the subject) | `[from → to]` or a chain `[s0 → s1 → … → sN]` |
| `amend` | `memory amend` (`dl-108`) | `[s → s]` |
| `park` | `memory park` (`dl-110`) | `[from → to]`, `to` the type's `returns` target |
| `assign` | `element.set_release` — written by hand | none |

Configuration changes have their own scopes, not Memory verbs: `wf(dna): set|add|update|remove …`,
`wf(directive): create|assign|remove …`, `wf(workflow): create|remove …`.

**The `workflow finalize` record is not a `wf()` commit.** It records a step no Memory or file evidence can
complete, as an empty commit with the subject `workflow: finalize <instance-id> <step-key>`, a body with
`Approver:` (on an `approval:` phase, after the authority check) and `Reason:` (when `--reason` is given), and
the trailer paragraph `WingFoil-Phase: <workflow>.<phase> completed`, `WingFoil-Instance: <instance-id>`,
`WingFoil-Element: <type>:<id>` or `WingFoil-Item: <collection>#<key>` (none when unscoped) and
`WingFoil-Version:` (`src/core/workflow-finalize.ts`, `spec-017` §7.9). `memory history` does not read it as a
Memory operation; the workflow deduction reads its trailers.

**One operation, one commit — two declared exceptions:**
- **The supersede pair.** Approving an `adr` or `tech-spec` whose `supersedes:` names an element of its
  type writes two commits: the `approve`, then `wf({type}): finalize {superseded} [{state} → superseded]`
  with no `Approver:` line and a `Reason:` naming the superseding element (`src/core/memory-supersede.ts`,
  `spec-008` §2). `superseded` is reached **only** through that trigger — never by hand, never by
  `deprecate`. If git fails between the two commits, the approve stays and the command prints the exact
  `git commit --only --cleanup=whitespace …` that completes the pair; run it as printed.
- **A task reject with linked bugs.** The approver's `wf(task): reject … [in-review → in-progress]`, then
  one `wf(bug): sync <bug> [in-review → in-progress]` per bug in the task's `bug:` list, each citing the
  reject's sha, with no `Approver:` line (`dev-loop`, `task-205`).

**Every commit `wingfoil` writes ends with a trailer paragraph** carrying `WingFoil-Version: <semver> (<sha>)`
(`dl-111`), plus the other `WingFoil-*` trailers a workflow step adds: `WingFoil-Instance:` / `WingFoil-Step:`
on a `memory add --workflow … --step …`, and `WingFoil-Phase:`, `WingFoil-Instance:` and `WingFoil-Element:` or
`WingFoil-Item:` on a `workflow finalize` record. To add a trailer to such a commit,
amend with `git commit --amend --no-edit --trailer "…"`, which joins that paragraph; never add a new paragraph
after it, or a reader takes `WingFoil-Version:` into the `Reason:` block and the workflow deduction, which reads
only the final paragraph, loses the step link or the phase record (`git-conventions` §8, `bug-236`). Only a commit not yet pushed may be amended.

**AI attribution** (`git-conventions` §7, `dl-117`). Every commit an agent writes, **except an `approve` or
`reject` commit**, ends with the trailer paragraph
`Co-Authored-By: <team.agents name> <<team.agents email>>` and `AI-Model: <the model identifier you run as>`,
the values read from `dna.yaml` `team.agents`. On a commit `wingfoil` wrote, add the two with
`git commit --amend --no-edit --trailer …`, in the paragraph of `WingFoil-Version:`. `wingfoil agent execute`
hands this rule to the agents it launches; an agent started from its own CLI has only this file.

> **All Memory verbs ship and run on this repository** through the code build (§3): `memory add`, `submit`,
> `approve`, `reject`, `deprecate`, `amend`, `park` (P1.6–P1.9, `dl-108`, `dl-110`), with the read-only
> `memory search` and `memory history` (P1.10). `finalize` is written by `workflow end` (`wf(plan): finalize`,
> `active → done`) and by the supersede trigger; `workflow start` writes a plan's `add` and `submit`; no command
> writes `start` or commits `sync` (`workflow next` prints the `sync` subjects a step owes), so those two are
> written by hand, in the same format. Approvals, rejections and amendments run only on the approver's instruction,
> whether by verb or by hand (§8). Run `node dist/cli.js memory --help` rather than trusting this paragraph.
>
> The commit *format* is the contract either way — it is what the verbs emit and what
> `wingfoil memory history` reads back — so follow it exactly, and keep each operation to its own commit.

### The `Reason:` block — the shape every reason must have

`approve`, `reject`, `deprecate`, `amend` and `park` record a `Reason:`; `submit` and `add` record none. Its
shape is **declared**, not free-form (`dl-067-reason-trailer-contract`, `ready`; `spec-008-cli-grammar` §2),
and the rule is the same whether the commit is written by `wingfoil memory <verb>` or by hand:

- **A reason is a block, and it may span lines.** `Reason:` carries the remainder of its own line plus
  every following body line, up to (exclusive) the commit's trailing trailer paragraph
  (`WingFoil-Version:`, `Co-Authored-By:` and friends) or the end of the body. Multi-paragraph reasons
  are normal here, and `wingfoil memory history` reads all of it.
- **It may never be blank.** An empty or whitespace-only reason leaves a bare `Reason:` that no reader
  can parse; the CLI refuses it at exit `2` on every verb that takes `--reason`.
- **No line of a reason may begin with `Approver:`, `Reason:` or `WingFoil-Version:`**, in any letter case.
  Such a line is indistinguishable from the trailer itself, and on `deprecate` — which writes no
  `Approver:` line of its own and performs no authority check — one would make `memory history` report an
  approval that never happened. Ordinary `Key: value` prose (`Action: amend spec-015 §3`) is fine; only
  those keys are reserved.
- **A reason may not END with a paragraph made entirely of `Key: value` lines**, because a reader
  cannot tell it from the commit's own trailer block. Add a closing sentence, or fold the lines into
  prose.
- **Whitespace is normalized, and that is the contract.** Per-line trailing whitespace is stripped,
  runs of blank lines collapse to one, and leading and trailing blank lines are dropped: git's
  `--cleanup=whitespace`, which the tool passes explicitly on every commit (`bug-051`) because
  `git commit -m` follows the operator's `commit.cleanup` otherwise — under `commit.cleanup=strip` a line
  starting with `#` is lost (`bug-236`). By hand, pass `--cleanup=whitespace` too. On top of it the tool
  trims the **first line's** leading whitespace, which git does not do: that line sits after `Reason: ` on
  the same physical line. Interior indentation is preserved throughout.

### `memory.add` — register a new element (draft)

1. Create the file at the path given by the type's `path` pattern (resolved against the repository
   root; see the §5 table).
2. Copy the type's `template.file` scaffold verbatim.
3. Fill in **only** the frontmatter skeleton:
  - `id` — generated from the type's `id_pattern` (e.g. `task-109-validation-id-engine`); the id is
    allocated at commit time, never reserved (`git-conventions` §6).
  - Any field the `add` action itself pins (`--set <name>=<value>` for an `id_pattern` token, e.g.
    `release` for a task) — everything else stays at template defaults.
  - `status: draft` — fixed at this step.
4. Leave `title` empty and the **body as template placeholder comments** — no content written yet
   (unless the add action itself sets `title`).
5. Commit message: the subject, then the trailer paragraph (`WingFoil-Version:`; `WingFoil-Instance:` /
   `WingFoil-Step:` when `--workflow` / `--step` name the step that adds it):
   ```
   wf({type}): add {id1}, {id2}
   ```
6. The commit contains **only** the new file(s) — no other changes.

### `memory.submit` — fill content and move to the next state

1. Fill in **all** required frontmatter fields (`template.frontmatter.required` for the type in `memory.yaml`).
2. Write the **full body content** — replace every template placeholder comment with real text.
3. Move `status` to the type's post-submit state — `draft → pending` for the default machine and most
   types; `draft → planning` for `release`/`release-line`, `draft → in-discussion` for `decision-log`,
   `draft → in-analysis` for `change-proposal` (§5 table).
4. Commit message: the subject (no bracket, `dl-054`), then — when the submit carries content — one
   `Carries content: <item>, <item>` line naming it (the frontmatter fields filled, the body), then the
   trailer paragraph:
   ```
   wf({type}): submit {id1}, {id2}

   Carries content: frontmatter field 'severity', the body
   ```
5. The commit contains **only** the updated memory file(s).

### `memory.approve` — advance state (approval gate)

Per **P1.7** the commit must record three things: **approver identity**, **ISO-8601 timestamp**, and **reason**.
The git commit timestamp supplies the ISO-8601 timestamp automatically (see **P1.2**, **P1.10**); the other
two must appear explicitly in the commit message.

1. Change **only** the `status` field to the next legal state in the type's state machine (§5 table).
2. Do **not** modify any other frontmatter field or the body.
3. Commit message format — subject + mandatory body:
   ```
   wf({type}): approve {id1}, {id2} [{old-state} → {new-state}]

   Approver: {full name} <{email}> ({role})
   Reason: <why the transition is approved>
   ```
  - `Approver:` body line — full identity as `Name <email> (role)` so `wingfoil memory history`
    can surface it per **P1.10** even when git author and approver differ.
  - `Reason:` block — **mandatory** (`--reason` is a required argument per P1.7 Scenario 2), with the
    shape the `Reason:` block section above declares.
  - No AI attribution trailers (`git-conventions` §7).
4. If an approval ever changes an artifact outside Memory, that change belongs in the **same commit** — an
   approval and its side effect must not be separable. The one engine side effect today is the supersede
   pair above, which is two commits by design. **Do not** add the task to the per-release backlog JSON
   under `docs/03_backlog/04_backlog/by-release/` when it reaches `backlog` — that JSON is an output of
   the `backlog-export` sub-workflow from the *specification* phase (`docs/design.md` phase 4), read as
   a source and cited by each release's `requirements:` frontmatter field.
5. Agents may execute `memory.approve` **only when explicitly instructed** by the `approver` role (Roberto);
   agents never approve autonomously (§4, §8).

### `memory.reject` — send back for revision

Same evidentiary requirement as `memory.approve` (P1.7): approver identity + reason, both explicit in
the commit message (the timestamp comes from the git commit itself).

1. Change the `status` field to the type's reject target, per `memory.yaml`'s `gates` block for
   that state — e.g. `pending → draft` for the default machine, `task`, `adr`, and `tech-spec` alike;
   `in-discussion → draft` for `decision-log`; `in-analysis → draft` for `change-proposal`;
   `open/triaged/planned → closed` or `in-review/resolved → in-progress` for `bug` (§5 table). At the same
   time, set the document's `rejection_reason` frontmatter field to the `--reason` text, normalized
   identically to the `Reason:` block (the two sinks are fed from one rule, so they cannot disagree). A
   later `memory.submit` on this document clears `rejection_reason` again.
2. Commit message format — subject + mandatory body:
   ```
   wf({type}): reject {id1}, {id2} [{old-state} → {new-state}]

   Approver: {full name} <{email}> ({role})
   Reason: <what needs to change before resubmitting>
   ```
3. Agents may execute `memory.reject` **only when explicitly instructed** by the `approver` role — same
   restriction as `memory.approve` (§4, §8). A task with linked bugs: see the two-commit exception above.

### `memory.amend` — record a correction without a state change

For a document of an `amendable` type (§5) past its first state: the correction is made in the working tree,
left uncommitted, and `memory amend <id> --reason "…"` commits it as `wf({type}): amend {id} [s → s]` with
the `Approver:` and `Reason:` lines. It needs the approver role, so an agent prepares the edit and the
approver runs the verb (`dl-108`).

### `memory.park` — return a started element

`memory park <id> --reason "…"` moves a started element back along its type's `returns` edge — a task
`in-progress → backlog` — when the work stops for now (`dl-110`); a fix task's bugs follow it
`in-progress → planned` through `bug.sync_state`.

### `memory.deprecate` — retire an element

Callable from any state, on any type (§5). Not an approval gate — no `Approver:` line required — but a
`Reason:` keeps the audit trail meaningful. Precisely **because** this verb writes no `Approver:` line
and runs no authority check, it is the one where a trailer-shaped reason would forge an approval
record: the `Reason:` block rules above apply here in full, and a reason that is given must be
non-blank (`--reason` itself stays optional, `dl-027`).

1. Change **only** the `status` field to `deprecated` — for **every** type, `adr`/`tech-spec`
   included. `deprecated` is a reserved implicit wildcard target, legal from any state and never
   declared in a machine (spec-001; `src/memory/schema.ts` rejects a machine that declares it).
   **`superseded` is not a deprecate target**: it is reached only through the `supersedes:` trigger of
   the approve that accepts the replacement (above).
2. Commit message format — subject + optional body:
   ```
   wf({type}): deprecate {id1}, {id2} [{old-state} → deprecated]

   Reason: <why deprecated, e.g. "replaced by adr-004">
   ```

---

## 6. Workflows to follow (`workflows/custom/`)

**Main (startable; multiple open mains allowed — REQ-STATE-03):**

- **`sw-life-cycle`** — the end-to-end lifecycle:
  `inception → specification → init → seed-first-release-line → release-line-cycle → sunset`.
    - `init` → `wingfoil-init` (config pillars **only** — no Memory content).
    - `seed-first-release-line` — inline phase (no `include:`): creates the first `release-line`
      (v1), `draft → planning`. Every *later* release-line (v2, v3, ...) is instead self-seeded by
      `plan-next-release-line` below — not part of this phase.
    - `release-line-cycle` *(iterate_over: release-line)* — one iteration per major version:
      `approve` (planning → active) → `initial-design` (`seed-releases` + optional
      `seed-adrs`/`seed-dls`/`seed-specs`, scoped to this release-line) → `delivery` →
      `align-agent-docs` (the `agent-docs` workflow, which `user-docs` also includes, dl-025) →
      `plan-next-release-line` (closes this release-line to `done`, self-seeds the next one once
      every one of its releases is `released`).
        - `delivery` → `release-cycle` *(iterate_over: release, scoped to this release-line)*:
            - `planning` → `release-planning` *(`advance-pinned-build` → `define-scope` → `triage-bugs` →
              `reconcile-governance` → `record-adrs` → `identify-specs` → `build-backlog` →
              `commit-backlog`)*;
            - `implementation` → `wave` *(iterate_over: `element:waves`, the release's `waves:`)*: per wave,
              `tasks` → `dev-loop` *(iterate_over: task, where `release` and `wave` match)* → `wave-checks`
              (e2e smoke, examples, `docs.parity`; a failure opens a bug) → `re-sweep` → `re-plan`
              (checkpoint; appends the next wave, dl-100);
            - `dev-loop`: `start` → `design` (architect, gate) → `red` (**`qa`**: the failing or
              characterization tests, dl-134) → `green` → `refactor` (coverage + API docs + `lint.clean` +
              typecheck) → `review` (reviewer: unit + **BDD** tests, `docs.parity`) → `done`. A task branch
              is cut from, and merged back into, the release's **integration branch** — `main` for a minor,
              `release/X.Y` for a patch — derived by `scripts/integration-branch.cjs` (`dl-159`); a fix task
              keeps its source bugs in sync via `bug.sync_state`;
            - `user-docs` *(dl-013)*: `check-implementation-complete` (tech-lead) → `align-user-docs` →
              `align-agent-docs` (dl-025: this file, `CLAUDE.md` as its pointer, `.wingfoil/README.md`,
              `.wingfoil/WORKFLOW.md`);
            - `e2e-smoke` *(dl-023: `fresh-init` → `drive-cli` → `mcp-registration` → `gate`)* →
              `release-submit` (`pre-release-checks` → `enter-releasing` → `approve-release`) →
              `release-publishing` (`release-commit` → `staging-rehearsal` → `tag` on the integration branch →
              `publish` → `mark-released`) → `release-health` *(dl-089: `measure` → `compare` → `propose`
              against `docs/08_health/metrics.yaml`; not a gate)* → `retrospective` (`explore` →
              `collect-feedback` → `additional-points` → `capture` → `approve`, → decision-logs).
    - `sunset` → `end-of-life`.
- **`bug-ingest`, `decision-log-ingest`, `adr-ingest`, `service-ingest`** — capture a single element on
  demand. If started while another workflow with an active `element` is running, the new file **inherits
  that element** (e.g. a bug raised during `dev-loop` inherits the active `task`).
- **`vision-change`** — change the vision after inception (`dl-132`): `capture` (a `change-proposal`) →
  `impact-analysis` (approver accepts) → `update-vision` → the downcasts the analysis names, each optional
  (`downcast-stories` → `user-story-mapping`, `downcast-scenarios` → `specification-by-examples`,
  `downcast-requirements` → `volere-requirements`) → `schedule` (stamps the
  element's `release`; `release-planning`'s `define-scope` sweeps it into the release's `features:`).

Phase completion is **deduced** (no stored `status:`, `spec-017`): Memory-backed phases from element
status at a commit and the commit history reachable from it, spec/doc phases from the existence of their
`produces:` artifacts, and a step nothing else completes from the record `workflow finalize` commits.

> **The workflow commands track; they do not execute.** `workflow start <name>` records a run as an active
> `plan` element and prints its first step; `workflow next` prints the next step (its verb, role, element,
> directives and bindings); `workflow status` lists the open runs and pending approvals; `workflow finalize` records a step no
> Memory or file evidence can complete; `workflow end` moves the plan to `done`; `workflow list` / `show` read
> the definitions. **No step is executed and no check is evaluated** (P4.10/P4.12, v1.0): the work of each step
> is done by you, by hand or with the verbs of §5.1. So whenever you are asked to **start a workflow** (main
> *or* sub), open its `plan` (`workflow start`, or `memory add --type plan` for a phase run by hand) and write
> in it a plan coherent with the workflow definition — its phases, roles, `actions`, `produces:` and
> `checks` — then execute against that plan. Use `docs/05_plans/rl-v1/initial-design-rl-v1-plan.md` or a
> recent phase plan under `docs/05_plans/rl-v1/rel-v0.3/` as the model. Existing `X_*` ad-hoc plans are
> grandfathered (no frontmatter required, `dl-019`).

---

## 7. Directives to respect (`roles.yaml`)

Bindings are by **role**, never by person (REQ-SYS-08).

| Role                   | Directives                                                                                       |
|------------------------|--------------------------------------------------------------------------------------------------|
| developer              | code-quality, testing, determinism, command-baseline                                             |
| reviewer               | code-review, traceability, command-baseline, code-quality, testing, determinism                  |
| qa                     | testing                                                                                          |
| architect              | architecture, determinism, traceability, command-baseline                                        |
| product-owner          | traceability                                                                                     |
| tech-lead              | architecture, code-review, traceability                                                          |
| facilitator            | traceability                                                                                     |
| approver               | code-review                                                                                      |
| **global (all roles)** | doc-versioning, documentation, security, security-secrets, claim-evidence, git-conventions, wingfoil-cli |

`command-baseline` states which state a command may read and write (`dl-080`); `claim-evidence` states that
a sentence asserting a fact about the code names the command that establishes it; `git-conventions`
(`dl-119`) covers branch prefixes, staying current with the integration branch, tags, `wf()` subjects,
identity, id allocation, AI attribution and amending a tool commit; `wingfoil-cli` (`task-270`) says which
build runs which command (§3). `roles.yaml` declares its own `version:`; read it there.

When executing under a role, **auto-load and obey that role's directives** (P3.6/P5.4.2).

<!-- wingfoil:generated:end -->

---

## 8. Conventions (non-negotiable)

- **TDD / test-first**: write a failing test before implementation — but **classify each acceptance
  criterion first** (`dl-014`/T1, `testing` directive): **red-first** when the behaviour is new (a
  genuine failing test precedes the code), **characterization** when the behaviour already exists (pin
  it with a test that passes on first run). Characterization is legitimate for verification, infra and
  documentation tasks; **never fabricate a red or add dead code to force one**. Record the per-AC
  classification in the task's Execution Notes. Keep coverage **>80%** (Jest) and non-regressing; the
  `dev-loop` review gate runs unit **and BDD** acceptance tests.
- **Determinism**: no wall-clock, randomness, or unordered iteration in context-building paths; prefer
  explicit declared config over inferred behaviour (REQ-SYS-07 / REQ-STATE-09).
- **Traceability**: maintain feature → US → BDD → REQ → task; every ADR cites its SARD requirement(s).
- **Documentation versioning** (`doc-versioning`): bump a doc's `version` once per branch, on its first edit
  against the version on the branch's integration branch (`main`, or `release/X.Y` for a patch); update the
  date when bumping. `test/lint/version-bump.test.ts` enforces it for the four configuration files.
- **Security**: never commit credentials/secrets (everything in the config is git-versioned); MCP
  Resources are read-only — mutations only via validated MCP Tools.
- **Commits**: every state change is a git commit with author + timestamp; bring a branch up to date with
  `git merge --no-edit <integration branch>`, and never rebase a branch that carries `wf()` commits
  (`git-conventions` §2).
- **Approvals**: agents have no approval authority; route to the `approver` role.

---

## 9. Field-provenance convention (`[SPEC]` / `[AUTHORING]`)

`dna.yaml` and `memory.yaml` annotate every field inline:

- **`[SPEC]`** — required/defined by a spec; an inline ref (feature ID, REQ code, or BDD scenario) is cited.
  Removing or renaming a `[SPEC]` field requires changing the referenced specification first.
- **`[AUTHORING]`** — a coherent addition not mandated by a spec; free to change.

---

## 10. Golden rules for agents

1. **Specs win.** `docs/01_vision/` + `docs/02_requirements/` are authoritative; the config in
   `.wingfoil/` must trace back to them.
2. **Find before you write.** Use this map and `.wingfoil/README.md`; don't invent paths.
3. **Respect the state machines.** Only legal transitions (per `memory.yaml`); state lives in frontmatter.
4. **Obey your role's directives.** Load them on execution; never self-approve.
5. **Keep traceability and determinism intact** in every change.
6. **The tool is partly built — check, don't assume.** `src/` is real and testable, but only the
   operations in `CORE_MODULES` ship as commands (§1), and no workflow step is executed (§6). Before relying
   on a runtime feature, confirm it exists; if it doesn't, author the configuration/specs and do the step by
   hand per §5.1/§6.
7. **Starting a workflow ⇒ open its plan first.** Until `wingfoil` executes steps, every workflow start
   (main or sub) produces a coherent plan in `docs/05_plans/` before execution (see §6).
8. **Overview ≠ memory scan.** For general project-status questions, rely on §1–§5 of this file and on
   your persistent memory index, if your agent keeps one; do **not** scan `docs/04_memory/` unless the user
   asks about a specific element (task, ADR, decision-log, bug, release) by ID or type, **or** when
   determining the overall project state — in that case prefer a targeted search on frontmatter fields
   (e.g. `grep -r "^status:" docs/04_memory/`, or `memory search`) rather than reading each file in full.
9. **State changes ⇒ update your persistent memory index.** If your agent keeps a memory index that
   persists across sessions (for example Claude Code's auto-memory, `~/.claude/projects/…/memory/MEMORY.md`),
   update it whenever a state change is detected or performed on any Memory element (task, ADR,
   decision-log, bug, release), so future sessions start with an accurate snapshot without re-scanning the
   directory.
