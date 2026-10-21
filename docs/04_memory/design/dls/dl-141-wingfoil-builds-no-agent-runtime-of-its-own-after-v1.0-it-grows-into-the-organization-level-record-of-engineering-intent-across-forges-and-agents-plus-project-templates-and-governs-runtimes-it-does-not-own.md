---
id: dl-141-wingfoil-builds-no-agent-runtime-of-its-own-after-v1.0-it-grows-into-the-organization-level-record-of-engineering-intent-across-forges-and-agents-plus-project-templates-and-governs-runtimes-it-does-not-own
type: decision-log
title: "WingFoil builds no agent runtime of its own; after v1.0 it grows into the organization-level record of engineering intent across forges and agents, plus project templates, and governs runtimes it does not own"
status: ready
context: "ad-hoc"            # optional — short label for the context, e.g. "retrospective", "planning", "ad-hoc"
release: ""            # optional — implementation release this DL is assigned to (stamped at release-planning/build-backlog, dl-016), e.g. "v0.1"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["vision","direction"]
---

## Context

**The repository says little about WingFoil after v1.0.** The MVP canvas lists, under its success
path, "Prioritize v1.1+ roadmap: semantic search, dashboard UI, IDE plugins, automated validation"
and "Explore commercial positioning (white-label, enterprise features, SaaS model)"
(`docs/01_vision/08_mvp-canvas.md`, lines 181–182). One direction considered for that second step
was an **enterprise control plane for agents**: a WingFoil-run layer that registers, authorizes and
runs agents across an organization. No decision-log settles it either way
(`git grep -n -i "control plane" -- docs/01_vision docs/04_memory` finds no such decision).

**That layer is now sold, generally available, by the platform vendors.** Read 2026-10-01/02:
- Google: Gemini Enterprise Agent Platform, "available today" since 2026-04-22, with an Agent
  Registry, gateway and identity policies, an Agent Runtime and an Agent Sandbox,
  <https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform>.
- AWS: AWS Agent Registry GA on 2026-08-31,
  <https://aws.amazon.com/about-aws/whats-new/2026/08/aws-agent-registry-generally-available>;
  Policy in Amazon Bedrock AgentCore GA on 2026-03-03,
  <https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available/>.
  Both dates were taken from the announcements' listings.
- Microsoft: Foundry Agent Service GA since May 2025
  (<https://learn.microsoft.com/en-us/azure/ai-foundry/agents/whats-new>); Agent 365, with some of
  its features still in the Frontier preview programme
  (<https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/agent-365>). An official GA page
  for Agent 365 was not found; this decision does not depend on its date.
- GitHub: the enterprise agent control plane is GA since 2026-02-26,
  <https://github.blog/changelog/2026-02-26-enterprise-ai-controls-agent-control-plane-now-generally-available/>.
- BCG, "Enterprise AI Control Plane: The CIO's Guide to Governing and Accelerating AI Agents"
  (2026-08-14), recommends "golden paths", pre-governed routes "that make the compliant choice the
  fast and easy one", <https://www.bcg.com/publications/2026/how-cios-govern-ai-agents-at-scale>.

**What none of them offers** is a template at the level of a *project* — DNA, workflow, roles and
directives together — or governance of the engineering decisions themselves (decision-logs, ADRs,
specs, plans and their approvals). That is what WingFoil already holds (P1–P4) and what `dl-138`
makes distributable.

Raised by the approver on 2026-10-02 as the outcome of a market analysis.

## Decision

**WingFoil builds no agent runtime of its own.** Its direction after v1.0 is set in three steps:
- **Step 1 (rl-v1, through v1.0):** the repo-native governance record of one project — unchanged.
- **Step 2:** the **organization-level record of engineering intent**, across several forges and
  several agents, **plus project templates** (DNA, workflows, roles, directives) distributed as
  golden paths. It replaces "enterprise control plane for agents" as the step-2 direction.
- **Step 3:** **governing runtimes WingFoil does not own**: attaching WingFoil's record and
  approvals to the agent platforms above through their own interfaces, rather than registering,
  authorizing or running agents itself.

## Rationale

- **The control plane is a solved, crowded market.** Four platform vendors ship it GA; a
  repository-native tool cannot compete on runtime, identity or sandboxing.
- **The record of intent is the gap they leave.** Their registries know which agents exist and
  what they may call; none records why the code is the way it is, who approved it, and under which
  rules.
- **Templates are the golden path at project level.** BCG names golden paths as the CIO's lever;
  WingFoil's DNA + workflow + roles + directives is that path for engineering work, and `dl-138`
  already designs its distribution.
- **No runtime keeps the product agent-agnostic** (`dl-137`, `dl-131`): WingFoil governs whatever
  runs the agents.

## Actions

1. **Ratify** at `in-discussion → ready`. Owner: approver.
2. **Amend the vision** once ratified: replace the MVP canvas's "Explore commercial positioning
   (white-label, enterprise features, SaaS model)" with the three steps, and add them to the brief's
   *Market Position*. Owner: product-owner, as a task.
3. **Input to `plan-next-release-line`** for rl-v2: step 2 is its candidate theme.

## Relations

- **Related:** `dl-138` (remote versioned templates), `dl-140` (positioning), `dl-137` and
  `dl-143` (agent-agnostic outputs), `spec-016` (agent execution through per-agent adapters, which
  this decision keeps an adapter, not a runtime).
