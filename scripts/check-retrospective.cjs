#!/usr/bin/env node
/**
 * task-358 (`bug-320`; `dl-115` Q1 (A), Q2 (a), Action 3; approver ruling D2 (b)) — the command `dev-loop.done`'s
 * check `retrospective.present` runs (`.wingfoil/workflows/bindings.yaml`, on `{element.path}`, `spec-003` Layer 3
 * as amended): the Memory document at each `<path>` holds a `### Retrospective` subsection in its running log with an
 * entry, and so, for a `task`, does every bug of its `bug:` list whose `status` is `closed`.
 *
 * - **An entry** is at least one line of the subsection, outside HTML comments, that is not blank: `None` is an entry,
 *   the template's comment alone is not one (D2 (b)).
 * - **The running log** is a `## …Execution Notes` section: `## Execution Notes` (task, plan) or `## Triage & Execution
 *   Notes` (bug), as the templates of `.wingfoil/memory/templates/` lay it out. The last `### Retrospective` under such
 *   a section is the one read; a heading inside a fenced code block is not a heading.
 * - **A bug of `bug:`** is found under the directory of `memory.yaml`'s `bug.path`, by its full id (`<id>.md`) or by the
 *   short id the tasks of this repository carry (`bug-469` for `bug-469-<slug>.md`), as `resolveElementReference`
 *   (`src/memory/reference.ts`) resolves a reference by its prefix. Only a bug whose `status` is `closed` is checked.
 *
 * Usage: node scripts/check-retrospective.cjs <path> [<path> …]   (paths relative to the working directory, the
 * repository root; confined to it)
 * Exit: 0 every entry present, stdout empty · 1 one or more missing, one stdout line per file
 * `<path>: no ### Retrospective entry` · 2 the check could not run (no argument, a path outside the root, a missing
 * file, a file that is not a Memory document of this repository, a `bug:` id with no file or with several, an
 * unreadable `memory.yaml`), the reason on stderr (`spec-003` Layer 3's exit table).
 * Deterministic: the files in the order given, each followed by its bugs in `bug:` order; no clock, no network.
 * Read-only.
 */
'use strict';

const { existsSync, readFileSync, readdirSync, realpathSync, statSync } = require('node:fs');
const { dirname, isAbsolute, join, relative, resolve, sep } = require('node:path');

const yaml = require('js-yaml');

const MEMORY_YAML = '.wingfoil/memory.yaml';
const USAGE = 'usage: node scripts/check-retrospective.cjs <path> [<path> …]';
const HEADING_RE = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/** A failure that stops the check with exit 2. */
class UsageError extends Error {}

/** The body of a Markdown document, its frontmatter (a leading `---` block) removed. */
function stripFrontmatter(markdown) {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
  return match === null ? markdown : markdown.slice(match[0].length);
}

/** `true` when `text` (a subsection's lines) holds a non-blank line outside HTML comments. */
function hasContentOutsideComments(text) {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim() !== '';
}

/**
 * `true` when `markdown` holds, under a `## …Execution Notes` section, a `### Retrospective` subsection whose last
 * occurrence has at least one line outside HTML comments (D2 (b)). Pure.
 * @param {string} markdown
 * @returns {boolean}
 */
function hasRetrospectiveEntry(markdown) {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  let fence = null;
  let inNotes = false;
  /** The line indexes of every `### Retrospective` heading inside a running log, and where each subsection ends. */
  const subsections = [];
  let open = null;
  lines.forEach((line, index) => {
    const fenceMatch = FENCE_RE.exec(line);
    if (fence !== null) {
      if (fenceMatch !== null && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      return;
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1];
      return;
    }
    const heading = HEADING_RE.exec(line);
    if (heading === null) return;
    const level = heading[1].length;
    if (level > 3) return;
    if (open !== null) {
      open.end = index;
      open = null;
    }
    if (level <= 2) inNotes = level === 2 && /Execution Notes$/.test(heading[2]);
    if (level === 3 && inNotes && heading[2] === 'Retrospective') {
      open = { start: index + 1, end: lines.length };
      subsections.push(open);
    }
  });
  const last = subsections[subsections.length - 1];
  return last !== undefined && hasContentOutsideComments(lines.slice(last.start, last.end).join('\n'));
}

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
  if (!inside(absolute)) throw new UsageError(`${path}: outside the repository root`);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new UsageError(`${path}: no such file`);
  if (!inside(realpathSync(absolute))) throw new UsageError(`${path}: resolves outside the repository root`);
  return absolute;
}

