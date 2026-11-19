/**
 * task-379, the red round after the reject — the YAML constructs a carried frontmatter may hold, through the public
 * `assembleExecutionContext` (`spec-012` §7, "Scalars as written" and "What never enters a payload"):
 *
 * - a `!!set`, a merge key whose source holds no key, and a control character in a key are carried;
 * - a merge key that a key of the same text overrides is carried with the overriding value;
 * - two keys of one text, one key with two texts, and a frontmatter that contains itself are left out and reported on
 *   a Memory document, whatever the limits, and refuse the context on the element;
 * - two assemblies of one request give the same bytes, warnings and errors.
 *
 * The rows are numbered as in the round's contract: rows 1 to 16 in their own blocks, row 17 and row 18 at the end.
 */
import { assembleExecutionContext, type ContextRequest } from '../../src/core/context';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

jest.setTimeout(120000);

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

const SAME_TEXT = 'two of its frontmatter keys have the same text';
const TWO_TEXTS = 'a merge key gives one of its frontmatter keys two texts';
const CONTAINS_ITSELF = 'its frontmatter contains itself through an alias';

interface Row {
  /** The frontmatter lines of the row, as the document writes them. */
  readonly lines: readonly string[];
}

interface CarriedRow extends Row {
  /** The key whose block lines are compared. */
  readonly key: string;
  /** Exactly the lines the payload holds under that key. */
  readonly under: readonly string[];
  /** Lines the payload's YAML block holds at column 0, besides the key itself. */
  readonly alongside?: readonly string[];
}

interface LeftOutRow extends Row {
  readonly reason: string;
}

function carried(line: string, under: readonly string[], key = 'm'): CarriedRow {
  return { lines: [line], key, under };
}

/** Rows 1 to 4. */
const SET_ROWS: readonly CarriedRow[] = [
  carried('s: !!set {a: ~}', ['  a: ~'], 's'),
  carried('s: !!set {a: null}', ['  a: null'], 's'),
  carried('s: !!set {a: Null}', ['  a: Null'], 's'),
  carried('s: !!set {1.50: ~}', ["  '1.50': ~"], 's'),
  { lines: ['n: &n ~', 's: !!set {a: *n}'], key: 's', under: ['  a: ~'], alongside: ["'n': ~"] },
];

/** Row 7. */
const TIMESTAMP_MERGE_ROWS: readonly CarriedRow[] = [
  carried('m: {<<: 2026-10-05, b: 1}', ['  b: 1']),
  carried('m: {<<: [2026-10-05], b: 1}', ['  b: 1']),
];

/** Row 8: the merge table's "carried" rows. */
const MERGE_CARRIED_ROWS: readonly CarriedRow[] = [
  carried('m: {<<: {a: 1}, a: 2}', ['  a: 2']),
  { lines: ['d: &d {a: 1, b: 2}', 'm: {<<: *d, a: 9}'], key: 'm', under: ['  a: 9', '  b: 2'] },
  carried('m: {a: 2, <<: {a: 1}}', ['  a: 2']),
  carried('m: {<<: [{a: 1}, {a: 2}]}', ['  a: 1']),
  carried('m: {<<: {1.50: x}, 1.50: y}', ["  '1.50': 'y'"]),
  carried('m: {<<: {"1.50": x}, "1.50": y}', ["  '1.50': 'y'"]),
  carried('m: {<<: {1.5: x}, "1.5": y}', ["  '1.5': 'y'"]),
];

/** Row 16: the key is written with YAML escapes, so no control character enters this file. */
const CONTROL_KEY_ROW: CarriedRow = carried('m: {"\\x01a\\x02b\\x03": x, b: 1}', ['  "\\x01a\\x02b\\x03": x', '  b: 1']);

const CARRIED_ROWS: readonly CarriedRow[] = [...SET_ROWS, ...TIMESTAMP_MERGE_ROWS, ...MERGE_CARRIED_ROWS, CONTROL_KEY_ROW];

