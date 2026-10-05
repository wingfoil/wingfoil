---
id: decision-log-ingest-rel-v0.3-req-perf-02-plan
type: plan
title: "Decision-log-ingest — rel-v0.3 REQ-PERF-02 marginal vs total"
status: active
version: "1.0"
workflow: "decision-log-ingest"
phase: "rel-v0.3-req-perf-02"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 260703   # Orignal template version
---

## Context

`task-154` (done, B5) gave REQ-PERF-02 a command-level suite, `test/cli/command-latency.test.ts`, that asserts
each command's **marginal** cost over a `--version` floor and only reports the **total**, while the Fit Criterion
says the commands "return in < 1,000 ms (p95)", start-up included. The approver's ruling of 2026-10-03 left that
gap to a decision-log (`task-154` Execution Notes, `bug-013` Triage notes). It is captured through
`decision-log-ingest` (`.wingfoil/workflows/custom/decision-log-ingest.yaml` v1.0), during v0.3's dev-loop, with
the code build (`npm run -s build && node dist/cli.js memory …`).

Every fact the decision-log states is checked at capture:
- REQ-PERF-02's wording and measurement conditions, against `docs/02_requirements/03_sard/02_performance-nfr.md`;
- the BDD and canvas sources ("returns in under 1 second", "<1 second"), with `grep`;
- what the suite asserts and how it runs, against `test/cli/command-latency.test.ts`, `jest.config.js`,
  `test/latency-suites.cjs`;
- the numbers: the idle run from `task-154`'s notes, the coordinator's post-merge run, and one more run at capture
  (`WINGFOIL_LATENCY_REPORT=1 npm run -s test:latency`, load 14 → 25: floor p95 1,515 ms; marginal 766 / 438 /
  683 ms; total 1,708 / 1,380 / 1,625 ms; 5 passed).

## Phases / Steps

1. **capture** (product-owner): `memory add --type decision-log` → `dl-146` (`2609dec1`), then `memory submit` →
   `in-discussion` (`6e0a58fb`).
2. **approve** (⛔ approver): ratify Q1 (option A, B or C), Q2 (the marginal budget under C) and Q3 (whether
   REQ-PERF-03 follows the same rule). Then `in-discussion → ready`.

## Handoff

- **Approver:** Q1–Q3 and the ratification; the release and task for the SARD amendment and the suite change.
- **Agent:** capture, the fact checks, and the follow-up task(s) once ruled.
- **Completion criteria:** `dl-146` `ready` (or rejected to `draft`); this plan `active → done`.

## Execution Notes

- **capture done (2026-10-05)** — `dl-146-req-perf-02-bounds-the-marginal-cost-over-process-start-the-total-or-both`,
  "REQ-PERF-02 bounds the marginal cost over process start, the total, or both", `in-discussion`. Options (A)
  reword to the marginal, start-up measured separately; (B) keep "return in" and assert the total; (C) both, a
  total budget under an "otherwise idle machine" condition plus a marginal budget. Recommendation stated: (C).
  Cites `bug-013` and `task-154`; related `bug-221` (filed by `bug-ingest-rel-v0.3-w1b5-review-findings-plan`).
- Release proposal: v0.3 (a SARD amendment plus one assertion in an existing suite), as a small task or absorbed
  where the approver prefers; not scheduled until ruled.
