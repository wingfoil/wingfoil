---
id: dev-loop-rel-v0.3-plan
type: plan
title: "Dev-loop — rel-v0.3"
status: active
version: "1.14"
workflow: "dev-loop"
phase: "rel-v0.3"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 260703   # Orignal template version
---

## Context

`minor-v0.3` (`docs/04_memory/planning/rl-v1/minor-v0.3.md`, "WingFoil v0.3 - Project Workflow") is
`in-development` (`2bc3071e`). Its `release-planning` phase is `done`
(`release-planning-rel-v0.3-plan`, merged into `main` at `c00ef567` and pushed), with **121 backlog
tasks**, `task-126` … `task-246`, under `docs/04_memory/v0.3/`, grouped in four waves (Appendix E
of that plan: wave 0 → 4, 1 → 41, 2 → 23, 3 → 53). Per `release-cycle` the next phase is
`implementation`: one `dev-loop` run (`.wingfoil/workflows/custom/dev-loop.yaml` **v1.4**,
`element: task`) per task. The workflow engine does not exist yet, so this `plan` element is the
phase's execution scaffold (`dl-019`).

This is a **generic plan**, as in v0.1, v0.2 and v0.2.2: every run follows it, and the per-task
content and running log live in each task's own **Execution Notes**. No per-task plan file is
created. The plan is revised at each wave, when the next wave is opened.

**Preconditions (verified on `main` at `c00ef567`, 2026-09-30).**
- `minor-v0.3` `in-development`; `task-126` … `task-129` `backlog` (`grep -m1 '^status:'` on each
  file); their linked bugs `bug-087`, `bug-131`, `bug-155`, `bug-162`, `bug-171` `planned`.
- `main` equal to `origin/main` (`git fetch && git rev-list --left-right --count origin/main...main`
  → `0 0`).
- Design inputs in place: `spec-001`, `spec-003`, `spec-004`, `spec-005`, `spec-008`, `spec-010`,
  `spec-016`, `spec-017` `approved` (`grep -m1 '^status:'` on each file).
- The build in use is the pinned one (`dl-095`): `npm run -s wingfoil -- --version` → `0.2.2`, what
  `package-lock.json` pins for `wingfoil-released`. **Found stale at the start of this phase**: the
  main working tree's `node_modules` still held 0.2.1 (`--version` → `0.2.1`) after the pin advanced;
  `npm ci` fixed it. Each task worktree runs its own `npm ci`.
- Local toolchain: Node 22.21.0, npm 11.6.2 (`node -v`, `npm -v`).
- `memory add` of the pinned build allocates wrong ids on this repository (`bug-087`, `bug-162`).
  Named ids (`plan`) are safe: this plan was added with the pinned build (`f5b0dc2c`, checked: one
  commit, one file, the `{scope}` token resolved).

**Which build runs the Memory operations (approver, 2026-09-30).** Task sessions and every later
phase run the Memory verbs with the **code version**, not the pinned build: `npm run build`, then
`node dist/cli.js <command>` from the worktree in use, so that a command whose bug has been fixed
and merged into `main` is used as soon as it lands (e.g. `memory add` once `task-128` is merged).
This is session practice: `dl-095` and the pin are unchanged, and `npx wingfoil` is still not used.
Until `task-128` is on `main`, numbered elements (task, bug, decision-log, adr, tech-spec,
service) are still added **by hand**, at the highest number on every ref + 1 (`dl-101` §1). Every
command's real effect is checked (commit, diff, exit code).

**Produces.** The 121 tasks `backlog → done`, their linked bugs `planned → … → closed` through
`bug.sync_state` (§4), code and tests under `src/` and `test/` with coverage > 80% and not
regressing. Then `release-cycle` moves on to `user-docs`, which is not part of this plan.

## Phases / Steps

### 1. Per-task contract

Each task follows `dev-loop.yaml` v1.4, as detailed in `dev-loop-rel-v0.2-plan` §2–§3:

- **start** (developer): branch `task/{task.id}` cut from `main`, worktree `../.wf2-wt/task-{n}`,
  task `backlog → in-progress` (`wf(task): start {id} [backlog → in-progress]`, by hand: no verb),
  `bug.sync_state`.
- **design** (architect): classify each AC as red-first or characterization (T1; the planning
  already pre-classified them, the design phase confirms or corrects); read the Execution Notes of
  every `depends_on` task (`dl-015`, hard gate); verify the cited specs are `approved`; any spec
  change the task's ACs require is a Revision-noted edit inside the task (hand edit until
  `task-127`'s `memory amend` ships and the pin advances).
- **red / green / refactor** (developer): refactor's checks are coverage ≥ 80, `docs.api.*` and
  `lint.clean`, all hard-reject. `tsc --noEmit` is also run by hand (`dl-044`'s gate is declared by
  `task-173`).
- **review** (reviewer): unit and BDD suites green, `node dist/cli.js memory submit {id}` →
  `wf(task): submit {id}` (plain subject, no
  bracket, `dl-054`, confirmed at planning R20), `bug.sync_state`. **The loop stops here** until the
  approver rules.
