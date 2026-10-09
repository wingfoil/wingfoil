---
id: dl-164-governance-evolution-wingfoil-governs-the-change-of-its-own-governance-a-governance-change-is-a-memory-element-applied-through-a-governed-process-verified-traced-and-the-same-at-bootstrap-and-later
type: decision-log
title: "Governance Evolution: WingFoil governs the change of its own governance — a governance change is a Memory element, applied through a governed process, verified, traced, and the same at bootstrap and later"
status: in-discussion
context: "vision"
release: ""
contributor: ""
credit: ""
tmpl_version: 261006   # Orignal template version
---

## Context

The approver asked, on 2026-10-09, for a new first-level capability in the vision: **Governance Evolution**.
A project's governance is not a configuration defined once. It moves through a cycle:

> **Defined → Configured → Executed → Evaluated → Changed → Reconfigured**

and the reconfiguration can touch agents, roles, directives, workflows, checks and gates, the methodology, the
tools, QA and validation, and any other governance element. WingFoil must govern that evolution too. This does
**not** mean WingFoil changes itself arbitrarily. It means there are explicit, governed mechanisms to propose a
change, define it, apply it, verify the result, keep it traceable, and validate that the new governance is
coherent with the project. The approver also asked that the capability be built from what exists, not as a
parallel governance system.

**The first use case is the bootstrap.** The Initialization Template being designed in the `wingfoil-templates`
project (`wingfoil/wingfoil-templates`, the source of `dl-138`'s templates, listed by `dl-148`) turns a user's
intent into a configuration:

> **User Intent → Questions → Project Definition → WingFoil Configuration**

The user's answers produce the **initial** reconfiguration of the governance, from nothing to a first
configuration. The bootstrap is only the first case: the same capability must serve every later change, for the
whole life of the project.

Facts read on `main` at `1ce84a54` (`git rev-parse --short HEAD`), with the build under development
(`npm run -s build && node dist/cli.js`, `--version` → `0.2.2 (1ce84a54…)`).

**What a governance change is today, in the product.**
- **After `init`, the product's own advice is to edit the files and commit them.**
  `grep -n "already initialized" src/core/init.ts` → line 59: "to change its configuration, edit the files under
  .wingfoil/ and commit them, or use the wingfoil dna and wingfoil directive commands".
- **The configuration commands write one commit each, with no reason and no link to anything.**
  `grep -rnoE "wf\((dna|directive|workflow)\)[^'\`\"]{0,40}" src` finds the subjects `wf(dna): {verb} {field}
  [{value}]` (`src/core/index.ts:584`), `wf(directive): create`, `assign … to <role>` and `remove`
  (`src/core/index.ts:1897-2145`, `src/core/directive-assign.ts:363`). Neither `dna set --help` nor
  `directive assign --help` lists a `--reason` option: their options are `--force`, `--dry-run` and the value or
  directive and role.
- **No Memory type records a governance change.** `memory.yaml` declares nine types (`awk` over its `types:`
  block → `release-line release task adr decision-log tech-spec bug plan service`). None of them carries a
  baseline, a target configuration, or the result of a verification.
- **No check judges a configuration commit.** `scripts/check-governance.cjs` (`task-167`, the process
  conformance of `REQ-STATE-10`) states in its header that "configuration scopes (`wf(dna)`, `wf(directive)`,
  `wf(workflow)`) are not Memory operations and are skipped".
- **The vision has the seed, scoped to workflows.** `docs/01_vision/05_journeys.md` Journey 6, "Define and Evolve
  Workflow Configuration", ends at step 5 "Commit workflow changes to git" and step 6 "monitor execution". It has
  no evaluation of the result, no verification of coherence, and covers workflows only (the user story map's
  `07_workflow-config.md` follows it).
- **`init` is the only bootstrap, and it records no answers.** `node dist/cli.js init --help` offers one option,
  `--template <name>` (Scrum or Kanban). The questions of P5.1.1 (interactive wizard) and P5.4.5 (Agent-Assisted
  Init Wizard, v0.4 in `docs/01_vision/06_features.md`) leave no element behind: what was asked and answered is
  not in the repository.

