# SARD — Part 4: Integrations & Interfaces

**ID prefix:** `REQ-INT-*`
**Derivation:** explicit and implicit communication protocols in the BDD suite (CLI, MCP, git, Agent SDK).

---

## 4. Integrations & Interfaces

### REQ-INT-01 — MCP Resources (read-only)

* **Description:** The MCP server exposes DNA entries and Memory documents as read-only Resources.
* **Rationale:** Agents consume context without the ability to corrupt state through the read channel.
* **Fit Criterion:** A write attempt through the MCP Resources interface is refused with `"resources are read-only"`; a
  read of an existing resource returns content + metadata.
* **Traceability:** Feature P5.2.1 (US-1-07, BDD `p5-interaction/P5.2.1-mcp-resources.feature`).

### REQ-INT-02 — MCP Prompts (role-based)

* **Description:** The MCP server serves role-specific instruction templates that embed the role's assigned directives
  at session start.
* **Rationale:** Agents receive rules + instructions without manual loading.
* **Fit Criterion:** Starting a session under role R returns a prompt embedding 100% of R's currently assigned
  directives; a newly assigned directive appears on the next session start.
* **Traceability:** Feature P5.2.2 (US-1-06, BDD `p5-interaction/P5.2.2-mcp-prompts.feature`); Feature P3.6 (US-3-06,
  BDD `p3-directives/P3.6-auto-load-by-role.feature`).

### REQ-INT-03 — MCP Tools (state mutation)

* **Description:** The MCP server exposes Tools for agents to submit deliverables and update workflow state.
* **Rationale:** Agents advance the workflow programmatically, with the same validation as the CLI.
* **Fit Criterion:** `memory.submit`/`memory.approve` invoked via MCP transition state and create a git commit authored
  by the agent; an illegal transition is rejected identically to the CLI path.
* **Traceability:** Feature P5.2.3 (US-2-11, BDD `p5-interaction/P5.2.3-mcp-tools.feature`).

### REQ-INT-04 — CLI exit-code contract

* **Description:** CLI commands return standardized exit codes: `0` success, `1` user/logic error, `2` usage/argument
  error.
* **Rationale:** Scriptability and deterministic automation.
* **Fit Criterion:** An automated matrix asserts the documented exit code for each command on success, logic-error, and
  missing-argument inputs (e.g., missing `--reason` → `2`, unknown document → `1`).
* **Check exit codes:** A command bound to a workflow **check** (the token-binding file, `spec-003-workflows-yaml-schema` Layer 3) reads the same
  codes as a gate: `0` the gate passes; `1` the gate fails and routes to the phase's `fallback`; `2` the binding is
  misconfigured, so the phase is **blocked** and the gate does not count as failed. Any other status, a signal or a
  timeout is an error. A command bound to an **action** fails its step on any non-zero status (REQ-INT-06). Fit
  criterion for the clause: over a fixture check bound to a command exiting `0`, `1`, `2` and `3`, the engine reports
  pass, fail-with-fallback, blocked and error respectively (asserted when check evaluation ships, P4.12).
* **Traceability:** Feature P1.3 (US-4-01, BDD `p1-memory/P1.3-memory-add.feature`); Feature P1.6 (US-3-09,
  BDD `p1-memory/P1.6-memory-submit.feature`); Feature P1.7 (US-2-10, BDD `p1-memory/P1.7-memory-approve.feature`);
  Feature P5.1.4 (US-0A-14, BDD `p5-interaction/P5.1.4-cli-ux.feature`); and all command features. The check
  exit-code clause: `dl-090-which-command-each-workflow-token-binds` Q4 and Action 2, `spec-003-workflows-yaml-schema`
  § "Check expressions"; Features P4.12 (checks) and P4.15 (fallback).

### REQ-INT-05 — Machine-readable output formats

* **Description:** Query/status commands support `console`, `json`, and `yaml` output.
* **Rationale:** Integration with dashboards, CI, and other tools.
* **Fit Criterion:** `--format json` and `--format yaml` produce output that parses as valid JSON/YAML respectively for
  `wingfoil paths` and `wingfoil workflow status`.
* **Traceability:** Feature P2.5 (US-0A-22, BDD `p2-dna/P2.5-paths.feature`); Feature P4.5 (US-2-01,
  BDD `p4-workflow/P4.5-workflow-status.feature`).

### REQ-INT-06 — Git operations as workflow actions

* **Description:** Workflow steps can execute git operations: create branch, create worktree, merge, commit.
* **Rationale:** Workflow drives real VCS state.
* **Fit Criterion:** Each git action produces its corresponding git effect (branch/worktree/merge/commit exists); a
  `git.merge` conflict aborts the merge leaving the working tree clean and marks the step `failed`.
* **Traceability:** Feature P4.10 (US-0A-20, BDD `p4-workflow/P4.10-workflow-steps.feature`).

### REQ-INT-07 — Agent execution wrapper (Agent SDK + MCP)

* **Description:** `wingfoil agent execute` wraps the AI Agent SDK, resolving role/element from the workflow step and
  pre-loading context via MCP.
* **Rationale:** Single command bridges workflow → agent with context.
* **Fit Criterion:** `agent execute --next` resolves role and element from the active step and pre-loads
  DNA/Memory/Directives via MCP before the agent starts; explicit `--element type:id` overrides the resolved element.
* **Traceability:** Feature P5.3.1 (US-1-03, BDD `p5-interaction/P5.3.1-agent-execute.feature`); Feature P5.3.2
  (US-2-07, BDD `p5-interaction/P5.3.2-agent-role-selection.feature`).

### REQ-INT-08 — Consistent CLI error format

* **Description:** User-facing errors follow a consistent format and are actionable.
* **Rationale:** Usability (Journey-wide CLI UX).
* **Fit Criterion:** Every user error prints `"error: <reason>"`, exits non-zero, and (for unknown commands) suggests
  the closest valid command.
* **Traceability:** Feature P5.1.4 (US-0A-14, BDD `p5-interaction/P5.1.4-cli-ux.feature`).

### REQ-INT-09 — Notification delivery channel & failure contract

* **Description:** Every workflow event that requires a human (approval gate, decision point, or "human-needed" step)
  emits a notification through the configured delivery channel and produces a durable notification record. Delivery
  failure is surfaced explicitly rather than swallowed.
* **Rationale:** The X1 notification pillar guarantees that no human-in-the-loop step stalls silently; a missed
  notification must fail loudly so the pipeline does not block undetected.
* **Fit Criterion:** `100% of 'human-needed' events (approval/decision required) produce a notification record; on
  delivery failure the system logs "notification delivery failed for event <id>" and exits non-zero — asserted in test.`
* **Traceability:** Feature X1.1 (US-2-02, BDD `x1-notification/X1.1-human-needed-notifications.feature`).
