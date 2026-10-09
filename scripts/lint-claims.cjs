#!/usr/bin/env node
/**
 * The claim-shape lint (`dl-097` §2 (b), task-208) — read-only, warn-only, and not shipped in the npm
 * package (`package.json` `files`). It reads Memory documents and flags two shapes the `claim-evidence`
 * directive rules out, from text alone:
 *
 * - **state-claim** — a paragraph, list item or table row that asserts a state ("unchanged", "already
 *   covered", "does not exist", "returns nothing", "no caller", …: `STATE_CLAIM_PHRASES`) and holds no
 *   command: no inline code span whose first word is a command (`COMMANDS`).
 * - **empty-output** — an item that reports an empty result ("printed nothing", "no output", "no
 *   match", …: `EMPTY_OUTPUT_PHRASES`) with no positive case beside it: fewer than two commands, and no
 *   mention of a positive case (`claim-evidence`, *Absence and presence*: the same command shown hitting
 *   a known positive case).
 *
 * One warning per item and kind, at the line of the first phrase. Fenced code blocks, HTML comments
 * and the frontmatter are not prose and are never read. It checks the SHAPE of a claim, never its truth:
 * that is the reviewer's (`code-review`, "Claims are re-run before the verdict", `dl-097` (a)). Warn-only
 * until its false-positive rate has been measured over one release (`dl-097` Action 4): findings never
 * change the exit status.
 *
 * Deterministic (REQ-SYS-07): fixed phrase and command lists, files in sorted order, warnings in file
 * then line order; no clock is read.
 *
 * Usage: node scripts/lint-claims.cjs [--root <dir>] [--base <rev>] [--format text|github] [<file>…]
 *   --root    the repository (default: the git top level of the working directory)
 *   --base    lint the Memory documents `<rev>...HEAD` added or modified (`.md` under the content roots of
 *             the committed `.wingfoil/memory.yaml`), and in each only the items holding an added line
 *   --format  `text` (default) or `github` (`::warning file=…,line=…::…` annotations)
 *   <file>…   lint these files whole instead
 * Exit: 0 whatever it found · 2 it could not run (bad usage, a missing file, a git failure).
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { isAbsolute, join, relative } = require('node:path');

const { load: yamlLoad } = require('js-yaml');

/** Phrases that assert a state of the code or the repository (`dl-097` §2 (b), extended). */
const STATE_CLAIM_PHRASES = [
  'already covered',
  'already exists',
  'already done',
  'unchanged',
  'does not exist',
  "doesn't exist",
  'no longer exists',
  'returns nothing',
  'no caller',
  'no callers',
  'never called',
  'nothing else',
  'not referenced',
  'nothing references',
];

/** Phrases that report an empty result, which needs its positive case. */
const EMPTY_OUTPUT_PHRASES = ['printed nothing', 'prints nothing', 'print nothing', 'no output', 'empty output', 'no match', 'no matches'];

/** The first words an inline code span starts with when it is a command. */
const COMMANDS = [
  'awk', 'cat', 'diff', 'find', 'gh', 'git', 'grep', 'head', 'jest', 'jq', 'ls', 'node', 'npm', 'npx', 'rg', 'sed', 'sort',
  'tail', 'test', 'tsc', 'uniq', 'wc', 'wingfoil',
];

/** A mention of the positive case an absence claim needs. */
const POSITIVE_RE = /\bpositive\b/i;

class UsageError extends Error {}

/** `phrase` as a case-insensitive, word-bounded pattern. */
function phrasePattern(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i');
}
const STATE_PATTERNS = STATE_CLAIM_PHRASES.map((phrase) => [phrase, phrasePattern(phrase)]);
const EMPTY_PATTERNS = EMPTY_OUTPUT_PHRASES.map((phrase) => [phrase, phrasePattern(phrase)]);

/** The number of inline code spans in `text` that start with a command. */
function countCommands(text) {
  let count = 0;
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const first = match[1].trim().replace(/^\$\s+/, '').split(/\s+/)[0];
    if (COMMANDS.includes(first)) count += 1;
  }
  return count;
}