/** The `types` of the root's `memory.yaml`. */
function readTypes(root) {
  const file = join(root, MEMORY_YAML);
  if (!existsSync(file)) throw new UsageError(`${MEMORY_YAML}: not found under ${root}`);
  let parsed;
  try {
    parsed = yaml.load(readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new UsageError(`${MEMORY_YAML}: does not parse (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
  }
  const types = parsed !== null && typeof parsed === 'object' ? parsed.types : undefined;
  if (types === null || typeof types !== 'object') throw new UsageError(`${MEMORY_YAML}: declares no types`);
  return types;
}

/** A Memory document of this repository at `path`: its text and frontmatter, or a refusal. */
function readMemoryDocument(root, path, types) {
  const text = readFileSync(confinedFile(root, path), 'utf-8');
  const frontmatter = readFrontmatter(text);
  const type = frontmatter === null ? undefined : frontmatter.type;
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(types, type)) {
    throw new UsageError(`${path}: not a Memory document (no frontmatter type among ${MEMORY_YAML}'s types)`);
  }
  return { text, frontmatter };
}

/** The ids of a task's `bug:` field: a list, a single string (documents predating dl-045), or none. */
function bugIds(frontmatter) {
  const field = frontmatter.bug;
  if (field === undefined || field === null || field === '') return [];
  return (Array.isArray(field) ? field : [field]).map(String).filter((id) => id.trim() !== '');
}

/** The repository-relative path of the bug `id` names (full or short id), or a refusal. */
function bugPath(root, types, id) {
  const pattern = types.bug && typeof types.bug.path === 'string' ? types.bug.path : null;
  if (pattern === null || !pattern.endsWith('{id}.md') || dirname(pattern).includes('{')) {
    throw new UsageError(`${MEMORY_YAML}: bug.path is not a fixed directory followed by {id}.md, so ${id} cannot be found`);
  }
  const directory = dirname(pattern);
  const absolute = join(root, directory);
  const names = existsSync(absolute) ? readdirSync(absolute).sort() : [];
  const exact = names.filter((name) => name === `${id}.md`);
  const matches = exact.length > 0 ? exact : names.filter((name) => name.startsWith(`${id}-`) && name.endsWith('.md'));
  if (matches.length === 0) throw new UsageError(`${id}: no file under ${directory}/ (the task's bug: list)`);
  if (matches.length > 1) throw new UsageError(`${id}: several files under ${directory}/ (${matches.join(', ')})`);
  return `${directory}/${matches[0]}`;
}

/**
 * The files of `paths` (then each task's closed bugs) with no `### Retrospective` entry, in order. Throws a
 * {@link UsageError} for anything that stops the check.
 * @param {string} root
 * @param {readonly string[]} paths
 * @returns {string[]}
 */
function missingRetrospectives(root, paths) {
  if (paths.length === 0) throw new UsageError(USAGE);
  const types = readTypes(root);
  const missing = [];
  for (const path of paths) {
    const document = readMemoryDocument(root, path, types);
    if (!hasRetrospectiveEntry(document.text)) missing.push(path);
    if (document.frontmatter.type !== 'task') continue;
    for (const id of bugIds(document.frontmatter)) {
      const linked = bugPath(root, types, id);
      const bug = readMemoryDocument(root, linked, types);
      if (bug.frontmatter.status === 'closed' && !hasRetrospectiveEntry(bug.text)) missing.push(linked);
    }
  }
  return missing;
}

/** The command line: exit 0, 1 or 2 (above). */
function main(argv) {
  try {
    const missing = missingRetrospectives(process.cwd(), argv);
    for (const path of missing) process.stdout.write(`${path}: no ### Retrospective entry\n`);
    return missing.length === 0 ? 0 : 1;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`check-retrospective: ${error.message}\n`);
    return 2;
  }
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`check-retrospective: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

module.exports = { hasRetrospectiveEntry, missingRetrospectives };
