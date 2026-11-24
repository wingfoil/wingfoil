#!/usr/bin/env node
/**
 * task-229 (`dl-130` step 1, spec-015 §3) — print the notes of one version's GitHub Release: the section of
 * `CHANGELOG.md` headed `## [X.Y.Z]` (optionally followed by ` - <date>`), up to the next `## ` heading, with
 * blank edge lines and a closing block of link reference definitions dropped.
 *
 * Run by `.github/workflows/publish.yml`'s `release` job BEFORE it waits for npm, so a missing section fails at
 * once. It reads only the requested section, so it works on a `release/X.Y` tree that lacks later minors'
 * sections (dl-159). Pure and offline.
 *
 * task-363 (`dl-213` (a), spec-019 §8) adds two modes, named by `release-publishing`'s `release-commit` phase:
 * - `--lines` prints the `Formats read:` and `Capabilities:` lines that open the version's section, computed from
 *   the previous release's capabilities document (the §5 fixture at the previous release tag, else the 0.3.2
 *   baseline) and the current build's (`node <repo>/dist/cli.js capabilities --format json`), then a
 *   `### Breaking` block when the format rises or a file kind or a capability is removed with a `format` bump; a
 *   removal without one fails, naming it (approver ruling D2 (a));
 * - `--check` holds the version's section to the form (`checkReleaseSection`) and requires its two lines, and every
 *   computed `### Breaking` item, to be the computed ones.
 * The default mode's notes, exit codes and messages are unchanged.
 *
 * Usage: node scripts/changelog-section.cjs <X.Y.Z> [--changelog <path>]   (default: the repository's CHANGELOG.md)
 *        node scripts/changelog-section.cjs <X.Y.Z> --lines [--repo <dir>] [--previous <file>] [--current <file>]
 *        node scripts/changelog-section.cjs <X.Y.Z> --check [--changelog <path>] [--repo <dir>] [--previous <file>]
 *          [--current <file>]
 * Exit:  0 the notes (or the lines) on stdout, nothing for --check · 1 no / several / an empty section, an
 *        unreadable file or document, a removal without a format bump, a section out of form · 2 usage error
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S/;
/** spec-019 §4.2 and §3.1: capability names and file-kind names are kebab-case. */
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
/** A range of `Formats read:`: `none`, `N` or `L..H` (spec-019 §8). */
const RANGE = '(none|[1-9]\\d*(?:\\.\\.[1-9]\\d*)?)';
const FORMATS_ITEM = new RegExp(`^(\\S+) ${RANGE}\\u2192${RANGE}$`);
const FEATURE_TASK = /\(task-\d+\)$/;

const ARROW = '→';
const FORMATS_PREFIX = 'Formats read: ';
const CAPABILITIES_PREFIX = 'Capabilities: ';
const FEATURE_PREFIX = 'Feature in a patch:';
const FORMAT_RULE = 'spec-019 §5';
const USAGE =
  'node scripts/changelog-section.cjs <X.Y.Z> [--changelog <path>] [--lines | --check] [--repo <dir>] [--previous <file>] [--current <file>]';

/** The §5 fixture, read at a release tag (spec-019 §5, §8). */
const FIXTURE_PATH = 'test/core/fixtures/capabilities-document.json';
/** The 0.3.2 baseline: previous whenever the previous release's tag holds no fixture (spec-019 §8). */
const BASELINE_PATH = 'test/core/fixtures/capabilities-document-baseline-0.3.2.json';
/** The sections written before `dl-213`: never backfilled, never held to the lines' form (approver ruling D1 (a)). */
const LINES_GRANDFATHERED = Object.freeze(['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2']);

/** Code-unit order, never `localeCompare` (spec-019 §8). */
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The section of `text` for `version`.
 *
 * @param {string} text the CHANGELOG.md content
 * @param {string} version `X.Y.Z`, no leading `v`
 * @returns {{ ok: true, notes: string } | { ok: false, message: string }}
 */
