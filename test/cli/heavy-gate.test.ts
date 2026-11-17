/**
 * task-349 (`dl-170` Decisions 1–4, Q1 (a), Q2 (C) script half; approver rulings D1–D8, 2026-11-07) — the
 * machine-wide heavy-gate lock of `scripts/heavy-gate.cjs`.
 *
 * - AC 1 (red-first): a free lock and a load at or below the cores → acquired, no wait line; a live holder or a
 *   1-minute load above the cores → exactly one wait line on stderr, naming the holder's pid and worktree and the
 *   lock path, or the load and the cores; a lock whose holder pid is gone, or whose content is unreadable, is taken
 *   over with one line; a release by a pid that does not hold the lock is a no-op. D3 (b): with `CI=true` the load
 *   wait is skipped and the lock kept; without `CI`, or with any other value, the load wait stands.
 * - AC 2 (red-first): a gate started inside a gate (`WINGFOIL_GATE_HOLDER` names the live pid the lock records) is
 *   nested: it returns at once, whatever the load, and writes nothing; `withHeavyGate` hands its run the holder's
 *   pid and releases only when it is not nested. The CLI half: `node scripts/heavy-gate.cjs <gate> -- <command>`.
 * - AC 3 (red-first): the trace `heavy-gate.trace.jsonl` — the `acquire`, `release` and `takeover` records, keys in
 *   the order `task-344` reads them, and no other key.
 *
 * Determinism: time, load, cores, liveness, sleep and the log are injected (a fixed or counter clock, a fake load,
 * a `sleep` that resolves at once and counts its calls); every lock lives in a `mkdtemp` directory and every call
 * gets an environment built here, never `process.env` (a full run carries its own `WINGFOIL_GATE_HOLDER`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GATE_DIR_ENV,
  GATE_HOLDER_ENV,
  acquireHeavyGate,
  gateDir,
  gateLockPath,
  gateTracePath,
  releaseHeavyGate,
  withHeavyGate,
} from '../../scripts/heavy-gate.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'heavy-gate.cjs');

const T0 = Date.parse('2026-11-06T17:00:00.000Z');
const T1 = Date.parse('2026-11-06T17:09:30.000Z');
const T0_ISO = '2026-11-06T17:00:00.000Z';
const T1_ISO = '2026-11-06T17:09:30.000Z';
const HOLDER_START = '2026-11-06T16:00:00.000Z';

const ME = 4242;
const MY_WORKTREE = '/abs/worktree';
const OTHER_PID = 999001;
const OTHER_WORKTREE = '/abs/other';

const ACQUIRE_KEYS = ['v', 'event', 'gate', 'pid', 'worktree', 'start', 'waited_ms'];
const RELEASE_KEYS = ['v', 'event', 'gate', 'pid', 'worktree', 'start', 'end', 'status'];
const TAKEOVER_KEYS = ['v', 'event', 'gate', 'pid', 'worktree', 'at', 'stale'];
const STALE_KEYS = ['pid', 'worktree', 'gate', 'start'];
const LOCK_KEYS = ['pid', 'worktree', 'gate', 'start'];

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wf-heavy-gate-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

type JsonRecord = Record<string, unknown>;

/** The lock file's one JSON line, parsed. */
function lockContent(at: string = dir): JsonRecord {
  const raw = readFileSync(gateLockPath(at), 'utf-8');
  expect(raw.split('\n').filter((line) => line !== '')).toHaveLength(1);
  return JSON.parse(raw.trim()) as JsonRecord;
}

/** Every trace line, parsed; `[]` when the trace was never written. */
function traceRecords(at: string = dir): JsonRecord[] {
  const path = gateTracePath(at);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf-8');
  expect(raw.endsWith('\n')).toBe(true);
  return raw
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as JsonRecord);
}

/** Write a lock as another holder left it. */
function plantLock(holder: { pid: number; worktree: string; gate: string; start: string }, at: string = dir): string {
  const content = `${JSON.stringify(holder)}\n`;
  writeFileSync(gateLockPath(at), content);
  return content;
}

/**
 * The injected dependencies of one call: a fixed clock at `T0`, load 0 on 12 cores, every pid but the planted
 * holders dead, a `sleep` that resolves at once and runs `onSleep(n)` on its n-th call, and a log that collects.
 */
