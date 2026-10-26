---
id: "release-implementation-rel-v0.1-plan"
type: plan
title: "Release implementation — v0.1 (orchestration of the 33 dev-loop runs)"
status: active
workflow: "dev-loop"
phase: "rel-v0.1"
element: "minor-v0.1"
parent: "release-cycle.implementation"
release: "v0.1"
tmpl_version: 261010
---

# Release Implementation — v0.1 Orchestration Plan

## Context

`minor-v0.1` is `in-development`; its `planning` phase is done — 33 backlog tasks (`task-001..033`,
all `status: backlog`; `docs/05_plans/rl-v1/rel-v0.1/release-planning-rel-v0.1-plan.md`). Per
`release-cycle`, the `implementation` phase runs `dev-loop` once per backlog task tagged `v0.1`
(`iterate_over: task, where: { status: [backlog], tags: ["v0.1"] }`) — 33 runs.

The **per-task mechanics** (phases, roles, checks, git conventions) are already fully specified in
`docs/05_plans/rl-v1/rel-v0.1/dev-loop-rel-v0.1-plan.md` — this document does not re-derive them.
This document is the **orchestration layer above it**: how to actually run 33 dev-loops — sequenced
and parallelized in waves, using Claude Code's own **Workflow tool** (agent-fleet orchestration
capability of this development session) as the execution mechanism — plus human checkpoints between
waves and an execution log.

> **Important distinction:** the Claude Code **Workflow tool** used here is *not* part of the
> `wingfoil` product being designed (which has no workflow engine yet — CLAUDE.md §6/§10.7). It is a
> separate, already-real capability of this dogfooding session, used purely as the vehicle to *drive*
> `dev-loop`'s manually-simulated phases in parallel across many tasks. This plan only *describes* how
> that tool would be invoked (§5) — it does not invoke it. Running it is a separate, later step.

**Prior art:** `docs/05_plans/release-implementation-v0.1.md` (commit `86c549f2`, on the abandoned
branch `fix/add_design_step_on_dev_loop`) proposed this exact shape — wave structure, per-task
model assignment, human checkpoints, execution log — against an older config: 32 tasks
(`task-001..028` + `task-107..110`), `dev-loop`'s pre-`design`-phase 6-step numbering (`Phase 0..5`),
and `docs/05_plans/release-cycle-v0.1.md` as the authoritative plan. This document reuses that
structure, fully re-derived against the **current** 33-task registry, the current 7-phase
`dev-loop.yaml`, and `dev-loop-rel-v0.1-plan.md`. See §7 for the full comparison.

---

## 1. Wave structure

The current 33-task registry (`docs/05_plans/rl-v1/rel-v0.1/dev-loop-rel-v0.1-plan.md` §4) splits
into the same 5 waves as the prior-art plan, by dependency order:

| Wave | Tasks | # | Precondition |
|---|---|---|---|
| 0 | `task-001` (Node.js/TS scaffold) | 1 | — (starting point) |
| 1 | `task-002` (validation pipeline + ID engine) | 1 | Wave 0 approved + merged to `main` |
| 2 | `task-003..017` (infra `REQ-*`/`REQ-PERF-*`/`REQ-STATE-08`/`REQ-INT-*`/`REQ-SEC-*`) | 15 | Wave 1 approved + merged |
| 3 | `task-018..030` (feature `P1.*`/`P2.*`/`P5.*`) | 13 | Wave 2 approved + merged |
| 4 | `task-031..033` (`dna.yaml` sync, README/CLI docs, manual E2E validation) | 3 | Wave 3 approved + merged |

Wave 0/1 stay single-task (they are the two prerequisites every other task assumes). Waves 2 and 3
group independent tasks that can run **concurrently** within the wave (each in its own worktree —
§2). Wave 4 grows from 2 tasks (prior art) to 3: `release-planning-rel-v0.1-plan.md` added
`task-033` (manual E2E validation of Journey 0a + Journey 1) as a proactive addition beyond the
original 32-task backlog — see §7.

---

## 2. Per-task execution (delegates to `dev-loop-rel-v0.1-plan.md`)

Every task in every wave runs exactly the phase sequence in `dev-loop-rel-v0.1-plan.md` §3
(`start → design → red → green → refactor → review → done`), under the git conventions in its §2 —
**including the forced `task/{task.id}` branch naming, per-task git worktree, and `--no-ff` merge**
(`dl-014-dev-loop-plan-deltas` G1–G3, forced ahead of its approval, per the user's explicit
instruction).

**This orchestration plan is the concrete reason the branch/worktree forcing was needed:** waves 2
and 3 run 15 and 13 tasks respectively; without per-task worktree isolation, those tasks could not
check out their branches concurrently on a single shared working tree. `dev-loop-rel-v0.1-plan.md`'s
forcing note now has a load-bearing consumer, not just a hypothetical one. The `--no-ff` merge
strategy (G3) was forced later, after Wave 0 had already run — see §7 and §8.

**A dev agent never self-approves or merges.** It runs `start → design → red → green → refactor`
autonomously, then `review`'s `tests.bdd.run` + `memory.submit` (`in-progress → in-review`) — and
stops there. `design`'s and `review`'s approval gates are both `by_role: approver` in `dev-loop.yaml`
— i.e. Roberto, not an agent (CLAUDE.md §4/§8: agents never self-approve).

---

## 3. Agent / model assignments

