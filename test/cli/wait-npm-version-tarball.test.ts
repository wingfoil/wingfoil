/**
 * task-306 AC 3 (red-first; `bug-433`) — `scripts/wait-npm-version.cjs` waits until the version's `dist.tarball`
 * answers HTTP 200, not only until `npm view` lists it: npm lists a version minutes before its registry serves the
 * tarball, so a Release, a listing or a Pages deploy announced on the listing alone points at a version
 * `npm install` cannot fetch yet.
 *
 * - `npmViewArgs` asks for the version and its tarball URL as JSON: `view <name>@<version> version dist.tarball
 *   --json`.
 * - Listed = npm exits 0 with a JSON object whose `version` is the one awaited and whose `dist.tarball` is a
 *   non-empty string; only then is the tarball probed (`probe(url, { timeoutMs: TARBALL_TIMEOUT_MS })`). Live = the
 *   probe answers 200; any other probe answer (another status, a killed request, a failure) is "not live yet",
 *   bounded by the deadline.
 * - `probeTarball(url, { timeoutMs })` sends a `HEAD` request and answers `{ status }`, `{ status: null, timedOut:
 *   true }` or `{ status: null, error }`.
 *
 * The poll runs with an injected clock, sleep, npm and probe; `probeTarball` and the command line run against an
 * in-process HTTP server on 127.0.0.1 (no network), the command line with a fake `npm` first on PATH and an async
 * `spawn`, since `spawnSync` would block the event loop the server answers on.
 */
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { TARBALL_TIMEOUT_MS, npmViewArgs, probeTarball, waitForNpmVersion } from '../../scripts/wait-npm-version.cjs';
import type { NpmViewAnswer, TarballAnswer } from '../../scripts/wait-npm-version.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'wait-npm-version.cjs');
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { name: string; version: string };

const URL_030 = 'https://registry.npmjs.org/wingfoil/-/wingfoil-0.3.0.tgz';

/** What `npm view wingfoil@<version> version dist.tarball --json` prints for a listed version (npm 11). */
function listedJson(version: string, tarball: string): string {
  return `${JSON.stringify({ version, 'dist.tarball': tarball }, null, 2)}\n`;
}

const LISTED: NpmViewAnswer = { status: 0, stdout: listedJson('0.3.0', URL_030), stderr: '' };
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

interface ProbeCall {
  readonly url: string;
  readonly options: { readonly timeoutMs: number };
}

/** A fake clock, npm and probe: npm and the probe answer in order, the last answer repeating. */
function harness(view: readonly NpmViewAnswer[], probe: readonly TarballAnswer[]) {
  let t = 0;
  const slept: number[] = [];
  const viewCalls: string[][] = [];
  const probeCalls: ProbeCall[] = [];
  return {
    slept,
    viewCalls,
    probeCalls,
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
      view: async (args: readonly string[]) => {
        viewCalls.push([...args]);
        return view[Math.min(viewCalls.length - 1, view.length - 1)] as NpmViewAnswer;
      },
      probe: async (url: string, options: { readonly timeoutMs: number }) => {
        probeCalls.push({ url, options });
        return probe[Math.min(probeCalls.length - 1, probe.length - 1)] as TarballAnswer;
      },
    },
  };
}

describe('npmViewArgs (task-306) — the version and its tarball URL, as JSON', () => {
  it('asks for `<name>@<version> version dist.tarball --json`', () => {
    expect(npmViewArgs('wingfoil', '0.3.0')).toEqual(['view', 'wingfoil@0.3.0', 'version', 'dist.tarball', '--json']);
  });
});

