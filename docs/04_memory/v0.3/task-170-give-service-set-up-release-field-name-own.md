---
id: "task-170-give-service-set-up-release-field-name-own"
type: task
title: "Give a `service`'s set-up release a field name of its own"
status: done
release: "v0.3"
kind: "fix"
priority: "low"
tags: ["v0.3", "core", "memory", "traceability"]
ref: "dl-088"
bug: ["bug-166"]
depends_on: ["task-127-add-memory-amend-id-reason-approver-gated-verb"]
tmpl_version: 260703
wave: "w1"
---

## Description

A `service`'s `release` means "set up in", while `traceability` gives `release` one meaning (the release the element's implementation is assigned to) and `build-backlog` stamps it (`bug-166`).

## Acceptance Criteria

- (characterization) the `service` template names the field `set_up_in` (or the design's choice); `svc-*` elements are corrected through `memory amend` (task-127); `traceability.md` states services are not stamped; version bumps.
- (red-first) the `service` type's schema/test refuses a `release` field on a service, or the template test pins the new name.

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** dl-088 (service type); traceability directive (`release` meaning).
- **Features:** P1.13.
- **Notes:** Proposal key: C45.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-170-give-service-set-up-release-field-name-own`, worktree `../.wf2-wt/task-170`,
cut from `main` at `c43221c4`. Start `ff8b8347`; `bug-166` synced `planned → in-progress` (`d2b155c7`).

### design (architect)

**`depends_on`** (dl-015): `task-127` Execution Notes read. What this task takes from them: `service`
is `amendable: true`, so the `svc-*` corrections go through `memory amend`; but the approver's ruling
(b) at its review put `release` in `AMEND_RESERVED_FIELDS` (`src/core/memory-amend.ts`), owned by
`assign`. A rename of `release` changes that field, so `amend` refuses it (see Pending amendments).

**Specs and decisions cited:** `dl-088` `ready` (`awk '/^status:/{print $2;exit}'`); the
`traceability` directive (custom, no status). No tech-spec declares the `service` fields, so none is
edited.

**Design decisions** (to confirm at review):
1. **Field name `set_up_in`**, the name the AC and `bug-166` propose. Of `bug-166`'s two options
   (rename, or declare `service` outside the uniform meaning) both are taken: the field is renamed
   *and* the directive states a service is never stamped and carries no `release`.
2. **No schema-level refusal.** `memory.yaml` declares only `template.frontmatter.required` per type;
   there is no per-type forbidden-field key. Adding one is new schema (`spec-001`) for one field, so
   the AC's second branch is taken: the template test pins the new name and the absence of `release`.
3. **`release-planning.yaml` is not edited.** Its `element.set_release` comment already lists
   "DL, bug, tech-spec, adr, task" and no `service`; the directive is where the meaning lives.
4. **Versions:** `.wingfoil/memory.yaml` 1.7 → 1.8 (a comment on the `service` entry; first edit
   since its last commit). The scaffold's `tmpl_version` 260929 → 261001, as `92908e8c` did for the
   `release` template when its field set changed. `traceability.md` has no `version` field.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — template names `set_up_in`; `svc-*` corrected; `traceability.md`; version bumps | characterization (configuration and documentation) | no behaviour; pinned by AC2's test |
| 2 — the template test pins the new name | **red-first** | `service-memory-type.test.ts` read the committed scaffold, which named `release` |

### red (developer)

`13d6f1f0`: `test/core/service-memory-type.test.ts` — `OPTIONAL` names `set_up_in` instead of
`release`, and a new case asserts the scaffold has no `release` key and that the `set_up_in` comment
says "the release in which it was set up" and "never stamped". The test reads the scaffold committed
at `HEAD` (`resolveAddType`). `npx jest test/core/service-memory-type.test.ts` → **2 failed, 10
passed** (`Expected value: "set_up_in"`; `Expected value: not "release"`).

### green (developer)

`5cc86d1f`: `.wingfoil/memory/templates/service.md` (`set_up_in`, `tmpl_version: 261001`),
`.wingfoil/directives/custom/traceability.md` (a bullet: a `service` is not a base document, is
never stamped, carries no `release`; its set-up release is `set_up_in`), `.wingfoil/memory.yaml`
(1.8, comment on `service`). Same command → **12 passed**. Both builds read 1.8:
`npm run -s wingfoil -- memory search --type service` and `node dist/cli.js memory search --type
service` → exit 0.

### refactor (developer)

No source change. Gates on `5cc86d1f` with the pending amendments in the working tree,
`npm run build` first:

| Command | Result |
|---|---|
| `npm test` | 166 suites / 2760 tests passed |
| `npm run test:coverage` | exit 0; 98.73 / 94.58 / 94.01 / 99.49 (stmts / branches / funcs / lines) — equal to `task-127`'s final figures; no `src/` file changed (`git diff --stat c43221c4 -- src` → empty) |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

BDD: no feature file names `service` (`grep -rln service docs/02_requirements/02_bdd/features/` →
nothing); no AC asks for a scenario.

### review (reviewer)

- AC1: `5cc86d1f` (template, directive, `memory.yaml` 1.8); the `svc-*` and `dl-088` edits are
  pending amendments, below.
- AC2: `13d6f1f0` red → `5cc86d1f` green, commands above.
- Same class: `grep -rn "renews\|repo_refs"` outside services, plans and the scaffold lists the
  places that enumerate the service fields. `dl-088`'s table is the one live definition (pending
  amendment). `task-124`'s notes (lines 44, 134) record what that task built and stay as written.

### review (independent)

The coordinator's review returned **APPROVE WITH FIXES**. The task stays `in-review` and was not
resubmitted. The approver's ruling (Roberto, 2026-10-01) resolves the blocker reported at submit:
`memory amend` refused all 12 `svc-*` renames, because `release` was in `AMEND_RESERVED_FIELDS` for
every type (`task-127` ruling (b)). He chose **option (A)**: `release` stays reserved only on the types
`build-backlog` stamps through `assign`, and is implemented in this task.

**Design: how the reservation is keyed.** The reviewer recommended keying on the type's committed
scaffold rather than a hardcoded type list. I kept that keying: `release` is reserved exactly when the
type's scaffold **committed at `HEAD`** declares a `release` frontmatter field. The scaffold is
`template.file` of the committed `memory.yaml`, the baseline every other amend check reads
(`command-baseline`). Why this keying and not a type list:
- the scaffold is where a type declares the fields its documents carry, so the rule follows the
  configuration, not a list in code that a project with other types or workflows would have to edit
  (determinism directive: declared config over inferred behaviour);
- it is exactly bug-166's point: a type that carries `release` carries the `traceability` meaning,
  and `assign` owns it. A type whose scaffold has no `release` has no `assign`-owned field, so a
  leftover `release` key may be removed;
- **fail safe:** with no `template.file`, no committed scaffold or a frontmatter that does not
  parse, nothing shows that the field is unowned, so it stays reserved.

**One difference from the ruling's wording** (to confirm): the ruling names `plan` among the types
on which amend may change `release`. `plan`'s scaffold declares `release: ""` ("target release",
`.wingfoil/memory/templates/plan.md` line 10), so under this keying a plan's `release` **stays
reserved**. `build-backlog` does not stamp plans, so a plan's `release` is a second meaning of the
same name, the bug-166 class. I left it reserved and report it as a candidate finding rather than
special-casing `plan` in code. If the approver wants plans open now, a one-line exception would do
it, but it would bring back a type list.

AC classification for the ruling:

| Behaviour | Class |
|---|---|
| amend on a service may rename `release` → `set_up_in` | **red-first** |
| `amendReservedFields` (service without `release`, task with it) | **red-first** |
| the committed scaffold decides, not the working tree | **red-first** (passing it needs the new keying) |
| amend on task / bug / tech-spec / decision-log still refuses `release` | characterization (already true) |
| no committed scaffold → reserved | characterization |
| relevance: a service with `set_up_in` is not release-scoped (reviewer finding 2) | characterization |

**red** `3cb50960`: `test/core/memory-amend-release-reservation.test.ts` (new) and a block in
`test/core/relevance.test.ts`. `npx jest test/core/memory-amend-release-reservation.test.ts` →
**4 failed, 5 passed**. The service rename was refused on `frontmatter field 'release'`, and the
three `amendReservedFields` cases failed because the export did not exist. The relevance block passed
on first run, 26/26 (characterization).

**green** `7e38dc57`:
- `src/core/memory-amend.ts`: `amendReservedFields(root, memoryYaml, type)`, and
  `requireAmendableEdit` now takes the reserved list.
- `src/core/index.ts`: `memoryAmendFn` passes it, and step 6 of its TSDoc says so.
- `src/memory/frontmatter-edit.ts`: a comment names the function.

`npx jest test/core/memory-amend-release-reservation.test.ts test/core/memory-amend.test.ts` →
37 passed. `task-127`'s ruling-(b) `release` row on a tech-spec still passes, because its fixture
commits no scaffold, so `release` stays reserved.

`40cc45d9`: three fail-safe cases (no `template`, invalid YAML, no frontmatter block).
`f4aaf308`: `reserved` is a required parameter. The only caller passes it, so the default was an
uncovered branch.

**Docs:** `9485070a`, `docs/cli-reference.md`'s `memory amend` entry. `npx jest test/docs` → 4
passed. `spec-010` (the § Field-write ownership row and its `release` bullet, plus a Revision note)
and `spec-008` (§2's amend paragraph, plus a Revision note) are **pending amendments**, listed below.

**Reviewer finding 2: relevance.** `src/core/relevance.ts` `isSameReleaseScope` (T2) reads
`frontmatter.release` on every document, services included. After the rename, svc-001/002/004/008/009
(`release: "v0.2.2"`) no longer score the same-release tier for a v0.2.2 element. The same holds for
svc-003/005/006/007/010/011/012 and v0.2. This is intended by bug-166: a service is no release's
work. It is now recorded by the test "T2 reads `release` only: a service carrying `set_up_in` no
longer scores the same-release tier". `relevance.ts` is unchanged.

**Pending amendments verified on a scratch clone** of the branch at `9485070a`, with this worktree's
15 uncommitted files copied in. For each one I ran `node <worktree>/dist/cli.js memory amend <id>
--reason "<proposed reason>"`, using the code version, since the pinned 0.2.1 has no `amend`:
- dl-088, spec-008, spec-010 and svc-001…012: **15 × exit 0**;
- 15 commits, each holding exactly one file (`git show --name-only`), the working tree clean after;
- subjects `[active → active]`, `[pending → pending]` (svc-012), `[deprecated → deprecated]`
  (svc-007), `[ready → ready]` (dl-088), `[approved → approved]` (specs).

The clone was deleted afterwards. **Order:** these amends pass only with this branch's code *and*
its committed service scaffold at `HEAD`. Run them after `task-170` is merged, with the dev build
(`node dist/cli.js`), not before and not with the pinned build.

**Gates** on `f4aaf308` with the pending amendments in the working tree, after `npm run build`:

| Command | Result |
|---|---|
| `npm run test:coverage` | exit 0; 167 suites / 2774 tests; 98.73 / 94.61 / 94.03 / 99.49 (`main` per task-127: 98.73 / 94.58 / 94.01 / 99.49): no regression. `memory-amend.ts` 100 / 96.55 / 100 / 100; the uncovered branch, line 143, predates this task |
| `npm run -s lint` | exit 0 |
| `npm run -s docs:api` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.build.json --noEmit` | exit 0 |

### Pending amendments (approver)

15 uncommitted edits in the worktree. With this task merged, all 15 pass `memory amend` (verified
above).

- `dl-088-a-memory-type-for-state-that-lives-outside-the-repository` (body table row): `--reason "The frontmatter table names the set-up release set_up_in instead of release, which a service no longer carries (task-170, bug-166)."`
- `svc-001` … `svc-012` (12 elements, one line each, `release: "<v>"` → `set_up_in: "<v>"`, value
  unchanged): `--reason "Rename the set-up release field from release to set_up_in, the name the service scaffold now uses; the value is unchanged (task-170, bug-166)."`
- `spec-010-memory-frontmatter-schema` (§ Field-write ownership row and `release` bullet, Revision
  note): `--reason "Field-write ownership: release is reserved for amend only on a type whose committed scaffold declares it, per the approver's ruling of 2026-10-01 (task-170, bug-166)."`
- `spec-008-cli-grammar` (§2 amend paragraph, Revision note): `--reason "The amend paragraph states that release is reserved only on a type whose committed scaffold declares it, per the approver's ruling of 2026-10-01 (task-170, bug-166)."`
