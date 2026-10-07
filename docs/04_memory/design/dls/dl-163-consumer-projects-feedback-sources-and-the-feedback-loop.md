---
id: dl-163-consumer-projects-feedback-sources-and-the-feedback-loop
type: decision-log
title: "Consumer projects' feedback sources and the feedback loop"
status: ready
context: "retrospective"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 261006   # Orignal template version
---

## Context

Three projects use WingFoil to govern their own development: **WingFoil-UI**, **WingFoil-Templates** and
**WingFoil2-Benchmark**. While they work, they meet WingFoil's defects, gaps and missing features and write them
down. Seen from this repository, those notes have four problems:

- **They are unversioned and in three formats**, one per project, so no reader can tell which notes exist, which
  are new since the last read, or which a project has withdrawn.
- **Nothing here says where they are.** No element of this repository records that a consumer keeps notes about
  WingFoil, or how to read them. The `service` type (`dl-088`) records external state WingFoil depends on, but
  no consumer is registered as one.
- **The retrospective cannot read them.** `retrospective.yaml`'s `explore` mines the `## Execution Notes` of the
  release's own Memory documents. An input that lives outside the repository never enters it, and `dl-115`
  showed what happens to a proposal whose origin is outside the repository: it is not examined.
- **The projects never learn the answer.** When a note does become a WingFoil element, nothing tells the
  project which element or which release answered it. So the same note is raised again, or worked around for
  longer than needed.

The approver agreed on 2026-10-07 to close this loop by hand first, starting with the v0.3 retrospective, and
ruled the shape below.

Facts read on `main` at `25b513b8`. `node dist/cli.js` is the build under development (`--version` →
`0.2.2 (25b513b8…)`). `npm run -s wingfoil --` is the pinned build (`--version` → `0.2.2`).

- **`service` has a required `kind` with six values, and none of them is a repository.**
  `.wingfoil/memory.yaml` `service.template.frontmatter.required` is `[ title, provider, kind, owner_role, verify ]`.
  `.wingfoil/memory/templates/service.md` declares `kind: ""  # REQUIRED — account | credential | listing |
  setting | domain | handle`, as `dl-088`'s field table does.
  - The values are a template comment, not code: `grep -rlnE "'(credential|listing|handle)'" src | wc -l` → `0`.
    Declared value sets are not enforced anywhere (`bug-195`, `triaged`, release `v0.4`).
  - In use, `grep -h '^kind:' docs/04_memory/services/*.md | sort | uniq -c` lists only `account`, `credential`,
    `listing` and `setting`, over `svc-001`..`svc-017`.
- **No element type has a `reported_by`-like field.** `grep -rln 'reported_by' .wingfoil src docs/04_memory
  docs/02_requirements | wc -l` → `0`.
  - The nearest fields are `dl-020`'s `contributor` and `credit`, both free text, on the `bug`, `decision-log`,
    `adr` and `tech-spec` templates (`grep -n 'contributor' .wingfoil/memory/templates/*.md`). `COLLABORATION.md`
    `## Credit` explains them.
  - `bug` also has `release-origin` (`dl-016`, the release where it was found).
  - None of these names a source that a reader can check.
- **No consumer is registered, and that includes the benchmark.**
  `grep -l -i benchmark docs/04_memory/services/*.md | wc -l` → `0`. Two earlier decisions already expect a
  registration: `dl-088` Actions lists "Register the benchmark repository as a `service` (v0.3; `dl-089`)", and
  `dl-089` (D01) ruled that "the rule keeping benchmark material out of this repository concerns the benchmark's
  **content**, not its existence".
- **`retrospective.yaml` is at version 1.3 and has four phases.** `grep -n '^version\|  - name:'
  .wingfoil/workflows/custom/retrospective.yaml` → `version: 1.3` (set by `task-199`), with phases `explore`,
  `additional-points`, `capture` and `approve`. `explore` already `produces`
  `docs/06_retrospectives/rl-{release.release-line}/rel-{release.version}-friction-inventory.md`.
- **Two backlog tasks already revise `retrospective.yaml`.** Both are `backlog`
  (`grep -m1 '^status:' docs/04_memory/v0.3/task-213-*.md docs/04_memory/v0.3/task-222-*.md`).
  - `task-213` (B3) adds `### Retrospective` to the `task`, `bug` and `plan` templates, and gives
    `additional-points` a `checks.pre` that every proposal has one of `dl-115`'s **four** outcomes.
  - `task-222` (B4) makes `explore` and `additional-points` read the release-health report.
