---
id: "bug-012-mcp-latency-single-sample"
type: bug
title: "REQ-PERF-04's MCP budget is a single wall-clock sample, the one timing shape left that can flake"
status: closed
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P5.2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`test/mcp/server.test.ts:104-108` asserts REQ-PERF-04's 1,000 ms budget from a **single**
`performance.now()` sample around one `client.readResource` call, with no p95 smoothing — the last
timing assertion in the suite that has no statistical shape, and therefore the next most likely
wall-clock flake after `bug-011`.

## Steps to Reproduce

Not currently reproducible as a failure: the measured call runs in a few milliseconds against a tiny
fixture, so it sits far from the budget. The defect is the assertion's shape, not a present failure.

## Expected Behavior

Timing assertions converge on the same shape used everywhere else in the suite — p95 over N runs, as
`test/core/query-latency.test.ts` and `test/core/resource-latency.test.ts` do. A budget backed by one
sample cannot distinguish a genuine regression from one scheduling hiccup.

## Actual Behavior

```ts
const start = performance.now();
const result = await client.readResource({ uri: 'wingfoil://memory/decision-log/decision-12' });
const elapsed = performance.now() - start;
expect(elapsed).toBeLessThan(1000);
```

One sample, one comparison.

## Notes

Distinct from `bug-011` and not fixed by it: this measurement is **in-process**, so it never had
`bug-011`'s process-spawn problem and `task-067`'s guard correctly leaves it alone (the guard's remit
is spawn-plus-clock, which this is not). Raised by `task-067`'s reviewer, who judged it correctly out
of that task's scope.

Suggested fix: adopt the `RUNS`/`p95()` convention already established by `task-008` in
`query-latency.test.ts` — run the `readResource` N times and assert p95, keeping the 1,000 ms
threshold. Note the nearest-rank caveat the same reviewer raised: at N=25 a p95 tolerates exactly one
outlier, which is the intended behaviour here.

Severity `low`: no user-facing defect and no observed failure; it is a latent gate-reliability issue
of the class this release has already paid for once.

## Triage & Execution Notes

- capture (`bug-ingest`): raised by `task-067`'s review; scheduled to `v0.3` on the approver's
  instruction.
