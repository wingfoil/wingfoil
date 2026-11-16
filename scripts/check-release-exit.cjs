#!/usr/bin/env node
/**
 * task-359 (`dl-166` Q2 (ii), approver ruling D3; `dl-132` element 4 and its note of 2026-10-12) — the command
 * `vision-change.schedule`'s second post-check `change-proposal.assigned` runs (`.wingfoil/workflows/bindings.yaml`,
 * on `{element.path}`, `spec-003` Layer 3 as amended): the change-proposal at `<path>` leaves `schedule` only once it
 * is assigned to a release, as the sequencer and the release element both record.
 *
 * - **The stamp.** The change-proposal's `release` is not empty.
 * - **The release element.** Exactly one file matching `memory.yaml`'s `release.path` (each placeholder matched within
 *   its path segment) has `type: release` and a `version` equal to that `release`.
 * - **The sequencer row.** For each feature id of the change-proposal — its `feature` split on commas and whitespace,
 *   or a YAML list — the first Markdown table row of `docs/01_vision/07_sequencer.md` whose first cell (`*` removed,
 *   trimmed) equals the release names the id as a whole token (not preceded by a letter, a digit or `.`, not followed
 *   by a letter, a digit or `.<digit>`: `P4.22` is not in a row naming only `P4.221`).
 * - **The release's `features:`.** When the release's `status` is not `draft`, its `features:` holds each id: on a
 *   release past `draft` the approver's `memory amend` of the release writes them (`dl-132` note of 2026-10-12).
 * - An empty `feature` (a `kind: vision` change) checks only the stamp and the release element.
 *
 * Usage: node scripts/check-release-exit.cjs <path>   (relative to the working directory, the repository root;
 * confined to it)
 * Exit: 0 assigned, stdout and stderr empty · 1 not assigned, one stdout line per failure, in this order:
 * `<path>: release is empty` | `<path>: no release element has version <v>` (each alone), else
 * `<path>: docs/01_vision/07_sequencer.md has no row for <v>` (once, first, and then no per-id row line), then per id
 * in declared order `<path>: <id> is not in the <v> row of docs/01_vision/07_sequencer.md` and
 * `<path>: <id> is not in <release path>'s features: (status <s>)` · 2 the check could not run, stdout empty and one
 * stderr line `check-release-exit: <reason>` (the usage line, a path outside the repository, a missing file, a file
 * that is not a change-proposal, several release elements of one version, a missing or unreadable
 * `.wingfoil/memory.yaml` or sequencer), as `spec-003` Layer 3's exit table states.
 * Deterministic: ids in declared order, directories walked sorted; no clock, no network. Read-only.
 */
'use strict';

const { existsSync, readFileSync, readdirSync, realpathSync, statSync } = require('node:fs');
const { isAbsolute, join, relative, resolve, sep } = require('node:path');

const yaml = require('js-yaml');

const MEMORY_YAML = '.wingfoil/memory.yaml';
const SEQUENCER = 'docs/01_vision/07_sequencer.md';
const USAGE = 'usage: node scripts/check-release-exit.cjs <path>';

/** A failure that stops the check with exit 2. */
class UsageError extends Error {}

/** The frontmatter of `markdown` as an object, or `null` when it has none or it does not parse to a mapping. */
function readFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (match === null) return null;
  try {
    const parsed = yaml.load(match[1]);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** `path` resolved against `root`, refused unless it names an existing file inside it (symbolic links followed). */
function confinedFile(root, path) {
  const realRoot = realpathSync(root);
  const absolute = resolve(realRoot, path);
  const inside = (candidate) => {
    const rel = relative(realRoot, candidate);
    return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
  };
  if (!inside(absolute)) throw new UsageError(`${path}: outside the repository`);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new UsageError(`${path}: no such file`);
  if (!inside(realpathSync(absolute))) throw new UsageError(`${path}: outside the repository`);
  return absolute;
}

/** The text of the repository file `path` (relative to `root`), or a refusal naming it. */
function readRepositoryFile(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new UsageError(`${path}: no such file`);
  return readFileSync(absolute, 'utf-8');
}

/** `memory.yaml`'s `release.path` pattern. */
function releasePathPattern(root) {
  let parsed;
  try {
    parsed = yaml.load(readRepositoryFile(root, MEMORY_YAML));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`${MEMORY_YAML}: does not parse (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
  }
  const types = parsed !== null && typeof parsed === 'object' ? parsed.types : undefined;
  const release = types !== null && typeof types === 'object' ? types.release : undefined;
  const pattern = release !== null && typeof release === 'object' ? release.path : undefined;
  if (typeof pattern !== 'string' || pattern.trim() === '') throw new UsageError(`${MEMORY_YAML}: declares no release.path`);
  return pattern;
}

/** A path segment of a `memory.yaml` pattern as a regular expression: each `{placeholder}` matches within the segment. */
function segmentRegExp(segment) {
  const source = segment
    .split(/(\{[^}]+\})/)
    .map((part) => (/^\{[^}]+\}$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${source}$`);
}

/** The repository-relative files matching `pattern` (segment by segment, directories walked sorted). */
function filesMatching(root, pattern) {
  const segments = pattern.split('/').filter((segment) => segment !== '');
  let candidates = [''];
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    const literal = !segment.includes('{');
    const regexp = segmentRegExp(segment);
    const next = [];
    for (const directory of candidates) {
      const absolute = join(root, directory);
      if (!existsSync(absolute) || !statSync(absolute).isDirectory()) continue;
      const names = literal ? [segment] : readdirSync(absolute).sort();
      for (const name of names) {
        if (!regexp.test(name)) continue;
        const path = directory === '' ? name : `${directory}/${name}`;
        const full = join(root, path);
        if (!existsSync(full)) continue;
        const isFile = statSync(full).isFile();
        if (last ? isFile : !isFile) next.push(path);
      }
    }
    candidates = next;
  });
  return candidates;
}

