# Retrospective v0.3 — friction inventory

Product of the `retrospective` workflow's `explore` phase (retrospective.yaml 1.6) for `minor-v0.3`, executed under
`retrospective-rel-v0.3-plan` (step S1) on branch `design/retrospective_v0.3`, from `main` at `397cae9a`. Read-only:
no Memory element was added or changed by this phase.

It holds **findings** (what the evidence says, each theme citing where it is written) and, kept apart, **proposals**
(what a source suggests). A proposal is never read as a finding (dl-115 Q3 (x)): every proposal of every source listed
below has one *proposed* outcome in § Proposals, and the approver rules on them at `additional-points`. The consumer
feedback notes are in the read record beside this file, `rel-v0.3-feedback-triage.md` (`collect-feedback`).

## Method

Eight read-only slices, each mined by a sub-agent with a written brief (every row carries a citation and the read
command that establishes it; a miner proposes nothing), then synthesised here by the facilitator. Each slice read the
`### Retrospective` subsection first, then the Execution Notes (dl-115 Q1 (A)).

| Slice | Source | Read | `### Retrospective` present | Rows |
|---|---|---|---|---|
| M1 | `task-126`…`task-180` | 55 | 0 | 85 |
| M2 | `task-181`…`task-235` | 55 | 22 | 84 |
| M3 | `task-236`…`task-289` | 54 | 35 (17 placeholder-only) | 63 |
| M4a | bugs with `release: "v0.3"`, `bug-012`…`bug-186` | 97 | 5 | 35 |
| M4b | bugs with `release: "v0.3"`, `bug-187`…`bug-378` | 96 | ~33 (5–6 "None.") | 50 |
| M5 | plans of `docs/05_plans/rl-v1/rel-v0.3/` (this plan excluded) | 59 | 30 (4 "None") | 100 |
| M6 | commit bodies of `v0.2.1..v0.3.0` (`9833e00a..cc31d7a8`, 5,908 commits) | — | — | 20 |
| M8 | the 14 dev-loop batch follow-up registers kept outside the repository (secondary source 3) | 14 | — | 480 |

The miners' raw tables are working material of the session and are not committed; every figure below names the
command that reproduces it, or the documents it counts.

## Sources read

**Primary** (the release's own Memory, at `397cae9a`): the 164 task documents of `docs/04_memory/v0.3/` (163 `done`,
1 `deprecated`); the 193 bugs with `release: "v0.3"` (all `closed`); the 59 plans above; the commit window above.

**Secondary** (each with the commit read; `secondary-sources.listed`):

1. **Release-health report** `docs/08_health/release-health-v0.3.md` (`d699bb92`) and `.json` (`1b8fdd4e`), measured at
   `v0.3.0` (`cc31d7a8`): its comparison is read as measurement (§ Release health below); RH-v0.3-01…09 are proposals.
2. **The `### Retrospective` subsections of v0.3's phase plans**: `release-planning-rel-v0.3-plan` (`d13c390f`; it has
   none — its closing section is `## Observations`), `dev-loop-rel-v0.3-plan` (`b19a2218`; none — the per-task
   subsections live in the tasks), `user-docs-rel-v0.3-plan` (`12e1da1a`), `e2e-smoke-rel-v0.3-plan` (`109ee3c3`),
   `release-submit-rel-v0.3-plan` (`bab1e0f4`), `release-publishing-rel-v0.3-plan` (`0b96d210`),
   `release-health-rel-v0.3-plan` (`6977b488`), and the ingest plans (in slice M5).
3. **The follow-up registers kept outside the repository during the release** (not versioned; read 2026-10-21): the
   14 dev-loop batch registers of waves 2 and 3 (slice M8), and the phase registers of user-docs (19 items), e2e-smoke
   (empty), release-submit (F1–F3), release-publishing (F1–F5) and release-health (F1–F8). Their items are restated
   here in WingFoil's words; nothing outside this repository is cited.
4. **release-publishing ruling D4** (`release-publishing-rel-v0.3-plan`, `0b96d210`): `package.json` `description` left
   unchanged in 0.3.0, to `dl-140`'s ratification at this retrospective (the same line is in `server.json`, `svc-001`,
   `svc-004`).
5. **Points handed over by three other sessions on the maintainer's request, 2026-10-21** (plan ruling D7): five leads
   from the coordinator, seven observations from a project governed with WingFoil, and a positioning-review request
   with four notes from a demo preparation. They are leads, not evidence: restated, cross-checked against the
   registered notes of the read record, and an element only after a reproduction here. Their origin projects are not
   named.
6. **Approver point at the start** (plan ruling D1 note, 2026-10-21): a dedicated Memory type for retrospectives.

## Release health (measurement, secondary source 1)

Measured at `v0.3.0` on the pinned Node 22.12.0, compared with v0.2 (catalogue version 2 on both): verdicts improved 8,
stable 6, regressed 5, new 16, not-comparable 1; floors held 10, breached 14; 16 findings, 3 immediate (G07, G10 → the
22 probe-identity commits of 2026-09-28, `bug-401`, closed as the accepted `dl-094` residue at `b9c1a7a2`; G14 →
`bug-363` + `bug-402`). Improved: G03 commit size (median 25 → 9), G10 canonical arrow (70.62 → 99.96), G14 secrets in
diffs (29 → 8), Q03 coverage (branches 94.03 → 97.4), Q04 critical-module branches (`audit.ts` 64.7 → 100), P01
malformed flow commits (297 → 104), P02 illegal transitions (15 → 0), P05 separation-of-duties failures (137 → 1).
Regressed: G02 commit bodies, G04 subject length, G08 AI attribution conformance, P03 produces present, P04
traceability chain. Not measurable: D01 and P06 (the benchmark has run no build yet), Q17. The full table is the
report's `## Comparison`; `capture` copies it into `retro-v0.3`'s `## Release health`.

## Themes

Each theme states what the evidence shows, with counts and where they are written. "Went well" items close the list.

### T1 — Review catches what the author's checks missed; rejection is rare

- Independent read-only review before the approver gate ran on every dev-loop task; it came back "approve with
  fixes" for 47 of 55 tasks in `task-126`…`180` (M1) and 46 of 55 in `task-181`…`235` (M2); about 17 tasks of
  `task-236`…`289` were sent back to qa and fixed in-task (M3).