- **`docs/06_retrospectives/` does not exist yet, and three paths share the number 06.**
  - `ls docs/06_retrospectives` → "No such file or directory".
  - `grep -rhoE 'docs/06_[a-z_-]+' .wingfoil docs/04_memory docs/05_plans | sort | uniq -c` →
    `docs/06_health` (5), `docs/06_retrospectives` (10), `docs/06_runs` (10). `docs/06_runs/` is declared in
    `.wingfoil/dna.yaml`.
  - That numbering clash is a separate follow-up and is not settled here.
- **`release: "v0.4"` elements today:** 39 bugs (38 `triaged`, 1 `closed`) and 4 decision-logs (3 `ready`, 1
  `in-discussion`). There are no adrs, specs or tasks, and no `docs/04_memory/v0.4/` folder. Established by
  `grep -l '^release: *"v0.4"' docs/04_memory/<folder>/*.md`, then `grep -m1 '^status:'` on each file.
- **The pin is `wingfoil@0.2.2`.** `grep -n 'wingfoil-released' package.json` →
  `"wingfoil-released": "npm:wingfoil@0.2.2"`. `release-planning.yaml`'s `advance-pinned-build` phase
  (`dl-095` Q3 (B)) moves it.
- **What the pinned 0.2.2 cannot do today.** This is why Memory operations in this repository use the code build
  (S3e). Each fact below was established by running the pinned build from the repository root:
  - `npm run -s wingfoil -- memory --help` lists `add`, `approve`, `deprecate`, `history`, `reject`, `search`,
    `submit`. There is no `amend` (`memory amend x` → "error: unknown command 'amend'", exit 2) and no `park`
    (`memory park x` → exit 2; `park` at top level → exit 2).
  - `memory add --dry-run …` → "error: unknown option '--dry-run'", exit 2.
  - `workflow list` → exit 1, `E_VALIDATION … initial-design.yaml: Invalid input: expected string, received
    object` on the object form of `produces:`. The build under development lists the same files with exit 0.
    `bug-292` records the same failure in the pinned MCP server.
  - `memory add --type task --set release=v0.3`, run on a throwaway clone at `25b513b8`, allocated
    `task-144-…`. The build under development allocates `task-269-…`, and `task-144` is already taken. This is
    `bug-162` (per-release counter) and `bug-087` (numbers derived from the working tree). Both are `closed`,
    fixed by `task-128` (`done`), but the fix is not in 0.2.2.
  - A `bug` add on the same clone allocated `bug-299` with both builds: the fault shows in per-release folders
    and gapped sequences, not in every type.
