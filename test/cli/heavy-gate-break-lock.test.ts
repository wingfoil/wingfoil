/**
 * task-349, review finding F1 (`dl-170` Decision 3–4, AC 1) — a `<lock>.break` left behind by a process killed while
 * it held it never hangs the heavy gates silently:
 *
 * - left by a pid that is not running (or holding no pid record): it is removed with one line, the stale lock is then
 *   taken over and the gate acquired;
 * - held by a live pid: the gate waits, and its one wait line names the `.break` path and what to do with it.
 *
 * Determinism: liveness, the clock, the load, the sleep and the log are injected; every lock lives in a `mkdtemp`
 * directory and every call gets an environment built here.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireHeavyGate, gateLockPath, gateTracePath } from '../../scripts/heavy-gate.cjs';

const T0 = Date.parse('2026-11-07T10:00:00.000Z');
const ME = 4242;
const DEAD_HOLDER = 999101;
const BREAKER = 999102;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wf-heavy-gate-break-test-'));
  // A lock left by a gate killed before its release.
  writeFileSync(gateLockPath(dir), `${JSON.stringify({ pid: DEAD_HOLDER, worktree: '/abs/other', gate: 'coverage', start: '2026-11-07T09:00:00.000Z' })}\n`);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const breakPath = (): string => `${gateLockPath(dir)}.break`;

function deps(isAlive: (pid: number) => boolean, onSleep: (n: number) => void = () => undefined) {
  const lines: string[] = [];
  let sleeps = 0;
  const options = {
    dir,
    gate: 'test',
    worktree: '/abs/worktree',
    pid: ME,
    env: {},
    loadavg: () => [0, 0, 0],
    cpus: () => 12,
    isAlive,
    now: () => T0,
    sleep: async () => {
      sleeps += 1;
      if (sleeps > 50) throw new Error('the fake sleep was called more than 50 times: the gate never acquired');
      onSleep(sleeps);
    },
    log: (message: string) => lines.push(message),
    pollMs: 1,
  };
  return { options, lines, sleeps: () => sleeps };
}

const events = (): unknown[] =>
  readFileSync(gateTracePath(dir), 'utf-8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => (JSON.parse(line) as { event: string }).event);

describe('task-349 F1 — a leftover <lock>.break never hangs the heavy gates silently', () => {
  it('left by a pid that is not running: removed with one line, the stale lock taken over, the gate acquired at once', async () => {
    writeFileSync(breakPath(), `${JSON.stringify({ pid: BREAKER })}\n`);
    const d = deps(() => false);
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.sleeps()).toBe(0);
    expect(d.lines).toEqual([
      `heavy gate test: removed the break lock ${breakPath()} left by pid ${BREAKER}, which is not running (dl-170).`,
      `heavy gate test: took over the lock ${gateLockPath(dir)} left by pid ${DEAD_HOLDER} in /abs/other, which is not running (dl-170).`,
    ]);
    expect(existsSync(breakPath())).toBe(false);
    expect(JSON.parse(readFileSync(gateLockPath(dir), 'utf-8'))).toMatchObject({ pid: ME, gate: 'test' });
    expect(events()).toEqual(['takeover', 'acquire']);
  });

  it('holding no pid record: removed as well, and the gate acquired', async () => {
    writeFileSync(breakPath(), 'garbage\n');
    const d = deps(() => true);
    // The lock's holder is dead; the break lock names nobody.
    d.options.isAlive = (pid: number) => pid !== DEAD_HOLDER;
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.lines[0]).toBe(`heavy gate test: removed the break lock ${breakPath()}, whose content is not a pid record (dl-170).`);
    expect(existsSync(breakPath())).toBe(false);
    expect(events()).toEqual(['takeover', 'acquire']);
  });

  it('held by a live pid: exactly one wait line naming the .break path, then the gate acquires once it is gone', async () => {
    writeFileSync(breakPath(), `${JSON.stringify({ pid: BREAKER })}\n`);
    const d = deps(
      (pid) => pid === BREAKER,
      (n) => {
        if (n === 3) rmSync(breakPath()); // the breaker finishes (or a person removes the file)
      },
    );
    await expect(acquireHeavyGate(d.options)).resolves.toEqual({ nested: false });
    expect(d.sleeps()).toBe(3);
    expect(d.lines).toHaveLength(2);
    expect(d.lines[0]).toBe(
      `heavy gate test: waiting for the break lock ${breakPath()}, held by pid ${BREAKER} while it takes over the lock left by pid ${DEAD_HOLDER} ` +
        `(remove ${breakPath()} if no heavy gate is starting) (dl-170).`,
    );
    expect(d.lines[1]).toContain('took over the lock');
    expect(JSON.parse(readFileSync(gateLockPath(dir), 'utf-8'))).toMatchObject({ pid: ME });
  });
});
