#!/usr/bin/env node
/**
 * spec-015 §4 — assert the pushed release tag is `vX.Y.Z` and equals `v` + package.json `version`,
 * and that `server.json` `version` and every `packages[].version` equal that same version
 * (task-115, `dl-093` point 5 option (a)): the MCP Registry listing can never name a version other
 * than the one published.
 *
 * Run by `.github/workflows/publish.yml`'s gate job before anything is built, so a hand-bumped version,
 * a mistyped tag or a `server.json` left behind stops the pipeline instead of promoting. This mode is pure and
 * offline; the other two read git (`--annotated` the local checkout, `--on-line` also `origin`).
 *
 * A second mode (task-238, `dl-057` (d) option 1) asserts that the tag is ANNOTATED, as spec-015 §4 requires:
 * `git cat-file -t refs/tags/<tag>` must print `tag`; a lightweight tag names a commit and is refused. It reads
 * the repository of the current directory — the gate runs it in its checkout, where `actions/checkout` fetched
 * `+refs/tags/*:refs/tags/*`, so the ref is the pushed one (task-238 Execution Notes, D6). It is a mode of its
 * own because the version check also runs where no tag exists (a test, a release candidate before the tag).
 *
 * A third mode (task-265, `dl-159` Decision 4, Action A1.1; `dl-024` decision 2 and `dl-074` kept) asserts that
 * the tagged commit is on a line it may be released from: an ancestor of `origin/main` or of
 * `origin/release/X.Y`, `X.Y` being the tag's own major.minor, as those branches are on `origin` at run time.
 * It reads which of the two exist with `git ls-remote`, fetches only those with `--no-tags`, then runs
 * `git merge-base --is-ancestor` against each, so the message names every ref it checked. Any git failure
 * refuses (fail closed). It replaces the gate's inline "Tag commit is on main (dl-024)" step.
 *
 * Usage: node scripts/check-release-tag.cjs <tag>                    (CI passes "$GITHUB_REF_NAME")
 *        node scripts/check-release-tag.cjs --annotated <tag>        (the gate's annotated-tag step)
 *        node scripts/check-release-tag.cjs --on-line <tag> <commit> (the gate's release-line step,
 *                                                                     "$GITHUB_REF_NAME" "$GITHUB_SHA")
 */
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** A full commit id: SHA-1 (40 hex) or SHA-256 (64 hex). Checked before any git call. */
const FULL_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** The remote the gate's checkout fetches from (`actions/checkout` names it `origin`). */
const REMOTE = 'origin';

/** The citation every release-line message ends with. */
const LINE_CITATION = '(dl-024, dl-159)';

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

/**
 * task-265 (`dl-159` Decision 4, A1.1) — pure: the remote-tracking refs a release tag may sit on, in order:
 * `origin/main`, then `origin/release/X.Y` of the tag's own major.minor. One rule for every `vX.Y.Z`, `vX.Y.0`
 * included (approver ruling D4 (a), 2026-10-16).
 *
 * @param {string | undefined} tag
 * @returns {{ ok: boolean, message: string, refs: string[] }}
 */
function releaseLineRefs(tag) {
  if (!tag) return { ok: false, message: 'no release tag given', refs: [] };
  const match = RELEASE_TAG.exec(tag);
  if (match === null) return { ok: false, message: `tag ${tag} is not of the form vX.Y.Z (spec-015 §4)`, refs: [] };
  const refs = [`${REMOTE}/main`, `${REMOTE}/release/${match[1]}.${match[2]}`];
  return { ok: true, message: `tag ${tag} may sit on ${refs.join(' or ')}`, refs };
}

/**
 * The state a probe is reported with.
 *
 * @param {{ onRemote: boolean, ancestor: boolean }} probe
 */
function probeState(probe) {
  if (!probe.onRemote) return 'no such branch on origin';
  return probe.ancestor ? 'ancestor' : 'not an ancestor';
}

/**
 * task-265 — pure verdict over the probed refs, in their order: passes on the first ref that exists on `origin`
 * and holds the commit; the message names every ref checked and its state.
 *
 * @param {string} tag
 * @param {string} commit
 * @param {ReadonlyArray<{ ref: string, onRemote: boolean, ancestor: boolean }>} probes
 * @returns {{ ok: boolean, message: string }}
 */
function checkTagOnLine(tag, commit, probes) {
  const checked = probes.map((probe) => `${probe.ref} (${probeState(probe)})`).join(', ');
  const on = probes.find((probe) => probe.onRemote && probe.ancestor);
  if (on === undefined) {
    return {
      ok: false,
      message: `commit ${commit} of tag ${tag} is on none of the lines it may be released from; checked ${checked} ${LINE_CITATION}`,
    };
  }
  return { ok: true, message: `commit ${commit} of tag ${tag} is on ${on.ref}; checked ${checked} ${LINE_CITATION}` };
}

