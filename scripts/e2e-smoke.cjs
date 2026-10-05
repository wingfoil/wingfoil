#!/usr/bin/env node
/**
 * dl-023 fresh-init + CLI end-to-end smoke — the executable form of
 * `.wingfoil/workflows/custom/e2e-smoke.yaml`, reused verbatim as spec-015 §3 stage 3.
 *
 * Black-box: it only spawns a `wingfoil` command and reads exit codes/stdout. For each supported template
 * it creates a throwaway git repository, runs `wingfoil init --template <T>`, drives the scaffolded project
 * through the CLI surface `e2e-smoke.yaml`'s `drive-cli` phase names (`dna show`, `dna set`, `memory add`,
 * `memory submit`, `paths`, `directives list`, `workflow list` — each loads and schema-validates the
 * scaffolded artefact it reads), and finally requires a clean working tree (every mutation is its own
 * commit). `memory submit` acts on the task `memory add` just created and must report the
 * `draft -> pending` edge, which is what proves the scaffolded `memory.yaml` state machine is loaded and
 * applied (task-107, bug-029).
 *
 * Deterministic: fixed step list and template order, fixed throwaway git identity, no clock or randomness
 * in what is asserted (the temp directory name is never compared).
 *
 * Usage:
 *   node scripts/e2e-smoke.cjs [--expect-version X.Y.Z]                  # drives `wingfoil` on PATH
 *   node scripts/e2e-smoke.cjs [--expect-version X.Y.Z] -- node "$PWD/dist/cli.js"
 * Every step runs inside a throwaway directory, so a script path after `--` must be absolute.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

/** Every template `wingfoil init` supports, in the order they are smoked. */
const SMOKE_TEMPLATES = Object.freeze(['Scrum', 'Kanban']);

/**
 * The per-template CLI steps, `init` first. `json: true` means stdout must parse as JSON.
 * A step can depend on an earlier one without the list becoming code: `capture: '<name>'` keeps that
 * step's parsed JSON stdout under `<name>`, a later arg `'{<name>.<field>}'` is replaced by that field
 * before spawning, and `expect: { field: value }` must match the step's own parsed JSON stdout.
 * @param {string} template
 * @returns {ReadonlyArray<{ args: readonly string[], json?: boolean, capture?: string,
 *                           expect?: Readonly<Record<string, string>> }>}
 */
function smokeSteps(template) {
  return [
    { args: ['init', '--template', template] },
    { args: ['dna', 'show', '--format', 'json'], json: true },
    { args: ['dna', 'set', 'project.name', '--value', 'WingFoil smoke'] },
    { args: ['memory', 'add', '--type', 'task', '--title', 'Smoke task', '--format', 'json'], json: true, capture: 'task' },
    {
      args: ['memory', 'submit', '{task.id}', '--format', 'json'],
      json: true,
      expect: { from: 'draft', to: 'pending' },
    },
    { args: ['paths', 'config', '--list', '--format', 'json'], json: true },
    { args: ['directives', 'list', '--format', 'json'], json: true },
    { args: ['workflow', 'list', '--format', 'json'], json: true },
  ];
}

/** Spawn a command synchronously and capture its exit code and output. */
function spawn(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf-8' });
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout ?? '',
    stderr: result.error ? String(result.error.message) : (result.stderr ?? ''),
  };
}

/**
 * A check for one spawned `wingfoil` invocation: exit 0, parseable JSON when asked, and every `expect`
 * field equal in that JSON. `parsed` carries the JSON for a later `capture`.
 */
function commandCheck(label, run, json, expect) {
  if (run.status !== 0) {
    const firstLine = run.stderr.trim().split('\n')[0] ?? '';
    return { label, ok: false, detail: `exit ${run.status ?? 'spawn-error'}: ${firstLine}` };
  }
  let parsed;
  if (json) {
    try {
      parsed = JSON.parse(run.stdout);
    } catch {
      return { label, ok: false, detail: 'stdout is not valid JSON' };
    }
  }
  const mismatches = Object.entries(expect ?? {})
    .filter(([field, value]) => parsed?.[field] !== value)
    .map(([field, value]) => `expected ${field}=${value}, got ${field}=${String(parsed?.[field])}`);
  if (mismatches.length > 0) return { label, ok: false, detail: mismatches.join('; ') };
  return { label, ok: true, detail: 'exit 0', parsed };
}

/**
 * Replace every `'{<name>.<field>}'` arg with that field of the JSON captured under `<name>`.
 * Returns the unresolvable placeholder instead when a capture or field is missing.
 */
function resolveArgs(args, captured) {
  const resolved = [];
  for (const arg of args) {
    const ref = /^\{(\w+)\.(\w+)\}$/.exec(arg);
    if (!ref) {
      resolved.push(arg);
      continue;
    }
    const value = captured.get(ref[1])?.[ref[2]];
    if (typeof value !== 'string' || value === '') return { unresolved: arg };
    resolved.push(value);
  }
  return { args: resolved };
}

