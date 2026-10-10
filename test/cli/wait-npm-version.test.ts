/**
 * task-229 (`dl-130` step 1, `adr-011`; planning ruling R20, Q3) — `scripts/wait-npm-version.cjs`, the bounded
 * poll `publish.yml`'s `release` job runs before it creates the GitHub Release. `promote` only STAGES a
 * version; it goes live when the approver approves it on npm. The poll asks npm for the EXACT version
 * (`npm view <name>@<version> version`, never `@latest`, which a `latest-X.Y` publish does not move —
 * dl-159 handover) and succeeds only when npm answers that version; it gives up after a declared timeout with
 * a readable failure.
 *
 * The poll is tested with an injected clock, sleep and npm, so no test waits or reaches a registry; the
 * command line is driven with a fake `npm` first on PATH.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { npmViewArgs, waitForNpmVersion } from '../../scripts/wait-npm-version.cjs';
import type { NpmViewAnswer } from '../../scripts/wait-npm-version.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'wait-npm-version.cjs');
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { name: string; version: string };

/** A fake clock: `sleep` advances it; nothing waits. */
function clock(): { now: () => number; sleep: (ms: number) => Promise<void>; slept: number[] } {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    slept,
  };
}

/** npm answers, in order; the last one repeats. */
function answers(...list: NpmViewAnswer[]): { view: (args: readonly string[]) => Promise<NpmViewAnswer>; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    view: async (args) => {
      calls.push([...args]);
      return list[Math.min(calls.length - 1, list.length - 1)] as NpmViewAnswer;
    },
  };
}

const NOT_FOUND: NpmViewAnswer = { status: 1, stdout: '', stderr: 'npm error code E404' };

describe('npmViewArgs (task-229) — the exact version, never a dist-tag', () => {
  it('asks for `<name>@<version> version`', () => {
    expect(npmViewArgs('wingfoil', '0.3.0')).toEqual(['view', 'wingfoil@0.3.0', 'version']);
  });
});

describe('waitForNpmVersion (task-229) — a bounded poll', () => {
  it('succeeds at once when npm already serves the version', async () => {
    const c = clock();
    const npm = answers({ status: 0, stdout: '0.3.0\n', stderr: '' });
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 60_000, intervalMs: 10_000, view: npm.view, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(c.slept).toEqual([]);
    expect(npm.calls).toEqual([['view', 'wingfoil@0.3.0', 'version']]);
  });

  it('keeps polling, one interval apart, until npm answers the version', async () => {
    const c = clock();
    const npm = answers(NOT_FOUND, NOT_FOUND, { status: 0, stdout: '0.3.0\n', stderr: '' });
    const lines: string[] = [];
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 60_000, intervalMs: 10_000, view: npm.view, now: c.now, sleep: c.sleep, log: (l) => lines.push(l) });
    expect(result).toMatchObject({ ok: true, attempts: 3 });
    expect(c.slept).toEqual([10_000, 10_000]);
    expect(lines).toHaveLength(3);
    expect(result.message).toMatch(/wingfoil@0\.3\.0 is live on npm/);
  });

  it('does not take another version for the one awaited (an exit 0 that answers something else)', async () => {
    const c = clock();
    const npm = answers({ status: 0, stdout: '0.3.1\n', stderr: '' });
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 20_000, intervalMs: 10_000, view: npm.view, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(result.ok).toBe(false);
  });

  it('gives up after the timeout with a message naming the version, the wait and the last answer', async () => {
    const c = clock();
    const npm = answers(NOT_FOUND);
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 30_000, intervalMs: 10_000, view: npm.view, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(4);
    expect(c.slept.reduce((a, b) => a + b, 0)).toBe(30_000);
    expect(result.message).toMatch(/wingfoil@0\.3\.0 is not live on npm after 30 s \(4 attempts\)/);
    expect(result.message).toContain('E404');
  });

  it('never sleeps past the deadline: the last wait is shortened to it', async () => {
    const c = clock();
    const npm = answers(NOT_FOUND);
    await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 25_000, intervalMs: 10_000, view: npm.view, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(c.slept).toEqual([10_000, 10_000, 5_000]);
  });

  it('a timeout of 0 means exactly one attempt', async () => {
    const c = clock();
    const npm = answers(NOT_FOUND);
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 0, intervalMs: 10_000, view: npm.view, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(c.slept).toEqual([]);
  });
});

describe('wait-npm-version command line (task-229)', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'wf-wait-npm-'));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  /** A fake `npm` that records its argv and answers per FAKE_NPM_STDOUT / FAKE_NPM_EXIT. */
  function fakeNpm(): string {
    const bin = join(work, 'bin');
    spawnSync('mkdir', ['-p', bin]);
    const file = join(bin, 'npm');
    writeFileSync(
      file,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${join(work, 'argv')}"\nprintf '%s' "$FAKE_NPM_STDOUT"\nexit "\${FAKE_NPM_EXIT:-0}"\n`,
    );
    chmodSync(file, 0o755);
    return bin;
  }

  const run = (args: string[], env: Record<string, string> = {}): ReturnType<typeof spawnSync> =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${fakeNpm()}${delimiter}${process.env.PATH ?? ''}`, ...env },
    });

  const tag = `v${pkg.version}`;

  it('exits 0 when npm serves the version of the tag, asking for that exact package version', () => {
    const result = run([tag, '--timeout-minutes', '0', '--interval-seconds', '1'], { FAKE_NPM_STDOUT: `${pkg.version}\n` });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${pkg.name}@${pkg.version} is live on npm`);
    expect(readFileSync(join(work, 'argv'), 'utf-8')).toBe(`view ${pkg.name}@${pkg.version} version\n`);
  });

  it('exits 1 with an `error:` line when the timeout passes and npm never served it', () => {
    const result = run([tag, '--timeout-minutes', '0', '--interval-seconds', '1'], { FAKE_NPM_EXIT: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^error: .*is not live on npm after 0 s \(1 attempt/m);
  });

  it.each([
    [[]],
    [['0.3.0', '--timeout-minutes', '1', '--interval-seconds', '1']],
    [['v1.2', '--timeout-minutes', '1', '--interval-seconds', '1']],
    [[tag, '--interval-seconds', '1']],
    [[tag, '--timeout-minutes', '1']],
    [[tag, '--timeout-minutes', '-1', '--interval-seconds', '1']],
    [[tag, '--timeout-minutes', '1', '--interval-seconds', '0']],
    [[tag, '--timeout-minutes', 'x', '--interval-seconds', '1']],
    [[tag, '--timeout-minutes', '1', '--interval-seconds', '1', '--bogus']],
  ])('exits 2 on a usage error: %j', (args) => {
    const result = run(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^error: /);
  });

  it('exits 2 when the tag names another version than package.json’s (the gate checked it; a mismatch is a misuse)', () => {
    const result = run(['v999.0.0', '--timeout-minutes', '0', '--interval-seconds', '1']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(pkg.version);
  });
});