function deps(over: {
  env?: Record<string, string>;
  load?: () => number;
  cpus?: number;
  isAlive?: (pid: number) => boolean;
  onSleep?: (n: number) => void;
  now?: () => number;
  gate?: string;
} = {}) {
  const lines: string[] = [];
  let sleeps = 0;
  const options = {
    dir,
    gate: over.gate ?? 'test',
    worktree: MY_WORKTREE,
    pid: ME,
    env: over.env ?? {},
    loadavg: () => [over.load ? over.load() : 0, 0, 0],
    cpus: () => over.cpus ?? 12,
    isAlive: over.isAlive ?? (() => false),
    now: over.now ?? (() => T0),
    sleep: async () => {
      sleeps += 1;
      if (sleeps > 50) throw new Error('the fake sleep was called more than 50 times: the gate never acquired');
      over.onSleep?.(sleeps);
    },
    log: (message: string) => lines.push(message),
    pollMs: 1,
  };
  return { options, lines, sleeps: () => sleeps };
}

const lockWaitReason = (pid: number, worktree: string, start: string): string =>
  `the machine-wide lock ${gateLockPath(dir)}, held by pid ${pid} in ${worktree} since ${start}`;
const loadWaitReason = (load: string, cores: number): string => `the 1-minute load average ${load} to fall to the ${cores} cores`;

describe('task-349 AC 3 — where the lock and the trace live (D5)', () => {
  it('the environment variables are WINGFOIL_GATE_DIR and WINGFOIL_GATE_HOLDER', () => {
    expect(GATE_DIR_ENV).toBe('WINGFOIL_GATE_DIR');
    expect(GATE_HOLDER_ENV).toBe('WINGFOIL_GATE_HOLDER');
  });

  it('gateDir is WINGFOIL_GATE_DIR when set and non-empty, else <tmpdir>/wingfoil-heavy-gate-<uid>', () => {
    expect(gateDir({ WINGFOIL_GATE_DIR: dir })).toBe(dir);
    expect(gateDir({}, { tmpdir: dir, uid: 7 })).toBe(join(dir, 'wingfoil-heavy-gate-7'));
    expect(gateDir({ WINGFOIL_GATE_DIR: '' }, { tmpdir: dir, uid: 7 })).toBe(join(dir, 'wingfoil-heavy-gate-7'));
    expect(gateDir({})).toBe(join(tmpdir(), `wingfoil-heavy-gate-${process.getuid!()}`));
  });

  it('the lock is <dir>/heavy-gate.lock and the trace <dir>/heavy-gate.trace.jsonl, as task-344 locates it', () => {
    expect(gateLockPath(dir)).toBe(join(dir, 'heavy-gate.lock'));
    expect(gateTracePath(dir)).toBe(join(dir, 'heavy-gate.trace.jsonl'));
    expect(gateTracePath(gateDir({ WINGFOIL_GATE_DIR: dir }))).toBe(join(dir, 'heavy-gate.trace.jsonl'));
  });
});