/**
 * Run git in `root` with an argument array (never a shell).
 *
 * @param {string} root
 * @param {string[]} args
 * @returns {{ status: number | null, stdout: string, cause: string }}
 */
function runGit(root, args) {
  const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  const stderr = typeof run.stderr === 'string' ? run.stderr : '';
  const firstLine = stderr.split('\n').find((line) => line.trim() !== '');
  const cause = firstLine !== undefined ? firstLine.trim() : run.error ? run.error.message : `git exited ${String(run.status)}`;
  return { status: run.status, stdout: typeof run.stdout === 'string' ? run.stdout : '', cause };
}

/**
 * task-265 — I/O, in the repository at `root`: `git ls-remote --heads origin` for the refs' branches (which
 * exist on the remote, read from the remote and never from a possibly stale tracking ref), ONE
 * `git fetch --no-tags origin` of the listed ones, then `git merge-base --is-ancestor <commit>` against each
 * listed ref, all of them, in order. A ref the remote does not list is probed `onRemote: false`. A failing
 * ls-remote or fetch, or a merge-base exit other than 0/1, is `{ ok: false }` (fail closed).
 *
 * @param {string} root
 * @param {string} commit
 * @param {readonly string[]} refs remote-tracking refs `origin/<branch>`, as {@link releaseLineRefs} returns them
 * @returns {{ ok: true, probes: { ref: string, onRemote: boolean, ancestor: boolean }[] } | { ok: false, message: string }}
 */
function probeReleaseLines(root, commit, refs) {
  const branches = refs.map((ref) => ref.slice(`${REMOTE}/`.length));
  const heads = branches.map((branch) => `refs/heads/${branch}`);
  const listed = runGit(root, ['ls-remote', '--heads', REMOTE, ...heads]);
  if (listed.status !== 0) return { ok: false, message: `could not read the release lines from origin: ${listed.cause}` };
  const present = new Set(
    listed.stdout
      .split('\n')
      .map((line) => line.split('\t')[1])
      .filter((name) => name !== undefined),
  );
  const onRemote = heads.map((head) => present.has(head));
  const refspecs = branches.filter((_, i) => onRemote[i]).map((branch) => `+refs/heads/${branch}:refs/remotes/${REMOTE}/${branch}`);
  if (refspecs.length > 0) {
    const fetched = runGit(root, ['fetch', '--quiet', '--no-tags', REMOTE, ...refspecs]);
    if (fetched.status !== 0) return { ok: false, message: `could not read the release lines from origin: ${fetched.cause}` };
  }
  const probes = [];
  for (let i = 0; i < refs.length; i += 1) {
    if (!onRemote[i]) {
      probes.push({ ref: refs[i], onRemote: false, ancestor: false });
      continue;
    }
    const tested = runGit(root, ['merge-base', '--is-ancestor', commit, `refs/remotes/${REMOTE}/${branches[i]}`]);
    if (tested.status !== 0 && tested.status !== 1) return { ok: false, message: `could not test ${refs[i]}: ${tested.cause}` };
    probes.push({ ref: refs[i], onRemote: true, ancestor: tested.status === 0 });
  }
  return { ok: true, probes };
}

/**
 * The `--on-line` mode: the tag's refs, the commit id's shape, then the probes and the verdict.
 *
 * @param {string} root
 * @param {string | undefined} tag
 * @param {string | undefined} commit
 * @returns {{ ok: boolean, message: string }}
 */
function checkReleaseLine(root, tag, commit) {
  const lines = releaseLineRefs(tag);
  if (!lines.ok) return lines;
  if (!commit) return { ok: false, message: 'no commit given' };
  if (!FULL_COMMIT.test(commit)) return { ok: false, message: `${commit} is not a full commit id` };
  const probed = probeReleaseLines(root, commit, lines.refs);
  if (!probed.ok) return probed;
  return checkTagOnLine(/** @type {string} */ (tag), commit, probed.probes);
}

if (require.main === module) {
  let result;
  if (process.argv[2] === '--on-line') {
    result = checkReleaseLine(process.cwd(), process.argv[3], process.argv[4]);
  } else if (process.argv[2] === '--annotated') {
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

module.exports = { checkAnnotatedTag, checkReleaseTag, checkTagOnLine, probeReleaseLines, releaseLineRefs, tagObjectType };
