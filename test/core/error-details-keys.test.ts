/**
 * task-375 AC 2 (red-first, `bug-303`; `spec-005` §3.1 "One rule for every `details` key", §3.2; approver ruling D2 (A)
 * of the design gate) — one rule decides how a refusal's `details` reach the operator.
 *
 * 1. **Enumeration.** `scanDetailKeys` (`./helpers/details-keys`) reads every `details:` site of the sources that build
 *    core errors; every key it finds must be declared in `DETAIL_KEYS` (`src/core/error-details.ts`), a closed table of
 *    `entry` / `labelled` / `stated` keys. The entry class is exactly `cause, diagnostics, issues, unreadable` and the
 *    labelled class exactly `applied, argv, file, flag, frontier` (task-365 D9 (a): `flag`, the option that carried a
 *    refused revision, `spec-020` §8.2).
 * 2. **Rendering.** `errorDetails` (the selection the CLI and MCP share): entry keys by their own rule —
 *    `diagnostics` or `issues`, then `unreadable`, then `cause` — then labelled and undeclared keys as `<key>: <value>`
 *    lines in ascending key order; an entry already listed is not repeated; a stated key adds nothing; an empty string
 *    or array adds nothing.
 *
 * Expected red: `DETAIL_KEYS` is not exported yet (`tsc` TS2305; at run time `undefined`), and `errorDetails` renders
 * only `issues` and `diagnostics` today, so the `cause`, `unreadable` and labelled cases fail on their assertions.
 */
import { DETAIL_KEYS, errorDetails } from '../../src/core/error-details';
import { coreErr } from '../../src/core/types';
import { scanDetailKeys } from './helpers/details-keys';

type DetailsRecord = Record<string, unknown>;

function refusal(details: DetailsRecord) {
  const result = coreErr({ code: 'VALIDATION', message: 'refused', details });
  if (result.ok) throw new Error('expected a refusal');
  return result.error;
}

function classOf(cls: string): string[] {
  const table = DETAIL_KEYS as Readonly<Record<string, string>>;
  return Object.keys(table)
    .filter((key) => table[key] === cls)
    .sort();
}

describe('task-375 AC 2 — every details key core errors use is declared (bug-303)', () => {
  const scan = scanDetailKeys();

  it('the scan reads every details: site: an object literal, a same-file helper, or a forwarded .details', () => {
    expect(scan.unsupported).toEqual([]);
    // The scan can find what it looks for: the keys `spec-005` §3.1 names as entry keys are set somewhere.
    const found = new Set(scan.keys.map((entry) => entry.key));
    expect(['cause', 'diagnostics', 'issues', 'unreadable', 'frontier'].filter((key) => !found.has(key))).toEqual([]);
  });

  it('every key a core error sets is declared in DETAIL_KEYS, each as entry, labelled or stated', () => {
    const table = DETAIL_KEYS as Readonly<Record<string, string>>;
    const undeclared = scan.keys.filter((entry) => !Object.prototype.hasOwnProperty.call(table, entry.key)).map((entry) => `${entry.key} (${entry.site})`);
    expect(undeclared).toEqual([]);
    expect(Object.values(table).filter((cls) => !['entry', 'labelled', 'stated'].includes(cls))).toEqual([]);
  });

  it('the entry class is exactly cause, diagnostics, issues, unreadable', () => {
    expect(classOf('entry')).toEqual(['cause', 'diagnostics', 'issues', 'unreadable']);
  });

  // task-365 AC 7 (red-first; design D9 (a), `spec-020` §8.2): `flag` names the option that carried a refused revision;
  // the reason does not state it, so it is labelled (`  flag: --base` under the error line).
  it('the labelled class is exactly applied, argv, file, flag, frontier', () => {
    expect(classOf('labelled')).toEqual(['applied', 'argv', 'file', 'flag', 'frontier']);
  });
});

describe('task-375 AC 2 — errorDetails renders every key by its class (spec-005 §3.1)', () => {
  it('a cause alone is one detail', () => {
    expect(errorDetails(refusal({ cause: 'the context could not be read' }))).toEqual([{ detail: 'the context could not be read' }]);
  });

  it('a cause an issue already lists prints once', () => {
    expect(errorDetails(refusal({ issues: [{ detail: 'x' }], cause: 'x' }))).toEqual([{ detail: 'x' }]);
  });

  it("unreadable gives one detail per string, after the issues'", () => {
    expect(errorDetails(refusal({ issues: [{ detail: 'i' }], unreadable: ['a', 'b'] }))).toEqual([{ detail: 'i' }, { detail: 'a' }, { detail: 'b' }]);
  });

  it('a labelled array is one `<key>: <values>` line, `, `-joined', () => {
    expect(errorDetails(refusal({ frontier: ['s1', 's2'] }))).toEqual([{ detail: 'frontier: s1, s2' }]);
  });

  it('a labelled string is one `<key>: <value>` line', () => {
    expect(errorDetails(refusal({ file: 'workflows/custom/a.yaml' }))).toEqual([{ detail: 'file: workflows/custom/a.yaml' }]);
  });

  it('an empty labelled array adds nothing', () => {
    expect(errorDetails(refusal({ frontier: [] }))).toEqual([]);
  });

  it('any other labelled value is compact JSON', () => {
    const applied = [{ step: 's', element: { type: 'task', id: 't' }, commit: 'abc' }];
    expect(errorDetails(refusal({ applied }))).toEqual([{ detail: 'applied: [{"step":"s","element":{"type":"task","id":"t"},"commit":"abc"}]' }]);
  });

  it('an undeclared key is rendered as a labelled one, never dropped', () => {
    expect(errorDetails(refusal({ zeta: 'v' }))).toEqual([{ detail: 'zeta: v' }]);
  });

  it('entry lines first (issues, unreadable, cause), then labelled and undeclared keys in ascending order', () => {
    const details = { zeta: 'v', frontier: ['s1'], cause: 'c', unreadable: ['u'], applied: ['a1'], issues: [{ detail: 'i' }] };
    expect(errorDetails(refusal(details))).toEqual([
      { detail: 'i' },
      { detail: 'u' },
      { detail: 'c' },
      { detail: 'applied: a1' },
      { detail: 'frontier: s1' },
      { detail: 'zeta: v' },
    ]);
  });

  it('a stated key adds nothing', () => {
    expect(errorDetails(refusal({ instance: 'x', step: 'loop.review@task:t' }))).toEqual([]);
  });

  it('characterization: an error with only issues, or only stated keys beside them, renders as before', () => {
    const issues = [{ code: 'E_VALIDATION', path: '', file: 'docs/a.md', message: 'm', detail: 'why' }];
    expect(errorDetails(refusal({ issues }))).toEqual([{ file: 'docs/a.md', detail: 'why' }]);
    expect(errorDetails(refusal({ issues, instance: 'x' }))).toEqual([{ file: 'docs/a.md', detail: 'why' }]);
  });
});
