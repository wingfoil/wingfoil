/**
 * task-171 — the commands over the Memory scan, once the scan is tolerant (`bug-031`, `bug-164`,
 * `bug-188`) and `atHeadOr` falls back only for a missing repository (`bug-201`).
 *
 * BDD: `P1.5-memory-search.feature` "Edge - a Memory file that cannot be read" and "Edge - a file
 * that is not a Memory element"; `P1.10-memory-history.feature` "Edge - a document with a revision
 * whose frontmatter does not parse" and "Edge - an unrelated document whose frontmatter does not
 * parse". The warning is `spec-017` §1.4's `W_MEMORY_UNREADABLE`, rendered by `formatDiagnostic`.
 */
import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { atHeadOr, RevisionError } from '../../src/core/revision';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import { E_GIT_READ_FAILED, StorageError } from '../../src/storage';
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync } from 'fs';
import { reconstructMemoryTransitions, verifyTransitionConsistency } from '../../src/memory/audit';
import { findMemoryDocumentById, listMemoryDocumentsByType, searchMemoryDocuments } from '../../src/memory/query';
import { ValidationError } from '../../src/validation';
import { tmpdir } from 'os';
import { join } from 'path';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
`;

const GOOD = 'docs/04_memory/v0.1/task-001-good.md';
const BROKEN = 'docs/04_memory/v0.1/task-002-broken.md';
const OTHER = 'docs/04_memory/v0.1/task-003-other.md';

function doc(id: string, status: string, title: string): string {
  return ['---', `id: ${id}`, 'type: task', `title: "${title}"`, `status: ${status}`, '---', '', `${title}.`, ''].join('\n');
}

type Result = { ok: boolean; value?: unknown; warnings?: readonly string[]; error?: { code: string; message: string } };

function op(name: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" is not registered`);
  return operation.fn;
}

const unreadableWarning = (file: string): RegExp =>
  new RegExp(`^W_MEMORY_UNREADABLE \\(${file.replace(/[./]/g, '\\$&')}\\): unreadable frontmatter in ${file.replace(/[./]/g, '\\$&')}: .+`);

let repo: string;
afterEach(() => removeTempDir(repo));

describe('memory search over a malformed file and non-elements (bug-031, bug-164)', () => {
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, GOOD, doc('task-001-good', 'draft', 'Good task'));
    writeFixtureFile(repo, BROKEN, '---\nid: task-002-broken\ntype: task\ntitle: "unterminated\nstatus: draft\n---\n');
    writeFixtureFile(repo, OTHER, doc('task-003-other', 'draft', 'Other task'));
    writeFixtureFile(repo, 'docs/04_memory/X_old-plan.md', '# Old plan\n\nGood task notes.\n');
    commitAll(repo, 'seed');
  });

  it('(red-first) exits 0 with the readable matches and one warning naming the broken file', async () => {
    const result = (await op('memorySearch')({ root: repo, positional: 'task' })) as Result;
    expect(result.ok).toBe(true);
    expect((result.value as { matches: { id: string }[] }).matches.map((m) => m.id)).toEqual(['task-001-good', 'task-003-other']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatch(unreadableWarning(BROKEN));
  });

  it('(red-first) every match carries an id and a type; the frontmatter-less plan is left out without a warning', async () => {
    const result = (await op('memorySearch')({ root: repo, positional: 'good' })) as Result;
    const matches = (result.value as { matches: { id?: string; type?: string; path: string }[] }).matches;
    expect(matches.map((m) => m.path)).toEqual([GOOD]);
    expect(matches.every((m) => typeof m.id === 'string' && typeof m.type === 'string')).toBe(true);
    expect(result.warnings).toHaveLength(1); // the broken file only
  });
});

