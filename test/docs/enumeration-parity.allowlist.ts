/**
 * The allowlist of the enumeration-parity gates (`task-187`, `dl-116` Q1 (A)): every difference
 * between an enumeration a specification restates and the code's, with the reason it is there.
 *
 * An entry is keyed by enumeration, document, direction and item — never by line (`dl-075`) — and the
 * list is sorted by that key (`enumeration-parity.allowlist.test.ts` enforces the order, the
 * uniqueness and a non-empty reason). Reasons, by kind:
 *
 * - `PLANNED` with `plannedBy` — the document names an item a non-done task is to build (a `surplus`),
 *   or a task is to amend the document. Once every cited task is `done` and the finding remains, the
 *   gate reports the entry (warn) or fails (from v0.4); when the item ships, the entry goes stale;
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

/** An MCP Tool `spec-004` §4.1 declares, deliberately unregistered until P5.2.3 (v0.4). */
export const TOOLS_V04 =
  'scheduled: the shipped server registers no Tools until P5.2.3 (v0.4), spec-014 §3 — the list is the v0.4 target';

/** A first-run finding not yet fixed or justified; reported in warn mode, failing from v0.4. */
export const UNTRIAGED =
  'first run (task-187), untriaged: the document or the code is stale; fix it, or replace this reason with why the difference is deliberate';

/** Every allowed finding, sorted by `enumeration|document|direction|item`. */
export const PARITY_ALLOWLIST: readonly ParityAllowlistEntry[] = [];