describe('task-349 AC 1 — acquireHeavyGate waits for the lock and the load, once, and takes over a dead holder', () => {
  it('a free lock and a load at or below the cores: acquired at once, no wait line, the lock records pid, worktree, gate and start', async () => {
    const d = deps({ load: () => 12, cpus: 12, gate: 'coverage' });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.lines).toEqual([]);
    expect(d.sleeps()).toBe(0);
    const lock = lockContent();
    expect(Object.keys(lock)).toEqual(LOCK_KEYS);
    expect(lock).toEqual({ pid: ME, worktree: MY_WORKTREE, gate: 'coverage', start: T0_ISO });
  });

  it('creates the gate directory on first use', async () => {
    const nested = join(dir, 'a', 'b');
    const d = deps();
    await acquireHeavyGate({ ...d.options, dir: nested });
    expect(lockContent(nested)).toMatchObject({ pid: ME });
  });

  it('a live holder: waits with exactly one line naming the lock path, the holder\'s pid, worktree and start, then acquires once it is released', async () => {
    plantLock({ pid: OTHER_PID, worktree: OTHER_WORKTREE, gate: 'coverage', start: HOLDER_START });
    const lockSeenWhileWaiting: unknown[] = [];
    const d = deps({
      isAlive: (pid) => pid === OTHER_PID,
      onSleep: (n) => {
        lockSeenWhileWaiting.push(JSON.parse(readFileSync(gateLockPath(dir), 'utf-8').trim()).pid);
        if (n === 3) rmSync(gateLockPath(dir)); // the holder releases
      },
    });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.sleeps()).toBeGreaterThanOrEqual(3);
    expect(lockSeenWhileWaiting.slice(0, 3)).toEqual([OTHER_PID, OTHER_PID, OTHER_PID]);
    expect(d.lines).toEqual([`heavy gate test: waiting for ${lockWaitReason(OTHER_PID, OTHER_WORKTREE, HOLDER_START)} (dl-170).`]);
    expect(lockContent()).toMatchObject({ pid: ME, worktree: MY_WORKTREE, gate: 'test' });
  });

  it('a 1-minute load of 13 on 12 cores: waits with one line naming 13.00 and the 12 cores, and acquires when the load falls to 12 (12 is not above 12)', async () => {
    let load = 13;
    const lockWhileWaiting: boolean[] = [];
    const d = deps({
      load: () => load,
      cpus: 12,
      onSleep: (n) => {
        lockWhileWaiting.push(existsSync(gateLockPath(dir)));
        if (n === 2) load = 12;
      },
    });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.sleeps()).toBeGreaterThanOrEqual(2);
    expect(lockWhileWaiting.slice(0, 2)).toEqual([false, false]);
    expect(d.lines).toEqual([`heavy gate test: waiting for ${loadWaitReason('13.00', 12)} (dl-170).`]);
    expect(lockContent()).toMatchObject({ pid: ME });
  });

  it('a live holder and a load above the cores together: still exactly one wait line, in the declared form', async () => {
    plantLock({ pid: OTHER_PID, worktree: OTHER_WORKTREE, gate: 'build', start: HOLDER_START });
    let load = 13;
    const d = deps({
      load: () => load,
      cpus: 12,
      isAlive: (pid) => pid === OTHER_PID,
      onSleep: (n) => {
        if (n === 2) load = 12;
        if (n === 4) rmSync(gateLockPath(dir));
      },
    });
    await acquireHeavyGate(d.options);
    const lock = lockWaitReason(OTHER_PID, OTHER_WORKTREE, HOLDER_START);
    const loadReason = loadWaitReason('13.00', 12);
    expect(d.lines).toHaveLength(1);
    expect([
      `heavy gate test: waiting for ${lock} (dl-170).`,
      `heavy gate test: waiting for ${loadReason} (dl-170).`,
      `heavy gate test: waiting for ${lock} and ${loadReason} (dl-170).`,
    ]).toContain(d.lines[0]);
    expect(lockContent()).toMatchObject({ pid: ME });
  });

  it('a lock whose holder pid is not running: taken over with one line, a takeover record naming the stale holder, then acquired', async () => {
    plantLock({ pid: 999002, worktree: MY_WORKTREE, gate: 'coverage', start: HOLDER_START });
    const d = deps({ gate: 'test', isAlive: () => false });
    // The taker is another worktree's gate.
    await expect(acquireHeavyGate({ ...d.options, pid: 4343, worktree: OTHER_WORKTREE })).resolves.toEqual({ nested: false });
    expect(d.lines).toEqual([`heavy gate test: took over the lock ${gateLockPath(dir)} left by pid 999002 in ${MY_WORKTREE}, which is not running (dl-170).`]);
    expect(lockContent()).toEqual({ pid: 4343, worktree: OTHER_WORKTREE, gate: 'test', start: T0_ISO });
    expect(existsSync(`${gateLockPath(dir)}.break`)).toBe(false);
    const takeover = traceRecords().find((record) => record.event === 'takeover');
    expect(takeover).toBeDefined();
    expect(Object.keys(takeover!)).toEqual(TAKEOVER_KEYS);
    expect(takeover).toEqual({
      v: 1,
      event: 'takeover',
      gate: 'test',
      pid: 4343,
      worktree: OTHER_WORKTREE,
      at: T0_ISO,
      stale: { pid: 999002, worktree: MY_WORKTREE, gate: 'coverage', start: HOLDER_START },
    });
    expect(Object.keys(takeover!.stale as JsonRecord)).toEqual(STALE_KEYS);
  });

  it('a lock whose content is unreadable: taken over with one line and a takeover record, then acquired', async () => {
    writeFileSync(gateLockPath(dir), 'not a lock record\n');
    const d = deps({ isAlive: () => true });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]!.startsWith(`heavy gate test: took over the lock ${gateLockPath(dir)}`)).toBe(true);
    expect(d.lines[0]!.endsWith('(dl-170).')).toBe(true);
    expect(lockContent()).toEqual({ pid: ME, worktree: MY_WORKTREE, gate: 'test', start: T0_ISO });
    const takeover = traceRecords().find((record) => record.event === 'takeover');
    expect(takeover).toMatchObject({ v: 1, event: 'takeover', gate: 'test', pid: ME, worktree: MY_WORKTREE, at: T0_ISO });
    expect(Object.keys(takeover!)).toEqual(TAKEOVER_KEYS);
  });

  it('releaseHeavyGate by a pid the lock does not record: false, the lock kept, no release record', async () => {
    await acquireHeavyGate(deps().options);
    expect(releaseHeavyGate({ dir, pid: 5555, now: () => T1, status: 0 })).toBe(false);
    expect(lockContent()).toMatchObject({ pid: ME });
    expect(traceRecords().map((record) => record.event)).toEqual(['acquire']);
    expect(releaseHeavyGate({ dir, pid: ME, now: () => T1, status: 0 })).toBe(true);
    expect(existsSync(gateLockPath(dir))).toBe(false);
  });

  it('a record that cannot be written is reported once on stderr and the gate goes on', async () => {
    mkdirSync(gateTracePath(dir)); // a directory where the trace file should be: every append fails
    const d = deps();
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.lines).toHaveLength(1);
    expect(lockContent()).toMatchObject({ pid: ME });
  });
});

