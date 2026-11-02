/**
 * task-332 — `resolveElementReference` (`src/memory/reference.ts`), the one pure function every command-line
 * lookup of an element by id resolves through (design D1–D11, approved 2026-11-01; `spec-008-cli-grammar` §7).
 *
 * The rule, in order: (1) an EXACT id; (2) a NUMBER reference `<literal><digits>` where `<literal>` is the head of
 * a type's committed `id_pattern` `<literal>{n}…`, decided by that rule alone (D2, D3), numbers compared by value
 * (D4); (3) a PREFIX of the full id. One candidate resolves, several are ambiguous, none is missing. Archived
 * elements are candidates (D5); `options.type` scopes the lookup to one type; candidates are sorted by id, then path.
 *
 * Red-first: the export does not exist yet, so this file fails twice — `tsc` TS2305 (no exported member) and, under
 * ts-jest `isolatedModules`, a runtime `TypeError: resolveElementReference is not a function`.
 *
 * Fixtures: the `memory.yaml` a real `wingfoil init --template kanban` writes (`../core/fixtures/kanban-memory.yaml`)
 * and this repository's `release` type (`{kind}-{version}`), through `../core/helpers/short-reference-fixture.ts`.
 */
import { resolveElementReference } from '../../src/memory';
import { parseMemoryYaml, REPO_RELEASE_MEMORY_YAML, summary } from '../core/helpers/short-reference-fixture';

const KANBAN = parseMemoryYaml();
const RELEASES = parseMemoryYaml(REPO_RELEASE_MEMORY_YAML);

/** Documents of the kanban project the cases below read. */
const DL_1 = summary('decision-log', 'dl-001-pick-a-storage-layout-for-exports');
const DL_2 = summary('decision-log', 'dl-002-pick-a-storage-engine');
const TASK_12 = summary('task', 'task-012-cli-exit-code-contract');
const TASK_330 = summary('task', 'task-330-another-task');

const resolve = (documents: ReturnType<typeof summary>[], reference: string, type?: string) =>
  resolveElementReference(documents, KANBAN, reference, type === undefined ? undefined : { type });

describe('task-332 AC 1 — a reference <type prefix>-<n> resolves when exactly one element has that number (red-first)', () => {
  it('dl-001 and dl-1 name dl-001-pick-a-storage-layout-for-exports, by the number rule', () => {
    expect(resolve([DL_1, DL_2], 'dl-001')).toEqual({ kind: 'found', rule: 'number', document: DL_1 });
    expect(resolve([DL_1, DL_2], 'dl-1')).toEqual({ kind: 'found', rule: 'number', document: DL_1 });
  });

  it('numbers compare by value (D4): task-12, task-012 and task-0012 all name task-012-… ', () => {
    for (const reference of ['task-12', 'task-012', 'task-0012']) {
      expect(resolve([TASK_12, TASK_330], reference)).toEqual({ kind: 'found', rule: 'number', document: TASK_12 });
    }
  });

  it('the family `release-{n}` and `rl-{n}` (no slug) resolve by number too', () => {
    const release = summary('release', 'release-3');
    const line = summary('release-line', 'rl-2');
    expect(resolve([release, line], 'release-03')).toEqual({ kind: 'found', rule: 'number', document: release });
    expect(resolve([release, line], 'rl-02')).toEqual({ kind: 'found', rule: 'number', document: line });
  });

  it('a number nobody has is missing — dl-3 against dl-001 and dl-002', () => {
    expect(resolve([DL_1, DL_2], 'dl-3')).toEqual({ kind: 'missing' });
    expect(resolve([DL_1, DL_2], 'dl-00')).toEqual({ kind: 'missing' });
  });

  it('D2: a number-shaped reference never falls through to the prefix rule — task-33 is not task-330', () => {
    expect(resolve([TASK_330], 'task-33')).toEqual({ kind: 'missing' });
  });

  it('D2: release-1 with only release-10 and release-12 is missing, not their common prefix', () => {
    expect(resolve([summary('release', 'release-10'), summary('release', 'release-12')], 'release-1')).toEqual({ kind: 'missing' });
  });

  it('D3: a type with no id_pattern has no number rule — decision-1 is only a prefix', () => {
    const memory = parseMemoryYaml('version: 1\ntypes:\n  decision-log:\n    path: "docs/memory/decision-log/{id}.md"\n');
    const documents = [summary('decision-log', 'decision-12'), summary('decision-log', 'decision-30')];
    expect(resolveElementReference(documents, memory, 'decision-1')).toEqual({ kind: 'found', rule: 'prefix', document: documents[0] });
  });
});

