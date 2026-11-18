/**
 * task-379 AC 1 and AC 2 — what the `spec-012` §7 payload carries, through `assembleExecutionContext` and
 * `serializeExecutionContext`:
 *
 * - AC 1 (`bug-265`, ruling D1 (a)): every `<!-- begin:<key> -->` of a payload is unique. A relevant document whose
 *   `type` is not declared for its path, or whose `type` and `id` repeat those of a document carried, is left out and
 *   reported; an element colliding with a carried directive refuses the context.
 * - AC 2 (`bug-267`, ruling D2 (a)): every null, boolean, integer, float and timestamp scalar of the carried
 *   frontmatter stays as its document wrote it; strings keep the dump's quoting and the DNA sections stay canonical.
 *   The payload stays format 1 (ruling D3 (a)).
 * - Determinism (REQ-SYS-07): two assemblies, and a third on a `git clone` at the same sha, give the same bytes and
 *   the same warnings.
 *
 * The case letters are those of the task's design tables.
 */
import {
  assembleExecutionContext,
  CONTEXT_PAYLOAD_FORMAT,
  serializeExecutionContext,
  WrittenTimestamp,
  type ContextRequest,
  type ExecutionContext,
} from '../../src/core/context';
import { DEFAULT_CONTEXT_LIMITS } from '../../src/core/relevance';
import { cloneTempRepo, commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
  bug:
    path: "docs/04_memory/bugs/{id}.md"
    id_pattern: "bug-{n}-{slug}"
`;

const DNA_YAML = `
version: 1.1
project:
  name: Fixture
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
  methodologies:
    - name: TDD
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = 'version: 1.0\nassignments:\n  developer:\n    - testing\nglobal: []\n';

const DIRECTIVE_MD = '---\nid: testing\nname: "testing"\ntype: directive\nkind: custom\ntitle: "testing"\n---\n\n# Testing\n\nWrite the test first.\n';

const ELEMENT_ID = 'task-001-active';
const ELEMENT_PATH = `docs/04_memory/v0.2/${ELEMENT_ID}.md`;

interface DocumentFields {
  readonly id: string;
  readonly type?: string;
  readonly status?: string;
  readonly release?: string;
  readonly tags?: string;
  readonly extra?: readonly string[];
  readonly body?: string;
}

function documentMd(fields: DocumentFields): string {
  const { id, type = 'task', status = 'backlog', release = 'v0.2', tags = '[]', extra = [], body = `Body of ${id}.` } = fields;
  return ['---', `id: ${id}`, `type: ${type}`, `release: "${release}"`, `status: ${status}`, `tags: ${tags}`, ...extra, '---', '', body, ''].join('\n');
}

/** The subject element, linked by `depends_on:` to the ids given, which is what makes a document relevant. */
function elementMd(links: readonly string[], extra: readonly string[] = []): string {
  return documentMd({ id: ELEMENT_ID, tags: '[performance]', extra: [`depends_on: [${links.join(', ')}]`, ...extra] });
}

function request(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD', ...overrides };
}

function seedConfiguration(repo: string): void {
  writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', DIRECTIVE_MD);
}

function assemble(repo: string, overrides: Partial<ContextRequest> = {}) {
  const result = assembleExecutionContext(repo, request(overrides));
  if (!result.ok) throw new Error(`expected a context, got ${result.error.code}: ${result.error.message}`);
  return { ...result.value, warnings: result.warnings };
}

/** The keys of the begin markers outside any body, by `spec-012` §7's rule: a body runs to the first end marker of its key. */
function beginMarkerKeys(payload: string): string[] {
  const keys: string[] = [];
  let inside: string | undefined;
  for (const line of payload.split('\n')) {
    if (inside !== undefined) {
      if (line === `<!-- end:${inside} -->`) inside = undefined;
      continue;
    }
    const begin = /^<!-- begin:(.+) -->$/.exec(line);
    if (begin) {
      inside = begin[1]!;
      keys.push(inside);
    }
  }
  return keys;
}

function repeatedMarkerKeys(payload: string): string[] {
  const keys = beginMarkerKeys(payload);
  return keys.filter((key, index) => keys.indexOf(key) !== index);
}

function linesEqualTo(payload: string, line: string): number {
  return payload.split('\n').filter((candidate) => candidate === line).length;
}

function undeclaredTypeWarning(path: string, type: string): string {
  return `W_MEMORY_UNREADABLE (${path}): unreadable frontmatter in ${path}: its type '${type}' is not declared for its path, so an execution context cannot name it`;
}

function repeatedKeyWarning(path: string, carriedPath: string): string {
  return `W_MEMORY_UNREADABLE (${path}): unreadable frontmatter in ${path}: its type and id repeat those of ${carriedPath}, so an execution context cannot name it`;
}

const MISPLACED_DIRECTIVE_PATH = 'docs/04_memory/v0.2/task-005-a.md';
const MISPLACED_BUG_PATH = 'docs/04_memory/v0.2/bug-005-misplaced.md';
/** `-` sorts before `.`, so this path comes first and is the copy carried. */
const FIRST_COPY_PATH = 'docs/04_memory/v0.2/task-006-dup-copy.md';
const SECOND_COPY_PATH = 'docs/04_memory/v0.2/task-006-dup.md';

/** A context built by hand, so a case depends on nothing but the serializer. */
function handBuiltContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    role: 'developer',
    stateRef: '0123456789abcdef0123456789abcdef01234567',
    element: {
      path: ELEMENT_PATH,
      type: 'task',
      id: ELEMENT_ID,
      frontmatter: { id: ELEMENT_ID, type: 'task', status: 'in-progress' },
      body: '\nElement body.\n',
    },
    dna: { modules: [] },
    directives: [],
    memory: [],
    warnings: [],
    ...overrides,
  } as unknown as ExecutionContext;
}

