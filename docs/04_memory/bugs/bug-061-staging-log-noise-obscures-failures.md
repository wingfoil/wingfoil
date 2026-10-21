---
id: "bug-061-staging-log-noise-obscures-failures"
type: bug
title: "Staging run log is drowned in Verdaccio password-verification lines and a benign ConflictError stack"
status: triaged
severity: "low"
release-origin: "v0.2"
release: ""
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

A **passing** `npm run publish:staging` run prints a long run of
`Password for user "wingfoil-staging" took NNNms to verify` lines plus a `ConflictError: this package is
already present` stack trace (a benign uplink-cache race). Neither indicates a problem, and together
they make a real failure hard to find in the log — the log being the whole deliverable of a staging
rehearsal.

## Steps to Reproduce

1. `npm run publish:staging` (no arguments) on a machine with network access to npmjs.
2. Read the output: count the `Password for user … took NNNms to verify` lines, and note the
   `ConflictError` stack, in a run that exits **0**.

## Expected Behavior

A green run should produce a log a human can scan. `dl-056` makes this run's *log* the evidence a
release decision rests on.

## Actual Behavior

Two measurements of the same phenomenon, from the two runs that were made:

| Source | Password-verification lines | `ConflictError` stack |
|---|---|---|
| `task-077-first-real-staging-run` notes (F8) | **~170** | present |
| reviewer, `ac10060`-era re-run | **105** | present |

**The count is run-dependent, and this document says so rather than picking one.** Both numbers are
honest readings of different runs; the line is emitted once per authenticated registry request, so its
count tracks how many packages the uplink had to fetch and how the cache was warmed, not a fixed
property of the script. The stable facts are that the noise is in the hundreds of lines, that it occurs
on a **successful** run, and that a `ConflictError` stack appears in a run with no error in it. The
reviewer's 105 is the more recent measurement; neither is a defect count.

Also recorded by `task-077`, same family: Verdaccio 6.10.4 warns
`you are using Node.js v22.21.0, Verdaccio recommends Node.js v24 or higher` on every start.

## Notes

**The script already sets the only log knob it has, and the noise survives it.** From the generated
Verdaccio config in `scripts/publish-staging.cjs`:

```
$ grep -n "log:" scripts/publish-staging.cjs
89:    'log: { type: stdout, format: pretty, level: warn }',
```

So `level: warn` is already in force, and these lines still appear — they are emitted at warn or above
by Verdaccio itself. A fix therefore cannot be "lower the log level"; it has to filter the child's
output, or route Verdaccio's stdout to a file in the work dir and surface it only on failure. Note
that `startRegistry` spawns the Verdaccio child with `stdio: 'inherit'`, so everything it writes goes
straight to the console:

```
$ sed -n '244p' scripts/publish-staging.cjs
      const child = spawn(process.execPath, [entry, '--config', paths.config], { env, stdio: 'inherit' });
```

Severity **low**: cosmetic, no effect on the pipeline's outcome. `task-077` explicitly proposed it as
"recorded only"; the approve commit `ac10060` directs it be **filed low** instead, "because nothing
reschedules a done task's notes" — which is why this document exists.

## Triage & Execution Notes

Filed from finding **F8** of `task-077-first-real-staging-run` (`done`), at the scheduling act its
approve commit `ac10060` directs. No fix task filed in this ingest (tasks were filed only for the
release blockers F2/F3/F4 and for F1); this is a natural companion to any later `publish-staging.cjs`
work. Not re-run in this ingest — a staging run takes ~113 s and real network writes, and neither
existing count is in dispute.
