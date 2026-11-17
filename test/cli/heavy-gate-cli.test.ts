/**
 * task-349 (`dl-170` Decisions 1–4) — `node scripts/heavy-gate.cjs <gate> -- <command>` as a holder: it takes the
 * lock, runs the command with `WINGFOIL_GATE_HOLDER` naming itself, exits with the command's status, releases the
 * lock and leaves the `acquire`/`release` pair in the trace; a command ended by a signal exits 1, says so on stderr
 * and is released with `status: null`; a command that cannot be started exits 1 and is released too.
 *
 * Every run uses a `mkdtemp` gate directory and `CI=true`, so the machine's real load never makes it wait (ruling
 * D3 (b): the load wait is skipped, the lock is kept); the gate variables of a surrounding run are removed from the
 * child's environment.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GATE_DIR_ENV, GATE_HOLDER_ENV, gateLockPath, gateTracePath } from '../../scripts/heavy-gate.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'heavy-gate.cjs');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wf-heavy-gate-cli-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runGate(gate: string, command: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, CI: 'true', [GATE_DIR_ENV]: dir };
  delete env[GATE_HOLDER_ENV];
  return spawnSync(process.execPath, [SCRIPT, gate, '--', ...command], { cwd: REPO_ROOT, encoding: 'utf-8', env });
}

function trace(): Record<string, unknown>[] {
  return readFileSync(gateTracePath(dir), 'utf-8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('task-349 — scripts/heavy-gate.cjs as the holder of the machine-wide lock', () => {
  it('runs the command under the lock with WINGFOIL_GATE_HOLDER = its own pid, exits with its status, and releases', () => {
    const probe = `const fs = require('fs'); process.stdout.write(JSON.stringify({ holder: process.env.${GATE_HOLDER_ENV}, lock: JSON.parse(fs.readFileSync(${JSON.stringify(gateLockPath(dir))}, 'utf-8')) })); process.exit(4);`;
    const run = runGate('build', [process.execPath, '-e', probe]);
    expect([run.status, run.signal, run.stderr]).toEqual([4, null, '']);
    const seen = JSON.parse(run.stdout) as { holder: string; lock: { pid: number; worktree: string; gate: string } };
    expect(seen.lock).toMatchObject({ pid: Number(seen.holder), worktree: REPO_ROOT, gate: 'build' });
    expect(existsSync(gateLockPath(dir))).toBe(false);
    const records = trace();
    expect(records.map((record) => [record.event, record.gate, record.pid, record.worktree])).toEqual([
      ['acquire', 'build', Number(seen.holder), REPO_ROOT],
      ['release', 'build', Number(seen.holder), REPO_ROOT],
    ]);
    expect(records[1]).toMatchObject({ start: records[0]!.start, status: 4 });
  });

  it('a command ended by a signal: exit 1, the signal named on stderr, released with status null', () => {
    const run = runGate('test', [process.execPath, '-e', "process.kill(process.pid, 'SIGTERM')"]);
    expect([run.status, run.signal]).toEqual([1, null]);
    expect(run.stderr).toContain('ended on signal SIGTERM');
    expect(existsSync(gateLockPath(dir))).toBe(false);
    expect(trace().map((record) => [record.event, record.status])).toEqual([
      ['acquire', undefined],
      ['release', null],
    ]);
  });

  it('a command that cannot be started: exit 1, named on stderr, the lock released', () => {
    const run = runGate('typecheck', [join(dir, 'no-such-command')]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('heavy gate typecheck: cannot run');
    expect(existsSync(gateLockPath(dir))).toBe(false);
    expect(trace().map((record) => record.event)).toEqual(['acquire', 'release']);
  });

  it('an unknown gate name is a usage error naming the four gates', () => {
    const run = runGate('lint', [process.execPath, '-e', 'process.exit(0)']);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('<test|coverage|build|typecheck>');
    expect(existsSync(gateLockPath(dir))).toBe(false);
  });
});