/** Row 9: the merge table's "left out, same text" rows. */
const SAME_TEXT_ROWS: readonly LeftOutRow[] = [
  'm: {<<: {"1.50": x}, 1.50: y}',
  'm: {<<: {1.50: x}, "1.50": y}',
  'm: {<<: [{"1.50": x}, {1.50: y}]}',
  'o: {m: {<<: {"1.50": x}, 1.50: y}}',
  'm: {<<: {"~": x}, ~: y}',
].map((line) => ({ lines: [line], reason: SAME_TEXT }));

/** Row 10: the merge table's "left out, two texts" rows. */
const TWO_TEXTS_ROWS: readonly LeftOutRow[] = [
  'm: {<<: {1.5: x}, 1.50: y}',
  'm: {<<: {"1.5": x}, 1.50: y}',
  'm: {<<: [{1.5: x}, {1.50: y}]}',
  'm: {<<: {null: x}, ~: y}',
].map((line) => ({ lines: [line], reason: TWO_TEXTS }));

/** Row 11. */
const CONTAINS_ITSELF_ROWS: readonly LeftOutRow[] = ['a: &x {b: *x}', 'a: &x [*x]'].map((line) => ({
  lines: [line],
  reason: CONTAINS_ITSELF,
}));

const LEFT_OUT_ROWS: readonly LeftOutRow[] = [...SAME_TEXT_ROWS, ...TWO_TEXTS_ROWS, ...CONTAINS_ITSELF_ROWS];

const EVERY_ROW: readonly Row[] = [...CARRIED_ROWS, ...LEFT_OUT_ROWS];

function title(row: Row): string {
  return row.lines.join(' + ');
}

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

function leftOutWarning(path: string, reason: string): string {
  return `W_MEMORY_UNREADABLE (${path}): unreadable frontmatter in ${path}: ${reason}, so an execution context cannot carry it`;
}

