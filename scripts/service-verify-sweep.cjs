#!/usr/bin/env node
/**
 * task-229 (`dl-130` step 4, Q3 (a); `dl-088`) — the `service` verify sweep before a publish: list every
 * `pending` and `active` service element's `verify:` command, with its status and owner role, for the
 * approver to run and record. It runs none of them: a `verify` reads a third-party account, and the agent
 * never acts inside one.
 *
 * Bound in `.wingfoil/workflows/bindings.yaml` as the check `services.verify-sweep` of `release-publishing`'s
 * `publish` phase, at `severity: warn`. What it asserts (testing T1) is that the list is complete — every
 * service file parses and every listed service names a `verify:` — not that any service is healthy.
 *
 * Reads the repository as committed at `HEAD` (command-baseline): the folder of `memory.yaml`'s
 * `types.service.path`, every `.md` in it through `git show`, in path order. Deterministic for a given commit.
 *
 * Usage: node scripts/service-verify-sweep.cjs [--root <repository>]   (default: the current directory)
 * Exit:  0 the checklist on stdout · 1 a service file that does not parse or a listed service with no `verify:`
 *        (the checklist is still printed; each problem is an `error:` line on stderr) · 2 usage or repository error
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { posix } = require('node:path');

const yaml = require('js-yaml');

const MEMORY_YAML = '.wingfoil/memory.yaml';
const LISTED = new Set(['pending', 'active']);
const SKIPPED = ['draft', 'deprecated'];

/**
 * @param {string} text a Memory document
 * @returns {{ ok: true, fields: Record<string, unknown> } | { ok: false, reason: string }}
 */
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (match === null) return { ok: false, reason: 'no leading --- block' };
  try {
    const fields = yaml.load(match[1]);
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return { ok: false, reason: 'not a mapping' };
    return { ok: true, fields };
  } catch (error) {
    return { ok: false, reason: String(error.reason ?? error.message) };
  }
}

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Sort the service documents into the ones the approver verifies, the ones skipped, and the problems.
 *
 * @param {ReadonlyArray<{ path: string, text: string }>} documents
 */
function serviceSweep(documents) {
  const listed = [];
  /** @type {Record<string, number>} */
  const skipped = Object.fromEntries(SKIPPED.map((status) => [status, 0]));
  const problems = [];
  const sorted = [...documents].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const doc of sorted) {
    const parsed = frontmatter(doc.text);
    if (!parsed.ok) {
      problems.push(`${doc.path}: unreadable frontmatter (${parsed.reason})`);
      continue;
    }
    const id = text(parsed.fields.id);
    const status = text(parsed.fields.status);
    if (status in skipped) {
      skipped[status] += 1;
      continue;
    }
    if (!LISTED.has(status)) {
      problems.push(`${doc.path}: service ${id} has status ${JSON.stringify(status)}, not one of the service machine's`);
      continue;
    }
    const verify = text(parsed.fields.verify);
    listed.push({ id, status, owner_role: text(parsed.fields.owner_role), verify, path: doc.path });
    if (verify === '') problems.push(`${doc.path}: service ${id} has no verify command`);
  }
  return { listed, skipped, problems };
}

/**
 * The checklist the approver works through.
 *
 * @param {ReturnType<typeof serviceSweep>} result
 * @param {{ commit: string }} source the commit the services were read at
 * @returns {string}
 */
function renderSweep(result, source) {
  const lines = [
    `# Service verify sweep — ${result.listed.length} services at ${source.commit}`,
    '',
    'For the approver: run each `verify` (read-only), and record its result with the date in the',
    "release-publishing phase plan. This script runs none of them (dl-130 step 4, dl-088).",
    '',
  ];
  for (const s of result.listed) {
    lines.push(`- [ ] ${s.id} — ${s.status}, owner_role ${s.owner_role}`, `      verify: ${s.verify}`);
  }
  lines.push('', `Not listed: ${SKIPPED.map((status) => `${result.skipped[status]} ${status}`).join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

/** @param {string} root @param {string[]} args */
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/**
 * The service folder and documents at `HEAD`.
 *
 * @param {string} root
 */
function readAtHead(root) {
  const rev = 'HEAD';
  const memoryPath = MEMORY_YAML;
  const commit = git(root, ['rev-parse', '--short', rev]).trim();
  const memory = yaml.load(git(root, ['show', `${rev}:${memoryPath}`]));
  const pattern = memory && memory.types && memory.types.service && memory.types.service.path;
  if (typeof pattern !== 'string' || !pattern.includes('{id}')) {
    throw new Error(`${MEMORY_YAML} at HEAD declares no service type with a path containing {id}`);
  }
  const folder = posix.dirname(pattern);
  const paths = git(root, ['ls-tree', '-r', '-z', '--name-only', rev, '--', `${folder}/`])
    .split('\0')
    .filter((path) => path.endsWith('.md') && posix.dirname(path) === folder);
  const documents = paths.map((path) => ({ path, text: git(root, ['show', `${rev}:${path}`]) }));
  return { commit, documents };
}

/**
 * @param {readonly string[]} argv
 * @returns {{ ok: true, root: string } | { ok: false, message: string }}
 */
function parseArgs(argv) {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') {
      if (i + 1 >= argv.length) return { ok: false, message: 'option --root needs a path' };
      root = argv[(i += 1)];
    } else {
      return { ok: false, message: `unknown argument ${argv[i]}` };
    }
  }
  return { ok: true, root };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    process.stderr.write(`error: ${args.message}\nhint: usage: node scripts/service-verify-sweep.cjs [--root <repository>]\n`);
    process.exitCode = 2;
  } else {
    let read;
    try {
      read = readAtHead(args.root);
    } catch (error) {
      const detail = String(error.stderr || error.message).trim().split('\n')[0];
      process.stderr.write(`error: cannot read the service elements at HEAD: ${detail}\n`);
      process.exitCode = 2;
    }
    if (read !== undefined) {
      const result = serviceSweep(read.documents);
      process.stdout.write(renderSweep(result, { commit: read.commit }));
      for (const problem of result.problems) process.stderr.write(`error: ${problem}\n`);
      process.exitCode = result.problems.length === 0 ? 0 : 1;
    }
  }
}

module.exports = { renderSweep, serviceSweep };