- **done** (developer, on the approver's instruction only): `approve [in-review → approved]` with the
  code version (`node dist/cli.js memory approve`), `[approved → done]` by hand (`finalize`), both on the task branch; `git merge
  --no-ff` into `main`; worktree and branch removed; `bug.sync_state`.

Every task runs in its own worktree. The main working tree is shared with other sessions, so no
task commit is made there; before each commit the agent checks `git branch --show-current`. One
`npm test` per worktree at a time (concurrent runs corrupt `dist/`, `bug-095`). Commands take one
id per call (`bug-171`, until `task-129` lands).

### 2. Which v0.3 rules are in force

A ratified rule is in force from the approval of the task that implements it; no rule is brought
forward (reading of `release-planning-rel-v0.3-plan`, confirmed by the planning session on
2026-09-30):
- **`dl-133` stop-the-line** (Q3 30% open fix tasks, Q4 (i) block feature pick-up): threshold
  declared by `task-150` (wave 1), `start` check by `dev-loop.yaml` v1.6 (`task-221`). **Not in
  force in wave 0**: the 33% fix share today (40 of 121) is the planned composition of the backlog,
  not the in-release tail the rule measures. Tracked from wave 1 on, by hand, in each wave's revision
  of this plan.
- **`dl-134` separation of duties** (`red` by `qa`, independent executors): `dev-loop.yaml` v1.5,
  `task-205`. Until then the v1.4 roles apply.
- **`dl-100` §1 (a) governance re-sweep** and **`dl-133` §2 smoke + user-doc checks at each wave
  end**: declared as a wave-boundary phase by `task-230`. Not mandatory before it; at the end of wave
  0 the smoke (`node scripts/e2e-smoke.cjs`, `test/cli/e2e-smoke.test.ts`) and `docs/examples` are run anyway as a cheap check, and a
  failure is filed through `bug-ingest`.
- **`dl-102`**: ratified (a), rules in directives (`task-197`); no standing section in this plan.

### 3. Waves

The order follows Appendix E of `release-planning-rel-v0.3-plan` and the tasks' `depends_on`. Within
a wave, tasks run in parallel; a task may start as soon as its own `depends_on` are `done`.

**Wave 0** (opened 2026-09-30):

| Task | Kind | Bugs | Depends on | Starts |
|---|---|---|---|---|
| `task-126` closed `wf()` grammar (`dl-079`) | feature | `bug-155` | — | now |
| `task-128` id allocation (`dl-101`) | fix | `bug-087`, `bug-162` | — | now |
| `task-129` one operand per command (`dl-082`) | fix | `bug-131`, `bug-171` | — | now |
| `task-127` `memory amend` (`dl-108`) | feature | — | `task-126` | `task-126` `done` |

Shared files: `spec-008` §1/§2 (`task-126`, `task-127`, `task-129`) and `docs/cli-reference.md`
(`task-127`, `task-129`, gated by `test/docs/cli-reference.test.ts`). Merge order: `task-126` before
`task-129`, or `task-129` rebased on `main` before its merge; `task-127` is cut after `task-126` is
merged. `src/memory/add.ts` is `task-128`'s alone in this wave.

Wave-0 handovers from the planning session:
- `task-126` carries ruling R20/Q6: `element.set_release` is rebound to an already-declared verb (no
  `assign`), chosen in design; and the correction of `dl-079`'s approve-reason counts (`sync` 197,
  `finalize` 132 = 112 task + 20 plan, `start` 113).
- `submit` keeps no transition bracket (`dl-054` over `dl-106` W1 (a), R20).

**Wave 0 closed 2026-10-01**: the four tasks are `done` (§Execution Notes).

