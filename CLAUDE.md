# CLAUDE.md — Agent entry point for the WingFoil project

This file orients any AI agent working in this repository: what the project is, where every piece of
information lives, and which workflows and directives to respect. Read it first; follow the links
rather than guessing.

---

## 1. What this project is

**WingFoil** is an open-source **harness for AI-assisted software development** that makes the process
**deterministic**: it gives humans and AI agents a structured, authoritative interface to a project
through five pillars — **Project Memory, Project DNA, Project Directives, Project Workflow, Interaction
Layer (CLI + MCP)**.

- **North Star:** the *Determinism Index* — two independent runs from the same specs + WingFoil config,
  using different AI agents, produce substantially equivalent software.
- **License:** MIT · **Distribution:** npm (public) · **Tech:** TypeScript / Node.js 22.12+.

> **Project status: implementation under way.** The release line `rl-v1` is `active`; **`minor-v0.1`
> and `minor-v0.2` are `released`** (`wingfoil@0.2.1` on npm) and the patch **`patch-v0.2.2` is
> `in-development`** (`docs/04_memory/planning/`). The
> repository carries a real implementation under `src/` — `core, validation, storage, memory, dna,
> directives, workflow, cli, mcp` — a packaged `wingfoil` CLI (`package.json` `bin` → `dist/cli.js`)
> and an MCP server (`wingfoil mcp`), all covered by a full Jest suite (`npm test`). Read, run, test and
> reason about `src/` as you would in any other codebase.
>
> **What is *not* built yet is a subset of what the specs describe (§6).** The self-configuration is
> hand-authored, but it now sits at the repository root, where the CLI reads it (§3). The command surface is derived mechanically from `CORE_MODULES`
> (`src/core/index.ts`) — today `dna show`, `dna set`, `dna add`, `dna update`, `dna remove`,
> `memory add` (with `--set <name>=<value>` for `id_pattern` tokens), `memory submit`, `memory approve`, `memory reject`, `memory deprecate`,
> `memory history`, `memory search`, `directive create`, `directive assign`, `directive remove`,
> `directives list`, `paths`, `workflow list`, plus the two bootstrap commands `init` and `mcp` — 20
> in all, each with an entry in `docs/cli-reference.md`. The **Memory state-transition verbs ship** as of `minor-v0.2`
> (P1.6–P1.9, P1.10); what is still missing is the **workflow engine** (§6). Check `CORE_MODULES`, or
> the release Memory, before assuming a command exists — and where the code and the specs in
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
| `docs/05_plans/`                          | **Phase plans** — the `plan` Memory type (§5), one per started workflow phase, nested by scope (`rl-v1/`, `rl-v1/rel-v0.2/`, …). `X_*.md` at the top level are grandfathered ad-hoc plans (dl-019)                                                                                                               |
| `src/`                                    | **The implementation.** One directory per `dna.yaml` module (§4) — `core, validation, storage, memory, dna, directives, workflow, cli, mcp` — plus `cli.ts`, the `bin` entry point                                                                                                                              |
| `test/`                                   | Jest suites, mirroring `src/` one directory per module, plus `docs/` (API-doc coverage gate) and `lint/` (the `lint.clean` gate)                                                                                                                                                                                 |
| `docs/design.md`                          | Index of the **documentary chain** Lean Inception → USM → BDD → SARD → backlog: where each phase lives, what it produces, and its stop-check                                                                                                                                                                     |
| `README.md`                               | The **user-facing** entry point (problem, pillars, personas, quick start) — the human counterpart to this file. Owned by the `user-docs` release gate's `align-user-docs` phase (dl-013); `CLAUDE.md` is owned by its `align-agent-docs` phase (dl-025)                                                        |
| `docs/user-guide.md`, `docs/cli-reference.md`, `docs/examples/`, `CHANGELOG.md` | **User documentation** for projects that *use* WingFoil: step-by-step guide, one entry per command (kept complete by `test/docs/cli-reference.test.ts`), runnable self-checking scripts, release notes. Produced by `align-user-docs` (dl-013) |
| `docs/agents.md`                          | Guide for AI agents working in a project that **uses** WingFoil — the document counterpart of the MCP server. Not for agents developing WingFoil (that is this file); in no phase's `produces:` (approver decision, `user-docs-rel-v0.2-plan` §10), though `user-docs` aligns it with the approver's confirmation (`user-docs-rel-v0.2.2-plan`) |
| `docs/assets/`                            | The **logo, mark, social-preview banners and organisation avatar** — SVG sources plus rendered PNGs, with the regeneration commands in its `README.md`. The uploaded images are recorded by `svc-001` (avatar) and `svc-004` (social preview) |
| `COLLABORATION.md`                        | How external contributors file **intent as Memory artifacts** rather than pull requests (`dl-020-contribution-model`)                                                                                                                                                                                           |