describe('task-349 AC 1 — D3 (b): with CI=true the load wait is skipped and the lock is kept', () => {
  it('CI=true and a load of 13 on 12 cores: acquired at once, no wait line, the lock and the acquire record written as usual', async () => {
    const d = deps({ env: { CI: 'true' }, load: () => 13, cpus: 12 });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.sleeps()).toBe(0);
    expect(d.lines).toEqual([]);
    expect(lockContent()).toEqual({ pid: ME, worktree: MY_WORKTREE, gate: 'test', start: T0_ISO });
    expect(traceRecords()).toEqual([{ v: 1, event: 'acquire', gate: 'test', pid: ME, worktree: MY_WORKTREE, start: T0_ISO, waited_ms: 0 }]);
  });

  it('CI=true and a live holder: the lock is still waited for, with one line naming the holder', async () => {
    plantLock({ pid: OTHER_PID, worktree: OTHER_WORKTREE, gate: 'coverage', start: HOLDER_START });
    const d = deps({
      env: { CI: 'true' },
      load: () => 13,
      cpus: 12,
      isAlive: (pid) => pid === OTHER_PID,
      onSleep: (n) => {
        if (n === 2) rmSync(gateLockPath(dir));
      },
    });
    await acquireHeavyGate(d.options);
    expect(d.sleeps()).toBeGreaterThanOrEqual(2);
    expect(d.lines).toEqual([`heavy gate test: waiting for ${lockWaitReason(OTHER_PID, OTHER_WORKTREE, HOLDER_START)} (dl-170).`]);
    expect(lockContent()).toMatchObject({ pid: ME });
  });

  it.each([
    ['CI unset', {}],
    ['CI=false', { CI: 'false' }],
    ['CI=1', { CI: '1' }],
  ])('%s and a load of 13 on 12 cores: the load wait stands', async (_label, env: Record<string, string>) => {
    let load = 13;
    const lockWhileWaiting: boolean[] = [];
    const d = deps({
      env,
      load: () => load,
      cpus: 12,
      onSleep: (n) => {
        lockWhileWaiting.push(existsSync(gateLockPath(dir)));
        if (n === 2) load = 12;
      },
    });
    await acquireHeavyGate(d.options);
    expect(d.sleeps()).toBeGreaterThanOrEqual(2);
    expect(lockWhileWaiting.slice(0, 2)).toEqual([false, false]);
    expect(d.lines).toEqual([`heavy gate test: waiting for ${loadWaitReason('13.00', 12)} (dl-170).`]);
  });
});

