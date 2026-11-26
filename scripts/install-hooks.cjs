#!/usr/bin/env node
/**
 * The contributor setup of this repository's git hooks (`dl-190` item 2 (a), `git-conventions` §9, task-366 D6 (a)):
 * `npm run setup:hooks`, run once per clone, makes git run `.githooks/pre-push` — the governance check before every
 * push — by setting `core.hooksPath` to `.githooks` in the clone's local configuration (a worktree shares it).
 *
 * - Nothing set and no hook the clone already runs: `git config --local core.hooksPath .githooks`, exit 0, one line.
 * - Already `.githooks`: exit 0, it says so, the configuration untouched.
 * - Another `core.hooksPath`, or a hook in the clone's hooks directory (a file not ending `.sample`) that would stop
 *   running once `core.hooksPath` is set: exit 1, naming it, the configuration untouched. There is no `--force`: the
 *   contributor decides what to do with their own hooks.
 * - Outside a git work tree, or git failing: exit 2.
 *
 * Not a `prepare` script (D6 (b) not taken): `npm ci` in CI, a gate or a task worktree never writes the clone's
 * configuration.
 *
 * Usage: node scripts/install-hooks.cjs (from inside the clone)
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');

const HOOKS_PATH = '.githooks';

/** Run git in `cwd`; returns `{ status, stdout, stderr }`. */
function git(cwd, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf-8', env: process.env });
  if (run.error) throw run.error;
  return { status: run.status, stdout: run.stdout.trim(), stderr: run.stderr.trim() };
}

/** The hooks the clone runs today: the files of its hooks directory that are not `.sample` files, sorted. */
function activeHooks(cwd) {
  const where = git(cwd, ['rev-parse', '--git-path', 'hooks']);
  if (where.status !== 0) throw new Error(where.stderr || 'git rev-parse --git-path hooks failed');
  const dir = resolve(cwd, where.stdout);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.endsWith('.sample') && statSync(join(dir, name)).isFile())
    .sort()
    .map((name) => join(dir, name));
}

function main(cwd) {
  try {
    const inside = git(cwd, ['rev-parse', '--is-inside-work-tree']);
    if (inside.status !== 0 || inside.stdout !== 'true') {
      process.stderr.write(`error: ${cwd} is not inside a git work tree: run npm run setup:hooks from a clone of the repository\n`);
      return 2;
    }
    const current = git(cwd, ['config', '--get', 'core.hooksPath']);
    if (current.status === 0) {
      if (current.stdout === HOOKS_PATH) {
        process.stdout.write(`core.hooksPath is already ${HOOKS_PATH}: .githooks/pre-push runs the governance check before every push\n`);
        return 0;
      }
      process.stderr.write(
        `core.hooksPath is ${current.stdout}, not ${HOOKS_PATH}: the hooks there run instead of .githooks/pre-push; ` +
          `nothing changed (git-conventions §9 requires the pre-push hook: set it yourself, keeping what you need)\n`,
      );
      return 1;
    }
    if (current.status !== 1) {
      process.stderr.write(`error: git config --get core.hooksPath failed: ${current.stderr}\n`);
      return 2;
    }
    const hooks = activeHooks(cwd);
    if (hooks.length > 0) {
      process.stderr.write(
        `${hooks.join(', ')} would stop running once core.hooksPath is set: nothing changed ` +
          `(move ${hooks.length === 1 ? 'it' : 'them'} into ${HOOKS_PATH}/ or remove ${hooks.length === 1 ? 'it' : 'them'}, then run npm run setup:hooks again)\n`,
      );
      return 1;
    }
    const set = git(cwd, ['config', '--local', 'core.hooksPath', HOOKS_PATH]);
    if (set.status !== 0) {
      process.stderr.write(`error: git config --local core.hooksPath ${HOOKS_PATH} failed: ${set.stderr}\n`);
      return 2;
    }
    process.stdout.write(`core.hooksPath set to ${HOOKS_PATH}: .githooks/pre-push runs the governance check before every push (git-conventions §9)\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}\n`);
    return 2;
  }
}

if (require.main === module) {
  process.exitCode = main(process.cwd());
}
