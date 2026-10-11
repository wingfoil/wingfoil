/**
 * task-229 review fix F3 — `scripts/wait-npm-version.cjs` tells "not live yet" from a failure that waiting
 * cannot cure, and bounds every `npm view` call.
 *
 * - npm could not be run at all (`status: null`, not a timeout): fail at once.
 * - npm answered E401 or E403 (`npm error code E401` / `npm ERR! code E403`): authentication or permission,
 *   not a version still in the stage queue — fail at once, naming the code.
 * - E404 (the staged, unapproved version), empty output, a transient network code (ETIMEDOUT, ECONNRESET,
 *   EAI_AGAIN) and a call that hit its own timeout: keep polling until the deadline.
 * - Each call gets `NPM_VIEW_TIMEOUT_MS`; `npmView` kills a hanging npm and reports `timedOut: true`, so a hang
 *   ends with the script's own message, not with the job's `timeout-minutes`.
 */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { NPM_VIEW_TIMEOUT_MS, npmView, waitForNpmVersion } from '../../scripts/wait-npm-version.cjs';
import type { NpmViewAnswer } from '../../scripts/wait-npm-version.cjs';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'wait-npm-version.cjs');

interface Recorded {
  readonly args: readonly string[];
  readonly timeoutMs: number | undefined;
}

function harness(...list: NpmViewAnswer[]) {
  let t = 0;
  const slept: number[] = [];
  const calls: Recorded[] = [];
  return {
    slept,
    calls,
    options: {
      name: 'wingfoil',
      version: '0.3.0',
      timeoutMs: 30_000,
      intervalMs: 10_000,
      now: () => t,
      sleep: async (ms: number) => {
        slept.push(ms);
        t += ms;
      },
      log: () => undefined,
      view: async (args: readonly string[], options?: { readonly timeoutMs: number }) => {
        calls.push({ args, timeoutMs: options?.timeoutMs });
        return list[Math.min(calls.length - 1, list.length - 1)] as NpmViewAnswer;
      },
    },
  };
}

describe('waitForNpmVersion failure classes (task-229 F3)', () => {
  it('fails at once when npm could not be run (status null, not a timeout)', async () => {
    const h = harness({ status: null, stdout: '', stderr: 'spawn npm ENOENT' });
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(h.slept).toEqual([]);
    expect(result.message).toMatch(/npm could not be run: spawn npm ENOENT/);
  });

  it.each([
    ['npm error code E401\nnpm error 401 Unauthorized - GET https://registry.npmjs.org/wingfoil', 'E401'],
    ['npm ERR! code E403\nnpm ERR! 403 Forbidden - GET https://registry.npmjs.org/wingfoil', 'E403'],
  ])('fails at once on a permanent npm answer (%#: %s)', async (stderr, code) => {
    const h = harness({ status: 1, stdout: '', stderr });
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(h.slept).toEqual([]);
    expect(result.message).toContain(code);
    expect(result.message).toMatch(/waiting will not change/);
  });

  it.each([
    ['E404', { status: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 No match found for version 0.3.0' }],
    ['empty output', { status: 0, stdout: '', stderr: '' }],
    ['ETIMEDOUT', { status: 1, stdout: '', stderr: 'npm error code ETIMEDOUT' }],
    ['ECONNRESET', { status: 1, stdout: '', stderr: 'npm ERR! code ECONNRESET' }],
    ['EAI_AGAIN', { status: 1, stdout: '', stderr: 'npm error code EAI_AGAIN' }],
    ['a call that hit its own timeout', { status: null, stdout: '', stderr: '', timedOut: true }],
  ])('keeps polling on %s, until the deadline', async (_label, answer) => {
    const h = harness(answer as NpmViewAnswer);
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: false, attempts: 4 });
    expect(h.slept).toEqual([10_000, 10_000, 10_000]);
    expect(result.message).toMatch(/is not live on npm after 30 s/);
  });

  it('a transient answer followed by the version succeeds', async () => {
    const h = harness({ status: null, stdout: '', stderr: '', timedOut: true }, { status: 0, stdout: '0.3.0\n', stderr: '' });
    expect(await waitForNpmVersion(h.options)).toMatchObject({ ok: true, attempts: 2 });
  });

  it('passes the per-call timeout to every npm call', async () => {
    const h = harness({ status: 1, stdout: '', stderr: 'npm error code E404' });
    await waitForNpmVersion(h.options);
    expect(NPM_VIEW_TIMEOUT_MS).toBeGreaterThan(0);
    expect(NPM_VIEW_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
    expect(h.calls.length).toBe(4);
    for (const call of h.calls) expect(call.timeoutMs).toBe(NPM_VIEW_TIMEOUT_MS);
  });
});

describe('npmView (task-229 F3) — a bounded npm call', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'wf-npm-view-'));
    mkdirSync(join(work, 'bin'));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  function fake(body: string): NodeJS.ProcessEnv {
    const file = join(work, 'bin', 'npm');
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
    // The fake first, then the caller's PATH: the fake itself needs `sleep`.
    return { ...process.env, PATH: `${join(work, 'bin')}${delimiter}${process.env.PATH ?? ''}` };
  }

  // The 10 s bound is the test's own timeout, not a clock read here (one clock: `latency-budget-placement`):
  // an npmView that waited for the 30 s `sleep` instead of killing it fails the test by timing out.
  it('kills an npm that hangs past the timeout and reports timedOut', async () => {
    const env = fake('exec sleep 30');
    const answer = await npmView(['view', 'wingfoil@0.3.0', 'version'], { timeoutMs: 300, env });
    expect(answer.timedOut).toBe(true);
    expect(answer.status).toBeNull();
  }, 10_000);

  it('returns npm’s status and output when it answers in time', async () => {
    const env = fake("printf '0.3.0\\n'; exit 0");
    expect(await npmView(['view', 'wingfoil@0.3.0', 'version'], { timeoutMs: 10_000, env })).toEqual({
      status: 0,
      stdout: '0.3.0\n',
      stderr: '',
      timedOut: false,
    });
  });

  it('reports status null, not timedOut, when npm cannot be started', async () => {
    const answer = await npmView(['view', 'x@1.0.0', 'version'], { timeoutMs: 10_000, env: { ...process.env, PATH: join(work, 'bin') } });
    expect(answer.status).toBeNull();
    expect(answer.timedOut).toBe(false);
    expect(answer.stderr).toMatch(/ENOENT/);
  });
});

describe('wait-npm-version command line without npm (task-229 F3)', () => {
  it('exits 1 at once with an `error:` line when npm is not on PATH', () => {
    const empty = mkdtempSync(join(tmpdir(), 'wf-no-npm-'));
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')) as { version: string };
      const result: SpawnSyncReturns<string> = spawnSync(
        process.execPath,
        [SCRIPT, `v${pkg.version}`, '--timeout-minutes', '5', '--interval-seconds', '60'],
        { encoding: 'utf-8', env: { ...process.env, PATH: empty }, timeout: 30_000 },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^error: npm could not be run/m);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
