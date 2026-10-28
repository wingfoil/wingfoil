#!/usr/bin/env node
/**
 * task-229 (`dl-130` step 1, `adr-011`; planning ruling R20, Q3) — wait, with a bounded poll, until the npm
 * registry serves one exact version of this package.
 *
 * Since `adr-011`, `publish.yml`'s `promote` only STAGES a version: it goes live when the approver approves it
 * on npm with 2FA. The `release` job runs this before creating the GitHub Release, so a Release never
 * announces a version a user cannot install (`bug-135`). It asks for the EXACT version —
 * `npm view <name>@<version> version`, never `@latest`, which a `latest-X.Y` publish does not move (dl-159) —
 * and succeeds only when npm answers that version. After the declared timeout it fails with a readable message;
 * the recovery is to re-run the failed job once the version is live (the header runbook of `publish.yml`).
 * `task-238`'s `mcp-registry` job needs the same wait.
 *
 * task-306 (`bug-433`): npm lists a version minutes before its registry serves the tarball, so a listed version is
 * not yet installable. The script asks `npm view <name>@<version> version dist.tarball --json`, and the version is
 * live only once npm answers that exact version and the tarball URL it names answers HTTP 200 to a `HEAD` request
 * (each request bounded by TARBALL_TIMEOUT_MS). Any other tarball answer is "not live yet", bounded by the deadline.
 *
 * It fails at once when npm cannot be run, or answers E401/E403; every other non-answer (E404 — the staged,
 * unapproved version —, empty or unparsable output, a network error, a call killed after NPM_VIEW_TIMEOUT_MS, a
 * tarball answering anything but 200) is "not live yet".
 *
 * Usage: node scripts/wait-npm-version.cjs <vX.Y.Z> --timeout-minutes <n ≥ 0> --interval-seconds <n ≥ 1>
 *        (CI passes "$GITHUB_REF_NAME"; the tag must name package.json's version, as the gate asserted)
 * Exit:  0 live · 1 not live when the timeout passed · 2 usage error
 */
'use strict';

const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const RELEASE_TAG = /^v((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$/;

/**
 * The bound of one `npm view` call (task-229 review F3). A call still running after it is killed and counts as
 * "not live yet", so a hung npm ends with this script's own message at its deadline instead of the job's
 * `timeout-minutes`.
 */
const NPM_VIEW_TIMEOUT_MS = 60_000;

/**
 * The bound of one tarball request (task-306, `bug-433`). A request still unanswered after it is aborted and counts
 * as "not live yet".
 */
const TARBALL_TIMEOUT_MS = 30_000;

/**
 * npm error codes that waiting cannot cure: authentication (E401) and permission (E403). A version still in npm's
 * stage queue answers E404; network codes (ETIMEDOUT, ECONNRESET, EAI_AGAIN, …) and E5xx are transient.
 */
const PERMANENT_CODES = new Set(['E401', 'E403']);

/** @param {string} stderr @returns {string | undefined} the code of `npm error code X` / `npm ERR! code X` */
function npmErrorCode(stderr) {
  const match = /^npm (?:error|ERR!) code (\S+)/m.exec(stderr);
  return match === null ? undefined : match[1];
}

/**
 * The `npm` arguments that ask the registry for one exact version and its tarball URL, as JSON (task-306).
 *
 * @param {string} name
 * @param {string} version
 * @returns {string[]}
 */
function npmViewArgs(name, version) {
  return ['view', `${name}@${version}`, 'version', 'dist.tarball', '--json'];
}

/**
 * The tarball URL of `version` when npm's JSON answer lists exactly that version with a non-empty `dist.tarball`.
 *
 * @param {string} stdout `npm view <spec> version dist.tarball --json`'s output
 * @param {string} version the version awaited
 * @returns {string | undefined}
 */
function listedTarball(stdout, version) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const tarball = parsed['dist.tarball'];
  if (parsed.version !== version || typeof tarball !== 'string' || tarball === '') return undefined;
  return tarball;
}

/**
 * Ask whether `url` is served: one `HEAD` request, following redirects, aborted after `options.timeoutMs`.
 *
 * @param {string} url
 * @param {{ timeoutMs: number }} options
 * @returns {Promise<{ status: number | null, timedOut?: boolean, error?: string }>}
 */
async function probeTarball(url, options) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: globalThis.AbortSignal.timeout(options.timeoutMs) });
    return { status: response.status };
  } catch (error) {
    // Read by shape, not `instanceof`: fetch's errors may come from another realm (a DOMException, a test VM).
    const { name, message, cause } = /** @type {{ name?: unknown, message?: unknown, cause?: { message?: unknown } }} */ (
      error !== null && typeof error === 'object' ? error : {}
    );
    if (name === 'TimeoutError' || name === 'AbortError') return { status: null, timedOut: true };
    const text = typeof message === 'string' ? message : String(error);
    const why = cause !== null && typeof cause === 'object' && typeof cause.message === 'string' ? `: ${cause.message}` : '';
    return { status: null, error: `${text}${why}` };
  }
}

