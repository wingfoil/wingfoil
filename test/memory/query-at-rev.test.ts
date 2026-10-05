/**
 * The Memory scan at a revision (task-137, spec-012 §2 `stateRef`, spec-017 §1.3 "Memory documents are
 * enumerated from `HEAD`'s tree in sorted path order, never by directory listing order"). The scan
 * lists and parses exactly the documents commit `rev` holds, in the order `listMemoryDocumentPaths`
 * gives the working tree; a document added later, or present only in the working tree, is absent; the
 * by-id lookup answers with the frontmatter and body as of `rev`.
 */
import { RevisionError } from '../../src/core/revision';
import { MemoryYaml } from '../../src/memory/schema';
import {
  findMemoryDocumentByTypeAndIdAtRev,
  listMemoryDocumentPaths,
  listMemoryDocumentPathsAtRev,
  loadMemoryDocumentsAtRev,
  loadMemoryDocumentSummary,
  loadMemoryDocumentSummaryAtRev,
} from '../../src/memory/query';
import * as storage from '../../src/storage';
import { parseYaml } from '../../src/validation';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = MemoryYaml.parse(
  parseYaml(
    `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
    states:
      sequence: [ draft, pending, done ]
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
    id_pattern: "adr-{n}-{slug}"
    states:
      sequence: [ draft, accepted ]
  plan:
    path: "docs/05_plans/{scope}/{id}.md"
    id_pattern: "{phase}-{slug}-plan"
    states:
      sequence: [ draft, active, done ]
`,
    'memory.yaml',
  ),
);

const doc = (type: string, id: string, status: string, body: string): string =>
  `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n---\n\n${body}\n`;