describe('task-349 AC 2 — a gate inside a gate is nested: it never waits on its own lock', () => {
  const HOLDER = 7777;

  it('WINGFOIL_GATE_HOLDER names the live pid the lock records: { nested: true } at once, even with the load above the cores, and nothing written', async () => {
    const content = plantLock({ pid: HOLDER, worktree: MY_WORKTREE, gate: 'test', start: HOLDER_START });
    const d = deps({ env: { WINGFOIL_GATE_HOLDER: String(HOLDER) }, load: () => 99, cpus: 1, isAlive: (pid) => pid === HOLDER });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: true });
    expect(d.sleeps()).toBe(0);
    expect(d.lines).toEqual([]);
    expect(readFileSync(gateLockPath(dir), 'utf-8')).toBe(content);
    expect(existsSync(gateTracePath(dir))).toBe(false);
  });

  it('a holder pid that does not match the lock is not nested: it waits for the lock like any gate', async () => {
    plantLock({ pid: HOLDER, worktree: OTHER_WORKTREE, gate: 'test', start: HOLDER_START });
    const d = deps({
      env: { WINGFOIL_GATE_HOLDER: '8888' },
      isAlive: (pid) => pid === HOLDER || pid === 8888,
      onSleep: (n) => {
        if (n === 1) rmSync(gateLockPath(dir));
      },
    });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.lines).toEqual([`heavy gate test: waiting for ${lockWaitReason(HOLDER, OTHER_WORKTREE, HOLDER_START)} (dl-170).`]);
    expect(lockContent()).toMatchObject({ pid: ME });
  });

  it('a holder pid the lock records but that is not running is not nested: the lock is taken over', async () => {
    plantLock({ pid: HOLDER, worktree: OTHER_WORKTREE, gate: 'test', start: HOLDER_START });
    const d = deps({ env: { WINGFOIL_GATE_HOLDER: String(HOLDER) }, isAlive: () => false });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(traceRecords().map((record) => record.event)).toEqual(['takeover', 'acquire']);
    expect(lockContent()).toMatchObject({ pid: ME });
  });

  it('a holder pid in another gate directory (no lock here) is not nested: the gate is acquired', async () => {
    const d = deps({ env: { WINGFOIL_GATE_HOLDER: String(HOLDER) }, isAlive: () => true });
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(lockContent()).toMatchObject({ pid: ME });
  });

  it('withHeavyGate hands run the holder\'s pid as WINGFOIL_GATE_HOLDER, returns its result, and releases the lock', async () => {
    const d = deps({ env: { KEEP: 'kept' }, gate: 'coverage' });
    const seen: { env: Record<string, string | undefined>; lock: JsonRecord }[] = [];
    const result = await withHeavyGate(d.options, (childEnv: Record<string, string | undefined>) => {
      seen.push({ env: childEnv, lock: lockContent() });
      return 3;
    });
    expect(result).toBe(3);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.env).toMatchObject({ KEEP: 'kept', WINGFOIL_GATE_HOLDER: String(ME) });
    expect(seen[0]!.lock).toMatchObject({ pid: ME, gate: 'coverage' });
    expect(existsSync(gateLockPath(dir))).toBe(false);
    expect(traceRecords().map((record) => [record.event, record.status])).toEqual([
      ['acquire', undefined],
      ['release', 3],
    ]);
  });

  it('withHeavyGate, nested: run gets the inherited holder pid, and the holder\'s lock is not released', async () => {
    const content = plantLock({ pid: HOLDER, worktree: MY_WORKTREE, gate: 'test', start: HOLDER_START });
    const d = deps({ env: { WINGFOIL_GATE_HOLDER: String(HOLDER) }, isAlive: (pid) => pid === HOLDER, load: () => 99, cpus: 1 });
    const envs: Record<string, string | undefined>[] = [];
    const result = await withHeavyGate(d.options, (childEnv: Record<string, string | undefined>) => {
      envs.push(childEnv);
      return 0;
    });
    expect(result).toBe(0);
    expect(envs).toHaveLength(1);
    expect(envs[0]![GATE_HOLDER_ENV]).toBe(String(HOLDER));
    expect(readFileSync(gateLockPath(dir), 'utf-8')).toBe(content);
    expect(existsSync(gateTracePath(dir))).toBe(false);
  });
});

