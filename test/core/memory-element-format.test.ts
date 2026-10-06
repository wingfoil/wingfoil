/**
 * task-257 (`bug-241`, `bug-243`, `dl-149`) — the `format:` key on the Memory commands.
 *
 * - **Elements (`bug-241`).** An element written in a format newer than this build reads
 *   (`MEMORY_TEMPLATE_FORMAT`, the counter of the template it was copied from) is refused by every
 *   transition verb and by `memory amend` — `VALIDATION`, exit 1, `E_INVALID_FORMAT`, the file named,
 *   "upgrade WingFoil", nothing written — whether `HEAD` records the newer format or only the working
 *   tree's content to commit does. `memory search` reports it as a `W_MEMORY_UNREADABLE` warning naming
 *   the file; `memory history` reports it when it passes it, and refuses it when it is the element named.
 * - **The template `memory amend` reads (`bug-243`).** A type whose committed template declares a
 *   newer (or a malformed) `format` is refused by `memory amend` with `memory add`'s own message.
 * - An absent `format` reads as 1 everywhere.
 *
 * Exercises the REAL registered operations in throwaway git repos. Determinism (REQ-SYS-07): fixed
 * fixtures and expectations, `it.each` rows in a fixed order.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import { resolveAddType } from '../../src/core/memory-add-type';
import { amendReservedFields } from '../../src/core/memory-amend';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const TEST_EMAIL = 'wf-test@example.invalid';
const TEST_NAME = 'WingFoil Test';

const DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${TEST_NAME}
      email: ${TEST_EMAIL}
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    id_pattern: "task-{counter:3}-{slug}"
    amendable: true
    template:
      file: "memory/templates/task.md"
      frontmatter:
        required: [title]
    states:
      sequence: [draft, pending, approved]
      gates:
        pending: { reject: draft }
      returns:
        approved: pending
`;

const TEMPLATE_PATH = '.wingfoil/memory/templates/task.md';

function template(formatLine: string | null): string {
  return ['---', 'id: ""', 'type: task', 'title: ""', 'status: draft', ...(formatLine === null ? [] : [formatLine]), 'tmpl_version: 261006', '---', '', '## Body', ''].join('\n');
}

function element(id: string, status: string, formatLine: string | null): string {
  return ['---', `id: ${id}`, 'type: task', `title: "Title of ${id}"`, `status: ${status}`, ...(formatLine === null ? [] : [formatLine]), '---', '', 'Original body.', ''].join('\n');
}

const pathOf = (id: string): string => `docs/memory/task/${id}.md`;

const REFUSAL = 'this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil';

type Result = CoreResult<unknown>;

function op(name: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" is not registered`);
  return operation.fn;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

let repo: string;

beforeEach(() => {
  repo = makeTempGitRepo();
  writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA);
  writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(repo, TEMPLATE_PATH, template('format: 1'));
  writeFixtureFile(repo, pathOf('task-001-draft-newer'), element('task-001-draft-newer', 'draft', 'format: 2'));
  writeFixtureFile(repo, pathOf('task-002-pending-newer'), element('task-002-pending-newer', 'pending', 'format: 2'));
  writeFixtureFile(repo, pathOf('task-003-approved-newer'), element('task-003-approved-newer', 'approved', 'format: 2'));
  writeFixtureFile(repo, pathOf('task-004-pending-absent'), element('task-004-pending-absent', 'pending', null));
  writeFixtureFile(repo, pathOf('task-005-pending-one'), element('task-005-pending-one', 'pending', 'format: 1'));
  commitAll(repo, 'seed');
});

afterEach(() => removeTempDir(repo));

/** Expect the `dl-149` refusal of `id`'s document: exit 1, the file named, HEAD and the file unchanged. */
async function expectRefused(name: string, id: string, options: Record<string, string> = {}): Promise<void> {
  const head = gitOut(repo, ['rev-parse', 'HEAD']);
  const before = readFileSync(join(repo, pathOf(id)), 'utf-8');
  const result = (await op(name)({ root: repo, positional: id, options })) as Result;
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(exitCodeForResult(result)).toBe(1);
  expect(result.error.code).toBe('VALIDATION');
  expect(result.error.message).toContain(`E_INVALID_FORMAT format (${pathOf(id)}): ${REFUSAL}`);
  expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(head);
  expect(readFileSync(join(repo, pathOf(id)), 'utf-8')).toBe(before);
}

