#!/usr/bin/env node
/**
 * spec-015 §4 — assert the pushed release tag is `vX.Y.Z` and equals `v` + package.json `version`,
 * and that `server.json` `version` and every `packages[].version` equal that same version
 * (task-115, `dl-093` point 5 option (a)): the MCP Registry listing can never name a version other
 * than the one published.
 *
 * Run by `.github/workflows/publish.yml`'s gate job before anything is built, so a hand-bumped version,
 * a mistyped tag or a `server.json` left behind stops the pipeline instead of promoting. Pure and offline.
 *
 * A second mode (task-238, `dl-057` (d) option 1) asserts that the tag is ANNOTATED, as spec-015 §4 requires:
 * `git cat-file -t refs/tags/<tag>` must print `tag`; a lightweight tag names a commit and is refused. It reads
 * the repository of the current directory — the gate runs it in its checkout, where `actions/checkout` fetched
 * `+refs/tags/*:refs/tags/*`, so the ref is the pushed one (task-238 Execution Notes, D6). It is a mode of its
 * own because the version check also runs where no tag exists (a test, a release candidate before the tag).
 *
 * Usage: node scripts/check-release-tag.cjs <tag>                (CI passes "$GITHUB_REF_NAME")
 *        node scripts/check-release-tag.cjs --annotated <tag>    (the gate's annotated-tag step)
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * The first `server.json` version that differs from `version`, as a message, or `undefined`.
 *
 * @param {{ version?: unknown, packages?: unknown } | undefined} server
 * @param {string} version
 * @returns {string | undefined}
 */
function serverJsonMismatch(server, version) {
  if (server === undefined || server === null) return 'no server.json was read (missing, or not valid JSON)';
  if (server.version !== version) {
    return `server.json version ${JSON.stringify(server.version)} does not match package.json version ${version}`;
  }
  if (!Array.isArray(server.packages) || server.packages.length === 0) {
    return 'server.json has no packages[] entry to check';
  }
  const index = server.packages.findIndex((entry) => entry === null || entry === undefined || entry.version !== version);
  if (index !== -1) {
    const found = server.packages[index] ? server.packages[index].version : undefined;
    return `server.json packages[${index}].version ${JSON.stringify(found)} does not match package.json version ${version}`;
  }
  return undefined;
}

/**
 * @param {string | undefined} tag
 * @param {string} version
 * @param {{ version?: unknown, packages?: unknown } | undefined} server
 * @returns {{ ok: boolean, message: string }}
 */
function checkReleaseTag(tag, version, server) {
  if (!tag) return { ok: false, message: 'no release tag given' };
  if (!RELEASE_TAG.test(tag)) return { ok: false, message: `tag ${tag} is not of the form vX.Y.Z (spec-015 §4)` };
  if (tag !== `v${version}`) {
    return { ok: false, message: `tag ${tag} does not match package.json version ${version} (expected v${version})` };
  }
  const mismatch = serverJsonMismatch(server, version);
  if (mismatch !== undefined) return { ok: false, message: `${mismatch} (spec-015 §4)` };
  return { ok: true, message: `tag ${tag} matches package.json version ${version}, and so do server.json and its packages` };
}

/**
 * spec-015 §4 / `dl-057` (d): the release tag must be an annotated tag — its ref names a tag object, not a
 * commit. Pure: the object type is read by {@link tagObjectType}.
 *
 * @param {string | undefined} tag
 * @param {string | undefined} objectType `git cat-file -t refs/tags/<tag>`, or `undefined` when there is no such ref
 * @returns {{ ok: boolean, message: string }}
 */
function checkAnnotatedTag(tag, objectType) {
  if (!tag) return { ok: false, message: 'no release tag given' };
  if (objectType === undefined) return { ok: false, message: `tag ${tag} not found (no refs/tags/${tag} in this checkout)` };
  if (objectType !== 'tag') {
    return {
      ok: false,
      message:
        `tag ${tag} is a lightweight tag (refs/tags/${tag} names a ${objectType}, not a tag object); ` +
        `spec-015 §4 requires an annotated tag: git tag -a ${tag} -m "release ${tag}"`,
    };
  }
  return { ok: true, message: `tag ${tag} is an annotated tag` };
}

/**
 * The object type `refs/tags/<tag>` names in the repository at `root` (`tag` for an annotated tag, `commit`
 * for a lightweight one), or `undefined` when git cannot resolve the ref.
 *
 * @param {string} root
 * @param {string} tag
 * @returns {string | undefined}
 */
function tagObjectType(root, tag) {
  try {
    return execFileSync('git', ['-C', root, 'cat-file', '-t', `refs/tags/${tag}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * The parsed `server.json` next to `package.json`, or `undefined` when it is missing or not JSON —
 * which `checkReleaseTag` then refuses, so the gate fails closed.
 *
 * @param {string} root
 */
function readServerJson(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'server.json'), 'utf-8'));
  } catch {
    return undefined;
  }
}

if (require.main === module) {
  let result;
  if (process.argv[2] === '--annotated') {
    const tag = process.argv[3];
    result = checkAnnotatedTag(tag, tag ? tagObjectType(process.cwd(), tag) : undefined);
  } else {
    const root = join(__dirname, '..');
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    result = checkReleaseTag(process.argv[2], version, readServerJson(root));
  }
  (result.ok ? process.stdout : process.stderr).write(`${result.message}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = { checkAnnotatedTag, checkReleaseTag, tagObjectType };
