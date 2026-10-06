# SARD — Part 2: Performance & Latency (NFR)

**ID prefix:** `REQ-PERF-*`
**Derivation:** the latency *targets* (the numeric thresholds) come from quantified `Then` clauses of the BDD suite +
`08_mvp-canvas.md` "Metrics of Success". The *measurement conditions* stated below (p95, ≥ 20 runs, 1,000-document
reference repository, an otherwise idle machine) are additional measurement parameters defined by these requirements;
they are **not** asserted by the cited BDD scenarios, which fix only the threshold.

> Measurement conditions defined by this requirement set (not by the BDD scenarios): latency targets are evaluated as
> **p95 over ≥ 20 runs** on a reference repository of **1,000 Memory documents**, **on an otherwise idle machine**,
> unless otherwise stated. A wall-clock time that includes process start-up is not reproducible under load (`dl-146`:
> the same unchanged commands measured 287 ms idle and 1,028 ms at a 1-minute load average of about 18), so the
> condition is part of the requirement, not a convenience of the test that measures it.

---

## 2. Non-Functional Requirements — Performance

### REQ-PERF-01 — Agent context load time

* **Description:** Launching an agent with auto-loaded context (DNA + Memory + Directives) completes within a bounded
  time.
* **Rationale:** Vision metric "Context Load Time < 30 seconds"; core to Alex's journey.
* **Fit Criterion:** Time from `wingfoil agent execute` invocation to "agent ready" is **< 30,000 ms (p95)**.
* **Traceability:** Feature P5.3.1 (US-1-03, BDD `p5-interaction/P5.3.1-agent-execute.feature`); Feature P5.4.3
  (US-1-04, BDD `p5-interaction/P5.4.3-context-preloading.feature`); `08_mvp-canvas.md`.

### REQ-PERF-02 — DNA / Memory query latency

* **Description:** Read queries against DNA and Memory return within a bounded time.
* **Rationale:** Vision metric "DNA/Memory queries < 1 second".
* **Fit Criterion:** `wingfoil memory search`, `wingfoil dna show`, and `wingfoil memory history`, each on the reference
  repository, meet two budgets (`dl-146`, option (C)):
  - **total** — from invocation to return, process start-up included, each returns in **< 1,000 ms (p95)**;
  - **marginal** — each command's time over process start-up, measured as its total minus the median of a process-start
    floor (the same CLI answering `--version`, sampled alongside the command), is **< 1,000 ms (p95)**.

  The total is what the user waits for; the marginal is WingFoil's own query work, which grows with Memory size while
  start-up does not.
* **Traceability:** Feature P1.5 (US-1-08, BDD `p1-memory/P1.5-memory-search.feature`); Feature P1.10 (US-5-08,
  BDD `p1-memory/P1.10-memory-history.feature`); Feature P2.2 (US-3-03, BDD `p2-dna/P2.2-dna-show.feature`).

### REQ-PERF-03 — Workflow next-step resolution latency

* **Description:** Resolving the next actionable workflow step returns within a bounded time.
* **Rationale:** Journey 1/3 depend on instant "what do I do next".
* **Fit Criterion:** `wingfoil workflow next` returns in **< 1,000 ms (p95)**, under the same rule as REQ-PERF-02
  (`dl-146`, Q3): both its total, process start-up included, and its marginal cost over process start-up are
  **< 1,000 ms (p95)**.
* **Traceability:** Feature P4.4 (US-1-01, BDD `p4-workflow/P4.4-workflow-next.feature`).

### REQ-PERF-04 — MCP resource fetch latency

* **Description:** Agent fetches of DNA entries and Memory documents via MCP Resources are bounded.
* **Rationale:** Agent session start must stay within the 30 s budget (REQ-PERF-01).
* **Fit Criterion:** A single MCP Resource fetch returns in **< 1,000 ms (p95)**; the MCP server sustains queries for
  the duration of an agent session without restart.
* **Traceability:** Feature P5.2.1 (US-1-07, BDD `p5-interaction/P5.2.1-mcp-resources.feature`);
  `08_mvp-canvas.md` ("MCP server is stable (<1 sec queries)").

### REQ-PERF-05 — Bounded context via relevance filtering

* **Description:** Only relevant Memory documents are loaded into agent context, bounding token usage.
* **Rationale:** Prevent context-window exhaustion; cost/determinism.
* **Fit Criterion:** Given 1,000 Memory documents of which K are relevant to the task, the assembled context contains
  exactly the K relevant (non-deprecated) documents and 0 others.
* **Traceability:** Feature P5.3.3 (US-1-10, BDD `p5-interaction/P5.3.3-relevance-filtering.feature`); Feature P1.9
  (US-5-04, BDD `p1-memory/P1.9-memory-deprecate.feature`).