describe('(red-first) an element committed in a newer format is refused by every transition verb and by memory amend (bug-241)', () => {
  it.each([
    ['memorySubmit', 'task-001-draft-newer', {}],
    ['memoryApprove', 'task-002-pending-newer', { reason: 'Approve it.' }],
    ['memoryReject', 'task-002-pending-newer', { reason: 'Reject it.' }],
    ['memoryDeprecate', 'task-002-pending-newer', { reason: 'Retire it.' }],
    ['memoryPark', 'task-003-approved-newer', { reason: 'Park it.' }],
  ])('%s %s', async (name, id, options) => {
    await expectRefused(name, id, options);
  });

  it('memoryAmend', async () => {
    const path = pathOf('task-002-pending-newer');
    writeFixtureFile(repo, path, readFileSync(join(repo, path), 'utf-8').replace('Original body.', 'Corrected body.'));
    await expectRefused('memoryAmend', 'task-002-pending-newer', { reason: 'Correct the body.' });
  });
});

describe('(red-first) a working-tree edit that writes a newer format is refused before it is committed (bug-241)', () => {
  it.each([
    ['memorySubmit', {}],
    ['memoryAmend', { reason: 'Correct the body.' }],
  ])('%s', async (name, options) => {
    const id = name === 'memorySubmit' ? 'task-004-pending-absent' : 'task-005-pending-one';
    if (name === 'memorySubmit') {
      // A draft at HEAD, so that submit's own edge exists.
      writeFixtureFile(repo, pathOf(id), element(id, 'draft', null));
      commitAll(repo, 'back to draft');
    }
    writeFixtureFile(repo, pathOf(id), element(id, name === 'memorySubmit' ? 'draft' : 'pending', 'format: 2').replace('Original body.', 'Edited body.'));
    await expectRefused(name, id, options);
  });
});

describe('(red-first) memory search and memory history report a newer-format element (bug-241)', () => {
  it('memory search: exit 0, the element left out, one warning naming the file per newer element', async () => {
    const result = (await op('memorySearch')({ root: repo, positional: 'Title' })) as Result;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value as { matches: { id: string }[] }).matches.map((match) => match.id)).toEqual(['task-004-pending-absent', 'task-005-pending-one']);
    expect(result.warnings).toEqual(
      ['task-001-draft-newer', 'task-002-pending-newer', 'task-003-approved-newer'].map(
        (id) => `W_MEMORY_UNREADABLE (${pathOf(id)}): unreadable frontmatter in ${pathOf(id)}: E_INVALID_FORMAT: ${REFUSAL}`,
      ),
    );
  });

  it('memory history of another element: exit 0, the newer elements it passed named as warnings', async () => {
    const result = (await op('memoryHistory')({ root: repo, positional: 'task-004-pending-absent' })) as Result;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings!.every((warning) => warning.includes(REFUSAL))).toBe(true);
  });

  it('memory history of the newer element itself: refused, exit 1, the file named', async () => {
    await expectRefused('memoryHistory', 'task-002-pending-newer');
  });
});