describe('memory history (bug-031, bug-188)', () => {
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, GOOD, doc('task-001-good', 'draft', 'Good task'));
    commitAll(repo, 'wf(task): add task-001-good');
  });

  it('(red-first) an id sorting after an unrelated malformed document resolves, with a warning', async () => {
    writeFixtureFile(repo, BROKEN, '---\nid: task-002-broken\ntitle: "unterminated\n---\n');
    writeFixtureFile(repo, OTHER, doc('task-003-other', 'draft', 'Other task'));
    commitAll(repo, 'wf(task): add task-003-other');
    const result = (await op('memoryHistory')({ root: repo, positional: 'task-003-other' })) as Result;
    expect(result.ok).toBe(true);
    expect((result.value as { path: string }).path).toBe(OTHER);
    expect(result.warnings).toEqual([expect.stringMatching(unreadableWarning(BROKEN))]);
  });

  it('(red-first) a revision whose frontmatter does not parse is an entry with no state and an `unreadable` reason', async () => {
    writeFixtureFile(repo, GOOD, '---\nid: task-001-good\ntype: task\ntitle: "a: "b"\n  bad: [\nstatus: pending\n---\n');
    commitAll(repo, 'wf(task): submit task-001-good');
    const broken = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, GOOD, doc('task-001-good', 'pending', 'Good task'));
    commitAll(repo, 'docs: repair task-001-good');

    const result = (await op('memoryHistory')({ root: repo, positional: 'task-001-good' })) as Result;
    expect(result.ok).toBe(true);
    const entries = (result.value as { entries: Record<string, unknown>[] }).entries;
    expect(entries.map((e) => [e.from, e.to])).toEqual([
      [null, 'draft'],
      ['draft', null],
      [null, 'pending'],
    ]);
    expect(entries[1]!.unreadable).toEqual(expect.stringMatching(/\(\d+:\d+\)$/));
    // Only the unreadable entry gains the key: every other entry keeps its shape.
    expect('unreadable' in entries[0]!).toBe(false);
    expect('unreadable' in entries[2]!).toBe(false);
    expect(result.warnings).toEqual([expect.stringMatching(new RegExp(`^W_MEMORY_UNREADABLE \\(${GOOD.replace(/[./]/g, '\\$&')}\\): .*\\(at ${broken}\\)$`))]);
  });
});

describe('atHeadOr falls back only when there is no HEAD to read (bug-201)', () => {
  const failedRead = (): never => {
    throw new StorageError(E_GIT_READ_FAILED, 'git cat-file --batch failed: maxBuffer length exceeded');
  };

  it('(characterization) an unborn HEAD gives the fallback', () => {
    repo = makeTempGitRepo();
    expect(atHeadOr(repo, () => { throw new RevisionError('NOT_FOUND', 'HEAD'); }, null)).toBeNull();
  });

  it('(characterization) a root that is not a repository gives the fallback', () => {
    repo = mkdtempSync(join(tmpdir(), 'wf-norepo-'));
    expect(atHeadOr(repo, failedRead, 'fallback')).toBe('fallback');
  });

  it('(red-first) any other failed git read in a repository is thrown, not taken for "nothing committed"', () => {
    repo = makeTempGitRepo();
    expect(() => atHeadOr(repo, failedRead, null)).toThrow(StorageError);
  });

  it('(red-first) a git that cannot be spawned in a repository is a refusal by name', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    commitAll(repo, 'seed');
    const path = process.env.PATH;
    process.env.PATH = join(repo, 'no-such-bin');
    try {
      expect(() => loadMemoryYamlAtHead(repo)).toThrow(/E_GIT_READ_FAILED/);
    } finally {
      process.env.PATH = path;
    }
  });
});

