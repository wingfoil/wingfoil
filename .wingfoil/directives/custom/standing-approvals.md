---
id: standing-approvals
name: "Standing approvals: the evidence that suffices for a gate and the command the approver runs"
type: directive
kind: custom
title: "Standing approvals: the evidence that suffices for a gate and the command the approver runs"
tags: [custom, approval, process, governance]
version: "1.0"   # 1.0 the first rules: SA-01 adopted, SA-02 proposed (release-planning v0.4 R1 L7, dl-212 D1, task-343; approver ruling at the design gate, 2026-11-12; at the review, approver ruling 2026-11-12: SA-01's evidence checks the committed report against its candidate instead of re-running the smoke, its `warn` exclusion dropped, and both rules' governance item runs against the integration branch's remote; no bump, the file is not on the integration branch yet)
ref: [P3.5, P3.7, REQ-SYS-08]
---

# Directive — Standing approvals

**Date:** 2026-11-12

Custom WingFoil rule. Applies to the **`approver`** role only (`roles.yaml`). The v0.4 planning ruled standing
approvals "only as commands the approver runs, one rule at a time, once each rule has an id in a directive"
(`release-planning-rel-v0.4-plan` R1, L7), answering the request that gates with mechanically checkable evidence be
approved under a standing rule (`docs/09_retrospectives/rl-v1/rel-v0.4-planning-feedback-triage.md`, row C-18). This
directive is where the rules are kept; it is decided against `dl-212` D1 and `dl-103` §2 (i).

No rule lets an agent run an approver verb: the approver runs every command below from their own terminal, and the
verbs refuse an agent's session with `E_AGENT_CONTEXT` (`dl-212` D1, `spec-018` §3).

A rule is not a delegate (`dl-103` §2 (ii)) and changes no verb, no authority check and no workflow: every gate it
names still declares `approval: { by_role: approver }`, and the approval is still the approver's own commit, with the
approver's `Approver:` line. A rule only tells the approver which evidence suffices for that gate and which exact
command to run. Neither a coordinator nor any other agent approves under a rule: an agent may run a rule's evidence
commands and queue the gate citing the rule id with their outputs; whether the rule applies is the approver's call.

## 1. What a standing rule is

- A rule covers **one gate**: a phase that declares `approval: { by_role: approver }`, named by its step key.
- Every condition of a rule is **a command and its expected output**. A condition that needs judgement — an agent's
  verdict included — keeps the gate out of the rules: it is listed in §5, or kept `proposed` until a command can
  decide it.
- **An occurrence leaves the rule** when any evidence item does not hold, or when the phase reports anything beyond
  the evidence (a warning, a finding, a follow-up to accept, an uncommitted path). The approver then judges that
  gate as any other, and the approval cites no rule.

## 2. Citing a rule

An approval under a rule cites the rule id in its `Reason:`, in prose, as `under standing rule SA-<nn>`: no line of
the reason begins with `Approver:`, `Reason:`, `WingFoil-Version:`, `Co-Authored-By:` or `AI-Model:`, and the reason
does not end with a paragraph made entirely of `Key: value` lines (`dl-067`, AGENTS.md §5.1).

- One approval cites one rule. The reason states each evidence result it relies on, filled into the rule's template.
- The templates below pass the CLI's own `Reason:` check on an approval, so a reason copied from them is not refused.

## 3. Adopting, changing and retiring a rule

- A rule's id is `SA-<nn>`, stable, and never reused — not even for a rule withdrawn before adoption.
- A rule's **Status** is one of:
  - `proposed` — drafted here, not in force;
  - `adopted (<date>, <ruling>)` — in force from that ruling;
  - `withdrawn (<date>, <ruling>)` — never adopted, kept for its analysis;
  - `retired (<date>, <ruling>)` — adopted, then taken out of force.
- A rule is adopted by the approver, one rule at a time: each adoption, change, withdrawal or retirement is one
  approver ruling and one commit that raises this directive's `version:` once the directive is on the integration
  branch (`doc-versioning`); until then, changes on the branch that creates it keep its first version.

## 4. The rules

### SA-01 — The e2e-smoke gate of a release

- **Status:** adopted (2026-11-12, the approver's ruling D4 at `task-343`'s design gate)
- **Gate:** `e2e-smoke.gate@release:<release id>` — the smoke on the packed candidate, hard-reject (`dl-023`).
- **Who and when:** the `e2e-smoke` phase (qa) runs the smoke on the candidate and commits its report on top of it,
  so the report commit's parent is the candidate. The approver runs every item below after that commit, in a worktree
  at the head the gate is approved on, then runs the Command. The smoke is not re-run: a re-run rewrites the committed
  report. `<candidate>` is the full sha of the commit the release ships; `<report>` is
  `docs/07_gates/rl-<line>/rel-<version>-e2e-smoke.md`.