**Feature IDs** are `P<pillar>.<n>` (e.g. `P1.13`). **Requirement IDs** are `REQ-<AREA>-<nn>`.
Traceability chain: **feature (P*) → user story (US-*) → BDD scenario → SARD requirement (REQ-*) → task**.

---

## 3. WingFoil self-configuration (dogfooding)

WingFoil manages its own development. The config is hand-authored under `.wingfoil/` at the repository
root, and Memory **content** lives under `docs/04_memory/` (the `docs/04_memory/` paths in
`memory.yaml`, resolved against the repository root). `task-111` moved both there from `docs/self/`
with `git mv` (`bug-075`), so `wingfoil memory history --follow` keeps each element's history across
the move. Start from `.wingfoil/README.md`.

**Which build manages this repository.** A published, pinned build (`dl-095`, `task-112`): the
devDependency `"wingfoil-released": "npm:wingfoil@0.2.1"`, installed by `npm ci` with no build step.
Run it from the repository root as `npm run -s wingfoil -- <command>` (`-s` keeps npm's banner out of
JSON output). Do **not** use `npx wingfoil`: once `dist/` is built it runs this repository's own CLI.
The pin moves forward only, to published builds, through `release-planning`'s `advance-pinned-build`
phase. The same build's MCP server is registered in `.mcp.json`, and `npm run check:mcp` verifies it.

**Commands that run on this repository**, with the pinned build:
- the read commands answer on WingFoil's own configuration: `dna show`, `paths`, `directives list`,
  `workflow list`, `memory search`, `memory history`;
- `memory submit`, `approve`, `reject` and `deprecate` write their `wf()` commits here;
- `memory add` works since `task-123` (`bug-156`), but 0.2.1 has no `--set` (`task-110`), so it
  adds only types whose id and path need no field token: `bug`, `adr`, `decision-log`, `tech-spec`,
  `service`.
  A `task`, `release`, `release-line` or `plan` is added with the build under development
  (`npm run build`, then `node dist/cli.js memory add … --set <name>=<value>`), or by hand, until the
  pin advances past 0.2.1;
- 0.2.1 also predates `task-109`, so its audit reads only `→` transition brackets.

Workflow execution does not exist yet (§6).

| File                                                       | Pillar                 | What it holds                                                                                                                                                                                        |
|------------------------------------------------------------|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `.wingfoil/dna.yaml`                                       | DNA (P2.4)             | Modules, **stacks** (technologies + methodologies), **team & roles**, resource paths (`conventions` removed in v1.1 — rules moved to `directives/custom/`; see spec-002)                              |
| `.wingfoil/memory.yaml`                                    | Memory (P1.13)         | Element **types** (`release-line, release, task, adr, decision-log, tech-spec, bug, plan, service`), per-type **state machines**, and per-type `template:` scaffolds                                          |
| `.wingfoil/memory/templates/`                              | Memory (P1.13)         | One Markdown scaffold per element type (`frontmatter.required` enforced on submit)                                                                                                                   |
| `docs/04_memory/planning/{id}.md`                          | Memory (P1.11)         | The **release-line** roadmap (one file per major version, e.g. `rl-v1.md`)                                                                                                                           |
| `docs/04_memory/planning/rl-{release-line}/{id}.md`        | Memory (P1.11)         | That release-line's **minor releases** (v0.1→v1.0 for `rl-v1`), derived from `docs/03_backlog/`                                                                                                      |
| `.wingfoil/directives/custom/`                             | Directives (P3.5/P3.8) | Rules: P3.8 template **stand-ins** (`code-quality, testing, code-review, architecture, security, documentation`) + WingFoil-specific (`determinism, doc-versioning, security-secrets, traceability, command-baseline, claim-evidence`) |
| `.wingfoil/roles.yaml`                                     | Directives (P3.2/P3.7) | Role → directive bindings                                                                                                                                                                            |
| `.wingfoil/workflows.yaml` + `workflows/custom/`           | Workflow (P4.1)        | `sw-life-cycle` (main) + sub-workflows + four ingest mains                                                                                                                                           |