function changelogSection(text, version) {
  if (!VERSION.test(version)) return { ok: false, message: `${JSON.stringify(version)} is not a version of the form X.Y.Z` };
  const lines = text.split(/\r?\n/);
  const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\](?:\\s.*)?$`);
  const starts = lines.flatMap((line, index) => (heading.test(line) ? [index] : []));
  const label = `\`## [${version}]\``;
  if (starts.length === 0) return { ok: false, message: `no section ${label} in the changelog` };
  if (starts.length > 1) return { ok: false, message: `${starts.length} sections ${label} in the changelog` };
  const start = starts[0] + 1;
  const next = lines.findIndex((line, index) => index >= start && line.startsWith('## '));
  const body = lines.slice(start, next === -1 ? lines.length : next);
  const isEdge = (line) => line.trim() === '' || LINK_DEFINITION.test(line);
  while (body.length > 0 && body[0].trim() === '') body.shift();
  while (body.length > 0 && isEdge(body[body.length - 1])) body.pop();
  if (body.length === 0) return { ok: false, message: `the section ${label} is empty` };
  return { ok: true, notes: body.join('\n') };
}

/**
 * A `{lowest, highest}` range as `Formats read:` writes it (spec-019 §8).
 *
 * @param {{ lowest: number, highest: number } | undefined} range
 * @returns {string} `none`, `N` or `L..H`
 */
function formatRange(range) {
  if (range === undefined) return 'none';
  return range.lowest === range.highest ? `${range.lowest}` : `${range.lowest}..${range.highest}`;
}

/**
 * The two lines of spec-019 §8 and the `### Breaking` items, from the previous and the current capabilities
 * documents; `commands`, `wingfoil` and unknown keys are ignored (spec-019 §5). A file kind or a capability
 * removed while `format` has not risen is a problem, kinds first (approver ruling D2 (a)).
 *
 * @param {{ format: number, formats: Record<string, { lowest: number, highest: number }>, capabilities: readonly string[] }} previous
 * @param {{ format: number, formats: Record<string, { lowest: number, highest: number }>, capabilities: readonly string[] }} current
 * @returns {{ ok: true, formatsRead: string, capabilities: string, breaking: string[] } | { ok: false, problems: string[] }}
 */
function releaseLines(previous, current) {
  const range = (formats, kind) => (Object.prototype.hasOwnProperty.call(formats, kind) ? formats[kind] : undefined);
  const kinds = [...new Set([...Object.keys(previous.formats), ...Object.keys(current.formats)])].sort(byCodeUnit);
  const items = [];
  for (const kind of kinds) {
    const from = formatRange(range(previous.formats, kind));
    const to = formatRange(range(current.formats, kind));
    if (from !== to) items.push(`${kind} ${from}${ARROW}${to}`);
  }
  const removedKinds = kinds.filter((kind) => range(previous.formats, kind) !== undefined && range(current.formats, kind) === undefined);
  const previousNames = new Set(previous.capabilities);
  const currentNames = new Set(current.capabilities);
  const added = [...currentNames].filter((name) => !previousNames.has(name)).sort(byCodeUnit);
  const removedNames = [...previousNames].filter((name) => !currentNames.has(name)).sort(byCodeUnit);
  if (current.format <= previous.format && removedKinds.length + removedNames.length > 0) {
    const without = `removed without a capabilities document format bump (format ${previous.format}${ARROW}${current.format}, ${FORMAT_RULE})`;
    return {
      ok: false,
      problems: [
        ...removedKinds.map((kind) => `file kind \`${kind}\` ${without}`),
        ...removedNames.map((name) => `capability \`${name}\` ${without}`),
      ],
    };
  }
  const breaking = [];
  if (current.format > previous.format) {
    breaking.push(`- The capabilities document's \`format\` rises from ${previous.format} to ${current.format} (${FORMAT_RULE}).`);
  }
  for (const kind of removedKinds) {
    breaking.push(`- Files of kind \`${kind}\` are no longer read: formats ${formatRange(previous.formats[kind])}${ARROW}none.`);
  }
  for (const name of removedNames) breaking.push(`- The capability \`${name}\` is no longer provided.`);
  return {
    ok: true,
    formatsRead: `${FORMATS_PREFIX}${items.length === 0 ? 'unchanged' : items.join(', ')}`,
    capabilities: `${CAPABILITIES_PREFIX}${added.length === 0 ? 'none new' : added.join(', ')}`,
    breaking,
  };
}

