/**
 * Meta-test for the shared CLI spawn helper `./helpers/spawn-cli`
 * (`task-145-replace-cli-test-helpers-fabricated-stderr-child-real`, `bug-070`, `dl-121` T1).
 *
 * The helper exists because the `execFileSync` + `catch` shape the CLI suites used to copy sees
 * stderr only when the child exits non-zero: on the success path it returned a literal `stderr: ''`,
 * so every "a passing command printed nothing to stderr" assertion compared the helper's own constant
 * against itself. These cases pin the opposite: a child that writes to fd 2 and exits `0` is reported
 * with exactly what it wrote, on every path the helper has.
 *
 * The children are `node -e <script>` one-liners — no clock, no network, no shared state.
 */
import { existsSync } from 'fs';

import { CLI_ENTRY, CLI_FIXTURE_ROOT, CLI_HARNESS, runCliEntry, runCliHarness, spawnCapture } from './helpers/spawn-cli';

/** Run `node -e <script>` through the helper. */
function node(script: string): ReturnType<typeof spawnCapture> {
  return spawnCapture('node', ['-e', script]);
}

describe('spawnCapture reports the child process’s real stderr on every path', () => {
  it('a child that writes to stderr and exits 0 is reported with that text, not an empty string', () => {
    const run = node("process.stderr.write('warning: printed on success\\n')");
    expect(run).toEqual({ status: 0, stdout: '', stderr: 'warning: printed on success\n' });
  });

  it('a child that writes to both streams and exits 0 is reported with both, unmixed', () => {
    const run = node("process.stdout.write('out\\n'); process.stderr.write('err\\n')");
    expect(run).toEqual({ status: 0, stdout: 'out\n', stderr: 'err\n' });
  });

  it('a child that writes to stderr and exits non-zero is reported with its status and that text', () => {
    const run = node("process.stderr.write('error: refused\\n'); process.exit(2)");
    expect(run).toEqual({ status: 2, stdout: '', stderr: 'error: refused\n' });
  });

  it('a quiet child that exits 0 is reported with an empty stderr — the one case where `stderr` is empty', () => {
    expect(node('')).toEqual({ status: 0, stdout: '', stderr: '' });
  });

  it('runs the child in the given working directory', () => {
    const run = spawnCapture('node', ['-e', 'process.stdout.write(process.cwd())'], { cwd: __dirname });
    expect(run.stdout).toBe(__dirname);
  });

  it('throws, rather than reporting a status, when the command cannot be spawned', () => {
    expect(() => spawnCapture('wingfoil-no-such-executable-task-145', [])).toThrow(/ENOENT/);
  });

  it('throws, rather than reporting a status, when the child is killed by a signal', () => {
    expect(() => node("process.kill(process.pid, 'SIGTERM')")).toThrow(/SIGTERM/);
  });

  it('a child that outlives the given timeout is killed, and that throws like any other signal (task-316)', () => {
    expect(() => spawnCapture('node', ['-e', 'setTimeout(() => {}, 5000)'], { timeout: 200 })).toThrow(/ended on signal SIGTERM/);
  });
});

describe('the CLI entry points the suites spawn through the helper', () => {
  it('both point at files that exist (dist/ is built by jest’s globalSetup)', () => {
    expect([existsSync(CLI_ENTRY), existsSync(CLI_HARNESS), existsSync(CLI_FIXTURE_ROOT)]).toEqual([true, true, true]);
  });

  it('runCliHarness reports the compiled CLI’s real stderr on a non-zero exit', () => {
    const run = runCliHarness(CLI_FIXTURE_ROOT, ['nosuchnoun']);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("error: unknown command 'nosuchnoun'");
  });

  it('runCliEntry reports the published entry point’s status and streams from the given cwd', () => {
    const run = runCliEntry(CLI_FIXTURE_ROOT, ['--version']);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^\d+\.\d+\.\d+/);
    expect(run.stderr).toBe('');
  });
});