**What a governance change is today, in this repository.**
- `git log --oneline -- .wingfoil docs/self/.wingfoil | wc -l` → `134` commits changed the configuration (the
  second path is its location before `task-111`). `git log --format=%s -- .wingfoil docs/self/.wingfoil | grep -c
  '^wf('` → `0`: not one of them is a governed operation. They ride on task commits: the most frequent prefixes
  are `docs(directives)` (13), `docs(config)` (9), `fix(workflow)` (7), `fix(memory)` (6) and `feat(memory)` (6).
- The decision behind a change lives, when it exists, in a decision-log or a task. The link from the changed file
  back to it is a citation in a comment or a commit body, which nothing checks.

**What already covers part of the cycle.** These are the pieces this decision reuses; it adds none of them twice.

| Cycle step | What exists |
|---|---|
| Defined | the vision and requirements (`docs/01_vision/`, `docs/02_requirements/`); the DNA (P2.4) |
| Configured | `wingfoil init` (P5.1.1); `dna`, `directive` commands (P2.1, P3.1–P3.3); the remote, pinned templates of `dl-138` |
| Executed | workflows (P4), agent runs (`dl-135`), the dev-loop gates |
| Evaluated | the retrospective (`retrospective.yaml`, `dl-115` outcomes), release-health (`dl-089`), process conformance (`REQ-STATE-10`), consumer feedback (`dl-163`) |
| Changed | decision-logs and tasks, by hand; for the vision, `dl-132`'s `change-proposal` (`task-212`, `backlog`, v0.3) |
| Reconfigured | a hand edit of `.wingfoil/` committed under a task |

The **Changed → Reconfigured** edge is the one with no element, no gate, no verification and no trace that a test
can follow. `dl-138` already names the problem for one case: its Q2 recommendation says "an update is a
governance change, so it must be explicit, reviewable and one audited commit, like every other WingFoil write".

## Decision

**Governance Evolution is a first-level capability of WingFoil.** The project's governance is versioned state,
and it changes only through a **governance change**: a Memory element that represents the change, is applied
through a governed process in one atomic commit, is verified for coherence and against the outcomes it
declares, and stays traceable from every configuration line it touched back to its reason. The bootstrap is the
first governance change, from an empty baseline; every later change uses the same element and the same process.

### 1. Scope: what "governance" is

Governance is **the configuration WingFoil reads to govern the project**: `dna.yaml` (modules, stacks, team,
roles, agents, paths), `roles.yaml`, the directives, `workflows.yaml` with its workflows and bindings (phases,
roles, actions, `checks`, approvals), `memory.yaml` with its types, state machines and templates, the methodology
templates, the pinned tools and remote sources (`dl-138`, `dl-095`). In short, everything under `.wingfoil/`,
plus any vendored remote content.

It is **not** the project's content: Memory documents change through their own state machines, and the vision
changes through `dl-132`'s `vision-change`. A change that touches both is two elements that cite each other.

### 2. The cycle, mapped onto WingFoil

| Step | Mechanism |
|---|---|
| **Defined** | vision, requirements, DNA: unchanged |
| **Configured** | the **apply** of a governance change (§4); the bootstrap is the first (§7) |
| **Executed** | workflows and agent runs, under the configuration in force at each commit |
| **Evaluated** | the retrospective reads every change applied in the release and records whether it reached its intent (§6) |
| **Changed** | a governance change is captured, analysed and accepted (§3) |
| **Reconfigured** | the change is applied and verified (§4, §5); the cycle starts again |

### 3. Representing a change (verifiable point 1)

A governance change records:
- **`origin`**: `bootstrap | retrospective | feedback | template-update | ad-hoc`, so the evaluation (§6) can
  tell where changes come from;
- **`baseline`**: the commit the change is analysed against (the empty tree for a bootstrap);
- **`targets`**: the configuration files and the entries in them (for example `roles.yaml: reviewer`,
  `workflows/custom/dev-loop.yaml: review`);
