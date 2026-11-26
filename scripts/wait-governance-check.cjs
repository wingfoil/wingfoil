#!/usr/bin/env node
/**
 * The wait of `release-publishing`'s `tag` step for the required governance check (`dl-190` item 2 (c), task-366
 * D8 (a)): bound in `.wingfoil/workflows/bindings.yaml` as the `tag` pre-check `governance-check-passed`.
 *
 * It derives the release's integration branch (`scripts/integration-branch.cjs`: `main` for a minor, `release/X.Y`
 * for a patch), reads the head of `refs/remotes/<remote>/<branch>` from the local tracking ref (no fetch: the branch
 * was pushed before the tag), and polls the GitHub check run named `governance` of that commit — the job branch
 * protection requires (`svc-022`) — with `gh api "repos/{owner}/{repo}/commits/<sha>/check-runs?check_name=governance"`
 * (`gh` resolves `{owner}/{repo}` from the working directory's repository), every `--interval` seconds up to
 * `--timeout`:
 *
 * - exit 0 — a `governance` run of that commit completed with `conclusion: success`;
 * - exit 1 — a run completed with another conclusion (and none is still running or succeeded), or no run completed
 *   before the timeout;
 * - exit 2 — the check could not run: a kind/version the derivation refuses, no tracking ref, `gh` missing or
 *   failing, an answer that is not the API's JSON, or bad usage.
 *
 * The wait reads the clock only to stop polling; the verdict depends on the check run alone.
 *
 * Usage: node scripts/wait-governance-check.cjs --kind <minor|patch|""> --version <vX.Y[.Z]>
 *          [--remote <name>] [--interval <seconds>] [--timeout <seconds>]
 *   --remote    the remote whose tracking ref is read (default: origin)
 *   --interval  seconds between two polls (default: 15)
 *   --timeout   seconds after which a run that has not completed is a failure (default: 1800)
 * Run from the repository's root (its working directory is the repository `gh` asks about).
 */
'use strict';

const { spawnSync } = require('node:child_process');

const { integrationBranch } = require('./integration-branch.cjs');

/** The job name of `.github/workflows/governance.yml`, the required status check (`svc-022`). */
const CHECK_NAME = 'governance';

const USAGE =
  'usage: node scripts/wait-governance-check.cjs --kind <minor|patch|""> --version <vX.Y[.Z]> [--remote <name>] [--interval <seconds>] [--timeout <seconds>]';

class UsageError extends Error {}

/** Parse the command line; throws `UsageError`. */
function parseArgs(argv) {
  const options = { remote: 'origin', interval: 15, timeout: 1800 };
  const valued = { '--kind': 'kind', '--version': 'version', '--remote': 'remote', '--interval': 'interval', '--timeout': 'timeout' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!Object.prototype.hasOwnProperty.call(valued, arg)) throw new UsageError(`unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
    options[valued[arg]] = value;
    index += 1;
  }
  if (options.version === undefined) throw new UsageError('--version is required');
  for (const key of ['interval', 'timeout']) {
    const text = String(options[key]);
    if (!/^\d+$/.test(text)) throw new UsageError(`--${key} must be a whole number of seconds, got "${text}"`);
    options[key] = Number(text);
  }
  return options;
}

/** Sleep `seconds`, synchronously. */
function sleep(seconds) {
  if (seconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

/** The full sha `refs/remotes/<remote>/<branch>` names in the working directory's repository; throws when none. */
function trackingHead(remote, branch) {
  const ref = `refs/remotes/${remote}/${branch}`;
  const run = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf-8', env: process.env });
  if (run.error) throw run.error;
  const sha = (run.stdout ?? '').trim();
  if (run.status !== 0 || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(sha)) throw new Error(`${ref} names no commit here: push ${branch} to ${remote} first`);
  return sha;
}

/** One poll: the `governance` check runs of `sha`, as `gh api` returns them; throws when `gh` cannot answer. */
function checkRuns(sha) {
  const path = `repos/{owner}/{repo}/commits/${sha}/check-runs?check_name=${CHECK_NAME}`;
  const run = spawnSync('gh', ['api', path], { encoding: 'utf-8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  if (run.error) {
    throw new Error(run.error.code === 'ENOENT' ? 'gh is not installed or not on PATH: the governance check run cannot be read' : `gh failed to start: ${run.error.message}`);
  }
  if (run.status !== 0) throw new Error(`gh api ${path} exited ${run.status}: ${(run.stderr ?? '').trim().split('\n')[0]}`);
  let body;
  try {
    body = JSON.parse(run.stdout);
  } catch {
    throw new Error(`gh api ${path} printed no JSON`);
  }
  if (body === null || typeof body !== 'object' || !Array.isArray(body.check_runs)) throw new Error(`gh api ${path} printed no check_runs list`);
  return body.check_runs.filter((entry) => entry !== null && typeof entry === 'object' && entry.name === CHECK_NAME && entry.head_sha === sha);
}

/** The verdict of one poll: `success`, `failure` (completed, none succeeded, none running) or `pending`. */
function verdictOf(runs) {
  if (runs.some((entry) => entry.status === 'completed' && entry.conclusion === 'success')) return 'success';
  if (runs.length > 0 && runs.every((entry) => entry.status === 'completed')) return 'failure';
  return 'pending';
}

function main(argv) {
  let options;
  let derived;
  try {
    options = parseArgs(argv);
    derived = integrationBranch({ kind: options.kind, version: options.version });
    if (!derived.ok) throw new UsageError(derived.message);
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    return 2;
  }
  try {
    const sha = trackingHead(options.remote, derived.branch);
    const deadline = Date.now() + options.timeout * 1000;
    for (;;) {
      const runs = checkRuns(sha);
      const verdict = verdictOf(runs);
      if (verdict === 'success') {
        process.stdout.write(`governance-check-passed: the ${CHECK_NAME} check of ${options.remote}/${derived.branch} (${sha}) passed\n`);
        return 0;
      }
      if (verdict === 'failure') {
        const conclusions = [...new Set(runs.map((entry) => String(entry.conclusion)))].sort().join(', ');
        process.stderr.write(`governance-check-passed: the ${CHECK_NAME} check of ${options.remote}/${derived.branch} (${sha}) completed with ${conclusions}: do not tag\n`);
        return 1;
      }
      if (Date.now() >= deadline) {
        process.stderr.write(
          `governance-check-passed: no completed ${CHECK_NAME} check of ${options.remote}/${derived.branch} (${sha}) after ${options.timeout} s: do not tag\n`,
        );
        return 1;
      }
      sleep(options.interval);
    }
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