describe('task-379 AC 1 — every marker key of a payload is unique (bug-265, D1 (a))', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    seedConfiguration(repo);
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('(a) a linked document typed directive at a task path is left out and reported, and the directive keeps its one marker', () => {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(['testing']));
    writeFixtureFile(repo, MISPLACED_DIRECTIVE_PATH, documentMd({ id: 'testing', type: 'directive', body: 'Forged directive body.' }));
    commitAll(repo, 'a document typed directive');
    const { payload, warnings } = assemble(repo);
    expect(linesEqualTo(payload, '<!-- begin:directive:testing -->')).toBe(1);
    expect(linesEqualTo(payload, '### directive:testing')).toBe(0);
    expect(payload).not.toContain('Forged directive body.');
    expect(warnings).toEqual([undeclaredTypeWarning(MISPLACED_DIRECTIVE_PATH, 'directive')]);
    expect(repeatedMarkerKeys(payload)).toEqual([]);
  });

  it('(b) a linked document typed bug at a task path is left out and reported', () => {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(['bug-005-misplaced']));
    writeFixtureFile(repo, MISPLACED_BUG_PATH, documentMd({ id: 'bug-005-misplaced', type: 'bug', body: 'Misplaced bug body.' }));
    commitAll(repo, 'a bug at a task path');
    const { payload, context, warnings } = assemble(repo);
    expect(context.memory).toEqual([]);
    expect(linesEqualTo(payload, '### bug:bug-005-misplaced')).toBe(0);
    expect(payload).not.toContain('Misplaced bug body.');
    expect(warnings).toEqual([undeclaredTypeWarning(MISPLACED_BUG_PATH, 'bug')]);
    expect(repeatedMarkerKeys(payload)).toEqual([]);
  });

  it('(c) of two linked documents with one type and id, the first path is carried and the second reported', () => {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(['task-006-dup']));
    writeFixtureFile(repo, FIRST_COPY_PATH, documentMd({ id: 'task-006-dup', body: 'First copy body.' }));
    writeFixtureFile(repo, SECOND_COPY_PATH, documentMd({ id: 'task-006-dup', body: 'Second copy body.' }));
    commitAll(repo, 'two copies of one key');
    const { payload, context, warnings } = assemble(repo);
    expect(context.memory.map((doc) => doc.path)).toEqual([FIRST_COPY_PATH]);
    expect(linesEqualTo(payload, '### task:task-006-dup')).toBe(1);
    expect(linesEqualTo(payload, '<!-- begin:task:task-006-dup -->')).toBe(1);
    expect(linesEqualTo(payload, '<!-- end:task:task-006-dup -->')).toBe(1);
    expect(payload).toContain('First copy body.');
    expect(payload).not.toContain('Second copy body.');
    expect(warnings).toEqual([repeatedKeyWarning(SECOND_COPY_PATH, FIRST_COPY_PATH)]);
    expect(repeatedMarkerKeys(payload)).toEqual([]);
  });

  describe('(d) the copy left out takes no slot in the bounds', () => {
    beforeEach(() => {
      writeFixtureFile(repo, ELEMENT_PATH, elementMd(['task-006-dup', 'task-007-other']));
      writeFixtureFile(repo, FIRST_COPY_PATH, documentMd({ id: 'task-006-dup', body: 'First copy body.' }));
      writeFixtureFile(repo, SECOND_COPY_PATH, documentMd({ id: 'task-006-dup', body: 'Second copy body.' }));
      writeFixtureFile(repo, 'docs/04_memory/v0.2/task-007-other.md', documentMd({ id: 'task-007-other', body: 'Other body.' }));
      commitAll(repo, 'two copies and another linked document');
    });

    it('with maxDocs 1 the first copy is carried and the second reported', () => {
      const { payload, context, warnings } = assemble(repo, { limits: { ...DEFAULT_CONTEXT_LIMITS, maxDocs: 1 } });
      expect(context.memory.map((doc) => doc.path)).toEqual([FIRST_COPY_PATH]);
      expect(warnings).toEqual([repeatedKeyWarning(SECOND_COPY_PATH, FIRST_COPY_PATH)]);
      expect(repeatedMarkerKeys(payload)).toEqual([]);
    });

    it('with maxDocs 2 the second slot goes to the other linked document, not to the copy', () => {
      const { payload, context } = assemble(repo, { limits: { ...DEFAULT_CONTEXT_LIMITS, maxDocs: 2 } });
      expect(context.memory.map((doc) => doc.id)).toEqual(['task-006-dup', 'task-007-other']);
      expect(payload).toContain('Other body.');
      expect(repeatedMarkerKeys(payload)).toEqual([]);
    });
  });

  it("(e) an element requested as directive:testing, while that directive is carried, refuses the context", () => {
    writeFixtureFile(repo, MISPLACED_DIRECTIVE_PATH, documentMd({ id: 'testing', type: 'directive', body: 'Forged directive body.' }));
    commitAll(repo, 'a subject colliding with a directive');
    const result = assembleExecutionContext(repo, request({ element: { type: 'directive', id: 'testing' } }));
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: "marker key 'directive:testing' names two bodies of an execution context" },
    });
  });

  it('(f) serialize refuses a hand-built context holding two Memory documents of one key', () => {
    const doc = { type: 'task', id: 'task-006-dup', status: 'backlog', frontmatter: { id: 'task-006-dup' }, body: 'Body.', score: 1000 };
    const memory = [
      { ...doc, path: FIRST_COPY_PATH },
      { ...doc, path: SECOND_COPY_PATH },
    ];
    expect(() => serializeExecutionContext(handBuiltContext({ memory } as never))).toThrow(
      "marker key 'task:task-006-dup' names two bodies of an execution context",
    );
  });

  it('(g) the begin markers outside bodies are pairwise distinct with cases a, b and c in one fixture', () => {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(['testing', 'bug-005-misplaced', 'task-006-dup']));
    writeFixtureFile(repo, MISPLACED_DIRECTIVE_PATH, documentMd({ id: 'testing', type: 'directive' }));
    writeFixtureFile(repo, MISPLACED_BUG_PATH, documentMd({ id: 'bug-005-misplaced', type: 'bug' }));
    writeFixtureFile(repo, FIRST_COPY_PATH, documentMd({ id: 'task-006-dup' }));
    writeFixtureFile(repo, SECOND_COPY_PATH, documentMd({ id: 'task-006-dup' }));
    commitAll(repo, 'every collision in one fixture');
    expect(repeatedMarkerKeys(assemble(repo).payload)).toEqual([]);
  });

  it('(h) an archived first copy claims nothing: the second is carried and nothing is reported', () => {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(['task-006-dup']));
    writeFixtureFile(repo, FIRST_COPY_PATH, documentMd({ id: 'task-006-dup', status: 'deprecated', body: 'Archived copy body.' }));
    writeFixtureFile(repo, SECOND_COPY_PATH, documentMd({ id: 'task-006-dup', body: 'Live copy body.' }));
    commitAll(repo, 'an archived first copy');
    const { payload, context, warnings } = assemble(repo);
    expect(context.memory.map((doc) => doc.path)).toEqual([SECOND_COPY_PATH]);
    expect(payload).not.toContain('Archived copy body.');
    expect(warnings).toBeUndefined();
    expect(repeatedMarkerKeys(payload)).toEqual([]);
  });

  it('(i) documents of cases a and c that are not linked and score 0 are neither carried nor reported', () => {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd([]));
    writeFixtureFile(repo, 'docs/04_memory/v0.9/task-005-a.md', documentMd({ id: 'testing', type: 'directive', release: 'v0.9', body: 'Unrelated directive body.' }));
    writeFixtureFile(repo, 'docs/04_memory/v0.9/task-006-dup-copy.md', documentMd({ id: 'task-006-dup', release: 'v0.9', body: 'Unrelated first copy.' }));
    writeFixtureFile(repo, 'docs/04_memory/v0.9/task-006-dup.md', documentMd({ id: 'task-006-dup', release: 'v0.9', body: 'Unrelated second copy.' }));
    commitAll(repo, 'irrelevant collisions');
    const { payload, context, warnings } = assemble(repo);
    expect(context.memory).toEqual([]);
    expect(payload).not.toContain('Unrelated');
    expect(warnings).toBeUndefined();
    expect(repeatedMarkerKeys(payload)).toEqual([]);
  });

  it("(j) a second file repeating the element's own type and id is neither carried nor reported", () => {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd([]));
    writeFixtureFile(repo, `docs/04_memory/v0.3/${ELEMENT_ID}.md`, documentMd({ id: ELEMENT_ID, body: 'Copy of the element.' }));
    commitAll(repo, 'a copy of the element');
    const { payload, context, warnings } = assemble(repo);
    expect(context.memory).toEqual([]);
    expect(payload).not.toContain('Copy of the element.');
    expect(warnings).toBeUndefined();
    expect(repeatedMarkerKeys(payload)).toEqual([]);
  });
});