Reviewer is uniformly `opus` (higher scrutiny for every merge into `main`). Dev-agent model follows
task complexity — same assignments as the prior-art plan, **remapped by feature id** (task numbering
changed between the two plans — see §7):

| Task(s) | Dev agent | Review agent | Note |
|---|---|---|---|
| `task-001` | sonnet | opus | Standard TS/Node.js scaffold |
| `task-002` | opus | opus | Cross-cutting: Zod validation pipeline + ID generation engine |
| `task-003..017` (infra) | sonnet | opus | One `REQ-*` per task |
| `task-018..021` (P1.1/P1.2/P1.3/P1.5) | sonnet | opus | Memory CRUD + CLI |
| `task-022` (P1.11), `task-023` (P1.12) | sonnet | opus | Memory entries + keyword search |
| `task-024` (P1.13 — memory element schema) | opus | opus | Multi-type state-machine engine |
| `task-025..026` (P2.1/P2.2) | sonnet | opus | DNA CLI read/write |
| `task-027` (P2.4 — project DNA config) | sonnet | opus | Structured config |
| `task-028` (P2.5 — paths) | sonnet | opus | Path resolution |
| `task-029` (P5.1.1 — `wingfoil init`) | opus | opus | Interactive multi-pillar wizard |
| `task-030` (P5.2.1 — MCP Resources) | opus | opus | MCP protocol surface |
| `task-031..032` (config sync, README/CLI docs) | sonnet | opus | |
| `task-033` (manual E2E validation) | sonnet | opus | New vs. prior art (§7) — validation task, not a code deliverable |

---

## 4. Human checkpoints

Extracted from `dev-loop.yaml`'s `approval:`/`fallback:` blocks and `release-cycle`'s later phases —
none of this is invented, all of it cites the actual workflow config:

| # | When | Roberto's action (`approver`) | Resulting commit / effect |
|---|---|---|---|
| conditional, per task | `design` phase finds a tech-spec gap (rare — most of the 33 tasks already cite an approved spec/ADR/REQ; `dev-loop-rel-v0.1-plan.md` §3.2) | Review + approve/reject the newly-scaffolded spec | `wf(tech-spec): approve {id} [pending → approved]`, or reject → `dev-loop.yaml`'s `design` fallback (`design` again) |
| every task | Task reaches `in-review` (end of `review` phase) | Read the review-agent's verdict → approve or reject | Approve: on the task's own `task/{id}` branch, `memory.approve(self): {id} [in-review → approved]` (Approver/Reason body, CLAUDE.md §5.1) **then** `element.set_state(done): {id} [approved → done]` — both commits land on `task/{id}` before it is touched further — **then** `done`'s `git.merge(to: main, ff: false)` (carries both commits in) + worktree/branch cleanup. Reject: `memory.submit(self): {id} [in-review → in-progress]` per `dev-loop.yaml`'s `review` fallback (`step: red`) |
| once, after wave 4 | All 33 tasks `done` | QA full suite + coverage ≥ 80% gate, then `release-submit`'s `pre-release-checks` | No commit (automated check) |
| once | `pre-release-checks` passes | Move release to `releasing`, then approve publishing | `release-submit`'s `enter-releasing` + `approve-release` (`by_role: approver`) |
| once | Published | Approve the retrospective | `retrospective`'s `approve` phase (`by_role: approver`) |

None of `dev-loop.yaml`'s actions are executed by a wave's dev/review agents themselves — every
`memory.approve`/`memory.reject`/merge is performed by the orchestrator (this conversation) **only**
on Roberto's explicit instruction, per CLAUDE.md §4/§8.

---

## 5. Workflow invocation sketch (illustrative only — not executed by this document)

One wave = one `Workflow` tool script invocation. Each task in the wave is one `agent()` call, run
concurrently via `parallel()`, isolated in its own worktree (mapping directly onto the forced
convention in §2):

```
phase('Wave 2 — infra tasks')
const results = await parallel(INFRA_TASKS.map(t => () =>
  agent(devLoopPrompt(t), {
    label: t.id,
    model: t.model,              // sonnet per §3, opus for the few flagged tasks
    isolation: 'worktree',       // one branch/worktree per task — dl-014 forcing, §2
  })
))
// each agent runs start -> design -> red -> green -> refactor -> review, stops at in-review
const reviewed = await parallel(results.map((r, i) => () =>
  agent(reviewPrompt(INFRA_TASKS[i], r), { label: `review:${INFRA_TASKS[i].id}`, model: 'opus' })
))
// reviewed[] verdicts return to THIS conversation — Roberto checkpoints here (§4), not inside the script
```