/** Run the steps of one template in a fresh throwaway git repository; returns its checks. */
function smokeTemplate(template, invoke, env) {
  const checks = [];
  const repo = mkdtempSync(join(tmpdir(), 'wingfoil-smoke-'));
  try {
    const git = (args) => spawn('git', args, repo, env);
    for (const args of [
      ['init', '--quiet', '--initial-branch=main'],
      ['config', 'user.name', 'WingFoil Smoke'],
      ['config', 'user.email', 'smoke@wingfoil.invalid'],
      ['config', 'commit.gpgsign', 'false'],
    ]) {
      const check = commandCheck(`[${template}] git ${args[0]}`, git(args), false);
      if (!check.ok) return [check];
    }
    const captured = new Map();
    for (const step of smokeSteps(template)) {
      const resolved = resolveArgs(step.args, captured);
      if (resolved.unresolved !== undefined) {
        const detail = `${resolved.unresolved} not found in an earlier step's JSON output`;
        checks.push({ label: `[${template}] wingfoil ${step.args.join(' ')}`, ok: false, detail });
        return checks;
      }
      const label = `[${template}] wingfoil ${resolved.args.join(' ')}`;
      const { parsed, ...check } = commandCheck(label, invoke(resolved.args, repo), step.json, step.expect);
      checks.push(check);
      if (!check.ok) return checks;
      if (step.capture !== undefined) captured.set(step.capture, parsed);
    }
    const status = git(['status', '--porcelain']);
    const clean = status.status === 0 && status.stdout.trim() === '';
    checks.push({
      label: `[${template}] working tree clean after every mutation`,
      ok: clean,
      detail: clean ? 'clean' : status.stdout.trim() || status.stderr.trim(),
    });
    return checks;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

/**
 * Run the whole smoke. Stops at the first failing check.
 * @param {{ command: string, commandArgs?: readonly string[], env?: NodeJS.ProcessEnv,
 *           expectedVersion?: string, log?: (line: string) => void }} options
 * @returns {{ ok: boolean, checks: ReadonlyArray<{ label: string, ok: boolean, detail: string }> }}
 */
function runSmoke(options) {
  const env = options.env ?? process.env;
  const prefix = options.commandArgs ?? [];
  const log = options.log ?? (() => undefined);
  const invoke = (args, cwd) => spawn(options.command, [...prefix, ...args], cwd, env);
  const checks = [];
  const record = (check) => {
    checks.push(check);
    log(`${check.ok ? 'ok  ' : 'FAIL'} ${check.label} — ${check.detail}`);
    return check.ok;
  };
  const done = () => ({ ok: checks.every((c) => c.ok), checks });

  const help = invoke(['--help'], tmpdir());
  const helpExit = commandCheck('wingfoil --help', help, false);
  const helpUsage = help.stdout.includes('Usage: wingfoil');
  const helpCheck =
    helpExit.ok && !helpUsage ? { ...helpExit, ok: false, detail: 'stdout does not contain "Usage: wingfoil"' } : helpExit;
  if (!record(helpCheck)) return done();

  if (options.expectedVersion !== undefined) {
    const label = `wingfoil --version = ${options.expectedVersion}`;
    const run = invoke(['--version'], tmpdir());
    const actual = run.stdout.trim();
    // `--version` prints the build stamp `<semver> (<sha>)` (task-192, `dl-111` Action 3); the semver is
    // what this check pins. A bare `<semver>` is still accepted: it is what builds before 0.3 print.
    const ok = run.status === 0 && (actual === options.expectedVersion || versionOfStamp(actual) === options.expectedVersion);
    if (!record({ label, ok, detail: ok ? 'match' : `got "${actual}" (exit ${run.status})` })) return done();
  }

  for (const template of SMOKE_TEMPLATES) {
    for (const check of smokeTemplate(template, invoke, env)) {
      if (!record(check)) return done();
    }
  }
  return done();
}

/**
 * The `<semver>` of a `--version` stamp `<semver> (<sha>)`, or `null` when `stamp` has another shape.
 *
 * @param {string} stamp
 * @returns {string | null}
 */
function versionOfStamp(stamp) {
  const match = /^(\S+) \((?:[0-9a-f]{7,64}(?:-dirty)?|unknown)\)$/.exec(stamp);
  return match ? match[1] : null;
}

/** Parse `[--expect-version X] [-- command args...]`. */
function parseSmokeArgs(argv) {
  const separator = argv.indexOf('--');
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? ['wingfoil'] : argv.slice(separator + 1);
  const options = { command: command[0] ?? 'wingfoil', commandArgs: command.slice(1) };
  for (let i = 0; i < own.length; i += 1) {
    if (own[i] === '--expect-version' && own[i + 1]) {
      options.expectedVersion = own[i + 1];
      i += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${own[i]}`);
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const report = runSmoke({ ...parseSmokeArgs(process.argv.slice(2)), log: (line) => process.stdout.write(`${line}\n`) });
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { SMOKE_TEMPLATES, smokeSteps, runSmoke };
