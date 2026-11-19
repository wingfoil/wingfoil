/**
 * task-379, the red round after the second reject — frontmatters that hold the private-use character U+E000, through
 * the public `assembleExecutionContext` (`spec-012` §7, "Scalars as written" and "What never enters a payload"):
 *
 * - a merge key that gives one key two texts is left out and reported on a Memory document (linked, or relevant and
 *   ranked after `maxDocs`), and refuses the context on the element, whatever string the hidden value holds (rows 1-4);
 * - a key or a string that holds U+E000 and falls under no rule of §7 is carried as its own string (rows 5-11);
 * - `assembleExecutionContext` returns in every placement and never throws (row 13);
 * - one fixture holding rows 1 to 11 gives the same bytes and warnings twice and on a `git clone` (row 14).
 *
 * Row 12 (the constructs `test/core/context-payload-yaml-constructs.test.ts` pins) is that file, unchanged.
 *
 * U+E000 is written in this source only as the escape `\uE000`. In the YAML of a row it is the YAML escape `\uE000`
 * (or `\U0000E000`), except in the rows that say "raw", where the YAML text holds the character itself.
 */
import { assembleExecutionContext, type ContextRequest } from '../../src/core/context';
import { cloneTempRepo, commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

jest.setTimeout(180000);

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
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

/** The private-use character itself, as a payload line holds it. */
const PUA = '\uE000';
/** The YAML escape of the private-use character, as a row's YAML text writes it. */
const ESC = '\\uE000';
/** The long YAML escape of the private-use character. */
const LONG_ESC = '\\U0000E000';

const TWO_TEXTS = 'a merge key gives one of its frontmatter keys two texts';

interface Row {
  /** The row of the contract, and the variant within it. */
  readonly name: string;
  /** The frontmatter lines of the row, as the document writes them. */
  readonly lines: readonly string[];
}

interface CarriedRow extends Row {
  /**
   * The payload lines of the row, grouped: each group is a column-0 line of the YAML block followed by exactly the
   * indented lines right under it.
   */
  readonly groups: ReadonlyArray<readonly string[]>;
}

const M_150: readonly string[] = ['m:', "  '1.50': 'y'"];

/** Rows 1 to 4: a merge key gives one key two texts, whatever string the hidden value holds. */
const LEFT_OUT_ROWS: readonly Row[] = [
  { name: 'row 1', lines: [`m: {<<: {1.5: "${ESC}x${ESC}"}, 1.50: y}`] },
  { name: 'row 2, null between the marks', lines: [`m: {<<: {1.5: "${ESC}null${ESC}"}, 1.50: y}`] },
  { name: 'row 2, a JSON list between the marks', lines: [`m: {<<: {1.5: "${ESC}[\\"a\\",\\"b\\"]${ESC}"}, 1.50: y}`] },
  { name: 'row 2, the long escape', lines: [`m: {<<: {1.5: "${LONG_ESC}x${LONG_ESC}"}, 1.50: y}`] },
  { name: 'row 3, a list of merge sources', lines: [`m: {<<: [{1.5: a}, {1.50: "${ESC}x${ESC}"}]}`] },
  { name: 'row 3, the marks in a nested key', lines: [`m: {<<: {1.5: {"${ESC}x${ESC}": 1}}, 1.50: y}`] },
  { name: 'row 4, doubled marks and a second key', lines: [`m: {<<: {1.5: "${ESC}${ESC}x${ESC}${ESC}"}, 1.50: y}`, `n: "${ESC}"`] },
];

/** Rows 5 to 11: U+E000 in a key or a string that no rule of §7 leaves out. */
const CARRIED_ROWS: readonly CarriedRow[] = [
  {
    name: 'row 5, a key in the internal form beside its twin',
    lines: [`m: {"${ESC}[\\"1.5\\",\\"1.50\\"]${ESC}": x, 1.50: y}`],
    groups: [['m:', "  '1.50': 'y'", `  ${PUA}["1.5","1.50"]${PUA}: x`]],
  },
  {
    name: 'row 6, escaped',
    lines: [`note: "${ESC} pomodoro"`, 'm: {1.50: y}'],
    groups: [M_150, [`note: ${PUA} pomodoro`]],
  },
  {
    name: 'row 6, raw',
    lines: [`note: "${PUA} pomodoro"`, 'm: {1.50: y}'],
    groups: [M_150, [`note: ${PUA} pomodoro`]],
  },
  {
    name: 'row 7, a string in the internal form',
    lines: [`v: "${ESC}[\\"1.5\\",\\"1.50\\"]${ESC}"`, 'm: {1.50: y}'],
    groups: [M_150, [`v: ${PUA}["1.5","1.50"]${PUA}`]],
  },
  {
    name: 'row 8, a timestamp key',
    lines: ['2026-10-05: x', `n: "${ESC}"`],
    groups: [["'2026-10-05': x"], [`'n': ${PUA}`]],
  },
  {
    name: 'row 8, a null key',
    lines: ['m: {~: x}', `n: "${ESC}"`],
    groups: [['m:', "  '~': x"], [`'n': ${PUA}`]],
  },
  {
    name: 'row 8, !!pairs',
    lines: [`o: !!pairs [1.50: "${ESC}"]`],
    groups: [['o:', "  - - '1.50'", `    - ${PUA}`]],
  },
  {
    name: 'row 8, a sequence key',
    lines: [`? [1.50, "${ESC}"]`, ': v'],
    groups: [[`1.50,${PUA}: v`]],
  },
  {
    name: 'row 9, a block scalar line (raw)',
    lines: ['t: |', `  ${PUA}line`, 'm: {1.50: y}'],
    groups: [M_150, ['t: |', `  ${PUA}line`]],
  },
  {
    name: 'row 10, a plain mapping value (raw)',
    lines: [`m: {a: "${PUA}x"}`],
    groups: [['m:', `  a: ${PUA}x`]],
  },
  {
    name: 'row 11, in a comment only (raw)',
    lines: [`a: 1.50 # ${PUA}`],
    groups: [['a: 1.50']],
  },
];

const EVERY_ROW: readonly Row[] = [...LEFT_OUT_ROWS, ...CARRIED_ROWS];

function documentPath(id: string): string {
  return `docs/04_memory/v0.9/${id}.md`;
}

function documentMd(id: string, lines: readonly string[] = []): string {
  return ['---', `id: ${id}`, 'type: task', 'release: "v0.9"', 'status: backlog', ...lines, '---', '', `Body of ${id}.`, ''].join('\n');
}

function elementMd(lines: readonly string[] = []): string {
  return ['---', `id: ${ELEMENT_ID}`, 'type: task', 'release: "v0.2"', 'status: backlog', ...lines, '---', '', 'The element.', ''].join('\n');
}

function linksTo(ids: readonly string[]): string {
  return `depends_on: [${ids.join(', ')}]`;
}

function request(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD', ...overrides };
}

function maxDocs(count: number): Partial<ContextRequest> {
  return { limits: { maxDocs: count, maxBytes: 262144 } };
}

function twoTextsWarning(path: string): string {
  return `W_MEMORY_UNREADABLE (${path}): unreadable frontmatter in ${path}: ${TWO_TEXTS}, so an execution context cannot carry it`;
}

/** The lines of the first fenced YAML block after a heading line; none when the heading is absent. */
function yamlBlockAfter(payload: string, heading: string): string[] {
  const lines = payload.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) return [];
  const open = lines.indexOf('```yaml', start);
  if (open < 0) return [];
  const close = lines.indexOf('```', open);
  return lines.slice(open + 1, close);
}