// task-171 review (F1, F2): the strict read the consistency check and `check-governance` rely on, and
// the branches the tolerant scan left for a refusal to be worded.
describe('strict reads and refusal wording over unreadable documents (task-171 review)', () => {
  const BROKEN_TEXT = '---\nid: task-001-good\ntype: task\ntitle: "a: "b"\n  bad: [\nstatus: pending\n---\n';

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, GOOD, doc('task-001-good', 'draft', 'Good task'));
    commitAll(repo, 'wf(task): add task-001-good');
  });

  it('reconstructMemoryTransitions is tolerant by default and throws with { strict: true }; the consistency check is strict', () => {
    writeFixtureFile(repo, GOOD, BROKEN_TEXT);
    commitAll(repo, 'wf(task): approve task-001-good [draft → pending]');
    expect(reconstructMemoryTransitions(repo, GOOD).map((t) => t.toState)).toEqual(['draft', null]);
    expect(() => reconstructMemoryTransitions(repo, GOOD, { strict: true })).toThrow(ValidationError);
    expect(() => verifyTransitionConsistency(repo, GOOD)).toThrow(ValidationError);
  });

  it('a document whose committed frontmatter does not parse, valid in the working tree, is refused as not committed', async () => {
    writeFixtureFile(repo, BROKEN, '---\nid: task-002-broken\ntype: task\ntitle: "unterminated\nstatus: draft\n---\n');
    commitAll(repo, 'commit a malformed document');
    writeFixtureFile(repo, BROKEN, doc('task-002-broken', 'draft', 'Repaired'));
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const result = (await op('memorySubmit')({ root: repo, positional: 'task-002-broken' })) as Result;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.error?.message).toContain(`${BROKEN} is not committed at HEAD`);
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });
});

// task-171 re-review, finding A: the explain-only working-tree walk must not turn a filesystem error
// into the verb's outcome. Mode 000 does not block root, so the case is skipped there.
const runsAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;
(runsAsRoot ? describe.skip : describe)('an unreadable directory in the working tree (task-171 re-review)', () => {
  it('a transition on an absent id is still NOT_FOUND, never a thrown EACCES', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, GOOD, doc('task-001-good', 'draft', 'Good task'));
    commitAll(repo, 'wf(task): add task-001-good');
    const locked = join(repo, 'docs/04_memory/v0.1/locked');
    mkdirSync(locked);
    chmodSync(locked, 0o000);
    try {
      const result = (await op('memorySubmit')({ root: repo, positional: 'task-404-absent' })) as Result;
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
      expect(result.error?.message).toMatch(/^document not found: task-404-absent/);
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});

describe('search order and the explain-only walk (task-171 review)', () => {
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
  });

  it('two documents carrying one id are ordered by path (REQ-SYS-07: a total order)', () => {
    writeFixtureFile(repo, 'docs/04_memory/v0.2/task-009-twin.md', doc('task-009-twin', 'draft', 'Twin'));
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-009-twin.md', doc('task-009-twin', 'draft', 'Twin'));
    const yaml = { version: 1, types: { task: { path: 'docs/04_memory/{release}/{id}.md' } } };
    expect(searchMemoryDocuments(repo, yaml, 'twin').map((m) => m.path)).toEqual([
      'docs/04_memory/v0.1/task-009-twin.md',
      'docs/04_memory/v0.2/task-009-twin.md',
    ]);
  });

  it('listMemoryDocumentsByType orders by id, an id-less document by its path, and twins by path', () => {
    writeFixtureFile(repo, 'docs/04_memory/v0.2/task-009-twin.md', doc('task-009-twin', 'draft', 'Twin'));
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-009-twin.md', doc('task-009-twin', 'draft', 'Twin'));
    writeFixtureFile(repo, 'docs/04_memory/v0.1/a-no-id.md', '---\ntype: task\ntitle: "No id"\n---\n');
    const yaml = { version: 1, types: { task: { path: 'docs/04_memory/{release}/{id}.md' } } };
    expect(listMemoryDocumentsByType(repo, yaml, 'task').map((d) => d.path)).toEqual([
      'docs/04_memory/v0.1/a-no-id.md',
      'docs/04_memory/v0.1/task-009-twin.md',
      'docs/04_memory/v0.2/task-009-twin.md',
    ]);
  });

  it('the following walk passes over a dangling link instead of throwing', () => {
    writeFixtureFile(repo, GOOD, doc('task-001-good', 'draft', 'Good task'));
    symlinkSync(join(repo, 'no-such-target.md'), join(repo, 'docs/04_memory/v0.1/task-005-dangling.md'));
    const yaml = { version: 1, types: { task: { path: 'docs/04_memory/{release}/{id}.md' } } };
    expect(findMemoryDocumentById(repo, yaml, 'task-001-good', { followSymlinks: true })?.path).toBe(GOOD);
  });
});
