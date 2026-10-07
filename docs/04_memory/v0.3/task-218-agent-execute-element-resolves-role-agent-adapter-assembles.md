---
id: "task-218-agent-execute-element-resolves-role-agent-adapter-assembles"
type: task
title: "`agent execute --element` resolves role, agent and adapter, assembles and checks the context, and refuses every bad case before anything is spawned"
status: backlog
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "agent", "cli", "refusals"]
ref: "spec-016"
bug: ["bug-202"]
depends_on: ["task-130-show-coreerror-details-surface-give-refusal-shape-under", "task-169-make-directive-assign-refuse-whole-file-rewrite-unless", "task-176-complete-spec-012-context-builder-dna-selection-relevance", "task-177-adapter-manifests-load-validate-wingfoil-agents-builtin-custom", "task-195-role-session-mcp-prompt-accepts-element-state-returns", "task-200-fake-agent-custom-adapter-let-agent-execute-path", "task-206-agent-execute-records-run-json-lines-line-under"]
tmpl_version: 260703
---

## Description

This task builds the pre-launch half of `agent execute`, for the stepless (`adhoc`) form: - element from `--element`; - role from `--role`, else the `developer` default with a `warning:` line (R18); - agent from `--agent`, else the first agent with an adapter whose `executes_as` has the role; - the adapter, then pipeline steps 1–12: PATH lookup, git identity, run log declared and unmodified, the context assembled and validated at `HEAD`, its warnings printed on stderr (dl-050 option 4), the run id, temporary bootstrap and MCP config files outside the repository, the MCP pre-flight fetching `{role}-session` with `element`/`state`, and the terminal check last. It stops just before the spawn. task-228 adds the launch.

## Acceptance Criteria

- (red-first) Each §3.7 row up to `NO_TERMINAL` is reached with the fake adapter and no terminal, exit `1`, nothing written to the repository (`git status --porcelain` unchanged). Rows: element absent, `--role` not in DNA (P5.4.2 sc. 3 text), `APPROVER_ROLE`, `NO_AGENT`, unknown agent / agent without the role, `NO_ADAPTER`, manifest invalid, `AGENT_NOT_FOUND`, git identity missing, `NO_RUN_LOG`, run log modified, `INVALID_CONTEXT` (P5.4.4 sc. 3), `MCP_UNREACHABLE` (`context pre-load failed: MCP server unreachable`, P5.4.3 sc. 3 verbatim), and `NO_TERMINAL` with the `terminal: required` fixture.
- (red-first) No flag at all → exit `2` `error: missing required argument: --next or --element`. `--resume`/`--ref` → exit 2 as unknown options (v0.4, §3.1).
- (red-first) The role defaults to `developer` with a `warning:` line when neither a step nor `--role` gives one. P5.3.1 sc. 2's fixture holds a matching full id.
- (red-first) dl-050 option 4: a role with a dangling binding prints `spec-012` §5.1's warnings on stderr, in order, before the MCP pre-flight, and nothing on stdout.
- (red-first) The bootstrap bytes equal §2.4's template for `(role, element, run id, state_ref)`. Two runs from the same `HEAD` render identical bootstrap bytes. The handoff line depends on the type template's `## Execution Notes` heading.
- (red-first) Temporary files are created under the OS temp dir, never inside the repository, and are removed on every exit path, refusals included.
- (characterization) The MCP pre-flight spawns the running build (`node <dist/cli.js> mcp`, §2.5). A project's `.mcp.json` is neither read nor modified.
- (characterization) BDD `P5.4.3-context-preloading.feature` sc. 1–2 are amended (`doc-versioning` note) to §3.1's reading: WingFoil assembles, validates and proves the context fetchable before the spawn. The sc. 3 message is kept.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** spec-016 §3.1 (without step flags), §3.2 steps 2–6, §3.3 steps 1–12, §3.7 rows up to NO_TERMINAL; dl-050 option 4; dl-033 (b) (role checks via `src/dna/roles.ts`, approver refusal via `src/core/approval-authority.ts`); REQ-SEC-03.
- **Features:** P5.3.1, P5.4.2, P5.4.3, P5.4.4.
- **Notes:** Proposal key: B09. `src/agent/execute.ts`, `src/core/index.ts` (operation `agentExecute`, `mutates: true`, CLI only; no MCP exposure in v0.3, spec-016 §8). The stderr warnings (dl-050 option 4) go through task-169's success-warning renderer, so directive-assign warnings and context warnings share one convention.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.
- **Handover from wave 1 B3 (2026-10-02, `task-169`).** Reuse the success-warning channel: `coreOk(value, commit?, warnings?)` in `src/core/types.ts` and the single CLI renderer `src/cli/warning.ts` (`emitWarning`, `emitWarnings`; console `warning: …`, json one object per line, yaml documents closed by `...` so a following error is its own document). `spec-008` §6 records where this departs from `spec-005` §3.2 (stderr may be non-empty on exit 0) until this task amends `spec-005`.
- **Handover from wave 2 B1 (2026-10-05, `task-171` and `task-176`).** `assembleExecutionContext`
  (`src/core/context.ts`) reads Memory tolerantly: an unreadable document is left out and reported as
  `W_MEMORY_UNREADABLE` in the result's `warnings` (`CoreResult`, third argument of `coreOk`), and a malformed subject
  element comes back as `NOT_FOUND` with `details.unreadable`. Neither is in the payload. Forward both to the
  surface this task builds (stderr / `--format json` warnings, or the MCP response), so they are never dropped.