> The tool now ships the official P3.8 **built-in** directive templates (`task-057`, `done`:
> `wingfoil init` installs them under `.wingfoil/directives/built-in/`), but this hand-authored config
> predates them and still keeps the six as stand-ins in `custom/` (`kind: custom`, `ref: [P3.8]`);
> reconciling the two is `bug-040`. `directives/built-in/` and `workflows/built-in/` hold nothing but a `.gitkeep` — they are
> reserved for assets shipped by the npm package (spec-011), which is why `built-in/` vs `custom/` is
> the structural discriminator REQ-SEC-07 keys removability on.

---

## 4. Project DNA — quick reference (`dna.yaml` is authoritative)

- **Modules:** `core, validation, storage, memory, dna, directives, workflow, cli, mcp-server` — all nine
  exist under `src/`, each at its `dna.yaml` `path:` (note `mcp-server` lives at `src/mcp`).
- **Stacks** (`stacks.technologies`): TypeScript · Node.js 22.12+ · npm · Commander.js (CLI) · MCP
  over stdio via `@modelcontextprotocol/sdk` · js-yaml (all git-backed YAML) · Zod (validation) · Jest
  (testing, coverage **>80%**) · TypeDoc (API-docs gate) · git storage · semver. ADR-004 framed the MCP
  server around the Anthropic SDK; it was built on `@modelcontextprotocol/sdk` instead. `task-117`
  (`bug-138`) removed the two runtime dependencies nothing in `src/` imported, `@anthropic-ai/sdk` and
  `chalk`, and `test/cli/runtime-dependencies.test.ts` keeps it that way. Both still appear in
  `package-lock.json` as dev-only transitive dependencies (the SDK of the pinned `wingfoil-released`
  build, `chalk` of the test toolchain).
  **Methodologies** (`stacks.methodologies`): Lean Inception · User Story Mapping · Specification by
  Example (BDD) · SARD · TDD.
- **Roles:** `developer, reviewer, qa, architect, product-owner, tech-lead, facilitator, approver`.
  AI agents execute as `developer/reviewer/qa/architect` and **never hold approval authority** — all
  approvals route to the `approver` role (the human, Roberto).
- **Paths:** query categories `sources, tests, docs, config, governance` (`dna.yaml` `paths:`).

---

## 5. Memory model (`memory.yaml`)

State is **derived from each document's frontmatter** — there is **no `.wingfoil/state/` index**
(REQ-SYS-03). Every transition is validated against the type's state machine (REQ-STATE-01): the engine
is real and tested (`resolveTransitionTarget` / `validateFrontmatterState`, `src/memory/state-machine.ts`),
and the CLI verbs that drive it ship (§5.1). Since `task-111` moved the configuration to the
repository root, the verbs run on *this* repository's own Memory (`bug-075`), `memory add` included since
`task-123` (`bug-156`), with the limits of the pinned build given in §3. Whenever you edit WingFoil's own frontmatter by hand, the validation is
your responsibility.

Each type's machine is encoded in `memory.yaml` as `sequence` (the ordered forward chain) + `gates`
(per-state `{state: {reject: target}}`, meaning that state's forward edge needs `approve` rather than
plain `submit`) + `waiting` (states advanced only by a workflow/engine action, no CLI verb) — see
`spec-001-memory-yaml-schema` (initial-design, rl-v1) for the full schema. This replaced an earlier
`transitions` dict-of-arrays encoding; the practical effect on the **default** machine and on `adr`/
`tech-spec` is that `reject` now lands directly back on `draft` — there is **no separate `rejected`
status** anymore anywhere (the rejection reason still lives in the git commit body, per P1.7, just not
as a status value). `task` already worked this way; `decision-log` now has its own custom machine
(previously it used the plain default) per `dl-012-decision-log-state-machine`.

