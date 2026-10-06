---
id: "task-196-wingfoil-init-installs-builtin-adapters-protected-builtin-assets"
type: task
title: "`wingfoil init` installs the built-in adapters as protected built-in assets"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "agent", "init", "security"]
ref: "spec-016"
bug: ["bug-183"]
depends_on: ["task-135-make-init-scan-builtin-templates-secrets-refuse-reinitialize", "task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom", "task-188-correct-spec-011-bindings-id-stale-builtin-templates"]
tmpl_version: 260703
---

## Description

The package ships its built-in adapter manifests, and `init` writes them to `.wingfoil/agents/built-in/`, as it does for the P3.8 directive templates (`task-057`), under the same integrity pre-flight (`verifyBuiltinTemplates`, `src/core/init.ts:108`, `:193`). The installed copy pins the launch argv in git history, so two clones launch the same argv (REQ-SYS-07). `custom/` is scaffolded empty.

## Acceptance Criteria

- (red-first) A fresh `init` writes one file per shipped built-in adapter plus an empty `agents/custom/`, all in the single init commit. With a test-only source list (no real built-ins yet), the mechanism is exercised on a fixture manifest.
- (red-first) A built-in manifest that fails the task-177 schema aborts `init` before anything is written (REQ-SEC-10, the same message shape as the built-in directive case).
- (red-first) The built-in adapter sources are secret-scanned before they are written, the same step `spec-007` §4 step 5 asks of the other built-ins. If `bug-038`'s task lands first, this reuses its caller.
- (characterization) Docs with `doc-versioning` bumps: `spec-011` storage layout gains `.wingfoil/agents/{built-in,custom}/`; `REQ-SEC-07` (`05_security-compliance.md:77-85`) gains built-in adapters in its description and fit criterion (`spec-016` Consequences, recommended at Appendix C). If the approver keeps it an analogy at review, the ruling goes to Execution Notes and the SARD stays untouched.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §2.1 (init installs built-ins); adr-012 point 2; REQ-SEC-07 extension; REQ-SEC-10.
- **Features:** P5.1.1, P5.3.1.
- **Notes:** Proposal key: B06. `src/core/init.ts`, `src/storage/templates.ts` / `layout.ts`, `src/core/builtin-integrity.ts`. There is no `adapter remove` command, so there is nothing to refuse (`spec-016` §2.1).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
