/**
 * task-171 — the Memory scan primitives fail closed on archived elements and are tolerant of files
 * they cannot read.
 *
 * - `dl-038` option 1: `listMemoryDocumentsByType` and `findMemoryDocumentByTypeAndId` (and its
 *   `…AtRev` sibling) exclude `deprecated`/`superseded` unless `includeArchived: true`.
 * - `bug-031`, `spec-017` §1.4: a document whose frontmatter does not parse is left out of a scan and
 *   reported as `W_MEMORY_UNREADABLE` (`unreadable frontmatter in <file>: <reason>`, `file`
 *   repository-relative), never thrown.
 * - `bug-164`: `memory search` returns only elements, documents with an `id` and a `type`.
 * - `bug-189`: one rule for both baselines — a symbolic link under a scan root is never followed and
 *   never parsed; a `.md` link is reported; a nested repository is skipped.
 */
import { mkdirSync, symlinkSync } from 'fs';
import { join } from 'path';

import {
  findMemoryDocumentById,
  findMemoryDocumentByIdAtRev,
  findMemoryDocumentByTypeAndId,
  findMemoryDocumentByTypeAndIdAtRev,
  listMemoryDocumentPaths,
  listMemoryDocumentPathsAtRev,
  listMemoryDocumentsByType,
  loadMemoryDocumentsAtRev,
  memoryUnreadableDiagnostic,
  searchMemoryDocuments,
  W_MEMORY_UNREADABLE,
} from '../../src/memory/query';
import type { MemoryYaml } from '../../src/memory/schema';
import type { Diagnostic } from '../../src/validation';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML: MemoryYaml = {
  version: 1.1,
  types: {
    task: { path: 'docs/04_memory/{release}/{id}.md' },
    adr: { path: 'docs/04_memory/design/adrs/{id}.md' },
  },
};

function doc(id: string, type: string, status: string, title = id): string {
  return ['---', `id: ${id}`, `type: ${type}`, `title: "${title}"`, `status: ${status}`, '---', '', `${title} body.`, ''].join('\n');
}

const BROKEN = 'docs/04_memory/v0.1/task-002-broken.md';
const BROKEN_TEXT = '---\nid: task-002-broken\ntype: task\ntitle: "unterminated\nstatus: draft\n---\n\nbody\n';

let repo: string;
afterEach(() => removeTempDir(repo));

function collect(): { diagnostics: Diagnostic[]; onDiagnostic: (d: Diagnostic) => void } {
  const diagnostics: Diagnostic[] = [];
  return { diagnostics, onDiagnostic: (d) => diagnostics.push(d) };
}

describe('dl-038 option 1 — the type-scoped primitives exclude archived elements unless asked', () => {
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-001-live.md', doc('task-001-live', 'task', 'draft'));
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-003-retired.md', doc('task-003-retired', 'task', 'deprecated'));
    writeFixtureFile(repo, 'docs/04_memory/design/adrs/adr-001-old.md', doc('adr-001-old', 'adr', 'superseded'));
    commitAll(repo, 'seed');
  });

  it('(red-first) listMemoryDocumentsByType leaves out deprecated and superseded by default', () => {
    expect(listMemoryDocumentsByType(repo, MEMORY_YAML, 'task').map((d) => d.id)).toEqual(['task-001-live']);
    expect(listMemoryDocumentsByType(repo, MEMORY_YAML, 'adr')).toEqual([]);
  });

  it('(red-first) listMemoryDocumentsByType includes them with includeArchived: true', () => {
    expect(listMemoryDocumentsByType(repo, MEMORY_YAML, 'task', { includeArchived: true }).map((d) => d.id)).toEqual([
      'task-001-live',
      'task-003-retired',
    ]);
    expect(listMemoryDocumentsByType(repo, MEMORY_YAML, 'adr', { includeArchived: true }).map((d) => d.id)).toEqual(['adr-001-old']);
  });

  it('(red-first) findMemoryDocumentByTypeAndId does not resolve an archived element by default', () => {
    expect(findMemoryDocumentByTypeAndId(repo, MEMORY_YAML, 'task', 'task-003-retired')).toBeUndefined();
    expect(findMemoryDocumentByTypeAndId(repo, MEMORY_YAML, 'adr', 'adr-001-old')).toBeUndefined();
    expect(findMemoryDocumentByTypeAndId(repo, MEMORY_YAML, 'task', 'task-001-live')?.path).toBe('docs/04_memory/v0.1/task-001-live.md');
  });

  it('(red-first) findMemoryDocumentByTypeAndId resolves it with includeArchived: true', () => {
    expect(findMemoryDocumentByTypeAndId(repo, MEMORY_YAML, 'adr', 'adr-001-old', { includeArchived: true })?.frontmatter.status).toBe('superseded');
  });

  it('(red-first) the at-commit sibling follows the same default', () => {
    expect(findMemoryDocumentByTypeAndIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task', 'task-003-retired')).toBeUndefined();
    expect(
      findMemoryDocumentByTypeAndIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task', 'task-003-retired', { includeArchived: true })?.frontmatter.status,
    ).toBe('deprecated');
  });

  it('(characterization) findMemoryDocumentById stays neutral: history and the verbs reach archived elements', () => {
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'task-003-retired')?.frontmatter.status).toBe('deprecated');
  });
});

