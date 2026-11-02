# Release-health report — layout of `release-health-<version>.md`

The human-readable report of one release-health run (`dl-089-release-health-analyses-before-retrospective`
§3–§4). `release-health.compare` (`scripts/release-health/compare.cjs`) writes every section, the
**Proposals** included as a draft: for each finding it searches Memory (`memory search`, a substring match)
and lists every open match as a **candidate** tracker, proposing only where there is none; the `propose`
phase (facilitator) confirms each candidate or replaces it with a proposal, and files the immediate bugs
(approver ruling E, 2026-10-13; review F1, task-241). Every immediate finding is also named on stderr. The machine-readable values it is built from are `release-health-<version>.json`
(`release-health.schema.json`); the metric definitions are `metrics.yaml`. The report is not a Memory
element: it is generated, not authored, and has no lifecycle (`dl-089` alternative (d)).

The sections, in this order, with these headings:

```markdown
# Release health — <version>

| | |
|---|---|
| Release | <release id> (<kind>) |
| Measurement point | <ref> at <commit> (<published-tag | released-transition | revision>) |
| Previous run | <release> at <commit>, report <path> — or "<rev> at <commit>, named by --previous: no report, every metric is new" — or "none: every metric is new" |
| Catalogue | version <N> (the previous report used version <M>; re-measured like-for-like: not needed / yes / no (<reason>)) |
| Toolchain | Node <v>, npm <v>, lockfile sha256 <hash> |

## Summary

<counts per verdict: improved / stable / regressed / new / not-comparable; floors held / breached;
findings; proposals; previous proposals settled>

## Comparison

| id | Metric | Previous | Value | Raw | Verdict | Flags |
|---|---|---|---|---|---|---|
<one row per catalogue metric, in catalogue order; Verdict is improved | stable | regressed | new |
not-comparable (info and pending for metrics with no comparison), and for a floor also held | breached;
Flags: small-sample, not-measurable (with the reason), retired, run-time reading (G15, Q17, E01–E05: read
when the script runs, never compared, a floor still evaluated), partial: <part>, unchecked <n>,
unresolved <n>, node <v> (pinned <p>), redefined in catalogue v<N>, not re-measured>

## Trend

<for each metric with three or more runs: its last three values, so a drift inside every single
step's tolerance stays visible (dl-089 §3)>

## Findings

<one entry per breached floor and per regressed trend metric outside small-sample: the metric, the
values, the commits or files behind them, and — for G07, G10, G14, Q01, Q02 — the bug filed in this
run through bug-ingest (dl-089 §5)>

## Proposals

<drafted by compare, reviewed by propose. A finding the search matched, one line per candidate tracker (a
bug, task, decision-log or change-proposal neither in its type's last state nor deprecated), which the
propose phase confirms or replaces with a proposal:
"- <metric id> — candidate tracker: <element id> (<status>; `node dist/cli.js memory search <metric id> --format json`); …".
A finding with no candidate, one entry each, numbered in finding order:

### RH-<version>-NN — <metric id> <metric name>

- Finding: <metric id> floor breached (value …) | regressed (previous …, value …)
- Evidence: <value, previous, raw, every failing item>
- Proposed element: bug (a breached floor) | decision-log (a regressed trend)
- Proposed target release: <the next minor>
- Immediate: file through bug-ingest in this run (dl-089 §5)      (G07, G10, G14; Q01, Q02 at a published tag)

These are the input the retrospective's additional-points gate disposes of.>

## Previous proposals

| Proposal | Linked element | Settled as |
|---|---|---|
<every RH-<previous version>-NN of the previous report's Markdown: adopted and effective | adopted, no
effect yet | not adopted | superseded (dl-089 §4), read from the `Release health` table of the
retro-<previous version> decision-log (below); pending when the previous release is a patch, which runs
no retrospective (below)>

## Improvements

<metrics that improved, naming the adopted proposal or ratified decision-log they follow, so the
retrospective can answer "what worked" with evidence>
```

The retrospective copies **Comparison** and the disposition of every proposal into the `## Release
health` section of its `retro-<version>` decision-log (`retrospective.yaml`, `capture`).

The next run reads the dispositions back from that section: a table row whose first cell is the RH id,
the second its outcome (`retrospective.yaml` `additional-points`: covered | element | restated |
superseded, or declined) and the third the linked element id:

```markdown
| Proposal | Outcome | Element |
|---|---|---|
| RH-v0.3-01 | element | bug-400-… |
```

`element` settles as adopted (effective when the linked metric improved, or its floor went from breached
to held; otherwise no effect yet); covered, restated and superseded as superseded; declined as not
adopted; a proposal with no row, or a release with no retrospective, as not adopted with "no disposition
recorded"; any other outcome as not adopted with `unrecognised outcome "<x>"` (approver ruling G,
2026-10-13; review F2).

When the previous release is `kind: patch` (the `release.kind` of its JSON report), no retrospective is
read, because a patch runs none (`dl-092` Q2 (ii)): every proposal settles as `pending`, noted "disposed
of by the next minor's retrospective (dl-167 (a))", with no linked element (`bug-443`). How that minor's
run then settles them is left to `dl-167` (release-planning v0.3.2 ruling R8).