/**
 * The previous release of `version`: the highest `vX.Y.Z` tag below it, in numeric semver order (spec-019 §8).
 *
 * @param {string} version `X.Y.Z`
 * @param {readonly string[]} tags tag names; those not of the form `vX.Y.Z` are ignored
 * @returns {string | undefined}
 */
function previousReleaseTag(version, tags) {
  const target = VERSION.exec(version);
  if (target === null) return undefined;
  const key = (match) => [Number(match[1]), Number(match[2]), Number(match[3])];
  const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const wanted = key(target);
  let best;
  for (const tag of tags) {
    const match = RELEASE_TAG.exec(tag);
    if (match === null) continue;
    const candidate = key(match);
    if (compare(candidate, wanted) < 0 && (best === undefined || compare(candidate, best.key) > 0)) best = { tag, key: candidate };
  }
  return best === undefined ? undefined : best.tag;
}

/** The paragraphs of `notes`: runs of non-blank lines, each the list of its lines. */
function paragraphs(notes) {
  const found = [];
  let current = [];
  for (const line of notes.split('\n')) {
    if (line.trim() !== '') {
      current.push(line);
    } else if (current.length > 0) {
      found.push(current);
      current = [];
    }
  }
  if (current.length > 0) found.push(current);
  return found;
}

/** Whether `values` is strictly increasing in code-unit order: sorted, no repeat. */
function strictlyOrdered(values) {
  return values.every((value, index) => index === 0 || byCodeUnit(values[index - 1], value) < 0);
}

/** The `Formats read:` line's problems: each item's form, then the order of the kinds. */
function formatsReadProblems(line) {
  const rest = line.slice(FORMATS_PREFIX.length);
  if (rest === 'unchanged') return [];
  const problems = [];
  const kinds = [];
  for (const item of rest.split(', ')) {
    const match = FORMATS_ITEM.exec(item);
    if (match === null || match[2] === match[3] || !KEBAB.test(match[1])) {
      problems.push(`"Formats read:" item "${item}" is not "<kind> <range>${ARROW}<range>" with two different ranges`);
    } else {
      kinds.push(match[1]);
    }
  }
  if (!strictlyOrdered(kinds)) problems.push('"Formats read:" items are not in code-unit order of the kind, or repeat a kind');
  return problems;
}

/** The `Capabilities:` line's problems: each name's form, then their order. */
function capabilitiesProblems(line) {
  const rest = line.slice(CAPABILITIES_PREFIX.length);
  if (rest === 'none new') return [];
  const names = rest.split(', ');
  const problems = names
    .filter((name) => !KEBAB.test(name))
    .map((name) => `"Capabilities:" name "${name}" is not a kebab-case capability name`);
  if (!strictlyOrdered(names)) problems.push('"Capabilities:" names are not in code-unit order, or repeat a name');
  return problems;
}

/** Each `### <heading>` of `lines` with its items: the non-blank lines up to the next heading of any level. */
function headingBlocks(lines) {
  const blocks = [];
  for (const line of lines) {
    if (line.startsWith('### ')) blocks.push({ heading: line.slice(4).trim(), items: [] });
    else if (line.startsWith('#')) blocks.push({ heading: undefined, items: [] });
    else if (blocks.length > 0 && line.trim() !== '') blocks[blocks.length - 1].items.push(line.trim());
  }
  return blocks.filter((block) => block.heading !== undefined);
}