- **the intent**: what the change should achieve, in the project's terms;
- **the impact analysis**: which roles, directives, workflows and agents it affects, which **Memory elements**
  sit in a state the new machines no longer declare, and which **open workflow instances** sit on a phase that
  no longer exists (Journey 6's "in-flight tasks are unaffected" becomes a check, not a hope). An explicit "no
  impact" is allowed per layer, as in `dl-132` Q2 (ii);
- **`expected`**: the outcomes the change declares, as checks in the P4.12 vocabulary (`file.exists`,
  `frontmatter.required`, …) and as command assertions (for example "`directives list --role reviewer` lists
  `security`"). They are what §5 verifies.

**Q1 — the Memory type.**
- **(a)** `dl-132`'s `change-proposal`, with a third `kind: governance`. One way in for every change. But its
  machine ends at `scheduled` (assigned to a release), and machines are per type, not per kind (`REQ-SYS-04`), so
  apply and verify could not be states of it.
- **(b)** a new type, `governance-change`, with its own machine:
  `draft → in-analysis (reject → draft) → accepted → applied → verified (reject → accepted)`, plus `deprecated`
  as for every type. `in-analysis` is the acceptance gate; `applied` is reached only by the apply (§4);
  `verified` is the verification gate, whose reject reverts the change and sends it back to `accepted`.
  Its path is `docs/04_memory/governance/{id}.md`, its `id_pattern` `gc-{n}-{slug}`.
- **(c)** no new type: a decision-log for the decision, a task for the application, as today.

**Recommendation: (b).** It is the existing mechanism, not a new one: `REQ-SYS-04` lets a type with its own
machine be added by configuration alone. (a) cannot express apply and verify; (c) is the status quo of the
Context, with 134 configuration commits and no element. A change whose application needs code (a new check
verifier, for example) still gets a task, scheduled to a release like any other, and the governance change
cites it; the change is `applied` when that task's merge carries the configuration delta.

**Q1b — where the type is declared.** The type must exist **before** the first change, because the bootstrap
records one (§7). So it is declared in every `init` scaffold, like `plan`: a project cannot record its governance
changes otherwise. **Recommendation: in every scaffold**, and in this repository's `memory.yaml`.

### 4. Applying a change through a governed process (verifiable point 2)

- **One startable workflow, `governance-change`** (a main, per `dl-109`), with the phases
  **capture → analyse (⛔ accept) → apply → verify (⛔ approve) → evaluate**. `evaluate` is not run by this
  workflow: it is read by the next retrospective (§6). Until the workflow engine exists, it runs through a phase
  plan (`dl-019`), like every other main.
- **The apply is one atomic commit.** It holds the whole configuration delta **and** the element's
  `accepted → applied` transition, so the change and its record cannot be separated (`REQ-STATE-04`: a step's
  actions execute atomically, with no partial side effects).
- **Every commit that changes the configuration names its change** with a `Governance-Change: <id>` trailer.
  That covers the apply commit, a configuration command run as part of a change (a future `--change <id>` option
  on `dna`, `directive` and `workflow` commands), and the merge of a task that carries the delta.
- **Authority stays where it is.** Accepting (`in-analysis → accepted`) and verifying (`applied → verified`) are
  approvals by the `approver` role (`REQ-SEC-03`), with `Approver:` and `Reason:` (`REQ-SEC-04`). Agents may
  capture, analyse, apply and run the verification; they never accept or verify (P4.14, `REQ-SEC-03`).

**Q2 — the verb of the apply commit.** The commit grammar has eleven declared verbs (`spec-008` §2, `dl-079`),
and `scripts/check-governance.cjs` rejects any other.
- **(i)** a new verb `apply`: `wf(governance-change): apply <id> [accepted → applied]`, its body listing the
  touched files;
- **(ii)** reuse `sync`, the verb for a transition the engine performs.

**Recommendation: (i).** The act is not a sync of states, it is the change itself; a reader of `memory history`
should see "apply". It is added to `spec-008` §2 and to the check.

**Q3 — how strictly the trailer is required.**
- **(A)** every commit touching `.wingfoil/` must carry `Governance-Change:`; the governance check reports one
  that does not, in **warn mode first**, then as an error once this repository's own changes follow it (the ratchet
  `task-151` used);
- **(B)** advisory only.

**Recommendation: (A)**, for this repository and as the default policy of a project. A project may relax it in
its own configuration, because the policy is itself governance.

### 5. Verifying the result (verifiable point 3)

Verification has two layers, and both run at the `verify` phase, before the approver decides.
- **Coherence, the same for every change:**
  - every configuration file loads and passes its schema (the checks `REQ-SEC-10` applies to built-in templates,
    applied to the whole configuration), with its `format` key (`dl-149`);
  - every reference resolves: roles named by `roles.yaml`, workflows and approvals exist in the DNA team; every
    directive bound exists; every `include:` target, `role:`, Memory `type:` and check verifier a workflow names
    exists; every agent a role binds exists;
  - **no Memory element is orphaned**: every element's `status` is a state its type's machine declares
    (`REQ-STATE-01`), so a machine change that removes a state with live elements fails;
  - **no open workflow instance is orphaned**: every open instance's current phase still exists (`REQ-STATE-03`).
- **The declared outcomes**: every entry of the change's `expected` holds.

The result is recorded in the `verify` approval's `Reason:` (items checked, items failing), so it is part of the
audit trail. A failure is not approved: the change is reverted (one commit, with the trailer) and goes back to
`accepted`.

### 6. Keeping the change traceable, and evaluating it (verifiable point 4)

- **From the element:** `memory history <id>` lists add, submit, accept, apply, verify, with their reasons.
- **From a configuration file:** a future `governance log [path]` lists the changes that touched a file or an
  entry, read from the `Governance-Change:` trailers; until it exists, `git log --grep 'Governance-Change: <id>'`.
- **Over time:** the configuration in force at any commit is the one committed there, so the process conformance
  (`REQ-STATE-10`) already judges each commit against the configuration of its own time
  (`scripts/check-governance.cjs` reads "a type of the `memory.yaml` committed at that commit").
- **Evaluated:** the retrospective's `explore` reads every governance change verified in the release and records,
  with `dl-115`'s outcomes, whether its intent was reached. An evaluation that finds it was not may open a new
  governance change with `origin: retrospective`. That is how the cycle closes.

### 7. The same capability at bootstrap and later (verifiable point 5)

- **The bootstrap is governance change number one**, with `origin: bootstrap` and the empty tree as `baseline`.
  `init`, and the Initialization Template that drives it, write in the **same commit** the first configuration and
  that element, already at `applied`. Its body is the **Project Definition**: the user's intent, the questions
  asked and the answers given, and the template and version used. Recording the answers makes the bootstrap
  reproducible: the same answers with the same template version give the same configuration (`REQ-SYS-07`).
- **Its verification is the same `verify`**: the coherence layer, plus `expected` derived from the answers (for
  example "the team declares the roles the user named"). The person who ran `init` holds the `approver` role in
  the new DNA, so the first approval is theirs; an answer an agent inferred is approved before it is written
  (`REQ-SEC-09`).
- **Every later change uses the same type, the same workflow and the same check.** A template update (`dl-138`
  Q2 (i)) is a change with `origin: template-update`, whose apply is the three-way merge. A retrospective outcome
  that changes the configuration is a change with `origin: retrospective`. A consumer's request about process is a
  change with `origin: feedback` (`dl-163`).

### 8. Place in the vision

**Q4 — where the capability sits in `docs/01_vision/06_features.md`.**
- **(a)** a sixth pillar, **P6 — Governance Evolution**, with features P6.1–P6.7 (Actions, step 2);
- **(b)** features spread over the pillars they touch (the type in P1, the workflow in P4, `init` in P5);
- **(c)** an extra, X2, next to X1 Notifications.

**Recommendation: (a).** The approver asked for a first-level capability, and it acts on all five pillars at
once: spreading it (b) hides the one guarantee it gives, and an extra (c) reads as optional. The cost is that "five
pillars" is the product's identity in the product brief, the README and CLAUDE.md: the downcast changes the
wording to "five pillars, and the governance of their evolution" (or six, as the approver prefers), in one pass.

**Q5 — when it lands.**
- **(x)** v0.4: the vision and requirements downcast (through `vision-change` if `task-212` has landed, by hand
  under this decision-log otherwise), the `governance-change` type and template, the `governance-change`
  workflow, the `governance-evolution` directive, and the coherence check as a repository script and test. This is
  configuration plus one script. The CLI surface (`governance verify`, `governance log`, `--change`, `init`
  recording the bootstrap change) is scheduled by v0.4 release-planning to v0.4 or v1.0.
- **(y)** all of it in v0.4.
- **(z)** v1.0 or later.

**Recommendation: (x).** v0.4 already carries the bootstrap's features (P5.1.1 `--template`, P5.4.5 the
Agent-Assisted Init Wizard, P4.18–P4.20 templates) and `dl-138`'s remote templates, so the first use case lands
in the same release. Nothing is added to v0.3, whose dev-loop is in its last wave.