function elementRefusal(reason: string): string {
  return `element 'task:${ELEMENT_ID}' cannot enter an execution context: ${reason}`;
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

/** The indented lines right under a column-0 `key:` line of a YAML block; none when the line is absent. */
function linesUnder(block: readonly string[], key: string): string[] {
  const start = block.indexOf(`${key}:`);
  if (start < 0) return [];
  const under: string[] = [];
  for (const line of block.slice(start + 1)) {
    if (!line.startsWith('  ')) break;
    under.push(line);
  }
  return under;
}

describe('task-379 — the YAML constructs of a carried frontmatter (spec-012 §7)', () => {
  let repo: string;

  /** Row 17 holds on every assembly here: a throw fails the case as an assertion. */
  function assemble(overrides: Partial<ContextRequest> = {}): ReturnType<typeof assembleExecutionContext> {
    let result: ReturnType<typeof assembleExecutionContext> | undefined;
    expect(() => {
      result = assembleExecutionContext(repo, request(overrides));
    }).not.toThrow();
    return result!;
  }

  function build(overrides: Partial<ContextRequest> = {}) {
    const result = assemble(overrides);
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

  function expectCarried(row: CarriedRow, id: string): void {
    const { payload, warnings, context } = build();
    expect(warnings).toEqual([]);
    expect(context.memory.map((doc) => doc.path)).toEqual([documentPath(id)]);
    const block = yamlBlockAfter(payload, `### task:${id}`);
    expect(block).toContain(`${row.key}:`);
    expect(linesUnder(block, row.key)).toEqual(row.under);
    for (const line of row.alongside ?? []) expect(block).toContain(line);
  }

  function expectLeftOut(row: LeftOutRow, id: string): void {
    const { payload, warnings, context } = build();
    expect(context.memory).toEqual([]);
    expect(payload).not.toContain(`task:${id}`);
    expect(warnings).toEqual([leftOutWarning(documentPath(id), row.reason)]);
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

  describe('rows 1 to 4 — a !!set on a linked document is carried', () => {
    for (const row of SET_ROWS) {
      it(`${title(row)} holds ${row.under.join(', ')}`, () => {
        seed([['task-002-linked', row.lines]]);
        expectCarried(row, 'task-002-linked');
      });
    }
  });

  it('row 5 — a !!set on the element builds the context and section 1 holds its line', () => {
    seed([], ['s: !!set {a: ~}']);
    const { payload } = build();
    expect(linesUnder(yamlBlockAfter(payload, '## 1. Task'), 's')).toEqual(['  a: ~']);
  });

  it('row 6 — a !!set on a relevant sibling that maxDocs ranks out builds the context, not carried and not reported', () => {
    seed([
      ['task-002-first', []],
      ['task-003-sibling', ['s: !!set {a: ~}']],
    ]);
    const { payload, warnings, context } = build(maxDocs(1));
    expect(context.memory.map((doc) => doc.path)).toEqual([documentPath('task-002-first')]);
    expect(payload).not.toContain('task:task-003-sibling');
    expect(warnings).toEqual([]);
  });

  describe('row 7 — a merge key whose source is a timestamp adds no key', () => {
    for (const row of TIMESTAMP_MERGE_ROWS) {
      it(`${title(row)} holds only b, and no line text`, () => {
        seed([['task-002-linked', row.lines]]);
        expectCarried(row, 'task-002-linked');
        const block = yamlBlockAfter(build().payload, '### task:task-002-linked');
        expect(block.filter((line) => line.trim().startsWith('text'))).toEqual([]);
      });
    }
  });

  describe('row 8 — a merge key overridden by a key of the same text is carried', () => {
    for (const row of MERGE_CARRIED_ROWS) {
      it(`${title(row)} holds ${row.under.join(', ')}`, () => {
        seed([['task-002-linked', row.lines]]);
        expectCarried(row, 'task-002-linked');
      });
    }
  });

  describe('row 9 — two keys of one text leave a linked document out', () => {
    for (const row of SAME_TEXT_ROWS) {
      it(`${title(row)} is reported`, () => {
        seed([['task-002-linked', row.lines]]);
        expectLeftOut(row, 'task-002-linked');
      });
    }
  });

  describe('row 10 — one key with two texts leaves a linked document out', () => {
    for (const row of TWO_TEXTS_ROWS) {
      it(`${title(row)} is reported`, () => {
        seed([['task-002-linked', row.lines]]);
        expectLeftOut(row, 'task-002-linked');
      });
    }
  });

  describe('row 11 — a frontmatter that contains itself leaves a linked document out', () => {
    for (const row of CONTAINS_ITSELF_ROWS) {
      it(`${title(row)} is reported`, () => {
        seed([['task-002-linked', row.lines]]);
        expectLeftOut(row, 'task-002-linked');
      });
    }
  });

  describe('rows 12 to 14 — the same frontmatter on the element refuses the context', () => {
    for (const row of LEFT_OUT_ROWS) {
      it(`${title(row)}: VALIDATION, ${row.reason}`, () => {
        seed([], row.lines);
        const result = assemble();
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toBe(elementRefusal(row.reason));
      });
    }
  });

  describe('row 15 — a document left out takes no slot and is reported whatever the limits', () => {
    for (const row of LEFT_OUT_ROWS) {
      it(`${title(row)}, ranked after maxDocs: not carried, still reported`, () => {
        seed([
          ['task-002-first', []],
          ['task-003-left-out', row.lines],
        ]);
        const { payload, warnings, context } = build(maxDocs(1));
        expect(context.memory.map((doc) => doc.path)).toEqual([documentPath('task-002-first')]);
        expect(payload).not.toContain('task:task-003-left-out');
        expect(warnings).toEqual([leftOutWarning(documentPath('task-003-left-out'), row.reason)]);
      });

      it(`${title(row)}, ranked first: the next document takes the slot`, () => {
        seed([
          ['task-002-left-out', row.lines],
          ['task-003-next', []],
        ]);
        const { payload, warnings, context } = build(maxDocs(1));
        expect(context.memory.map((doc) => doc.path)).toEqual([documentPath('task-003-next')]);
        expect(payload).not.toContain('task:task-002-left-out');
        expect(warnings).toEqual([leftOutWarning(documentPath('task-002-left-out'), row.reason)]);
      });
    }
  });

  it('row 16 — a control character in a key is carried in its escaped form', () => {
    seed([['task-002-linked', CONTROL_KEY_ROW.lines]]);
    expectCarried(CONTROL_KEY_ROW, 'task-002-linked');
  });

  describe('row 17 — assembleExecutionContext never throws', () => {
    /** Assemble every row in one placement and name the rows that threw. */
    function rowsThatThrow(place: (row: Row) => void, overrides: Partial<ContextRequest> = {}): string[] {
      const thrown: string[] = [];
      for (const row of EVERY_ROW) {
        place(row);
        commitAll(repo, `the placement of ${title(row)}`);
        try {
          assembleExecutionContext(repo, request(overrides));
        } catch (error) {
          thrown.push(`${title(row)}: ${String(error)}`);
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

    it('on a relevant document ranked after maxDocs', () => {
      writeFixtureFile(repo, ELEMENT_PATH, elementMd([linksTo(['task-002-first', 'task-003-ranked-out'])]));
      writeFixtureFile(repo, documentPath('task-002-first'), documentMd('task-002-first'));
      const place = (row: Row): void => writeFixtureFile(repo, documentPath('task-003-ranked-out'), documentMd('task-003-ranked-out', row.lines));
      expect(rowsThatThrow(place, maxDocs(1))).toEqual([]);
    });
  });

  describe('row 18 — two assemblies of one request are identical', () => {
    it('one fixture of the document rows gives the same bytes and warnings twice', () => {
      const carriedDocuments = CARRIED_ROWS.map((row, index) => [`task-${100 + index}-carried`, row.lines] as const);
      const leftOutDocuments = LEFT_OUT_ROWS.map((row, index) => [`task-${300 + index}-left-out`, row.lines] as const);
      const rankedOut = ['task-800-ranked-out', ['s: !!set {a: ~}']] as const;
      const afterTheLimit = [SAME_TEXT_ROWS[0]!, TWO_TEXTS_ROWS[0]!, CONTAINS_ITSELF_ROWS[0]!].map(
        (row, index) => [`task-${900 + index}-after-the-limit`, row.lines, row.reason] as const,
      );
      seed([...carriedDocuments, ...leftOutDocuments, rankedOut, ...afterTheLimit.map(([id, lines]) => [id, lines] as const)]);

      const limits = maxDocs(carriedDocuments.length);
      const first = build(limits);
      const second = build(limits);

      expect(second.payload).toBe(first.payload);
      expect(second.warnings).toEqual(first.warnings);
      expect(first.context.memory.map((doc) => doc.path)).toEqual(carriedDocuments.map(([id]) => documentPath(id)));
      expect(first.warnings).toEqual([
        ...LEFT_OUT_ROWS.map((row, index) => leftOutWarning(documentPath(`task-${300 + index}-left-out`), row.reason)),
        ...afterTheLimit.map(([id, , reason]) => leftOutWarning(documentPath(id), reason)),
      ]);
    });

    for (const row of LEFT_OUT_ROWS) {
      it(`${title(row)} on the element gives the same error twice`, () => {
        seed([], row.lines);
        const first = assemble();
        const second = assemble();
        expect(first.ok).toBe(false);
        expect(second.ok).toBe(false);
        if (first.ok || second.ok) return;
        expect(second.error.code).toBe(first.error.code);
        expect(second.error.message).toBe(first.error.message);
      });
    }
  });
});
