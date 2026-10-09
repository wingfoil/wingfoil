/**
 * The allowlist of the enumeration-parity gates (`task-187`, `dl-116` Q1 (A)): every difference
 * between an enumeration a specification restates and the code's, with the reason it is there.
 *
 * An entry is keyed by enumeration, document, direction and item — never by line (`dl-075`) — and the
 * list is sorted by that key (`enumeration-parity.allowlist.test.ts` enforces the order, the
 * uniqueness and a non-empty reason). Reasons, by kind:
 *
 * - `PLANNED` (or another `planned:` reason, such as {@link WORKFLOW_NEXT_ROW}) with `plannedBy` — the document names an item a non-done task is to build (a `surplus`),
 *   or a task is to amend the document. Once every cited task is `done` and the finding remains, the
 *   gate reports the entry (warn) or fails (from v0.4); when the item ships, the entry goes stale;
 * - {@link AUDIT_V04} — a command a later release's `features:` schedules with no task yet;
 * - {@link TOOLS_V04} — an MCP Tool the specification declares and the shipped server deliberately
 *   does not register before P5.2.3 (v0.4, `spec-014` §3);
 * - `UNTRIAGED` — a first-run finding nobody has looked at yet: the document is stale, or the code is
 *   wrong, or the item is named on purpose. The v0.3 warn release is when each one is fixed (through
 *   `memory amend` for an approved spec) or given its real reason; from v0.4 it fails the gate.
 *
 * The first run's entries were written at the task's base commit, classified as recorded in
 * `task-187`'s Execution Notes. A new entry is written by hand with its own reason; `UNTRIAGED` is not
 * a reason a new entry may use.
 */
import type { ParityAllowlistEntry } from './support/enumeration-parity';

/**
 * `'warn'` through v0.3; `'fail'` from v0.4 (`dl-116` Q3 (ii), the staging `dl-023` used for the e2e
 * smoke). In both modes a finding no entry lists fails, and so does an entry citing a task that does
 * not exist. `warn` reports, without failing, the `UNTRIAGED` entries, the stale ones and the `planned`
 * ones whose tasks are all `done`; `fail` fails on all three.
 */
export const PARITY_MODE = 'warn' as 'warn' | 'fail';

/** Named by the non-done task(s) in `plannedBy`; spent once all of them are `done`. */
export const PLANNED = 'planned: the non-done task(s) in plannedBy build the item or amend the document';

/**
 * `spec-004` §4.1's `workflow.next` Tool row: approved `spec-017` §9 makes `workflowNext`
 * `mutates: false`, served as the Resource `wingfoil://workflows/-/next`, so no Tool will ever list
 * it in v0.3 or v0.4; spec-017's Consequences move the row to v1.0 step advancement, and `task-239`
 * (its AC) makes that amendment. Review fix F2: these entries cited `task-216`, which builds the
 * command, not the Tool.
 */
export const WORKFLOW_NEXT_ROW =
  "planned: spec-017 §9 makes workflowNext a Resource (mutates: false), not a Tool; task-239 moves spec-004 §4.1's workflow.next row to v1.0";

/** An MCP Tool `spec-004` §4.1 declares, deliberately unregistered until P5.2.3 (v0.4). */
export const TOOLS_V04 =
  'scheduled: the shipped server registers no Tools until P5.2.3 (v0.4), spec-014 §3 — the list is the v0.4 target';

/** A first-run finding not yet fixed or justified; reported in warn mode, failing from v0.4. */
export const UNTRIAGED =
  'first run (task-187), untriaged: the document or the code is stale; fix it, or replace this reason with why the difference is deliberate';

/** `wingfoil audit`: P5.1.3 is in `minor-v0.4`'s `features:` and no task builds it yet (`dl-046` B(a)). */
export const AUDIT_V04 =
  "scheduled: P5.1.3 (wingfoil audit) is in minor-v0.4's features: list, which has no task for it yet; re-check when minor-v0.4 is planned";

const SPEC_004 = 'docs/04_memory/design/specs/spec-004-mcp-surface-contract.md';
const SPEC_005 = 'docs/04_memory/design/specs/spec-005-cli-command-contract.md';
const SPEC_008 = 'docs/04_memory/design/specs/spec-008-cli-grammar.md';

/** Every allowed finding, sorted by `enumeration|document|direction|item`. */
export const PARITY_ALLOWLIST: readonly ParityAllowlistEntry[] = [
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'directive.assign', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'directive.create', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'directive.remove', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'dna.add', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'dna.remove', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'dna.set', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'dna.update', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'memory.amend', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'missing', item: 'memory.park', reason: UNTRIAGED },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'surplus', item: 'workflow.end', reason: PLANNED, plannedBy: ['task-217'] },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'surplus', item: 'workflow.next', reason: WORKFLOW_NEXT_ROW, plannedBy: ['task-239'] },
  { enumeration: 'spec-004 §4.1 tools vs CORE_MODULES', document: SPEC_004, direction: 'surplus', item: 'workflow.start', reason: PLANNED, plannedBy: ['task-217'] },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'agent.execute', reason: TOOLS_V04 },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'memory.add', reason: TOOLS_V04 },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'memory.approve', reason: TOOLS_V04 },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'memory.deprecate', reason: TOOLS_V04 },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'memory.reject', reason: TOOLS_V04 },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'memory.submit', reason: TOOLS_V04 },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'workflow.end', reason: TOOLS_V04 },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'workflow.next', reason: WORKFLOW_NEXT_ROW, plannedBy: ['task-239'] },
  { enumeration: 'spec-004 §4.1 tools', document: SPEC_004, direction: 'surplus', item: 'workflow.start', reason: TOOLS_V04 },
  { enumeration: 'spec-005 Context flat commands', document: SPEC_005, direction: 'surplus', item: 'audit', reason: AUDIT_V04 },
  { enumeration: 'spec-005 Context nouns', document: SPEC_005, direction: 'missing', item: 'directives', reason: UNTRIAGED },
  { enumeration: 'spec-008 §1 flat commands', document: SPEC_008, direction: 'surplus', item: 'audit', reason: AUDIT_V04 },
  { enumeration: 'spec-008 §11 commands', document: SPEC_008, direction: 'surplus', item: 'agent list', reason: PLANNED, plannedBy: ['task-240'] },
  { enumeration: 'spec-008 §11 commands', document: SPEC_008, direction: 'surplus', item: 'workflow next', reason: PLANNED, plannedBy: ['task-216'] },
  { enumeration: 'spec-008 §11 commands', document: SPEC_008, direction: 'surplus', item: 'workflow status', reason: PLANNED, plannedBy: ['task-225'] },
];

