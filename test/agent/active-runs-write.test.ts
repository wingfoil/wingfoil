/**
 * task-336 (green, the developer's own suite; `spec-016` §3.3 steps 13, 14 and 17, §7 as amended at the design gate;
 * approver rulings D3 (a), D10 (a)) — the writes of `src/agent/active-runs.ts`, beside red's
 * `test/agent/active-runs.test.ts` (the read):
 *
 * - `registerRun`: the file is created with §7's keys in order and a newline; an existing live entry refuses
 *   (`CONFLICT`, `run <id> is already running (pid <pid>)`, `details` `{ run_id, pid }`) and is left as it was; an
 *   existing dead one is replaced silently; an existing file that is no entry is replaced with the warning line;
 * - `rewriteRunPid`: the file holds the new pid, no temporary file is left; a rewrite whose directory is gone returns
 *   `false` and leaves nothing behind;
 * - `removeRun`: the file and the directories it leaves empty are removed, `.wingfoil/run/` kept; a sibling keeps its
 *   directories; removing what is not there is no error;
 * - `readActiveRuns`: an entry whose `id` is not the run id its path names is no entry; a temporary file of a rewrite
 *   (a name starting with `.`) is not read; a `.wingfoil/run` that is a file is `IO`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { activeRunPath, processAlive, readActiveRuns, registerRun, removeRun, rewriteRunPid, type ActiveRunEntry } from '../../src/agent/active-runs';
import { withWarningSink } from '../../src/validation/warning';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-336-runs-'));
  roots.push(dir);
  return dir;
}

const deadPid = (): number => spawnSync(process.execPath, ['-e', '']).pid!;

function entry(id: string, pid: number = process.pid): ActiveRunEntry {
  const [elementId, phase] = id.split('/') as [string, string];
  return { id, pid, workflow: 'dev-loop', phase, element: `task:${elementId}`, role: 'developer', agent: 'Fake Agent', session: 'not-reported', started_ms: 1794817800000 };
}

function put(base: string, relative: string, text: string): void {
  const path = join(base, '.wingfoil', 'run', relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function captured<T>(run: () => T): { value: T; warnings: string[] } {
  const warnings: string[] = [];
  const value = withWarningSink((text) => warnings.push(text), run);
  return { value, warnings };
}

describe('task-336 — registerRun (spec-016 §3.3 step 13, D3 (a))', () => {
  it('creates the file: one JSON object, keys in §7 order, and a newline', () => {
    const base = root();
    expect(registerRun(base, entry('task-a/red/1'))).toEqual({ ok: true, value: undefined });
    const text = readFileSync(activeRunPath(base, 'task-a/red/1'), 'utf-8');
    expect(text).toBe(`${JSON.stringify(entry('task-a/red/1'))}\n`);
  });

  it('a live entry already there refuses the launch, and is left as it was', () => {
    const base = root();
    const text = `${JSON.stringify(entry('task-a/red/1'))}\n`;
    put(base, 'task-a/red/1.json', text);
    const { value, warnings } = captured(() => registerRun(base, entry('task-a/red/1', 4242)));
    expect(value).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: `run task-a/red/1 is already running (pid ${process.pid})`, details: { run_id: 'task-a/red/1', pid: process.pid } },
    });
    expect(warnings).toEqual([]);
    expect(readFileSync(activeRunPath(base, 'task-a/red/1'), 'utf-8')).toBe(text);
  });

  it('a dead entry already there is replaced, silently', () => {
    const base = root();
    put(base, 'task-a/red/1.json', `${JSON.stringify(entry('task-a/red/1', deadPid()))}\n`);
    const { value, warnings } = captured(() => registerRun(base, entry('task-a/red/1')));
    expect(value.ok).toBe(true);
    expect(warnings).toEqual([]);
    expect(JSON.parse(readFileSync(activeRunPath(base, 'task-a/red/1'), 'utf-8'))).toEqual(entry('task-a/red/1'));
  });

  it('a file there that is no entry is replaced, with the warning line', () => {
    const base = root();
    put(base, 'task-a/red/1.json', 'garbage\n');
    const { value, warnings } = captured(() => registerRun(base, entry('task-a/red/1')));
    expect(value.ok).toBe(true);
    expect(warnings).toEqual(['.wingfoil/run/task-a/red/1.json: not an active run entry: removed']);
  });

  it('a registry that cannot be written is IO', () => {
    const base = root();
    mkdirSync(join(base, '.wingfoil'), { recursive: true });
    writeFileSync(join(base, '.wingfoil', 'run'), 'a file, not a directory\n');
    const result = registerRun(base, entry('task-a/red/1'));
    expect(result.ok ? '' : result.error.code).toBe('IO');
    expect(result.ok ? '' : result.error.message).toMatch(/^cannot write the active registry entry \.wingfoil\/run\/task-a\/red\/1\.json: /);
  });
});

describe('task-336 — rewriteRunPid and removeRun (spec-016 §3.3 steps 14 and 17)', () => {
  it('rewrites the pid in place, leaving no temporary file', () => {
    const base = root();
    registerRun(base, entry('task-a/red/1'));
    expect(rewriteRunPid(base, entry('task-a/red/1', 4242))).toBe(true);
    expect(JSON.parse(readFileSync(activeRunPath(base, 'task-a/red/1'), 'utf-8'))).toEqual(entry('task-a/red/1', 4242));
    expect(readdirSync(join(base, '.wingfoil/run/task-a/red'))).toEqual(['1.json']);
  });

  it('a rewrite whose directory is gone returns false and leaves nothing', () => {
    const base = root();
    expect(rewriteRunPid(base, entry('task-a/red/1', 4242))).toBe(false);
    expect(existsSync(join(base, '.wingfoil'))).toBe(false);
  });

  it('removeRun removes the file and the directories it empties, keeps .wingfoil/run/ and a sibling', () => {
    const base = root();
    registerRun(base, entry('task-a/red/1'));
    registerRun(base, entry('task-b/red/1'));
    removeRun(base, 'task-a/red/1');
    expect(existsSync(join(base, '.wingfoil/run/task-a'))).toBe(false);
    expect(existsSync(activeRunPath(base, 'task-b/red/1'))).toBe(true);
    removeRun(base, 'task-b/red/1');
    expect(readdirSync(join(base, '.wingfoil/run'))).toEqual([]);
    removeRun(base, 'task-b/red/1');
  });
});

describe('task-336 — readActiveRuns, the edges (spec-016 §7, D10 (a))', () => {
  it('an entry whose id is not the run id its path names is no entry', () => {
    const base = root();
    put(base, 'task-a/red/1.json', `${JSON.stringify(entry('task-a/red/2'))}\n`);
    const { value, warnings } = captured(() => readActiveRuns(base));
    expect(value).toEqual({ ok: true, value: [] });
    expect(warnings).toEqual(['.wingfoil/run/task-a/red/1.json: not an active run entry: removed']);
  });

  it("a rewrite's temporary file (a name starting with '.') is not read", () => {
    const base = root();
    put(base, 'task-a/red/.1.json.99.tmp', 'half written');
    put(base, 'task-a/red/1.json', `${JSON.stringify(entry('task-a/red/1'))}\n`);
    const { value, warnings } = captured(() => readActiveRuns(base));
    expect(value.ok ? value.value.map((item) => item.id) : value.error.message).toEqual(['task-a/red/1']);
    expect(warnings).toEqual([]);
    expect(existsSync(join(base, '.wingfoil/run/task-a/red/.1.json.99.tmp'))).toBe(true);
  });

  it('a .wingfoil/run that is a file cannot be read: IO', () => {
    const base = root();
    mkdirSync(join(base, '.wingfoil'), { recursive: true });
    writeFileSync(join(base, '.wingfoil', 'run'), 'x\n');
    const result = readActiveRuns(base);
    expect(result.ok ? '' : `${result.error.code} ${result.error.message}`).toMatch(/^IO cannot read the active registry \.wingfoil\/run\/: /);
  });

  it('processAlive: this process is alive, an exited one is not', () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(deadPid())).toBe(false);
  });
});
