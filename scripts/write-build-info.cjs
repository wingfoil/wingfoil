#!/usr/bin/env node
/**
 * task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin — write `dist/build-info.json`, the
 * build record `dl-111-tool-signature-in-commits` Q2 (a) ratified: `{ "version", "commit" }`.
 *
 * Run by `package.json`'s `build` script, after `tsc`, and nowhere else. Not `prepack`: the release
 * pipeline packs with `npm pack --ignore-scripts` (`.github/workflows/publish.yml`), so a `prepack`
 * step never runs there, while `prepublishOnly` runs `npm run build`. The record lands inside `dist/`
 * because the package ships only `dist/` and `README.md` (`package.json` `files`): whatever the
 * installed tool is to know about its own build must be in there.
 *
 * - `version` — `package.json`'s `version`.
 * - `commit` — `git rev-parse HEAD` of the tree being built, with `-dirty` appended when
 *   `git status --porcelain` lists a change under one of the {@link BUILD_INPUTS} (a modified, staged
 *   or untracked file): `-dirty` means "this `dist/` does not match the sha" (approver ruling D4 (c),
 *   2026-10-05), so a change to the documentation, the Memory or a stray note does not set it.
 *   `unknown` when git cannot answer — no repository, no commit, no git — and the record is still
 *   written, so a stale one from an earlier build never survives.
 *
 * Deterministic (REQ-SYS-07): no timestamp and no host detail, and a fixed key order, so two builds
 * of one clean commit write byte-identical files (`test/cli/build-info.test.ts`). The runtime reader
 * is `readBuildStamp` (`src/storage/build-stamp.ts`), which turns the record into the
 * `WingFoil-Version: <semver> (<sha>)` trailer `commitPaths` appends and the line `--version` prints.
 *
 * Usage: node scripts/write-build-info.cjs [--root <dir>]
 *   --root  the package to stamp (default: this script's package); writes <root>/dist/build-info.json
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

/** The commit value of a build git could not describe. */
const UNKNOWN_COMMIT = 'unknown';

/**
 * The paths whose content decides what `dist/` contains, as git pathspecs relative to the package
 * root: the sources `tsc` compiles, the manifest and lockfile that fix the version and the compiler,
 * the compiler configurations, and this writer. A change git lists under any of them — tracked or
 * untracked — makes the build `-dirty`; a change anywhere else does not (approver ruling D4 (c)).
 * Sorted, so the git invocation is the same on every run (REQ-SYS-07). Untracked files are asked for
 * explicitly (`--untracked-files=all`), so `status.showUntrackedFiles=no` in a git config cannot hide
 * one (task-192 re-review).
 */
const BUILD_INPUTS = Object.freeze(['package-lock.json', 'package.json', 'scripts/write-build-info.cjs', 'src', 'tsconfig*.json']);

/**
 * Run git in `root` and return its stdout, or `null` when it cannot answer (not spawnable, non-zero
 * exit). stderr is captured, never inherited: "not a git repository" is an answer here, not noise.
 *
 * @param {string} root
 * @param {readonly string[]} args
 * @returns {string | null}
 */
function gitAnswer(root, args) {
  // `GIT_LITERAL_PATHSPECS=0`: an operator's `GIT_LITERAL_PATHSPECS=1` would turn `tsconfig*.json`
  // into a literal name that matches nothing (task-192 re-review).
  const run = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, GIT_LITERAL_PATHSPECS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return run.error === undefined && run.status === 0 ? run.stdout : null;
}

/**
 * The build record for the package at `root`.
 *
 * @param {string} root
 * @returns {{ version: string, commit: string }}
 */
function computeBuildInfo(root) {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  const head = gitAnswer(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  const status = head === null ? null : gitAnswer(root, ['status', '--porcelain', '--untracked-files=all', '--', ...BUILD_INPUTS]);
  if (head === null || status === null) return { version, commit: UNKNOWN_COMMIT };
  const sha = head.trim();
  return { version, commit: status.trim().length > 0 ? `${sha}-dirty` : sha };
}

/**
 * The record's bytes: two-space JSON, keys in the order above, one trailing newline.
 *
 * @param {{ version: string, commit: string }} info
 * @returns {string}
 */
function serializeBuildInfo(info) {
  return `${JSON.stringify({ version: info.version, commit: info.commit }, null, 2)}\n`;
}

/**
 * Compute the record for `root` and write it to `<root>/dist/build-info.json`.
 *
 * @param {string} root
 * @returns {{ version: string, commit: string }}
 */
function writeBuildInfo(root) {
  // Read the tree BEFORE writing: the record itself is in the ignored `dist/`, but nothing else may
  // be created first that git could count against the tree.
  const info = computeBuildInfo(root);
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'build-info.json'), serializeBuildInfo(info), 'utf-8');
  return info;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  const root = rootIndex !== -1 && args[rootIndex + 1] ? args[rootIndex + 1] : join(__dirname, '..');
  writeBuildInfo(root);
}

module.exports = { BUILD_INPUTS, UNKNOWN_COMMIT, computeBuildInfo, serializeBuildInfo, writeBuildInfo };
