/**
 * task-379 AC 1 and AC 2 — what `spec-012` §7 says a format-1 payload holds, through the public
 * `assembleExecutionContext` and `serializeExecutionContext`:
 *
 * - AC 1 (`bug-265`, ruling D1 (a)): no two bodies of a payload share a marker key. A relevant document whose
 *   `type` is not declared for its path, or whose `type:id` repeats another relevant document's, is left out and
 *   reported; an element whose key is a carried directive's refuses the context.
 * - AC 2 (`bug-267`, rulings D2 (a), D3 (a)): every null, boolean, integer, float and timestamp scalar of the
 *   carried frontmatter is kept as written, the DNA sections stay canonical, and the payload stays format 1.
 * - REQ-SYS-07: two assemblies and a third on a `git clone` at the same sha give the same bytes and warnings.
 */
import { mkdtempSync } from 'fs';
import { join } from 'path';

import {
  assembleExecutionContext,
  CONTEXT_PAYLOAD_FORMAT,
  serializeExecutionContext,
  WrittenTimestamp,
  type ContextRequest,
  type ExecutionContext,
} from '../../src/core/context';
import { commitAll, fixtureDirPrefix, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

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

const DIRECTIVE_BODY = '# Testing\n\nWrite the test first.';
const DIRECTIVE_MD = `---\nid: testing\nname: "testing"\ntype: directive\nkind: custom\ntitle: "testing"\n---\n\n${DIRECTIVE_BODY}\n`;

const ELEMENT_ID = 'task-001-active';
const ELEMENT_PATH = `docs/04_memory/v0.2/${ELEMENT_ID}.md`;

/** A document that scores on nothing but a link: another release, no tags, no title. */
function documentMd(type: string, id: string, options: { status?: string; release?: string; extra?: string[]; body?: string } = {}): string {
  const { status = 'backlog', release = 'v0.9', extra = [], body = `Body of ${id}.` } = options;
  return ['---', `id: ${id}`, `type: ${type}`, `release: "${release}"`, `status: ${status}`, ...extra, '---', '', body, ''].join('\n');
}

function elementMd(extra: string[] = []): string {
  return documentMd('task', ELEMENT_ID, { release: 'v0.2', extra });
}

function request(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD', ...overrides };
}

/** Walk a payload by `spec-012` §7's splitting rule: every body by its key, in order, repeats included. */
function markedBodies(payload: string): Array<{ key: string; body: string }> {
  const found: Array<{ key: string; body: string }> = [];
  let inside: string | undefined;
  let buffer: string[] = [];
  for (const line of payload.split('\n')) {
    if (inside !== undefined) {
      if (line === `<!-- end:${inside} -->`) {
        found.push({ key: inside, body: buffer.join('\n') });
        inside = undefined;
      } else buffer.push(line);
      continue;
    }
    const begin = /^<!-- begin:(.+) -->$/.exec(line);
    if (begin) {
      inside = begin[1]!;
      buffer = [];
    }
  }
  if (inside !== undefined) throw new Error(`unterminated body ${inside}`);
  return found;
}

/** Case g: the `<!-- begin: -->` lines outside bodies are pairwise distinct. */
function expectUniqueMarkers(payload: string): void {
  const keys = markedBodies(payload).map((entry) => entry.key);
  expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
}

function linesEqualTo(text: string, line: string): number {
  return text.split('\n').filter((candidate) => candidate === line).length;
}

function notDeclaredWarning(path: string, type: string): string {
  return `W_MEMORY_UNREADABLE (${path}): unreadable frontmatter in ${path}: its type '${type}' is not declared for its path, so an execution context cannot name it`;
}

function repeatWarning(path: string, carried: string): string {
  return `W_MEMORY_UNREADABLE (${path}): unreadable frontmatter in ${path}: its type and id repeat those of ${carried}, so an execution context cannot name it`;
}

/** The DNA sections a hand-built context needs, as `test/core/context-payload-format.test.ts` builds them. */
const HAND_BUILT_DNA = {
  project: { name: 'Fixture' },
  modules: [{ name: 'core', path: 'src/core' }],
  stacks: { technologies: [{ name: 'TypeScript', category: 'language' }], methodologies: [{ name: 'TDD' }] },
  team: { members: [{ name: 'Test User', roles: ['developer'] }], roles: [{ name: 'developer' }] },
};

/** A context built by hand, so a case depends on nothing but the serializer. */
function handBuilt(overrides: Partial<Record<keyof ExecutionContext, unknown>> = {}): ExecutionContext {
  return {
    role: 'developer',
    stateRef: '0123456789abcdef0123456789abcdef01234567',
    element: {
      path: ELEMENT_PATH,
      type: 'task',
      id: ELEMENT_ID,
      frontmatter: { id: ELEMENT_ID, type: 'task', status: 'in-progress' },
      body: '\nThe element.\n',
    },
    dna: HAND_BUILT_DNA,
    directives: [
      {
        path: 'directives/custom/testing.md',
        frontmatter: { id: 'testing', name: 'testing', type: 'directive', kind: 'custom', title: 'Testing' },
        body: '\nThe directive.\n',
      },
    ],
    memory: [],
    warnings: [],
    ...overrides,
  } as unknown as ExecutionContext;
}

function handBuiltDocument(path: string, type: string, id: string): Record<string, unknown> {
  return { path, type, id, status: 'accepted', frontmatter: { type, id, status: 'accepted' }, body: `\nBody at ${path}.\n`, score: 1000 };
}

/** The scalars of AC 2 case a: each line is written, and read back, as it stands. */
const REWRITTEN_TODAY = ['version: 1.50', 'mode: 0o17', 'hex: 0x1F', 'exp: 1e3', 'plus: +12', 'nothing: ~', 'flag: True', 'Nul: Null'];
/** Case a's one line whose written form is already the canonical dump, so it passes before the fix too. */
const ALREADY_CANONICAL = 'inf: .inf';
const WRITTEN_SCALARS = [...REWRITTEN_TODAY, ALREADY_CANONICAL];
const WRITTEN_COLLECTIONS = ['list: [1.50, ~, True, 0x1F]', 'nest: {a: 0o17, b: [+12]}'];
const NUMERIC_KEY = '1.50: numkey';
const QUOTED = ['qnum: "1.50"', 'qdate: "2026-10-05"'];
const DATE_KEYS = ['dates:', '  2026-10-05: first', '  2026-10-06: second'];

describe('task-379 — the integrity of the context payload (spec-012 §7)', () => {
  let repo: string;

  function writeElement(extra: string[] = []): void {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(extra));
  }

  function build(overrides: Partial<ContextRequest> = {}, root: string = repo) {
    const result = assembleExecutionContext(root, request(overrides));
    if (!result.ok) throw new Error(`expected a context, got ${result.error.code}: ${result.error.message}`);
    return { ...result.value, warnings: result.warnings };
  }

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', DIRECTIVE_MD);
    writeElement();
    commitAll(repo, 'seed');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  describe('AC 1 — every marker key of a payload is unique (bug-265, D1 (a))', () => {
    const STRAY_DIRECTIVE = 'docs/04_memory/v0.9/task-005-a.md';
    const STRAY_BUG = 'docs/04_memory/v0.9/task-007-astray.md';
    const FIRST_COPY = 'docs/04_memory/v0.9/task-006-dup-copy.md';
    const SECOND_COPY = 'docs/04_memory/v0.9/task-006-dup.md';

    describe('red-first', () => {
      it('(a) a linked document typed directive at a task path is left out and reported, and the directive keeps the only marker', () => {
        writeElement(['depends_on: [testing]']);
        writeFixtureFile(repo, STRAY_DIRECTIVE, documentMd('directive', 'testing', { body: 'The stray body.' }));
        commitAll(repo, 'a stray directive document');
        const { payload, warnings } = build();
        expect(linesEqualTo(payload, '<!-- begin:directive:testing -->')).toBe(1);
        expect(linesEqualTo(payload, '### directive:testing')).toBe(0);
        expect(payload).not.toContain('The stray body.');
        expect(markedBodies(payload).find((entry) => entry.key === 'directive:testing')?.body).toBe(DIRECTIVE_BODY);
        expect(warnings).toEqual([notDeclaredWarning(STRAY_DIRECTIVE, 'directive')]);
        expectUniqueMarkers(payload);
      });

      it('(b) a linked document typed bug at a task path is left out and reported', () => {
        writeElement(['depends_on: [bug-007-astray]']);
        writeFixtureFile(repo, STRAY_BUG, documentMd('bug', 'bug-007-astray', { body: 'The astray body.' }));
        commitAll(repo, 'a bug at a task path');
        const { payload, context, warnings } = build();
        expect(context.memory).toEqual([]);
        expect(payload).not.toContain('bug-007-astray');
        expect(payload).not.toContain('The astray body.');
        expect(warnings).toEqual([notDeclaredWarning(STRAY_BUG, 'bug')]);
        expectUniqueMarkers(payload);
      });

      it('(b) a linked document whose type is an inherited Object member is left out and reported', () => {
        writeElement(['depends_on: [task-008-proto]']);
        const path = 'docs/04_memory/v0.9/task-008-proto.md';
        writeFixtureFile(repo, path, documentMd('constructor', 'task-008-proto'));
        commitAll(repo, 'a type named after an Object member');
        const { payload, warnings } = build();
        expect(payload).not.toContain('constructor:task-008-proto');
        expect(warnings).toEqual([notDeclaredWarning(path, 'constructor')]);
      });

      it('(c) of two linked documents with one type and id, the first path is carried and the second reported', () => {
        writeElement(['depends_on: [task-006-dup]']);
        writeFixtureFile(repo, FIRST_COPY, documentMd('task', 'task-006-dup', { body: 'The first path.' }));
        writeFixtureFile(repo, SECOND_COPY, documentMd('task', 'task-006-dup', { body: 'The second path.' }));
        commitAll(repo, 'one key twice');
        const { payload, context, warnings } = build();
        expect(linesEqualTo(payload, '### task:task-006-dup')).toBe(1);
        expect(linesEqualTo(payload, '<!-- begin:task:task-006-dup -->')).toBe(1);
        expect(linesEqualTo(payload, '<!-- end:task:task-006-dup -->')).toBe(1);
        expect(context.memory.map((doc) => doc.path)).toEqual([FIRST_COPY]);
        expect(markedBodies(payload).find((entry) => entry.key === 'task:task-006-dup')?.body).toBe('The first path.');
        expect(payload).not.toContain('The second path.');
        expect(warnings).toEqual([repeatWarning(SECOND_COPY, FIRST_COPY)]);
        expectUniqueMarkers(payload);
      });

      describe('(d) the copy left out takes no slot in the bounds', () => {
        const OLDER = 'docs/04_memory/v0.1/task-006-dup.md';
        const NEWER = 'docs/04_memory/v0.2/task-006-dup.md';
        const OTHER = 'docs/04_memory/v0.9/task-009-other.md';

        beforeEach(() => {
          writeElement(['depends_on: [task-006-dup, task-009-other]']);
          // The copy in the element's own release ranks first (T2), and is the second in path order.
          writeFixtureFile(repo, OLDER, documentMd('task', 'task-006-dup', { release: 'v0.1', body: 'The first path.' }));
          writeFixtureFile(repo, NEWER, documentMd('task', 'task-006-dup', { release: 'v0.2', body: 'The second path.' }));
          writeFixtureFile(repo, OTHER, documentMd('task', 'task-009-other'));
          commitAll(repo, 'one key twice and another link');
        });

        it('maxDocs 1: the one slot goes to the copy that is carried', () => {
          const { payload, context, warnings } = build({ limits: { maxDocs: 1, maxBytes: 262144 } });
          expect(context.memory.map((doc) => doc.path)).toEqual([OLDER]);
          expect(warnings).toEqual([repeatWarning(NEWER, OLDER)]);
          expectUniqueMarkers(payload);
        });

        it('maxDocs 2: the second slot goes to the other linked document', () => {
          const { payload, context } = build({ limits: { maxDocs: 2, maxBytes: 262144 } });
          expect(context.memory.map((doc) => doc.path).sort()).toEqual([OLDER, OTHER]);
          expectUniqueMarkers(payload);
        });
      });

      it("(e) an element requested as directive:testing, where that directive is carried, refuses the context", () => {
        writeFixtureFile(repo, STRAY_DIRECTIVE, documentMd('directive', 'testing'));
        commitAll(repo, 'an element that collides with a directive');
        expect(assembleExecutionContext(repo, request({ element: { type: 'directive', id: 'testing' } }))).toEqual({
          ok: false,
          error: { code: 'VALIDATION', message: "marker key 'directive:testing' names two bodies of an execution context" },
        });
      });

      it('(f) serialize refuses two Memory documents of one key', () => {
        const memory = [handBuiltDocument('docs/a/adr-001-x.md', 'adr', 'adr-001-x'), handBuiltDocument('docs/b/adr-001-x.md', 'adr', 'adr-001-x')];
        expect(() => serializeExecutionContext(handBuilt({ memory }))).toThrow("marker key 'adr:adr-001-x' names two bodies of an execution context");
      });

      it('(f) serialize refuses a Memory document holding the key of a carried directive', () => {
        const memory = [handBuiltDocument('docs/a/testing.md', 'directive', 'testing')];
        expect(() => serializeExecutionContext(handBuilt({ memory }))).toThrow("marker key 'directive:testing' names two bodies of an execution context");
      });

      it("(f) serialize refuses a Memory document holding the element's key", () => {
        const memory = [handBuiltDocument('docs/a/copy.md', 'task', ELEMENT_ID)];
        expect(() => serializeExecutionContext(handBuilt({ memory }))).toThrow(`marker key 'task:${ELEMENT_ID}' names two bodies of an execution context`);
      });
    });

    describe('characterization', () => {
      it('(h) a deprecated first copy claims nothing: the second is carried and nothing is reported', () => {
        writeElement(['depends_on: [task-006-dup]']);
        writeFixtureFile(repo, FIRST_COPY, documentMd('task', 'task-006-dup', { status: 'deprecated', body: 'The archived copy.' }));
        writeFixtureFile(repo, SECOND_COPY, documentMd('task', 'task-006-dup', { body: 'The live copy.' }));
        commitAll(repo, 'an archived copy first');
        const { payload, context, warnings } = build();
        expect(context.memory.map((doc) => doc.path)).toEqual([SECOND_COPY]);
        expect(payload).toContain('The live copy.');
        expect(payload).not.toContain('The archived copy.');
        expect(warnings).toBeUndefined();
        expectUniqueMarkers(payload);
      });

      it('(i) a stray type and a repeated key on documents that score 0 are neither carried nor reported', () => {
        writeFixtureFile(repo, STRAY_DIRECTIVE, documentMd('directive', 'testing', { body: 'The stray body.' }));
        writeFixtureFile(repo, FIRST_COPY, documentMd('task', 'task-006-dup', { body: 'The first path.' }));
        writeFixtureFile(repo, SECOND_COPY, documentMd('task', 'task-006-dup', { body: 'The second path.' }));
        commitAll(repo, 'irrelevant strays');
        const { payload, context, warnings } = build();
        expect(context.memory).toEqual([]);
        expect(payload).not.toContain('The stray body.');
        expect(payload).not.toContain('task-006-dup');
        expect(warnings).toBeUndefined();
        expectUniqueMarkers(payload);
      });

      it("(j) a second file repeating the element's own type and id is neither carried nor reported", () => {
        writeFixtureFile(repo, 'docs/04_memory/v0.9/task-001-active-copy.md', documentMd('task', ELEMENT_ID, { body: 'The copy of the element.' }));
        commitAll(repo, 'a copy of the element');
        const { payload, context, warnings } = build();
        expect(context.memory).toEqual([]);
        expect(payload).not.toContain('The copy of the element.');
        expect(linesEqualTo(payload, `<!-- begin:task:${ELEMENT_ID} -->`)).toBe(1);
        expect(warnings).toBeUndefined();
        expectUniqueMarkers(payload);
      });

      it('a linked bug at the path its type declares is carried', () => {
        writeElement(['depends_on: [bug-010-home]']);
        writeFixtureFile(repo, 'docs/04_memory/bugs/bug-010-home.md', documentMd('bug', 'bug-010-home'));
        commitAll(repo, 'a bug where bugs live');
        const { payload, warnings } = build();
        expect(linesEqualTo(payload, '### bug:bug-010-home')).toBe(1);
        expect(warnings).toBeUndefined();
      });
    });
  });

  describe('AC 2 — every scalar is carried as written (bug-267, D2 (a), D3 (a))', () => {
    const LINKED = 'docs/04_memory/v0.9/task-002-linked.md';

    /** The same frontmatter on the element (section 1) and on a linked document (section 4). */
    function buildWith(lines: string[]) {
      writeElement(['depends_on: [task-002-linked]', ...lines]);
      writeFixtureFile(repo, LINKED, documentMd('task', 'task-002-linked', { extra: lines }));
      commitAll(repo, 'written scalars');
      const built = build();
      const [taskSection] = built.payload.split('\n## 2. Project DNA\n');
      const memorySection = built.payload.split('\n## 4. Relevant Memory (')[1] ?? '';
      return { ...built, taskSection: taskSection!, memorySection };
    }

    describe('red-first', () => {
      it.each(REWRITTEN_TODAY)('(a) %s stays unchanged in sections 1 and 4', (line) => {
        const { taskSection, memorySection } = buildWith(WRITTEN_SCALARS);
        expect({ line, section1: linesEqualTo(taskSection, line), section4: linesEqualTo(memorySection, line) }).toEqual({ line, section1: 1, section4: 1 });
      });

      it('(b) a flow list and a flow mapping come out in block form, each scalar unchanged', () => {
        const { taskSection, memorySection } = buildWith(WRITTEN_COLLECTIONS);
        for (const section of [taskSection, memorySection]) {
          expect(section).toContain('\nlist:\n  - 1.50\n  - ~\n  - True\n  - 0x1F\n');
          expect(section).toContain('\nnest:\n  a: 0o17\n  b:\n    - +12\n');
        }
      });

      it("(c) a mapping key written as a number keeps its text, quoted", () => {
        const { taskSection, memorySection } = buildWith([NUMERIC_KEY]);
        expect(linesEqualTo(taskSection, "'1.50': numkey")).toBe(1);
        expect(linesEqualTo(memorySection, "'1.50': numkey")).toBe(1);
      });

      it('(d) two date keys under one mapping build, each keeping its text', () => {
        const { taskSection, memorySection } = buildWith(DATE_KEYS);
        for (const section of [taskSection, memorySection]) {
          expect(section).toContain("\ndates:\n  '2026-10-05': first\n  '2026-10-06': second\n");
        }
      });

      it('the context serializes a kept scalar to JSON as its text', () => {
        const { context } = buildWith(WRITTEN_SCALARS);
        expect(JSON.stringify(context.element.frontmatter.version)).toBe('"1.50"');
      });
    });

    describe('characterization', () => {
      it(`(a) ${ALREADY_CANONICAL} stays unchanged in sections 1 and 4`, () => {
        const { taskSection, memorySection } = buildWith(WRITTEN_SCALARS);
        expect(linesEqualTo(taskSection, ALREADY_CANONICAL)).toBe(1);
        expect(linesEqualTo(memorySection, ALREADY_CANONICAL)).toBe(1);
      });

      it('(e) a quoted number and a quoted date stay strings, in the dump\'s single quotes', () => {
        const { taskSection, memorySection } = buildWith(QUOTED);
        for (const section of [taskSection, memorySection]) {
          expect(linesEqualTo(section, "qnum: '1.50'")).toBe(1);
          expect(linesEqualTo(section, "qdate: '2026-10-05'")).toBe(1);
        }
      });

      it('(f) a key with no value is written null', () => {
        const { taskSection, memorySection } = buildWith(['empty:']);
        expect(linesEqualTo(taskSection, 'empty: null')).toBe(1);
        expect(linesEqualTo(memorySection, 'empty: null')).toBe(1);
      });

      it('(g) a date stays unchanged and is still a WrittenTimestamp in the context', () => {
        const { taskSection, memorySection, context } = buildWith(['created: 2026-10-05']);
        expect(linesEqualTo(taskSection, 'created: 2026-10-05')).toBe(1);
        expect(linesEqualTo(memorySection, 'created: 2026-10-05')).toBe(1);
        expect(context.element.frontmatter.created).toBeInstanceOf(WrittenTimestamp);
      });

      it('(h) a number, a boolean and a null of a hand-built DNA section are dumped canonically', () => {
        const payload = serializeExecutionContext(handBuilt({ dna: { ...HAND_BUILT_DNA, project: { live: true, name: 'Fixture', none: null, ratio: 1.5 } } }));
        expect(payload).toContain('### project\n\n```yaml\nlive: true\nname: Fixture\nnone: null\nratio: 1.5\n```\n');
      });

      it('the payload stays format 1 (D3 (a))', () => {
        const { payload } = buildWith(WRITTEN_SCALARS);
        expect(CONTEXT_PAYLOAD_FORMAT).toBe(1);
        expect(payload.split('\n')[1]).toMatch(/^<!-- format: 1 \| /);
      });
    });
  });

  describe('REQ-SYS-07 — the same bytes from two assemblies and from a clone', () => {
    /** Every case of AC 1 and AC 2 that a payload can hold, the two date keys apart (they throw before the fix). */
    function writeEveryCase(extraScalars: string[] = []): void {
      const scalars = [...WRITTEN_SCALARS, ...WRITTEN_COLLECTIONS, NUMERIC_KEY, ...QUOTED, 'empty:', 'created: 2026-10-05', ...extraScalars];
      writeElement(['depends_on: [testing, bug-007-astray, task-006-dup, task-011-archived, task-002-linked]', ...scalars]);
      writeFixtureFile(repo, 'docs/04_memory/v0.9/task-002-linked.md', documentMd('task', 'task-002-linked', { extra: scalars }));
      writeFixtureFile(repo, 'docs/04_memory/v0.9/task-005-a.md', documentMd('directive', 'testing'));
      writeFixtureFile(repo, 'docs/04_memory/v0.9/task-007-astray.md', documentMd('bug', 'bug-007-astray'));
      writeFixtureFile(repo, 'docs/04_memory/v0.9/task-006-dup-copy.md', documentMd('task', 'task-006-dup', { body: 'The first path.' }));
      writeFixtureFile(repo, 'docs/04_memory/v0.9/task-006-dup.md', documentMd('task', 'task-006-dup', { body: 'The second path.' }));
      writeFixtureFile(repo, 'docs/04_memory/v0.9/task-011-archived-copy.md', documentMd('task', 'task-011-archived', { status: 'deprecated' }));
      writeFixtureFile(repo, 'docs/04_memory/v0.9/task-011-archived.md', documentMd('task', 'task-011-archived'));
      writeFixtureFile(repo, 'docs/04_memory/v0.8/task-005-b.md', documentMd('directive', 'testing'));
      writeFixtureFile(repo, 'docs/04_memory/v0.8/task-001-active-copy.md', documentMd('task', ELEMENT_ID));
      commitAll(repo, 'every case');
    }

    function expectSameFromThreeAssemblies(): void {
      const sha = git(repo, ['rev-parse', 'HEAD']).trim();
      const parent = mkdtempSync(fixtureDirPrefix());
      try {
        const clone = join(parent, 'clone');
        git(parent, ['clone', '--quiet', repo, clone]);
        const first = build({ stateRef: sha });
        const second = build({ stateRef: sha });
        const third = build({ stateRef: sha }, clone);
        expect(second.payload).toBe(first.payload);
        expect(third.payload).toBe(first.payload);
        expect(second.warnings).toEqual(first.warnings);
        expect(third.warnings).toEqual(first.warnings);
      } finally {
        removeTempDir(parent);
      }
    }

    it('characterization: every case but the two date keys gives byte-identical payloads and equal warnings', () => {
      writeEveryCase();
      expectSameFromThreeAssemblies();
    });

    it('red-first: with the two date keys in the fixture too, the three assemblies still agree', () => {
      writeEveryCase(DATE_KEYS);
      expectSameFromThreeAssemblies();
    });

    it('(g) red-first: on the fixture holding every case, the begin markers are pairwise distinct', () => {
      writeEveryCase();
      expectUniqueMarkers(build().payload);
    });
  });
});