/**
 * The form of a release section (`dl-213` (a), approver rulings D1 (a), D3 (a)), over the notes `changelogSection`
 * returns: the `Formats read:` and `Capabilities:` lines are its first two paragraphs, one line each; a patch's
 * `Feature in a patch:` lines come right after them, each ending with its task; `### Breaking` and `### Deprecated`
 * appear at most once, each with an item, `### Breaking` as the first `###` heading.
 *
 * @param {string} notes the section's notes
 * @param {string} version its `X.Y.Z`
 * @returns {{ ok: true } | { ok: false, problems: string[] }}
 */
function checkReleaseSection(notes, version) {
  const problems = [];
  const blocks = paragraphs(notes);
  const oneLine = (index, prefix) => blocks[index]?.length === 1 && blocks[index][0].startsWith(prefix);
  if (oneLine(0, FORMATS_PREFIX)) problems.push(...formatsReadProblems(blocks[0][0]));
  else problems.push('the first paragraph is not one "Formats read: …" line');
  if (oneLine(1, CAPABILITIES_PREFIX)) problems.push(...capabilitiesProblems(blocks[1][0]));
  else problems.push('the second paragraph is not one "Capabilities: …" line');

  const parts = VERSION.exec(version);
  const isPatch = parts !== null && parts[3] !== '0';
  let afterFeatures = 2;
  while (blocks[afterFeatures]?.every((line) => line.startsWith(FEATURE_PREFIX))) afterFeatures += 1;
  const features = blocks.flatMap((block, index) =>
    block.filter((line) => line.startsWith(FEATURE_PREFIX)).map((line) => ({ line, inPlace: index >= 2 && index < afterFeatures })),
  );
  if (features.length > 0 && !isPatch) problems.push(`"${FEATURE_PREFIX}" in the section of ${version}, which is not a patch`);
  for (const { line } of features) {
    if (!FEATURE_TASK.test(line)) problems.push(`"${FEATURE_PREFIX}" line does not end with its task, "(task-<n>)": "${line}"`);
  }
  if (features.some((feature) => !feature.inPlace)) {
    problems.push(`"${FEATURE_PREFIX}" line outside the paragraphs right after "Capabilities:"`);
  }

  const headings = headingBlocks(notes.split('\n'));
  if (headings.some((block) => block.heading === 'Breaking') && headings[0].heading !== 'Breaking') {
    problems.push('"### Breaking" is not the first "###" heading');
  }
  for (const name of ['Breaking', 'Deprecated']) {
    const found = headings.filter((block) => block.heading === name);
    if (found.length > 1) problems.push(`"### ${name}" appears ${found.length} times`);
    if (found.some((block) => block.items.length === 0)) problems.push(`"### ${name}" has no item`);
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

/** Why `value` is not a capabilities document (spec-019 §3, §5), or `undefined` when it is one. */
function documentProblem(value) {
  const positive = (n) => Number.isInteger(n) && n > 0;
  const mapping = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!mapping(value)) return 'not a JSON object';
  if (!positive(value.format)) return '`format` is not a positive integer';
  if (!mapping(value.formats)) return '`formats` is not a mapping';
  for (const [kind, range] of Object.entries(value.formats)) {
    if (!mapping(range) || !positive(range.lowest) || !positive(range.highest)) {
      return `\`formats.${kind}\` is not a {lowest, highest} pair of positive integers`;
    }
  }
  if (!Array.isArray(value.capabilities) || !value.capabilities.every((name) => typeof name === 'string')) {
    return '`capabilities` is not a list of names';
  }
  return undefined;
}

/** `text` parsed as the capabilities document `source` names. */
function parseDocument(text, source) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, message: `${source} is not a capabilities document: ${error.message}` };
  }
  const problem = documentProblem(value);
  if (problem !== undefined) return { ok: false, message: `${source} is not a capabilities document: ${problem}` };
  return { ok: true, document: value, source };
}