## Rationale

- **Governance that cannot change is abandoned; governance that changes without a record is not governance.**
  134 configuration commits in this repository, none of them a governed operation, show the second case on
  WingFoil itself.
- **Reuse, not a parallel system.** The capability is one Memory type (configuration only, `REQ-SYS-04`), one
  workflow composed like the others (`REQ-SYS-06`), one directive bound by role (`REQ-SYS-08`), one trailer, and a
  check that extends the existing governance check. Approval, reasons, history, the retrospective and the
  feedback loop are the existing ones.
- **An atomic apply is what makes it deterministic.** A change whose record and delta can be separated is a change
  that can be half-applied. One commit holds both, and the trailer makes every other configuration commit point
  at its change.
- **Verification has to know the live project, not only the files.** A schema check passes a machine that strands
  forty elements in a removed state. Checking elements and open instances against the new configuration is what
  turns Journey 6's "in-flight tasks are unaffected" into a test.
- **Recording the bootstrap's answers** makes the first configuration explainable and reproducible, which is the
  Determinism Index's own question applied to the configuration: same intent, same answers, same governance.
- **Declined:**
  - **WingFoil applying changes by itself** (for example from a retrospective finding, without acceptance): the
    approver ruled it out; the approval gates stay.
  - **A governance index file** listing the configuration in force: state is derived from git (`REQ-SYS-03`).
  - **Folding it into `change-proposal`** (Q1 (a)): see Q1.