describe('TARBALL_TIMEOUT_MS (task-306) — each tarball request is bounded', () => {
  it('is positive and at most two minutes', () => {
    expect(TARBALL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(TARBALL_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });
});

describe('waitForNpmVersion (task-306) — listed is not live until the tarball answers HTTP 200', () => {
  it('a registry that lists the version before serving its tarball: keeps polling until the tarball answers 200', async () => {
    const h = harness([LISTED], [{ status: 404 }, { status: 404 }, { status: 200 }]);
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: true, attempts: 3 });
    expect(result.message).toMatch(/wingfoil@0\.3\.0 is live on npm \(3 attempts\)/);
    expect(h.slept).toEqual([10_000, 10_000]);
    expect(h.probeCalls).toEqual([
      { url: URL_030, options: { timeoutMs: TARBALL_TIMEOUT_MS } },
      { url: URL_030, options: { timeoutMs: TARBALL_TIMEOUT_MS } },
      { url: URL_030, options: { timeoutMs: TARBALL_TIMEOUT_MS } },
    ]);
    expect(h.viewCalls).toEqual(Array.from({ length: 3 }, () => ['view', 'wingfoil@0.3.0', 'version', 'dist.tarball', '--json']));
  });

  it('listed but never served: not ok after the deadline, the last answer naming the tarball and its HTTP status', async () => {
    const h = harness([LISTED], [{ status: 404 }]);
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: false, attempts: 4 });
    expect(h.slept).toEqual([10_000, 10_000, 10_000]);
    expect(result.message).toMatch(/wingfoil@0\.3\.0 is not live on npm after 30 s \(4 attempts\)/);
    expect(result.message).toContain(`npm lists it, its tarball ${URL_030} answers HTTP 404`);
  });

  it('not listed (E404): the tarball is never probed', async () => {
    const h = harness([NOT_FOUND], [{ status: 200 }]);
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: false, attempts: 4 });
    expect(h.probeCalls).toEqual([]);
    // review R1: the last answer names npm's error code, not the `{` that opens its --json error on stdout.
    expect(result.message).toContain('E404');
    expect(result.message).not.toContain('exit 1: {');
  });

  it.each([
    ['another version', { status: 0, stdout: listedJson('0.3.1', URL_030), stderr: '' }],
    ['no dist.tarball', { status: 0, stdout: `${JSON.stringify({ version: '0.3.0' })}\n`, stderr: '' }],
    ['an empty dist.tarball', { status: 0, stdout: listedJson('0.3.0', ''), stderr: '' }],
    ['unparsable output', { status: 0, stdout: '0.3.0\n', stderr: '' }],
  ])('npm exit 0 with %s is not listed: not live yet, the tarball never probed', async (_label, answer) => {
    const h = harness([answer as NpmViewAnswer], [{ status: 200 }]);
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: false, attempts: 4 });
    expect(h.probeCalls).toEqual([]);
    expect(result.message).toMatch(/is not live on npm after 30 s/);
  });

  it('a killed tarball request and a failed one are "not live yet": polling goes on until the tarball answers 200', async () => {
    const h = harness([LISTED], [{ status: null, timedOut: true }, { status: null, error: 'fetch failed' }, { status: 200 }]);
    expect(await waitForNpmVersion(h.options)).toMatchObject({ ok: true, attempts: 3 });
    expect(h.slept).toEqual([10_000, 10_000]);
  });

  it('a tarball request killed until the deadline: the last answer says it was killed after its bound', async () => {
    const h = harness([LISTED], [{ status: null, timedOut: true }]);
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: false, attempts: 4 });
    expect(result.message).toContain(`the tarball request was killed after ${Math.round(TARBALL_TIMEOUT_MS / 1000)} s`);
  });

  it('a tarball request failing until the deadline: the last answer names the failure', async () => {
    const h = harness([LISTED], [{ status: null, error: 'getaddrinfo EAI_AGAIN registry.npmjs.org' }]);
    const result = await waitForNpmVersion(h.options);
    expect(result).toMatchObject({ ok: false, attempts: 4 });
    expect(result.message).toContain('failed: getaddrinfo EAI_AGAIN registry.npmjs.org');
  });
});

/** An in-process tarball server on 127.0.0.1: answers `status`, or never answers when `status` is null. */
async function tarballServer(status: number | null): Promise<{ url: string; methods: string[]; close: () => Promise<void> }> {
  const methods: string[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    methods.push(req.method ?? '');
    if (status === null) return; // never answers
    res.writeHead(status, { 'content-type': 'application/octet-stream' });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/wingfoil/-/wingfoil-0.3.0.tgz`,
    methods,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe('probeTarball (task-306) — one bounded HEAD request', () => {
  it('answers { status: 200 } for a served tarball, with a HEAD request', async () => {
    const server = await tarballServer(200);
    try {
      expect(await probeTarball(server.url, { timeoutMs: 5_000 })).toMatchObject({ status: 200 });
      expect(server.methods).toEqual(['HEAD']);
    } finally {
      await server.close();
    }
  });

  it('answers { status: 404 } for a tarball not served yet', async () => {
    const server = await tarballServer(404);
    try {
      expect(await probeTarball(server.url, { timeoutMs: 5_000 })).toMatchObject({ status: 404 });
    } finally {
      await server.close();
    }
  });

  // The 10 s bound is the test's own timeout (one clock): a probe that waited for the server instead of
  // aborting at timeoutMs fails by timing out.
  it('answers { status: null, timedOut: true } when the server never answers within timeoutMs', async () => {
    const server = await tarballServer(null);
    try {
      expect(await probeTarball(server.url, { timeoutMs: 300 })).toMatchObject({ status: null, timedOut: true });
    } finally {
      await server.close();
    }
  }, 10_000);
});

describe('wait-npm-version command line (task-306) — npm lists the version, the tarball decides', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'wf-wait-tarball-'));
    mkdirSync(join(work, 'bin'));
    const file = join(work, 'bin', 'npm');
    writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${join(work, 'argv')}"\nprintf '%s' "$FAKE_NPM_STDOUT"\nexit "\${FAKE_NPM_EXIT:-0}"\n`);
    chmodSync(file, 0o755);
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  /** The script, run with an async spawn so the in-process server keeps answering. */
  function run(args: string[], env: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [SCRIPT, ...args], {
        env: { ...process.env, PATH: `${join(work, 'bin')}${delimiter}${process.env.PATH ?? ''}`, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
  }

  const tag = `v${pkg.version}`;

  it('exits 0 when npm lists the version and its tarball answers 200; npm is asked for the version and the tarball as JSON', async () => {
    const server = await tarballServer(200);
    try {
      const result = await run([tag, '--timeout-minutes', '0', '--interval-seconds', '1'], { FAKE_NPM_STDOUT: listedJson(pkg.version, server.url) });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`${pkg.name}@${pkg.version} is live on npm`);
      expect(readFileSync(join(work, 'argv'), 'utf-8')).toBe(`view ${pkg.name}@${pkg.version} version dist.tarball --json\n`);
      expect(server.methods).toEqual(['HEAD']);
    } finally {
      await server.close();
    }
  }, 30_000);

  it('exits 1 with an `error:` line naming HTTP 404 when npm lists the version but its tarball is not served', async () => {
    const server = await tarballServer(404);
    try {
      const result = await run([tag, '--timeout-minutes', '0', '--interval-seconds', '1'], { FAKE_NPM_STDOUT: listedJson(pkg.version, server.url) });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^error: .*is not live on npm after 0 s \(1 attempt/m);
      expect(result.stderr).toContain('HTTP 404');
    } finally {
      await server.close();
    }
  }, 30_000);
});
