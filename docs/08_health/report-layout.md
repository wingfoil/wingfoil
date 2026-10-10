# Release-health report — layout of `release-health-<version>.md`

The human-readable report of one release-health run (`dl-089-release-health-analyses-before-retrospective`
§3–§4). `release-health.compare` writes every section but **Proposals**, which the `propose` phase
fills. The machine-readable values it is built from are `release-health-<version>.json`
(`release-health.schema.json`); the metric definitions are `metrics.yaml`. The report is not a Memory
element: it is generated, not authored, and has no lifecycle (`dl-089` alternative (d)).

The sections, in this order, with these headings:

```markdown
# Release health — <version>

| | |
|---|---|
| Release | <release id> (<kind>) |
| Measurement point | <ref> at <commit> (<published-tag | released-transition>) |
| Previous run | <release> at <commit>, report <path> — or "none: every metric is new" |
| Catalogue | version <N> (the previous report used version <M>; re-measured like-for-like: yes/no) |
| Toolchain | Node <v>, npm <v>, lockfile sha256 <hash> |

## Summary

<counts per verdict: improved / stable / regressed / new / not-comparable; floors held / breached;
findings; proposals; previous proposals settled>

## Comparison

| id | Metric | Previous | Value | Raw | Verdict | Flags |
|---|---|---|---|---|---|---|
<one row per catalogue metric, in catalogue order; Verdict is improved | stable | regressed | new |
not-comparable, and for a floor also held | breached; Flags: small-sample, not-measurable (with the
reason), retired>

## Trend

<for each metric with three or more runs: its last three values, so a drift inside every single
step's tolerance stays visible (dl-089 §3)>

## Findings

<one entry per breached floor and per regressed trend metric outside small-sample: the metric, the
values, the commits or files behind them, and — for G07, G10, G14, Q01, Q02 — the bug filed in this
run through bug-ingest (dl-089 §5)>

## Proposals

<filled by propose. Per finding: "tracked — <element id> (<status, read by command>)", or a proposal
RH-<version>-NN: finding, evidence, proposed element type, proposed target release. These are the
input the retrospective's additional-points gate disposes of.>

## Previous proposals

| Proposal | Linked element | Settled as |
|---|---|---|
<every RH-<previous version>-NN: adopted and effective | adopted, no effect yet | not adopted |
superseded (dl-089 §4)>

## Improvements

<metrics that improved, naming the adopted proposal or ratified decision-log they follow, so the
retrospective can answer "what worked" with evidence>
```

The retrospective copies **Comparison** and the disposition of every proposal into the `## Release
health` section of its `retro-<version>` decision-log (`retrospective.yaml`, `capture`).
