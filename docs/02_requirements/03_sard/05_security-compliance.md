# SARD — Part 5: Security & Compliance

**ID prefix:** `REQ-SEC-*`
**Derivation:** access-control and data-integrity constraints implied by the BDD suite.

---

## 5. Security & Compliance

### REQ-SEC-01 — Git identity required for state mutations

* **Description:** No state change is committed without a configured git identity (user.name + user.email).
* **Rationale:** Every change must be attributable.
* **Fit Criterion:** With git identity unset, any state-mutating command fails with
  `"git identity not configured (user.name/user.email)"` and writes nothing.
* **Traceability:** Feature P1.2 (US-0A-02, BDD `p1-memory/P1.2-versioning-audit-trail.feature`).

### REQ-SEC-02 — Complete, attributable audit trail

* **Description:** 100% of state changes are recorded in git with author and ISO-8601 timestamp; approvals/rejections
  also record a reason.
* **Rationale:** Auditability is a core value proposition (Casey, Morgan).
* **Fit Criterion:** `git log` verification over all `.wingfoil/` changes shows author + timestamp for every change with
  **0** "unknown author"; `memory history` lists each transition with author, timestamp, and reason.
* **Traceability:** Feature P1.2 (US-0A-02, BDD `p1-memory/P1.2-versioning-audit-trail.feature`); Feature P1.7
  (US-2-10, BDD `p1-memory/P1.7-memory-approve.feature`); Feature P1.8 (US-4-11, BDD `p1-memory/P1.8-memory-reject.feature`);
  Feature P1.10 (US-5-08, BDD `p1-memory/P1.10-memory-history.feature`).

### REQ-SEC-03 — Role-based approval authority

* **Description:** Only users/agents holding the required approver role (per DNA) may exercise an approval gate on a
  given element type — that is, `approve` **or** `reject`.
* **Rationale:** Governance gates; no self-approval bypass. A gate one verb can walk past is not a gate: `reject` sits
  on the same `gates` state and decides the same element, so it answers to the same authority as `approve`.
* **Fit Criterion:** An `approve` **or** `reject` attempt by a principal lacking the required role is rejected with
  `"user not authorized to approve type '<type>'"` and the state is unchanged. Both verbs share that one message,
  which says *approve* even on a reject: deliberate, per `dl-063` clause B — one authority predicate, one string, so
  `requireApprovalAuthority` takes no verb parameter and an operator learns a single message.
* **Traceability:** Feature P1.7 (US-2-10, BDD `p1-memory/P1.7-memory-approve.feature`); Feature P1.8 (US-4-11,
  BDD `p1-memory/P1.8-memory-reject.feature`); Feature P4.14 (US-4-07,
  BDD `p4-workflow/P4.14-approval-routing.feature`). Widened from `approve` alone to both approval-gate verbs by
  `dl-063-p1-8-reject-message-and-authority-trace` (2026-09-21, clause B), which also added P1.8's authority
  scenario. `memory deprecate` stays outside this requirement: it is not an approval gate (no `Approver:` line, no
  authority check), per `dl-027-req-sec-04-deprecate-reason-scope`.

### REQ-SEC-04 — Mandatory justification on decision verbs

* **Description:** `approve` and `reject` require a `--reason`.
* **Rationale:** Decisions must be explainable in the audit trail.
* **Fit Criterion:** Omitting `--reason` on `approve`/`reject` returns exit code `2` with
  `"missing required argument: --reason"` and makes no change.
* **Traceability:** Feature P1.7 (US-2-10, BDD `p1-memory/P1.7-memory-approve.feature`); Feature P1.8 (US-4-11,
  BDD `p1-memory/P1.8-memory-reject.feature`). Narrowed to the approval gates by
  `dl-027-req-sec-04-deprecate-reason-scope`: `memory deprecate` is not an approval gate (no `Approver:` line,
  no authority check), and `spec-008` §2 / BDD P1.9 / CLAUDE.md §5.1 already treat its `--reason` as
  optional-but-encouraged.

### REQ-SEC-05 — Read-only agent read channel

* **Description:** Agents cannot mutate state through the MCP Resources channel; mutations occur only through validated
  MCP Tools.
* **Rationale:** Principle of least privilege per channel (channel-scoped restatement of REQ-INT-01 / REQ-INT-03).
* **Fit Criterion:** A write attempt issued over the MCP Resources channel is refused with `"resources are read-only"`
  and persists nothing; in a channel-enumeration test the only agent write path that successfully mutates state is an
  MCP Tool call, and that call is rejected unless it passes state-machine validation.
* **Traceability:** Feature P5.2.1 (US-1-07, BDD `p5-interaction/P5.2.1-mcp-resources.feature`); Feature P5.2.3
  (US-2-11, BDD `p5-interaction/P5.2.3-mcp-tools.feature`).

### REQ-SEC-06 — Storage confinement

* **Description:** Memory entries may only be written under `.wingfoil/memory/`.
* **Rationale:** Prevent state leakage outside the managed, versioned store.
* **Fit Criterion:** An attempt to write a Memory entry to a path outside `.wingfoil/memory/` is refused with
  `"Memory entries must reside under .wingfoil/memory/"`.
* **Traceability:** Feature P1.11 (US-0A-03, BDD `p1-memory/P1.11-memory-entries.feature`).

