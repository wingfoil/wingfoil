---
id: "release-submit-rel-v0.1-plan"
type: plan
title: "Release-submit — v0.1 (Project Memory + Project DNA)"
status: draft
workflow: "release-submit"
phase: "rel-v0.1"
element: "minor-v0.1"
parent: "release-cycle.submit"
release: "v0.1"
tmpl_version: 261010
---

# Release Submit — v0.1 (Project Memory + Project DNA)

## Context

`minor-v0.1` (`docs/04_memory/planning/rl-v1/minor-v0.1.md`) is `in-development`; its
`dev-loop` is complete — all 33 tasks `done`, suite green (548/548). Per `release-cycle`
(`.wingfoil/workflows/custom/release-cycle.yaml`), the phase after `implementation`
(`dev-loop`) is `submit`, i.e. the **`release-submit`** sub-workflow
(`.wingfoil/workflows/custom/release-submit.yaml`), scoped to `minor-v0.1`. Per
CLAUDE.md §6/§10.7 (no workflow engine yet), this document is the coherent plan required before
executing that phase.

`release-submit` assembles the release: run pre-release checks (`qa`), move the release into
`releasing` (`tech-lead`), and gate on human approval before publishing (`approver`). This plan
covers the first two phases and stops at the approval gate — agents never self-approve (§4/§8).
Actual publishing is the *next* phase, `release-publishing`, which **dl-018** foresees skipping for
v0.1 (not npm-published) — out of scope here.

---

## 1. Preconditions (verified against current repo state)

- `minor-v0.1` — `status: in-development`.
- Tasks `release=v0.1` (`docs/04_memory/v0.1/`) — **33/33 `done`**.
- Bugs `release=v0.1` (`docs/04_memory/bugs/`): bug-001, bug-002, bug-003 `closed`;
  bug-005 `resolved`; **bug-004, bug-006 `open`** (deferred — see §2.1).
- `jest.config` — `coverageThreshold.global` = 80 on all metrics.

---

## 2. Phase-by-phase plan (`release-submit.yaml`)

### 2.1 `pre-release-checks` — role: qa — **PASS (with documented bug waiver)**

The phase's `checks.pre`:

| Check | Result |
|-------|--------|
| all tasks `release=v0.1` are `status: done` | ✅ 33/33 done |
| all bugs `release=v0.1` are `status: [resolved, closed]` | ⚠️ **approver waiver** (bug-004, bug-006 `open`) |
| `tests.passing` | ✅ 548/548 passed, 57 suites (`npm run test:coverage`) |
| `tests.coverage(min: 80)` | ✅ 97.91% stmts / 87.94% branch / 97.57% funcs / 98.33% lines |

**Bug waiver (approver decision).** bug-004 and bug-006 remain `open` with `release: v0.1`. Under
the **current** field semantics `release:` denotes the release in which the bug was *introduced*,
not the one that must fix it (this reinterpretation — `release` → resolution release — is scheduled
for after the next `retrospective`). Both bugs were **explicitly deferred by the approver from the
v0.1 release** on 2026-07-08 (commit `b304627`), recorded in each bug's `note` field
(`release_origin=v0.1, release_assigned=?`) and Execution Notes:

- **bug-004** (`dna set` strips YAML comments, P2.1, medium) — does not fail any v0.1 journey
  (greenfield configs carry no `[SPEC]`/`[AUTHORING]` comments; hand-edit workaround exists).
  Deferred to a v0.2/patch.
- **bug-006** (`init` scaffolds schema-invalid directive files, P5.1.1, low) — `directives list`
  is a Directives-pillar (P3) command **out of v0.1 scope** (Pillar Focus = P1+P2) and
  undocumented in the README; blocks no documented v0.1 command. Deferred to the release that
  ships the Directives CLI.

The check is therefore **satisfied-with-waiver**, not silently skipped (coherent with dl-016's
"surface, don't skip" intent). Both are to be surfaced as **known limitations** in the v0.1 release
notes (a `release-publishing` artifact). No bug frontmatter is modified by this phase.

### 2.2 `enter-releasing` — role: tech-lead — **action**

`element.set_state(releasing)` on `minor-v0.1`: change **only** `status: in-development →
releasing` in the frontmatter. One commit, single element, present-tense subject (§5.1):

```
wf(release): submit minor-v0.1
```

### 2.3 `approve-release` — role: approver — **NOT executed here**

Final human approval gate (`releasing → released`) belongs to the **approver (Roberto)**. Agents
never self-approve (§4/§8). This plan stops after §2.2 and presents the release for explicit
approval. On instruction, `memory.approve` will run with the mandatory `Approver:` / `Reason:`
commit body (§5.1). `fallback: { step: pre-release-checks }` — a reject re-runs §2.1.

---

## 3. Verification

- `npm run test:coverage` green, coverage ≥80% (captured in §2.1).
- `git log` shows one commit `wf(release): submit minor-v0.1`.
- `grep "^status:" docs/self/docs/04_memory/planning/rl-v1/minor-v0.1.md` → `releasing`.
- No changes to bug files; no other element touched.

---

## 4. Out of scope (later phases)

- `approve-release` — awaits approver instruction.
- `release-publishing` — skipped for v0.1 per dl-018; release notes (with bug-004/006 as known
  limitations) are that phase's material.
- `retrospective`.