## Actions

1. **Ratify, choosing Q1–Q5.** Owner: approver, at v0.4 `release-planning`'s `reconcile-governance` gate (or
   earlier, at the approver's choice).
2. **Vision** (the delta, one bump per document, `docs/01_vision/00_index.md` in the same commit):
   - `06_features.md`: Pillar 6 (per Q4), with
     - **P6.1** Governance Change element (`governance-change` type: origin, baseline, targets, intent, impact,
       expected), Infrastructure;
     - **P6.2** Governed application (one atomic apply commit; `Governance-Change:` trailer on every
       configuration commit), Feature;
     - **P6.3** `wingfoil governance verify` (coherence + declared outcomes), Command;
     - **P6.4** `wingfoil governance log [path]` (the changes that touched a file or an entry), Command;
     - **P6.5** Bootstrap as the first governance change (`init` and its templates record the Project
       Definition), Feature;
     - **P6.6** Governance evaluation in the retrospective, Feature;
     - **P6.7** The `governance-change` workflow and the `governance-evolution` directive, Infrastructure;
   - and the v0.4 / v1.0 rows of *Features by Release* per Q5;
   - `01_product-brief.md`, `02_product-vision.md`: the cycle and the principle ("WingFoil governs the evolution of
     its own governance; it never changes it on its own");
   - `03_is-isnot.md`: **is** "a process for changing the governance itself"; **is not** "self-modifying";
   - `05_journeys.md`: Journey 6 becomes "Define and Evolve the Project's Governance" (every governance element,
     with analyse, verify and evaluate steps); Journey 0a gains the bootstrap change;
   - `07_sequencer.md`, `08_mvp-canvas.md`: per Q5.
3. **Requirements:**
   - user story map: `07_workflow-config.md` follows Journey 6; `01_init-migrate.md` gains the bootstrap story;
   - BDD: `docs/02_requirements/02_bdd/features/p6-governance/`, one file per feature, with at least the five
     scenarios of *Verification* below;
   - SARD: **REQ-SYS-10** "Governance changes only through a governance change, recorded and applied
     atomically" (fit: every commit touching the configuration carries a resolvable `Governance-Change:`; an apply
     commit holds both the delta and the transition); **REQ-STATE-11** "Governance coherence after every change"
     (fit: zero unresolved references, zero orphaned elements, zero orphaned open instances); **REQ-SEC-13**
     "Governance changes are accepted and verified by role" (fit: the accept and verify transitions carry an
     `Approver:` holding `approver`, as `REQ-SEC-03`); the bootstrap clause added to **REQ-SEC-09**.