/** The document in `file`, or why there is none. */
function readDocument(file, source) {
  let text;
  try {
    text = readFileSync(file, 'utf-8');
  } catch (error) {
    return { ok: false, message: `cannot read ${file}: ${error.code ?? error.message}` };
  }
  return parseDocument(text, source);
}

/** git in `repo`: its stdout, or `undefined` when it fails. */
function git(repo, args) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return undefined;
  }
}

/** The previous document: `--previous`, else the fixture at the previous release tag, else the baseline. */
function previousDocument(args) {
  if (args.previous !== undefined) return readDocument(args.previous, args.previous);
  const tags = git(args.repo, ['tag', '--list']);
  if (tags === undefined) return { ok: false, message: `cannot list the tags of ${args.repo}` };
  const tag = previousReleaseTag(args.version, tags.split('\n'));
  if (tag === undefined) return { ok: false, message: `no release tag below v${args.version}` };
  if (git(args.repo, ['cat-file', '-e', `${tag}:${FIXTURE_PATH}`]) === undefined) {
    return readDocument(join(args.repo, BASELINE_PATH), BASELINE_PATH);
  }
  const text = git(args.repo, ['show', `${tag}:${FIXTURE_PATH}`]);
  if (text === undefined) return { ok: false, message: `cannot read ${tag}:${FIXTURE_PATH}` };
  return parseDocument(text, `${tag}:${FIXTURE_PATH}`);
}