describe('bug-031 / spec-017 §1.4 — a document whose frontmatter does not parse is reported, not thrown', () => {
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-001-good.md', doc('task-001-good', 'task', 'draft', 'Good task'));
    writeFixtureFile(repo, BROKEN, BROKEN_TEXT);
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-003-other.md', doc('task-003-other', 'task', 'draft', 'Other task'));
    commitAll(repo, 'seed');
  });

  it('memoryUnreadableDiagnostic builds spec-017\'s shape and message', () => {
    expect(memoryUnreadableDiagnostic('docs/x.md', 'bad indentation (5:1)')).toEqual({
      code: W_MEMORY_UNREADABLE,
      severity: 'warning',
      file: 'docs/x.md',
      path: '',
      message: 'unreadable frontmatter in docs/x.md: bad indentation (5:1)',
    });
    expect(W_MEMORY_UNREADABLE).toBe('W_MEMORY_UNREADABLE');
  });

  it('(red-first) searchMemoryDocuments returns the readable documents and reports the broken one by its relative path', () => {
    const { diagnostics, onDiagnostic } = collect();
    const ids = searchMemoryDocuments(repo, MEMORY_YAML, 'task', { onDiagnostic }).map((m) => m.id);
    expect(ids).toEqual(['task-001-good', 'task-003-other']);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: W_MEMORY_UNREADABLE, severity: 'warning', file: BROKEN, path: '' });
    // The first line of the YAML error, never js-yaml's multi-line excerpt.
    expect(diagnostics[0]!.message).toMatch(new RegExp(`^unreadable frontmatter in ${BROKEN}: .+\\(\\d+:\\d+\\)$`));
  });

  it('(red-first) a scan without a listener does not throw either', () => {
    expect(() => searchMemoryDocuments(repo, MEMORY_YAML, '')).not.toThrow();
    expect(() => listMemoryDocumentsByType(repo, MEMORY_YAML, 'task')).not.toThrow();
  });

  it('(red-first) a by-id lookup behind the broken file resolves, and reports it', () => {
    const { diagnostics, onDiagnostic } = collect();
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'task-003-other', { onDiagnostic })?.path).toBe('docs/04_memory/v0.1/task-003-other.md');
    expect(diagnostics.map((d) => d.file)).toEqual([BROKEN]);
    expect(findMemoryDocumentByTypeAndId(repo, MEMORY_YAML, 'task', 'task-003-other')?.id ?? 'found').toBeDefined();
  });

  it('(red-first) the same at a commit: lookup and full load are tolerant and name the file without the rev', () => {
    const { diagnostics, onDiagnostic } = collect();
    expect(findMemoryDocumentByIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task-003-other', { onDiagnostic })?.path).toBe(
      'docs/04_memory/v0.1/task-003-other.md',
    );
    expect(diagnostics.map((d) => d.file)).toEqual([BROKEN]);

    const all = collect();
    expect(loadMemoryDocumentsAtRev(repo, 'HEAD', MEMORY_YAML, { onDiagnostic: all.onDiagnostic }).map((d) => d.path)).toEqual([
      'docs/04_memory/v0.1/task-001-good.md',
      'docs/04_memory/v0.1/task-003-other.md',
    ]);
    expect(all.diagnostics.map((d) => d.file)).toEqual([BROKEN]);
  });
});

