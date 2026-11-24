/**
 * task-378 AC 1 and AC 3 (red-first; `bug-496`, `bug-287`; `spec-020` §4.13 and T-36 to T-38, `spec-008` §2 and §12, as
 * amended at the design gate; design items 3 to 5, D1 (a), D2 (a), D4 (a)) — the REAL registered `memory.memoryHistory`
 * operation, in-process, and `unverifiedFindings` of `src/core/governance-check.ts`, over the throwaway repositories of
 * `./helpers/history-mark-fixture`.
 *
 * - AC 1 / T-36: on T-9's repository the `docs: tidy` entry carries `unverified`, deep-equal to the one
 *   `status-outside-wf` finding `{ rule, check, message }`; no other entry has the key. On T-1's shape no entry has the
 *   key, and each entry's keys are `spec-008` §12's, in order, `carries` after `reason`.
 * - AC 1 / T-37: one hand approve of two tasks whose bracket contradicts the second's frontmatter: no mark on the first
 *   task's entry; the second's entry carries the `mismatch` finding (the message `wingfoil verify` reports on that
 *   commit, read from a real run on the same repository, `test/cli/memory-history-mark.integration.test.ts`).
 * - AC 1 / `gated: true`: a `wf(task): add` committed before any `memory.yaml` is marked with `spec-020` §4.5's first
 *   row.
 * - AC 1: `unverifiedFindings(root, { path, entries })` maps only the flagged sha to its findings.
 * - AC 3 / T-38: `carries` is `['the body']` on a `memory submit` after a body edit, `null` on a pure submit and on every
 *   `add`, `approve`, `reject`, `amend` and `deprecate`.
 *
 * Expected messages: `spec-020` §4.5 and §4.7 word for word; each also printed by `node dist/cli.js verify --format json`
 * on a scratch repository of the same commits (the red notes name the runs).
 *
 * Expected red: the entries carry neither `carries` nor `unverified` today (jest: `undefined` where a list or `null` is
 * expected, and an `Object.keys` list without `carries`); `unverifiedFindings` is not exported (`tsc` TS2305; jest
 * `TypeError: … is not a function`).
 */
import { CORE_MODULES } from '../../src/core';
import { unverifiedFindings } from '../../src/core/governance-check';
import type { CoreFn } from '../../src/core/registry';
import { TASK } from './helpers/in-memory-history-reader';
import { ENTRY_KEYS, NO_MEMORY_YAML, OUTSIDE, preMemory, t1, t37, t9 } from './helpers/history-mark-fixture';
import { removeTempDir } from '../storage/helpers/git-fixture';

jest.setTimeout(120_000);

interface Mark {
  readonly rule: string;
  readonly check: string;
  readonly message: string;
}

interface HistoryEntry {
  readonly sha: string;
  readonly operation: string | null;
  readonly subject: string;
  readonly carries?: readonly string[] | null;
  readonly unverified?: readonly Mark[];
}

interface HistoryValue {
  readonly id: string;
  readonly path: string;
  readonly entries: readonly HistoryEntry[];
}

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

function memoryHistoryFn(): CoreFn<unknown, HistoryValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryHistory;
  if (!operation) throw new Error('fixture bug: "memoryHistory" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, HistoryValue>;
}

async function history(root: string, id: string): Promise<HistoryValue> {
  if (!roots.includes(root)) roots.push(root);
  const result = await memoryHistoryFn()({ root, positional: id });
  if (!result.ok) throw new Error(`memory history ${id} failed: ${JSON.stringify(result)}`);
  return result.value;
}

const marked = (value: HistoryValue): string[] => value.entries.filter((entry) => 'unverified' in entry).map((entry) => entry.sha);

