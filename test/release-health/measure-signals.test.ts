/**
 * bug-329, task-232 review F1 — a signal that lands while the guarded measurement is synchronous (the history half;
 * `--no-toolchain`; the pinned-Node refusal, which never awaits a tool) must still tear the worktree down and end the
 * run by that signal. Node delivers a signal to its JavaScript handler only in the event loop's poll phase, so a
 * guard that removed its handlers as soon as the function settled used to swallow it: the run went on, wrote its
 * report and exited 0.
 *
 * The real-process case blocks synchronously with `Atomics.wait`, so no handler can run until the function returns.
 */
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { withGuardedWorktree } from '../../scripts/release-health/measure.cjs';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEASURE = join(__dirname, '..', '..', 'scripts', 'release-health', 'measure.cjs');

const repos: string[] = [];
afterAll(() => repos.forEach(removeTempDir));

function fixture(): { root: string; point: string } {
  const root = makeTempGitRepo();
  repos.push(root);
  writeFixtureFile(root, 'README.md', 'Fixture.\n');
  commitAll(root, 'chore: fixture');
  return { root, point: git(root, ['rev-parse', 'HEAD']).trim() };
}

describe('the guarded worktree under a signal that lands during synchronous work (bug-329, review F1)', () => {
  it('a function that never yields: the signal still interrupts, the worktree goes, and no result is returned', async () => {
    const { root, point } = fixture();
    const before = git(root, ['worktree', 'list', '--porcelain']);
    const target = new EventEmitter();
    const died: string[] = [];
    let tree = '';
    await expect(
      withGuardedWorktree(root, point, async (t) => {
        tree = t;
        target.emit('SIGTERM');
        return 'a report';
      }, { target, die: (signal) => void died.push(signal) }),
    ).rejects.toThrow('interrupted by SIGTERM');
    expect(died).toEqual(['SIGTERM']);
    expect(existsSync(dirname(tree))).toBe(false);
    expect(git(root, ['worktree', 'list', '--porcelain'])).toBe(before);
    expect(target.eventNames()).toEqual([]);
  });

  it.each([
    ['right away', ''],
    // Re-review N1: resumed from a poll-phase callback, one setImmediate ran before the next poll phase.
    ['after an fs callback', 'await new Promise((r) => require("node:fs").readFile(__filename, r));'],
    ['after a child whose stdio closed early', 'await new Promise((r) => { const c = require("node:child_process").spawn("sh", ["-c", "exec >&- 2>&-; sleep 0.3"], { stdio: ["ignore", "pipe", "pipe"] }); c.stdout.on("data", () => {}); c.stderr.on("data", () => {}); c.on("close", () => r()); });'],
  ])('a real process SIGTERM\'d during a synchronous stretch (%s) exits by the signal and leaves no worktree', async (_when, resume) => {
    const { root, point } = fixture();
    const before = git(root, ['worktree', 'list', '--porcelain']);
    const script = [
      `const { withGuardedWorktree } = require(${JSON.stringify(MEASURE)});`,
      'const block = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);',
      `withGuardedWorktree(${JSON.stringify(root)}, ${JSON.stringify(point)}, async (tree) => {`,
      `  ${resume}`,
      '  process.stdout.write("ready " + tree + "\\n");',
      '  block(3000);',
      '  return "a report";',
      '}).then(() => process.exit(3), (e) => { process.stderr.write(String(e) + "\\n"); process.exit(4); });',
    ].join('\n');
    const child = spawn(process.execPath, ['-e', script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString(); });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    await new Promise<void>((resolve) => {
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        if (out.includes('\n')) resolve();
      });
      void exited.then(() => resolve());
    });
    child.kill('SIGTERM');
    const { code, signal } = await exited;
    expect({ code, signal, err }).toMatchObject({ code: null, signal: 'SIGTERM' });
    const tree = /^ready (\S+)$/m.exec(out)?.[1] ?? '';
    expect(tree).toMatch(/wf-release-health-/);
    expect(existsSync(dirname(tree))).toBe(false);
    expect(git(root, ['worktree', 'list', '--porcelain'])).toBe(before);
  });
});
