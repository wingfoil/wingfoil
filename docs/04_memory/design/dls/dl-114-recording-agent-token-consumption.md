---
id: "dl-114-recording-agent-token-consumption"
type: decision-log
title: "Agent runs record no token consumption, so the cost of a task, a phase or a release cannot be derived — `agent execute` records it per run"
status: ready
context: "retrospective"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`, being filed now). At its `additional-points` gate the
approver accepted the proposal that token consumption be recorded per agent run, and that the
record live with `agent execute`.

**What exists today.** Nothing records what an agent run consumed:

- `git grep -n -iE "input_tokens|output_tokens|usage\.|tokenCount|token_usage" a20b346c -- src
  docs/self/.wingfoil` returns one line, `src/memory/query.ts`, where "Resource usage." is prose
  about an MCP Resource. The pattern matches text, so the search works; nothing measures tokens.
- No Memory template has a field for it: `.wingfoil/memory/templates/task.md` has the
  sections Description, Acceptance Criteria, Implementation Notes and Execution Notes, and no cost
  field.
- `REQ-PERF-05` bounds the context an agent receives ("bounding token usage", through relevance
  filtering, P5.3.3) but states no measurement of what the run then consumed.

**Where the record would come from.** `agent execute` (P5.3.1, "wrapper that launches the agent with
auto-loaded context") is in `minor-v0.3`'s `features:` and does not exist yet. It is the only point
where WingFoil starts an agent run and sees it end, so it is the only point where a per-run record
can be written without the agent's cooperation. `dev-loop.yaml` already names it as the action of
`red`, `green` and `refactor` (`agent.execute`).

**Why it matters.** v0.2 was developed largely by agents. Of the 1,654 commits in
`20e8271..a20b346c` (`20e8271` is `retro-v0.1`'s approval), 929 carry an AI `Co-Authored-By:`
trailer (`git log --format='%(trailers:key=Co-Authored-By,valueonly)' 20e8271..a20b346c | grep . |
wc -l`), and 1,218 are authored by an identity outside `team.members`, first seen on 2026-09-17
(`git log --format='%ae' 20e8271..a20b346c | sort | uniq -c`). The retrospective could count
tasks, rejects and commits per active day. It could not say what any of them cost, or whether a
second review pass cost more than the first, because no number exists to read.

## Decision

`agent execute` writes one record per agent run, and the cost of a task, a phase or a release is
derived from those records. A run whose agent reports no usage records that explicitly, never a
zero. The open choices below remain for the approver.

**Q1 — where the record lives:**
- **(A) a run log under a declared path** (`dna.yaml` `paths:`), one line per run, committed with
  the Memory operation that closes the step;
- **(B) a trailer on the commit the run produces**, next to `dl-111`'s `WingFoil-Version:`;
- **(C) a line in the task's `## Execution Notes`**.

**Q2 — what a record holds:**
- **(a) minimal:** element id, workflow phase, role, agent and model identifier as the agent reports
  it, input tokens, output tokens, cache tokens where reported, the WingFoil build (`dl-111`);
- **(b) (a) plus** wall-clock duration and exit status, and the agent's **session id**, extracted by
  the adapter, or `not-reported` where the agent exposes none, as (i) does for tokens (amended by
  `dl-135` point 2, 2026-10-06).

**Q3 — where the numbers come from:**
- **(i) the agent's own report**, parsed by an adapter per supported agent, with `not-reported`
  where the agent gives none;
- **(ii) the model provider's usage records**, which need credentials WingFoil does not hold.

**Recommendation:** Q1 (A), Q2 (b), Q3 (i).
- **Q1 (A)** keeps one run to one record. A run does not map one-to-one onto commits: a run can
  produce no commit, or several. Execution Notes are prose that agents write, not a record WingFoil
  writes.
- **Q2 (b)**: duration and exit status cost nothing more to record and separate a slow run from an
  expensive one. The wall-clock value goes into a record of what happened, not into assembling an
  agent's context, so `REQ-SYS-07` does not apply to it.
- **Q3 (i)** needs no credential, which keeps `security-secrets` out of the question; `not-reported`
  keeps an unsupported agent from reading as free.

## Rationale

- **Recorded at the wrapper or not at all.** A measurement asked of the agent is a rule the agent can
  forget. The retrospective's headline lesson is that rules without an enforcement point recur. The
  wrapper sees every run it starts.
- **Cost is a planning input.** v0.2's release-planning committed `task-034` to `task-065`, 32
  tasks; at `a20b346c`, `git ls-tree --name-only a20b346c docs/self/docs/04_memory/v0.2/ | wc -l`
  counts 75 task files. A cost per task is what would let the next planning estimate in something
  other than task counts.
- **Trade-off.** Adapters per agent are maintenance, and the first release supports few agents.
  `not-reported` makes that gap visible instead of hiding it.

Alternatives considered:
- **Record nothing until a user asks.** Rejected: the numbers cannot be reconstructed afterwards.
- **Estimate tokens from prompt sizes.** Rejected: an estimate is not a measurement, and it would
  miss everything the agent reads on its own during the run.

## Actions

1. **Ratify, choosing Q1–Q3.** Owner: approver. The choice goes in the approve commit's `Reason:`.
2. **Amend the `agent execute` feature description** (P5.3.1 in `docs/01_vision/06_features.md`) and
   its BDD file `docs/02_requirements/02_bdd/features/p5-interaction/P5.3.1-agent-execute.feature`
   with the run record; add
   the path to `dna.yaml` `paths:` under Q1 (A).
3. **`dl-089`'s catalogue** may add cost per task and per phase as `info` metrics once records
   exist; that change goes through `dl-089`'s own catalogue rule.
4. **Tasks are derived by v0.3 `release-planning` (`build-backlog`)**, alongside P5.3.1, not
   created here.

## Relations

- **Origin:** `retro-v0.2`, the token-consumption disposition (2026-09-28).
- **Depends on:** P5.3.1 `agent execute` (`minor-v0.3`); `dl-111-tool-signature-in-commits` (the
  build recorded with each run).
- **Related:** `REQ-PERF-05` (bounded context); `dl-089-release-health-analyses-before-retrospective`;
  `dl-124-not-applicable-for-required-fields`, whose declared "not applicable" value is the same idea
  as `not-reported`.
- **Amended by** `dl-135-agent-run-tracking` (2026-09-29, v0.3 planning): the run record also holds the agent's session id (Q2).
