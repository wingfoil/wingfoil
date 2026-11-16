/**
 * task-336 AC 4 (red-first) — the active registry read, in process (`spec-016` §7 as amended at the design gate, §5's
 * active order; `dl-181`, `dl-135` Q1 (a); approver rulings D3 (a), D10 (a)): the new module `src/agent/active-runs.ts`.
 *
 * Interface (the design's): `ACTIVE_RUNS_DIR = '.wingfoil/run'`; `ActiveRunEntry` `{ id, pid, workflow, phase, element,
 * role, agent, session, started_ms }`; `readActiveRuns(root): CoreResult<ActiveRunEntry[]>` —
 * - the live entries (a process with the `pid` exists), in element-id byte order, then phase (byte order), then `n` as a
 *   number (`…/2` before `…/10`), never directory order;
 * - an entry whose process is gone removed from disk; a file that is not one JSON object of those keys and types removed
 *   with one `warning:` line `.wingfoil/run/<path>: not an active run entry: removed` (through `withWarningSink`);
 * - a directory a removal left empty removed, `.wingfoil/run/` itself kept;
 * - an absent `.wingfoil/run/` → `ok([])`.
 *
 * A live pid is the Jest worker's own `process.pid`; a dead one is the pid of a `node -e ''` that has exited
 * (`spawnSync`). Today the module does not exist (`tsc` TS2307; Jest "Cannot find module").
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ACTIVE_RUNS_DIR, readActiveRuns, type ActiveRunEntry } from '../../src/agent/active-runs';
import { withWarningSink } from '../../src/validation/warning';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-336-active-'));
  roots.push(dir);
  return dir;
}

/** The pid of a process that has exited. */
function deadPid(): number {
  const done = spawnSync(process.execPath, ['-e', '']);
  if (typeof done.pid !== 'number') throw new Error('fixture: no pid for the exited process');
  return done.pid;
}

/** An entry for run `<elementId>/<phase>/<n>`, keys in §7's order. */
function entry(elementId: string, phase: string, n: number, pid: number): ActiveRunEntry {
  return {
    id: `${elementId}/${phase}/${n}`,
    pid,
    workflow: 'dev-loop',
    phase,
    element: `task:${elementId}`,
    role: 'developer',
    agent: 'Fake Agent',
    session: 'not-reported',
    started_ms: 1794817800000,
  };
}

/** Write `content` at `.wingfoil/run/<relative>`. */
function put(base: string, relative: string, content: string): void {
  const path = join(base, '.wingfoil', 'run', relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Write `value` as the registry file of its run id. */
function putEntry(base: string, value: ActiveRunEntry): void {
  put(base, `${value.id}.json`, `${JSON.stringify(value)}\n`);
}

/** Read with the warnings captured. */
function read(base: string): { result: ReturnType<typeof readActiveRuns>; warnings: string[] } {
  const warnings: string[] = [];
  const result = withWarningSink((text) => warnings.push(text), () => readActiveRuns(base));
  return { result, warnings };
}

describe('task-336 AC 4 — readActiveRuns (spec-016 §7)', () => {
  it("ACTIVE_RUNS_DIR is '.wingfoil/run'", () => {
    expect(ACTIVE_RUNS_DIR).toBe('.wingfoil/run');
  });

  it('an absent .wingfoil/run/ is an empty registry, no warning', () => {
    const base = root();
    const { result, warnings } = read(base);
    expect(result).toEqual({ ok: true, value: [] });
    expect(warnings).toEqual([]);
  });

  it('live entries in element-id byte order, then phase, then n as a number (never directory order)', () => {
    const base = root();
    const live = process.pid;
    // Written in an order no listing would sort into the declared one.
    for (const value of [entry('task-b', 'red', 1, live), entry('task-a', 'red', 10, live), entry('task-a-x', 'green', 1, live), entry('task-a', 'red', 2, live), entry('task-a', 'green', 1, live)]) {
      putEntry(base, value);
    }
    const { result, warnings } = read(base);
    expect(warnings).toEqual([]);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.map((value: ActiveRunEntry) => value.id)).toEqual(['task-a/green/1', 'task-a/red/2', 'task-a/red/10', 'task-a-x/green/1', 'task-b/red/1']);
    expect(result.value[0]).toEqual(entry('task-a', 'green', 1, live));
    expect(Object.keys(result.value[0]!)).toEqual(['id', 'pid', 'workflow', 'phase', 'element', 'role', 'agent', 'session', 'started_ms']);
  });

  it('an entry whose process is gone is pruned: not listed, its file and emptied directories removed, .wingfoil/run/ kept, no warning', () => {
    const base = root();
    putEntry(base, entry('task-a', 'red', 1, process.pid));
    putEntry(base, entry('task-z', 'green', 3, deadPid()));
    const { result, warnings } = read(base);
    expect(warnings).toEqual([]);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.map((value: ActiveRunEntry) => value.id)).toEqual(['task-a/red/1']);
    expect(existsSync(join(base, '.wingfoil/run/task-z/green/3.json'))).toBe(false);
    expect(existsSync(join(base, '.wingfoil/run/task-z'))).toBe(false);
    expect(existsSync(join(base, '.wingfoil/run/task-a/red/1.json'))).toBe(true);
    expect(existsSync(join(base, '.wingfoil/run'))).toBe(true);
  });

  it('the last entry pruned leaves .wingfoil/run/ itself, empty', () => {
    const base = root();
    putEntry(base, entry('task-z', 'green', 3, deadPid()));
    const { result } = read(base);
    expect(result).toEqual({ ok: true, value: [] });
    expect(existsSync(join(base, '.wingfoil/run'))).toBe(true);
    expect(readdirSync(join(base, '.wingfoil/run'))).toEqual([]);
  });

  it.each([
    ['not JSON', 'not json\n'],
    ['a JSON array', '[]\n'],
    ['a key missing (started_ms)', `${JSON.stringify(entry('task-m', 'red', 1, process.pid)).replace(/,"started_ms":\d+/, '')}\n`],
    ['a pid that is not a number', `${JSON.stringify({ ...entry('task-m', 'red', 1, process.pid), pid: String(process.pid) })}\n`],
  ])('a file that is %s: removed with one warning line, not listed', (_name, content) => {
    const base = root();
    putEntry(base, entry('task-a', 'red', 1, process.pid));
    put(base, 'task-m/red/1.json', content);
    const { result, warnings } = read(base);
    expect(warnings).toEqual(['.wingfoil/run/task-m/red/1.json: not an active run entry: removed']);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.map((value: ActiveRunEntry) => value.id)).toEqual(['task-a/red/1']);
    expect(existsSync(join(base, '.wingfoil/run/task-m'))).toBe(false);
  });
});