/** The release element of `version`: `{ path, frontmatter }`, `null` when none, a refusal when several. */
function releaseElement(root, version) {
  const found = [];
  for (const path of filesMatching(root, releasePathPattern(root))) {
    const frontmatter = readFrontmatter(readFileSync(join(root, path), 'utf-8'));
    if (frontmatter !== null && frontmatter.type === 'release' && String(frontmatter.version ?? '') === version) {
      found.push({ path, frontmatter });
    }
  }
  if (found.length > 1) throw new UsageError(`release ${version}: ${found.length} release elements`);
  return found.length === 1 ? found[0] : null;
}

/** A field holding ids — a YAML list, or a string split on commas and whitespace — as a list of non-empty ids. */
function idList(field) {
  if (field === undefined || field === null) return [];
  const items = Array.isArray(field) ? field.map((item) => String(item ?? '')) : String(field).split(/[\s,]+/);
  return items.map((item) => item.trim()).filter((item) => item !== '');
}

/** The first Markdown table row of `markdown` whose first cell (`*` removed, trimmed) is `version`, or `null`. */
function sequencerRow(markdown, version) {
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const first = trimmed.slice(1).split('|')[0];
    if (first !== undefined && first.replace(/\*/g, '').trim() === version) return trimmed;
  }
  return null;
}

/** `true` when `text` names `id` as a whole token (see the module doc). */
function namesId(text, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9.])${escaped}(?![A-Za-z0-9]|\\.\\d)`).test(text);
}

/**
 * The failures of the change-proposal at `path` (relative to `root`), one line each, in the order of the module doc.
 * Throws a {@link UsageError} for anything that stops the check.
 * @param {string} root
 * @param {string} path
 * @returns {string[]}
 */
function releaseExitFailures(root, path) {
  const frontmatter = readFrontmatter(readFileSync(confinedFile(root, path), 'utf-8'));
  if (frontmatter === null || frontmatter.type !== 'change-proposal') throw new UsageError(`${path}: not a change-proposal`);
  const version = String(frontmatter.release ?? '').trim();
  if (version === '') return [`${path}: release is empty`];
  const release = releaseElement(root, version);
  if (release === null) return [`${path}: no release element has version ${version}`];
  const ids = idList(frontmatter.feature);
  if (ids.length === 0) return [];

  const failures = [];
  const row = sequencerRow(readRepositoryFile(root, SEQUENCER), version);
  if (row === null) failures.push(`${path}: ${SEQUENCER} has no row for ${version}`);
  const status = String(release.frontmatter.status ?? '');
  const features = idList(release.frontmatter.features);
  for (const id of ids) {
    if (row !== null && !namesId(row, id)) failures.push(`${path}: ${id} is not in the ${version} row of ${SEQUENCER}`);
    if (status !== 'draft' && !features.includes(id)) {
      failures.push(`${path}: ${id} is not in ${release.path}'s features: (status ${status})`);
    }
  }
  return failures;
}

/** The command line: exit 0, 1 or 2 (above). */
function main(argv) {
  try {
    if (argv.length !== 1) throw new UsageError(USAGE);
    const failures = releaseExitFailures(process.cwd(), argv[0]);
    for (const failure of failures) process.stdout.write(`${failure}\n`);
    return failures.length === 0 ? 0 : 1;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`check-release-exit: ${error.message}\n`);
    return 2;
  }
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`check-release-exit: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