- **Evidence** (each a command and its expected output; every item must hold):
  1. `git log -1 --format=%P -- <report>` → `<candidate>`
  2. `grep -cx -- '- Expected commit: .<candidate>.' <report>` → `1`
  3. `grep -cE '^Result: \*\*PASS\*\* \([0-9]+/[0-9]+ checks ok\)$' <report>` → `1`
  4. `git diff --name-only <candidate>..HEAD -- . ':!docs/04_memory/' ':!docs/05_plans/' ':!docs/07_gates/'` → empty
  5. `npm run check:mcp` → exit `0`
  6. `npm run check:audit` → exit `0`
  7. `node scripts/check-governance.cjs --base <the integration branch's remote>` → exit `0` (`origin/main` for a minor, `origin/release/X.Y` for a patch, `git-conventions` §9)
  8. `git status --porcelain` → empty
- **Command** (the approver, from their own terminal, at the repository root):
  `node dist/cli.js workflow finalize sw-life-cycle-1-plan --step e2e-smoke.gate@release:<release id> --reason "Approves the e2e-smoke gate of <release id> under standing rule SA-01: the smoke on the packed candidate <candidate> passes <n> of <n> checks (report <report path>, committed on that candidate), and check:mcp, check:audit and the governance check exit 0."`
- **Outside the rule:** a coverage gap or a follow-up the phase proposes, a report on a candidate other than the
  one the release ships.

### SA-02 — The review approve of a task

- **Status:** proposed (kept until a command can check a review verdict; the approver's ruling D5 (b) at `task-343`'s design gate, 2026-11-12)
- **Gate:** `dev-loop.review@task:<task id>` — recorded by `memory approve` (`in-review → approved`).
- **Evidence** (each a command and its expected output; every item must hold):
  1. `node scripts/check-phase-report.cjs report --worktree <task worktree> --report <review report> --base <head at launch>` → exit `0`
  2. `npm test` → exit `0`
  3. `npm run test:coverage` → exit `0` (the 80 % thresholds of `jest.config.js`)
  4. `npm run lint` → exit `0`
  5. `npm run typecheck` → exit `0`
  6. `npm run docs:api` → exit `0`
  7. `node scripts/check-governance.cjs --base <the integration branch's remote>` → exit `0` (`origin/main` for a minor, `origin/release/X.Y` for a patch, `git-conventions` §9)
  8. `git status --porcelain` → empty, in the task's worktree (no pending amendment)
  9. the independent reviewer's verdict, no finding — no command decides it today: `scripts/check-phase-report.cjs` declares no claim for a verdict or a finding
- **Command** (the approver, from their own terminal, at the repository root):
  `node dist/cli.js memory approve <task id> --reason "Approves the implementation of <task id> under standing rule SA-02: the independent review reports no finding, its phase report checks clean against git, and the full suite, coverage, lint, typecheck, docs:api and the governance check exit 0 on the reviewed head <sha>."`
- **Why it is not adopted:** item 9 is an agent's output. A rule that approves whenever an agent reports no finding
  lets that output decide the gate — the broad allow-rule `dl-212`'s Context warns about. It becomes adoptable once
  a command checks the verdict.

## 5. Not a standing rule

Each of these needs judgement, so none becomes a rule:

- the `dev-loop` `design` gate — the criteria's classification and the decisions are the gate's content;
- `memory amend` of any element — the correction's content;
- a bug's triage (`open → triaged`) and a task's `pending → backlog` — severity, release and scope (`dl-191`);
- a `tech-spec` or `adr` approve — the spec-review gate (`dl-022`, the `architecture` directive);
- `release-submit`'s `approve-release` and the publication after it — irreversible;
- the retrospective's `approve`;
- any `reject` — its reason is the judgement;
- `workflow rekey` and `workflow adopt --plan --apply` — the mapping;
- the `review` approve of a task with any finding — the finding's severity is a judgement.

The `red`, `green` and `refactor` records are not approvals, so they need no rule.

> Rationale: the approver's queue was the critical path of v0.3.2 (C-18). A rule shortens the approver's work at a
> gate whose evidence a command already decides, without moving the approval out of the approver's hands: the
> verbs still refuse an agent's session, and every approval still names its approver and its reason.
