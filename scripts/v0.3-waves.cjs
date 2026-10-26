#!/usr/bin/env node
/**
 * task-302 (`dl-186` S3-b and E3, `dl-175` (a), `dl-100` §1 (a); release-planning-rel-v0.3.1-plan R4, design gate
 * D1–D4) — prepare `minor-v0.3` for the workflow engine: `waves: [w0, w1, w2, w3]` on the release and `wave: "wN"` on
 * each of its tasks, one approver `memory amend` per element (one id per amend, one commit each).
 *
 * The mapping has one source: the `**wave:** N` line of each `docs/04_memory/v0.3/task-*.md`'s `## Implementation
 * Notes` at HEAD (only that section: task-230 repeats the label in its Execution Notes). `N` in 0–3 gives `wN`;
 * `none` gives no wave (task-252, task-289, run inside user-docs: D1). Archived tasks are mapped like the others
 * (task-223, deprecated, → w3: D2).
 *
 * Batches: batch 0 is the release alone; batches 1… are the waved tasks in task-number order, BATCH_SIZE each.
 *
 * Usage (from the repository root, after `npm run build`; the edit uses the code build's frontmatter setter and the
 * amend runs `node dist/cli.js memory amend`, both resolved next to this script):
 *   node scripts/v0.3-waves.cjs [--plan]          the mapping, the batches and their commit counts; writes nothing
 *   node scripts/v0.3-waves.cjs --batch N --print the batch's shell commands (edit, then amend), one id per line pair
 *   node scripts/v0.3-waves.cjs --batch N --run   per id: refuse a dirty file, skip one HEAD already holds, edit,
 *                                                 amend, verify the commit holds exactly that one path; stop at the
 *                                                 first failure (the edit is undone, the run can be repeated)
 *   node scripts/v0.3-waves.cjs --edit <id>       apply one element's edit to the working tree, no commit
 *   node scripts/v0.3-waves.cjs --check [--batch N] exit 0 only when HEAD holds the whole mapping (or the batch's)
 * Exit codes: 0 success; 1 a refusal, a failed amend or an unmet check; 2 a usage error.
 *
 * The amend commits are the approver's: `memory amend` needs the approver role and writes the `Approver:` line;
 * this script adds no trailer. Git and the CLI run with argument arrays, never through a shell.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

const RELEASE_ID = 'minor-v0.3';
const RELEASE_PATH = 'docs/04_memory/planning/rl-v1/minor-v0.3.md';
const TASK_DIR = 'docs/04_memory/v0.3/';
const WAVE_KEYS = ['w0', 'w1', 'w2', 'w3'];
const BATCH_SIZE = 20;
/** How many missing ids `--check` names. */
const CHECK_LIST = 3;
const DIST = join(__dirname, '..', 'dist');
const CLI = join(DIST, 'cli.js');

const USAGE =
  'usage: node scripts/v0.3-waves.cjs [--plan] | --batch <n> (--print | --run | --check) | --check | --edit <id>';

const RELEASE_REASON =
  'Declare the four waves v0.3 ran in, w0 to w3, from dev-loop-rel-v0.3-plan section 3, so the implementation ' +
  'phase of release-cycle can iterate them (task-302, dl-175 (a), dl-186 S3-b and E3).';

/**
 * The amend reason for a task placed in `wave` (dl-067: starts with a verb, one line, no reserved key).
 * @param {string} wave
 * @returns {string}
 */
function taskReason(wave) {
  return `Record the wave this task ran in, ${wave}, from its Implementation Notes and dev-loop-rel-v0.3-plan (task-302, dl-175 (a), dl-186 S3-b).`;
}

/**
 * The body of `## Implementation Notes`, up to the next `## ` heading; `null` when the section is absent. Pure.
 * @param {string} text
 * @returns {string | null}
 */
