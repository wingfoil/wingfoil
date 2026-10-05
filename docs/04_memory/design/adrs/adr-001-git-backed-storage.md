---
id: adr-001-git-backed-storage
type: adr
title: "Git-backed storage as the single source of truth"
status: accepted
sard_ref: REQ-SYS-01
supersedes: ""            # optional — id of the ADR this one replaces, e.g. "adr-002"
tmpl_version: 260703   # Orignal template version
---

## Context

WingFoil needs one authoritative store for all project state across its four pillars — Memory, DNA,
Directives, and Workflow — that both humans and AI agents can read and write, that is fully
versioned and auditable, and that works offline with zero infrastructure to operate. A hosted
database or SaaS backend was considered as the natural place to keep this state (it would give
transactional writes, querying, and multi-user locking), but it would introduce a second source of
truth alongside the git repository the code already lives in, add an infra dependency the
open-source, self-hosted harness explicitly wants to avoid, and break the "clone and go" workflow
that lets an agent reconstruct full project state from nothing but the repository. Without this
decision, WingFoil would need to choose and operate a database, define a sync protocol between that
database and the git history, and solve the resulting drift and offline-availability problems.

## Decision

All project state — Memory, DNA, Directives, and Workflow — is persisted as plain files (YAML +
Markdown) under `.wingfoil/`, versioned in the project's own git repository. Git is the storage
layer; there is no external database, hosted service, or separate state index (`.wingfoil/state/`
does not exist — state is derived from file existence and frontmatter, REQ-SYS-03). This is also
WingFoil's answer to "which database does the core tech stack use": none — `dna.yaml`'s
`tech_stack.storage` is `git`, and no DB client, ORM, or schema-migration tooling appears anywhere
in the stack (TypeScript/Node.js 18+/Commander.js/MCP over stdio/Zod/Jest, per `dna.yaml`).

> **Correction (2026-10-02) — the stack parenthetical reads Node.js 22.12+, not Node.js 18+.**
> `adr-010-node-22-runtime-floor` (`accepted`) moved WingFoil's runtime floor to Node.js 22.12:
> `dna.yaml` now says `22.12+`, and `package.json` `engines.node` is `>=22.12.0`, the floor
> `spec-015` §1 defines. Wherever the paragraph above says "Node.js 18+", read **Node.js 22.12+**.
> The decision of this ADR is unchanged: git is the single store, with no database. The sentence
> above is left as written (`bug-054`, `task-158`).

## Consequences

- **Positive:**
  - One versioned, auditable source of truth per REQ-SYS-01: every state change is a git commit
    with author and timestamp, giving a free audit trail, branching/merging, and code-review-style
    diffing of project state changes.
  - Zero infrastructure to operate — no database server, no hosting bill, no network dependency —
    consistent with the "open-source harness" identity in the product brief.
  - Full offline use and instant reconstruction: a fresh `git clone` reconstructs 100% of
    Memory/DNA/Directives/Workflow state with no external data source (REQ-SYS-01 Fit Criterion).
  - Agents and humans read the exact same files through the same paths — no divergent API surface
    for state (reinforces REQ-SYS-05's dual CLI/MCP interface over a shared core).
- **Negative:**
  - No row-level locking or transactional multi-file writes; concurrent edits to the same file
    resolve as git merges (or conflicts) rather than atomic database transactions.
  - No native query language — cross-cutting lookups (e.g. "all tasks in `backlog`") require
    scanning frontmatter across files rather than issuing a query (mitigated by keeping such scans
    targeted, per this project's own working conventions).
  - Very large project histories may eventually need git-level pruning or LFS-style handling for
    scale, though this is out of scope for the current design.
- **Neutral:**
  - All pillar tooling must read/write the filesystem and shell out to git rather than talk to a
    store client; this shapes the `storage` module's responsibilities (`src/storage`, `dna.yaml`
    modules list) but requires no separate persistence abstraction to swap backends later.
  - State machines and validation still apply per REQ-SYS-04 — git-backed storage does not relax
    the requirement that every transition honor its type's declared state machine.

## Process Notes

Grounded in `docs/02_requirements/03_sard/01_architecture.md` (REQ-SYS-01, REQ-SYS-03, REQ-SYS-05)
and `.wingfoil/dna.yaml` (`tech_stack.storage: git`, module list, and lack of any database
dependency).
