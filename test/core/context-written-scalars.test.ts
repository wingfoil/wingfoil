/**
 * task-379 — what the green phase added beside the red tests: the edges of "scalars as written" (`spec-012` §7)
 * and the lookup at a resolved commit (`bug-381`).
 */
import * as core from '../../src/core';
import { assembleExecutionContext, WrittenScalar, WrittenTimestamp } from '../../src/core/context';
import { loadMemoryYamlAtCommit } from '../../src/core/loaders';
import { findMemoryDocumentByTypeAndIdAtCommit } from '../../src/memory';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = 'version: 1.1\ntypes:\n  task:\n    path: "docs/04_memory/{release}/{id}.md"\n    id_pattern: "task-{n}-{slug}"\n';
const DNA_YAML = [
  'version: 1.1',
  'project:',
  '  name: Fixture',
  'modules:',
  '  - name: core',
  '    path: src/core',
  'stacks:',
  '  technologies:',
  '    - name: TypeScript',
  '      category: language',
  '  methodologies:',
  '    - name: TDD',
  'team:',
  '  members:',
  '    - name: Test User',
  '      roles: [ developer ]',
  '  roles:',
  '    - name: developer',
  'paths:',
  '  sources: [ src/ ]',
  '',
].join('\n');

const ELEMENT_ID = 'task-001-active';
const ELEMENT_PATH = `docs/04_memory/v0.2/${ELEMENT_ID}.md`;

function elementMd(extra: string[], status = 'backlog'): string {
  return ['---', `id: ${ELEMENT_ID}`, 'type: task', 'release: "v0.2"', `status: ${status}`, ...extra, '---', '', 'The body.', ''].join('\n');
}

describe('task-379 — the edges of scalars as written', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: []\nglobal: []\n');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  function payloadOf(extra: string[]): string {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(extra));
    commitAll(repo, 'the element');
    const result = assembleExecutionContext(repo, { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD' });
    if (!result.ok) throw new Error(result.error.message);
    return result.value.payload;
  }

  it('an explicit !!null with no text is written null', () => {
    expect(payloadOf(['bare: !!null']).split('\n')).toContain('bare: null');
  });

  it('an alias of a scalar repeats its text, with no anchor in the dump', () => {
    const lines = payloadOf(['first: &kept 1.50', 'second: *kept']).split('\n');
    expect(lines).toEqual(expect.arrayContaining(['first: 1.50', 'second: 1.50']));
  });

  it('a merge key still merges, each merged scalar keeping its text', () => {
    const lines = payloadOf(['base: &base {size: 0x1F}', 'merged:', '  <<: *base']).split('\n');
    expect(lines.filter((line) => line === '  size: 0x1F')).toHaveLength(2);
  });

  it('a kept scalar names itself by its text, and a timestamp is one', () => {
    expect(String(new WrittenScalar('1.50'))).toBe('1.50');
    expect(Object.prototype.toString.call(new WrittenScalar('1.50'))).toBe('[object WrittenScalar]');
    expect(new WrittenTimestamp('2026-10-05')).toBeInstanceOf(WrittenScalar);
  });

  it('the core barrel re-exports WrittenScalar', () => {
    expect(core.WrittenScalar).toBe(WrittenScalar);
  });

  describe('findMemoryDocumentByTypeAndIdAtCommit', () => {
    let sha: string;

    beforeEach(() => {
      writeFixtureFile(repo, ELEMENT_PATH, elementMd([], 'deprecated'));
      commitAll(repo, 'an archived element');
      sha = git(repo, ['rev-parse', 'HEAD']).trim();
    });

    it('finds an archived document only with includeArchived', () => {
      const memoryYaml = loadMemoryYamlAtCommit(repo, sha)!;
      expect(findMemoryDocumentByTypeAndIdAtCommit(repo, sha, memoryYaml, 'task', ELEMENT_ID)).toBeUndefined();
      expect(findMemoryDocumentByTypeAndIdAtCommit(repo, sha, memoryYaml, 'task', ELEMENT_ID, { includeArchived: true })?.path).toBe(ELEMENT_PATH);
    });

    it('answers undefined for an id the commit does not hold', () => {
      const memoryYaml = loadMemoryYamlAtCommit(repo, sha)!;
      expect(findMemoryDocumentByTypeAndIdAtCommit(repo, sha, memoryYaml, 'task', 'task-404-absent', { includeArchived: true })).toBeUndefined();
    });
  });
});