describe('Memory scan at a revision (task-137)', () => {
  let repo: string;
  let first: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-2-b.md', doc('task', 'task-2-b', 'draft', 'B at first'));
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-1-a.md', doc('task', 'task-1-a', 'pending', 'A at first'));
    writeFixtureFile(repo, 'docs/04_memory/design/adrs/adr-1-x.md', doc('adr', 'adr-1-x', 'draft', 'X'));
    writeFixtureFile(repo, 'docs/05_plans/rl-v1/dev-loop-x-plan.md', doc('plan', 'dev-loop-x-plan', 'active', 'P'));
    writeFixtureFile(repo, 'docs/04_memory/v0.1/notes.txt', 'not markdown\n');
    writeFixtureFile(repo, 'src/elsewhere.md', 'outside every scan root\n');
    commitAll(repo, 'first');
    first = git(repo, ['rev-parse', 'HEAD']).trim();

    // A later commit: one document changed, one added.
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-1-a.md', doc('task', 'task-1-a', 'done', 'A LATER'));
    writeFixtureFile(repo, 'docs/04_memory/v0.2/task-3-c.md', doc('task', 'task-3-c', 'draft', 'C'));
    commitAll(repo, 'second');

    // The working tree: one more edit, one untracked document.
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-2-b.md', doc('task', 'task-2-b', 'done', 'B DIRTY'));
    writeFixtureFile(repo, 'docs/04_memory/v0.3/task-4-d.md', doc('task', 'task-4-d', 'draft', 'D'));
  });

  afterEach(() => removeTempDir(repo));

  it('lists exactly the documents committed at rev, in the order listMemoryDocumentPaths uses', () => {
    const atFirst = listMemoryDocumentPathsAtRev(repo, first, MEMORY_YAML);
    expect(atFirst).toEqual([
      'docs/04_memory/design/adrs/adr-1-x.md',
      'docs/04_memory/v0.1/task-1-a.md',
      'docs/04_memory/v0.1/task-2-b.md',
      'docs/05_plans/rl-v1/dev-loop-x-plan.md',
    ]);
    // Same comparator as the working-tree scan: the tree's list, minus what is not committed at `first`.
    const workingTree = listMemoryDocumentPaths(repo, MEMORY_YAML);
    expect(workingTree.filter((path) => atFirst.includes(path))).toEqual(atFirst);
  });

  it('a document added after rev, or present only in the working tree, is absent', () => {
    const atFirst = listMemoryDocumentPathsAtRev(repo, first, MEMORY_YAML);
    expect(atFirst).not.toContain('docs/04_memory/v0.2/task-3-c.md');
    expect(atFirst).not.toContain('docs/04_memory/v0.3/task-4-d.md');
    const atHead = listMemoryDocumentPathsAtRev(repo, 'HEAD', MEMORY_YAML);
    expect(atHead).toContain('docs/04_memory/v0.2/task-3-c.md');
    expect(atHead).not.toContain('docs/04_memory/v0.3/task-4-d.md');
  });

  it('loadMemoryDocumentsAtRev parses every listed document as of rev', () => {
    const docs = loadMemoryDocumentsAtRev(repo, first, MEMORY_YAML);
    expect(docs.map((entry) => entry.path)).toEqual(listMemoryDocumentPathsAtRev(repo, first, MEMORY_YAML));
    const byId = Object.fromEntries(docs.map((entry) => [entry.frontmatter.id, entry]));
    expect(byId['task-1-a']?.frontmatter.status).toBe('pending');
    expect(byId['task-1-a']?.body).toContain('A at first');
    expect(byId['task-2-b']?.body).toContain('B at first');
  });

  it('parses a committed document exactly as loadMemoryDocumentSummary parses the same bytes', () => {
    git(repo, ['stash', '--include-untracked', '--quiet']);
    try {
      const atHead = loadMemoryDocumentSummaryAtRev(repo, 'HEAD', 'docs/04_memory/v0.1/task-1-a.md');
      expect(atHead).toEqual(loadMemoryDocumentSummary(repo, 'docs/04_memory/v0.1/task-1-a.md'));
    } finally {
      git(repo, ['stash', 'pop', '--quiet']);
    }
  });

  it('loadMemoryDocumentSummaryAtRev is null for a path the commit does not hold', () => {
    expect(loadMemoryDocumentSummaryAtRev(repo, first, 'docs/04_memory/v0.2/task-3-c.md')).toBeNull();
  });

  it('the by-type-and-id lookup returns the frontmatter and body as of rev', () => {
    const atFirst = findMemoryDocumentByTypeAndIdAtRev(repo, first, MEMORY_YAML, 'task', 'task-1-a');
    expect(atFirst?.frontmatter.status).toBe('pending');
    expect(atFirst?.body).toContain('A at first');
    const atHead = findMemoryDocumentByTypeAndIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task', 'task-1-a');
    expect(atHead?.frontmatter.status).toBe('done');
    expect(findMemoryDocumentByTypeAndIdAtRev(repo, first, MEMORY_YAML, 'task', 'task-3-c')).toBeUndefined();
    expect(findMemoryDocumentByTypeAndIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task', 'task-4-d')).toBeUndefined();
    expect(findMemoryDocumentByTypeAndIdAtRev(repo, first, MEMORY_YAML, 'adr', 'task-1-a')).toBeUndefined();
  });

  it('reading at a revision leaves the working tree and the index untouched', () => {
    const before = git(repo, ['status', '--porcelain']);
    loadMemoryDocumentsAtRev(repo, first, MEMORY_YAML);
    findMemoryDocumentByTypeAndIdAtRev(repo, first, MEMORY_YAML, 'task', 'task-1-a');
    expect(git(repo, ['status', '--porcelain'])).toBe(before);
  });

  it('two calls with the same (root, rev) are deep-equal (REQ-SYS-07)', () => {
    expect(loadMemoryDocumentsAtRev(repo, first, MEMORY_YAML)).toEqual(loadMemoryDocumentsAtRev(repo, first, MEMORY_YAML));
    expect(listMemoryDocumentPathsAtRev(repo, first, MEMORY_YAML)).toEqual(listMemoryDocumentPathsAtRev(repo, first, MEMORY_YAML));
  });

  it.each([
    ['listMemoryDocumentPathsAtRev', (rev: string) => listMemoryDocumentPathsAtRev(repo, rev, MEMORY_YAML)],
    ['loadMemoryDocumentsAtRev', (rev: string) => loadMemoryDocumentsAtRev(repo, rev, MEMORY_YAML)],
    ['loadMemoryDocumentSummaryAtRev', (rev: string) => loadMemoryDocumentSummaryAtRev(repo, rev, 'docs/04_memory/v0.1/task-1-a.md')],
    ['findMemoryDocumentByTypeAndIdAtRev', (rev: string) => findMemoryDocumentByTypeAndIdAtRev(repo, rev, MEMORY_YAML, 'task', 'task-1-a')],
  ])('%s refuses an unknown or malformed rev with a RevisionError naming it', (_name, read) => {
    for (const [rev, code] of [
      ['no-such-ref', 'NOT_FOUND'],
      ['-x', 'VALIDATION'],
    ] as const) {
      let thrown: unknown;
      try {
        read(rev);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(RevisionError);
      expect((thrown as RevisionError).code).toBe(code);
      expect((thrown as RevisionError).message).toContain(JSON.stringify(rev));
    }
  });
});

describe('a commit git resolved but cannot list is a failed read, not an empty scan (task-137)', () => {
  it('listMemoryDocumentPathsAtRev throws E_GIT_READ_FAILED instead of answering []', () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, 'docs/04_memory/v0.1/task-1-a.md', doc('task', 'task-1-a', 'draft', 'A'));
      commitAll(repo, 'seed');
      const spy = jest.spyOn(storage, 'listBlobEntriesAtRev').mockReturnValue(null); // the scan lists through it since task-171 (bug-189)
      try {
        expect(() => listMemoryDocumentPathsAtRev(repo, 'HEAD', MEMORY_YAML)).toThrow(/E_GIT_READ_FAILED/);
      } finally {
        spy.mockRestore();
      }
    } finally {
      removeTempDir(repo);
    }
  });
});