describe('(red-first) memory amend reads the committed template with memory add\'s format check (bug-243)', () => {
  it.each([
    ['format: 2', 'E_INVALID_FORMAT'],
    ['format: 1.5', 'E_VALIDATION'],
  ])('a committed template with %s: amend refused with memory add\'s message, exit 1, nothing written', async (formatLine, code) => {
    writeFixtureFile(repo, TEMPLATE_PATH, template(formatLine));
    commitAll(repo, 'template format');
    const add = resolveAddType(repo, 'task');
    expect(add.ok).toBe(false);
    if (add.ok) return;
    expect(add.error.message).toContain(code);

    const path = pathOf('task-004-pending-absent');
    writeFixtureFile(repo, path, readFileSync(join(repo, path), 'utf-8').replace('Original body.', 'Corrected body.'));
    const head = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = (await op('memoryAmend')({ root: repo, positional: 'task-004-pending-absent', options: { reason: 'Correct the body.' } })) as Result;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toBe(add.error.message);
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(head);
  });
});

describe('(characterization) an absent format reads as 1: the verbs and amend work as before', () => {
  it.each([
    ['absent', null],
    ['1', 'format: 1'],
  ])('template format %s, element format absent and 1: amend and approve succeed', async (_label, templateFormat) => {
    if (templateFormat === null) {
      // The seed's template says `format: 1`; this row commits one that says nothing.
      writeFixtureFile(repo, TEMPLATE_PATH, template(templateFormat));
      commitAll(repo, 'template format');
    }
    const path = pathOf('task-004-pending-absent');
    writeFixtureFile(repo, path, readFileSync(join(repo, path), 'utf-8').replace('Original body.', 'Corrected body.'));
    const amended = (await op('memoryAmend')({ root: repo, positional: 'task-004-pending-absent', options: { reason: 'Correct the body.' } })) as Result;
    expect(amended.ok ? null : amended.error.message).toBeNull();
    const approved = (await op('memoryApprove')({ root: repo, positional: 'task-005-pending-one', options: { reason: 'Approve it.' } })) as Result;
    expect(approved.ok ? null : approved.error.message).toBeNull();
    expect(gitOut(repo, ['log', '-2', '--format=%s'])).toBe(
      'wf(task): approve task-005-pending-one [pending → approved]\nwf(task): amend task-004-pending-absent [pending → pending]',
    );
  });
});

describe('(characterization) a committed template with an empty frontmatter block has no fields to read', () => {
  it('memory add resolves the type; memory amend keeps `release` reserved (fail safe), as before', () => {
    // A block holding only a comment: present, and parsed to no value at all.
    writeFixtureFile(repo, TEMPLATE_PATH, '---\n# no fields\n---\n\n## Body\n');
    commitAll(repo, 'empty template frontmatter');
    expect(resolveAddType(repo, 'task').ok).toBe(true);
    const memoryYaml = loadMemoryYamlAtHead(repo);
    if (memoryYaml === null) throw new Error('fixture bug: no memory.yaml at HEAD');
    expect(amendReservedFields(repo, memoryYaml, 'task')).toContain('release');
  });
});

describe('(review F2) only the format refusal is labelled as one; any other failure is not dressed up as it', () => {
  it('(red-first) memory history over an unreadable directory rethrows the filesystem error (EACCES), not a newer-format refusal', async () => {
    const locked = join(repo, 'docs/memory/task/locked');
    mkdirSync(locked);
    chmodSync(locked, 0o000);
    try {
      await expect(op('memoryHistory')({ root: repo, positional: 'task-999-absent' })).rejects.toThrow(/EACCES/);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('(characterization) a transition whose working-tree frontmatter does not parse keeps its YAML refusal, not the format one', async () => {
    const id = 'task-004-pending-absent';
    writeFixtureFile(repo, pathOf(id), '---\nid: task-004-pending-absent\ntype: task\ntitle: "unterminated\nstatus: pending\n---\n');
    const result = (await op('memoryApprove')({ root: repo, positional: id, options: { reason: 'Approve it.' } })) as Result;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).not.toContain('newer format');
    expect(result.error.message).not.toContain('E_INVALID_FORMAT');
  });
});

