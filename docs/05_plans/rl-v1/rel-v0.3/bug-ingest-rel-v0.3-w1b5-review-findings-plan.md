---
id: bug-ingest-rel-v0.3-w1b5-review-findings-plan
type: plan
title: "Bug-ingest — rel-v0.3 wave 1 B5 review findings"
status: active
version: "1.0"
workflow: "bug-ingest"
phase: "rel-v0.3-w1b5-review-findings"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 260703   # Orignal template version
---

## Context

The independent reviews of wave 1 batch B5 (`dev-loop-rel-v0.3-plan`, 2026-10-03..05: `task-153`, `task-154`,
`task-158`, `task-159`, `task-162`, `task-163`) left findings outside each task's scope. They are captured here
through `bug-ingest` (`.wingfoil/workflows/custom/bug-ingest.yaml` v1.0), with `release-origin: "v0.3"`, against
`main` at `1127a0fd` (B5 merges up to `be8184ec`), with the code build (`npm run -s build && node dist/cli.js
memory …`; ids allocated by the CLI). Every finding was re-run on `main` before filing, most on scratch
repositories made by `wingfoil init --template Kanban`; each bug's Steps to Reproduce give the commands and what
they printed.

The REQ-PERF-02 question raised by `task-154` (marginal vs total) is a decision, not a defect: it is captured
separately by `decision-log-ingest-rel-v0.3-req-perf-02-plan` (`dl-146`).

## Phases / Steps

1. **capture** (developer), done 2026-10-05: `bug-212` … `bug-221` (`open`), one `memory add` and one
   `memory submit` per bug. Before filing, `docs/04_memory/bugs/` was searched for each finding (`staged`,
   `rollback`, `pre-commit`, `supersed`, `states.values`, `adr-008`, `idPatternIssues`, `{date}`, `latency`):
   none was covered. Nearest, not duplicates: `bug-027` and `bug-182` (closed; other staging defects),
   `bug-052`/`bug-053` (closed; other stale machine descriptions), `bug-099` (`X_cli-cmds.md`'s `tech-stack`,
   `task-245`), `bug-013` (closed; REQ-PERF-02 coverage, followed by `dl-146`).
2. **triage** (⛔ approver). Proposals:

   | Bug | Severity | Proposal |
   |---|---|---|
   | `bug-212` vision lists `conventions`/"tech stack" as DNA | low | v0.3, absorbed into `task-186` (it already edits `docs/01_vision/01_product-brief.md` and `04_personas.md` with version bumps; the brief holds one of the six lines, three sibling files the rest) |
   | `bug-213` spec-009 / adr-008 retired machine encoding | low | v0.3, absorbed into `task-188` (it corrects `spec-011`'s stale text after `task-153`'s row fix; `spec-009` §1 and `adr-008` are the same class; `adr-008` gets a dated note through `memory amend`, possible since `task-158`) |
   | `bug-214` `memory add` writes `draft` literally | medium | v0.3, absorbed into `task-180` (it extends the state-machine schema and the verbs that read it; the head-of-`sequence` lookup is one line in the same area). Does not fire in this repository (every type starts at `draft`), so v0.4 is acceptable if `task-180` should stay narrow |
   | `bug-215` counter takes a `{date}` as `{n}` | medium | v0.4, unabsorbed: needs a ruling on the counter rule (`spec-001` "Counter algorithm", `dl-101`), and fires only after a pattern change or with a shared folder |
   | `bug-216` `id_pattern` never validated | low | v0.3, absorbed into `task-194` (configuration diagnostics at `HEAD`, the same registry-loading pass); otherwise v0.4 |
   | `bug-217` failed `memory add` leaves the file staged | medium | v0.3, absorbed into `task-210` (`--dry-run` is implemented once in the commit primitive; the rollback of a failed commit is the same seam) |
   | `bug-218` half-done supersede pair undetected | medium | v0.3, absorbed into `task-208` (it enforces `check:governance`; one rule for "supersedes names an element not `superseded`" belongs with it); the repair verb, if wanted, v0.4 |
   | `bug-219` `supersedes` template comment / init scaffold | medium | v0.3, absorbed into `task-209` ("make the templates tell the truth": the comment fix); the `init` scaffold part (field + `superseded` edge) may split to v0.4 at design |
   | `bug-220` CLAUDE.md / `.wingfoil/README.md` predate amend and supersede | low | v0.3, the release's `user-docs` phase (`align-agent-docs`, `dl-025`), no task — as `bug-210` |
   | `bug-221` in-process latency suites in the parallel pass | low | v0.4, unabsorbed (intermittent, re-run workaround; the coverage-config change is its own decision). Revisit with `dl-146`'s ruling |

## Handoff

- **Approver:** the triage.
- **Agent:** capture, and the triage mechanics once ruled (`approve [open → triaged]`, `assign release`, the
  absorbing tasks' `memory amend`, `sync [triaged → planned]`).
- **Completion criteria:** every captured bug `triaged` or `closed`; this plan `active → done`.

## Execution Notes

- **capture done (2026-10-05)** — ten bugs, each `memory add` then `memory submit` (`draft → open`), one commit
  per operation (`86b98a47` plan add … `89267732` last submit), each checked with `git show --stat` (one file):

  | Bug | Title | Source | Triage proposal |
  |---|---|---|---|
  | `bug-212` | docs/01_vision still lists conventions and tech stack as DNA sections, which the user story map and BDD no longer do | `task-159` review | v0.3 → `task-186` |
  | `bug-213` | spec-009 and adr-008 still describe the retired values/initial/transitions state-machine encoding | `task-153` notes, `task-158` review | v0.3 → `task-188` |
  | `bug-214` | memory add writes status draft literally instead of the head of the type's state machine | `task-153` notes | v0.3 → `task-180` (or v0.4) |
  | `bug-215` | The id counter takes an 8-digit date as the last number when a type's id_pattern moves from {date} to {n} | `task-163` review | v0.4 |
  | `bug-216` | memory.yaml id_pattern values are never checked by idPatternIssues, so a malformed token surfaces as impossible --set advice | `task-163` review | v0.3 → `task-194` (or v0.4) |
  | `bug-217` | memory add leaves its new document staged when its commit fails | `task-163` review | v0.3 → `task-210` |
  | `bug-218` | Nothing detects a supersedes pair left half-done when the finalize commit fails | `task-162` review | v0.3 → `task-208` |
  | `bug-219` | The supersedes template comment suggests a short id the trigger cannot resolve, and an init scaffold cannot reach the trigger at all | `task-162` review | v0.3 → `task-209` |
  | `bug-220` | CLAUDE.md and .wingfoil/README.md predate memory amend and the supersedes trigger | `task-162`, `task-158` reviews | v0.3 → `user-docs` phase |
  | `bug-221` | The in-process latency suites still run in the parallel jest pass and can fail under load | `task-154` notes | v0.4 |

- Nothing was dropped: all ten findings reproduced on `main`, except `bug-221`'s failure itself, which is
  intermittent (`npx jest test/core/query-latency.test.ts test/mcp/resource-latency.test.ts` at load ≈ 15 → 8
  passed); it is filed on `task-141`'s recorded 1,148 ms failure and the verified configuration.
- `bug-215` reproduced twice: a pattern change (`bug-20261005-dated-one` then `bug-20261006-numbered-one`) and a
  shared folder (`item-20261005-a-decision` then `item-20261006-a-bug`).
- `bug-218`'s reproduction needed a custom `adr` machine, an approver member and a `supersedes` template field
  on the scratch repository, which is itself `bug-219`'s second point.