- **Handover from wave 2 B4a (2026-10-06, `task-255`).** The context payload's bytes are pinned as format 1
  (`spec-012` §7, `dl-150` (B)): consume them only as `task-255` left them, through `assembleExecutionContext`, and
  never re-serialize the context yourself. `CONTEXT_PAYLOAD_FORMAT` and `WrittenTimestamp` are re-exported from
  `src/core`: a YAML date in the carried frontmatter is a `WrittenTimestamp` holding the text as written, not a `Date`,
  and its `toJSON()` returns that text, so a `--format json` rendering keeps the document's own spelling.
- **Handover from the W2 B4a triage (2026-10-06).** `bug-265` (v0.4): the context payload's body markers are not
  unique, so do not index its bodies by marker key alone. `dl-158` (in discussion, release v0.3) decides which
  `team.agents` entry signs and what an entry without an email writes under git-conventions §7: apply its ruling to
  the agents this task launches.
- **Handover from the approver's ruling on `dl-158` (2026-10-06, Rule 1 (a)).** The `team.agents` entry that signs
  an agent's commits under `git-conventions` §7 is the one `agent execute` launches, resolved by its adapter: state
  that selection in `spec-016` where this task resolves the entry, and pass that entry's `name <email>` to the
  launched agent. A hand session uses the entry whose `name` is the agent's own and, with no such entry, the first
  entry, saying so in the commit body. The directive text and the email rule (Rule 2 (ii)) are `task-260`'s.
- **Handover from wave 3 B1 (2026-10-07, `task-195`, `task-196`, `task-206`, `task-210`).** Parse `--element` with `parseElementRef` / `malformedElementRefMessage` from `src/core` (`spec-008` §7's grammar, `task-195`): the {role}-session Prompt already uses it, so the two surfaces cannot drift. Call `runLogPreflight(root, paths.runs, elementId)` (`src/agent`, `task-206`) at `spec-016` step 6, before anything is spawned. `agent execute` is `mutates: true`: add it to `REVIEWED_AGENT_WRITERS` in `test/core/builtin-adapter-writers.test.ts` (`task-196`, REQ-SEC-07; the test fails otherwise) and a row to the dry-run table in `test/cli/dry-run.integration.test.ts` (`task-210`; its completeness test fails otherwise). Every write goes through `writeAndCommit` (`src/storage`); a raw writer throws during a dry run.
- **Handover from wave 3 B2 (2026-10-07, `task-260`, `task-200`).** Since `task-260`, a `team.agents` entry that declares an `adapter` must declare an `email` (dl-158 Rule 2 (ii)): `spec-016` §2.1 still calls `adapter` a plain optional field — correct it with your `spec-016` amendment, and give every adapter entry in your fixtures an `email`. The fake agent and its manifests (`test/fixtures/agents/fake-agent.cjs`, `custom/fake.yaml`, `custom/fake-terminal.yaml`, `task-200`) are documented in the script's header: launch-only `WINGFOIL_FAKE_AGENT_EXIT` / `_WAIT`, `_LOOKUP=fail|hang` for lookups, and five more variables.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->