/** Every scalar form AC 2 (a) names, each one line of frontmatter and of the payload. */
const WRITTEN_SCALARS = ['version: 1.50', 'mode: 0o17', 'hex: 0x1F', 'exp: 1e3', 'plus: +12', 'nothing: ~', 'flag: True', 'Nul: Null', 'inf: .inf'];

const COLLECTIONS = ['list: [1.50, ~, True, 0x1F]', 'nest: {a: 0o17, b: [+12]}'];
const NUMERIC_KEY = '1.50: numkey';
const STRINGS_AND_EMPTY = ['qnum: "1.50"', 'qdate: "2026-10-05"', 'empty:', 'created: 2026-10-05'];
const TWO_DATE_KEYS = ['dates:', '  2026-10-05: first', '  2026-10-06: second'];

const SCALAR_LINES = [...WRITTEN_SCALARS, ...COLLECTIONS, NUMERIC_KEY, ...STRINGS_AND_EMPTY];
const LINKED_ID = 'task-002-linked';
const LINKED_PATH = `docs/04_memory/v0.2/${LINKED_ID}.md`;

/** `## 1. Task` of a payload: the element's frontmatter and body. */
function taskSection(payload: string): string {
  return payload.slice(payload.indexOf('## 1. Task'), payload.indexOf('## 2. Project DNA'));
}