This is a sketch to make the mapping concrete, not a script to run now. Per the `Workflow` tool's own
usage rules, it is only invoked on the user's explicit opt-in (e.g. an explicit "run a workflow"
request) — preparing this plan is not that request. Executing it is the next, separate step
(`esegui piano per release implementation`, per the user's own roadmap notes).

---

## 6. Preconditions / launch checklist

- [x] `minor-v0.1` — `status: in-development`.
- [x] All 33 tasks — `status: backlog` (`release-planning-rel-v0.1-plan.md`).
- [x] `dev-loop-rel-v0.1-plan.md` — written, covers per-task mechanics + forced branch/worktree convention.
- [x] ADRs `adr-001..008` `accepted`, Decision Logs `dl-001..012` `ready`, tech-specs `spec-001..012`
  `approved` — the `design` phase safety net should find no gaps for most tasks.
- [ ] **Not yet run:** no wave has started; no task has moved past `backlog`.

Next: Wave 0 (`task-001-nodejs-typescript-scaffold`) — the sole prerequisite before Wave 1
(`task-002-validation-id-engine`), which everything else depends on.

---

## 7. Comparison vs. prior art (commit `86c549f2`, branch `fix/add_design_step_on_dev_loop`)

**Not an ancestor of `main`** — an abandoned attempt at this same orchestration layer, against a
config version that predates the `rl-v1` restructuring.

| Aspect | Prior art (`86c549f2`) | This plan | Why it changed |
|---|---|---|---|
| Task count / numbering | 32 tasks: `task-001..028` (old flat numbering) + `task-107..110` (4 late additions) | 33 tasks: `task-001..033`, renumbered by intended execution order (`release-planning-rel-v0.1-plan.md` §5) | `rl-v1` restructuring + the user's explicit choice not to mirror `v0.1.json` numbering (`feedback_backlog_json_not_authoritative`) |
| Wave sizes | 1 / 1 / 15 / 13 / 2 | 1 / 1 / 15 / 13 / **3** | Identical shape except Wave 4 — `task-033` (manual E2E validation) is a proactive addition not present in the old 32-task backlog |
| Dev-loop phase model | `Phase 0..5` (plan-commit, start, red, green, refactor, review) — predates the `design` phase | 7 phases incl. `design` (`dev-loop-rel-v0.1-plan.md` §3) | `design`-phase-as-safety-net was added to `dev-loop.yaml` independently after this prior art was written |
| Branch/worktree | `task/{task.id}` + worktree, stated as already-adopted convention | Same shape, but explicitly **forced** ahead of formal approval — `dl-002-git-branching-trunk-based` (`ready`) actually adopted the *opposite* (bare branch, no worktree); `dl-014-dev-loop-plan-deltas` (`in-discussion`) proposes superseding it | The prior-art plan predates `dl-002` entirely, so it never had to reconcile with it; this plan does (`dev-loop-rel-v0.1-plan.md` §2) |
| Merge strategy | `git merge --no-ff task/{id}` | Initially plain `git.merge(to: main)` (branch/worktree forcing only) — **`--no-ff` forced afterward** (`dl-014` G3), once Wave 0 had already run once under the plain strategy (§8) | The user's forcing instruction initially covered only branch naming + worktree; extended to `--no-ff` in a later instruction, so it converges back onto the prior-art shape (`dev-loop-rel-v0.1-plan.md` §2) |
| Model assignments | Opus for cross-cutting/complex tasks (validation engine, schema validator, init wizard, MCP server), sonnet otherwise | Same 4 tasks flagged opus, remapped from old task IDs to current ones **by feature id** (`P1.13`, `P5.1.1`, `P5.2.1`, plus the validation/ID engine task) — raw task numbers are not stable across the two plans | Task numbering changed; feature id is the only reference stable across both |
| Execution log | Wave 0 logged complete in a later commit (`e3e879b`) on the same prior-art branch | Empty — nothing has run yet in this lineage | This plan starts fresh; the prior art's Wave-0 log belongs to its own (abandoned) execution, not this one |

---

## 8. Execution log

| Wave | Started | Workflow run ID | Tasks → `in-review` | Approved | Merged to `main` | Notes |
|---|---|---|---|---|---|---|
| 0 (`task-001`) | 2026-07-04 | — (direct `Agent` tool, not `Workflow` — single-task wave, §5.2 of the orchestration design) | `task-001` → in-review (dev agent: sonnet) | Approved by Roberto after independent review (opus): 2026-07-04 | `52cfc52` — real merge commit (`--no-ff`, `dl-014` G3, forced per this instruction), parents `7d823e3`+`faa8cea`; `task/task-001-nodejs-typescript-scaffold` branch deleted post-merge | History rewritten after the initial run (git commit hashes for this task's chain changed — the ones cited elsewhere in this doc's prose predate the rewrite); a pre-existing untracked `.gitignore` on `main` collided with the branch's tracked one at merge time, resolved by union, no entries lost |
| 1 (`task-002`) | 2026-07-04 | — (direct `Agent` tool, opus dev + opus review, §5.2) | `task-002` → in-review (dev agent: opus) | Approved by Roberto after independent review (opus) + one authorized in-cycle addition: 2026-07-04 | `6c2b2ed` — `--no-ff` merge (first use of the newly forced `dl-014` G3 convention), parents `06d6b8d`+`2298a26`; branch deleted post-merge; `done` commit `8a9fbf5` | Review flagged a spec-internal contradiction: `spec-009` §2 prose requires recursive nested-block unknown-field warnings, but its own reference listing (and the first implementation) was root-only. Roberto chose **option A** (extend the module now) over amending the spec — a second dev-agent pass added recursion (`ceffaf0`), a focused follow-up review (opus) confirmed it was genuine and didn't disturb the known-defective guard, then approval/merge proceeded. |
| 2 (infra ×15) | 2026-07-04 | — (**run FULLY SEQUENTIAL, one task at a time, via direct `Agent` tool — not the `Workflow` pipeline in §5**; see note below the table) | `task-003` → in-review (dev: sonnet) | `task-003` approved by Roberto after independent opus review (approve, 0 blockers): 2026-07-04 | `task-003` → `0337ce3` (`--no-ff`, carries approve+done from branch); worktree + `task/task-003-git-backed-sot` deleted post-merge | **`task-003` done** (`0337ce3`; `src/storage/` per `dna.yaml` module map, not `src/core/`; code subjects reworded `(core)`→`(storage)`). **`task-004` done** (`82de5c1`; 4 per-pillar Zod schemas + loaders, 132 tests; added `js-yaml` dep; semantics-preserving YAML-quoting fix in live `dev-loop`/`end-of-life` workflow yaml; opus review approve, 0 blockers). Fast-follow: `spec-013-directive-frontmatter-schema` authored + **approved** (blesses the `[AUTHORING]` directives schema), task-004 AC literal error `directives/*.yaml`→`.md` corrected. **`task-005` done** (`e4f9966`; transition-legality engine `src/memory/state-machine.ts`, reuses task-004's schema unchanged, 158 tests; opus review hand-traced all 7 types vs spec-001, 0 blockers). Env fix mid-`task-005`: `@types/js-yaml` was missing from `node_modules` (tsc broken on main since task-004) — reinstalled, lockfile unchanged. **`task-006` done** (`1c47f6f`; CoreModule registry + thin CLI/MCP adapters + parity test, 202 tests; opus review compiled+ran `program.ts` live, 0 blockers). Commander v15 ESM-only → registrar logic tested, thin `program.ts` wiring via dynamic import. Fast-follows: reconciled `spec-006` §3/§5 MCP naming to `spec-004` (`2a67eef`); added compile-then-spawn CLI integration smoke test (`4ea5800`, adds a `tsc` build to every `npx jest`). **`task-007` done** (`8663b2a`; real `wingfoil` bin `src/cli.ts`→`dist/cli.js` + npm packaging, 214 tests; opus review verified `npm pack` ships only dist+README, `--help` exit 0; merged as-is). 2 out-of-AC gaps opened as bugs `bug-001-cli-version-flag` (medium) + `bug-002-cli-error-stack-dump` (high), both `open`, rooted in task-006's buildProgram. spec-014 (packaging spec) deferred; real `npm publish` gated on task-032. **task-008 done** (`3a2df73`; REQ-PERF-02 query-path foundation — `src/memory/query.ts` deterministic keyword/frontmatter search + `computeMemoryContentRoots` from memory.yaml path patterns, `src/memory/history.ts` git-log walk, `splitFrontmatter` helper; `test/core/query-latency.test.ts` benchmark on a deterministic 1,000-doc fixture, p95 over 25 runs: dna show ~0.87ms / memory search ~91ms / memory history ~18ms — all 2–3 orders under the 1,000ms budget; 244 tests; opus review reproduced green + confirmed the benchmark does a real 1,000-doc scan, approve/0 blockers). Scoping call (accepted by Roberto): primitives live in `src/memory` and are NOT yet registered as `src/core` CoreOperations — registry/CLI/MCP wiring deferred to task-021 (memory search) / task-026 (dna show); `dna show` reused task-006's already-registered `dnaShow`. Reviewer follow-ups (non-blocking): task-021/026 must wrap these primitives (not reimplement) and re-point the perf test at the registered ops; `getMemoryHistory` has no scheduled v0.1 consumer yet (P1.10 unscheduled) — built ahead. **task-009 done** (`4de6c25`; REQ-PERF-04 MCP Resource-fetch latency foundation — thin read-only adapter over task-008's primitives: `findMemoryDocumentById` in `src/memory/query.ts` + `registerMemoryDocumentResource` in new `src/mcp/memory-resource.ts` (`ResourceTemplate('wingfoil://memory/{id}')` via `registerResource`), `wingfoil://dna/show` measured through task-006's existing registered path. Benchmark `test/mcp/resource-latency.test.ts` on a 1,000-doc fixture: p95 dna/show ~4ms / memory/{id} worst-case ~82ms; sustained 200-fetch session over one un-restarted connection, no degradation/0 errors. 255 tests; opus review reproduced green + verified benchmark honesty and the SDK dead-branch removal, approve/0 blockers). Review flagged a **false spec-004 §2.1 traceability** in the new doc-comments (`wingfoil://memory/{id}` isn't in spec-004 and collides with its `{type}` collection scheme); Roberto chose fix-then-merge — a focused dev pass (`e1ab61b`) corrected the citations to REQ-PERF-04/AC and documented the divergences (spec-004 §2.1/§2.2 + spec-006 §4 parity deviation; task-030 must **replace, not extend** this URI), confirmed RESOLVED by a targeted re-review. Scoping: bespoke `registerResource` outside task-006's partition is a self-acknowledged spec-006 §4 deviation, safe today (MCP surface is test-only — no production `McpServer`/`StdioServerTransport` wired). Note: `main` had advanced with Roberto's bug-001/bug-002 CLI fixes (both now `closed`) mid-task; the `--no-ff` merge integrated task-009 cleanly on top. **task-010 done** (`4d04fe9`; REQ-STATE-08 default state-machine fallback. No production gap — task-005's `resolveStateMachine` already implemented `typeEntry.states ?? defaults.states`; task-010 delivers the deferred coverage: a throwaway in-test fixture type with no `states:` block + 9 cases exercising every AC bullet end-to-end through the real Zod parse → two-pass legality (add→draft, submit, approve, reject pending→draft with NO `rejected` status, illegal draft→approved rejected leaving status unchanged, REQ-SYS-04 declare-then-remove), closing the two previously-uncovered branches (fallback RHS + neither-declared throw); real `memory.yaml` untouched. 264 tests. Honest TDD: green/refactor were genuine no-ops, no fabricated red. Opus review issued **reject** for 2 documentation miscounts (false "two describe blocks" comment in committed source + Execution-Notes off-by-one "+8/256→264" vs actual "+9/255→264") **and** caught an accidentally-tracked `node_modules` symlink in the doc-fix commit; Roberto chose fix-then-merge — comment/counts corrected + symlink untracked via amend, all re-verified (branch tree = only the 3 intended files). **task-011 done** (`32bcc56`; REQ-INT-01 MCP Resources read-only. Full spec-004 §2 read-only channel — Roberto chose the "replace task-009's placeholder" scope. 6 conformant URI forms: `wingfoil://memory/{type}` collection frontmatter-only + `{type}/{id}` text/markdown+metadata{id,type,status,title}, `dna[/{section}]`, `workflows[/{name}]`; new `src/mcp/{memory,dna,workflow}-resource.ts` + shared `read-only.ts` (byte-exact `resources are read-only` refusal, structural — no write code path; distinct `resource not found` errors) + 2 new `src/memory/query.ts` type-filter primitives (frontmatter `type:`, not directory — release/release-line no-leak test both ways). task-009's colliding `{id}` Resource removed, its REQ-PERF-04 perf test ported to `{type}/{id}` (p95 ~56ms, sustained-session passes). Channel-enumeration byte-unchanged test `test/mcp/helpers/channel-enumeration.ts` established for task-016 to share. 303 tests. Dev agent was cut off by an API error mid-refactor, resumed cleanly. Opus review approve/0 blockers; one interrupted-session leftover (DNA-section handler not routed through the shared `jsonResourceResult` helper + a "four call sites" comment) fixed on-branch (`f5d39dc`) + re-review RESOLVED. Registrar/InMemoryTransport level; production stdio wiring = task-030. **task-012 done** (`16d6f77`; REQ-INT-04 CLI exit-code contract — done by Roberto directly, in parallel with an agent's task-011 run, and merged out of numeric order. Scope: `src/core` owns exit-code *selection* (new `src/core/exit-code.ts` — `ExitCode` enum + `exitCodeForError` mapping every `CoreErrorCode` → `1` + `exitCodeForResult` → `0`/`1`), shared with `src/mcp-server` per REQ-SYS-05; `src/cli/registrar.ts` now exits via `exitCodeForResult` instead of hardcoding `0`/`1`, and `src/cli/exit.ts` re-exports `ExitCode` from core so no CLI path re-invents the mapping (spec-005 §1). Usage errors (`2`) stay surface-level — only invalid `--format` is wired here; the other `2` cases (unknown-command, missing-required-argument) are **deferred to their owning command tasks**, not implemented in this cross-cutting foundation. Tests: `test/core/exit-code.test.ts` (unit — every `CoreErrorCode` → `1`, success → `0`) + `test/cli/registrar.test.ts` (CLI 0/1/2 dispatch matrix through core's selection); suite 264 → 282. Not routed through `dev-loop`'s worktree/`--no-ff` convention (author-direct merge). **task-013 done** (`1da1e14`; REQ-INT-05 machine-readable output formats — verification-only close, **no production code**: the `--format console|json|yaml` envelope already existed from task-006 (`src/cli/output.ts` `isValidFormat`/`renderSuccess`; `--format` registered once on the root `Command`, default `console`; invalid `--format` → exit `2`; structured errors to stderr). Delivered the REQ-INT-05 **fit-criterion suite**: new `test/cli/output.test.ts` (unit — `renderSuccess` json/yaml round-trip via *standard* parsers `JSON.parse` / `js-yaml` `load` to the same structure, single top-level value on stdout; `isValidFormat` accept/reject) + a `test/cli/program.integration.test.ts` case asserting `dna show --format json ≡ --format yaml` once both are parsed, with empty stderr (envelope rule). The AC's literal `wingfoil paths` / `wingfoil workflow status` parse checks are **deferred** to those commands' own tasks (`paths` = task-028; the `workflow status` command task) — neither exists yet (`CORE_MODULES` is read-only: `dnaShow`/`directivesList`/`workflowList`); each will inherit the shared envelope verified here. Done by Roberto directly (second agent), in a dedicated worktree **via the `dev-loop` worktree + `--no-ff` convention**, Roberto gating the `in-review → approved` transition; ran in parallel with the task-agent (which merged task-011 mid-work). Full suite 315 (task-013 adds 12 tests: `output.test.ts` + one integration case); `output.ts` 100% covered, `tsc`/eslint clean. **task-014 done** (`67581ee`; REQ-SEC-01 git identity required for state mutations — **real production code** this time, not verification-only). New `src/core/git-identity.ts` `requireGitIdentity(root)`: reads `git -C <root> config user.name`/`user.email` via `execFileSync` (mirroring `src/memory/history.ts`'s git primitive) and returns `coreErr({ code: 'VALIDATION', message: 'git identity not configured (user.name/user.email)' })` (the exact REQ-SEC-01 message) when either is unset, else `ok`. Lives in `src/core` so the CLI and every MCP Tool share one enforcement path by construction (REQ-SYS-05); backing `adr-006` (no tech-spec exists for REQ-SEC-01, nothing found missing at the design gate). `VALIDATION` → exit `1` via task-012's `exitCodeForError`. **Deferred:** wiring the check into actual mutating operations (`memory add/submit/approve/reject/deprecate`, `workflow start/end/next`) — none exist yet (`CORE_MODULES` is read-only) — to those command tasks (task-019+); each mutation calls it first and returns its `CoreResult.error` unchanged. Test `test/core/git-identity.test.ts` (unit): temp `git init` repo **isolated from the host's global/system identity** (`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` → empty file, `GIT_CONFIG_NOSYSTEM=1`), cases neither/only-name/only-email → exact refusal, both set → ok. **Reusable gotcha:** that env isolation works in plain Node but NOT under Jest — Jest sandboxes each module's `process.env`, and `child_process` with no explicit `env` reads the outer realm's env; fixed by passing `env: process.env` explicitly to `execFileSync` (no-op in production, makes the sandbox env authoritative). Done by Roberto directly (second agent), in a dedicated worktree via the `dev-loop` worktree + `--no-ff` convention, Roberto gating `in-review → approved`; parallel to the task-agent (`dl-015` decision-log landed on `main` mid-work — rebased clean, docs-only). Full suite 319 (task-014 adds 4 tests); `git-identity.ts` 100% covered, `tsc`/eslint clean. **task-016 done** (`aa2a5d2`; REQ-SEC-05 read-only agent channel — **test-only** guarantee, merged out of numeric order while `task-015` is still in progress by another agent). Its "references to task-011" were dependencies **already delivered**: task-011 (done) left the read-only Resources channel + the shared fixture `test/mcp/helpers/channel-enumeration.ts` explicitly for task-016 to reuse, and `src/mcp/registrar.ts` is already "the structural half of REQ-SEC-05" (`mutates:true`→Tool, `mutates:false`→Resource, never both; `CoreResult.error`→Tool `isError`). New `test/mcp/read-only-agent-channel.test.ts` asserts the guarantee end-to-end over a real MCP `Client`: (1) structural partition — a synthetic `mutates:true`/`false` module: `listTools` has only `x.write`, `listResources` only `wingfoil://x/read`; (2) the write channel validates — the synthetic Tool returns `isError:true` with the `CoreResult.error` message; (3) the real registry contributes zero mutating ops (advertised-but-empty write channel); (4) Resources refuse both write-shaped requests (`resources are read-only`) with tracked files byte-unchanged (task-011 fixture); (5) no Prompts channel advertised. Extended the shared fixture with `connectCoreModuleSurface`. **Deferred:** a *mutating* Tool call rejected on an illegal state-machine transition identical to the CLI — no mutating op exists (`CORE_MODULES` read-only) → task-018+/v0.4; the `isError` error-parity mechanism it needs is proven here with a synthetic op. **Reusable gotcha:** the SDK `McpServer` installs the `tools/list` handler only on the FIRST `registerTool`; `registerCapabilities({tools:{}})` advertises the capability but not the handler, so `client.listTools()` on a zero-tool server throws `-32601 Method not found` — asserted the advertised capability + core-level "no mutating op" instead. Done by Roberto directly (second agent), dedicated worktree via the `dev-loop` worktree + `--no-ff` convention, Roberto gating `in-review → approved`; parallel to another agent on task-015 (`src/memory`, disjoint — not yet merged, so `main` was unmoved and the rebase was a no-op). Full suite 325 (task-016 adds 6 tests); `tsc`/eslint clean, task-011's own test unaffected. **task-015 done** (`6ffa686`; REQ-SEC-02 complete attributable audit trail — the READ/AUDIT half, by the task-agent. New `src/memory/audit.ts` (+ `src/memory/git-log.ts` extracted from task-011's `history.ts`): `auditAttribution`/`isValidAttribution` (0-unknown-author over `git log`, rejects git's guessed `.(none)` domain), `parseApprovalMetadata` (Approver:/Reason: body lines, CLAUDE.md §5.1), `reconstructMemoryTransitions` (memory-history derivation entirely from git log + `git show sha:path` frontmatter reads, no secondary store — adr-007), `verifyTransitionConsistency` (subject `[old→new]` vs frontmatter-derived state). Built ON task-011's `getMemoryHistory`, stayed OUT of task-014's write enforcement. **Reconciliation w/ task-014 (Roberto's "one source of truth" call):** built in parallel BEFORE task-014 landed → each had invented its own identity rule; after rebase onto task-014, extracted the base non-empty name+email rule into a single shared `isConfiguredIdentity` predicate in `src/core/git-identity.ts`, consumed by BOTH task-014's `requireGitIdentity` (bit-identical, tests unchanged) AND task-015's `isValidAttribution` (which layers documented audit-only `.(none)`/`EMAIL_RE` strictness for legacy pre-task-014 history). 351 tests. Opus review HELD until the reconciled state → approve/0 blockers; 3 non-blocking doc nits (multiline-Reason + `--follow`/current-path rename edge cases documented, stale figures refreshed) fixed on-branch + re-review RESOLVED. `main` advanced with task-016 (test-only, disjoint) mid-task — `--no-ff` merge clean. **task-017 done** (`9a3792a`; REQ-SEC-06 storage confinement — **real production code**). New `src/storage/memory-path.ts` `resolveConfinedMemoryPath(root, pattern, values)` + `E_PATH_ESCAPES_ROOT`: renders+resolves a Memory-entry path, then refuses (throwing `StorageError` **before returning**, so no write ever lands outside) any target that is the root itself or escapes it via `../` — closing a real hole, since `path.join`/`resolve` normalize `..`, so a crafted `id`/value could otherwise steer a write outside the git-tracked store (REQ-SYS-01). **AC correction (Roberto):** the confinement boundary is the **project root**, NOT `.wingfoil/memory/` — the task AC (and REQ-SEC-06's SARD fit-criterion string) were wrong; corrected the task AC, flagged the SARD text as a spec-owner follow-up. **Deferred:** wiring the resolver into `memory.add`/`submit` (map the `StorageError` to a `CoreError` whose message is exactly `Memory entries must reside within the project root`, so CLI+MCP surface it identically per REQ-SYS-05) → the Memory-entries command tasks (task-022/018+); none exist yet (`CORE_MODULES` read-only), so the end-to-end "refused, nothing written" assertion belongs there — the resolver's confinement contract is proven here (`test/storage/memory-path.test.ts`: legit id under root; `../` traversal via id or another placeholder → `E_PATH_ESCAPES_ROOT`; absolute-looking value stays under root via `join`; harmless internal `..` allowed). **Note:** `StorageError` prefixes its code (`E_PATH_ESCAPES_ROOT: <msg>`, like `E_NO_GIT_ROOT`), so the exact user-facing string is produced by the deferred core mapping; test asserts `.code` exact + `.message` contains. Done by Roberto directly (second agent), dedicated worktree via the `dev-loop` worktree + `--no-ff` convention, Roberto gating `in-review → approved`; parallel to the task-agent's task-015 (merged mid-session, disjoint `src/memory`); `main` gained the docs-only `dl-016`/`dl-017` decision-logs mid-work — rebased clean. Full suite 356 (task-017 adds 5 tests); `memory-path.ts` + `errors.ts` 100% covered, `tsc`/eslint clean. **Wave 2 progress: 15/15 done (003–017) — Wave 2 (infra) COMPLETE.** Wave 3 (`task-018..030`, feature `P*`) is now unblocked. |
| 3 (feature ×13) | 2026-07-07 | — (**parallel dev + independent opus review per task, via direct `Agent` tool; merges SERIALIZED with rebase-reconcile of the shared `CORE_MODULES`/`src/core` surface**; run FULLY AUTONOMOUS per Roberto's standing up-front Wave-3 authorization — no per-task approval prompt, opus review is the quality gate) | **Batch A (foundations, parallel dev)** → in-review: task-018 (dev opus), task-024 (dev opus), task-027 (dev sonnet) | All 3 approved by Roberto's standing authorization after independent opus review (0 blockers each): 2026-07-07 | task-018 → `4b01b9e`; task-024 → `08ba55a`; task-027 → `c28651b` (all `--no-ff`, carry approve+finalize from branch) | **Batch A DONE (3/13).** **task-018** (P1.1, `4b01b9e`): keystone `commitPaths` git primitive (`src/storage/commit.ts` — scoped `git add` + one commit, returns sha, `CommitOptions.env` author override; the producer of `CoreResult.commit` that task-019/020/025/029 consume) + `initStorage`/`scaffoldFiles`/`.wingfoil` layout + core `initWingfoilStorage` (not-a-git-repo → exit 1 exact msg). Library-level; `wingfoil init` CLI + full spec-011 layout deferred to task-029 (opus review: approve/0 blockers, injection-safe+deterministic-appropriate; 1 doc nit fixed on-branch). +14 tests. **task-024** (P1.13, `08ba55a`): MemoryYaml-level `superRefine` (only layer knowing the type name) emitting exact `transition target '…' not in declared states for type '…'`; correctly exempts off-chain `gates.reject` targets (spec-001), task-004/005 engine untouched (opus review: approve/0 blockers; double-issue judged acceptable). schema.ts 100% cov, +11 tests. **task-027** (P2.4, `c28651b`): verified DnaYaml schema/`loadDnaYaml` (task-004) meets P2.4 AC(a)/(b), added AC(c) `invalid DNA: YAML parse error at line <n>` mapping in `loadDnaYaml`; DnaYaml shape/signature unchanged (025/026/028/030 safe) (opus review: approve/0 blockers; 1 doc nit fixed on-branch). +4 tests. Suite 356 → **385** green, `tsc` 0. **Batch B DONE (019/026/028/029) + task-022 (Batch C):** **task-019** (P1.2, `69b58e3`): verification-only close — integration suite proving task-018 `commitPaths` + task-014 `requireGitIdentity` + task-015 `auditAttribution` already satisfy all 3 P1.2 BDD scenarios; ADR-007 state-from-frontmatter (opus review approve/0 blockers; CLAUDE.md-as-source citation nit fixed → P1.7/REQ-SEC-02/ADR-007). **task-026** (P2.2, `6e885d6`): section-aware `dna show [section]` (tech_stack→stacks alias, unknown → NOT_FOUND exit 1); established the generic additive `ParamsContext.positional` CLI seam (opus review approve/0 blockers; genuine red→green). **task-028** (P2.5, `2b9e47f`): flat-command `wingfoil paths [category]` + `--list` + `--format` (delivers task-013's deferred parse-check), unmapped → exit 1; **its positional seam was RECONCILED onto task-026's** (concurrent dev built two seams → unified to ONE `ParamsContext.positional` + one additive `flags` field, verified by opus review approve/0 blockers). **task-029** (P5.1.1, `693f210`): `wingfoil init` — full spec-011 `.wingfoil/` layout via Scrum/Kanban templates on task-018's `initStorage`/`commitPaths`, wizard + `--template`, already-initialized → exit 1, deterministic content, init NOT a CORE_MODULES op (parity intact); rebased onto settled CLI seam, program.ts reconciled with 028 (opus review approve/0 blockers; 2 CLAUDE.md citations fixed → P1.1/REQ-SYS-02/wingfoil-init workflow). **task-022** (P1.11, `ff37a15`): `writeMemoryEntry` library primitive (task-017 `resolveConfinedMemoryPath` refuse-before-write + task-018 `commitPaths` per-file versioning) that task-020 will wrap; AC(c) msg reconciled to project-root (opus review approve/0 blockers; dev survived an API-error resume, clean history). **8/13 DONE** (450 green). **Then task-023/025/030/020/021 — WAVE 3 COMPLETE (13/13):** **task-023** (P1.12, `6a57f3b`): `validateSearchQuery` empty-query guard (exit 2), confirmed task-008's ranking already satisfies AC a/b (characterization). **task-025** (P2.1, `686ffc7`): `wingfoil dna set` — **FIRST mutating op** (dnaSet mutates:true → live parity guard, CLI `dna set` ⇔ MCP Tool `dna.set`); requireGitIdentity pre-flight, UsageError→exit 2, confined+schema-validated+deterministic write via commitPaths, idempotent no-op; extended seam to `ParamsContext.positionals[]`; follow-up **bug-004** (comment-stripping) opened. **task-030** (P5.2.1, `c507261`): MCP Resources production — first production McpServer + StdioServerTransport + `wingfoil mcp` command reusing task-011's channel, read-only-only scope (no dna.set Tool leak, capability-asserted); authored + **approved spec-014-mcp-server-entry-point**. **task-020** (P1.3, `37d1d31`): `wingfoil memory add` — 2nd mutating op (memoryAdd mutates:true → Tool `memory.add`; parity advertises both Tools); confined write via task-022's writeMemoryEntry, deterministic id, AC exact (unknown type exit 1 / missing --title exit 2); established the additive value-bearing-option seam (`ParamsContext.options`). **task-021** (P1.5, `9a54db1`): `wingfoil memory search` — wraps task-023+task-008 (ranking untouched), zero-match→exit 0, empty→exit 2, `mutates:false`→Resource `wingfoil://memory/search` (NOT a Tool); re-pointed the REQ-PERF-02 latency test. All opus-reviewed **approve/0 blockers**; every merge `--no-ff` with approve+finalize on-branch; several CLAUDE.md-as-source citation nits fixed on-branch; two dev agents survived API-error/watchdog resumes. **WAVE 3 COMPLETE: task-018..030 all `done`, 13 `--no-ff` merges, suite 356 → 536 green, tsc 0.** Fully autonomous per Roberto's standing authorization — no per-task approval prompt; opus review was the quality gate. **Wave 4 next** (task-031/032/033, still backlog). |
| 4 (final ×3) | 2026-07-07 | — (parallel dev + independent opus review per task; FULLY AUTONOMOUS per Roberto's standing authorization — no per-task approval prompt) | task-031 + task-032 (parallel) → in-review, then task-033 | All 3 approved under standing authorization after independent opus review (0 blockers each): 2026-07-07 | task-031 → `5c9456c`; task-032 → `66511f4`; task-033 → `43f2567` (all `--no-ff`) | **WAVE 4 COMPLETE (3/3) — v0.1 IMPLEMENTATION DONE (33/33).** **task-031** (spec-002, `5c9456c`): hand-reconciled `docs/self/.wingfoil/dna.yaml` to the as-built repo (added `validation` module + `js-yaml` dep, corrected Anthropic-SDK/MCP notes, dropped now-true `# planned`), all `[SPEC]`/`[AUTHORING]` comments preserved, `module-layout.test.ts` hardened into a self-enforcing check. **task-032** (spec-005, `66511f4`): root `README.md` + v0.1 CLI quick-start (verified against the real built CLI, no fictional flags, directive/workflow/agent left as v0.2+); its real-CLI verification **caught + fixed a CRITICAL bug (bug-005)** — `wingfoil init` scaffolded schema-invalid dna.yaml/memory.yaml (methodologies/roles as bare strings, no team.members, no id_pattern) breaking the whole fresh-init cycle; fixed test-first in `src/storage/templates.ts`, review verified init→dna→memory→search→paths now works live. **task-033** (minor-v0.1 Success Criteria, `43f2567`): manual E2E validation — Journey 0a v0.1 slice PASSES end-to-end (reviewer independently reproduced it command-for-command; init both templates → cycle all exit 0, schema-valid, no manual YAML editing), MCP Resources verified over a real stdio Client (read-only channel confirmed), Journey-1/workflow/agent/MCP-Prompts correctly recorded as out-of-v0.1-scope KNOWN GAPS; adds a 6-case Journey-0a regression test. All opus-reviewed approve/0 blockers; suite 536 → **548** green, tsc 0. **Tracked follow-ups:** bug-004 (dna set comment-strip, open), bug-005 (init scaffold — FIXED by task-032, record open pending Roberto's formal closure), bug-006 (init directive scaffold, deferred/low, open). |

> **Wave 2 execution-mode note (2026-07-04):** the 15 infra tasks were found **not** cleanly
> independent — they collectively build the still-nonexistent shared skeleton (`src/core`, `src/cli`,
> `src/mcp`, the state-machine validator), so the §5 concurrent-`Workflow` shape risked duplicated /
> divergent skeleton code and accumulated merge conflicts across sequential merges. Roberto chose to
> run Wave 2 **fully sequentially instead** (dev → review → checkpoint → merge → next task branches
> from the updated `main`). §5's `parallel()`/`pipeline()` sketch therefore does not apply to this
> wave as executed; it remains the intended shape only for a wave whose tasks are genuinely disjoint.
