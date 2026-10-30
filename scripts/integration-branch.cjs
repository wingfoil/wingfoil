#!/usr/bin/env node
/**
 * task-288 (`dl-159` point 4, Action A1.8; `git-conventions` §1/§3; approver rulings D1–D4) — the integration
 * branch of a release: the ONE declaration of the derivation the workflows name `integration_branch`
 * (`dev-loop.yaml`'s merges, `release-publishing.yaml`'s `tag`).
 *
 *   kind: patch, version vX.Y.Z (Z ≥ 1)          → release/X.Y
 *   kind: minor, or no kind (a pre-dl-092 release), version vX.Y → main
 *
 * Any other kind, a minor whose version is not vX.Y, or a patch whose version is not vX.Y.Z with Z ≥ 1, is refused
 * with a message naming the value (task-319, bug-387).
 * The release has no `branch` field (dl-159 A2.3, deferred): the branch is derived from the `kind` and `version`
 * every release already declares (memory.yaml `release.template.frontmatter.required`, `exempt`).
 *
 * Usage: node scripts/integration-branch.cjs [--check-head] [--kind <minor|patch|"">] --version <vX.Y[.Z]>
 *   print mode   → stdout the branch                 · exit 0, or 2 on a refused release / usage error
 *   --check-head → HEAD's branch must be that branch · exit 0 pass, 1 refusal (another branch, or detached),
 *                  2 refused release / usage error / HEAD unreadable (git cannot run, or not a repository)
 *                  (task-319, bug-386: spec-003 Layer 3's exit 2 blocks the phase without failing the gate)
 * `--check-head` is bound in .wingfoil/workflows/bindings.yaml as release-publishing's `tag` pre-check
 * `on-integration-branch`. Git runs as `git -C <cwd> …` with an argument array, never through a shell.
 */
'use strict';

const { spawnSync } = require('node:child_process');

/** A patch version: vX.Y.Z, no leading zeros, Z ≥ 1 (git-conventions §3: a patch tag has Z ≥ 1). */
const PATCH_VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.([1-9]\d*)$/;

/** A minor version: vX.Y, no leading zeros (task-319, bug-387; a minor's vX.Y.0 is its tag, not its version). */
const MINOR_VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const USAGE = 'usage: node scripts/integration-branch.cjs [--check-head] [--kind <minor|patch>] --version <vX.Y[.Z]>';

/**
 * The integration branch of a release (dl-159 point 4). Pure.
 * @param {{ kind?: string, version?: string }} release
 * @returns {{ ok: true, branch: string } | { ok: false, message: string }}
 */
function integrationBranch(release) {
  const { kind, version } = release;
  if (kind === undefined || kind === '' || kind === 'minor') {
    if (MINOR_VERSION.test(version ?? '')) return { ok: true, branch: 'main' };
    return { ok: false, message: `a minor's version must be vX.Y, got "${version ?? ''}" (dl-092, dl-159)` };
  }
  if (kind !== 'patch') return { ok: false, message: `release kind "${kind}" is neither minor nor patch (dl-092)` };
  const match = PATCH_VERSION.exec(version ?? '');
  if (match === null) {
    return { ok: false, message: `a patch's version must be vX.Y.Z with Z ≥ 1, got "${version ?? ''}" (dl-092, dl-159)` };
  }
  return { ok: true, branch: `release/${match[1]}.${match[2]}` };
}

/**
 * The verdict on the branch HEAD is on (`null` when detached) against the expected integration branch. Pure.
 * @param {string} expected
 * @param {string} version
 * @param {string | null} current
 * @returns {{ ok: boolean, message: string }}
 */
function checkHead(expected, version, current) {
  const of = `the integration branch of ${version} (dl-159)`;
  if (current === expected) return { ok: true, message: `HEAD is on ${expected}, ${of}` };
  if (current === null) return { ok: false, message: `HEAD is detached, not on ${expected}, ${of}` };
  return { ok: false, message: `HEAD is on ${current}, not on ${expected}, ${of}` };
}

/**
 * The branch HEAD is on in the repository at `root` (`git symbolic-ref --quiet --short HEAD`): `null` when
 * detached (git exit 1); a refusal when git cannot be run or exits otherwise (not a repository).
 * @param {string} root
 * @returns {{ ok: true, branch: string | null } | { ok: false, message: string }}
 */
function readHeadBranch(root) {
  const result = spawnSync('git', ['-C', root, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { encoding: 'utf-8' });
  if (result.error) return { ok: false, message: `could not read HEAD: ${result.error.message}` };
  if (result.status === 0) return { ok: true, branch: result.stdout.trim() };
  if (result.status === 1) return { ok: true, branch: null };
  const cause = (result.stderr ?? '').split('\n').find((line) => line.trim() !== '') ?? `git exited ${result.status}`;
  return { ok: false, message: `could not read HEAD: ${cause.trim()}` };
}

/**
 * The command line: `{ checkHead, kind, version }`, or `null` on a usage error.
 * @param {readonly string[]} argv
 */
function parseArgs(argv) {
  const parsed = { checkHead: false, kind: undefined, version: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check-head') parsed.checkHead = true;
    else if ((arg === '--kind' || arg === '--version') && i + 1 < argv.length) {
      parsed[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else return null;
  }
  return parsed.version === undefined ? null : parsed;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
  } else {
    const derived = integrationBranch({ kind: args.kind, version: args.version });
    if (!derived.ok) {
      process.stderr.write(`${derived.message}\n`);
      process.exitCode = 2;
    } else if (!args.checkHead) {
      process.stdout.write(`${derived.branch}\n`);
    } else {
      const head = readHeadBranch(process.cwd());
      if (!head.ok) {
        process.stderr.write(`${head.message}\n`);
        process.exitCode = 2;
      } else {
        const verdict = checkHead(derived.branch, args.version, head.branch);
        (verdict.ok ? process.stdout : process.stderr).write(`${verdict.message}\n`);
        process.exitCode = verdict.ok ? 0 : 1;
      }
    }
  }
}

module.exports = { checkHead, integrationBranch, readHeadBranch };