describe('task-332 AC 2 — a unique prefix of the full id resolves (red-first)', () => {
  it('dl-001-pick resolves to dl-001-pick-a-storage-layout-for-exports, by the prefix rule', () => {
    expect(resolve([DL_1, DL_2], 'dl-001-pick')).toEqual({ kind: 'found', rule: 'prefix', document: DL_1 });
  });

  it('an exact id wins over being the prefix of another id (patch-v0.3.1 beside patch-v0.3.1-hotfix)', () => {
    const exact = summary('release', 'patch-v0.3.1');
    const longer = summary('release', 'patch-v0.3.1-hotfix');
    expect(resolveElementReference([longer, exact], RELEASES, 'patch-v0.3.1')).toEqual({ kind: 'found', rule: 'exact', document: exact });
  });

  it('minor-v0.3 beside minor-v0.3.1 resolves exactly, and minor-v0.3.1 too', () => {
    const minor = summary('release', 'minor-v0.3');
    const later = summary('release', 'minor-v0.3.1');
    expect(resolveElementReference([later, minor], RELEASES, 'minor-v0.3')).toMatchObject({ kind: 'found', rule: 'exact', document: minor });
    expect(resolveElementReference([later, minor], RELEASES, 'minor-v0.3.1')).toMatchObject({ kind: 'found', rule: 'exact', document: later });
  });

  it('a full id is found as itself', () => {
    expect(resolve([DL_1, DL_2], DL_2.frontmatter['id'] as string)).toEqual({ kind: 'found', rule: 'exact', document: DL_2 });
  });

  it('a reference that is neither an id, a number nor a prefix is missing', () => {
    expect(resolve([DL_1, DL_2], 'nothing-like-it')).toEqual({ kind: 'missing' });
    expect(resolve([DL_1, DL_2], 'DL-001')).toEqual({ kind: 'missing' }); // case-sensitive: ids are [a-z0-9-.]
  });
});

describe('task-332 AC 3 — a reference matching several elements is ambiguous, every candidate listed in id order (red-first)', () => {
  it('patch-v0.3 against patch-v0.3.1 and patch-v0.3.2 is ambiguous by prefix, candidates sorted by id', () => {
    const second = summary('release', 'patch-v0.3.2');
    const first = summary('release', 'patch-v0.3.1');
    expect(resolveElementReference([second, first], RELEASES, 'patch-v0.3')).toEqual({ kind: 'ambiguous', rule: 'prefix', candidates: [first, second] });
  });

  it('a duplicate number is ambiguous by number: dl-1 against dl-001-a and dl-001-b', () => {
    const a = summary('decision-log', 'dl-001-a');
    const b = summary('decision-log', 'dl-001-b');
    expect(resolve([b, a], 'dl-1')).toEqual({ kind: 'ambiguous', rule: 'number', candidates: [a, b] });
  });

  it('candidates with the same id are ordered by path', () => {
    const lower = { ...summary('decision-log', 'dl-001-a'), path: 'docs/memory/decision-log/a/dl-001-a.md' };
    const higher = { ...summary('decision-log', 'dl-001-a'), path: 'docs/memory/decision-log/z/dl-001-a.md' };
    expect(resolve([higher, lower], 'dl-1')).toEqual({ kind: 'ambiguous', rule: 'number', candidates: [lower, higher] });
  });
});

describe('task-332 — scope, archived elements and determinism (red-first)', () => {
  it('D5: a deprecated element is a candidate, as the exact lookups find it today', () => {
    const archived = summary('decision-log', 'dl-099-retired', 'deprecated');
    expect(resolve([archived, DL_1], 'dl-99')).toEqual({ kind: 'found', rule: 'number', document: archived });
    expect(resolve([archived, DL_1], 'dl-099-ret')).toEqual({ kind: 'found', rule: 'prefix', document: archived });
  });

  it('options.type scopes the lookup to that type: dl-1 is not a task, task-12 is not a decision-log', () => {
    expect(resolve([DL_1, TASK_12], 'dl-1', 'task')).toEqual({ kind: 'missing' });
    expect(resolve([DL_1, TASK_12], 'dl-1', 'decision-log')).toEqual({ kind: 'found', rule: 'number', document: DL_1 });
    expect(resolve([DL_1, TASK_12], 'task-12', 'decision-log')).toEqual({ kind: 'missing' });
    expect(resolve([DL_1, TASK_12], 'task-012-cli', 'task')).toEqual({ kind: 'found', rule: 'prefix', document: TASK_12 });
  });

  it('REQ-SYS-07: the answer does not depend on the order the documents are given in', () => {
    const documents = [
      summary('release', 'patch-v0.3.2'),
      summary('release', 'minor-v0.3'),
      summary('release', 'patch-v0.3.1'),
      summary('release', 'minor-v0.3.1'),
    ];
    const references = ['patch-v0.3', 'minor-v0.3', 'minor-v0', 'patch-v0.3.2', 'none'];
    const answers = (order: readonly number[]) => references.map((reference) => resolveElementReference(order.map((index) => documents[index]!), RELEASES, reference));
    const forward = answers([0, 1, 2, 3]);
    expect(answers([3, 2, 1, 0])).toEqual(forward);
    expect(answers([2, 0, 3, 1])).toEqual(forward);
    // and the ambiguous ones list their candidates in id order
    expect(forward[0]).toEqual({ kind: 'ambiguous', rule: 'prefix', candidates: [documents[2], documents[0]] });
    expect(forward[2]).toEqual({
      kind: 'ambiguous',
      rule: 'prefix',
      candidates: [documents[1], documents[3]],
    });
  });

  it('accepts any iterable of documents (a Set, a generator)', () => {
    expect(resolveElementReference(new Set([DL_2, DL_1]), KANBAN, 'dl-2')).toEqual({ kind: 'found', rule: 'number', document: DL_2 });
  });
});
