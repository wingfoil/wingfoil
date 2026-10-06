/**
 * task-257 (`bug-241`, `dl-149`) — the `format:` key of a Memory **element**, read by the scan
 * primitives of `src/memory/query.ts`.
 *
 * An element is its template's copy (`spec-001`: "the scaffold is copied verbatim"), and the approver
 * ruled at the W2 B2 gate (task-251, decision 4) that elements keep the `format` their template
 * carries. So an element reads with the template's counter, `MEMORY_TEMPLATE_FORMAT`:
 *
 * - a **collection scan** (search, list by type, the snapshot at a commit) leaves a newer-format
 *   element out and reports it as `W_MEMORY_UNREADABLE`, naming the file and the `dl-149` refusal;
 * - a **lookup by id** that reaches the newer-format element the caller named refuses it with
 *   `E_INVALID_FORMAT` (exit 1), as a single-file read does; one it passes on the way is reported;
 * - an absent `format` reads as 1, and `format: 1` reads as it always did.
 *
 * Determinism (REQ-SYS-07): fixed fixtures, expectations in path order.
 */
import {
  findMemoryDocumentById,
  findMemoryDocumentByIdAtRev,
  findMemoryDocumentByTypeAndId,
  findMemoryDocumentByTypeAndIdAtRev,
  listMemoryDocumentsByType,
  loadMemoryDocumentsAtRev,
  loadMemoryDocumentSummary,
  loadMemoryDocumentSummaryAtRev,
  searchMemoryDocuments,
  W_MEMORY_UNREADABLE,
} from '../../src/memory/query';
import { MemoryYaml } from '../../src/memory/schema';
import { type Diagnostic, E_INVALID_FORMAT, EXIT_VALIDATION, ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = MemoryYaml.parse({ version: 1, types: { task: { path: 'docs/memory/task/{id}.md' } } });

const ABSENT = 'docs/memory/task/task-001-absent.md';
const ONE = 'docs/memory/task/task-002-one.md';
const NEWER = 'docs/memory/task/task-003-newer.md';
const AFTER = 'docs/memory/task/task-004-after.md';

const REFUSAL = 'this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil';

function element(id: string, formatLine: string | null): string {
  return ['---', `id: ${id}`, 'type: task', `title: "${id}"`, 'status: draft', ...(formatLine === null ? [] : [formatLine]), '---', '', 'Body.', ''].join('\n');
}

let repo: string;

beforeEach(() => {
  repo = makeTempGitRepo();
  writeFixtureFile(repo, ABSENT, element('task-001-absent', null));
  writeFixtureFile(repo, ONE, element('task-002-one', 'format: 1'));
  writeFixtureFile(repo, NEWER, element('task-003-newer', 'format: 2'));
  writeFixtureFile(repo, AFTER, element('task-004-after', null));
  commitAll(repo, 'seed');
});

afterEach(() => removeTempDir(repo));

/** What a scan reports for the newer-format element. */
const newerDiagnostic = (): Diagnostic =>
  expect.objectContaining({ code: W_MEMORY_UNREADABLE, severity: 'warning', file: NEWER, message: expect.stringContaining(REFUSAL) });

/** Run `read`, expecting the `dl-149` refusal of the newer-format element, named repository-relative. */
function expectRefused(read: () => unknown): void {
  let thrown: unknown;
  try {
    read();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ValidationError);
  const error = thrown as ValidationError;
  expect(error.exitCode).toBe(EXIT_VALIDATION);
  expect(error.issues).toEqual([{ code: E_INVALID_FORMAT, path: 'format', file: NEWER, message: REFUSAL }]);
}

describe('(red-first) a collection scan reports a newer-format element and leaves it out', () => {
  it('searchMemoryDocuments', () => {
    const diagnostics: Diagnostic[] = [];
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, '', { onDiagnostic: (d) => diagnostics.push(d) });
    expect(matches.map((match) => match.path)).toEqual([ABSENT, ONE, AFTER]);
    expect(diagnostics).toEqual([newerDiagnostic()]);
  });

  it('listMemoryDocumentsByType', () => {
    const diagnostics: Diagnostic[] = [];
    const listed = listMemoryDocumentsByType(repo, MEMORY_YAML, 'task', { onDiagnostic: (d) => diagnostics.push(d) });
    expect(listed.map((summary) => summary.path)).toEqual([ABSENT, ONE, AFTER]);
    expect(diagnostics).toEqual([newerDiagnostic()]);
  });

  it('loadMemoryDocumentsAtRev (the snapshot a context and a WIP count read)', () => {
    const diagnostics: Diagnostic[] = [];
    const documents = loadMemoryDocumentsAtRev(repo, 'HEAD', MEMORY_YAML, { onDiagnostic: (d) => diagnostics.push(d) });
    expect(documents.map((document) => document.path)).toEqual([ABSENT, ONE, AFTER]);
    expect(diagnostics).toEqual([newerDiagnostic()]);
  });
});

describe('(red-first) a lookup that names the newer-format element refuses it with E_INVALID_FORMAT, exit 1', () => {
  it.each([
    ['findMemoryDocumentById', () => findMemoryDocumentById(repo, MEMORY_YAML, 'task-003-newer')],
    ['findMemoryDocumentByIdAtRev', () => findMemoryDocumentByIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task-003-newer')],
    ['findMemoryDocumentByTypeAndId', () => findMemoryDocumentByTypeAndId(repo, MEMORY_YAML, 'task', 'task-003-newer')],
    ['findMemoryDocumentByTypeAndIdAtRev', () => findMemoryDocumentByTypeAndIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task', 'task-003-newer')],
    ['loadMemoryDocumentSummary', () => loadMemoryDocumentSummary(repo, NEWER)],
    ['loadMemoryDocumentSummaryAtRev', () => loadMemoryDocumentSummaryAtRev(repo, 'HEAD', NEWER)],
  ])('%s', (_name, read) => {
    expectRefused(read);
  });
});

describe('(red-first) a lookup that passes the newer-format element on its way reports it', () => {
  it.each([
    ['findMemoryDocumentById', (onDiagnostic: (d: Diagnostic) => void) => findMemoryDocumentById(repo, MEMORY_YAML, 'task-004-after', { onDiagnostic })],
    ['findMemoryDocumentByIdAtRev', (onDiagnostic: (d: Diagnostic) => void) => findMemoryDocumentByIdAtRev(repo, 'HEAD', MEMORY_YAML, 'task-004-after', { onDiagnostic })],
  ])('%s', (_name, read) => {
    const diagnostics: Diagnostic[] = [];
    expect(read((d) => diagnostics.push(d))?.path).toBe(AFTER);
    expect(diagnostics).toEqual([newerDiagnostic()]);
  });
});

describe('(characterization) an absent format reads as 1, and format: 1 reads as before', () => {
  it.each([
    ['absent', 'task-001-absent', ABSENT, undefined],
    ['1', 'task-002-one', ONE, 1],
  ])('format %s: found by id at both baselines, frontmatter unchanged, nothing reported', (_label, id, path, format) => {
    const diagnostics: Diagnostic[] = [];
    const onDiagnostic = (d: Diagnostic): number => diagnostics.push(d);
    expect(findMemoryDocumentById(repo, MEMORY_YAML, id, { onDiagnostic })?.frontmatter.format).toBe(format);
    expect(findMemoryDocumentByIdAtRev(repo, 'HEAD', MEMORY_YAML, id, { onDiagnostic })?.path).toBe(path);
    expect(loadMemoryDocumentSummary(repo, path).frontmatter.format).toBe(format);
    expect(diagnostics).toEqual([]);
  });
});
