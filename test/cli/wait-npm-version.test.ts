/**
 * task-229 (`dl-130` step 1, `adr-011`; planning ruling R20, Q3) — `scripts/wait-npm-version.cjs`, the bounded
 * poll `publish.yml`'s `release` job runs before it creates the GitHub Release. `promote` only STAGES a
 * version; it goes live when the approver approves it on npm. The poll asks npm for the EXACT version
 * (`npm view <name>@<version> version`, never `@latest`, which a `latest-X.Y` publish does not move —
 * dl-159 handover) and succeeds only when npm answers that version; it gives up after a declared timeout with
 * a readable failure.
 *
 * The poll is tested with an injected clock, sleep, npm and tarball probe, so no test waits or reaches a registry;
 * the command line is driven with a fake `npm` first on PATH.
 *
 * task-306 (`bug-433`): npm is asked for the version and its tarball URL as JSON (`view <name>@<version> version
 * dist.tarball --json`), and a listed version is live only once its tarball answers HTTP 200; a success below is
 * that JSON plus a probe answering 200 (`test/cli/wait-npm-version-tarball.test.ts` pins the tarball cases).
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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

/**
 * npm 11's answer to `npm view … --json` when it fails (task-306 review R1, captured with npm 11.6.2 against an
 * in-process registry): exit 1, the error as a JSON object on stdout, and the same error as `npm error` lines on
 * stderr. E404 is the shape of a version the package does not list yet (a staged, unapproved one).
 */
const npmJsonError = (code: string, summary: string, detail: string): string =>
  `${JSON.stringify({ error: { code, summary, detail } }, null, 2)}\n`;
const E404_DETAIL = (version: string): string =>
  `The requested resource 'undefined@${version}' could not be found or you do not have permission to access it.\n\nNote that you can also install from a\ntarball, folder, http url, or git url.`;
const e404Stdout = (version: string): string => npmJsonError('E404', `No match found for version ${version}`, E404_DETAIL(version));
const e404Stderr = (version: string): string =>
  [
    'npm error code E404',
    `npm error 404 No match found for version ${version}`,
    'npm error 404',
    `npm error 404  The requested resource 'undefined@${version}' could not be found or you do not have permission to access it.`,
    'npm error 404',
    'npm error 404 Note that you can also install from a',
    'npm error 404 tarball, folder, http url, or git url.',
    'npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-10-28T21_24_25_855Z-debug-0.log',
    '',
  ].join('\n');

const NOT_FOUND: NpmViewAnswer = { status: 1, stdout: e404Stdout('0.3.0'), stderr: e404Stderr('0.3.0') };

/** What `npm view <name>@<version> version dist.tarball --json` prints on stdout for a listed version (task-306). */
const listedJson = (version: string, tarball = `https://registry.npmjs.org/wingfoil/-/wingfoil-${version}.tgz`): string =>
  `${JSON.stringify({ version, 'dist.tarball': tarball }, null, 2)}\n`;

/**
 * The fake npm's answers for a listed version: exit 0, the JSON on stdout, nothing on stderr. Declared answers of
 * the fake, like NOT_FOUND, not a helper that reports a child's run (bug-070's gate, test/lint/no-fabricated-stderr).
 */
const LISTED_030: NpmViewAnswer = { status: 0, stdout: listedJson('0.3.0'), stderr: '' };
const LISTED_031: NpmViewAnswer = { status: 0, stdout: listedJson('0.3.1'), stderr: '' };

/** A tarball probe that always answers 200 (task-306): the tarball is served once npm lists the version. */
const served = async (): Promise<{ status: number }> => ({ status: 200 });

describe('npmViewArgs (task-229) — the exact version, never a dist-tag', () => {
  it('asks for `<name>@<version> version dist.tarball --json` (task-306)', () => {
    expect(npmViewArgs('wingfoil', '0.3.0')).toEqual(['view', 'wingfoil@0.3.0', 'version', 'dist.tarball', '--json']);
  });
});

