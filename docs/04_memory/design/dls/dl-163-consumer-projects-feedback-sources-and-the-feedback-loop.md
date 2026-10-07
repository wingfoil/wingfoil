---
id: dl-163-consumer-projects-feedback-sources-and-the-feedback-loop
type: decision-log
title: "Consumer projects' feedback sources and the feedback loop"
status: in-discussion
context: "retrospective"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 261006   # Orignal template version
---

## Context

Three projects use WingFoil to govern their own development: **WingFoil-UI**, **WingFoil-Templates** and
**WingFoil2-Benchmark**. While they work, they meet WingFoil's defects, gaps and missing features and write them
down. Today those notes have three problems that this repository can see from its own side:

- **They are unversioned and in three formats**, one per project, so no reader can tell which notes exist, which
  are new since the last read, or which a project has withdrawn.
- **Nothing here says where they are.** No element of this repository records that a consumer keeps notes about
  WingFoil, or how to read them; the `service` type (`dl-088`) records external state WingFoil depends on, but no
  consumer is registered as one.
- **The retrospective cannot read them.** `retrospective.yaml`'s `explore` mines the `## Execution Notes` of the
  release's own Memory documents; an input that lives outside the repository never enters it, and `dl-115`
  showed what happens to a proposal whose origin is outside the repository: it is not examined.
- **The projects never learn the answer.** When a note does become a WingFoil element, nothing tells the
  project which element or which release answered it, so the same note is raised again, or worked around for
  longer than needed.

The approver agreed on 2026-10-07 to close this loop by hand first, starting with the v0.3 retrospective, and
ruled the shape below.

Facts read on `main` at `25b513b8` (build under development, `node dist/cli.js --version` → `0.2.2 (25b513b8…)`):

- **`service` has a `kind` field, with six values, none for a feedback source.** `.wingfoil/memory.yaml`
  `service.template.frontmatter.required` is `[ title, provider, kind, owner_role, verify ]`;
  `.wingfoil/memory/templates/service.md` declares `kind: ""  # REQUIRED — account | credential | listing |
  setting | domain | handle`, as `dl-088`'s field table does. The values are a template comment, not code:
  `grep -rlnE "'(credential|listing|handle)'" src | wc -l` → `0`. In use:
  `grep -h '^kind:' docs/04_memory/services/*.md | sort | uniq -c` lists only `account`, `credential`, `listing`
  and `setting` over `svc-001`..`svc-017`.
- **No element type has a `reported_by`-like field.** `grep -rln 'reported_by' .wingfoil src docs/04_memory
  docs/02_requirements | wc -l` → `0`. The nearest fields are `dl-020`'s `contributor` and `credit`, free text,
  on the `bug`, `decision-log`, `adr` and `tech-spec` templates (`grep -n 'contributor' .wingfoil/memory/templates/*.md`);
  `bug` also has `release-origin` (`dl-016`, the release where it was found). None names a source a reader can
  check.
- **No consumer is registered, the benchmark included.** `grep -l -i benchmark docs/04_memory/services/*.md | wc -l`
  → `0`, although `dl-088` Actions lists "Register the benchmark repository as a `service` (v0.3; `dl-089`)" and
  `dl-089` (D01) ruled that "the rule keeping benchmark material out of this repository concerns the benchmark's
  **content**, not its existence".