/** @param {string} url @param {{ status: number | null, timedOut?: boolean, error?: string }} answer */
function describeTarball(url, answer) {
  if (answer.status !== null) return `npm lists it, its tarball ${url} answers HTTP ${answer.status}`;
  if (answer.timedOut === true) {
    return `npm lists it, the tarball request was killed after ${Math.round(TARBALL_TIMEOUT_MS / 1000)} s (${url})`;
  }
  return `npm lists it, the tarball request to ${url} failed: ${answer.error ?? 'no error text'}`;
}

/** @param {{ status: number | null, stdout: string, stderr: string, timedOut?: boolean }} answer */
function describeAnswer(answer) {
  const said = `${answer.stdout}\n${answer.stderr}`.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  if (answer.timedOut === true) return `npm view killed after ${Math.round(NPM_VIEW_TIMEOUT_MS / 1000)} s`;
  return `npm view exit ${answer.status}${said.length > 0 ? `: ${said[0]}` : ''}`;
}

/** @param {number} n @param {string} word */
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Poll until npm answers `version` and its tarball answers HTTP 200, at most `timeoutMs` after the first attempt.
 * The clock, the sleep, npm and the tarball probe are injected, so the poll is testable without waiting or a
 * registry.
 *
 * @param {{
 *   name: string, version: string, timeoutMs: number, intervalMs: number,
 *   view: (args: string[], options: { timeoutMs: number }) => Promise<{ status: number | null, stdout: string, stderr: string, timedOut?: boolean }>,
 *   probe: (url: string, options: { timeoutMs: number }) => Promise<{ status: number | null, timedOut?: boolean, error?: string }>,
 *   now: () => number, sleep: (ms: number) => Promise<void>, log: (line: string) => void,
 * }} options
 * @returns {Promise<{ ok: boolean, attempts: number, message: string }>}
 */