/** `## 4. Relevant Memory` of a payload. */
function memorySection(payload: string): string {
  return payload.slice(payload.indexOf('## 4. Relevant Memory'));
}

describe('task-379 AC 2 — the scalars of the carried frontmatter stay as written (bug-267, D2 (a))', () => {
  let repo: string;
  let built: ReturnType<typeof assemble>;

  beforeAll(() => {
    repo = makeTempGitRepo();
    seedConfiguration(repo);
    writeFixtureFile(repo, ELEMENT_PATH, elementMd([LINKED_ID], SCALAR_LINES));
    writeFixtureFile(repo, LINKED_PATH, documentMd({ id: LINKED_ID, extra: SCALAR_LINES }));
    commitAll(repo, 'every scalar form');
    built = assemble(repo);
  });

  afterAll(() => {
    removeTempDir(repo);
  });

  describe.each([
    ['the element (section 1)', taskSection],
    ['a linked Memory document (section 4)', memorySection],
  ])('on %s', (_where, section) => {
    it.each(WRITTEN_SCALARS)('(a) %s is carried unchanged', (line) => {
      expect(linesEqualTo(section(built.payload), line)).toBe(1);
    });

    it('(b) a flow sequence is carried in block form, each scalar unchanged', () => {
      expect(section(built.payload)).toContain('\nlist:\n  - 1.50\n  - ~\n  - True\n  - 0x1F\n');
    });

    it('(b) a flow mapping is carried in block form, each scalar unchanged', () => {
      expect(section(built.payload)).toContain('\nnest:\n  a: 0o17\n  b:\n    - +12\n');
    });

    it("(c) a numeric key keeps its text, quoted as a mapping key", () => {
      expect(linesEqualTo(section(built.payload), "'1.50': numkey")).toBe(1);
    });

    it('(e) quoted scalars stay strings, in the quoting of the dump', () => {
      expect(linesEqualTo(section(built.payload), "qnum: '1.50'")).toBe(1);
      expect(linesEqualTo(section(built.payload), "qdate: '2026-10-05'")).toBe(1);
    });

    it('(f) a key with no value stays null', () => {
      expect(linesEqualTo(section(built.payload), 'empty: null')).toBe(1);
    });

    it('(g) a timestamp is carried unchanged', () => {
      expect(linesEqualTo(section(built.payload), 'created: 2026-10-05')).toBe(1);
    });
  });

  it('(g) the context still holds a timestamp as a WrittenTimestamp', () => {
    expect(built.context.element.frontmatter.created).toBeInstanceOf(WrittenTimestamp);
    expect(built.context.memory[0]!.frontmatter.created).toBeInstanceOf(WrittenTimestamp);
  });

  it('a float of the context renders to JSON as written', () => {
    expect(JSON.stringify(built.context.element.frontmatter.version)).toBe('"1.50"');
  });

  it('(d) two date keys under one mapping build, each key quoted with its text', () => {
    const dated = makeTempGitRepo();
    try {
      seedConfiguration(dated);
      writeFixtureFile(dated, ELEMENT_PATH, elementMd([], TWO_DATE_KEYS));
      commitAll(dated, 'two date keys');
      const { payload } = assemble(dated);
      expect(linesEqualTo(taskSection(payload), "  '2026-10-05': first")).toBe(1);
      expect(linesEqualTo(taskSection(payload), "  '2026-10-06': second")).toBe(1);
    } finally {
      removeTempDir(dated);
    }
  });

  it('(h) a number of a DNA section stays canonical through the serializer', () => {
    const dna = { project: { name: 'Fixture', rate: 1.5 }, modules: [] };
    const payload = serializeExecutionContext(handBuiltContext({ dna } as never));
    expect(linesEqualTo(payload, 'rate: 1.5')).toBe(1);
  });

  it('the payload stays format 1 (D3 (a))', () => {
    expect(CONTEXT_PAYLOAD_FORMAT).toBe(1);
  });
});

