---
id: dl-010-minimal-dependencies
type: decision-log
title: "Keep production dependencies minimal (~10)"
status: ready
context: scope
release: "v0.4"
tmpl_version: 260703
---

## Context

Every production dependency introduces three distinct costs that compound for a tool like WingFoil:
**supply-chain risk** (one compromised package can affect every WingFoil user), **install weight** (slower
adoption, larger footprint in CI/CD pipelines), and **maintenance surface** (every update must be vetted,
every security advisory addressed). This is especially critical because WingFoil runs *inside users' git
repositories* and has access to sensitive project metadata and decision records.

The question: what is an acceptable dependency footprint for v1?

## Decision

Limit production dependencies to approximately **10 packages** (including the Anthropic SDK and standard
CLI/validation stack). This includes only the core runtime dependencies declared in `dna.yaml`'s
`tech_stack` section:
- **Commander.js** (CLI argument parsing)
- **chalk** (terminal formatting)
- **Zod** (schema validation)
- **Anthropic SDK** (MCP + agent communication)
- Standard library and transitive dependencies only if essential

Exclude from this count:
- **Dev/test dependencies** (Jest, test frameworks, type definitions, linters)
- **Transitive dependencies** of the core packages (e.g., if Commander pulls in `@types/node`, that
  does not count toward the 10)
- **Optional peer dependencies**

## Rationale

A minimal, audited dependency list directly advances the Determinism Index (North Star). WingFoil runs
in users' git repos and controls sensitive workflows; a small, well-understood stack reduces the
attack surface and complexity. The ~10-package threshold reflects industry practice for tools of
WingFoil's scope:

1. **Supply-chain resilience**: Each direct dependency is a potential vulnerability vector. Keeping
   the count low means the security team can fully audit and monitor the critical paths.
2. **Install speed and CI efficiency**: Users who adopt WingFoil should not incur significant npm install
   overhead; a lean dependency tree keeps the tool lightweight and distributable.
3. **Maintenance discipline**: With fewer direct dependencies, the team can make deliberate, infrequent
   updates rather than constantly chasing patch versions. This reduces cognitive load and regression risk.
4. **Transparent trust model**: Users of WingFoil can easily inspect `package.json` and understand exactly
   what code runs with their credentials and metadata.

The stack chosen (Commander for CLI, Zod for validation, Anthropic SDK for agent integration) aligns with
WingFoil's core value proposition: determinism in AI-assisted workflows. No secondary frameworks or
convenience packages; use the stdlib where possible.

## Actions

- [ ] During code review for v0.1 and all later releases, verify that no new direct production
  dependencies are added without an explicit request for an exemption to this decision (reviewer gate,
  REQ-SYS-08 role binding).
- [ ] Add a pre-commit check (or lint rule) that flags `package.json` additions; document the approved
  list in a root `.wingfoil/approved-deps.json` or similar manifest once the workflow engine runs.
- [ ] At each release retrospective, audit the production dependency tree and report the count and any
  transitive bloat (via `npm list --depth=0`).