function implementationNotes(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^## Implementation Notes\s*$/.test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * The wave a task's notes declare: `wN` for `**wave:** N` (N in 0–3), `null` for `none`. Refuses a missing,
 * repeated or other value with a message. Pure.
 * @param {string} text the whole document
 * @returns {{ ok: true, wave: string | null } | { ok: false, message: string }}
 */
function notesWave(text) {
  const notes = implementationNotes(text);
  if (notes === null) return { ok: false, message: 'no ## Implementation Notes section' };
  const values = [...notes.matchAll(/\*\*wave:\*\*\s*([A-Za-z0-9]+)/gi)].map((m) => m[1]);
  if (values.length !== 1) return { ok: false, message: `${values.length} **wave:** lines in Implementation Notes, expected 1` };
  const value = values[0];
  if (value === 'none') return { ok: true, wave: null };
  if (/^[0-3]$/.test(value)) return { ok: true, wave: `w${value}` };
  return { ok: false, message: `**wave:** ${value} is neither 0–3 nor none` };
}

/**
 * The frontmatter of a document as a plain object (`{}` when absent or not a mapping). Pure.
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
function frontmatterOf(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (match === null) return {};
  const parsed = yaml.load(match[1]);
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** The task number in a `task-<n>-…` file name or id. */
function taskNumber(name) {
  const match = /task-(\d+)/.exec(name);
  return match === null ? Number.NaN : Number(match[1]);
}

/**
 * The mapping from the task documents: one entry per task, sorted by task number. Pure.
 * @param {{ path: string, text: string }[]} documents
 * @returns {{ ok: true, entries: { id: string, path: string, wave: string | null }[] } | { ok: false, message: string }}
 */
function deriveMapping(documents) {
  const entries = [];
  for (const { path, text } of documents) {
    const fields = frontmatterOf(text);
    const id = typeof fields.id === 'string' ? fields.id : '';
    if (id === '') return { ok: false, message: `${path}: no id in the frontmatter` };
    const wave = notesWave(text);
    if (!wave.ok) return { ok: false, message: `${path}: ${wave.message}` };
    entries.push({ id, path, wave: wave.wave });
  }
  entries.sort((a, b) => taskNumber(a.id) - taskNumber(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ok: true, entries };
}

/**
 * The batches: batch 0 the release, then the waved tasks in mapping order, `size` per batch. Pure.
 * @param {{ id: string, path: string, wave: string | null }[]} entries
 * @param {number} [size]
 * @returns {{ id: string, path: string, kind: 'release' | 'task', wave: string | null }[][]}
 */
function batches(entries, size = BATCH_SIZE) {
  const result = [[{ id: RELEASE_ID, path: RELEASE_PATH, kind: 'release', wave: null }]];
  const waved = entries.filter((entry) => entry.wave !== null);
  for (let i = 0; i < waved.length; i += size) {
    result.push(waved.slice(i, i + size).map((entry) => ({ ...entry, kind: 'task' })));
  }
  return result;
}

/**
 * Whether a document's text already holds the target value. Pure.
 * @param {{ kind: 'release' | 'task', wave: string | null }} item
 * @param {string} text
 * @returns {boolean}
 */
function isApplied(item, text) {
  const fields = frontmatterOf(text);
  if (item.kind === 'release') {
    const waves = fields.waves;
    return Array.isArray(waves) && waves.length === WAVE_KEYS.length && waves.every((w, i) => w === WAVE_KEYS[i]);
  }
  return fields.wave === item.wave;
}

/** The reason for an item's amend. */
function reasonFor(item) {
  return item.kind === 'release' ? RELEASE_REASON : taskReason(item.wave);
}

/**
 * Quote `value` for a POSIX shell. Pure.
 * @param {string} value
 * @returns {string}
 */
function shellQuote(value) {
  return /^[A-Za-z0-9_./=:-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The two shell lines of one item: its edit, then its amend. Pure. */
function printLines(item) {
  return [
    `node scripts/v0.3-waves.cjs --edit ${shellQuote(item.id)} && \\`,
    `  node dist/cli.js memory amend ${shellQuote(item.id)} --reason ${shellQuote(reasonFor(item))}`,
  ];
}

// ---- I/O -------------------------------------------------------------------------------------------------------

function gitRun(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', maxBuffer: 1 << 26 });
}

function gitOut(root, args) {
  const result = gitRun(root, args);
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || String(result.error)).trim()}`);
  }
  return result.stdout;
}

/** The text of `path` at HEAD, or `null` when HEAD holds none. */
function readAtHead(root, path) {
  const result = gitRun(root, ['show', `HEAD:${path}`]);
  return result.status === 0 ? result.stdout : null;
}

/** The task documents at HEAD under TASK_DIR, in path order. */
function taskDocumentsAtHead(root) {
  return gitOut(root, ['ls-tree', '-r', '--name-only', 'HEAD', '--', TASK_DIR])
    .split('\n')
    .filter((path) => /\/task-\d+[^/]*\.md$/.test(path))
    .sort()
    .map((path) => ({ path, text: readAtHead(root, path) }));
}

/** The mapping and batches at HEAD, or a refusal. */
function load(root) {
  const mapping = deriveMapping(taskDocumentsAtHead(root));
  if (!mapping.ok) return mapping;
  if (readAtHead(root, RELEASE_PATH) === null) return { ok: false, message: `HEAD holds no ${RELEASE_PATH}` };
  return { ok: true, entries: mapping.entries, batches: batches(mapping.entries) };
}

/** Apply one item's edit to the working tree through the code build's frontmatter setter. */
function applyEdit(root, item) {
  const { setFrontmatterEntry } = require(join(DIST, 'memory', 'frontmatter-edit.js'));
  const file = join(root, item.path);
  const before = readFileSync(file, 'utf-8');
  const after =
    item.kind === 'release'
      ? setFrontmatterEntry(before, 'waves', `[${WAVE_KEYS.join(', ')}]`)
      : setFrontmatterEntry(before, 'wave', JSON.stringify(item.wave));
  writeFileSync(file, after, 'utf-8');
  return before;
}

function isDirty(root, path) {
  return gitOut(root, ['status', '--porcelain', '--', path]).trim() !== '';
}

/** Run one item: refuse dirty, skip applied, edit, amend, verify. */
function runItem(root, item, out) {
  const head = readAtHead(root, item.path);
  if (head === null) return { ok: false, message: `${item.id}: HEAD holds no ${item.path}` };
  if (isDirty(root, item.path)) {
    return { ok: false, message: `${item.id}: ${item.path} has uncommitted changes; commit or discard them, then retry` };
  }
  if (isApplied(item, head)) {
    out(`skip ${item.id}: HEAD already holds it\n`);
    return { ok: true, committed: false };
  }
  const before = gitOut(root, ['rev-parse', 'HEAD']).trim();
  const original = applyEdit(root, item);
  const amend = spawnSync(process.execPath, [CLI, 'memory', 'amend', item.id, '--reason', reasonFor(item)], {
    cwd: root,
    encoding: 'utf-8',
  });
  if (amend.error || amend.status !== 0) {
    if (gitOut(root, ['rev-parse', 'HEAD']).trim() === before) writeFileSync(join(root, item.path), original, 'utf-8');
    const why = (amend.stderr || amend.stdout || String(amend.error)).trim();
    return { ok: false, message: `${item.id}: memory amend failed (exit ${amend.status}): ${why}` };
  }
  const commits = gitOut(root, ['rev-list', '--count', `${before}..HEAD`]).trim();
  const paths = gitOut(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).split('\n').filter(Boolean);
  const subject = gitOut(root, ['log', '-1', '--format=%s']).trim();
  const type = item.kind === 'release' ? 'release' : 'task';
  if (commits !== '1' || paths.length !== 1 || paths[0] !== item.path || !subject.startsWith(`wf(${type}): amend ${item.id} [`)) {
    return {
      ok: false,
      message: `${item.id}: the amend left ${commits} commit(s), paths [${paths.join(', ')}], subject "${subject}"; expected one commit of ${item.path}`,
    };
  }
  out(`amended ${item.id} ${gitOut(root, ['rev-parse', '--short', 'HEAD']).trim()}\n`);
  return { ok: true, committed: true };
}

/** Parse argv into a mode, or a usage error. Pure. */
function parseArgs(argv) {
  const opts = { mode: 'plan', batch: null, id: null };
  const modes = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plan' || arg === '--print' || arg === '--run' || arg === '--check') modes.push(arg.slice(2));
    else if (arg === '--batch' || arg === '--edit') {
      const value = argv[i + 1];
      if (value === undefined) return { ok: false, message: `missing value for ${arg}` };
      i += 1;
      if (arg === '--edit') {
        modes.push('edit');
        opts.id = value;
      } else {
        if (!/^\d+$/.test(value)) return { ok: false, message: `--batch takes a number, got "${value}"` };
        opts.batch = Number(value);
      }
    } else return { ok: false, message: `unknown argument "${arg}"` };
  }
  if (modes.length > 1) return { ok: false, message: `choose one of --plan, --print, --run, --check, --edit` };
  if (modes.length === 1) opts.mode = modes[0];
  if ((opts.mode === 'print' || opts.mode === 'run') && opts.batch === null) return { ok: false, message: `--${opts.mode} needs --batch <n>` };
  if ((opts.mode === 'plan' || opts.mode === 'edit') && opts.batch !== null) return { ok: false, message: `--batch does not apply to --${opts.mode}` };
  return { ok: true, ...opts };
}

/** The CLI. Returns the exit code. */
function main(argv, root, out, err) {
  const args = parseArgs(argv);
  if (!args.ok) {
    err(`${args.message}\n${USAGE}\n`);
    return 2;
  }
  const loaded = load(root);
  if (!loaded.ok) {
    err(`${loaded.message}\n`);
    return 1;
  }
  const all = loaded.batches;
  if (args.batch !== null && args.batch >= all.length) {
    err(`no batch ${args.batch}: batches are 0–${all.length - 1}\n`);
    return 2;
  }
  const selected = args.batch === null ? all : [all[args.batch]];

  if (args.mode === 'plan') {
    const counts = {};
    for (const entry of loaded.entries) counts[entry.wave ?? 'none'] = (counts[entry.wave ?? 'none'] ?? 0) + 1;
    out(`${RELEASE_ID}: waves [${WAVE_KEYS.join(', ')}]; ${loaded.entries.length} tasks: ` +
      `${[...WAVE_KEYS, 'none'].map((k) => `${k} ${counts[k] ?? 0}`).join(', ')}\n`);
    for (const entry of loaded.entries) out(`${entry.wave ?? 'none'}\t${entry.id}\n`);
    all.forEach((batch, n) => out(`batch ${n}: ${batch.length} amend(s), ${batch[0].id} … ${batch[batch.length - 1].id}\n`));
    return 0;
  }
  if (args.mode === 'print') {
    out(`# batch ${args.batch}: ${selected[0].length} amend(s), one commit each; run from the repository root after npm run build\n`);
    for (const item of selected[0]) out(`${printLines(item).join('\n')}\n`);
    return 0;
  }
  if (args.mode === 'edit') {
    const item = all.flat().find((candidate) => candidate.id === args.id);
    if (item === undefined) {
      err(`${args.id} is not in the mapping (no wave, or not a v0.3 task)\n`);
      return 1;
    }
    if (isDirty(root, item.path)) {
      err(`${item.id}: ${item.path} has uncommitted changes; commit or discard them, then retry\n`);
      return 1;
    }
    if (isApplied(item, readAtHead(root, item.path))) {
      out(`skip ${item.id}: HEAD already holds it\n`);
      return 0;
    }
    applyEdit(root, item);
    out(`edited ${item.path}\n`);
    return 0;
  }
  if (args.mode === 'run') {
    let committed = 0;
    for (const item of selected[0]) {
      const result = runItem(root, item, out);
      if (!result.ok) {
        err(`${result.message}\nstopped after ${committed} amend(s); fix the cause and run the same batch again (applied ids are skipped)\n`);
        return 1;
      }
      if (result.committed) committed += 1;
    }
    out(`batch ${args.batch}: ${committed} amend(s) committed, ${selected[0].length - committed} already applied\n`);
    return 0;
  }
  // check
  const total = selected.flat().length;
  const perBatch = selected.map((batch) => batch.filter((item) => !isApplied(item, readAtHead(root, item.path) ?? '')));
  const missing = perBatch.flat();
  if (missing.length > 0) {
    const numbers = args.batch === null ? perBatch.map((_, n) => n) : [args.batch];
    const where = perBatch.map((items, i) => `batch ${numbers[i]} ${items.length}`).filter((_, i) => perBatch[i].length > 0);
    const first = missing.slice(0, CHECK_LIST).map((item) => item.id).join(', ');
    err(`${missing.length} of ${total} not at HEAD (${where.join(', ')}); first: ${first}\n`);
    return 1;
  }
  out(`all ${total} at HEAD\n`);
  return 0;
}

if (require.main === module) {
  // A reader that closes the pipe early (`| head`) ends the output, not the run with a stack trace.
  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });
  process.exitCode = main(
    process.argv.slice(2),
    process.cwd(),
    (text) => process.stdout.write(text),
    (text) => process.stderr.write(text),
  );
}

module.exports = {
  BATCH_SIZE,
  RELEASE_ID,
  RELEASE_PATH,
  WAVE_KEYS,
  batches,
  deriveMapping,
  frontmatterOf,
  implementationNotes,
  isApplied,
  main,
  notesWave,
  parseArgs,
  printLines,
  reasonFor,
  shellQuote,
  taskReason,
};