- **`retrospective.yaml` is at version 1.3, with four phases.** `grep -n '^version\|  - name:'
  .wingfoil/workflows/custom/retrospective.yaml` → `version: 1.3` (1.3 is `task-199`'s), phases `explore`,
  `additional-points`, `capture`, `approve`. `explore` already `produces`
  `docs/06_retrospectives/rl-{release.release-line}/rel-{release.version}-friction-inventory.md`.
- **`docs/06_retrospectives/` does not exist yet.** `ls docs/06_retrospectives` → "No such file or directory";
  `git ls-tree -r --name-only HEAD | grep -c '^docs/06_retrospectives'` → `0`. The v0.3 retrospective creates it.
- **Two backlog tasks already revise `retrospective.yaml`.** `task-213` (B3: `### Retrospective` in the `task`,
  `bug` and `plan` templates; `explore` lists its secondary sources; `additional-points` gains a `checks.pre` that
  every proposal has one of `dl-115`'s four outcomes; version bumped) and `task-222` (B4: `explore` and
  `additional-points` read the release-health report; version bumped). Both `backlog`
  (`grep -m1 '^status:' docs/04_memory/v0.3/task-213-*.md docs/04_memory/v0.3/task-222-*.md`).
- **The pin is `wingfoil@0.2.2`.** `grep -n 'wingfoil-released' package.json` → `"wingfoil-released":
  "npm:wingfoil@0.2.2"`. `release-planning.yaml`'s `advance-pinned-build` phase (`dl-095` Q3 (B)) moves it.
- **No directive records the pinned build's behaviour.** `ls .wingfoil/directives/custom/` lists thirteen
  directives, none about the CLI; `roles.yaml` (v1.4) binds six globally: `doc-versioning`, `documentation`,
  `security`, `security-secrets`, `claim-evidence`, `git-conventions`.
- **Tags exist for the published releases only:** `git tag` → `v0.2.0 v0.2.1 v0.2.2`.

## Decision

**Every consumer keeps its notes about WingFoil in a versioned inbox; WingFoil registers each consumer as a
`service`, reads the inboxes at its retrospective, cites the note an element comes from, and publishes its answer
in this repository, where the consumer reads it.** The rulings (approver, 2026-10-07):

- **R1 — a versioned inbox.** Every consumer keeps `docs/wingfoil-feedback/` in its own repository, committed on
  its `main`, one file per note (R4).
- **R2 — existence may enter, content may not.** A WingFoil element may cite the consumer note it comes from as
  `<source key>/F-nnn` in a `reported_by:` field, and only when that consumer is registered here as a `service`
  (S3b). The existence of a consumer may enter this repository; its content may not: no prose, configuration or
  path of the consumer is copied here. A defect a note reports is **restated as a WingFoil defect and reproduced
  in this repository** before it becomes an element; the element stands on that reproduction, not on the note.
- **R3 — pull, never push.** WingFoil publishes its answer here: the elements that carry `reported_by:`, and one
  triage file per retrospective (S3d). Each consumer reads it and updates its own notes. WingFoil never commits
  into a consumer's repository.
- **R4 — one file per note**, so a note has one identifier (`F-nnn`), one status and one history.
- **R5 — consumers sync at their own release-planning and at every pin bump** of the WingFoil build they use.
- **R6 — triage outside the retrospective only for a patch.** A note may be triaged outside the retrospective only
  when the outcome is an urgent bug fix or feature in a **patch** release (`dl-092`; on a maintenance line,
  `dl-159`). Anything that changes a minor's or a major's scope waits for the retrospective.
- **R7 — no hold-out repository is a source.**
- **R8 — no product feature yet.** The loop runs by hand, through the configuration and the existing ingests,
  starting with the v0.3 retrospective. A product feature, if any, follows from what the hand runs show.

**Precondition.** Consumers read this repository's pushed `origin/main` and its release tags. `main` must be
pushed when the v0.3 retrospective lands, or the triage file and the elements it names are not there to read.

## Rationale

- **A versioned inbox is the only form a reader can check.** A commit gives every read a fixed point (R1, S3d's
  "commit read"), so "what was new since the last retrospective" is a `git diff`, not a recollection; one file
  per note (R4) makes each note citable and its status a frontmatter field.
- **Citing by key, not by content, keeps the `dl-089` boundary.** `dl-089` already ruled that a consumer's
  existence may be recorded here and its content may not. `reported_by:` carries only `<key>/F-nnn`; the key
  resolves to a registered `service`, whose `verify` proves the inbox is there. Restating and reproducing a
  defect here (R2) means every element stands on versioned ground in this repository, as `dl-115` requires of a
  proposal from a secondary source and `claim-evidence` of every fact.
- **Pull keeps WingFoil out of other repositories' histories** (R3). Committing into a consumer would need
  write access to it, would mix WingFoil's process into the consumer's audit trail, and would make WingFoil
  responsible for a repository it does not govern. A consumer that reads the published answer at its own pace
  (R5) decides how and when its notes change.
- **The retrospective is where a minor's or major's scope changes** (`retrospective.yaml` → the next
  release-planning). Triaging a note elsewhere would change scope outside its gate; the one exception (R6) is the
  one that cannot wait, a patch, which has its own release element (`dl-092` Q1 (A)).
- **By hand first** (R8), as `decision-log-ingest` and every other workflow ran before the engine: the formats
  settle on real notes before any code freezes them.
- **Declined:** a single shared issue tracker (moves content outside every repository's history and gives the
  consumers' notes no versioned form); copying notes into this repository (breaks R2 and `dl-089`); WingFoil
  writing the answer into each consumer (breaks R3).

## Actions

Each action becomes a task through normal triage and backlog; all four land **before the v0.3 retrospective**.
The coordinator plans their batches against the constraints given with each.

- **S3b — the registry.** A new `service` kind, `feedback-source`, in `memory.yaml`'s description, the
  `service` template's `kind` comment and `dl-088`'s field table. One `svc-*` per consumer, through
  `service-ingest`: `provider: GitHub`, `owner_role: approver`, `verify` = `git ls-remote <url> main` plus
  `docs/wingfoil-feedback/README.md` present at that commit; the body gives the source key (`ui`, `templates`,
  `benchmark`), the URL, the branch and the inbox path. A consumer is registered **only after it has versioned
  its inbox**; none has yet. *Constraint:* touches `memory.yaml` and the `service` template; `memory.yaml` has a
  single writer per batch (`task-212` B4, `task-217` B5, `task-230` B6, per `dev-loop-rel-v0.3-plan`'s W3 table),
  so S3b goes in a batch with no other `memory.yaml` writer.
- **S3c — `reported_by:`.** A field, a list of `<key>/F-nnn`, on the `bug`, `decision-log`, `adr` and
  `tech-spec` types (template and `memory.yaml`), checked against the `active` `feedback-source` services' keys,
  and kept through `memory amend`. *Constraint:* same `memory.yaml` rule as S3b; the `bug` template is also
  written by `task-213` (B3), so S3c follows it.
- **S3d — `retrospective.yaml`, a `collect-feedback` phase.** The next version after the bumps of `task-213` and
  `task-222` (the file is at 1.3 today). A new **read-only** phase between `explore` and `additional-points`:
  - it reads every `active` `feedback-source` at its `main` (the remote, or a local checkout recorded per
    machine) and records the commit it read;
  - it lists the notes in status `open`, the `needs-info` notes the consumer has since answered, and the
    `captured` notes whose elements shipped in the release being closed;
  - it proposes one outcome per note: `already-resolved`, `extends-element`, `new-element` (`bug`,
    `decision-log`, `adr` or `tech-spec`, reproduced here first, R2), `duplicate`, `declined`, `needs-info`;
  - the approver rules in `additional-points`; `capture` runs the ingests;
  - it produces `docs/06_retrospectives/rl-{release.release-line}/rel-{release.version}-feedback-triage.md`: a
    fixed table, one row per note (cite, commit read, decision, elements, target release, reason), never
    rewritten after the retrospective is approved, and never holding a consumer's configuration, paths or prose.

  *Constraint:* after `task-213` and `task-222`, or as an amendment of `task-213` if the approver prefers.
- **S3e — a `wingfoil-cli` directive.** A custom directive bound **globally** in `roles.yaml`, for the pinned
  `wingfoil-released@0.2.2`: each surprise of the pinned release the team works around, with its workaround and
  the WingFoil element that fixes it. Rules: run the pinned CLI; use the verbs, not hand edits; record every
  surprise; no silent workaround; re-check every entry at each pin advance (`advance-pinned-build`, `dl-095`).
  This repository keeps **no inbox**: a defect of WingFoil found here goes straight to `bug-ingest`.
  *Constraint:* needs the `roles.yaml` global binding, so after `task-205` (B3, the batch's only `roles.yaml`
  writer).

## Relations

- **Builds on:** `dl-088-a-memory-type-for-state-that-lives-outside-the-repository` (the `service` type, its
  `kind`, `verify` and `owner_role`; S3b adds a kind); `dl-089-release-health-analyses-before-retrospective`
  (existence, not content, of a consumer may enter this repository); `dl-115-retrospective-notes-written-during-the-release`
  (a proposal from a secondary source gets an explicit disposition before a gate); `dl-020-contribution-model`
  (`contributor`/`credit`, which `reported_by:` complements: one credits a person, the other cites a note).
- **Related:** `dl-019-plans-as-memory-element` (this ingest's plan); `dl-095-which-wingfoil-build-develops-wingfoil`
  (the pin S3e describes and re-checks at `advance-pinned-build`); `dl-092-tracking-a-patch-after-its-minor-is-released`
  and `dl-159-patch-a-released-minor-on-a-release-x.y-branch-merged-forward-into-main-alongside-the-next-minor-on-main`
  (the patch releases R6 allows); `dl-132-vision-change-and-feature-ingest` (a note asking for a new feature enters
  through that process, not as a bare element).
- **Interacts with:** `task-213` and `task-222` (`retrospective.yaml`, the `bug` template), `task-205`
  (`roles.yaml`), `task-212`, `task-217`, `task-230` (`memory.yaml`); `dl-147` and `dl-148` (`in-discussion`),
  which cite or describe consumer projects and are read against R2 at their ratification.
- **Traceability:** P1.13 (Memory element schema: the `service` kind, the `reported_by:` field), P1.11 (Memory
  entries), P3.5 and P3.7 (a custom directive bound by role), P4.1 (workflow configuration: `retrospective.yaml`);
  REQ-SYS-01 (git-backed single source of truth: answers are published here), REQ-SYS-08 (bindings and owners by
  role), REQ-SEC-08 (a `service` never holds a secret).