describe('task-378 AC 1 — memory history marks the entry no check verified (spec-020 §4.13, T-36)', () => {
  it("T-9 — the 'docs: tidy' entry carries the status-outside-wf finding; no other entry has the key", async () => {
    const { f, tidy } = t9();
    const value = await history(f.root, 't-1');
    expect(value.entries.map((entry) => entry.subject)).toEqual(['wf(task): add t-1', 'wf(task): submit t-1', 'docs: tidy']);
    const entry = value.entries.find((candidate) => candidate.sha === tidy);
    expect(entry?.unverified).toEqual([{ rule: 'state', check: 'status-outside-wf', message: OUTSIDE(TASK('t-1'), 'pending', 'backlog') }]);
    expect(marked(value)).toEqual([tidy]);
  });

  it("T-1's shape — no entry of any task has the key, and every entry's keys are spec-008 §12's, carries after reason", async () => {
    const f = t1();
    for (const id of ['task-001-approve-me', 'task-002-reject-me', 'task-003-deprecate-me']) {
      const value = await history(f.root, id);
      expect(value.entries.length).toBeGreaterThan(1);
      for (const entry of value.entries) expect({ id, keys: Object.keys(entry) }).toEqual({ id, keys: ENTRY_KEYS });
    }
  });

  it('T-37 — no mark on the first task\'s entry; the second\'s entry carries the mismatch finding', async () => {
    const { f, bad } = t37();
    const first = await history(f.root, 't-1');
    expect(first.entries.find((entry) => entry.sha === bad)).toBeDefined();
    expect(marked(first)).toEqual([]);
    const second = await history(f.root, 't-2');
    expect(second.entries.find((entry) => entry.sha === bad)?.unverified).toEqual([
      { rule: 'state', check: 'state', message: `${TASK('t-2')}: the bracket declares pending → backlog, the frontmatter went pending → in-progress` },
    ]);
    expect(marked(second)).toEqual([bad]);
  });

  it('gated: true — a wf() add committed before any memory.yaml is marked with §4.5\'s first row', async () => {
    const { f, early } = preMemory();
    const value = await history(f.root, 't-1');
    expect(value.entries.map((entry) => entry.sha)).toEqual([early]);
    expect(value.entries[0]?.unverified).toEqual([{ rule: 'state', check: 'state', message: NO_MEMORY_YAML }]);
  });

  it('is deterministic: two calls on the unchanged T-9 repository return the same value (REQ-SYS-07)', async () => {
    const { f } = t9();
    expect(await history(f.root, 't-1')).toEqual(await history(f.root, 't-1'));
  });
});

describe('task-378 AC 1 — unverifiedFindings maps each flagged sha of the listed entries to its findings (spec-020 §4.13)', () => {
  it('T-9 — only the docs: tidy sha, with its status-outside-wf finding', () => {
    const { f, add, submit, tidy } = t9();
    roots.push(f.root);
    const path = TASK('t-1');
    const value = unverifiedFindings(f.root, {
      path,
      entries: [
        { sha: add, path, parentPath: null },
        { sha: submit, path, parentPath: path },
        { sha: tidy, path, parentPath: path },
      ],
    });
    expect([...value.keys()]).toEqual([tidy]);
    expect((value.get(tidy) ?? []).map((entry: Mark) => ({ rule: entry.rule, check: entry.check, message: entry.message }))).toEqual([
      { rule: 'state', check: 'status-outside-wf', message: OUTSIDE(path, 'pending', 'backlog') },
    ]);
  });
});

describe('task-378 AC 3 — memory history returns each submit\'s carried items, null otherwise (spec-008 §2, T-38)', () => {
  it('a memory submit after a body edit carries ["the body"]; every add, approve and amend carries null', async () => {
    const f = t1();
    const value = await history(f.root, 'task-001-approve-me');
    expect(value.entries.map((entry) => [entry.operation, entry.carries])).toEqual([
      ['add', null],
      ['submit', ['the body']],
      ['approve', null],
      ['amend', null],
    ]);
  });

  it('a pure memory submit carries null, as do the add and the reject; a deprecate too', async () => {
    const f = t1();
    expect((await history(f.root, 'task-002-reject-me')).entries.map((entry) => [entry.operation, entry.carries])).toEqual([
      ['add', null],
      ['submit', null],
      ['reject', null],
    ]);
    expect((await history(f.root, 'task-003-deprecate-me')).entries.map((entry) => [entry.operation, entry.carries])).toEqual([
      ['add', null],
      ['deprecate', null],
    ]);
  });

  it('a hand commit that is no submit carries null even with a status change (T-9\'s docs: tidy)', async () => {
    const { f } = t9();
    expect((await history(f.root, 't-1')).entries.map((entry) => entry.carries)).toEqual([null, null, null]);
  });
});
