/**
 * task-336 review fix round (red-first; `spec-016` §3.3 step 17, §5's exit codes and §7 as amended at the review fix
 * round, `e998b6346`; approver ruling F2 (a)) — `src/agent/active-runs.ts`, in process:
 *
 * - F2: `removeRun(root, entry, agentPid?)` (the design's intended signature; today `removeRun(root, runId)`, `tsc`
 *   TS2345) removes the file only while it holds this launch's entry — the same `id` and `started_ms`, and a `pid` that
 *   is `agent execute`'s own (`process.pid`) or `agentPid` — and leaves another launch's entry byte for byte;
 * - F5: an entry whose removal fails for another cause than `ENOENT` (a read-only directory, POSIX, not as root) is one
 *   `warning:` line `.wingfoil/run/<path>: could not remove: <cause>`; the read is still `ok` and lists nothing of it;
 * - F6: a top-level `x.json`, an `<n>` of `0`, `01` or `a`, and a `started_ms` of `8640000000000001` are no entry
 *   (pruned with the not-an-entry line, no `TypeError`); `8640000000000000` is listed.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readActiveRuns, removeRun, type ActiveRunEntry } from '../../src/agent/active-runs';
import { withWarningSink } from '../../src/validation/warning';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-336-review-'));
  roots.push(dir);
  return dir;
}

const STARTED_MS = 1794817800000;
const RUN = 'task-a/red/1';
const FILE = `.wingfoil/run/${RUN}.json`;

function entry(id: string, overrides: Partial<ActiveRunEntry> = {}): ActiveRunEntry {
  const [elementId, phase] = id.split('/') as [string, string];
  return { id, pid: process.pid, workflow: 'dev-loop', phase: phase ?? 'red', element: `task:${elementId}`, role: 'developer', agent: 'Fake Agent', session: 'not-reported', started_ms: STARTED_MS, ...overrides };
}

function put(base: string, relative: string, text: string): void {
  const path = join(base, '.wingfoil', 'run', relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const text = (value: unknown): string => `${JSON.stringify(value)}\n`;

function read(base: string): { result: ReturnType<typeof readActiveRuns> | undefined; warnings: string[]; thrown: unknown } {
  const warnings: string[] = [];
  try {
    const result = withWarningSink((line) => warnings.push(line), () => readActiveRuns(base));
    return { result, warnings, thrown: undefined };
  } catch (error) {
    return { result: undefined, warnings, thrown: error };
  }
}

describe('task-336 F2 — removeRun removes only this launch\'s entry (spec-016 §3.3 step 17, §7)', () => {
  it("its own entry, agent execute's pid: removed", () => {
    const base = root();
    put(base, `${RUN}.json`, text(entry(RUN)));
    removeRun(base, entry(RUN));
    expect(existsSync(join(base, FILE))).toBe(false);
  });

  it("its own entry, the agent's pid given as agentPid: removed", () => {
    const base = root();
    put(base, `${RUN}.json`, text(entry(RUN, { pid: 4242 })));
    removeRun(base, entry(RUN), 4242);
    expect(existsSync(join(base, FILE))).toBe(false);
  });

  it.each([
    ['another started_ms, the same pid', { started_ms: STARTED_MS + 1 }],
    ['the same started_ms, a pid that is neither this agent execute nor its agent', { pid: process.ppid }],
  ])("another launch's entry (%s): left byte for byte", (_name, overrides) => {
    const base = root();
    const other = text(entry(RUN, overrides));
    put(base, `${RUN}.json`, other);
    removeRun(base, entry(RUN), 4242);
    expect(existsSync(join(base, FILE))).toBe(true);
    expect(readFileSync(join(base, FILE), 'utf-8')).toBe(other);
  });
});

const POSIX_NOT_ROOT = process.platform !== 'win32' && process.getuid?.() !== 0;

describe('task-336 F5 — a removal that fails while reading is a warning, never a failed read (spec-016 §5, §7)', () => {
  (POSIX_NOT_ROOT ? it : it.skip)('a dead entry in a read-only directory: ok, one "could not remove" line, not listed', () => {
    const base = root();
    put(base, 'task-a/red/1.json', text(entry('task-a/red/1')));
    put(base, 'task-z/red/1.json', text(entry('task-z/red/1', { pid: 999999999 })));
    const dir = join(base, '.wingfoil', 'run', 'task-z', 'red');
    chmodSync(dir, 0o555);
    try {
      const { result, warnings, thrown } = read(base);
      expect(thrown).toBeUndefined();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.startsWith('.wingfoil/run/task-z/red/1.json: could not remove: ')).toBe(true);
      expect(result?.ok).toBe(true);
      expect(result?.ok ? result.value.map((value) => value.id) : null).toEqual(['task-a/red/1']);
      expect(existsSync(join(dir, '1.json'))).toBe(true);
    } finally {
      chmodSync(dir, 0o755);
    }
  });
});

describe('task-336 F6 — the id and started_ms ranges (spec-016 §7)', () => {
  it.each([
    ['a top-level x.json naming itself', 'x.json', entry('x')],
    ['n = 0', 'task-m/red/0.json', entry('task-m/red/0')],
    ['n = 01', 'task-m/red/01.json', entry('task-m/red/01')],
    ['n = a', 'task-m/red/a.json', entry('task-m/red/a')],
    ['started_ms 8640000000000001', 'task-m/red/1.json', entry('task-m/red/1', { started_ms: 8640000000000001 })],
  ])('%s: pruned with the not-an-entry line, no TypeError', (_name, relative, value) => {
    const base = root();
    put(base, 'task-a/red/1.json', text(entry('task-a/red/1')));
    put(base, relative, text(value));
    const { result, warnings, thrown } = read(base);
    expect(thrown).toBeUndefined();
    expect(warnings).toEqual([`.wingfoil/run/${relative}: not an active run entry: removed`]);
    expect(result?.ok ? result.value.map((item) => item.id) : null).toEqual(['task-a/red/1']);
    expect(existsSync(join(base, '.wingfoil', 'run', relative))).toBe(false);
  });

  it('started_ms 8640000000000000, the largest ECMAScript date: listed', () => {
    const base = root();
    put(base, 'task-m/red/1.json', text(entry('task-m/red/1', { started_ms: 8640000000000000 })));
    const { result, warnings, thrown } = read(base);
    expect(thrown).toBeUndefined();
    expect(warnings).toEqual([]);
    expect(result?.ok ? result.value.map((item) => [item.id, item.started_ms]) : null).toEqual([['task-m/red/1', 8640000000000000]]);
  });
});