- **No bug is tagged as a pinned-build surprise.** `grep -rln '^tags:.*pinned' docs/04_memory | wc -l` → `0`.
- **The rule on which build runs the Memory operations.** On 2026-09-30, `dev-loop-rel-v0.3-plan` ("Which build
  runs the Memory operations") ruled that task sessions and later phases use the build under development
  (`node dist/cli.js`). That ruling is session practice: `dl-095` and the pin are unchanged. S3e makes it a
  directive.
- **No directive records the pinned build's behaviour.** `ls .wingfoil/directives/custom/` lists thirteen
  directives, and none is about the CLI. `roles.yaml` (v1.4) binds six directives globally: `doc-versioning`,
  `documentation`, `security`, `security-secrets`, `claim-evidence`, `git-conventions`.
- **Tags exist for the published releases only:** `git tag` → `v0.2.0 v0.2.1 v0.2.2`.

## Decision

**Every consumer keeps its notes about WingFoil in a versioned inbox. WingFoil registers each consumer
repository as a `service`, reads the inboxes at its retrospective, restates each note it takes up as a
self-contained element, and publishes its answer in this repository, where the consumer reads it.** The approver
gave these rulings on 2026-10-07:

- **R1 — a versioned inbox.** Every consumer keeps `docs/wingfoil-feedback/` in its own repository, committed on
  its `main`, with one file per note (R4) and a `README.md` that `verify` checks (S3b).
- **R2 — provenance, never content.**
  - **What may be cited.** A WingFoil element may cite the consumer note it comes from in a `reported_by:` field
    as `<service id>/F-<nnn>@<sha>`, where `<sha>` is the consumer commit read. This is allowed only when that
    consumer repository is registered here as a `service` with a `feedback_inbox` (S3b).
  - **What stays out.** The note's text is never copied. The WingFoil element restates the defect or request in
    its own words, together with the facts reproduced in this repository, and it is self-contained: the
    `documentation` directive's D2 (resolvable references) holds. `reported_by:` is provenance only, and no
    reader needs to open the note to understand or verify the element.
  - **Defects.** A defect is reproduced in this repository before it becomes an element.
  - **Relation to earlier decisions.** This is the boundary `dl-089` drew for D01 (a consumer's existence may
    enter, its content may not), applied to notes. D01's benchmark measurement and `dl-147`'s figures are
    measured results that a decision-log reports, not notes: they are restated here and cited by public, tagged
    permalinks. They are not feedback-inbox entries and carry no `reported_by:`. R2 does not change them; their
    own ratification decides whether the permalinks satisfy D2.
- **R3 — pull, never push.** WingFoil publishes its answer here: the elements that carry `reported_by:`, and the
  retrospective's read record and dispositions (S3d). Each consumer reads them and updates its own notes. WingFoil
  never commits into a consumer's repository.
- **R4 — one file per note**, so a note has one identifier (`F-<nnn>`), one status and one history.
  - **Minimal format.** One Markdown file `F-<nnn>-<slug>.md`, whose frontmatter has `id`, `title`, `kind`
    (`defect | gap | request`), `status` (`open | needs-info | captured | resolved | declined | duplicate`),
    `wingfoil_version` (the build the note was observed on), and `answered_by` (the WingFoil element ids, filled
    by the consumer on sync). The body states what was observed and expected.
  - **Where it is documented.** The full format is documented in `COLLABORATION.md` by `align-user-docs` (S3f).
- **R5 — consumers sync at their own release-planning and at every pin bump** of the WingFoil build they use.
  - **What they read.** This repository's pushed `origin/main`, its release tags (`vX.Y.Z` on `main`, and patch
    tags on `release/X.Y` once `dl-159` applies, `task-265`), and the npm dist-tags `latest` and `latest-X.Y`
    (`task-266`).
- **R6 — triage outside the retrospective only into a patch.**
  - **When it is allowed.** A note may be triaged outside the retrospective into a **patch** release (`dl-092`; on
    a maintenance line, `dl-159`) when the outcome is an urgent bug fix, an urgent feature, or documentation.
  - **What waits.** Anything that changes a minor's or a major's scope waits for the retrospective.
  - **How it is recorded.** Such a triage is recorded in the patch release's `## Scope changes` (`task-230`) and
    listed in the next retrospective's read record (S3d).
- **R7 — no hold-out repository is a source.**
- **R8 — no product feature yet.** The loop runs by hand, through configuration, repository tests and the
  existing ingests, starting with the v0.3 retrospective. Product-level validation follows in v0.4 (S3c).

**Precondition.** Consumers read this repository's pushed `origin/main`, its release tags and its dist-tags (R5).
`main` must be pushed when the v0.3 retrospective lands. Otherwise the read record and the elements it names are
not there to read.

## Rationale

- **A versioned inbox is the only form a reader can check.** A commit gives every read a fixed point, so "what
  was new since the last retrospective" becomes a `git diff`, not a recollection. Pinning the sha in
  `reported_by:` keeps that fixed point on the element itself. With one file per note (R4), each note is
  citable and its status is a frontmatter field.
- **Restating instead of citing keeps the element true on its own** (R2). An element that depended on a note's
  text would break `documentation` D2 and would change meaning whenever the note changes. Reproducing a defect
  here means every element stands on versioned ground in this repository, as `dl-115` requires of a proposal
  from a secondary source and `claim-evidence` requires of every fact.
- **One service per repository** (S3b) keeps `dl-088`'s unit of state: the repository is the external thing.
  Its inbox is a property of that repository, not a second service. The same element then serves D01 (`dl-089`)
  and the feedback loop, and its id is the source key, so no second key space has to be kept in step.