async function waitForNpmVersion(options) {
  const { name, version, timeoutMs, intervalMs, view, probe, now, sleep, log } = options;
  const spec = `${name}@${version}`;
  const start = now();
  for (let attempts = 1; ; attempts += 1) {
    const answer = await view(npmViewArgs(name, version), { timeoutMs: NPM_VIEW_TIMEOUT_MS });
    const tarball = answer.status === 0 ? listedTarball(answer.stdout, version) : undefined;
    /** @type {string} */
    let last;
    if (tarball !== undefined) {
      const served = await probe(tarball, { timeoutMs: TARBALL_TIMEOUT_MS });
      if (served.status === 200) {
        log(`attempt ${attempts}: ${spec} is live`);
        return { ok: true, attempts, message: `${spec} is live on npm (${plural(attempts, 'attempt')})` };
      }
      last = describeTarball(tarball, served);
    } else {
      last = describeAnswer(answer);
    }
    if (answer.status === null && answer.timedOut !== true) {
      return { ok: false, attempts, message: `npm could not be run: ${answer.stderr.trim() || 'no error text'}` };
    }
    const code = npmErrorCode(answer.stderr);
    if (code !== undefined && PERMANENT_CODES.has(code)) {
      return {
        ok: false,
        attempts,
        message: `npm answered ${code} for ${spec} (${describeAnswer(answer)}): an authentication or permission error, which waiting will not change`,
      };
    }
    log(`attempt ${attempts}: ${spec} not live yet (${last})`);
    const elapsed = now() - start;
    if (elapsed >= timeoutMs) {
      return {
        ok: false,
        attempts,
        message:
          `${spec} is not live on npm after ${Math.round(timeoutMs / 1000)} s (${plural(attempts, 'attempt')}). ` +
          `Last answer: ${last}. Approve the staged version on npm, then re-run this job`,
      };
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}

/**
 * Run `npm` with `args`, killing it after `timeoutMs`.
 *
 * @param {readonly string[]} args
 * @param {{ timeoutMs: number, env?: NodeJS.ProcessEnv }} options
 * @returns {Promise<{ status: number | null, stdout: string, stderr: string, timedOut: boolean }>}
 */
function npmView(args, options) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (status, extra = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr: `${stderr}${extra}`, timedOut });
    };
    const child = spawn('npm', [...args], { stdio: ['ignore', 'pipe', 'pipe'], env: options.env ?? process.env });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (status) => finish(timedOut ? null : status));
  });
}

/**
 * @param {readonly string[]} argv the arguments after the script path
 * @param {string} packageVersion package.json's version
 * @returns {{ ok: true, version: string, timeoutMs: number, intervalMs: number } | { ok: false, message: string }}
 */
function parseArgs(argv, packageVersion) {
  let tag;
  /** @type {Record<string, number | undefined>} */
  const values = { '--timeout-minutes': undefined, '--interval-seconds': undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg in values) {
      const raw = argv[i + 1];
      if (raw === undefined || !/^\d+$/.test(raw)) return { ok: false, message: `option ${arg} needs a whole number` };
      values[arg] = Number(raw);
      i += 1;
    } else if (arg.startsWith('-')) {
      return { ok: false, message: `unknown option ${arg}` };
    } else if (tag === undefined) {
      tag = arg;
    } else {
      return { ok: false, message: `unexpected argument ${arg}` };
    }
  }
  if (tag === undefined) return { ok: false, message: 'missing required argument: tag' };
  const match = RELEASE_TAG.exec(tag);
  if (match === null) return { ok: false, message: `tag ${tag} is not of the form vX.Y.Z` };
  if (match[1] !== packageVersion) {
    return { ok: false, message: `tag ${tag} does not name package.json's version ${packageVersion}` };
  }
  const timeout = values['--timeout-minutes'];
  const interval = values['--interval-seconds'];
  if (timeout === undefined) return { ok: false, message: 'missing required option --timeout-minutes' };
  if (interval === undefined) return { ok: false, message: 'missing required option --interval-seconds' };
  if (interval < 1) return { ok: false, message: 'option --interval-seconds must be at least 1' };
  return { ok: true, version: match[1], timeoutMs: timeout * 60_000, intervalMs: interval * 1000 };
}

if (require.main === module) {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  const args = parseArgs(process.argv.slice(2), pkg.version);
  if (!args.ok) {
    process.stderr.write(
      `error: ${args.message}\nhint: usage: node scripts/wait-npm-version.cjs <vX.Y.Z> --timeout-minutes <n> --interval-seconds <n>\n`,
    );
    process.exitCode = 2;
  } else {
    waitForNpmVersion({
      name: pkg.name,
      version: args.version,
      timeoutMs: args.timeoutMs,
      intervalMs: args.intervalMs,
      view: npmView,
      probe: probeTarball,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log: (line) => process.stdout.write(`${line}\n`),
    }).then((result) => {
      if (result.ok) process.stdout.write(`${result.message}\n`);
      else process.stderr.write(`error: ${result.message}\n`);
      process.exitCode = result.ok ? 0 : 1;
    });
  }
}

module.exports = { NPM_VIEW_TIMEOUT_MS, TARBALL_TIMEOUT_MS, npmView, npmViewArgs, probeTarball, waitForNpmVersion };
