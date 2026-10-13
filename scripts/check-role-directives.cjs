#!/usr/bin/env node
/**
 * task-215 (`dl-050` option 1) — the role-directives sweep: run `wingfoil directives list --role <r>` for every
 * role `dna.yaml` declares under `team.roles`, and fail on any warning the resolver reports (no directives
 * assigned, a dangling binding, a shadowed id — `spec-012` §5.1). The warnings exist because each is a silent
 * failure mode of an agent's context; this check gives them a reviewable home.
 *
 * Bound in `.wingfoil/workflows/bindings.yaml` as the check `role-directives.clean`, declared by `release-planning`'s
 * `reconcile-governance` phase as its `checks.pre` (batch ruling D1: there only, not in `dev-loop`).
 *
 * The CLI it runs is the PINNED build, `node_modules/wingfoil-released/dist/cli.js` next to this script (approver
 * ruling D-B, 2026-10-13): the build that manages this repository (`dl-095`) and serves the `{role}-session`
 * Prompts agents receive through `.mcp.json`, so its resolver is the one whose warnings matter. It needs no build.
 *
 * Roles come from the same build's `dna show --format json` (`team.roles[].name`), visited in ascending name order
 * (REQ-SYS-07); each listing's stdout payload `warnings` is what counts. The CLI's stderr is not relayed on success
 * (a pinned build prints `Warning: … unknown field(s) ignored` for fields newer than itself); it is quoted in an
 * exit-2 error. Read-only, offline, deterministic: it reads the working tree of `--root`, as `directives list` does.
 *
 * Usage: node scripts/check-role-directives.cjs [--root <dir>]   (`npm run check:role-directives`)
 * Exit:  0 no role has a warning · 1 at least one warning (each an `error: role '<r>': <warning>` line on stderr)
 *        · 2 misconfiguration (bad argument, pinned build missing, a CLI call failing, no `team.roles`)
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

/** The pinned build's entry point, relative to the repository holding this script (`dl-095`). */
const PINNED_CLI = 'node_modules/wingfoil-released/dist/cli.js';

class UsageError extends Error {}

/** @param {string[]} argv */
function parseArgs(argv) {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) throw new UsageError('--root needs a directory');
      root = resolve(value);
      i++;
    } else {
      throw new UsageError(`unknown argument '${arg}' (usage: check-role-directives.cjs [--root <dir>])`);
    }
  }
  return { root };
}

/**
 * Run one pinned-CLI command in `root` with `--format json` and return its stdout parsed as a JSON object.
 *
 * @param {string} cli
 * @param {string} root
 * @param {string[]} args
 * @returns {Record<string, unknown>}
 */
function runJson(cli, root, args) {
  // The command as the operator would type it; `--format json` is appended here, never part of `args`, so a role
  // named `json` stays in the label.
  const label = args.join(' ');
  const result = spawnSync(process.execPath, [cli, ...args, '--format', 'json'], { cwd: root, encoding: 'utf-8' });
  if (result.error !== undefined) {
    // The spawn itself failed (e.g. `--root` names no directory): no exit status to report.
    throw new UsageError(`\`${label}\` could not run: ${result.error.message}`);
  }
  const firstStderr = String(result.stderr ?? '').split('\n').find((line) => line.trim() !== '') ?? '';
  if (result.status !== 0) {
    throw new UsageError(`\`${label}\` exited ${String(result.status)}${firstStderr ? `: ${firstStderr}` : ''}`);
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to the error below
  }
  throw new UsageError(`\`${label}\` printed no JSON object${firstStderr ? ` (${firstStderr})` : ''}`);
}

/** @param {string} root */
function check(root) {
  const cli = join(__dirname, '..', PINNED_CLI);
  if (!existsSync(cli)) throw new UsageError(`the pinned build ${PINNED_CLI} is missing: run \`npm ci\``);

  const dna = runJson(cli, root, ['dna', 'show']);
  const team = /** @type {{ roles?: unknown }} */ (dna.team ?? {});
  const names = Array.isArray(team.roles)
    ? team.roles.map((r) => (r !== null && typeof r === 'object' ? /** @type {{ name?: unknown }} */ (r).name : undefined))
    : [];
  if (names.length === 0) throw new UsageError('dna.yaml declares no team.roles');
  if (names.some((n) => typeof n !== 'string' || n === '')) throw new UsageError('a dna.yaml team.roles entry has no name');
  const roles = [.../** @type {Set<string>} */ (new Set(names))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const out = [];
  const err = [];
  let failing = 0;
  for (const role of roles) {
    const listing = runJson(cli, root, ['directives', 'list', '--role', role]);
    if (!Array.isArray(listing.warnings)) {
      throw new UsageError(`\`directives list --role ${role}\` printed no warnings array`);
    }
    const warnings = listing.warnings.map(String);
    if (warnings.length === 0) {
      out.push(`${role}: ok`);
    } else {
      failing++;
      out.push(`${role}: ${warnings.length} warning(s)`);
      for (const warning of warnings) err.push(`error: role '${role}': ${warning}`);
    }
  }
  out.push(`role-directives: ${roles.length} roles checked, ${failing} with warnings`);
  return { stdout: `${out.join('\n')}\n`, stderr: err.map((line) => `${line}\n`).join(''), status: failing === 0 ? 0 : 1 };
}

function main() {
  try {
    const { root } = parseArgs(process.argv.slice(2));
    const result = check(root);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.status;
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

main();