| Type           | Path (resolved against the repository root)        | State machine (forward chain; `reject` targets in parentheses)                         |
|----------------|---------------------------------------------------|-------------------------------------------------------------------------------------------|
| `release-line` | `docs/04_memory/planning/{id}.md`                  | draft→planning(→draft)→active→done (·→deprecated)                                       |
| `release`      | `docs/04_memory/planning/rl-{release-line}/{id}.md` | draft→planning→in-development→releasing→released (·→deprecated)                          |
| `task`         | `docs/04_memory/{release}/{id}.md`                 | draft→pending(→draft)→backlog→in-progress→in-review(→in-progress)→approved→done          |
| `adr`          | `docs/04_memory/design/adrs/{id}.md`               | draft→pending(→draft)→accepted→superseded                                                |
| `decision-log` | `docs/04_memory/design/dls/{id}.md`                | draft→in-discussion(→draft)→ready (·→deprecated)  [in-develop/done removed per dl-017]   |
| `tech-spec`    | `docs/04_memory/design/specs/{id}.md`              | draft→pending(→draft)→approved→superseded (mirrors `adr`)                                |
| `bug`          | `docs/04_memory/bugs/{id}.md`                      | draft→open(→closed)→triaged(→closed)→planned(→closed)→in-progress→in-review(→in-progress)→resolved(→in-progress)→closed |
| `plan`         | `docs/05_plans/{scope}/{id}.md`                    | draft→active→done (·→deprecated)  [dl-019 — phase-plan execution scaffold; `X_*` grandfathered]        |
| `service`      | `docs/04_memory/services/{id}.md`                  | draft→pending(→draft)→active (·→deprecated)  [dl-088 — external state; never a secret value; approve = the approver ran `verify`] |

---

## 5.1. Memory operations — commit format

Each operation produces **exactly one git commit**, scoped to **one element type**, with a fixed,
non-overlapping scope. Never conflate operations or batch content across multiple operations into a
single commit. Subject line convention — **present-tense verb**, matching the operation name exactly:

```
wf({type}): {add|submit|approve|reject|deprecate} {id1}, {id2}, ...
```

Worked example (two separate commits): `wf(release-line): add rl-v1` then `wf(release-line): submit rl-v1`.

> **All five operations ship, and since `task-111` they run on this repository too.** `memoryAdd`, `memorySubmit`,
> `memoryApprove`, `memoryReject` and `memoryDeprecate` are all registered in `CORE_MODULES`
> (**P1.6–P1.9**), delivered by `task-045` through `task-048` in `minor-v0.2`, alongside the read-only
> `memory search` and `memory history` (**P1.10**). Run `wingfoil memory --help` rather than trusting
> this paragraph.
>
> Until `task-111`, every operation on *WingFoil's own* Memory was done **by hand**, for a structural
> reason: the configuration lived under `docs/self/.wingfoil/` while the CLI resolves it from the git
> root, so no verb could be aimed at the documents (`bug-075`). The configuration and the Memory are
> now at the root (`.wingfoil/`, `docs/04_memory/`). `memory add`, `submit`, `approve`, `reject`
> and `deprecate` work on this repository's documents and write the commit format below, through
> the pinned build `npm run -s wingfoil -- memory <verb>` (§3, which also gives the types 0.2.1
> cannot add). The
> practised verbs the CLI does not have (`start`, `finalize`, `sync`) are still written by hand in the
> same format. Approvals and rejections run only on the approver's instruction, whether by verb or by
> hand (§8).
>
> The commit *format* below is the contract either way — it is what the verbs emit and what
> `wingfoil memory history` reads back — so follow it exactly, and keep each operation to its own
> commit. Note the practised grammar has grown verbs this section does not declare (`start`,
> `finalize`, `sync`, roughly a third of all `wf()` commits); whether they are ratified or corrected is
> `dl-079`, `in-discussion`.

### The `Reason:` block — the shape every reason must have

`approve`, `reject` and `deprecate` all record a `Reason:`; `submit` and `add` record none. Its shape is
**declared**, not free-form (`dl-067-reason-trailer-contract`, `ready`; `spec-008-cli-grammar` §2), and
the rule is the same whether the commit is written by `wingfoil memory <verb>` or by hand:

- **A reason is a block, and it may span lines.** `Reason:` carries the remainder of its own line plus
  every following body line, up to (exclusive) the commit's trailing trailer paragraph
  (`Co-Authored-By:` and friends) or the end of the body. Multi-paragraph reasons are normal here — 79
  of the 171 approve/reject commits `dl-067` counted on `main` had one — and `wingfoil memory history` now reads all of it.
- **It may never be blank.** An empty or whitespace-only reason leaves a bare `Reason:` that no reader
  can parse; the CLI refuses it at exit `2` on every verb that takes `--reason`, `deprecate` included.
- **No line of a reason may begin with `Approver:` or `Reason:`.** Such a line is indistinguishable
  from the trailer itself, and on `deprecate` — which writes no `Approver:` line of its own and
  performs no authority check — one would make `memory history` report an approval that never
  happened. Ordinary `Key: value` prose (`Action: amend spec-015 §3`) is fine; only those two keys are
  reserved.
- **A reason may not END with a paragraph made entirely of `Key: value` lines**, because a reader
  cannot tell it from the commit's own trailer block. Add a closing sentence, or fold the lines into
  prose.
- **Whitespace is normalized, and that is the contract.** Per-line trailing whitespace is stripped,
  runs of blank lines collapse to one, and leading and trailing blank lines are dropped — that much is
  git's own `cleanup=whitespace`, which `git commit -m` applies regardless. On top of it the tool
  trims the **first line's** leading whitespace, which git does not do: that line sits after
  `Reason: ` on the same physical line, and the reader consumes the key with its following whitespace.
  Interior indentation is preserved throughout. The result is that what a reader gets back is exactly
  what was declared, rather than approximately what was typed.

### `memory.add` — register a new element (draft)

1. Create the file at the path given by the type's `path` pattern (resolved against the repository
   root; see the §5 table).
2. Copy the type's `template.file` scaffold verbatim.
3. Fill in **only** the frontmatter skeleton:
  - `id` — generated from the type's `id_pattern` (e.g. `task-109-validation-id-engine`).
  - Any field the `add` action itself pins (e.g. `version` when the workflow action is
    `memory.add(type: release-line, version: "v1")`) — everything else stays at template defaults.
  - `status: draft` — fixed at this step.
4. Leave `title` empty and the **body as template placeholder comments** — no content written yet
   (unless the add action itself sets `title`).
5. Commit message (subject only, no body):
   ```
   wf({type}): add {id1}, {id2}
   ```
6. The commit contains **only** the new file(s) — no other changes.

### `memory.submit` — fill content and move to the next state

1. Fill in **all** required frontmatter fields (`template.frontmatter.required` for the type in `memory.yaml`).
2. Write the **full body content** — replace every template placeholder comment with real text.
3. Move `status` to the type's post-submit state — `draft → pending` for the default machine and most
   types; `draft → planning` for `release`/`release-line`, whose own machines have no `pending` state
   (§5 table).
