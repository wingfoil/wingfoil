# Is / Is Not / Does / Does Not — WingFoil

**Version:** 1.4
**Date:** 2026-10-06
**Status:** Approved

---

## IS

- An open-source tool that provides structured, authoritative context for AI-assisted software development
- A structured, git-backed interface between developers, AI agents, and the project
- A workflow state management system — tracks and communicates project progress, blockers, and deliverable status
- A CLI tool for human developers
- An MCP server for AI agents
- A governance layer above IDEs and agents

## IS NOT

- An AI model or coding agent
- An IDE or IDE plugin
- A code generator or code reviewer
- A task executor or work verifier — it launches the configured agents but neither performs the development work itself
  nor inspects agent output for correctness; its only checks are shallow workflow-step validations (e.g. a frontmatter
  field holds an expected state/value, a required file or section exists) that keep the workflow and its files aligned —
  not a verification that the executed task is correct
- A real-time collaboration platform
- A spec or requirements validator
- A guarantee of identical code across agents or models

## DOES

- Stores and versions documents, decisions, and artifacts in git (Project Memory)
- Exposes the full structural map of a project to humans and agents (Project DNA)
- Manages and auto-loads role-based directives at session start (Project Directives)
- Tracks and manages workflow state, ensuring all actors share understanding of project progress and blockers (Project
  Workflow)
- Defines each Memory element type and its own state machine in `.wingfoil/memory.yaml` (per-type states, not a single
  global one)
- Exposes CLI commands for querying and updating all project state
- Exposes MCP tools, resources, and prompts for AI agents
- Launches the configured AI agents with auto-loaded context (orchestration wrapper; does not perform the work itself)
- Auto-syncs built-in Directives and Workflow templates when DNA `stacks` (technologies/methodologies) change
- Runs shallow workflow checks (frontmatter state/field values, file/section existence) pre/post step to keep the
  workflow and its files aligned — run as a separate command after the agent runs, not a correctness review of the work
- Makes the process of independent development runs deterministic — the same context for the same inputs, and the
  same workflow followed — and measures how far their software agrees (Determinism Index: Input, Process conformance,
  Outcome equivalence; the outcome is measured, never promised)
- Notifies users when human intervention is required (human-on-the-loop supervision)

## DOES NOT

- Validate or correct initial specifications
- Generate, write, or review code
- Replace AI agents or models
- Provide native IDE integrations beyond MCP
- Manage multiple projects or workspaces (v1)
- Auto-compile documents — document generation is limited to templates and simple placeholders derived from project
  state and properties