/** The current document: `--current`, else the repository build's `capabilities --format json`. */
function currentDocument(args) {
  if (args.current !== undefined) return readDocument(args.current, args.current);
  const cli = join(args.repo, 'dist', 'cli.js');
  const cannot = 'cannot read the current capabilities document';
  if (!existsSync(cli)) return { ok: false, message: `${cannot}: ${cli} does not exist (run npm run build)` };
  let text;
  try {
    text = execFileSync(process.execPath, [cli, 'capabilities', '--format', 'json'], {
      cwd: args.repo,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const said = `${error.stderr ?? ''}`.split('\n').find((line) => line.trim() !== '');
    return { ok: false, message: `${cannot}: ${said ?? error.message}` };
  }
  return parseDocument(text, 'node dist/cli.js capabilities --format json');
}

/** The computed lines of `args.version`, or the `error:` messages (and the `hint:`) saying why there are none. */
function computeLines(args) {
  const previous = previousDocument(args);
  if (!previous.ok) return { ok: false, errors: [previous.message] };
  const current = currentDocument(args);
  if (!current.ok) return { ok: false, errors: [current.message] };
  const result = releaseLines(previous.document, current.document);
  if (!result.ok) return { ok: false, errors: result.problems, hint: `previous document: ${previous.source}` };
  return result;
}

/** The `--check` problems of the section's notes: their form, then their lines against the computed ones. */
function checkSection(notes, args) {
  const form = checkReleaseSection(notes, args.version);
  const errors = form.ok ? [] : [...form.problems];
  const computed = computeLines(args);
  if (!computed.ok) return { errors: [...errors, ...computed.errors], hint: computed.hint };
  const blocks = paragraphs(notes);
  const written = (index, prefix) => (blocks[index]?.length === 1 && blocks[index][0].startsWith(prefix) ? blocks[index][0] : undefined);
  const formats = written(0, FORMATS_PREFIX);
  if (formats !== undefined && formats !== computed.formatsRead) {
    errors.push(`"Formats read:" line differs from the computed one: ${computed.formatsRead}`);
  }
  const capabilities = written(1, CAPABILITIES_PREFIX);
  if (capabilities !== undefined && capabilities !== computed.capabilities) {
    errors.push(`"Capabilities:" line differs from the computed one: ${computed.capabilities}`);
  }
  const breaking = headingBlocks(notes.split('\n'))
    .filter((block) => block.heading === 'Breaking')
    .flatMap((block) => block.items);
  for (const item of computed.breaking) {
    if (!breaking.includes(item)) errors.push(`"### Breaking" lacks the computed item: ${item}`);
  }
  return { errors };
}

/** The options that take a value, and what the value is. */
const VALUED = Object.freeze({ '--changelog': 'a path', '--repo': 'a directory', '--previous': 'a path', '--current': 'a path' });

/**
 * @param {readonly string[]} argv the arguments after the script path
 * @returns {{ ok: true, version: string, changelog: string, mode: 'notes' | 'lines' | 'check', repo: string,
 *   previous: string | undefined, current: string | undefined } | { ok: false, message: string }}
 */
function parseArgs(argv) {
  let version;
  let mode = 'notes';
  const values = { changelog: join(__dirname, '..', 'CHANGELOG.md'), repo: undefined, previous: undefined, current: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--lines' || arg === '--check') {
      if (mode !== 'notes' && mode !== arg.slice(2)) return { ok: false, message: 'options --lines and --check exclude each other' };
      mode = arg.slice(2);
    } else if (Object.prototype.hasOwnProperty.call(VALUED, arg)) {
      if (i + 1 >= argv.length) return { ok: false, message: `option ${arg} needs ${VALUED[arg]}` };
      values[arg.slice(2)] = argv[(i += 1)];
    } else if (arg.startsWith('-')) {
      return { ok: false, message: `unknown option ${arg}` };
    } else if (version === undefined) {
      version = arg;
    } else {
      return { ok: false, message: `unexpected argument ${arg}` };
    }
  }
  if (version === undefined) return { ok: false, message: 'missing required argument: version' };
  if (!VERSION.test(version)) return { ok: false, message: `${JSON.stringify(version)} is not a version of the form X.Y.Z` };
  const stray = ['repo', 'previous', 'current'].find((name) => values[name] !== undefined);
  if (mode === 'notes' && stray !== undefined) return { ok: false, message: `option --${stray} needs --lines or --check` };
  return { ok: true, version, mode, ...values, repo: values.repo ?? join(__dirname, '..') };
}

/** `errors` as `error:` lines, then `hint` as a `hint:` line, on stderr. */
function writeErrors(errors, hint) {
  const lines = errors.map((message) => `error: ${message}\n`);
  if (hint !== undefined) lines.push(`hint: ${hint}\n`);
  process.stderr.write(lines.join(''));
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    process.stderr.write(`error: ${args.message}\nhint: usage: ${USAGE}\n`);
    process.exitCode = 2;
  } else if (args.mode === 'lines') {
    const result = computeLines(args);
    if (result.ok) {
      const breaking = result.breaking.length === 0 ? '' : `\n### Breaking\n\n${result.breaking.join('\n')}\n`;
      process.stdout.write(`${result.formatsRead}\n\n${result.capabilities}\n${breaking}`);
    } else {
      writeErrors(result.errors, result.hint);
    }
    process.exitCode = result.ok ? 0 : 1;
  } else {
    let text;
    try {
      text = readFileSync(args.changelog, 'utf-8');
    } catch (error) {
      process.stderr.write(`error: cannot read ${args.changelog}: ${error.code ?? error.message}\n`);
      process.exitCode = 1;
    }
    if (text !== undefined) {
      const result = changelogSection(text, args.version);
      if (!result.ok) {
        process.stderr.write(`error: ${result.message}\n`);
        process.exitCode = 1;
      } else if (args.mode === 'notes') {
        process.stdout.write(`${result.notes}\n`);
        process.exitCode = 0;
      } else {
        const { errors, hint } = checkSection(result.notes, args);
        if (errors.length > 0) writeErrors(errors, hint);
        process.exitCode = errors.length === 0 ? 0 : 1;
      }
    }
  }
}

module.exports = {
  BASELINE_PATH,
  changelogSection,
  checkReleaseSection,
  FIXTURE_PATH,
  formatRange,
  LINES_GRANDFATHERED,
  previousReleaseTag,
  releaseLines,
};