/** For each expected group, the group as the block holds it: its head line and the indented lines right under it. */
function groupsIn(block: readonly string[], groups: ReadonlyArray<readonly string[]>): string[][] {
  return groups.map((group) => {
    const start = block.indexOf(group[0]!);
    if (start < 0) return [];
    const found = [block[start]!];
    for (const line of block.slice(start + 1)) {
      if (!line.startsWith(' ')) break;
      found.push(line);
    }
    return found;
  });
}

describe('task-379 — U+E000 in a frontmatter, through assembleExecutionContext (spec-012 §7)', () => {
  let repo: string;

  /** Row 13 holds on every assembly here: a throw fails the case as an assertion. */
  function assemble(overrides: Partial<ContextRequest> = {}, root = repo): ReturnType<typeof assembleExecutionContext> {
    let result: ReturnType<typeof assembleExecutionContext> | undefined;
    expect(() => {
      result = assembleExecutionContext(root, request(overrides));
    }).not.toThrow();
    return result!;
  }

  function build(overrides: Partial<ContextRequest> = {}, root = repo) {
    const result = assemble(overrides, root);
    if (!result.ok) throw new Error(`expected a context, got ${result.error.code}: ${result.error.message}`);
    return { ...result.value, warnings: result.warnings ?? [] };
  }

  /** Commit the element linked to the documents, each document with its own frontmatter lines. */
  function seed(documents: ReadonlyArray<readonly [string, readonly string[]]>, elementLines: readonly string[] = []): void {
    const links = documents.length > 0 ? [linksTo(documents.map(([id]) => id))] : [];
    writeFixtureFile(repo, ELEMENT_PATH, elementMd([...links, ...elementLines]));
    for (const [id, lines] of documents) writeFixtureFile(repo, documentPath(id), documentMd(id, lines));
    commitAll(repo, 'the fixture of this case');
  }

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', DIRECTIVE_MD);
    writeFixtureFile(repo, ELEMENT_PATH, elementMd());
    commitAll(repo, 'seed');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  describe('rows 1 to 4 — a merge key giving one key two texts', () => {
    for (const row of LEFT_OUT_ROWS) {
      it(`${row.name}, on a linked document: not carried, two-texts warning`, () => {
        seed([['task-002-linked', row.lines]]);
        const { payload, warnings, context } = build();
        expect(warnings).toEqual([twoTextsWarning(documentPath('task-002-linked'))]);
        expect(context.memory).toEqual([]);
        expect(payload).not.toContain('task:task-002-linked');
      });

      it(`${row.name}, on the element: refused as VALIDATION, ${TWO_TEXTS}`, () => {
        seed([], row.lines);
        const result = assemble();
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toBe(`element 'task:${ELEMENT_ID}' cannot enter an execution context: ${TWO_TEXTS}`);
      });

      it(`${row.name}, on a relevant sibling ranked after maxDocs: not carried, two-texts warning`, () => {
        seed([
          ['task-002-first', []],
          ['task-003-ranked-out', row.lines],
        ]);
        const { payload, warnings, context } = build(maxDocs(1));
        expect(warnings).toEqual([twoTextsWarning(documentPath('task-003-ranked-out'))]);
        expect(context.memory.map((doc) => doc.path)).toEqual([documentPath('task-002-first')]);
        expect(payload).not.toContain('task:task-003-ranked-out');
      });
    }
  });

  describe('rows 5 to 11 — U+E000 under no rule of §7 is carried as its own string', () => {
    for (const row of CARRIED_ROWS) {
      it(`${row.name}, on a linked document: carried as ${row.groups.map((group) => group.join(' / ')).join(' + ')}`, () => {
        seed([['task-002-linked', row.lines]]);
        const { payload, warnings, context } = build();
        expect(warnings).toEqual([]);
        expect(context.memory.map((doc) => doc.path)).toEqual([documentPath('task-002-linked')]);
        expect(groupsIn(yamlBlockAfter(payload, '### task:task-002-linked'), row.groups)).toEqual(row.groups);
      });

      it(`${row.name}, on the element: section 1 carries the same lines`, () => {
        seed([], row.lines);
        const { payload, warnings } = build();
        expect(warnings).toEqual([]);
        expect(groupsIn(yamlBlockAfter(payload, '## 1. Task'), row.groups)).toEqual(row.groups);
      });

      it(`${row.name}, on a relevant sibling ranked after maxDocs: neither carried nor reported`, () => {
        seed([
          ['task-002-first', []],
          ['task-003-ranked-out', row.lines],
        ]);
        const { payload, warnings, context } = build(maxDocs(1));
        expect(warnings).toEqual([]);
        expect(context.memory.map((doc) => doc.path)).toEqual([documentPath('task-002-first')]);
        expect(payload).not.toContain('task:task-003-ranked-out');
      });
    }
  });

  describe('row 13 — assembleExecutionContext returns in every placement, it never throws', () => {
    /** Assemble every row in one placement and name the rows that threw. */
    function rowsThatThrow(place: (row: Row) => void, overrides: Partial<ContextRequest> = {}): string[] {
      const thrown: string[] = [];
      for (const row of EVERY_ROW) {
        place(row);
        commitAll(repo, `the placement of ${row.name}`);
        try {
          assembleExecutionContext(repo, request(overrides));
        } catch (error) {
          thrown.push(`${row.name}: ${String(error)}`);
        }
      }
      return thrown;
    }

    it('on a linked document', () => {
      writeFixtureFile(repo, ELEMENT_PATH, elementMd([linksTo(['task-002-linked'])]));
      const place = (row: Row): void => writeFixtureFile(repo, documentPath('task-002-linked'), documentMd('task-002-linked', row.lines));
      expect(rowsThatThrow(place)).toEqual([]);
    });

    it('on the element', () => {
      const place = (row: Row): void => writeFixtureFile(repo, ELEMENT_PATH, elementMd(row.lines));
      expect(rowsThatThrow(place)).toEqual([]);
    });

    it('on a relevant sibling ranked after maxDocs', () => {
      writeFixtureFile(repo, ELEMENT_PATH, elementMd([linksTo(['task-002-first', 'task-003-ranked-out'])]));
      writeFixtureFile(repo, documentPath('task-002-first'), documentMd('task-002-first'));
      const place = (row: Row): void => writeFixtureFile(repo, documentPath('task-003-ranked-out'), documentMd('task-003-ranked-out', row.lines));
      expect(rowsThatThrow(place, maxDocs(1))).toEqual([]);
    });
  });

  describe('row 14 — one fixture holding rows 1 to 11', () => {
    it('gives byte-identical payloads and equal warnings twice and on a git clone', () => {
      const carriedDocuments = CARRIED_ROWS.map((row, index) => [`task-${100 + index}-carried`, row.lines] as const);
      const leftOutDocuments = LEFT_OUT_ROWS.map((row, index) => [`task-${300 + index}-left-out`, row.lines] as const);
      seed([...carriedDocuments, ...leftOutDocuments]);
      const sha = git(repo, ['rev-parse', 'HEAD']).trim();
      const clone = cloneTempRepo(repo);
      try {
        const limits = { ...maxDocs(carriedDocuments.length), stateRef: sha };
        const first = build(limits);
        const second = build(limits);
        const third = build(limits, clone);

        expect(second.payload).toBe(first.payload);
        expect(third.payload).toBe(first.payload);
        expect(second.warnings).toEqual(first.warnings);
        expect(third.warnings).toEqual(first.warnings);
        expect(first.context.memory.map((doc) => doc.path)).toEqual(carriedDocuments.map(([id]) => documentPath(id)));
        expect(first.warnings).toEqual(leftOutDocuments.map(([id]) => twoTextsWarning(documentPath(id))));
      } finally {
        removeTempDir(clone);
      }
    });
  });
});
