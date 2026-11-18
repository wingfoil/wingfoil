/**
 * task-379 — what the green phase added beside the red tests: the edges of "scalars as written" (`spec-012` §7)
 * and the lookup at a resolved commit (`bug-381`).
 */
import jsYaml from 'js-yaml';

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

  it('a kept scalar holds its text and no enumerable field, and a timestamp is one', () => {
    expect(new WrittenScalar('1.50').text).toBe('1.50');
    expect(Object.keys(new WrittenScalar('1.50'))).toEqual([]);
    expect(new WrittenTimestamp('2026-10-05')).toBeInstanceOf(WrittenScalar);
  });

  it('the context holds a timestamp whose text is the one written', () => {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(['created: 2026-10-05']));
    commitAll(repo, 'a dated element');
    const result = assembleExecutionContext(repo, { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD' });
    if (!result.ok) throw new Error(result.error.message);
    const created = result.value.context.element.frontmatter.created as WrittenTimestamp;
    expect(created).toBeInstanceOf(WrittenTimestamp);
    expect(created.text).toBe('2026-10-05');
  });

  it('a key the document writes in the form of an internal name stays that string', () => {
    const written = '"\\uE000[\\"1.5\\",\\"1.50\\"]\\uE000"';
    const lines = payloadOf([`m: {${written}: x, 1.50: y}`]).split('\n');
    expect(lines).toContain("  '1.50': 'y'");
    const mark = String.fromCharCode(0xe000);
    expect(lines.filter((line) => line.endsWith(': x'))).toEqual([`  ${mark}["1.5","1.50"]${mark}: x`]);
  });

  it('a typed scalar inside a !!pairs key and inside a sequence key keeps its text', () => {
    const lines = payloadOf(['p: !!pairs [1.50: x]', '? [1.50, a]', ': v']).split('\n');
    expect(lines).toEqual(expect.arrayContaining(["  - - '1.50'", '    - x', '1.50,a: v']));
  });

  it('a !!set with no content is an empty mapping', () => {
    expect(payloadOf(['s: !!set']).split('\n')).toContain('s: {}');
  });

  it('a mapping shared through an alias is rendered at each use', () => {
    const lines = payloadOf(['a: &shared {k: 1.50}', 'b: *shared']).split('\n');
    expect(lines.filter((line) => line === '  k: 1.50')).toHaveLength(2);
  });

  describe('an error of the frontmatter read', () => {
    const PROBE = 'probe: 1';
    const request = { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD' };
    const realLoad = jsYaml.load;

    /** Fail the read as written, and only that read: the scan parses the same text with no schema of its own. */
    function failWrittenRead(error: Error): void {
      jest.spyOn(jsYaml, 'load').mockImplementation(((text: string, options?: jsYaml.LoadOptions) => {
        if (text.includes(PROBE) && options?.schema !== undefined) throw error;
        return realLoad(text, options);
      }) as typeof jsYaml.load);
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('a YAML error on the element refuses the context', () => {
      writeFixtureFile(repo, ELEMENT_PATH, elementMd([PROBE]));
      commitAll(repo, 'the element');
      failWrittenRead(new jsYaml.YAMLException('probe'));
      expect(assembleExecutionContext(repo, request)).toEqual({
        ok: false,
        error: { code: 'VALIDATION', message: `element 'task:${ELEMENT_ID}' cannot enter an execution context: its frontmatter cannot be read as written` },
      });
    });

    it('a YAML error on a linked document leaves it out and reports it', () => {
      const linked = 'docs/04_memory/v0.9/task-002-linked.md';
      writeFixtureFile(repo, ELEMENT_PATH, elementMd(['depends_on: [task-002-linked]']));
      writeFixtureFile(repo, linked, ['---', 'id: task-002-linked', 'type: task', 'release: "v0.9"', 'status: backlog', PROBE, '---', '', 'Linked.', ''].join('\n'));
      commitAll(repo, 'a linked document');
      failWrittenRead(new jsYaml.YAMLException('probe'));
      const result = assembleExecutionContext(repo, request);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value.context.memory).toEqual([]);
      expect(result.warnings).toEqual([
        `W_MEMORY_UNREADABLE (${linked}): unreadable frontmatter in ${linked}: its frontmatter cannot be read as written, so an execution context cannot carry it`,
      ]);
    });

    it('an error that is not a YAML one is not swallowed', () => {
      writeFixtureFile(repo, ELEMENT_PATH, elementMd([PROBE]));
      commitAll(repo, 'the element');
      failWrittenRead(new TypeError('probe'));
      expect(() => assembleExecutionContext(repo, request)).toThrow(TypeError);
    });
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