/** The text of `line` with inline code spans removed, so a phrase inside a command is not prose. */
function prose(line) {
  return line.replace(/`[^`\n]*`/g, '``');
}

/**
 * Split a Markdown text into items — `{ start, lines }`, `start` 1-based — skipping the frontmatter,
 * fenced code blocks and HTML comments. A list item runs until the next item, a blank line or a
 * heading; a table row is an item of its own; a paragraph runs to the next blank line.
 */
function splitItems(text) {
  const lines = text.split('\n');
  const items = [];
  let current = null;
  let fence = null;
  let comment = false;
  let index = 0;
  const close = () => {
    if (current !== null) items.push(current);
    current = null;
  };
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end !== -1) index = end + 1;
  }
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence !== null) {
      if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (comment) {
      if (line.includes('-->')) comment = false;
      continue;
    }
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch) {
      close();
      fence = fenceMatch[1];
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      close();
      if (!line.includes('-->')) comment = true;
      continue;
    }
    if (line.trim() === '' || /^\s*#/.test(line)) {
      close();
      continue;
    }
    if (/^\s*\|/.test(line)) {
      close();
      if (!/^\s*\|[\s|:-]*$/.test(line)) items.push({ start: index + 1, lines: [line] });
      continue;
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s/.test(line)) {
      close();
      current = { start: index + 1, lines: [line] };
      continue;
    }
    if (current === null) current = { start: index + 1, lines: [] };
    current.lines.push(line);
  }
  close();
  return items;
}

/** The first line of `item` (1-based) whose prose matches one of `patterns`, with the phrase, or `null`. */
function firstMatch(item, patterns) {
  for (let offset = 0; offset < item.lines.length; offset += 1) {
    const text = prose(item.lines[offset]);
    for (const [phrase, pattern] of patterns) {
      if (pattern.test(text)) return { line: item.start + offset, phrase };
    }
  }
  return null;
}

/**
 * The warnings of one Markdown text. When `lines` is given, only the items that hold one of those
 * (1-based) lines are linted — the items a change touched.
 */
function lintMarkdown(text, lines) {
  const warnings = [];
  for (const item of splitItems(text)) {
    if (lines !== undefined && !item.lines.some((_line, offset) => lines.has(item.start + offset))) continue;
    const whole = item.lines.join('\n');
    const commands = countCommands(whole);
    const claim = firstMatch(item, STATE_PATTERNS);
    if (claim !== null && commands === 0) {
      warnings.push({
        line: claim.line,
        kind: 'state-claim',
        message: `"${claim.phrase}" states a fact with no command in the same item (claim-evidence)`,
      });
    }
    const empty = firstMatch(item, EMPTY_PATTERNS);
    if (empty !== null && commands < 2 && !POSITIVE_RE.test(whole)) {
      warnings.push({
        line: empty.line,
        kind: 'empty-output',
        message: `"${empty.phrase}" reports an empty result with no positive case beside it (claim-evidence, absence and presence)`,
      });
    }
  }
  return warnings.sort((a, b) => a.line - b.line || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

function git(root, args) {
  return execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** The static directory prefixes of the committed `memory.yaml`'s type paths (`computeMemoryContentRoots`). */
function memoryRoots(root) {
  let document;
  try {
    document = yamlLoad(git(root, ['show', 'HEAD:.wingfoil/memory.yaml']));
  } catch {
    return [];
  }
  const types = document !== null && typeof document === 'object' && document.types !== null && typeof document.types === 'object' ? document.types : {};
  const dirs = new Set();
  for (const entry of Object.values(types)) {
    const path = entry !== null && typeof entry === 'object' && typeof entry.path === 'string' ? entry.path : '';
    const brace = path.indexOf('{');
    const staticPart = brace === -1 ? path : path.slice(0, brace);
    const slash = staticPart.lastIndexOf('/');
    if (slash > 0) dirs.add(staticPart.slice(0, slash));
  }
  return [...dirs].sort();
}

/** The `.md` files under the Memory roots that `base...HEAD` added or modified, with their added lines. */
function changedDocuments(root, base) {
  const roots = memoryRoots(root);
  const names = git(root, ['diff', '--name-only', '--diff-filter=AMR', `${base}...HEAD`])
    .split('\n')
    .filter((path) => path.endsWith('.md') && roots.some((dir) => path.startsWith(`${dir}/`)))
    .sort();
  return names.map((path) => {
    const added = new Set();
    for (const line of git(root, ['diff', '--unified=0', `${base}...HEAD`, '--', path]).split('\n')) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!hunk) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let offset = 0; offset < count; offset += 1) added.add(start + offset);
    }
    return { path, added };
  });
}

/** Lint the given files whole, or the Memory documents `options.base...HEAD` changed. */
function lintClaims(root, options) {
  const warnings = [];
  const files = [];
  if (options.base !== undefined) {
    try {
      git(root, ['rev-parse', '--verify', '--quiet', `${options.base}^{commit}`]);
    } catch {
      throw new UsageError(`--base ${options.base} is not a commit of ${root}`);
    }
    for (const { path, added } of changedDocuments(root, options.base)) {
      files.push(path);
      const text = git(root, ['show', `HEAD:${path}`]);
      for (const warning of lintMarkdown(text, added)) warnings.push({ file: path, ...warning });
    }
  }
  for (const file of options.files ?? []) {
    const absolute = isAbsolute(file) ? file : join(root, file);
    let text;
    try {
      text = readFileSync(absolute, 'utf-8');
    } catch {
      throw new UsageError(`cannot read ${file}`);
    }
    const shown = relative(root, absolute).split('\\').join('/');
    files.push(shown);
    for (const warning of lintMarkdown(text)) warnings.push({ file: shown, ...warning });
  }
  return { files, warnings };
}

/** The report as printed lines, in `format`. */
function formatClaimReport(report, format) {
  const lines = report.warnings.map((warning) =>
    format === 'github'
      ? `::warning file=${warning.file},line=${warning.line},title=claim-lint::${warning.kind}: ${warning.message}`
      : `${warning.file}:${warning.line}: ${warning.kind}: ${warning.message}`,
  );
  const withWarnings = new Set(report.warnings.map((warning) => warning.file)).size;
  lines.push(
    `claim lint: ${report.warnings.length} warnings in ${withWarnings} file${withWarnings === 1 ? '' : 's'} (warn-only), ` +
      `${report.files.length} file${report.files.length === 1 ? '' : 's'} read`,
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { format: 'text', files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root' || arg === '--base' || arg === '--format') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new UsageError(`unknown argument: ${arg}`);
    } else {
      options.files.push(arg);
    }
  }
  if (options.format !== 'text' && options.format !== 'github') throw new UsageError(`--format is text or github, not ${options.format}`);
  return options;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    const root = options.root ?? git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const report = lintClaims(root, { base: options.base, files: options.files });
    process.stdout.write(`${formatClaimReport(report, options.format)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message.split('\n')[0]}\n`);
    return 2;
  }
}

module.exports = { lintClaims, lintMarkdown };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
