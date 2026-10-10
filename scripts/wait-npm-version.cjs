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
 * The `npm` arguments that ask the registry for one exact version.
 *
 * @param {string} name
 * @param {string} version
 * @returns {string[]}
 */
function npmViewArgs(name, version) {
  return ['view', `${name}@${version}`, 'version'];
}

/** @param {{ status: number | null, stdout: string, stderr: string }} answer */
function describeAnswer(answer) {
  const said = `${answer.stdout}\n${answer.stderr}`.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  return `npm view exit ${answer.status}${said.length > 0 ? `: ${said[0]}` : ''}`;
}

/** @param {number} n @param {string} word */
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Poll until npm answers `version`, at most `timeoutMs` after the first attempt. The clock, the sleep and npm
 * are injected, so the poll is testable without waiting or a registry.
 *
 * @param {{
 *   name: string, version: string, timeoutMs: number, intervalMs: number,
 *   view: (args: string[]) => Promise<{ status: number | null, stdout: string, stderr: string }>,
 *   now: () => number, sleep: (ms: number) => Promise<void>, log: (line: string) => void,
 * }} options
 * @returns {Promise<{ ok: boolean, attempts: number, message: string }>}
 */
async function waitForNpmVersion(options) {
  const { name, version, timeoutMs, intervalMs, view, now, sleep, log } = options;
  const spec = `${name}@${version}`;
  const start = now();
  for (let attempts = 1; ; attempts += 1) {
    const answer = await view(npmViewArgs(name, version));
    if (answer.status === 0 && answer.stdout.trim() === version) {
      log(`attempt ${attempts}: ${spec} is live`);
      return { ok: true, attempts, message: `${spec} is live on npm (${plural(attempts, 'attempt')})` };
    }
    log(`attempt ${attempts}: ${spec} not live yet (${describeAnswer(answer)})`);
    const elapsed = now() - start;
    if (elapsed >= timeoutMs) {
      return {
        ok: false,
        attempts,
        message:
          `${spec} is not live on npm after ${Math.round(timeoutMs / 1000)} s (${plural(attempts, 'attempt')}). ` +
          `Last answer: ${describeAnswer(answer)}. Approve the staged version on npm, then re-run this job`,
      };
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}

/**
 * @param {string[]} args
 * @returns {Promise<{ status: number | null, stdout: string, stderr: string }>}
 */
function npmView(args) {
  return new Promise((resolve) => {
    const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => resolve({ status: null, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
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

module.exports = { npmViewArgs, waitForNpmVersion };
