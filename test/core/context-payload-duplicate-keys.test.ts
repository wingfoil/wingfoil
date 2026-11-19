/**
 * task-379 — two frontmatter keys of the same text (`spec-012` §7 "What never enters a payload", the design
 * addendum's cases a to h and k to m). Once every key is kept as written, `"1.50"` and `1.50` are one key, so:
 *
 * - a Memory document with that defect is left out and reported as `W_MEMORY_UNREADABLE`, decided over every
 *   document §6 would find relevant, before §6 bounds the set;
 * - an element with that defect refuses the context as `VALIDATION`.
 *
 * Everything goes through the public `assembleExecutionContext`. The spawn count of case m uses spies on
 * `child_process.spawnSync` / `execFileSync` that call through, as `test/core/context-spawn-count.test.ts` does.
 */
// The module object itself (not a namespace copy, whose bindings are read-only), so a spy replaces the function
// every `src/` caller looks up at call time.
import childProcess from 'child_process';

import { assembleExecutionContext, type ContextRequest } from '../../src/core/context';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

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
const DEFECT_ID = 'task-003-defect';
const DEFECT_PATH = `docs/04_memory/v0.9/${DEFECT_ID}.md`;
const OTHER_ID = 'task-009-other';
const OTHER_PATH = `docs/04_memory/v0.9/${OTHER_ID}.md`;

/** Case a's defect: two keys to the Memory scan, one text once each is kept as written. */
const SAME_TEXT = ['"1.50": x', '1.50: y'];
const DEFAULT_MAX_BYTES = 262144;
const DEFAULT_MAX_DOCS = 40;

/** A document that scores on nothing but a link: another release, no tags, no title. */
function documentMd(id: string, extra: string[] = [], body = `Body of ${id}.`): string {
  return ['---', `id: ${id}`, 'type: task', 'release: "v0.9"', 'status: backlog', ...extra, '---', '', body, ''].join('\n');
}

function elementMd(extra: string[]): string {
  return ['---', `id: ${ELEMENT_ID}`, 'type: task', 'release: "v0.2"', 'status: backlog', ...extra, '---', '', `Body of ${ELEMENT_ID}.`, ''].join('\n');
}

function request(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD', ...overrides };
}

function sameTextWarning(path: string): string {
  return `W_MEMORY_UNREADABLE (${path}): unreadable frontmatter in ${path}: two of its frontmatter keys have the same text, so an execution context cannot carry it`;
}

function linesEqualTo(text: string, line: string): number {
  return text.split('\n').filter((candidate) => candidate === line).length;
}

/** No heading and no marker of `task:<id>` in the payload. */
function expectNotCarried(payload: string, id: string): void {
  expect({
    heading: linesEqualTo(payload, `### task:${id}`),
    begin: linesEqualTo(payload, `<!-- begin:task:${id} -->`),
    end: linesEqualTo(payload, `<!-- end:task:${id} -->`),
  }).toEqual({ heading: 0, begin: 0, end: 0 });
}

const realSpawnSync = childProcess.spawnSync.bind(childProcess) as (file: string, args: string[], options: object) => unknown;
const realExecFileSync = childProcess.execFileSync.bind(childProcess) as (file: string, args: string[], options: object) => unknown;

/** Assemble one context on `root`, recording the arguments of every git process after `-C <root>`. */
function recordAssembly(root: string): { calls: string[][]; result: ReturnType<typeof assembleExecutionContext> } {
  const calls: string[][] = [];
  const record = (file: unknown, args: unknown): void => {
    if (file !== 'git' || !Array.isArray(args)) return;
    const list = args.map(String);
    calls.push(list[0] === '-C' ? list.slice(2) : list);
  };
  const spawn = jest.spyOn(childProcess, 'spawnSync').mockImplementation(((file: string, args: string[], options: object) => {
    record(file, args);
    return realSpawnSync(file, args, options);
  }) as unknown as typeof childProcess.spawnSync);
  const exec = jest.spyOn(childProcess, 'execFileSync').mockImplementation(((file: string, args: string[], options: object) => {
    record(file, args);
    return realExecFileSync(file, args, options);
  }) as unknown as typeof childProcess.execFileSync);
  try {
    return { calls, result: assembleExecutionContext(root, request()) };
  } finally {
    spawn.mockRestore();
    exec.mockRestore();
  }
}