describe('task-379 — determinism of a payload holding the cases of AC 1 and AC 2 (REQ-SYS-07)', () => {
  /**
   * The cases a, b, c, h, i and j of AC 1 and the scalars of AC 2 in one repository. Cases e and f refuse rather than
   * render, so they have no bytes to compare.
   */
  function writeEveryCase(repo: string, elementExtra: readonly string[]): void {
    seedConfiguration(repo);
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(['testing', 'bug-005-misplaced', 'task-006-dup', 'task-008-archived', LINKED_ID], elementExtra));
    writeFixtureFile(repo, LINKED_PATH, documentMd({ id: LINKED_ID, extra: SCALAR_LINES }));
    writeFixtureFile(repo, MISPLACED_DIRECTIVE_PATH, documentMd({ id: 'testing', type: 'directive' }));
    writeFixtureFile(repo, MISPLACED_BUG_PATH, documentMd({ id: 'bug-005-misplaced', type: 'bug' }));
    writeFixtureFile(repo, FIRST_COPY_PATH, documentMd({ id: 'task-006-dup' }));
    writeFixtureFile(repo, SECOND_COPY_PATH, documentMd({ id: 'task-006-dup' }));
    writeFixtureFile(repo, 'docs/04_memory/v0.2/task-008-archived-copy.md', documentMd({ id: 'task-008-archived', status: 'deprecated' }));
    writeFixtureFile(repo, 'docs/04_memory/v0.2/task-008-archived.md', documentMd({ id: 'task-008-archived' }));
    writeFixtureFile(repo, 'docs/04_memory/v0.9/task-005-a.md', documentMd({ id: 'testing', type: 'directive', release: 'v0.9' }));
    writeFixtureFile(repo, `docs/04_memory/v0.3/${ELEMENT_ID}.md`, documentMd({ id: ELEMENT_ID }));
    commitAll(repo, 'every case in one fixture');
  }

  function expectSameBytes(repo: string): void {
    const sha = git(repo, ['rev-parse', 'HEAD']).trim();
    const clone = cloneTempRepo(repo);
    try {
      const first = assemble(repo, { stateRef: sha });
      const second = assemble(repo, { stateRef: sha });
      const cloned = assemble(clone, { stateRef: sha });
      expect(first.payload).toContain(`### task:${LINKED_ID}`);
      expect(second.payload).toBe(first.payload);
      expect(cloned.payload).toBe(first.payload);
      expect(second.warnings).toEqual(first.warnings);
      expect(cloned.warnings).toEqual(first.warnings);
    } finally {
      removeTempDir(clone);
    }
  }

  it('two assemblies and a third on a clone give the same bytes and warnings', () => {
    const repo = makeTempGitRepo();
    try {
      writeEveryCase(repo, SCALAR_LINES);
      expectSameBytes(repo);
    } finally {
      removeTempDir(repo);
    }
  });

  it('the same holds with two date keys under one mapping (AC 2 (d))', () => {
    const repo = makeTempGitRepo();
    try {
      writeEveryCase(repo, [...SCALAR_LINES, ...TWO_DATE_KEYS]);
      expectSameBytes(repo);
    } finally {
      removeTempDir(repo);
    }
  });
});