4. Commit message (subject only, no body):
   ```
   wf({type}): submit {id1}, {id2}
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
  - `Reason:` block — **mandatory** (`--reason` is a required argument per P1.7 Scenario 2; omitting
    it is an error), and it must have the shape the `Reason:` block section above declares — in
    particular it may span lines, but may never be blank and may never contain a line beginning
    `Approver:`.
4. If an approval ever *does* change an artifact outside Memory, that change belongs in the **same
   commit** — an approval and its side effect must not be separable. Note this has **not yet happened**:
   no `wf(…): approve` commit in this repository's history touches anything outside the Memory
   folder (`docs/self/docs/04_memory/` until `task-111`, `docs/04_memory/` since). In particular,
   **do not** add the task to the per-release backlog JSON
   under `docs/03_backlog/04_backlog/by-release/` when it reaches `backlog` — that JSON is an output of
   the `backlog-export` sub-workflow from the *specification* phase (`docs/design.md` phase 4), read as
   a source and cited by each release's `requirements:` frontmatter field; `release-planning`'s
   `build-backlog` / `commit-backlog` phases declare no action and no `produces:` under
   `docs/03_backlog/`, and that directory has exactly one commit in the whole history (its initial
   import).
5. Agents may execute `memory.approve` **only when explicitly instructed** by the `approver` role (Roberto);
   agents never approve autonomously (§4, §8).

### `memory.reject` — send back for revision

Same evidentiary requirement as `memory.approve` (P1.7): approver identity + reason, both explicit in
the commit message (the timestamp comes from the git commit itself).

1. Change the `status` field to the type's reject target, per `memory.yaml`'s `gates` block for
   that state — e.g. `pending → draft` for the default machine, `task`, `adr`, and `tech-spec` alike
   (none of them has a separate `rejected` status); `in-discussion → draft` for `decision-log`;
   `open/triaged/planned → closed` or `in-review/resolved → in-progress` for `bug` (§5 table). At the same time, set
   the document's `rejection_reason` frontmatter field to the `--reason` text given to the reject
   command — this is in addition to the reason already recorded in the commit body below; the
   frontmatter copy is a convenience so the reason is visible without walking git history, and it
   carries the **same** text as the `Reason:` block, normalized identically (the two sinks are fed
   from one rule, so they cannot disagree about what the reason was). A later `memory.submit` on this
   document clears `rejection_reason` again (it reflects only the most recent reject, not a history).
2. Commit message format — subject + mandatory body:
   ```
   wf({type}): reject {id1}, {id2} [{old-state} → {new-state}]

   Approver: {full name} <{email}> ({role})
   Reason: <what needs to change before resubmitting>
   ```
3. Agents may execute `memory.reject` **only when explicitly instructed** by the `approver` role — same
   restriction as `memory.approve` (§4, §8).

### `memory.deprecate` — retire an element

Callable from any state, on any type (§5). Not an approval gate — no `Approver:` line required — but a
`Reason:` keeps the audit trail meaningful. Precisely **because** this verb writes no `Approver:` line
and runs no authority check, it is the one where a trailer-shaped reason would forge an approval
record: the `Reason:` block rules above apply here in full, and a reason that is given must be
non-blank (`--reason` itself stays optional, `dl-027`).

1. Change **only** the `status` field to `deprecated` — for **every** type, `adr`/`tech-spec`
   included. `deprecated` is a reserved implicit wildcard target, legal from any state and never
   declared in a machine (spec-001; `src/memory/schema.ts` rejects a machine that declares it), so it
   is what the shipped `wingfoil memory deprecate` writes and what a hand-made retirement must write
   too — otherwise the same operation yields a different state by hand than through the tool.
   **`superseded` is not a deprecate target**: `memory.yaml` declares it a `waiting` edge
   (`adr`/`tech-spec`: `waiting: [accepted]`), i.e. a state no CLI verb may assign, reached only by a
   later element's `supersedes:`. That engine trigger does not exist yet (`grep -rn supersedes src/`
   → nothing), so **no element should be moved to `superseded` by hand at all** until it does; retire
   the replaced one with `deprecate` and name its replacement in the `Reason:`.
2. Commit message format — subject + optional body:
   ```
   wf({type}): deprecate {id1}, {id2} [{old-state} → deprecated]

   Reason: <why deprecated, e.g. "superseded by adr-004">
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
      `plan-next-release-line` (closes this release-line to `done`, self-seeds the next one once
      every one of its releases is `released`).
        - `delivery` → `release-cycle` *(iterate_over: release, scoped to this release-line)* →
          `release-planning` *(`advance-pinned-build` → `define-scope` → `triage-bugs` →
          `reconcile-governance` → `record-adrs` → `identify-specs` → `build-backlog` →
          `commit-backlog`; the two sweeps added by dl-016, the pinned-build step by dl-095)* →
          `dev-loop` *(design gate + TDD,
          iterate_over: task; `refactor` runs coverage + API-docs + `lint.clean`; review gate runs unit
          + **BDD** tests; keeps a fix task's source `bug` in sync via `bug.sync_state`)* → `user-docs`
          *(dl-013 — `align-user-docs`, the user-facing documentation gate; dl-025 — `align-agent-docs`,
          this file, `.wingfoil/README.md` and `.wingfoil/WORKFLOW.md`)* → `e2e-smoke`
          *(dl-023 — fresh-init + CLI end-to-end smoke gate, plus the `mcp-registration` check of `.mcp.json`)* → `release-submit` → `release-publishing` → `retrospective`.
    - `sunset` → `end-of-life`.
- **`bug-ingest`, `decision-log-ingest`, `adr-ingest`, `service-ingest`** — capture a single element on demand. If started
  while another workflow with an active `element` is running, the new file **inherits that element**
  (e.g. a bug raised during `dev-loop` inherits the active `task`).

Phase completion is **deduced** (no stored `status:`): Memory-backed phases from element status,
spec/doc phases from the existence of their `produces:` artifacts.

> **Interim — no workflow engine yet (still true):** the `wingfoil` CLI exists, but it cannot *run* a
> workflow — `workflow list` is the only workflow operation in `CORE_MODULES`, and it is read-only.
> There is no `workflow start`, no phase execution, no `checks` runner. So whenever you are asked to
> **start a workflow** (main *or* sub), first **write a plan file** under `docs/05_plans/` that is
> coherent with that workflow definition — its phases, roles, `actions`, `produces:`, and `checks` —
> then execute against that plan. Use `docs/05_plans/X_wingfoil-init-plan.md` (for `wingfoil-init`) or
> `docs/05_plans/rl-v1/initial-design-rl-v1-plan.md` (for `initial-design`) as the model.
>
> Since `dl-019`, a phase plan is itself a **`plan` Memory element** (`memory.yaml` `plan` type; path
> `docs/05_plans/{scope}/{id}.md`; `draft → active → done`) — register it with `memory.add(type: plan)`
> when a phase starts. Existing `X_*` ad-hoc plans are grandfathered (no frontmatter required).

---

## 7. Directives to respect (`roles.yaml`)

Bindings are by **role**, never by person (REQ-SYS-08).

| Role                   | Directives                                                                |
|------------------------|---------------------------------------------------------------------------|
| developer              | code-quality, testing, determinism, command-baseline                      |
| reviewer               | code-review, traceability, command-baseline                               |
| qa                     | testing                                                                   |
| architect              | architecture, determinism, traceability, command-baseline                 |
| product-owner          | traceability                                                              |
| tech-lead              | architecture, code-review                                                 |
| **global (all roles)** | doc-versioning, documentation, security, security-secrets, claim-evidence |

`command-baseline` states which state a command may read and write (`dl-080`, option (B));
`claim-evidence` states that a sentence asserting a fact about the code names the command that
establishes it. Both were written by `task-094` (`roles.yaml` v1.1). `task-133` bound `security`
globally (`dl-059`) — here the P3.8 stand-in `custom/security.md`, in an `init` scaffold the built-in —
which is why `roles.yaml` is at v1.2.

When executing under a role, **auto-load and obey that role's directives** (P3.6/P5.4.2).

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
- **Documentation versioning**: bump a doc's `version` only on the **first edit after it is committed**
  to git; update the date when bumping.
- **Security**: never commit credentials/secrets (everything in the config is git-versioned); MCP
  Resources are read-only — mutations only via validated MCP Tools.
- **Commits**: every state change is a git commit with author + timestamp.
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
   operations in `CORE_MODULES` ship as commands (§1). Before relying on a runtime feature, confirm it
   exists; if it doesn't, author the configuration/specs and do the step by hand per §5.1/§6.
7. **Starting a workflow ⇒ write its plan first.** Until `wingfoil` can run workflows, every workflow
   start (main or sub) produces a coherent plan file in `docs/05_plans/` before execution (see §6).
8. **Overview ≠ memory scan.** For general project-status questions, rely on §1–§5 of this file and
   the Claude Code auto-memory index; do **not** scan `docs/04_memory/` unless the user
   asks about a specific element (task, ADR, decision-log, bug, release) by ID or type, **or** when
   determining the overall project state — in that case prefer a targeted search on frontmatter fields
   (e.g. `grep -r "^status:" docs/04_memory/`) rather than reading each file in full.
9. **State changes ⇒ update auto-memory.** Whenever a state change is detected or performed on any
   memory element (task, ADR, decision-log, bug, release), update the Claude Code auto-memory index
   (`~/.claude/projects/…/memory/MEMORY.md`) to reflect the new state, so future conversations start
   with an accurate snapshot without needing to re-scan the directory.