### REQ-SEC-07 — Immutable built-in assets

* **Description:** Built-in directives and built-in workflow templates cannot be removed; custom assets can be removed
  only when unreferenced.
* **Rationale:** Protect the baseline; prevent dangling references.
* **Fit Criterion:** `directive remove` / `workflow remove` on a built-in is rejected ("built-in … cannot be removed");
  removal of a still-referenced custom asset is rejected naming the referrer.
* **Traceability:** Feature P3.3 (US-6-07, BDD `p3-directives/P3.3-directive-remove.feature`); Feature P4.9 (US-6-11,
  BDD `p4-workflow/P4.9-workflow-remove.feature`).

### REQ-SEC-08 — Secret/credential hygiene

* **Description:** Credentials and secrets are handled per the built-in Security directive and are never persisted into
  Memory, DNA, or Directives.
* **Rationale:** Avoid committing secrets to the git-backed store.
* **Fit Criterion:** After `init`, the built-in `security` directive is present; a scan of committed `.wingfoil/`
  content matches **0** known secret patterns (e.g., API keys, private-key headers).
* **Traceability:** Feature P3.8 (US-0A-09, BDD `p3-directives/P3.8-builtin-directive-templates.feature`);
  `06_features.md` (built-in Security directive).

### REQ-SEC-09 — Human approval before inferred writes

* **Description:** Inference flows (`init --mode infer`, `dna infer`) present every inferred section for human approval
  before persisting it.
* **Rationale:** Inference is imperfect; humans stay in control of recorded truth.
* **Fit Criterion:** No inferred DNA/config is written until explicitly approved; aborting the flow persists nothing.
* **Traceability:** Feature P2.3 (US-0B-03, BDD `p2-dna/P2.3-dna-infer.feature`); Feature P5.1.2 (US-0B-02,
  BDD `p5-interaction/P5.1.2-init-infer.feature`).

### REQ-SEC-10 — Schema checks on built-in templates

* **Description:** Built-in directive and workflow templates are schema-checked before installation during
  `init`.
* **Rationale:** A corrupted baseline must not partially install.
* **Fit Criterion:** A corrupted or schema-invalid built-in template aborts `init` before writing partial assets, with a
  message naming the failing template.
* **Traceability:** Feature P3.8 (US-0A-09, BDD `p3-directives/P3.8-builtin-directive-templates.feature`); Feature P4.17
  (US-0A-21, BDD `p4-workflow/P4.17-builtin-workflow-templates.feature`). Scoped to schema validation by
  `dl-031-req-sec-10-integrity-depth`: the threat addressed is accidental corruption, not post-install
  tampering — distribution-channel assurance lives in `adr-009`/`spec-015` (npm provenance).

### REQ-SEC-11 — Notification routing authority by role / decision-type

* **Description:** Each notification is routed only to the roles or persons configured for its decision-type in
  `dna.yaml`. Routing authority is declarative and role-based; no notification reaches a role that the configuration
  does not authorize for that decision-type.
* **Rationale:** Notification routing is a governance control: approval and decision prompts must reach exactly the
  accountable roles, and must not leak to unconfigured recipients (least-privilege over the notification surface).
* **Fit Criterion:** `A notification is routed to exactly the roles/persons configured for its decision-type in dna.yaml;
  0 notifications routed to unconfigured roles — asserted over a routing fixture.`
* **Traceability:** Feature X1.2 (US-2-03, BDD `x1-notification/X1.2-notification-routing.feature`); Feature X1.1
  (US-2-02, BDD `x1-notification/X1.1-human-needed-notifications.feature`).

### REQ-SEC-12 — Workflow token arguments reach a command as argv only

* **Description:** When a workflow `actions:` or `checks:` token runs the command its binding declares
  (the token-binding file, `spec-003-workflows-yaml-schema` Layer 3), the command is an argument vector, never a shell string. An interpolated value
  (`{<key>}` for a token argument, `{element.field}` / `{<type>.field}` for the scope) fills one **whole** argument and
  never part of one, and must match `spec-009-validation-strategy`'s ID character class or the pattern the binding
  declares for that argument (`args`). No shell is involved at any point, so a separator inside a value is data.
* **Rationale:** Interpolated values come from Memory frontmatter, which outside contributors write (`dl-020`). A
  frontmatter value spliced into a shell string is a command-injection path; argv-only interpolation with a declared
  value pattern removes it, and is checked where the binding is loaded rather than trusted at run time.
* **Fit Criterion:** A binding whose `run` element interpolates part of an argument is refused at load
  (`E_BINDING_PARTIAL_INTERPOLATION`, exit 1); over a fixture of interpolated values containing `;`, `|`, `$(…)`,
  whitespace and quotes, **0** commands are executed through a shell, and every value outside the ID class or its
  declared pattern is refused before the command starts.
* **Traceability:** `dl-090-which-command-each-workflow-token-binds` Q3 (a) and Action 2;
  `spec-003-workflows-yaml-schema` Layer 3 and § "Action expressions". Features P4.1 (workflow configuration), P4.10
  (atomic step execution, v1.0) and P4.12 (checks, v1.0); no BDD scenario yet — the run-time half of the criterion is
  the acceptance contract of the engine that executes bindings.
