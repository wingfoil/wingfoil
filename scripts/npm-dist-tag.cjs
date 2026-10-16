#!/usr/bin/env node
/**
 * task-266 (`dl-159` Decision 6, Actions A1.2 and A1.4; approver rulings D1–D4, 2026-10-16) — the npm dist-tag a
 * release version receives: `latest` only when the version is above every published version, otherwise
 * `latest-X.Y` of its own line, so a `0.3.1` published after `0.4.0` never takes `latest` from it.
 *
 * `publish.yml`'s `promote` passes the result to `npm stage publish` with an explicit `--tag`. An explicit tag
 * switches npm's own guard off ("Cannot implicitly apply the "latest" tag …" is thrown only when no tag is given,
 * npm 11.19.0 `lib/commands/publish.js`), so this script is the only guard; the staged tag is the one the version
 * gets when the approver approves it (`npm-stage.md`, *Tag Behavior*: "an immutable property of the staged
 * package"). `pages.yml` deploys the site only when the tag's version gets `latest`.
 *
 * Comparison is numeric over X.Y.Z. Published prereleases are ignored when finding the highest version, as npm's
 * own guard ignores them (ruling D4 (a)); deprecated versions count (`npm view … versions` does not mark them).
 * Requires nothing: `promote` runs no `npm ci`.
 *
 * Usage: node scripts/npm-dist-tag.cjs <vX.Y.Z> --published <json> [--allow-published]
 *        <json> is `npm view wingfoil versions --json`; `--allow-published` drops the version itself from it first
 *        (pages: a re-run after the version went live). promote never passes it.
 * Exit:  0 the dist-tag on stdout, the reason on stderr · 1 refused (one line on stderr) · 2 usage error
 */
'use strict';

const RELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PRERELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
const USAGE = 'usage: node scripts/npm-dist-tag.cjs <vX.Y.Z> --published <json> [--allow-published]';

/**
 * The three numeric fields of an `X.Y.Z` release.
 *
 * @param {string} version
 * @returns {number[]}
 */
function fields(version) {
  return version.split('.').map(Number);
}

/**
 * `< 0`, `0`, `> 0` as `a` is below, equal to, above `b`; both are `X.Y.Z` releases.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareReleases(a, b) {
  const [x, y] = [fields(a), fields(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

/**
 * Pure: the dist-tag `version` (`X.Y.Z`) receives given the `published` versions.
 *
 * @param {string} version
 * @param {readonly string[]} published
 * @returns {{ ok: true, distTag: string, message: string } | { ok: false, message: string }}
 */
function distTagFor(version, published) {
  if (!RELEASE.test(version)) {
    if (PRERELEASE.test(version)) {
      return { ok: false, message: `${version} is a prerelease: only X.Y.Z versions are promoted (spec-015 §4)` };
    }
    return { ok: false, message: `${version} is not a version of the form X.Y.Z` };
  }
  const malformed = published.find((entry) => typeof entry !== 'string' || !SEMVER.test(entry));
  if (malformed !== undefined) {
    return { ok: false, message: `published version ${malformed} is not a semantic version` };
  }
  if (published.includes(version)) {
    return { ok: false, message: `${version} is already published; npm accepts a version once` };
  }
  const releases = published.filter((entry) => RELEASE.test(entry));
  const highest = releases.reduce((top, entry) => (top === null || compareReleases(entry, top) > 0 ? entry : top), null);
  if (highest === null) {
    const none = published.length === 0 ? 'none published' : 'only prereleases published';
    return { ok: true, distTag: 'latest', message: `${version} is above every published version (${none}): dist-tag latest (dl-159)` };
  }
  if (compareReleases(version, highest) > 0) {
    return { ok: true, distTag: 'latest', message: `${version} is above every published version (highest ${highest}): dist-tag latest (dl-159)` };
  }
  const [major, minor] = fields(version);
  const distTag = `latest-${major}.${minor}`;
  return { ok: true, distTag, message: `${version} is below the highest published version ${highest}: dist-tag ${distTag} (dl-159)` };
}

/**
 * `npm view <name> versions --json` output → the versions; a lone JSON string (one-version package) is one entry.
 *
 * @param {string} json
 * @returns {{ ok: true, versions: string[] } | { ok: false, message: string }}
 */
function parsePublishedVersions(json) {
  let value;
  try {
    value = JSON.parse(json);
  } catch (error) {
    return { ok: false, message: `could not read the published versions: ${/** @type {Error} */ (error).message}` };
  }
  if (typeof value === 'string') return { ok: true, versions: [value] };
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return { ok: true, versions: [...value] };
  }
  return { ok: false, message: 'the published versions are not a JSON array of strings' };
}

/**
 * The command line: `{ code, stdout, stderr }` for `argv` (without node and the script).
 *
 * @param {readonly string[]} argv
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function run(argv) {
  let tag;
  let json;
  let allowPublished = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--published') {
      if (i + 1 >= argv.length) return { code: 2, stdout: '', stderr: `${USAGE}\n` };
      json = argv[i + 1];
      i += 1;
    } else if (arg === '--allow-published') {
      allowPublished = true;
    } else if (arg.startsWith('--') || tag !== undefined) {
      return { code: 2, stdout: '', stderr: `${USAGE}\n` };
    } else {
      tag = arg;
    }
  }
  if (tag === undefined || json === undefined) return { code: 2, stdout: '', stderr: `${USAGE}\n` };
  if (!tag.startsWith('v')) return { code: 1, stdout: '', stderr: `tag ${tag} is not of the form vX.Y.Z (spec-015 §4)\n` };
  const version = tag.slice(1);
  const parsed = parsePublishedVersions(json);
  if (!parsed.ok) return { code: 1, stdout: '', stderr: `${parsed.message}\n` };
  const published = allowPublished ? parsed.versions.filter((entry) => entry !== version) : parsed.versions;
  const decision = distTagFor(version, published);
  if (!decision.ok) return { code: 1, stdout: '', stderr: `${decision.message}\n` };
  return { code: 0, stdout: `${decision.distTag}\n`, stderr: `${decision.message}\n` };
}

if (require.main === module) {
  const result = run(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}

module.exports = { distTagFor, parsePublishedVersions };