- Task rejection: **1 in 180 started tasks** (`task-232`, `3e1054e3`, bug-329's fix incomplete on the default path).
  Of the 11 `reject` commits of the window, 10 close bugs (already fixed 5, duplicate, retype, accepted risk, resolved
  without code, won't-fix): `git log --format='%h %s' v0.2.1..v0.3.0 | grep -E ' wf\([a-z-]+\): reject '` (M6).
- The rework is visible elsewhere: 56 approves cite fixes, 66 "fixed in-task", 114 `fix()` commits mention review
  findings, 44 task amends "absorb" a bug and about 40 more carry gate handovers (`task-252` amended 11 times,
  `task-218` 10); `park` was never used (M6).

### T2 — Claims without their evidence still recur

- False or overstated sentences in notes, documents and test headers, found at review: 18 rows in M1 (`task-128`,
  133, 136, 146, 149, 151, 155, 161, 162, 164, 166, 174, 178 …), 8 tasks in M2 (186, 189, 194, 198, 202, 212, 213,
  230), recurring in batch registers ("the top v0.2 rejection cause recurs", W3 B9) and in user-docs (two false
  sentences in the agent file, one false self-review claim).
- Follow-up lists handed to the review-findings ingests were wrong or drifted when re-measured in 14 of the 18 plans
  that keep a corrections block (M5: `bug-ingest-rel-v0.3-w2b1…w3b9-review-findings-plan`); the re-measure habit
  caught every one.
- A plan check counted 86 of the 193 v0.3 bugs because a `grep` skipped `release:` lines with an inline comment
  (`e2e-smoke-rel-v0.3-plan` P3; corrected in `release-submit-rel-v0.3-plan` S1).

### T3 — Machine load and heavy-gate contention

- 24 task documents of M2 record load averages of 33–165 and latency suites that fail under load and pass alone; 11
  cite `dl-170`; full runs killed (exit 137) in `task-217`, 225, 226, 227, 229 (M2). Ten tasks of M3 waited 45 min to
  7 h for the slot; a looping shim hung a coverage run for 2 h holding the slot (`task-242`).
- Eight separate incidents in the plans (M5): load 165 with 189+ orphan processes and an approver-ordered stop of
  every agent of W3 B5; FIFO starvation of about 8 h (which produced the FIFO `waitslot`); release-health measure run 1
  4 h 23 min at load 8–11 against 53 min idle; a release-submit 40-minute slot wait; the no-identity run 1,373 s
  against 645 s.
- The interim rule (one heavy gate at a time, load ≤ 14, no detached runs) is `dl-170`, still `in-discussion`.

### T4 — Test-first discipline: classification, vacuous reds, untyped reds

- Acceptance criteria misclassified at planning (characterization vs red-first, both directions): 12 documents in M2,
  6 in M3 (`task-238`, 264, 269, 272, 275); M1 shows the honest version — the class changed after measurement
  (`task-150`, 157, 160).
- Vacuous or unreachable red assertions found late: 8 tasks (`task-236`, 239, 241, 266, 274, 276, 281, 285; M3).
- `npx jest` does not typecheck, so a red commit passed jest and failed `tsc` (`task-286`, 287, 289; `task-217`).
- Design assertions written without running them (message text, status, interface shape, count): 7 tasks of M3.
- Separation of duties between qa and developer (`dl-134`) not applied in single-agent sessions: `task-239`, 240.

### T5 — Documentation drift is the largest class of defect

- About 17 of bugs 012–186 (5 closed by one docs task, `task-245`) and at least 20 of bugs 187–378 (`bug-196`, 204,
  210, 212, 213, 220, 227, 239, 256–259, 268–270, 274, 275, 284, 285, 298, 302) are documentation drift (M4a, M4b);
  stale agent docs, README, vision texts, spec counts and line citations recur in every batch register (M8).
- Two bug retrospectives (`bug-210`, `bug-285`) observe that the agent guide trails the shipped surface by one
  user-docs gate.
- A render defect of the Pages site (kramdown) was invisible on github.com and to every test until a session read the
  live site (`user-docs-rel-v0.3-plan` retrospective).

### T6 — Memory operations still done by hand

- Every tool-written commit was amended by hand for the AI-attribution trailers: `wingfoil` writes only
  `WingFoil-Version` (at least 14 ingest plans, W2 B1–W3 B9; M5). Reproduced here: the `--dry-run` of `memory add`
  prints a message whose only trailer is `WingFoil-Version`.
- One `bug-ingest` instance binds one bug, so batch ingest plans were finalized by hand (W3 B4–B9) and a second
  immediate bug was added unlinked (release-health); tracked by `bug-324` (`triaged`, v0.4) for the decision-log side.
- 710 `wf(bug): sync` commits were written by hand, the largest `wf()` group (M6); `finalize`, `start` and `sync` are
  still hand-written (AGENTS.md §5.1); approvals with the pinned build go one id per call (48 + 29 + 121 commits).
- Id allocation collided live twice on the pinned build (`bug-087`, `bug-162`; fixed in the code build by `task-128`).
- `workflow start` submits the plan it creates before its body is written (`bug-390`), so phase plans are opened with
  `memory add` and submitted by hand.

### T7 — Parallel integration costs

- Five textually clean merges broke the build (`task-130`×136, 177×171, 144×143, 179×180, 253×257; M5); append-only
  spec Revision notes conflicted in about 12 batches of waves 0–2, and the same configuration file was version-bumped
  on parallel branches and re-bumped at merge in 5 batches (M5, M8).
- Tests that pin an exact version or a literal broke the next task that bumped it (`task-221`, 222, 252, 270, 286,
  288; M2, M3).

### T8 — Scope growth and the budget

- 121 tasks planned at `commit-backlog`, 164 task documents at the release (163 done, 1 deprecated): 43 added after
  `commit-backlog`, 23 of them fixes (release-health Q19, fix share 53.49); about 8 triage-added in wave 2 and about 25
  in wave 3 (M5). The planning budget flagged the undercount (18.6 days by count against about 66 by size).
- Stop-the-line (`dl-133`) worked: the fix share was tracked at every gate (31 % → 5 %) and fired at the B8 opening
  (40 %), so fixes started first (M5).

### T9 — Handovers by note

- A handover left only in a note lapsed in `bug-300`, `bug-301` (to `task-216`) and `bug-236` (its governance rule,
  re-filed as `bug-391`) (M4b). The batch registers carry dozens of task-to-task handovers (M8), the plans name
  "copy handovers into task-216 and user-docs" as a gate action.
- What held: dependent tasks merged their approved predecessor before design (`task-215`←279, 237←236, 243←237 …;
  M5), and `depends_on` notes were read before design (`task-131`, 132, 161, 165, 166, 169, 172; M1).

### T10 — The secret scanner flags prose and ordinary code

- Six false positives on prose or code in Memory and plan text (`task-160` notes, `task-275` notes, `bug-228`,
  `bug-402`, the release-publishing sweep and its own quotation, W3 B6 fixtures) plus a push-protection block on a
  fake fixture (M5); `bug-402` reproduced on its own body, because `docs/04_memory` is the REQ-SEC-08 test surface
  while `memory submit` does not scan.

### T11 — The launched agent's environment

- Launched agents ran the global `wingfoil` on `PATH` (0.2.2) instead of the build under test (W3 B7, B8); a launched
  agent edited a submitted task body without resubmitting (W3 B8); AI-Model trailer values were not honoured (W3 B7,
  B8); shared scratchpads overwritten; duplicate agent instances after a blind resume (M8).
- Usage, rate and weekly limits, an app exit, a machine restart and a stream watchdog interrupted at least 8 batches;
  every agent resumed from its transcript with no work lost; the permission classifier refused twice (M5).
- The role MCP Prompts do not reach the model in two agent CLIs (Prompts are user slash commands, or absent); the
  session Resource covers `agent execute` runs only, and `docs/agents.md` "Rules" item 3 names the Prompt first
  (release-publishing register F5; `docs/agents.md:76`).

### T12 — Release machinery and the integration-branch rules

- The merge-forward and checks of a `release/X.Y` line were still unspecified at the end of W3 B9 (who runs it,
  version and date collisions, where a patch bug's triage commits go) (M8); `dl-185` holds the question,
  `in-discussion`.
- A push to `main` went through as admin while the required `governance` check was pending; it passed before the tag
  (release-publishing register F2).
- Two stale remote branches remain (RH-v0.3-05).

### T13 — Rules declared without a check

- A declared rule with no check drifted quickly: `bug-307` (63 commits in 4 days), `bug-312`, `bug-313`, `bug-343` (a
  floor no gate reads), `bug-331` (M4b). The name-resolvability gate is a steady source of false positives and stale
  allowlist entries (M8; W3 B1–B6).

### T14 — The retrospective's own sources

- None of `task-126`…`180` has a `### Retrospective` subsection (it arrived with `dl-115`); 17 of the 35 in
  `task-236`…`289` are placeholder-only; `dev-loop-rel-v0.3-plan` and `release-planning-rel-v0.3-plan` have none; about
  25 bug amends back-filled a missing Retrospective (M1, M3, M5, M6).
- The richest friction record of the release (480 rows) sits in registers outside the repository.
- `retrospective.yaml`'s `capture` allocates `dl-<n>-…` while its `produces:` and `compare.cjs` expect `retro-<version>`
  (`bug-362`, `triaged`, v0.4; plan ruling D1).

### T15 — Measurement under load

- REQ-PERF-02/03 were measured under load in waves 2–3, latency debts carried from B1–B3, p95 rose to 911 ms (M5, M8);
  the release-health measure is load-bound (run 1 4 h 23 min) and needs an idle machine, not only the slot; a stray
  `/tmp/.git` outside the project turned two tests red inside measure's temporary tree (release-health register F2).

### Went well

- Independent per-task review before the gate, with every fix applied in the task (T1).
- Honest per-AC classification where it was measured first, mutation and positive-control checks, measurement before
  refusing, table-driven sweeps derived from `CORE_MODULES` (M1).
- Design-time probes settling questions before red; full-suite runs catching what targeted runs missed (M3).
- Reproduction before filing: the re-measure discipline caught every false item of the follow-up lists (M5, M4a).
- Stop-the-line tracked at every gate (T8); merging the approved predecessor before design (T9).
- release-planning's five read-only proposal agents plus a merge pass, giving 121 tasks with no dependency cycle (M5).
- e2e-smoke 74/74 in 104 s on the packed candidate; the plan → candidate → report commit order needed no workaround.
- The 0.3.0 tag run was green at the first attempt (no re-tag), and the MCP Registry listing succeeded through the
  OIDC job at its first run (M5).
- By-hand adapter passes in real terminals found what tests could not (the session Resource came from one) (M5).
- Every batch gate re-ran the full set on `main` and recorded its numbers (M5).

## Proposals and proposed outcomes

Outcome vocabulary (retrospective.yaml `additional-points` pre-check): **covered** (by a theme above or an existing
disposition) | **element** (an existing element, with its id and the status read by command) | **restated** (a new
proposal restated from versioned ground, to be filed if the approver takes it) | **superseded** (with the command that
proves it). Statuses read at `397cae9a` with `awk '/^status:/{print $2;exit}'` and `release:` on the element's file.

| Id | Source | Proposal (restated) | Proposed outcome | Element / theme / target |
|---|---|---|---|---|
| RH-v0.3-01 | release-health report | G02 commit bodies regressed three runs in a row: decide whether a subject-only commit is acceptable for the commit kinds behind the growth (chiefly `wf()`). | restated | decision-log, v0.4 (as the report proposes) |
| RH-v0.3-02 | release-health report | G04 subject length regressed: bound the `{slug}` length, or let `wf()` subjects name the short id. | restated | decision-log, v0.4; related T6 |
| RH-v0.3-03 | release-health report | G05: one code commit of 776 cites no id (`ee8133c9`). | restated | accept as a one-off (the report's recommendation); a bug only if the approver wants a refusing check |
| RH-v0.3-04 | release-health report | P01/G08 residue (94 approve/reject commits with AI trailers before the kit fix of 2026-10-09; 9 verbs outside the closed list; 1 bracket): record the residue of a corrected practice as accepted, and decide whether `check:governance` becomes a gate refusing such commits before push. | restated | same disposition as `bug-401` (closed as accepted residue, `b9c1a7a2`); plus the option of a pre-push gate: decision-log, v0.4 |
| RH-v0.3-05 | release-health report | G15: two stale remote `claude/…` branches. | restated | approver action (check nothing unmerged, delete on `origin`), v0.3.1; no element |
| RH-v0.3-06 | release-health report | Q20 bug net flow −50 (open 131, 113 low, 18 unassigned): how much of the low-severity backlog a release absorbs, and whether `triage-bugs` sweeps the unassigned. | restated | decision-log, v0.4; D5 of the plan triages the 18 unassigned at this gate |
| RH-v0.3-07 | release-health report | P03: ten finished v0.2/v0.2.2 plans judged against `produces:` declared after they finished. | element | `dl-173` (in-discussion, v0.4) extended; same question as `bug-388` (triaged) |
| RH-v0.3-08 | release-health report | P04: 13 traceability failures (unresolved path suffixes, a wrong feature-file name in four tasks, prose read as a citation). | restated | bug, v0.4 (measure part per `dl-118`, data part in the four tasks) |
| RH-v0.3-09 | release-health report | D01 not measured at a second minor release: run the benchmark twice with the published build, on two agents, before v0.4's release-health. | restated | task (or decision-log for the timing), v0.4 |
| PP-01 | user-docs plan retrospective | A kramdown render check in the Pages build. | element | `bug-398` (triaged, v0.4) covers the guard gaps; the CI render is its proposed fix direction |
| PP-02 | user-docs plan retrospective | Draft upgrade notes from a two-build run over the documented commands, not from task titles. | covered | T5 (docs drift); folded into the user-docs workflow lessons |
| PP-03 | e2e-smoke plan retrospective | Let `scripts/e2e-smoke.cjs` record the `workflow list/show/status` counts of `task-242` AC 2 itself. | restated | bug (low), v0.4 |
| PP-04 | release-submit plan retrospective | Plan checks read frontmatter through one shared reader (`memory search --format json`, or a helper). | covered | T2 |
| PP-05 | release-publishing plan retrospective | `release-cycle.yaml` should state that `publish`'s `tests.passing` is the run on the release commit. | restated | workflow doc fix, v0.4 (a bug, low) |
| PP-06 | release-publishing plan retrospective | Rebuild on a clean tree before tool commits in a worktree where jest ran. | covered | T6; a session-brief rule (already applied in this phase) |
| PP-07 | release-health plan retrospective | The release-health measure needs an idle machine, not only the slot. | covered | T15, T3 (`dl-170`) |
| PP-08 | release-health plan retrospective | `findGitRoot` tests are not hermetic (a stray `/tmp/.git` turns them red). | restated | bug (low), v0.4 (`dl-118` class) |
| PP-09 | release-health plan retrospective | `n -d exec` needs a writable `N_PREFIX`; the bindings.yaml comment and measure.cjs header omit it. | restated | doc fix, v0.4 (a bug, low) |
| PP-10 | release-health plan retrospective | One bug-ingest instance takes one bug. | element | `bug-324` (triaged, v0.4) for the same class; T6 |
| PP-11 | release-health plan retrospective | Q17 stays not-measurable until the user guide states a version for its install command (or the metric changes). | element | `dl-173` (in-discussion, v0.4) |
| KR-RH-F1 | release-health register | Measure run 1 took 4 h 23 min under load against 53 min idle. | covered | T15 |
| KR-RH-F2 | release-health register | Non-hermetic git-root test. | covered | same as PP-08 |
| KR-RH-F3 | release-health register | `N_PREFIX` undocumented. | covered | same as PP-09 |
| KR-RH-F4 | release-health register | One bug per bug-ingest instance. | covered | same as PP-10 |
| KR-RH-F5 | release-health register | `memory submit` does not run the secret scan; only the test suite does, so a Memory document can quote a flagged line. | restated | decision-log or bug, v0.4 (T10); related `bug-402` |
| KR-RH-F6 | release-health register | Q17 not measurable. | covered | same as PP-11 |
| KR-RH-F7 | release-health register | `check:governance` without `--base` scans the whole history (>13 min). | restated | doc/brief fix; a bug (low) if the default should change, v0.4 |
| KR-RH-F8 | release-health register | A run starved on the slot at load 27 until a reboot. | covered | T3 |
| KR-RP-F1 | release-publishing register | svc-012 and svc-014 still `pending`. | element | `svc-012`, `svc-014` (pending); inherited, approver acts |
| KR-RP-F2 | release-publishing register | A release push could wait for the required governance check, or re-read it before the tag. | restated | release-publishing workflow note, v0.4 (T12) |
| KR-RP-F3 | release-publishing register | A tool commit stamped by a dirty-tree build. | covered | same as PP-06 |
| KR-RP-F4 | release-publishing register | Informative measurements (no-identity 1,373 s, tag gate 11 min 12 s, coverage 97.4). | covered | T3, T15 |
| KR-RP-F5 | release-publishing register | Role MCP Prompts do not reach the model; no element-less directives Resource; `docs/agents.md` "Rules" item 3 names the Prompt first: a decision-log on an element-less role Resource, and a doc fix. | restated | decision-log + doc fix, v0.4 (T11); also lead LD-C4/LD-K6, svc-020 F-032 |
| KR-RS-F1 | release-submit register | One shared frontmatter reader for plan checks. | covered | same as PP-04 |
| KR-RS-F2 | release-submit register | `mark-released` is written `wf(release): finalize …` (`spec-008` §2). | superseded | applied: `minor-v0.3` reached `released` through `finalize` (`git log --format=%s -- docs/04_memory/planning/rl-v1/minor-v0.3.md`) |
| KR-RS-F3 | release-submit register | Branch coverage one branch below the e2e-smoke baseline. | superseded | CI on the tag read 97.4 (6390/6560): release-publishing register F4 |
| KR-UD-01 | user-docs register | `agent execute --dry-run` refuses without a terminal. | element | `bug-392` (triaged, v0.4) |
| KR-UD-02 | user-docs register | A fresh project maps no `health` path. | element | `bug-393` (triaged, v0.4) |
| KR-UD-03 | user-docs register | A 0.2.x project's `workflow list` refusal gives no migration hint. | element | `bug-394` (triaged, v0.4) |
| KR-UD-04 | user-docs register | `workflow list` listed as a pinned-build read. | element | `bug-292` (closed, v0.3); `wingfoil-cli` 1.1 |
| KR-UD-05 | user-docs register | A fresh project needs `dna.yaml` edits before `agent execute` or routing works. | element | `bug-393` (triaged, v0.4) |
| KR-UD-06 | user-docs register | Stale BDD index block. | superseded | in `task-289` (done) |
| KR-UD-07 | user-docs register | The Pages (kramdown) render defect. | element | `bug-398` (triaged, v0.4) for the guard; the render fix landed in `task-289` (done) |
| KR-UD-08 | user-docs register | `memory amend` refusal names the wrong verb. | element | `bug-395` (triaged, v0.4) |
| KR-UD-09 | user-docs register | `registrar.ts` docblock lists Resources the server does not list. | element | `bug-396` (triaged, v0.4) |
| KR-UD-10 | user-docs register | `package.json` `description` differs from the governance-layer wording. | element | `dl-140` (in-discussion; plan D8: ruled here) |
| KR-UD-11 | user-docs register | Journeys/features still call `workflow show --name`/`status` planned. | element | `bug-397` (triaged, v0.4) |
| KR-UD-12 | user-docs register | `check-governance` has no rule for the `WingFoil-Instance/-Step/-Phase` trailers. | element | `bug-391` (triaged, v0.4) |
| KR-UD-13 | user-docs register | AGENTS.md is about 500 lines against the agent CLI's guidance. | element | `dl-137` (ready) part (b), v0.4 |
| KR-UD-14 | user-docs register | Same as item 12 (supersedes it). | element | `bug-391` (triaged, v0.4) |
| KR-UD-15 | user-docs register | Tests pinning the newest `(prev …)` entry break on the next bump. | element | `bug-314` (triaged, v0.4) amend note |
| KR-UD-16 | user-docs register | README banners still carry the old tagline. | restated | approver action: regenerate the banners with the tagline `dl-140` fixes, upload (svc-004) |
| KR-UD-17 | user-docs register | `npx jest` does not typecheck. | covered | T4 (tsc before red) |
| KR-UD-18 | user-docs register | Pages-render guard gaps. | element | `bug-398` (triaged, v0.4) |
| KR-UD-19 | user-docs register | A `pgrep -f` wait loop matched itself and never ended. | covered | T11; a session-brief rule (wait on a tracked command) |
| D4-140 | release-publishing ruling D4 | One tagline for `package.json` `description`, `server.json`, `svc-001`, `svc-004`, through the ratification of `dl-140`. | element | `dl-140` (in-discussion): ratification decided at this gate (plan D8), after the positioning review (LD-X0) |
| LD-C1 | coordinator lead 1 | A git that cannot run (sandbox EPERM) reported as a missing identity. | element | `bug-377` (closed, v0.3; fixed by `task-284`); re-check on 0.3.0 left to the next by-hand adapter pass |
| LD-C2 | coordinator lead 2 | A directly launched agent's `wf()` commits carry no agent attribution; the mutating verbs' automatic commits carry no `Co-Authored-By` whoever runs them. | restated | reproduced here (the `memory add --dry-run` message ends with `WingFoil-Version` only; T6): decision-log, v0.4, beside `dl-180`, `dl-169` and `dl-137` part (b) |
| LD-C3 | coordinator lead 3 | No verb regenerates the `wingfoil:generated` block of AGENTS.md. | element | `dl-137` (ready) part (b), v0.4 |
| LD-C4 | coordinator lead 4 | Role MCP Prompts do not reach the model. | covered | same as KR-RP-F5 |
| LD-C5 | coordinator lead 5 | The `init` 0.3.0 scaffold gives an agent nothing to follow. | element | `bug-400` (triaged, v0.3.1) |
| LD-K1 | consumer-project lead 1 | `directive assign` has no global target. | covered | svc-020 F-039 (registered note, reproduced on 0.3.0) |
| LD-K2 | consumer-project lead 2 | No verb regenerates the generated block. | covered | same as LD-C3 |
| LD-K3 | consumer-project lead 3 | A blocked task cannot go back from `in-progress`. | superseded | `memory park` (in-progress → backlog, `dl-110`) ships in 0.3.0: `node dist/cli.js memory park --help` |
| LD-K4 | consumer-project lead 4 | Sandbox spawn failure shown as a missing identity. | covered | same as LD-C1 |
| LD-K5 | consumer-project lead 5 | Agent attribution in commits. | covered | same as LD-C2 |
| LD-K6 | consumer-project lead 6 | MCP Prompts reach the model only when the user invokes them; Resources work. | covered | same as KR-RP-F5 |
| LD-K7 | consumer-project lead 7 | Design context: an agent CLI loads only the instruction files on the path to its start directory; agent hooks are a guardrail, not an enforcement boundary. | covered | T11 as context; input to `dl-137` part (b) and `dl-143` (in-discussion) |
| LD-X0 | demo-preparation request | A positioning review (vision statement, README tagline, `package.json` description) as a precondition of v0.4 planning. | restated | precondition of v0.4 release-planning in `retro-v0.3`'s Actions (plan D8) |
| LD-Xa | demo-preparation note F-a | `agent execute` records a failed run when the agent CLI stops at its own folder-trust prompt, with no hint that the agent never started. | restated | bug, v0.4, to reproduce (needs a real agent CLI: by-hand adapter pass) |
| LD-Xb | demo-preparation note F-b | `agent execute` does not give the agent's commits the identity its `team.agents` entry declares. | element | `dl-169` (in-discussion, v0.4); also LD-C2 |
| LD-Xc | demo-preparation note F-c | `memory history` prints JSON by default; a human-readable default is asked. | element | `dl-043` (in-discussion; plan D4: ruled here) |
| LD-Xd | demo-preparation note F-d | With the init scaffold, `workflow next` shows nothing until a workflow is started. | element | `bug-400` (triaged, v0.3.1) |
| P-01 | approver, plan ruling D1 | A dedicated Memory type for retrospectives, whose `id_pattern` yields `retro-{version}`, so `capture`'s `memory add` and `produces:` agree. | restated | decision-log (memory.yaml change, P1.13), v0.4; root of `bug-362` (triaged, v0.4) |
| MN-M2-4 | task-181…235 — task-217-*.md:180-181; task-226-*.md:22 | Apply dl-170 one-gate rule from the start of a batch (task-217); a kit helper that waits for the slot then runs the gate (task-226: chained with `;` not `&&`, tsc ran beside two other heavy gates). | element | `dl-170` (in-discussion) |
| MN-M2-12 | task-181…235 — task-211-*.md:277-278 | Either state the `errorDetails` limitation in spec-005 section 3, or have `errorDetails` render arbitrary string arrays. | element | `bug-303`, `bug-355` (triaged, v0.4) |
| MN-M2-14 | task-181…235 — task-222-*.md:150-151 | Decide whether extra `paths` categories are allowed without a warning. | element | `bug-316` (triaged, v0.4) |
| MN-M2-24 | task-181…235 — task-222-*.md:153-154 | Add a parity test between spec-017 section 12 and the conformance figures, or drop the figures from the spec. | covered | T5 |
| MN-M2-39 | task-181…235 — task-230-*.md:306-307; task-225-*.md:31 | Load the red fixture once before asserting (230); write fixtures from a repository workflow's shape (225); put a spec example in the fixture so red catches it (216). | covered | T4 |
| MN-M2-41 | task-181…235 — task-217-*.md:183-184 | Run `npx tsc --noEmit` before the red commit (task-217). | covered | T4 |
| MN-M2-43 | task-181…235 — task-221-*.md:220; task-222-*.md:156 | Version pins should assert ">= the version this task wrote" and "the entry stays in the header". | covered | T7 |
| MN-M2-48 | task-181…235 — task-234-*.md:509-510 | A design that adds a `test/docs` parity suite should name `bindings.yaml` among its files. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M2-65 | task-181…235 — task-197-*.md:215-216 | Next wave's plan revision lists, per brief rule, the directive that states it (task-197). | covered | T9 |
| MN-M3-62 | task-236…289 — see rows | Proposals found in the slice: live-config suites pin a lower bound (task-270 :178-180); qa runs `npx tsc --noEmit -p tsconfig.json` before red (task-286 :380-382, task-289 :524-525); build-backlog lists a literal's pinning suites | covered | T4, T7 |
| MN-M4a-34 | bugs 012–186 — docs/04_memory/bugs/bug-045-*.md "Sugge | bug-045 and bug-069 each record a proposal: rewrite enumeration titles to describe the property not the roster / reconcile ADR Consequences at v0.3 planning in one pass rather than per closure (record only; not adopted here) | covered | T5 |
| MN-M4a-35 | bugs 012–186 — docs/04_memory/bugs/bug-055-*.md | bug-055 states the fix direction: stop the fixture being a secret-shaped literal (build value at runtime; assertion stays passing on byte-identical input) | element | `bug-363` (triaged, v0.4) |
| MN-M4b-4 | bugs 187–378 — B/bug-210-*.md:50; B/bug-220-*.md:64 | bug-210/220 retrospectives suggest the shipping task name the docs/agents.md row (or hand the change to the phase) in its own notes. | covered | T5 |
| MN-M4b-8 | bugs 187–378 — B/bug-258-*.md:70 | An enumeration-parity gate turns a stale spec into a bug only when someone triages its allowlist; the warn release could list the UNTRIAGED count in the release-health catalogue. | element | `dl-173` (in-discussion, v0.4) |
| MN-M4b-9 | bugs 187–378 — B/bug-275-*.md (Retrospective, 2nd bull | Nothing tests that a vision file's header version has a revision entry (bug-275: missing 1.5 entry for X_cli-cmds). | element | `bug-383` (triaged, v0.4) |
| MN-M4b-43 | bugs 187–378 — B/bug-292-*.md:80 | bug-292: advance-pinned-build must delete the KNOWN_READ_FAILURES entry when the pin moves, or check:mcp fails; note for release-planning.yaml went to task-230. | superseded | release-planning.yaml 1.9 names the cleanup: `grep -n KNOWN_READ_FAILURES .wingfoil/workflows/custom/release-planning.yaml` |
| MN-M5-42 | v0.3 plans — w3b3:118 | W3 B3 retrospective: the follow-up log should record the command behind each figure so the ingest can re-run it. | covered | T2 |
| MN-M5-43 | v0.3 plans — w3b6:176 | W3 B6 retrospective: re-measure a count before `memory add`, since the id (slug) is fixed at add. | covered | T2 |
| MN-M5-44 | v0.3 plans — w3b7:181; w3b8:174 | W3 B7 retrospective: reproduce a "caught later" claim before filing it. W3 B8: nothing beyond that. | covered | T2 |
| MN-M5-45 | v0.3 plans — w3b9:143; w3b9:127 | W3 B9 retrospective: a handed-on reviewer finding is quoted with its label in the task's own notes, because the labels cited (task-287 F3, task-267 F4) exist in no repository file. | covered | T9 |
| MN-M5-91 | v0.3 plans — RH:171; DL:1129 | Handovers into release-health note Jest in an agent session prints no per-suite progress (AgentReporter, B9 triage D1, bug-378): a metric depending on console output would lose it; the latency report reached the pass output only | element | `bug-385` (triaged, v0.4) |
| MN-M6-19 | commit window — shas | Approver rulings at gates contain forward proposals: "the allowlist upkeep ... as the first step of switching the name-resolvability gate to fail mode" (461b71ff); "to be reviewed at the next release-planning's dependency sweep o | covered | T13 |
| MN-M8-4 | batch registers — w2-b1 item 4 | Decision-log proposed: pin the byte format of the spec-012 payload (fences, headings, joins, fallback heading, verbatim-body heading clashes) before the payload is consumed. | superseded | `task-255` pinned the payload byte format: spec-012 Revision 2026-10-06 (`grep -n "byte format" docs/04_memory/design/specs/spec-012*.md`) |
| MN-M8-5 | batch registers — w2-b1 item 5 | Decision-log proposed: add `stacks` to the DNA section of the context payload; adding it later changes the byte stream and needs a superseding spec. | superseded | spec-012 §4 carries `stacks` (`dl-151` option A, `task-255`) |
| MN-M8-13 | batch registers — w2-b1 item 13 | Handover note: tasks 218 and 195 must forward the context assembly warnings (unreadable Memory files) to their CLI/MCP surfaces. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-15 | batch registers — w2-b2 item 1 | Decision-log proposed: ratify the `intake/` branch prefix and its fast-forward merge, state the on-main exceptions (~330 first-parent non-merge commits since 2026-10-01), and resolve the design/qa/docs prefix overlap. | element | `dl-152` (ready, v0.3) |
| MN-M8-20 | batch registers — w2-b2 item 6 | Decision-log proposed: decide whether `workflows/bindings.yaml` is a dl-149 file kind (it has no `format:`) before the engine reads it. | element | `dl-153` (ready, v0.3) |
| MN-M8-23 | batch registers — w2-b2 item 9 | Handover note: the MCP registration check's expected-channels list must gain `tools` in the advance-pinned-build commit that moves the pin past task-174. | superseded | same as M4b#43 |
| MN-M8-30 | batch registers — w2-b3 item 2 | Decision-log proposed: who reconciles the six P3.8 stand-in directives with the shipped built-ins, once bug-040 is closed and texts say "not scheduled". | element | `dl-155` (ready) |
| MN-M8-54 | batch registers — w2-b4a item 14 | Decision-log proposed: ratify or remove two rules in git-conventions §7 that go beyond dl-117. | element | `dl-158` (ready, v0.3) |
| MN-M8-56 | batch registers — w2-b4a item 16 | Note for W3: tasks that add mutating verbs or MCP Tools must update spec-008 §11 / spec-004 §4.1 in the same task or the parity gate fails. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-71 | batch registers — w2-b4b item 15 | Note: in-process REQ-PERF-02/04 suites in the parallel pass now contradict the SARD's "otherwise idle machine" condition; amend bug-221's notes. | element | `bug-221` (triaged, v0.4) |
| MN-M8-79 | batch registers — w3-b1 line 9 | Idea: memory history and the governance check do not read or verify the "Carries content:" submit line. | element | `bug-287` (triaged, v0.4) |
| MN-M8-87 | batch registers — w3-b1 line 17 | Handover: a mutating `agent` op must be added to the reviewed-writers list in the built-in adapter writers test, or it fails. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-90 | batch registers — w3-b1 line 20 | Handover: agent execute must call the run-log preflight before spawn and record the run via writeAndCommit after phase B. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-91 | batch registers — w3-b1 line 21 | Handover: agent execute should use the shared element-ref parser for `--element`. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-93 | batch registers — w3-b1 line 23 | Handover: task-199 must update a characterization test when removing three warnings; spec-017 §12 citations shifted; later tasks import registry from the core barrel. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-95 | batch registers — w3-b1 line 25 | Follow-up for approver: widen the unknown-type diagnostic in the spec-003 row to cover set_state/sync_state and selection types. | restated | spec-003 diagnostic wording, v0.4 (a bug, low) |
| MN-M8-97 | batch registers — w3-b1 line 27 | Handover to task-245: `--dry-run` is per mutating command, not a global flag; post-commit warnings are absent in dry run. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-105 | batch registers — w3-b2 line 6 | Reviewer asks a ruling (DL or bug under dl-132): Casey approve/reject in Journey 5 versus the personas and brief text that say the persona never changes state. | restated | decision-log on whether the persona Casey approves (Journey 5 step 8) against the persona text, v0.4 (`bug-289` line 53 leaves it open; `dl-113` ready) |
| MN-M8-109 | batch registers — w3-b2 line 10 | Handover on bug-193: reserved second-level domains now reach the schema too via the shared helper. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-112 | batch registers — w3-b2 line 13 | Check that task-245 owns the CLI-commands doc gaining agent show/list. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-122 | batch registers — w3-b2 line 23 | Handover: spec-016 §2.1 still calls adapter optional; since task-260 it needs an email, so execute fixtures need one on every adapter entry. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-124 | batch registers — w3-b2 line 25 | Handover on bug-193: its fix will also refuse example.com agent emails; tests and docs must be updated. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-133 | batch registers — w3-b2 line 34 | Handover: selectWorkflowInstance answers only "workflow is not open"; the unknown-workflow message belongs to 204/216; one rev-list per start for 203; one warning per path for 240. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-134 | batch registers — w3-b2 line 35 | Handover to task-202: restore the iterate_over item scope in elementKey and hasRecord; reword "No deduction rule changed". | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-138 | batch registers — w3-b3 line 5 | After task-212, the proposal form and COLLABORATION.md should route feature requests to vision-change. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-139 | batch registers — w3-b3 line 6 | Handover: task-271 must extend, not repeat, COLLABORATION.md's contributor/reported_by bullet. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-141 | batch registers — w3-b3 line 8 | Handover: retrospective.yaml is 1.4 after task-213, must bump to 1.5 or more; reuse outcome labels (covered, element, restated, superseded, declined, needs-info). | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-147 | batch registers — w3-b3 line 14 | Approver owes the real publish:staging transcript and the first CI run of the e2e-smoke job after push. | superseded | the staging rehearsal and the e2e-smoke CI job ran for 0.3.0 (`release-publishing-rel-v0.3-plan`, run 39318377532) |
| MN-M8-152 | batch registers — w3-b3 line 19 | Handover: COLLABORATION.md Credit section already has the issue-to-contributor rule; extend it. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-153 | batch registers — w3-b3 line 20 | Handover: reuse dl-115 labels in task-272. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-158 | batch registers — w3-b3 line 25 | Handover: workflow-next part of AC2 goes to task-216. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-160 | batch registers — w3-b3 line 27 | Handover: task-204's spec-003 amendment could fix the stale staged-gate wording. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-162 | batch registers — w3-b3 line 29 | Handover: fold the docs/07_gates use into task-222's numbering ruling. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-165 | batch registers — w3-b3 line 32 | Gate action: file a new task for dl-156 Actions 2-3 (requireWipSlot across refs, reject exemption, spec updates, scenarios) in v0.3. | element | `task-274` (done) implements `dl-156` Actions 2–3 |
| MN-M8-167 | batch registers — w3-b3 line 34 | Gate: copy handovers into task-216 and user-docs. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-180 | batch registers — w3-b3 line 49 | Handover to task-245: CLI-commands doc line should read `workflow show <ref>`. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-188 | batch registers — w3-b3 line 68 | Approver question: the MCP pre-flight server reads working-tree config, a declared exception to the HEAD rule; a decision-log is needed (later: FILE AT GATE, in-discussion). | element | `dl-165` (in-discussion, v0.3; plan D4) |
| MN-M8-190 | batch registers — w3-b3 line 70 | Handover task-228: the MCP pre-flight timeout is a single deadline (worst case ~60 s vs REQ-PERF-01 30 s); SIGINT leaves a temp dir. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-199 | batch registers — w3-b3 line 85 | Consumer inbox ready: Templates repo with feedback inbox, F-001..F-021 open, to be registered after task-269. | superseded | registered as `svc-018` (active) |
| MN-M8-214 | batch registers — w3-b3 line 111 | Consumer inbox ready for the UI repo (private), F-001..F-019 open; verification needs auth; register after task-269. | superseded | registered as `svc-019` (active) |
| MN-M8-239 | batch registers — w3-b4 line 29 | ci.yml e2e-smoke job could use `--candidate`. | restated | the CI e2e-smoke job could run `--candidate` (bug, low, v0.4) |
| MN-M8-251 | batch registers — w3-b4 line 44 | Approver question: accept team.agents as author/committer for G07 once agent execute authors commits (dl-089 wording kept). | element | `dl-169` (in-discussion, v0.4) |
| MN-M8-315 | batch registers — w3-b6 task-238 section (developer) item | Proposed: a metric or test comparing the publish gate's timeout with the latest CI packaging-gate duration, flagging a margin below 2x. | restated | a metric comparing the publish gate timeout with the latest CI gate duration, into `dl-173` (in-discussion, v0.4) |
| MN-M8-316 | batch registers — w3-b6 task-238 section (developer) item | Re-verify tag-object preservation when the checkout action pin moves (gate log must show the tags refspec). | covered | T12 (a release-publishing check when the checkout pin moves) |
| MN-M8-317 | batch registers — w3-b6 task-238 section (developer) item | Hardening: verify the sigstore bundle of the registry publisher's checksums file, not only the SHA. | restated | verify the sigstore bundle of the registry publisher's checksums file (security hardening, v0.4) |
| MN-M8-321 | batch registers — w3-b6 task-238 section (developer) item | Handover to task-266: registry versioning docs sort semver and mark latest themselves. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-335 | batch registers — w3-b6 task-232 section (developer) item | withGuardedWorktree could be shared with e2e-smoke's SIGINT leak. | element | `bug-321` (triaged, v0.4) |
| MN-M8-338 | batch registers — w3-b6 task-240 section (review) item 2 | Decision-log proposed: uniform diagnostic presentation across deduction readers (stdout count line vs stderr warnings). | element | `dl-176` (in-discussion, v0.4) |
| MN-M8-346 | batch registers — w3-b6 task-232 section (review) item 3 | Run-time readings Q17, G15, E01-E05 must not count as regressions in compare; candidate for dl-173. | element | `dl-173` (in-discussion, v0.4) |
| MN-M8-347 | batch registers — w3-b6 task-232 section (review) item 4 | Optional: one guarded-teardown helper shared with bug-321. | element | `bug-321` (triaged, v0.4) |
| MN-M8-349 | batch registers — w3-b6 task-239 section (developer) item | advance-pinned-build should say a KNOWN_READ_FAILURES entry for the old pin fails check:mcp and must be deleted. | superseded | same as M4b#43 |
| MN-M8-362 | batch registers — w3-b6 task-230 section (review) item 1 | Decision-log proposed: should element: iterations run in order (wave n+1 held until wave n completes)? | element | `dl-175` (in-discussion, v0.4) |
| MN-M8-366 | batch registers — w3-b6 task-230 section (review) item 5 | Note: a future growth.clear binding must read the release's growth_threshold.in_force_from, else it blocks v0.3. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |
| MN-M8-374 | batch registers — w3-b6 task-233 section (review) item 1 | Decision-log or dl-173 extension: Q15 code vs catalogue v2, config-only fixes counted, Q09 fictional ids, Q08 runtime dependencies as metric. | element | `dl-173` (in-discussion, v0.4) |
| MN-M8-381 | batch registers — w3-b6 task-277 section (review) item 1 | DL or dl-166 extension: on a release past draft define-scope is deduced complete from state evidence, so the sweep is never offered; a change-proposal scheduled after define-scope has no sweeping phase. | element | `dl-166` (in-discussion, v0.4) |
| MN-M8-399 | batch registers — w3-b7 item 16 | A backfill compare of v0.2 against v0.1 would flag G10 immediate and G05/Q04/Q08 floors; approver decides whether to file anything. | restated | a backfill compare of v0.2 against v0.1: the approver decides whether to run it (no element proposed) |
| MN-M8-418 | batch registers — w3-b7 item 35 | Resume for codex-cli (session id none, resume unsupported in v0.3) is a v0.4 follow-up. | element | `bug-375` (triaged, v0.4) |
| MN-M8-428 | batch registers — w3-b7 item 45 | External request (Templates F-030): init selects a catalog preset by id; observed `--preset` unknown option on 0.2.2; proposed handling a dl-138 amend for v0.4 planning. | element | `dl-138` (ready, v0.4); svc-018 F-030 |
| MN-M8-467 | batch registers — w3-b9 item 11 | Reviewer: file a DL (or dl-159 A2 amend) now on the merge-forward issues; a patch-bug triage approve/reject on main breaks git-conventions §1 rule 4 and must go via an ingest branch cut from release/X.Y, which no text says. | element | `dl-185` (in-discussion, v0.3; plan D4) |
| MN-M8-475 | batch registers — w3-b9 item 19 | The future engine must render `{release.kind}` as "" for an exempt (pre-dl-092) release; the arg pattern accepts it, untested; handover to release-publishing v0.3. | covered | T9 (a task-to-task handover inside the release; every v0.3 task is `done` or `deprecated`) |

**Counts:** 156 proposals — covered 64, element 53, restated 27, superseded 12. The `restated` rows are the new proposals the approver takes up or not at `additional-points`; `capture` files the ones taken (ids from the CLI).

Ids: `RH-v0.3-NN` the release-health report; `PP-NN` the phase-plan retrospectives; `KR-<phase>-<item>` the phase
registers kept outside the repository; `D4-140` release-publishing's ruling D4; `LD-<C|K|X><n>` the leads handed over
by other sessions (C coordinator, K a consumer project, X a demo preparation); `P-01` the approver; `MN-<slice>-<row>`
a proposal a miner found written in a source of its slice (the citation names the document, or the register item).

## Post-check

`secondary-sources.listed` (retrospective.yaml `explore`, unbound): the six secondary sources above are listed with the
commit read (the registers kept outside the repository are not versioned and are listed with their read date); every
proposal of every source has one proposed outcome in the table above. Checked by the facilitator, 2026-10-21.