4. **Configuration of this repository:** the `governance-change` type and template in `memory.yaml`; the
   `governance-change` workflow in `workflows/custom/`, included by `workflows.yaml`; a global
   `governance-evolution` directive ("a change under `.wingfoil/` is made through a governance change") in
   `roles.yaml`; `.wingfoil/README.md` and `WORKFLOW.md`; `COLLABORATION.md` gains the type.
5. **Dogfooding:** the first configuration change of this repository after ratification goes through it, and so does
   the configuration delta of Actions 4 itself, once the type exists (the type is declared by hand, as
   governance change `gc-001`, `origin: ad-hoc`, baseline = the commit before it).
6. **Tasks are derived by v0.4 `build-backlog`**, not created here. The expected shape: (T-a) vision and
   requirements downcast; (T-b) type, template, workflow, directive; (T-c) coherence check script and its tests;
   (T-d) `apply` verb and the trailer in `spec-008` and the governance check; (T-e) `init` records the bootstrap
   change (with P5.1.1 / P5.4.5); (T-f) `governance verify` and `governance log`; (T-g) `--change` on the
   configuration commands; (T-h) `retrospective.yaml` reads verified changes; (T-i) template updates as changes
   (with `dl-138`'s update command).

## Verification

The five points the approver asked to be verifiable, each with the test that will hold it.

| # | Point | Test (to be written by the tasks of Actions 6) |
|---|---|---|
| 1 | A governance change can be represented | `add → submit → approve → apply → approve` walks the `governance-change` machine on a fixture with no source change (`REQ-SYS-04`); `memory submit` refuses a change with no `targets` or no `expected` |
| 2 | It is applied through a governed process | the apply commit contains both the configuration delta and `accepted → applied`; the governance check reports a configuration commit with no `Governance-Change:` (warn, then error); an apply by a non-approver is fine, an accept or verify by one is refused |
| 3 | The result can be verified | the coherence check reports each seeded defect on fixtures (dangling role, missing directive, missing `include:` target, a removed state with a live element, an open instance on a removed phase) and reports zero on this repository's configuration; a failing `expected` blocks `verify` |
| 4 | The change stays traceable | `memory history <id>` lists every step with its reason; `governance log .wingfoil/roles.yaml` (or the `git log --grep` interim) lists every change that touched it; the retrospective's record names every change verified in the release |
| 5 | The same capability at bootstrap and later | `init` in a temporary repository writes the configuration and `gc-001` (`origin: bootstrap`, `applied`) in one commit; `verify` passes on it; re-running the same answers with the same template version gives a byte-identical configuration; a second change on that repository uses the same type, workflow and check, and `governance log` lists both |

The BDD files of Actions 3 hold the same five points as acceptance scenarios, run at the dev-loop review gate.

## Relations

- **Origin:** approver request, 2026-10-09.
- **First use case:** the Initialization Template of the `wingfoil-templates` project (`dl-148`, `dl-138`).
- **Extends:** `dl-132` (the vision changes through `change-proposal`; the configuration through this);
  Journey 6.
- **Applies to:** `dl-138` (a template update is a governance change, Q2 (i)); `dl-115` and `dl-089` (the
  evaluation); `dl-163` (feedback about process enters as `origin: feedback`).
- **Related:** `dl-109` (startable workflows); `dl-019` (phase plans until the engine); `dl-079` and `spec-008`
  (the commit grammar gains `apply`); `dl-149` (the `format` key the coherence check reads); `dl-141` (project
  templates as a product direction).
- **Traces to:** P1.13, P2.4, P3.5, P4.1, P4.12, P5.1.1, P5.4.5; `REQ-SYS-03`, `REQ-SYS-04`, `REQ-SYS-06`,
  `REQ-SYS-07`, `REQ-SYS-08`, `REQ-STATE-01`, `REQ-STATE-03`, `REQ-STATE-10`, `REQ-SEC-03`, `REQ-SEC-04`,
  `REQ-SEC-09`, `REQ-SEC-10`, `REQ-STATE-04`.