- **Pull keeps WingFoil out of other repositories' histories** (R3). Committing into a consumer would need write
  access to it, would mix WingFoil's process into the consumer's audit trail, and would make WingFoil
  responsible for a repository it does not govern. A consumer that reads the published answer at its own pace
  (R5) decides how and when its notes change.
- **Six outcomes, not four** (S3d). `dl-115`'s four outcomes classify proposals that WingFoil itself raised. A
  consumer's note can also be declined, or be missing what a reproduction needs. Without `declined` and
  `needs-info` those notes would have to be forced into a wrong outcome or be left without one.
- **The retrospective is where a minor's or a major's scope changes**, through `retrospective.yaml` and then the
  next release-planning. The one exception (R6) is the work that cannot wait: a patch, which has its own release
  element (`dl-092` Q1 (A)).
- **Semver tension, accepted by the approver.** R6 admits an urgent *feature* into a patch, which semver
  reserves for backwards-compatible fixes. The approver accepted this on 2026-10-07: for a pre-1.0 tool used by a
  handful of consumers, waiting a whole minor for a small, additive and urgent capability costs more than the
  strict reading of semver. The patch release's `## Scope changes` and the next retrospective's record make
  every such case visible.
- **Feature requests go through `vision-change`** (S3c). A consumer's request for a new feature changes the
  vision, and `dl-132` gives it one way in, the `change-proposal`. Filing it as a decision-log would skip the
  impact analysis along the traceability chain. Decision-logs stay for input about process or decisions.
