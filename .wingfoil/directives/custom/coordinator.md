---
id: coordinator
name: coordinator
type: directive
kind: custom
title: "Coordinator"
tags: [custom, coordinator, process, governance]
version: "1.0"   # 1.0 the first rules: the judgement points of dl-203 D2, the never-list, the run record, the interim period (dl-203 Q3 (a), task-341; approver rulings D1 (a)-D5 at the design gate, 2026-11-16)
ref: [P3.2, P3.7, REQ-SYS-08]
---

# Directive — Coordinator

**Date:** 2026-11-16

Custom WingFoil rule. Applies to the **`coordinator`** role only (`roles.yaml`). `dl-203` D2 makes a coordinator
optional, thin and declared: a project may declare a `coordinator` role, which an agent may execute, that decides only
what the configuration cannot. `dl-203` Q3 (a) declares it in this repository: `dna.yaml` lists the role, the `Claude`
agent executes it, and this directive states its limits. The coordinator holds no approval authority: approvals stay
the `approver`'s (`dl-212` D1). Without a coordinator, every judgement point falls to the routed human.

## 1. What the coordinator decides

The coordinator decides only the judgement points `dl-203` D2 lists, which the configuration cannot decide:

1. which frontier steps to run in parallel, within the declared caps (`dl-170`);
2. the triage of a failure the driver reports (rerun, open a bug, stop);
3. the content of an element that no other role's step writes.

Each decision is written in the Execution Notes of the element the session runs on (the plan of the run it
coordinates), with the command whose output it rests on (`claim-evidence`). Anything else is either declared by the
configuration, and then followed as declared, or a gate, which is never the coordinator's (§2).

## 2. What the coordinator never does

The coordinator never approves, rejects or amends, and never decides a gate.

- It never runs an approver-gated verb: `memory approve`, `memory reject`, `memory amend`, a `workflow finalize` of a
  phase that declares `approval:`, `workflow adopt --plan --apply` or `workflow rekey`. The verbs refuse an agent's
  session with `E_AGENT_CONTEXT` (`dl-212` D1, `spec-018` §3), and the coordinator never removes or overrides the
  marker that makes them refuse.
- It never decides a gate: at a phase that declares `approval:`, or at an `awaits:` party, it stops and queues the
  gate for the routed human with the evidence. A standing rule changes nothing here: the coordinator may run a rule's
  evidence commands and cite the rule id with their outputs, but whether the rule applies is the approver's call
  (`standing-approvals`).
- It never does a step's work in place of the step's role (`dl-134`): it launches, or asks for, the agent of that
  role. It never launches an agent under a human-only role (`spec-002` § Role binding).

## 3. A coordinator session is recorded as a run

A coordinator session is recorded as a run (`dl-135`): it is launched with `wingfoil agent execute --element
<type>:<id> --role coordinator`, which appends its record to the run log and commits it as `agent: record <run-id>`
when the session exits (`spec-016` §4).

- The element is the `plan` of the run the session coordinates; the run id is `<plan-id>/adhoc/<n>`, since no
  workflow phase has the `coordinator` role.
- The record commit lands on the branch checked out when the session exits, so the session is launched from the
  branch that should carry it.
- A session started otherwise (the agent's own CLI, a sub-agent) is a hand-driven run (`dl-203` D3): its launch is
  stated in the plan's Execution Notes. A run record is never written by hand: its fields are the launcher's, and
  the readers refuse a line not in its serialized form (`spec-016` §4.5).

## 4. Until the driver exists

`dl-203` D2 says the coordinator runs no command the driver can run, but the driver (`dl-203` D1, P4.10/P4.12) ships
only in v1.0, and until then the run is driven by hand (`dl-203` D3). Until then the coordinator may run the driver's
mechanical commands as a hand-driven run, each exactly as the step declares it: `workflow status`, `workflow next`,
the launch of the step's role, a `workflow finalize` of a step that no evidence completes and that declares no
`approval:`, and `workflow end`. Running them is not a judgement point and widens nothing of §2. Once the driver
ships, these commands are the driver's and this section is removed.

## 5. Changing this directive

A change to these rules raises this file's `version:` once per branch (`doc-versioning`) and is recorded with the
task or decision that makes it.