**Wave 1** (opened 2026-10-01, the approver's choice of batches): `task-130` … `task-170`, 41 tasks,
in six batches. They were built from a read-only analysis of the files each task will write. A
batch starts when the previous one is merged; a task may start earlier if no open task writes its
files. Each of the five `memory.yaml` writers is in a different batch. The tasks that unblock the
most later work go first (`task-136` → 40 later tasks, `task-130` → 26, `task-137` → 23,
`task-166` → 19, `task-161` → 15, `task-138` → 14, transitive counts over `depends_on`).

| Batch | Tasks | Merge order on shared files |
|---|---|---|
| **B1** | 130, 131, 133, 136, 139, 140, 166, 170 | `133` → `136` (`src/storage/templates.ts`); `131` → `130` (refusal paths of `memory add` and the transition verbs) |
| **B2** | 132, 134, 135, 137, 138, 141, 161, 167 | `137` after `136`; `138` → `132` (`src/core/index.ts`); `138` → `161` (`docs/cli-reference.md`); `161` → `132` (`spec-006`) |
| **B3** | 142, 143, 144, 145, 147, 150, 169 | `143` → `144` (`src/core/directives-list.ts`); `144` after `161` (`command-baseline.md`) |
| **B4** | 146, 148, 149, 151, 152, 155, 168, 247 | `146` → `152` (`jest.config.js`) |
| **B5** | 153, 154, 158, 159, 162, 163 | `162` → `163` (`spec-001`) |
| **B6** | 156, 157, 160, 164, 165 | `165` → `156` (`spec-008`, `docs/cli-reference.md`); `164` after `163` |

Fix share (`dl-133`, tracked by hand until `task-221`'s `start` check): at the opening of W1, 38
open fix tasks of 117 open tasks (32%); B1 holds 4 fixes of 8.

**Wave 2** (opened 2026-10-05, the approver's choice of batches): `task-171` … `task-193`, plus
`task-248` (`dl-146`), `task-249` (`bug-222`) and `task-250` (`bug-223`), added after
`commit-backlog`, and `task-251` (`dl-149`), approved into the backlog during B1: 27 tasks, 14 of them
fixes. Every `depends_on` of the wave points to a wave 0 or wave 1 task, all `done`. The batches follow
the rules of wave 1: one writer of `memory.yaml` per batch, the tasks that unblock the most later
work first (`task-175` and `task-185` → 38 later tasks each, `task-192` → 18, `task-171` → 16), and
`task-249` (HIGH) in the first batch.

| Batch | Tasks | Merge order on shared files |
|---|---|---|
| **B1** | 250, 249, 192, 185, 175, 171, 177, 176 | `250` → `249` → `192` (`package.json`, `src/cli`); `185` → `175` (`src/workflow/schema.ts`); `171` → `176` (Memory scan primitives, `spec-012`) |
| **B2** | 174, 172, 178, 173, 191, 182, 251 | `172` → `251` (`src/core/init.ts`); `251` is the batch's only writer of `memory.yaml` and `dna.yaml`, `178` of `roles.yaml` |
| **B3** | 179, 180, 181, 188, 193, 190, 183 | `180` → `181` (`state-machine.ts`); `193` after `172`; `188` after `178`; `183` after the config writers |
| **B4** | 184, 186, 187, 189, 248, 253, 254, 255 | `255` before `253` (`src/core/relevance.ts`); `189` last (`src/core/index.ts`); `248` alone, on an idle machine (`test:latency`) |

`task-251` entered B2 and `task-180` moved from B2 to B3, so that B2 keeps a single writer of
`memory.yaml` (approver, 2026-10-05).
`task-253` (`bug-230`), `task-254` (`bug-235`) and `task-255` (`dl-150`, `dl-151`, `bug-232`, `bug-233`)
entered B4 from the W2 B1 triage and the B2 gate.

Fix share at the opening of W2: 14 open fix tasks of 77 open (18%).

**Amending approved Memory elements during a task (from W1 on).** `memory amend` exists since
`task-127`, so an edit to an element past its first state (a spec's Revision note, a ready
decision-log, a `service`, another task) is an `amend` commit, not a hand commit (`dl-108`). The
verb needs approver authority, so the developer agent does not run it. It leaves such edits
**uncommitted** in the task worktree and lists each one in the Execution Notes, with its proposed
`--reason`. At the review gate, on the approver's instruction, the coordinator runs one
`memory amend` per element on the task branch, then `approve`. Code, tests, directives,
configuration and non-Memory docs are committed by the developer as before.

### 4. `bug.sync_state` — linked bugs (wave 0)

| Task | `bug:` |
|---|---|
| `task-126` | `bug-155` |
| `task-128` | `bug-087`, `bug-162` |
| `task-129` | `bug-131`, `bug-171` |

Each bug has exactly one task, so the aggregate rule is 1:1. The bug's `status` changes in its own
commit, right after the task's transition and on the task branch:
`wf(bug): sync {bug.id} [{from} → {to}]`, as in v0.2.2.

## Handoff

- **Approver:** the review gate of every task and the `approve`/`reject` that follows it;
  confirmation of §2's reading (no v0.3 rule brought forward into wave 0); the rulings of each
  wave-boundary checkpoint; merges to `main` are the agent's after approval, pushes are the
  approver's call.
- **Agent:** start → review for each task in wave order, and the `done` mechanics (merge, worktree
  cleanup, bug sync) once the approver has ruled. It never approves.
- **Completion criteria:** the 121 tasks `done` and merged into `main`; their linked bugs `closed`;
  `npm test` green with coverage > 80%; this plan `active → done`. Next phase: `user-docs`.

## Execution Notes

- **2026-09-30 — wave 0 opened.** `task-126`, `task-128`, `task-129` started (branches and worktrees
  per §1); each ran design → submit through a developer agent and is `in-review`, its bugs synced
  `[in-progress → in-review]`. `task-127` waits for `task-126`'s merge.
- **2026-10-01 — independent review** of the three branches (a separate reviewer agent per task,
  read-only, before the approver's gate, as `task-125` did): all three "approve with fixes". Fixes
  inside each task are applied on its branch; the follow-ups become elements once `task-128` is
  merged, so that `memory add` (code version) allocates their ids.
- **2026-10-01 — approver ruling on `element.set_release`.** Raised by `task-126`'s review: binding
  it to `amend` (the reading of R20/Q6) collides with `dl-108` (approver-gated, `adr` not amendable)
  and with `build-backlog` (product-owner, no approval, stamps `adr` too). The approver **reverses
  `release-planning-rel-v0.3-plan` R20/Q6 on this point**: `assign` joins the closed verb list, needs
  no approver, and changes only `release`, on every type. Written into `spec-008` §2 and `spec-003`
  by `task-126`.
- Merge trial of the three branches on `main` (`6a28d281`): `task-126` and `task-128` merge clean;
  `task-129` conflicts on `spec-008`'s Revision notes only (both append), resolved by keeping both.
- **2026-10-01 — `task-126`, `task-128`, `task-129` `done`.** The approver approved all three at the
  review gate. `approve [in-review → approved]` used the code version (`e1c90887`, `68796cc5`,
  `ad0f8f78`) and `finalize [approved → done]` was done by hand. Bugs `bug-155`, `bug-087`, `bug-162`,
  `bug-131` and `bug-171` went `[in-review → resolved → closed]`. Merged `--no-ff` in plan order:
  `eafd2384` (126), `ba8b5ba6` (128), `bd60a7a3` (129). `task-129`'s merge conflicted only on
  `spec-008`'s Revision notes, which were kept in date order. Worktrees and branches were removed.
  Gates on `main` at `bd60a7a3`: `npx jest --coverage` → 165 suites, 2715 tests, coverage 98.71 /
  94.54 / 93.96 / 99.48; lint, `docs:api` and both `tsc` runs exit 0.
- **Approver rulings at the gate.** `command-baseline`'s version stays a body line for now: the
  directive frontmatter has no `version` key, and `spec-013`/`schema.ts` warn on unknown keys.
  `task-144` gains an AC to declare `version` in the directive frontmatter and move the line there
  (`6ae8e57a`). The developers' other proposals were accepted: `assign` is read only in its
  canonical form; refuse rather than batch; the refusal message names the count.
- **`task-127` started** (`a0564ae6`, worktree `../.wf2-wt/task-127`, cut from `bd60a7a3`).
- **Review follow-ups.** `bug-176` … `bug-180`, `open`, are captured by
  `bug-ingest-rel-v0.3-wave0-review-findings-plan` with the code version's `memory add`. Their ids
  were the highest on every ref + 1, `task-128`'s first real use. A handover note is on `task-167`
  (`6315a290`).
- **For v0.3's `user-docs` phase** (from the wave-0 reviews):
  - `docs/cli-reference.md`'s 0.2.2 page label, now carrying "Unreleased (v0.3)" paragraphs;
  - CHANGELOG entries:
    - a surplus operand is refused (exit 2);
    - `memory search a b` now needs quoting;
    - `memory history` reads eleven verbs;
    - ids are allocated from the highest number on every ref;
    - `resolveTypeDirectory` and the old `nextSequenceNumber` signature are removed from `dist/memory`;
  - the "per-type counter" wording in `docs/user-guide.md:196` and `docs/cli-reference.md:312`.

  **For `align-agent-docs`:**
  - `CLAUDE.md` §5.1: `dl-079` is still called `in-discussion`, five verbs are listed, and
    `{id1}, {id2}` is not marked historical;
  - `CLAUDE.md` §3: its `memory add` limits are lifted once the pin passes `task-128`.
- **2026-10-01 — `task-127` `done`.** Approved after an independent review: F1 (required fields
  stay non-empty past `draft`) and F6 (authority checked right after confinement) were fixed
  in-task. The approver's rulings were applied:
  - `amendable` is true for tech-spec, decision-log, service, task, bug and plan, and false for
    adr, release and release-line;
  - `amend` also refuses `release`, `rejection_reason` and `supersedes`;
  - the `init` scaffold declares `amendable`.

  Approve `ed2de6f1`, merge `15fa712a`. Gates on `main` at `15fa712a`: 166 suites, 2759 tests,
  coverage 98.73 / 94.58 / 94.01 / 99.49; lint, `docs:api` and both `tsc` runs exit 0. The review
  follow-ups `bug-181` → `task-146` and `bug-182` → `task-131` were triaged into v0.3 by the
  approver. **Wave 0 closed.**
- **2026-10-01 — wave 1 opened**, with batch B1 (§3).
- **2026-10-01 — batch B1 `done`** (`task-130`, `131`, `133`, `136`, `139`, `140`, `166`,
  `170`).
  - **Review.** Each task had an independent review: `131` approve; the other seven approve with
    fixes, all applied in-task. The approver ruled `task-170` option (A): `release` is reserved for
    `amend` only where the committed scaffold declares it.
  - **Amendments.** The first run of the W1 amendment rule (§3): **22 `memory amend`**, one commit
    and one file each, run on the task branches before `approve`.
    - `task-130`: spec-005, spec-004, spec-008.
    - `task-136`: spec-003.
    - `task-139`: task-173.
    - `task-166`: spec-008, dl-067.
    - `task-170`: dl-088, svc-001 … svc-012, spec-010, spec-008.
  - **task-140's AC 3.** The approver authorised the push of its branch. CI run
    <https://github.com/wingfoil/wingfoil/actions/runs/36858971902> was green (167 suites, 2771
    tests), and the remote branch was deleted after the merge.
  - **Bugs closed:** bug-112, bug-114, bug-118, bug-122, bug-123, bug-124, bug-144, bug-145, bug-166,
    bug-182.
  - **Merges** (`--no-ff`, plan order 131 → 130 → 133 → 136 → 139 → 140 → 166 → 170): 84305032 b0c194d9 09b61d5a 1f5b314c 0ed6394d 937f5755 c670ff38 876f3d4e.
    Only `spec-008`'s Revision notes conflicted, twice; both sides were kept in date order.
  - **Integration fix** `c6e56ac6` (branch `fix/error-details-reads-diagnostics`). task-130's
    `errorDetails` read only `details.issues`, and task-136's loader refusal carries
    `details.diagnostics`. Each further diagnostic is now one detail in the reason form, red-first,
    with CLI and in-process tests.
  - **Gates on `main` at `c6e56ac6`:** 177 suites, 2969 tests, coverage 98.82 / 95.06 / 94.44 /
    99.52; lint, `docs:api` and both `tsc` exit 0.
  - **Under parallel load** `resource-latency`, `query-latency` and `publish-secrets` (`bug-181`)
    flaked and passed alone. That is `task-146`'s class.
  - **Follow-ups.** `bug-183` … `bug-186` are open, with triage proposals in
    `bug-ingest-rel-v0.3-w1b1-review-findings-plan`. Amendments: `dl-058` (`fd0b263c`) and
    `bug-040` (`5d8d2fe2`).
  - **For `user-docs`:**
    - `docs/user-guide.md` §7 and `docs/cli-reference.md` still describe workflows only by `kind`;
    - CHANGELOG entries for the error details, ci.yml, the reason grammar and `set_up_in`.

    **For `align-agent-docs`:** CLAUDE.md §5.1 (control characters, reserved keys) and the mention
    of ci.yml.
  - **Fix share:** 34 open fix tasks of 109 open tasks (31%).
  - **Next:** batch B2.
- **2026-10-01 — `ci.yml` first run on `main`** (<https://github.com/wingfoil/wingfoil/actions/runs/36862116823>,
  head `e257e9b6`): success.
- **2026-10-01 — B1 follow-up triage** (approver):
  - `bug-183` → `task-196`;
  - `bug-184` → `task-174`;
  - `bug-185` → `task-173`, with the ruling to extend the refusal past C0 (DEL, C1, U+2028, U+2029),
    recorded in `dl-078` by `memory amend` (`7cd76166`);
  - `bug-186` → `task-197`.
- **2026-10-01 — batch B2 started:** `task-132`, `134`, `135`, `137`, `138`, `141`, `161`, `167`.
  Every task's `depends_on` is `done`. Bugs synced to `in-progress`: `bug-142`, `bug-149`, `bug-153`,
  `bug-141`, `bug-037`, `bug-038`, `bug-088`, `bug-160`. One developer agent per task, as in B1.
- **2026-10-02 — batch B2 `done`** (`task-132`, `134`, `135`, `137`, `138`, `141`, `161`, `167`).
  The process was interrupted once (a Claude Code exit). Every agent resumed from its transcript, and
  its worktree was intact.
  - **Review.** Every task had an independent review. `task-132`'s first pass was rejected for two
    real defects: an identity that was only partly set left a written and staged document, and the
    `Approver:` line could be forged through the `--author` string. It was re-reviewed after the
    fixes and approved. The other seven were approved with fixes applied in-task.
  - **Approver rulings at the gate:**
    - `task-141`'s `minor-v1.0` edit was recorded as a hand amendment (`a143909e`), because `release`
      is `amendable: false`;
    - REQ-STATE-10 was ratified;
    - `task-132` may read REQ-SEC-01 broadly: git's author sources, and a committer must resolve;
    - the `doc-versioning` baseline is the last commit to `main`, so a task bumps a document once;
      recorded as an AC of `task-144` (`050c938c`).
  - **Amendments: 7 `memory amend`**, run on the task branches before `approve`:
    - `task-132`: spec-006 §7;
    - `task-135`: spec-007;
    - `task-138`: spec-002;
    - `task-161`: spec-006 §6, spec-008 §11, spec-016, spec-017.
  - **Bugs closed:** bug-037, bug-038, bug-088, bug-141, bug-142, bug-149, bug-153, bug-160.
  - **Merges,** in order 134 → 135 → 141 → 138 → 137 → 161 → 132 → 167. Only `spec-006`'s Revision
    notes conflicted; both were kept. The final merge is `fcd43569`.
  - **Gates on `main`:** 188 suites, 3192 tests, coverage 98.84 / 95.24 / 95.01 / 99.54;
    lint, `docs:api` and both `tsc` exit 0.
  - **Governance check.** `node scripts/check-governance.cjs --base 050c938c` over B2's 64 `wf()`
    commits gives 0 findings. Its introduction commit is `fcd43569`.
  - **Push blocked.** GitHub push protection flagged the fake AWS secret fixture in
    `test/validation/secret-scan.test.ts:68` (commits `448e6df5`, `a7bb4b64`, `bug-055` class, owned by
    `task-182`). Unblocking is the approver's action on GitHub, as in v0.2.2.
  - **Follow-ups.** `bug-187` … `bug-193` and `dl-139` are open, with triage proposals in
    `bug-ingest-rel-v0.3-w1b2-review-findings-plan`; handover notes are on `task-206`, `task-208` and
    `task-222`.
  - **For `user-docs` / `align-agent-docs`:**
    - the North Star wording in `README.md`, `docs/agents.md` and `CLAUDE.md` (I/P/O);
    - `docs/user-guide.md` lists five `paths` categories;
    - the CHANGELOG for identity resolution, `memory amend`'s reserved fields, `init`'s re-init
      refusal and the `ci.yml` and governance checks.
  - **Fix share:** 31 open fix tasks of 101 open tasks (31%).
  - **Next:** B3 (`142`, `143`, `144`, `145`, `147`, `150`, `169`).
- **2026-10-02 — `main` pushed** (`050c938c..cac8a447`, 165 commits) after the approver cleared the
  push-protection hit on the fake fixture secret.
- **2026-10-02 — B2 follow-up triage** (approver): proposals accepted.
  - **`task-247` added to the backlog** after `commit-backlog`: a new fix task for `bug-187`, wave 1,
    batch B4 (`depends_on` `task-137`, done). It goes into `minor-v0.3`'s scope changes at the next
    checkpoint (`dl-100` §2).
  - `bug-188` and `bug-189` → `task-171`; `bug-190` → `task-182`; `bug-191` → `task-188`;
    `bug-192` → `task-208`.
  - `bug-193` → v0.4.
  - `dl-139` ratified (a) → `task-208`.

  W1 now holds 42 tasks.
- **2026-10-02 — `main` received two intake batches** (`774c74e0`, `91007463`) by fast-forward from a
  separate session's branch `intake/memory-notes`. It added `dl-140` … `dl-145` (`in-discussion`) and
  their capture plan. The approver deferred their ratification to v0.3's retrospective or v0.4's
  release-planning. Protocol: the intake session works in its own worktree; this session
  fast-forwards when `main` is clean.
- **2026-10-02 — batch B3 `done`** (`task-142`, `143`, `144`, `145`, `147`, `150`, `169`).
  - **Review.** Every task had an independent review; all were "approve with fixes" except
    `task-150` (approve), and every fix was applied in-task.
  - **Approver rulings:**
    - `task-144`: R1–R4 — directive `version` is a number or string, `scope` any string, the
      reverse rule fires only on a declared contradiction, and `command-baseline` is bumped to 1.3;
    - **`dl-133` option (a):** the stop-the-line threshold applies as ratified, counting every open
      task, so fixes come first while the share exceeds 30%.
  - **Amendments: 4 `memory amend`.** `task-144`: spec-013. `task-169`: spec-008 (new §12),
    spec-006, spec-004.
  - **Bugs closed:** bug-036, bug-070, bug-072, bug-093, bug-097, bug-109, bug-113, bug-125, bug-148,
    bug-154, bug-178.
  - **Merges,** in order 143 → 144 → 142 → 145 → 147 → 150 → 169. `task-144` conflicted with
    `task-143` in five files and was resolved by keeping both (`da9fca55`).
  - **Integration fix** `89c93556` (branch `fix/directive-version-warning-channel`, red-first):
    `task-144`'s `version` warning moves from a stderr write in `src/core` to
    `loadDirectiveInventory`'s `warnings`, since after `task-143` the core prints nothing.
  - **Gates on `main`:** 200 suites, 3363 tests, coverage 98.85 / 95.39 / 95.18 / 99.56; lint,
    `docs:api` and both `tsc` exit 0.
  - **Governance check over B3:** `--base 91007463` gives 65 gated `wf()` commits, 0 findings, exit 0.
    Its first real gating run, now that it is on `main`.
  - **Pushed:** `91007463..ee8133c9`.
  - **Follow-ups.** `bug-194` … `bug-202` are open, with triage proposals in
    `bug-ingest-rel-v0.3-w1b3-review-findings-plan`. Handover notes are on `task-188`, `task-174`,
    `task-221` and `task-218`.
  - **For `align-agent-docs`:** `CLAUDE.md` §3 still names the pinned build as 0.2.1 (it is 0.2.2),
    and §8 still states the old bump rule.
  - **Fix share:** 27 open fix tasks of 95 open (28.4%), under the threshold.
  - **Next:** B4 (`146`, `148`, `149`, `151`, `152`, `155`, `168`, `247`).
- **2026-10-02 — batch B4 `done`** (`task-146`, `148`, `149`, `151`, `152`, `155`, `168`, `247`).
  - **Review.** Every task had an independent review: "approve" for `task-152`, "approve with fixes"
    for the rest, every fix applied in-task. `task-168`'s fixes had a focused re-review.
  - **Rate limit.** The developer agents of `146`, `152` and `247` were cut off mid-gate by an API
    rate limit and resumed from their transcripts. Two of `task-152`'s commits were refused by the
    permission classifier and made only after the approver authorized them.
  - **Approver rulings:**
    - `task-168`: `[]` counts as filled only on a field declared in `template.frontmatter.lists`
      (a declared field, not a template comment). On any other required field a list or a mapping is
      missing. `memory.yaml` goes to `2.0`, compared as a number, not `1.10`.
    - Confirmed at the gate:
      - `task-146`: the lock waits 15 minutes, then refuses.
      - `task-148`: the `except kind for [...]` exemption form, and `kind: "minor"` in `seed-releases`.
      - `task-149`: the entry-path spelling keeps the generic message.
      - `task-151`: a new unlisted name fails even in warn mode. The scope is specs, ADRs and SARD.
      - `task-152`: fixtures left behind are reported, never fatal.
      - `task-247`: a document deleted in the working tree is refused, with a restore hint.
  - **Amendments: 6 `memory amend`.**
    - `task-148`: spec-003.
    - `task-155`: spec-015.
    - `task-168`: spec-001 and spec-010.
    - `task-247`: spec-006 and spec-008.
  - **Bugs closed:** bug-046, bug-047, bug-064, bug-065, bug-095, bug-147, bug-167 (not reproduced,
    hypothesis guarded), bug-169, bug-170, bug-175, bug-181, bug-187, bug-197.
  - **Merges,** in order 149 → 155 → 148 → 168 → 247 → 146 → 152 → 151.
    - `task-152` conflicted with `task-146` on `jest.config.js`, `test/global-setup.cjs` and
      `test/global-teardown.cjs` (both added a teardown).
    - Resolved in the merge `45338809`: one teardown that sweeps this run's fixtures and releases
      the `dist/` lock in a `finally`; both setup lines kept.
    - `test/lint/coverage-parity.test.ts`'s child jest now drops `globalTeardown` as well as
      `globalSetup`.
    - `task-151` merged last, so its name check ran over the amended specs: 77 untriaged, 0 stale.
  - **Gates on `main`** (`ea637c43`): 208 suites, 3522 tests, coverage 98.86 / 95.45 / 95.29 / 99.57.
    lint, `docs:api` and both `tsc` exit 0; the e2e smoke is 19/19 ok.
  - **Governance check over B4:** `--base 2159c018` gives 77 gated `wf()` commits, 0 findings, exit 0.
  - **Pushed:** `2159c018..ea637c43`.
  - **Follow-ups:** filed by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, triage pending.
  - **Fix share:** 22 open fix tasks of 87 open (25.3%), under the threshold.
  - **Next:** B5 (`153`, `154`, `158`, `159`, `162`, `163`).
- **2026-10-02 — B4 follow-ups triaged** (2026-10-03, `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, `done`):
  - `bug-203` → `task-156`, `bug-204` → `task-165`, `bug-206` → `task-187`;
  - `bug-210` → v0.3, the release's `user-docs` phase, no task;
  - `bug-205`, `bug-207`, `bug-208`, `bug-209`, `bug-211` → v0.4.
  `main` is not pushed past `ea637c43`, on the approver's instruction.
- **2026-10-05 — batch B5 `done`** (`task-153`, `154`, `158`, `159`, `162`, `163`).
  - **Review.** Every task had an independent review, all "approve with fixes", every fix applied in-task.
    The reviews of `162` and `163` stalled once (stream watchdog) and were resumed.
  - **`task-158` stopped after design**: its ACs needed notes on two `accepted` ADRs while `adr` was
    `amendable: false`.
  - **Approver rulings:**
    - `task-158`: `adr` becomes `amendable: true` for dated correction and Revision notes (a changed
      decision is still a new ADR, `dl-108` A3), in `memory.yaml` (2.2) and in the `wingfoil init`
      scaffold. This revises the `task-127` ruling for `adr`.
    - `task-154`: the command-level latency suite runs only when asked (`npm run test:latency`,
      `WINGFOIL_LATENCY=1`), never in CI or `prepublishOnly`. REQ-PERF-02 says "return in", startup
      included, while the suite asserts the marginal cost over a `--version` floor: the deviation goes to
      a decision-log.
    - Confirmed at the gate:
      - `153`: P1.13 scenario 4 and the commented `bug` machine example.
      - `158`: the rewritten AC2 and the added AC3.
      - `159`: the P2.2 quoted-list step and the frozen-archive header in `00_index.md`.
      - `162`: two commits (approve, then `finalize` of the superseded element), the `finalize` verb,
        and no trigger on types without the edge.
      - `163`: `{date}` from the add commit's author date in UTC, the commit authored by the checked
        identity, `--set date`/`--set author` refused, and `dl-107` left as is.
  - **Amendments: 15.**
    - `task-153`: spec-001, spec-010, spec-011.
    - `task-154`: spec-015.
    - `task-158`: spec-001, adr-001, adr-010 — the first `wf(adr): amend` commits.
    - `task-162`: spec-001, spec-010, spec-008, spec-004, spec-006.
    - `task-163`: spec-001, spec-008, spec-009.
  - **Bugs closed:** bug-012, bug-013, bug-014, bug-033, bug-052, bug-053, bug-054, bug-069, bug-105,
    bug-106, bug-107, bug-157, bug-158, bug-176, bug-177, bug-196.
  - **Merges,** in order 153 → 158 → 162 → 163 → 159 → 154. Conflicts:
    - `.wingfoil/memory.yaml`'s `version` line (153's 2.1 and 158's 2.2) was resolved to 2.2, keeping both
      comments.
    - The Revision notes appended to spec-001, spec-010 and spec-008 were all kept, in merge order.
  - **Gates on `main`** (`be8184ec`):
    - `test:coverage`: 214 suites, 3844 tests; coverage 98.88 / 95.53 / 95.34 / 99.57.
    - `npm test` (parallel pass only) green; lint, `docs:api` and both `tsc` exit 0; e2e smoke 19/19 ok.
    - `npm run test:latency`, run at load ~18: 5/5. Marginal p95 was 439 / 284 / 383 ms; the total p95
      (reported only) was 1028 / 872 / 972 ms.
  - **Governance check over B5:** `--base f579bc17` gives 87 gated `wf()` commits, 0 findings, exit 0.
  - **Not pushed** (approver's instruction).
  - **Follow-ups:** filed by `bug-ingest-rel-v0.3-w1b5-review-findings-plan`, plus a decision-log on
    REQ-PERF-02. Triage pending.
  - **Fix share:** 17 open fix tasks of 81 open (21.0%), under the threshold.
  - **Next:** B6 (`156`, `157`, `160`, `164`, `165`).
- **2026-10-05 — B5 follow-ups triaged** (`bug-ingest-rel-v0.3-w1b5-review-findings-plan`, `done`):
  - `bug-212` → `task-186`, `bug-213` → `task-188`, `bug-214` → `task-180`, `bug-217` → `task-210`,
    `bug-218` → `task-208`, `bug-219` → `task-209`;
  - `bug-220` → v0.3, the release's `user-docs` phase (`align-agent-docs`), no task;
  - `bug-215`, `bug-216`, `bug-221` → v0.4.

  `dl-146` ratified (C; Q2 marginal 1,000 ms; Q3 REQ-PERF-03 follows) → new
  `task-248-assert-req-perf-02-s-total-and-marginal-budgets-on-an-idle-machine` (`backlog`). Intake:
  `dl-147` (benchmark cost finding, `in-discussion`) fast-forwarded to `0cb289e6`.
- **2026-10-05 — batch B6 `done`** (`task-156`, `157`, `160`, `164`, `165`) — **wave 1 closed**: 42/42.
  - **Review.** Every task had an independent review, all "approve with fixes", every fix applied in-task.
  - **Confirmed at the gate:**
    - `156`: the colour flags and rule kept as P5.1.4's contract; AC2 as characterization.
    - `157`: AC1 red-first. AC3 (add and claim the Glama listing, then a `service` element) is the
      approver's, after the push.
    - `160`: AC2 by a local Scorecard run before the push, then the first CI run.
    - `164`: the `rl-` literal until `dl-090`.
    - `165`: dl-046 C applied by renaming rows, and the `scheduledIn` allowlist reason kind.
  - **Amendments: 8.**
    - `task-165`: spec-008, spec-005, spec-006, spec-004, spec-015.
    - `task-156`: spec-008.
    - `task-157`: spec-015.
    - `task-164`: spec-001.
    - After merge, one `memory amend` on `task-160`: its Execution Notes read "secret: scorecard-action",
      which the repository's own REQ-SEC-08 scan flagged as a key assignment. Reworded (`9df1bab8`).
  - **Bugs closed:** bug-028, bug-152, bug-163, bug-179, bug-203, bug-204.
  - **Merges,** in order 165 → 156 → 157 → 160 → 164. Only Revision notes conflicted (spec-008 and
    spec-015), all kept.
  - **Gates on `main`:**
    - `test:coverage`: 218 suites, 3887 tests, coverage 98.88 / 95.57 / 95.34 / 99.58 (after the amend
      above). lint, `docs:api` and both `tsc` exit 0; e2e smoke 19/19.
    - `test:latency` at load ~16: 5/5. Totals reach 1,097–1,102 ms, which is what task-248 bounds on an
      idle machine.
    - Governance check over B6 (`--base 0cb289e6`): 0 findings.
  - **Local Scorecard run** (`ghcr.io/ossf/scorecard:v5.5.0` against `github.com/wingfoil/wingfoil` at
    `ea637c43`, the pushed head), before any push: aggregate 3.9.
    - 10: Binary-Artifacts, Dangerous-Workflow, License, Pinned-Dependencies, Token-Permissions.
    - 4: Security-Policy. 3: Contributors.
    - 0: Branch-Protection, CII-Best-Practices, Code-Review, Dependency-Update-Tool, Fuzzing,
      Maintained (repo < 90 days), SAST, Vulnerabilities (38 OSV advisories; `npm audit --omit=dev`:
      3 high, 3 moderate).
    - Inconclusive: CI-Tests, Packaging, Signed-Releases.
  - **Not pushed** yet (approver).
  - **Follow-ups:** filed by `bug-ingest-rel-v0.3-w1b6-review-findings-plan`, among them the 64 KiB pipe
    truncation and the production advisories.
  - **Open tasks:** 77 (14 fix), all `backlog`, including task-248.
  - **Next:** wave 2.
- **2026-10-05 — wave 2 opened; batch B1 `done`** (`task-250`, `249`, `192`, `185`, `175`, `171`, `177`, `176`).
  - **Batches.** Four, in §3. The v0.2 worktrees `task-093` … `task-106` (all clean and merged) were removed
    with their branches, on the approver's instruction.
  - **Interruptions.** The session stopped abruptly once and hit the API usage limit twice. Every agent was
    resumed from its transcript; stale `.jest-dist.lock` files with dead pids were removed by the agents.
  - **Review.** Every task had an independent review, all "approve with fixes" except `task-250` ("approve",
    one fix), every fix applied in-task. `171`, `175`, `176` and `192` had a focused re-review after their
    fixes changed the design; `171`'s found one regression (an `EACCES` escaping an explain-only walk), fixed.
    `171`'s first review found that the governance check failed open on an unreadable revision once the
    reconstruction became tolerant: the check now reads strictly.
  - **Approver rulings:**
    - D1 (`task-175`): the key rules of a `bindings.yaml` collection are a loader row,
      `E_BINDING_COLLECTION_KEY`, not a structural failure, so the file stays decided.
    - D2 (`task-175`): the retrospective's friction inventory lives outside every Memory path,
      `docs/06_retrospectives/rl-{release-line}/rel-{version}-friction-inventory.md`.
    - D3 (`task-176`): a module is selected by name or by path prefix at a `/` boundary; when nothing matches,
      all modules and a note.
    - D4 (`task-192`): `-dirty` only for a change to a build input (`src`, `package*.json`, `tsconfig*.json`,
      `scripts/write-build-info.cjs`).
    - D5 (`task-192`): `memory history` entries always carry `wingfoil`, `null` without the trailer.
    - Confirmed at the gate: the developers' decisions each task's approve Reason names.
  - **Amendments: 10.**
    - `task-250`: spec-015. `task-249`: spec-005. `task-185`: spec-003. `task-171`: spec-004, spec-012.
    - `task-192`: spec-008, spec-004. `task-175`: spec-003. `task-176`: spec-012, spec-016.
  - **Bugs closed:** bug-031, bug-051, bug-164, bug-188, bug-189, bug-201, bug-222, bug-223.
  - **Merges,** in order 250 → 249 → 185 → 171 → 177 (first approval), then 192 → 175 → 176 (second).
    - **Integration fix** `ff82aa04` (branch `fix/w2b1-agent-discovery-atheador`): `task-177` called `atHeadOr`
      with the two-argument form `task-171` had just replaced; each branch compiled alone, the merge failed
      `tsc` (TS2554), so jest's `globalSetup` build failed too. One line.
    - `175`, `176` and `192` merged `main` into their branches before their gate; only Revision notes and two
      adjacent field declarations (`unreadable` / `wingfoil`) conflicted, all kept.
  - **First commits stamped by the tool itself:** the amends of `task-192` onwards carry
    `WingFoil-Version: 0.2.2 (<sha>)`, clean although the worktree held pending spec edits (D4). The
    `Approver:`/`Reason:` paragraph is no longer git's trailer block, so `%(trailers:key=Approver)` no longer
    reads it; nothing in `src/`, `scripts/` or `tools/` used it.
  - **Gates on `main`** (`a5ef0b75`): `test:coverage` 233 suites, 4289 tests, coverage 98.99 / 96.16 / 96.08 /
    99.61; lint, `docs:api`, both `tsc`, `check:audit` (0 vulnerabilities) exit 0; e2e smoke 19/19.
  - **Governance check:** `--base c80167d6` gives 79 gated `wf()` commits on `0bb7f6d6`, 0 findings.
  - **Intake** fast-forwarded twice: `dl-148` (docs showcase, `in-discussion`) at `ca1919c6`; `dl-149` (a
    `format:` key distinct from `version:`) and `task-251` at `3fea170d`. The approver ratified `dl-149`
    (`ee44906f`, urgent for v0.3) and approved `task-251` into the backlog (`535cd598`), scheduled in B2.
  - **Follow-ups:** 14 items (bugs, two decision-log candidates, handover notes) to be filed through
    `bug-ingest-rel-v0.3-w2b1-review-findings-plan`, triage pending.
  - **Fix share:** 11 open fix tasks of 70 open (15.7%), under the threshold.
  - **Next:** B2 (`174`, `172`, `178`, `173`, `191`, `182`, `251`).
- **2026-10-05 — W2 B1 follow-ups triaged** (`bug-ingest-rel-v0.3-w2b1-review-findings-plan`):
  - `bug-231` → `task-195`, `bug-234` → `task-200`, `bug-238` → `task-190`;
  - `bug-230` → new `task-253`, `bug-235` → new `task-254` (both `backlog`, B4);
  - `bug-232`, `bug-233` → v0.3, carried by `task-255` (below);
  - `bug-236` → `task-252` (at the B2 gate), `bug-237` → `task-174` (closed at the B2 gate), `bug-239` → v0.3
    user-docs, no task.
  - Handover notes on `task-218` and `task-195` (`97a3aff3`, `64ab74ac`): forward the context builder's warnings.
  - `dl-137` amended with the WingFoil-Templates `base` constraints R1–R4 and ratified (Q1 (b), Q2 (iii), Q3: part
    (a) in v0.3, part (b) in v0.4), `release: v0.3`; part (a) is `task-252`, executed inside `align-agent-docs`.
    This repository is not synchronized with the `base` pack before v0.3 ends (approver).
- **2026-10-05 — batch B2 `done`** (`task-172`, `251`, `174`, `178`, `173`, `191`, `182`).
  - **Review.** Every task had an independent review: "approve" for `172` and `182`, "approve with fixes" for the
    rest, every fix applied in-task. A rate limit stopped `174`'s fixes and `251`'s review once; both resumed.
  - **Approver rulings:**
    - `task-251`: Memory elements keep the `format:` their template carries (it states the element file's format;
      `tmpl_version` stays the template revision). No reader checks an element's format yet: follow-up.
    - `task-178`: the `intake/` prefix and the on-main exceptions go to a decision-log (4 (b)); git-conventions §7
      applies to hand sessions once `team.agents` carries an email (follow-up).
    - `dl-150` ratified with B and `dl-151` with A → new `task-255` (`pending`, B4).
    - Confirmed at the gate: every developer decision the approve Reasons name (group A).
  - **Amendments: 12** — `251`: spec-001, 002, 003, 013; `174`: spec-004, 014, 006, 008; `173`: bug-050, task-086
    (also gains `kind: "fix"`, required since `dl-133`), spec-008; `182`: spec-007.
  - **Bugs closed:** bug-035, bug-055, bug-073, bug-121, bug-151, bug-184, bug-185, bug-190, bug-228, bug-237.
  - **Merges,** in order 172 → 251 → 174 → 178 → 173 → 191 → 182; only spec-008's two Revision notes conflicted
    (both kept). `173`'s amendments were recorded before its merge: without them its control-character gate fails
    on the two documents that still held raw bytes.
  - **Gates on `main`** (`07000bc0`): `test:coverage` 243 suites, 4609 tests, coverage 99.07 / 96.18 / 96.18 /
    99.68; lint, `docs:api`, both `tsc`, `npm run typecheck`, `check:audit` (0 vulnerabilities) exit 0; e2e smoke
    19/19.
  - **Governance check:** `--base 0b297169` gives 145 gated `wf()` commits on `d3724884`, 0 findings.
  - **Follow-ups:** filed by `bug-ingest-rel-v0.3-w2b2-review-findings-plan` (in progress). The push-protection
    `service` element of `task-182` waits for the approver's verify run.
  - **Fix share:** 13 open fix tasks of 69 open (18.8%; the three new fix tasks 253–255 included), under the threshold.
  - **Next:** B3 (`179`, `180`, `181`, `188`, `193`, `190`, `183`).
- **2026-10-05 — W2 B2 follow-ups triaged** (`bug-ingest-rel-v0.3-w2b2-review-findings-plan`, `done`):
  `task-255` (dl-150 B, dl-151 A; bug-232, bug-233) approved into B4; `bug-242` → `task-200`, `bug-245` →
  `task-179`, `bug-248` → handover on `task-205`, `bug-246`/`bug-247` → v0.4; new `task-256` (`bug-240` +
  `dl-152`), `task-257` (`bug-241`, `bug-243`), `task-258` (`bug-244`) in B4; `dl-152` and `dl-153` ratified
  (handover on `task-199`); `bug-227` gains the CHANGELOG list. `task-252` (dl-137 part (a)) carries the WingFoil-
  Templates `base` marker pair; `dl-148` corrected (all four showcased projects public).
- **2026-10-06 — batch B3 `done`** (`task-180`, `179`, `193`, `188`, `190`, `183`, `181`).
  - **Review.** Every task had an independent review: "approve" for `190`, "approve with fixes" for the rest, every
    fix applied in-task. Focused re-reviews: `180` (twice: the governance check first accepted `park` along any edge),
    `193` (the CRLF post-write check, a shared write-guard change), `181` (after `dl-154`). Two API rate limits
    stopped `179` and `180` mid-fix; both resumed.
  - **Semantic conflict caught in review:** `task-180` pinned the old canonical edge for an illegal `park`, which
    `task-181` changes to `(none)`; `180`'s pins were made target-agnostic before submit and `181` re-pinned them after
    merging `main`.
  - **Approver rulings:**
    - `task-181`: D1 option A (`(none)`), D2 a new decision-log: `dl-154` (ratified, release v0.3); `dl-053` gets a
      pointer note and is deprecated (`a4fe6ce1`); REQ-STATE-01 and the BDD cite `dl-154`.
    - `task-179`: the missing-verb form supersedes `task-103`'s wording; the P2.1 scenario rewrite is ratified.
    - Confirmed at the gate: every developer decision the approve Reasons name.
  - **Amendments: 17** — `180`: spec-001, 003, 006, 008, 010; `179`: spec-005, 008, 006; `193`: spec-008, 002;
    `188`: spec-011, 009, 013, adr-008; `181`: spec-004, 005, dl-053.
  - **Bugs closed:** bug-019, bug-040, bug-104, bug-126, bug-143, bug-165, bug-168, bug-180, bug-191, bug-198,
    bug-213, bug-214, bug-225, bug-226, bug-238, bug-245.
  - **Merges,** in order 180 → 179 → 193 → 188 → 190 → 183 → 181. Conflicts: Revision notes in spec-006 and spec-008
    (kept), the `src/core/index.ts` import block (179 × 193, `CoreFlag` + `missingOperandReason` kept).
    - **Integration fix** `6667fe5f`: `memory park`'s core missing-operand message takes the one form task-179 gave
      every operation (179 × 180).
    - **Gate finding** `d74b5a7a`: a critical advisory published during the batch (`proxy-addr`
      GHSA-jqcg-44mw-7w3h, via `@modelcontextprotocol/sdk` → `express`) turned `check:audit` red on `main`; the lock
      moves `proxy-addr` 2.0.7 → 2.0.8 only (approver). The dev tree now carries a `sprintf-js` advisory whose fix is
      breaking, so the scheduled `check:audit:all` is red: follow-up.
  - **`svc-015`** (push-protection bypasses for the secret-scan fixture, `task-182`'s prepared element) added and
    approved after the approver's verify: secret scanning and push protection enabled, 0 alerts.
  - **Gates on `main`** (`29d2aea2`): `test:coverage` 259 suites, 4861 tests, coverage 99.11 / 96.30 / 96.27 /
    99.69; lint, `docs:api`, both `tsc`, `npm run typecheck`, `check:audit` (0 vulnerabilities) exit 0; e2e smoke
    19/19.
  - **Governance check:** `--base 0cf8b131` gives 102 gated `wf()` commits, 0 findings.
  - **Follow-ups:** filed by `bug-ingest-rel-v0.3-w2b3-review-findings-plan` (in progress).
  - **Fix share:** 10 open fix tasks of 65 open (15.4%), under the threshold.
  - **Next:** B4 (`184`, `186`, `187`, `189`, `248`, `253`, `254`, `255`, `256`, `257`, `258`), to be split in two
    batches at its opening.