describe('task-379 — two frontmatter keys of the same text (spec-012 §7)', () => {
  let repo: string;

  function writeElement(extra: string[] = []): void {
    writeFixtureFile(repo, ELEMENT_PATH, elementMd(extra));
  }

  function build(overrides: Partial<ContextRequest> = {}) {
    const result = assembleExecutionContext(repo, request(overrides));
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

  it('(a) a linked document with "1.50" and 1.50 is left out and reported, and section 4 does not count it', () => {
    writeElement([`depends_on: [${DEFECT_ID}]`]);
    writeFixtureFile(repo, DEFECT_PATH, documentMd(DEFECT_ID, SAME_TEXT, 'The defective body.'));
    commitAll(repo, 'a document with two keys of one text');
    const { payload, context, warnings } = build();
    expectNotCarried(payload, DEFECT_ID);
    expect(payload).not.toContain('The defective body.');
    expect(context.memory).toEqual([]);
    expect(linesEqualTo(payload, '## 4. Relevant Memory (0 documents)')).toBe(1);
    expect(warnings).toEqual([sameTextWarning(DEFECT_PATH)]);
  });

  it.each([
    ['~', ['"~": x', '~: y']],
    ['True', ['"True": x', 'True: y']],
    ['a date', ['"2026-10-05": x', '2026-10-05: y']],
    ['a key nested under another', ['n:', '  "0x1F": x', '  0x1F: y']],
  ])('(b) the same defect written with %s is left out and reported', (_name, lines) => {
    writeElement([`depends_on: [${DEFECT_ID}]`]);
    writeFixtureFile(repo, DEFECT_PATH, documentMd(DEFECT_ID, lines));
    commitAll(repo, 'a variant of the defect');
    const { payload, warnings } = build();
    expectNotCarried(payload, DEFECT_ID);
    expect(linesEqualTo(payload, '## 4. Relevant Memory (0 documents)')).toBe(1);
    expect(warnings).toEqual([sameTextWarning(DEFECT_PATH)]);
  });

  it('(c) a defective document ranked first takes no maxDocs slot: the second linked document is carried', () => {
    writeElement([`depends_on: [${DEFECT_ID}, ${OTHER_ID}]`]);
    writeFixtureFile(repo, DEFECT_PATH, documentMd(DEFECT_ID, SAME_TEXT));
    writeFixtureFile(repo, OTHER_PATH, documentMd(OTHER_ID));
    commitAll(repo, 'a defective document first');
    const { payload, context, warnings } = build({ limits: { maxDocs: 1, maxBytes: DEFAULT_MAX_BYTES } });
    expect(context.memory.map((doc) => doc.path)).toEqual([OTHER_PATH]);
    expectNotCarried(payload, DEFECT_ID);
    expect(warnings).toEqual([sameTextWarning(DEFECT_PATH)]);
  });

  it('(d) a defective document larger than maxBytes does not stop the walk: the small linked document is carried', () => {
    writeElement([`depends_on: [${DEFECT_ID}, ${OTHER_ID}]`]);
    writeFixtureFile(repo, DEFECT_PATH, documentMd(DEFECT_ID, SAME_TEXT, 'x'.repeat(2000)));
    writeFixtureFile(repo, OTHER_PATH, documentMd(OTHER_ID));
    commitAll(repo, 'a large defective document first');
    const { payload, context, warnings } = build({ limits: { maxDocs: DEFAULT_MAX_DOCS, maxBytes: 1000 } });
    expect(context.memory.map((doc) => doc.path)).toEqual([OTHER_PATH]);
    expectNotCarried(payload, DEFECT_ID);
    expect(warnings).toEqual([sameTextWarning(DEFECT_PATH)]);
  });

  it('(e) a defective document ranked after the maxDocs bound is not carried and is still reported', () => {
    const lateId = 'task-010-late-defect';
    const latePath = `docs/04_memory/v0.9/${lateId}.md`;
    writeElement([`depends_on: [${OTHER_ID}, ${lateId}]`]);
    writeFixtureFile(repo, OTHER_PATH, documentMd(OTHER_ID));
    writeFixtureFile(repo, latePath, documentMd(lateId, SAME_TEXT));
    commitAll(repo, 'a defective document past the bound');
    const { payload, context, warnings } = build({ limits: { maxDocs: 1, maxBytes: DEFAULT_MAX_BYTES } });
    expect(context.memory.map((doc) => doc.path)).toEqual([OTHER_PATH]);
    expectNotCarried(payload, lateId);
    expect(warnings).toEqual([sameTextWarning(latePath)]);
  });

  it('(f) of two documents with one type and id, a defective first copy claims nothing: the second is carried, only the first reported', () => {
    const firstCopy = 'docs/04_memory/v0.9/task-006-dup-copy.md';
    const secondCopy = 'docs/04_memory/v0.9/task-006-dup.md';
    writeElement(['depends_on: [task-006-dup]']);
    writeFixtureFile(repo, firstCopy, documentMd('task-006-dup', SAME_TEXT, 'The defective copy.'));
    writeFixtureFile(repo, secondCopy, documentMd('task-006-dup', [], 'The sound copy.'));
    commitAll(repo, 'a defective first copy');
    const { payload, context, warnings } = build();
    expect(context.memory.map((doc) => doc.path)).toEqual([secondCopy]);
    expect(payload).toContain('The sound copy.');
    expect(payload).not.toContain('The defective copy.');
    expect(warnings).toEqual([sameTextWarning(firstCopy)]);
  });

  it('(g) a defective document that scores 0 is neither carried nor reported', () => {
    writeFixtureFile(repo, DEFECT_PATH, documentMd(DEFECT_ID, SAME_TEXT));
    commitAll(repo, 'an irrelevant defective document');
    const { payload, warnings } = build();
    expectNotCarried(payload, DEFECT_ID);
    expect(warnings).toBeUndefined();
  });

  it('(h) an element with the defect refuses the context as VALIDATION', () => {
    writeElement(SAME_TEXT);
    commitAll(repo, 'a defective element');
    expect(assembleExecutionContext(repo, request())).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: `element 'task:${ELEMENT_ID}' cannot enter an execution context: two of its frontmatter keys have the same text`,
      },
    });
  });

  it('(k) "1.50" beside 1.5 are two texts: the document is carried with both keys', () => {
    writeElement([`depends_on: [${OTHER_ID}]`]);
    writeFixtureFile(repo, OTHER_PATH, documentMd(OTHER_ID, ['"1.50": x', '1.5: y']));
    commitAll(repo, 'two keys of two texts');
    const { payload, context, warnings } = build();
    expect(context.memory.map((doc) => doc.path)).toEqual([OTHER_PATH]);
    expect(linesEqualTo(payload, "'1.50': x")).toBe(1);
    // The dump quotes the string `y`, which YAML 1.1 reads as a boolean.
    expect(linesEqualTo(payload, "'1.5': 'y'")).toBe(1);
    expect(warnings).toBeUndefined();
  });

  it('(l) two assemblies of a fixture holding cases a to g give byte-identical payloads and equal warnings', () => {
    const ids = ['task-003-defect', 'task-004-tilde', 'task-005-true', 'task-007-date', 'task-008-nested'];
    writeElement([`depends_on: [${[...ids, 'task-006-dup', OTHER_ID, 'task-010-late-defect'].join(', ')}]`]);
    writeFixtureFile(repo, `docs/04_memory/v0.9/${ids[0]}.md`, documentMd(ids[0]!, SAME_TEXT, 'x'.repeat(2000)));
    writeFixtureFile(repo, `docs/04_memory/v0.9/${ids[1]}.md`, documentMd(ids[1]!, ['"~": x', '~: y']));
    writeFixtureFile(repo, `docs/04_memory/v0.9/${ids[2]}.md`, documentMd(ids[2]!, ['"True": x', 'True: y']));
    writeFixtureFile(repo, `docs/04_memory/v0.9/${ids[3]}.md`, documentMd(ids[3]!, ['"2026-10-05": x', '2026-10-05: y']));
    writeFixtureFile(repo, `docs/04_memory/v0.9/${ids[4]}.md`, documentMd(ids[4]!, ['n:', '  "0x1F": x', '  0x1F: y']));
    writeFixtureFile(repo, 'docs/04_memory/v0.9/task-006-dup-copy.md', documentMd('task-006-dup', SAME_TEXT));
    writeFixtureFile(repo, 'docs/04_memory/v0.9/task-006-dup.md', documentMd('task-006-dup'));
    writeFixtureFile(repo, OTHER_PATH, documentMd(OTHER_ID));
    writeFixtureFile(repo, 'docs/04_memory/v0.9/task-010-late-defect.md', documentMd('task-010-late-defect', SAME_TEXT));
    writeFixtureFile(repo, 'docs/04_memory/v0.8/task-011-unlinked-defect.md', documentMd('task-011-unlinked-defect', SAME_TEXT));
    commitAll(repo, 'every case');
    const limits = { maxDocs: 2, maxBytes: 1000 };
    const first = build({ limits });
    const second = build({ limits });
    expect(second.payload).toBe(first.payload);
    expect(second.warnings).toEqual(first.warnings);
  });

  it('(m) with a defective document present, one assembly starts exactly 4 git cat-file --batch', () => {
    writeElement([`depends_on: [${DEFECT_ID}, ${OTHER_ID}]`]);
    writeFixtureFile(repo, DEFECT_PATH, documentMd(DEFECT_ID, SAME_TEXT));
    writeFixtureFile(repo, OTHER_PATH, documentMd(OTHER_ID));
    commitAll(repo, 'a defective document among the linked ones');
    const { calls, result } = recordAssembly(repo);
    expect(result.ok).toBe(true);
    expect(calls.filter((call) => call[0] === 'cat-file' && call.includes('--batch'))).toHaveLength(4);
  });
});