describe('waitForNpmVersion (task-229) — a bounded poll', () => {
  it('succeeds at once when npm already serves the version', async () => {
    const c = clock();
    const npm = answers(LISTED_030);
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 60_000, intervalMs: 10_000, view: npm.view, probe: served, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(c.slept).toEqual([]);
    expect(npm.calls).toEqual([['view', 'wingfoil@0.3.0', 'version', 'dist.tarball', '--json']]);
  });

  it('keeps polling, one interval apart, until npm answers the version', async () => {
    const c = clock();
    const npm = answers(NOT_FOUND, NOT_FOUND, LISTED_030);
    const lines: string[] = [];
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 60_000, intervalMs: 10_000, view: npm.view, probe: served, now: c.now, sleep: c.sleep, log: (l) => lines.push(l) });
    expect(result).toMatchObject({ ok: true, attempts: 3 });
    expect(c.slept).toEqual([10_000, 10_000]);
    expect(lines).toHaveLength(3);
    expect(result.message).toMatch(/wingfoil@0\.3\.0 is live on npm/);
  });

  it('does not take another version for the one awaited (an exit 0 that answers something else)', async () => {
    const c = clock();
    const npm = answers(LISTED_031);
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 20_000, intervalMs: 10_000, view: npm.view, probe: served, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(result.ok).toBe(false);
  });

  it('gives up after the timeout with a message naming the version, the wait and the last answer', async () => {
    const c = clock();
    const npm = answers(NOT_FOUND);
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 30_000, intervalMs: 10_000, view: npm.view, probe: served, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(4);
    expect(c.slept.reduce((a, b) => a + b, 0)).toBe(30_000);
    expect(result.message).toMatch(/wingfoil@0\.3\.0 is not live on npm after 30 s \(4 attempts\)/);
    // review R1: the last answer names npm's error code, not the `{` that opens its --json error on stdout.
    expect(result.message).toContain('E404');
    expect(result.message).not.toContain('exit 1: {');
  });

  it('never sleeps past the deadline: the last wait is shortened to it', async () => {
    const c = clock();
    const npm = answers(NOT_FOUND);
    await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 25_000, intervalMs: 10_000, view: npm.view, probe: served, now: c.now, sleep: c.sleep, log: () => undefined });
    expect(c.slept).toEqual([10_000, 10_000, 5_000]);
  });

  it('a timeout of 0 means exactly one attempt', async () => {
    const c = clock();
    const npm = answers(NOT_FOUND);
    const result = await waitForNpmVersion({ name: 'wingfoil', version: '0.3.0', timeoutMs: 0, intervalMs: 10_000, view: npm.view, probe: served, now: c.now, sleep: c.sleep, log: () => undefined });
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

  /** A fake `npm` that records its argv and answers per FAKE_NPM_STDOUT / FAKE_NPM_STDERR / FAKE_NPM_EXIT. */
  function fakeNpm(): string {
    const bin = join(work, 'bin');
    spawnSync('mkdir', ['-p', bin]);
    const file = join(bin, 'npm');
    writeFileSync(
      file,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${join(work, 'argv')}"\nprintf '%s' "$FAKE_NPM_STDOUT"\nprintf '%s' "$FAKE_NPM_STDERR" >&2\nexit "\${FAKE_NPM_EXIT:-0}"\n`,
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

  // task-306: npm lists the version with its tarball URL, an in-process server on 127.0.0.1 serves it; an async
  // spawn, since spawnSync would block the event loop the server answers on.
  it('exits 0 when npm serves the version of the tag, asking for that exact package version', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const tarball = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${pkg.name}/-/${pkg.name}-${pkg.version}.tgz`;
    try {
      const result = await new Promise<{ status: number | null; stdout: string }>((resolve) => {
        const child = spawn(process.execPath, [SCRIPT, tag, '--timeout-minutes', '0', '--interval-seconds', '1'], {
          env: { ...process.env, PATH: `${fakeNpm()}${delimiter}${process.env.PATH ?? ''}`, FAKE_NPM_STDOUT: listedJson(pkg.version, tarball) },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.on('close', (status) => resolve({ status, stdout }));
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`${pkg.name}@${pkg.version} is live on npm`);
      expect(readFileSync(join(work, 'argv'), 'utf-8')).toBe(`view ${pkg.name}@${pkg.version} version dist.tarball --json\n`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);

  it('exits 1 with an `error:` line naming E404 when the timeout passes and npm never served it (review R1: npm --json shape)', () => {
    const result = run([tag, '--timeout-minutes', '0', '--interval-seconds', '1'], {
      FAKE_NPM_EXIT: '1',
      FAKE_NPM_STDOUT: e404Stdout(pkg.version),
      FAKE_NPM_STDERR: e404Stderr(pkg.version),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^error: .*is not live on npm after 0 s \(1 attempt/m);
    expect(result.stderr).toContain('E404');
    expect(result.stderr).not.toContain('exit 1: {');
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