describe('bug-164 — memory search returns only elements', () => {
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-001-api.md', doc('task-001-api', 'task', 'draft', 'API design'));
    writeFixtureFile(repo, 'docs/04_memory/v0.1/X_plan.md', '# An old plan\n\nIt mentions the API too.\n');
    writeFixtureFile(repo, 'docs/04_memory/v0.1/no-type.md', '---\nid: no-type\ntitle: "API without a type"\n---\n');
    writeFixtureFile(repo, 'docs/04_memory/v0.1/no-id.md', '---\ntype: task\ntitle: "API without an id"\n---\n');
    commitAll(repo, 'seed');
  });

  it('(red-first) an unfiltered search leaves out a file with no frontmatter, no id, or no type — silently', () => {
    const { diagnostics, onDiagnostic } = collect();
    expect(searchMemoryDocuments(repo, MEMORY_YAML, '', { onDiagnostic }).map((m) => m.path)).toEqual(['docs/04_memory/v0.1/task-001-api.md']);
    expect(diagnostics).toEqual([]);
  });

  it('(red-first) so does a keyword search that matches their body or title', () => {
    expect(searchMemoryDocuments(repo, MEMORY_YAML, 'api').map((m) => m.id)).toEqual(['task-001-api']);
  });
});

describe('bug-189 — one rule for symbolic links and nested repositories in both baselines', () => {
  const LINK = 'docs/04_memory/v0.1/task-009-link.md';

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-001-real.md', doc('task-001-real', 'task', 'draft'));
    writeFixtureFile(repo, 'elsewhere/real.md', doc('task-009-link', 'task', 'draft'));
    symlinkSync('../../../elsewhere/real.md', join(repo, LINK));
    mkdirSync(join(repo, 'elsewhere/dir'), { recursive: true });
    writeFixtureFile(repo, 'elsewhere/dir/task-010-via-dir.md', doc('task-010-via-dir', 'task', 'draft'));
    symlinkSync('../../elsewhere/dir', join(repo, 'docs/04_memory/linked-dir'));
    commitAll(repo, 'seed with links');
    // A nested repository in the working tree: git records it as a gitlink at most, never as files.
    const nested = join(repo, 'docs/04_memory/nested');
    mkdirSync(nested, { recursive: true });
    git(nested, ['init', '--quiet']);
    writeFixtureFile(repo, 'docs/04_memory/nested/task-011-nested.md', doc('task-011-nested', 'task', 'draft'));
  });

  it('(red-first) the working-tree listing and the commit listing agree, and hold no link', () => {
    expect(listMemoryDocumentPaths(repo, MEMORY_YAML)).toEqual(['docs/04_memory/v0.1/task-001-real.md']);
    expect(listMemoryDocumentPathsAtRev(repo, 'HEAD', MEMORY_YAML)).toEqual(['docs/04_memory/v0.1/task-001-real.md']);
  });

  it('(red-first) a `.md` link is reported as W_MEMORY_UNREADABLE by both baselines, with the same diagnostic', () => {
    const tree = collect();
    expect(searchMemoryDocuments(repo, MEMORY_YAML, '', { onDiagnostic: tree.onDiagnostic }).map((m) => m.id)).toEqual(['task-001-real']);
    const head = collect();
    expect(loadMemoryDocumentsAtRev(repo, 'HEAD', MEMORY_YAML, { onDiagnostic: head.onDiagnostic }).map((d) => d.path)).toEqual([
      'docs/04_memory/v0.1/task-001-real.md',
    ]);
    expect(tree.diagnostics).toEqual([memoryUnreadableDiagnostic(LINK, 'a symbolic link is not read as a Memory document')]);
    expect(head.diagnostics).toEqual(tree.diagnostics);
  });

  it('(red-first) a lookup never resolves an id through a link', () => {
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'task-009-link')).toBeUndefined();
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'task-010-via-dir')).toBeUndefined();
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'task-011-nested')).toBeUndefined();
    expect(findMemoryDocumentByIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task-009-link')).toBeUndefined();
  });

  it('followSymlinks: true is the explain-only exception: the working-tree lookup follows the link', () => {
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'task-009-link', { followSymlinks: true })?.path).toBe(LINK);
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'task-010-via-dir', { followSymlinks: true })?.path).toBe(
      'docs/04_memory/linked-dir/task-010-via-dir.md',
    );
  });
});