- **`contributor` and `reported_by:` answer different questions** (S3c). `contributor` (`dl-020`) says **who**
  originated a contribution and is credited for it. `reported_by:` says **where** it was reported, in a form a
  test can check. A GitHub issue (`task-214`'s forms) is not a registered inbox: it gets `contributor` plus the
  issue URL, and no `reported_by:`.
- **Two builds, each for its own job** (S3e).
  - **Why the code build for Memory operations.** This repository is the only one that can run WingFoil from
    its own source, so a fix merged into `main` is used for the Memory operations as soon as it lands. The pinned
    0.2.2 has no `memory amend`, no `park` and no `--dry-run`, and it allocates wrong task ids (*Context*).
  - **Why the pinned build for the read commands and MCP.** These answer as the build WingFoil's users have
    (`dl-095`), so its surprises surface as bugs here.
  - **Why the directive points to bugs.** Pointing to tagged bugs, instead of listing the surprises, keeps one
    record per surprise, closed by the element that fixes it.
- **By hand first** (R8), as `decision-log-ingest` and every other workflow ran before the engine: the formats
  settle on real notes before any code freezes them.
- **Declined:**
  - a new `feedback-source` service kind (it would make a second unit of state for one repository);
  - a single shared issue tracker (it moves content outside every repository's history);
  - copying notes into this repository (breaks R2 and `dl-089`);
  - WingFoil writing the answer into each consumer (breaks R3).

## Actions

Each action becomes a task through normal triage and backlog. All of them land **before the v0.3 retrospective**,
in the batches given (the coordinator updates `dev-loop-rel-v0.3-plan`'s W3 table).

- **S3b — the registry** (configuration in **B4**; service records as each consumer versions its inbox).
  - **Configuration.** `service` gains the kind `repository` and an optional field `feedback_inbox` (e.g.
    `docs/wingfoil-feedback/`). The change goes into the `service` template, `memory.yaml`'s `service`
    description, and a dated amendment of `dl-088`'s kind table.
  - **Records.** One `svc-*` per consumer **repository**, through `service-ingest`, with `provider: GitHub`,
    `kind: repository`, `owner_role: approver`, `url`, `feedback_inbox`.
  - **Verify.** `verify` checks the inbox, not only the repository: `git ls-remote <url> refs/heads/main` plus
    `gh api repos/<owner>/<repo>/contents/docs/wingfoil-feedback/README.md --jq .sha`.
  - **Source key.** The service id is the source key that `reported_by:` uses.
  - **The benchmark.** Its service also fulfils `dl-088`'s Actions item and `dl-089` D01's registration.
  - **When a consumer is registered.** Only after it has versioned its inbox, which none has done yet, and in any
    case before the v0.3 retrospective.
  - **Constraint.** S3b writes `memory.yaml`, and B4's other `memory.yaml` writer is `task-212`, so they are
    merged in sequence.
- **S3c — `reported_by:`** (**B5**, after `task-212` and `task-213`).
  - **The field.** An optional list of `<service id>/F-<nnn>@<sha>` on the `bug`, `decision-log`, `adr`,
    `tech-spec` and `change-proposal` types (`task-212`), in templates and `memory.yaml`.
  - **Where requests go.** A consumer's feature request is filed as a `change-proposal` through `vision-change`
    (`dl-132`). A decision-log is used only for input about process or a decision.
  - **The check, in v0.3.** A repository test, e.g. `test/docs/reported-by.test.ts`, checks that every
    `reported_by:` entry has the format and names an `active` service with a `feedback_inbox`.
  - **Through amends.** Keeping `reported_by:` through `memory amend` is a review rule.
  - **Later.** Product-level validation is deferred to v0.4, with `bug-195`.
  - **`COLLABORATION.md`.** Its `## Credit` section gains `reported_by:`: `contributor` says who, `reported_by:`
    says where it was reported. A GitHub issue (`task-214`'s forms) uses `contributor` plus the issue URL, and
    `reported_by:` is only for registered inboxes. This is stated once, in `COLLABORATION.md`.
  - **Constraint.** B5's `memory.yaml` writer is `task-217`, so they are merged in sequence.
- **S3d — `retrospective.yaml`, a `collect-feedback` phase** (**B5**, after `task-213` and `task-222`). The
  version is the next one after theirs; it is not pinned here, because 1.3 is already taken.
  - **What it is.** A new **read-only** phase between `explore` and `additional-points`.
  - **What it reads.** Every `active` `repository` service with a `feedback_inbox`, at its `main`: the remote, or
    a local checkout recorded per machine outside the repository.
  - **What it lists.** Notes in status `open`; `needs-info` notes the consumer has since answered; `captured`
    notes whose elements shipped in the release being closed; and the notes triaged outside the retrospective
    under R6.
  - **The read record.** It writes one row per note: cite `@sha`, commit read, the content restated in WingFoil's
    words, and the proposed outcome. The record goes under the path family `retrospective.yaml` already declares,
    `docs/06_retrospectives/rl-{release.release-line}/rel-{release.version}-feedback-triage.md`. It never holds a
    consumer's configuration, paths or prose.
  - **The outcomes, six of them.** `dl-115`'s four, plus `declined` and `needs-info`.
  - **The ruling.** The approver rules in `additional-points`. The decision, the elements and the target release
    go into `retro-{version}`'s Dispositions (or a `## Consumer feedback` section), and `capture` runs the
    ingests.
- **S3d-a — `dl-115` amendment** (coordinator). `dl-115` is `ready`, so it gets a dated amendment that extends
  its four outcomes with `declined` and `needs-info` for consumer notes.
- **S3d-b — `task-213` handover** (coordinator). Its `additional-points` `checks.pre` must accept the six
  outcomes.
- **S3e — the `wingfoil-cli` directive** (**B4**, after `task-205`, B3's only `roles.yaml` writer). It is a
  custom directive, bound **globally** (all roles) in `roles.yaml`.
  - **Which build, for what.** In this repository the directive says which build is used for which job:
    - **The code build for Memory operations:** `npm run build`, then `node dist/cli.js …`. This repository is
      the only one that can run WingFoil from its own source.
    - **The pinned build for the read commands and MCP:** `wingfoil-released`, today 0.2.2, run as
      `npm run -s wingfoil -- …`.
  - **Verb or hand procedure.** Where the build in use has a verb, the verb is used. Where it has none, the
    declared hand procedure is followed: the `wf()` commit format, and `dl-095` Q3 for a defect that blocks a
    step.
  - **Surprises.** The pinned build's surprises live in bugs tagged `pinned-build`. The directive points to that
    tag and does not list the surprises.
  - **Re-check.** `release-planning`'s `advance-pinned-build` re-checks the directive at every pin advance.
  - **No inbox here.** This repository keeps no inbox: a WingFoil defect found here goes straight to `bug-ingest`.
- **S3f — documentation** (`align-user-docs`, v0.3). `COLLABORATION.md` documents the consumer note format
  (R4), the inbox (R1), the sync points (R5) and the `contributor`/`reported_by:` split.
- **B — patch v0.3.1's scope** (the v0.3 retrospective).
  - **Who selects it.** The retrospective selects patch v0.3.1's scope by hand in `additional-points`.
  - **Inputs.** Notes admitted by R6; a review of every `release: "v0.4"` element (today 38 `triaged` bugs and
    4 decision-logs, no tasks); and the immediate bugs from release-health.
  - **Dispositions.** `capture`'s Dispositions mark each one `v0.3.1` or `v0.4`.
  - **Promotion.** Only bugs and decision-logs are promoted, by `assign` of their `release`.
  - **Fix tasks.** `patch-v0.3.1`'s release-planning creates fresh fix tasks under `docs/04_memory/v0.3.1/`.
  - **Where the patch branch is cut** (approver, 2026-10-07).
    - **When the retrospective plans a patch,** `release/0.3` is cut from the commit on `main` that **closes**
      the v0.3 retrospective. That commit contains both the tag `v0.3.0` and the retrospective. The branch is not
      cut from the tag.
    - **An urgent patch needed before the retrospective closes** is cut from the tag, and its scope is restated
      later.
    - **Source.** This follows
      `dl-159-patch-a-released-minor-on-a-release-x.y-branch-merged-forward-into-main-alongside-the-next-minor-on-main`.
      Its point 1 ("cut from the tag `vX.Y.0`") is being amended to match, and its A2 gets the matching
      amendment.
- **C2 — follow-up, not done here.** The `docs/06_*` numbering clash (`06_retrospectives`, `06_health`,
  `06_runs`) is filed separately as a bug. This decision-log keeps the path `retrospective.yaml` already declares.

## Relations

- **Builds on:**
  - `dl-088-a-memory-type-for-state-that-lives-outside-the-repository`: the `service` type. S3b adds the kind
    `repository` and `feedback_inbox`, and amends its kind table.
  - `dl-089-release-health-analyses-before-retrospective`: existence, not content, of a consumer may enter this
    repository, and D01's benchmark registration is fulfilled by S3b.
  - `dl-115-retrospective-notes-written-during-the-release`: a proposal from a secondary source gets a
    disposition. S3d-a amends its outcome set.
  - `dl-020-contribution-model`: `contributor`/`credit`, beside which `reported_by:` records provenance.
  - `dl-132-vision-change-and-feature-ingest`: a consumer's feature request becomes a `change-proposal`.
- **Related:**
  - `dl-019-plans-as-memory-element`: this ingest's plan.
  - `dl-095-which-wingfoil-build-develops-wingfoil`: the pin S3e uses for the read commands and MCP, Q3's hand
    procedure, and `advance-pinned-build`, which re-checks S3e.
  - `dev-loop-rel-v0.3-plan`'s ruling of 2026-09-30 (Memory operations with the code build): S3e makes it a
    directive.
  - `dl-092-tracking-a-patch-after-its-minor-is-released` and
    `dl-159-patch-a-released-minor-on-a-release-x.y-branch-merged-forward-into-main-alongside-the-next-minor-on-main`:
    the patch releases R6 and B use, the patch tags and `latest-X.Y` R5 reads, and point 1 and A2, amended so
    that `release/0.3` is cut from the commit that closes the retrospective (B).
  - `dl-147` (`in-discussion`): measured figures with permalinks, outside R2 (*Decision*, R2).
- **Interacts with:**
  - `task-212` (`change-proposal`; `memory.yaml` in B4);
  - `task-213` and `task-222` (`retrospective.yaml`, the `bug` template);
  - `task-205` (`roles.yaml`);
  - `task-214` (issue forms);
  - `task-217` (`memory.yaml` in B5);
  - `task-230` (the release's `## Scope changes`);
  - `task-265` and `task-266` (patch tags, `latest-X.Y`);
  - `bug-195` (value sets enforced in v0.4);
  - `bug-292` (the pinned MCP server cannot read the v0.3 workflows).
- **Traceability:**
  - Features: P1.13 (Memory element schema: the `repository` kind, `feedback_inbox`, `reported_by:`), P1.11
    (Memory entries), P3.5 and P3.7 (a custom directive bound by role), P4.1 (workflow configuration:
    `retrospective.yaml`).
  - Requirements: REQ-SYS-01 (git-backed single source of truth: answers are published here), REQ-SYS-08
    (bindings and owners by role), REQ-SEC-08 (a `service` never holds a secret).