describe('task-349 AC 3 — the trace: acquire, release and takeover records, keys in order, nothing else', () => {
  it('an acquire then a release write exactly the two records, the same start in both, end after start, status the run\'s', async () => {
    await acquireHeavyGate(deps({ gate: 'coverage' }).options);
    expect(releaseHeavyGate({ dir, pid: ME, now: () => T1, status: 0 })).toBe(true);
    const records = traceRecords();
    expect(records).toEqual([
      { v: 1, event: 'acquire', gate: 'coverage', pid: ME, worktree: MY_WORKTREE, start: T0_ISO, waited_ms: 0 },
      { v: 1, event: 'release', gate: 'coverage', pid: ME, worktree: MY_WORKTREE, start: T0_ISO, end: T1_ISO, status: 0 },
    ]);
    expect(Object.keys(records[0]!)).toEqual(ACQUIRE_KEYS);
    expect(Object.keys(records[1]!)).toEqual(RELEASE_KEYS);
    expect(Date.parse(records[1]!.end as string)).toBeGreaterThan(Date.parse(records[1]!.start as string));
  });

  it('a gate that ended on a signal releases with status null', async () => {
    await acquireHeavyGate(deps().options);
    releaseHeavyGate({ dir, pid: ME, now: () => T1, status: null });
    expect(traceRecords()[1]).toEqual({ v: 1, event: 'release', gate: 'test', pid: ME, worktree: MY_WORKTREE, start: T0_ISO, end: T1_ISO, status: null });
  });

  it('a wait is recorded as waited_ms, a non-negative number of the injected clock\'s milliseconds', async () => {
    let tick = 0;
    let load = 13;
    const d = deps({
      load: () => load,
      now: () => T0 + 1000 * tick++,
      onSleep: (n) => {
        if (n === 2) load = 12;
      },
    });
    await acquireHeavyGate(d.options);
    const [acquire] = traceRecords();
    expect(Object.keys(acquire!)).toEqual(ACQUIRE_KEYS);
    expect(typeof acquire!.waited_ms).toBe('number');
    expect(acquire!.waited_ms as number).toBeGreaterThanOrEqual(0);
  });

  it('a takeover is recorded before the taker\'s acquire; a nested call adds no line; no record carries an undeclared key', async () => {
    plantLock({ pid: 999002, worktree: OTHER_WORKTREE, gate: 'coverage', start: HOLDER_START });
    await acquireHeavyGate(deps({ env: { SECRET_LOOKING: 'x' } }).options);
    const before = readFileSync(gateTracePath(dir), 'utf-8');
    // A gate nested in the one just acquired.
    await acquireHeavyGate({ ...deps({ env: { WINGFOIL_GATE_HOLDER: String(ME) }, isAlive: (pid) => pid === ME }).options, pid: 5151 });
    expect(readFileSync(gateTracePath(dir), 'utf-8')).toBe(before);
    releaseHeavyGate({ dir, pid: ME, now: () => T1, status: 1 });
    const records = traceRecords();
    expect(records.map((record) => record.event)).toEqual(['takeover', 'acquire', 'release']);
    const declared: Record<string, string[]> = { acquire: ACQUIRE_KEYS, release: RELEASE_KEYS, takeover: TAKEOVER_KEYS };
    for (const record of records) expect(Object.keys(record)).toEqual(declared[record.event as string]);
    expect(JSON.stringify(records)).not.toContain('SECRET_LOOKING');
  });
});

describe('task-349 AC 1 / AC 2 — the CLI: node scripts/heavy-gate.cjs <gate> -- <command> [args…]', () => {
  /** An environment of this process without any gate variable, plus `extra`. */
  function cliEnv(extra: Record<string, string>): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = { ...process.env };
    delete env[GATE_DIR_ENV];
    delete env[GATE_HOLDER_ENV];
    return { ...env, ...extra };
  }

  it('nested under a live holder: runs the command at once, exits with its status (3), and leaves the lock and the trace untouched', () => {
    const content = plantLock({ pid: process.pid, worktree: MY_WORKTREE, gate: 'test', start: HOLDER_START });
    const run = spawnSync(process.execPath, [SCRIPT, 'test', '--', 'node', '-e', 'process.exit(3)'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: cliEnv({ WINGFOIL_GATE_DIR: dir, WINGFOIL_GATE_HOLDER: String(process.pid) }),
    });
    expect([run.status, run.signal, run.stderr]).toEqual([3, null, '']);
    expect(readFileSync(gateLockPath(dir), 'utf-8')).toBe(content);
    expect(existsSync(gateTracePath(dir))).toBe(false);
  });

  it.each([
    ['no `--`', ['test', 'node', '-e', 'process.exit(0)']],
    ['no gate name', ['--', 'node', '-e', 'process.exit(0)']],
  ])('%s: a usage error, exit 2, and no lock taken', (_label, args: string[]) => {
    const run = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf-8', env: cliEnv({ WINGFOIL_GATE_DIR: dir }) });
    expect(run.status).toBe(2);
    expect(run.stderr).not.toBe('');
    expect(existsSync(gateLockPath(dir))).toBe(false);
  });
});
