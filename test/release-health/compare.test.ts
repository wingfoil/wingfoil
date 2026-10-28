/**
 * task-241 AC 1 (red-first) — `scripts/release-health/compare.cjs` classifies every metric against the previous
 * run (`dl-089` §3): improved / stable / regressed / new / not-comparable with the catalogue's tolerances
 * (2 percentage points for shares, 10 % relative otherwise, a metric's own `tolerance` overriding them; strictly
 * more than the tolerance moves the verdict), floors evaluated as held / breached, a cross-version comparison
 * re-measures the previous point like-for-like, and the trend shows the last three runs.
 *
 * Also pinned here, from the approver's rulings on the design (2026-10-13): H — floors get a trend verdict too
 * (the `COMPONENTS` table covers every non-info, non-pending metric); I — the run-time readings G15, Q17 and
 * E01–E05 are declared in `compare.cjs` and never compared.
 *
 * task-307 AC 1 (red-first, `bug-443`): when the previous report's release is `kind: patch`, its proposals settle as
 * `pending` — noted "disposed of by the next minor's retrospective (dl-167 (a))" (design gate D2) — and no
 * `retro-<patch>` is looked up; the minor case is unchanged (characterization). AC 2 (characterization of a
 * document): `docs/08_health/report-layout.md` lists `pending` in the settle vocabulary and says when it applies.
 * The patch fixtures mirror `docs/08_health/release-health-v0.3.1.{json,md}` (its `## Proposals` RH-v0.3.1-01..03).
 *
 * The CLI block spawns `compare.cjs` in a temporary root holding the catalogue, the schema and two fixture reports;
 * `compare.cjs` runs no git and reads no network there. Deterministic: fixed fixture reports
 * (`fixtures/compare/`), no clock, no randomness.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';

import type { MetricEntry, Report } from '../../scripts/release-health/measure.cjs';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { COMPARE_SCRIPT, FIXTURES, REPO_ROOT, fixtureReport, liveCatalogue, loadCompare, rowOf, section, withEntry } from './helpers/compare-api';
import type { Catalogue, MetricDef } from './helpers/compare-api';

const CATALOGUE = liveCatalogue();
const DEFAULTS = CATALOGUE.defaults;
const RUN_TIME = ['E01', 'E02', 'E03', 'E04', 'E05', 'G15', 'Q17'];
const SECTIONS = ['Summary', 'Comparison', 'Trend', 'Findings', 'Proposals', 'Previous proposals', 'Improvements'];
const SHA = (c: string): string => c.repeat(40);

function def(id: string): MetricDef {
  const found = CATALOGUE.metrics.find((m) => m.id === id);
  if (!found) throw new Error(`no ${id} in the catalogue`);
  return found;
}

function measured(id: string, value: unknown, extra: Partial<MetricEntry> = {}): MetricEntry {
  return { id, status: 'measured', value, items: 400, small_sample: false, ...extra };
}

/** The schema errors of a report against `docs/08_health/release-health.schema.json`; `[]` when it validates. */
function schemaErrors(report: unknown): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(join(REPO_ROOT, 'docs', '08_health', 'release-health.schema.json'), 'utf-8')) as object);
  validate(report);
  return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`);
}

/** The real `not-comparable` entries a patch run writes for D01 and P06 (`release-health-v0.3.1.json`). */
const PATCH_NOT_COMPARABLE: Readonly<Record<string, string>> = {
  D01: 'a patch release: D01 is measured on major and minor releases only (dl-089 §2)',
  P06: 'a patch release: P06 is measured with D01, on major and minor releases only',
};

/** A patch report derived from the v0.3 fixture: `patch-v<version>`, its point and its previous report. */
function patchReport(version: string, commit: string, previous: { release: string; commit: string }): Report {
  let report: Report = {
    ...fixtureReport('v0.3'),
    release: { id: `patch-${version}`, version, kind: 'patch' },
    measurement_point: { basis: 'published-tag', commit, ref: version },
    previous: { basis: 'report', commit: previous.commit, release: previous.release, report: `docs/08_health/release-health-${previous.release}.json` },
  } as Report;
  for (const [id, reason] of Object.entries(PATCH_NOT_COMPARABLE)) report = withEntry(report, id, { status: 'not-comparable', reason } as Omit<MetricEntry, 'id'>);
  return report;
}

/** The `## Proposals` of a patch report's Markdown, shaped as `docs/08_health/release-health-v0.3.1.md`. */
const PATCH_PREVIOUS_MD = [
  '# Release health — v0.3.1',
  '',
  '## Proposals',
  '',
  '### RH-v0.3.1-01 — G05 Code commits citing an id',
  '',
  '- Finding: G05 floor breached (value 97.96; previous 99.87)',
  '- Evidence: raw citing=48, total=49; the one failure is a docs(bdd) commit citing no id G05 counts.',
  '- Proposed element: none, or a `dl-173` item (recommended disposition: accept as a one-off)',
  '- Proposed target release: v0.4',
  '',
  '### RH-v0.3.1-02 — Q05 Complexity',
  '',
  '- Finding: Q05 regressed (complex 36 → 41, long 19 → 20)',
  '- Evidence: the functions over the thresholds that are new since v0.3.0.',
  '- Proposed element: decision-log (a complexity and length budget at refactor)',
  '- Proposed target release: v0.4',
  '',
  '### RH-v0.3.1-03 — Q14 Open decision-logs',
  '',
  '- Finding: Q14 regressed (count 36 → 31, median age 9.34 → 11.35 days)',
  '- Evidence: raw in_discussion=31, oldest_age_days=40.26.',
  '- Proposed element: none (an expected effect of the deferred v0.4 planning; re-read at v0.4\'s run)',
  '- Proposed target release: v0.4',
  '',
  '## Previous proposals',
  '',
  '| Proposal | Linked element | Settled as |',
  '|---|---|---|',
  '| RH-v0.3-01 | dl-189-how-long-a-wf-commit-subject-may-be | adopted and effective |',
  '',
].join('\n');

/** A retrospective that WOULD dispose of the patch's proposals, were it read: element / element / declined. */
const PATCH_RETRO = [
  '## Release health',
  '',
  '| Proposal | Outcome | Element |',
  '|---|---|---|',
  '| RH-v0.3.1-01 | element | dl-901-x |',
  '| RH-v0.3.1-02 | element | dl-902-complexity-budget |',
  '| RH-v0.3.1-03 | declined | |',
  '',
].join('\n');

const PENDING_NOTE = "disposed of by the next minor's retrospective (dl-167 (a))";

describe('the fixture reports (fixtures/compare/)', () => {
  it.each(['v0.1', 'v0.2', 'v0.3'])('release-health-%s.json validates against docs/08_health/release-health.schema.json', (version) => {
    expect(schemaErrors(fixtureReport(version))).toEqual([]);
  });

  it('the derived patch reports (v0.3.1, v0.3.2) validate against the schema (task-307)', () => {
    expect(schemaErrors(patchReport('v0.3.1', SHA('4'), { release: 'v0.3', commit: SHA('3') }))).toEqual([]);
    expect(schemaErrors(patchReport('v0.3.2', SHA('5'), { release: 'v0.3.1', commit: SHA('4') }))).toEqual([]);
  });
});

describe('settle — a patch previous run (bug-443)', () => {
  async function comparison(): Promise<Parameters<ReturnType<typeof loadCompare>['settle']>[2]> {
    const { compareReports } = loadCompare();
    return compareReports({ catalogue: CATALOGUE, current: fixtureReport('v0.3'), previous: fixtureReport('v0.2'), history: ['v0.1', 'v0.2', 'v0.3'].map(fixtureReport) });
  }

  it("AC 1: a patch's proposals settle as pending, noted for the next minor's retrospective (dl-167), the retrospective text ignored", async () => {
    const { parseProposals, settle } = loadCompare();
    const settled = settle(parseProposals(PATCH_PREVIOUS_MD), PATCH_RETRO, await comparison(), 'patch');
    expect(settled.map((s) => s.id)).toEqual(['RH-v0.3.1-01', 'RH-v0.3.1-02', 'RH-v0.3.1-03']);
    for (const entry of settled) {
      expect(entry).toMatchObject({ settled: 'pending', outcome: null, element: null, note: PENDING_NOTE });
      expect(String(entry['note'])).toMatch(/next minor's retrospective/);
      expect(String(entry['note'])).toContain('dl-167');
    }
  });

  it('AC 1: a patch with no retrospective settles as pending too, not "not adopted (no retrospective)"', async () => {
    const { parseProposals, settle } = loadCompare();
    const settled = settle(parseProposals(PATCH_PREVIOUS_MD), null, await comparison(), 'patch');
    expect(settled.map((s) => s.settled)).toEqual(['pending', 'pending', 'pending']);
    for (const entry of settled) expect(String(entry['note'])).not.toContain('no disposition recorded');
  });

  it.each([['minor' as const], [undefined]])('AC 1 (characterization): the same inputs with previousKind %s keep the existing mapping', async (kind) => {
    const { parseProposals, settle } = loadCompare();
    const settled = settle(parseProposals(PATCH_PREVIOUS_MD), PATCH_RETRO, await comparison(), kind);
    expect(settled[0]).toMatchObject({ id: 'RH-v0.3.1-01', outcome: 'element', element: 'dl-901-x' });
    expect(settled[0]!.settled).toMatch(/^adopted/);
    expect(settled[1]).toMatchObject({ id: 'RH-v0.3.1-02', outcome: 'element', element: 'dl-902-complexity-budget' });
    expect(settled[1]!.settled).toMatch(/^adopted/);
    expect(settled[2]).toMatchObject({ id: 'RH-v0.3.1-03', settled: 'not adopted', outcome: 'declined' });
    for (const entry of settled) expect(entry.settled).not.toBe('pending');
  });

  it('AC 1 (characterization): a minor with no retrospective is still not adopted, no disposition recorded', async () => {
    const { parseProposals, settle } = loadCompare();
    const settled = settle(parseProposals(PATCH_PREVIOUS_MD), null, await comparison(), 'minor');
    expect(settled.map((s) => s.settled)).toEqual(['not adopted', 'not adopted', 'not adopted']);
    for (const entry of settled) expect(String(entry['note'])).toBe('no disposition recorded (no retrospective)');
  });
});

describe('classifyMetric — the verdict per metric (dl-089 §3)', () => {
  it('a share within 2 percentage points is stable; exactly 2.00pp is stable, 2.01pp moves it (direction up)', () => {
    const { classifyMetric } = loadCompare();
    expect(classifyMetric(def('G02'), measured('G02', 32), measured('G02', 30), DEFAULTS).verdict).toBe('stable');
    expect(classifyMetric(def('G02'), measured('G02', 32.01), measured('G02', 30), DEFAULTS).verdict).toBe('improved');
    expect(classifyMetric(def('G02'), measured('G02', 27.99), measured('G02', 30), DEFAULTS).verdict).toBe('regressed');
  });

  it('a count within 10 % relative is stable; exactly 10 % is stable, 10.1 % moves it (direction down)', () => {
    const { classifyMetric } = loadCompare();
    const prev = measured('Q05', { complex: 1000, long: 20 });
    expect(classifyMetric(def('Q05'), measured('Q05', { complex: 1100, long: 20 }), prev, DEFAULTS).verdict).toBe('stable');
    expect(classifyMetric(def('Q05'), measured('Q05', { complex: 1101, long: 20 }), prev, DEFAULTS).verdict).toBe('regressed');
    expect(classifyMetric(def('Q05'), measured('Q05', { complex: 899, long: 20 }), prev, DEFAULTS).verdict).toBe('improved');
  });

  it('a previous 0 makes any change beyond the tolerance: G07 0 → 1 is regressed, and its floor breached', () => {
    const { classifyMetric } = loadCompare();
    expect(classifyMetric(def('G07'), measured('G07', 1), measured('G07', 0), DEFAULTS)).toMatchObject({ verdict: 'regressed', floor: 'breached' });
  });

  it('a pass/fail value: true → false is regressed, false → true improved (Q01)', () => {
    const { classifyMetric } = loadCompare();
    expect(classifyMetric(def('Q01'), measured('Q01', false), measured('Q01', true), DEFAULTS)).toMatchObject({ verdict: 'regressed', floor: 'breached' });
    expect(classifyMetric(def('Q01'), measured('Q01', true), measured('Q01', false), DEFAULTS)).toMatchObject({ verdict: 'improved', floor: 'held' });
  });

  it('a multi-part metric with one part improved and one regressed is regressed (G03)', () => {
    const { classifyMetric } = loadCompare();
    const prev = measured('G03', { median: 20, p90: 200, share_over_500: 2.5 });
    expect(classifyMetric(def('G03'), measured('G03', { median: 10, p90: 200, share_over_500: 5 }), prev, DEFAULTS).verdict).toBe('regressed');
  });

  it('a part that is null is skipped and flagged partial, the verdict coming from the other parts (G08, F8 item 3)', () => {
    const { classifyMetric } = loadCompare();
    const prev = measured('G08', { conforming_share: 100, approve_reject_with_ai: 0, distinct_trailers: [] });
    const result = classifyMetric(def('G08'), measured('G08', { conforming_share: null, approve_reject_with_ai: 0, distinct_trailers: [] }), prev, DEFAULTS);
    expect(result).toMatchObject({ verdict: 'stable', floor: 'held' });
    expect(result.flags).toContain('partial: conforming_share');
  });

  it('a metric whose direction is pending gets no comparison (G12)', () => {
    const { classifyMetric } = loadCompare();
    expect(classifyMetric(def('G12'), measured('G12', 50), measured('G12', 10), DEFAULTS).verdict).toBe('pending');
  });

  it('an info metric gets no comparison, however much it changed (E04)', () => {
    const { classifyMetric } = loadCompare();
    expect(classifyMetric(def('E04'), measured('E04', { views: 900 }), measured('E04', { views: 10 }), DEFAULTS).verdict).toBe('info');
  });

  it('a reading at run time (G15, Q17) is never compared — not-comparable, flagged — but its floor is still evaluated (ruling I)', () => {
    const { classifyMetric } = loadCompare();
    const g15 = classifyMetric(def('G15'), measured('G15', { stale_branches: 1, duplicate_ids: 0 }), measured('G15', { stale_branches: 0, duplicate_ids: 0 }), DEFAULTS);
    expect(g15).toMatchObject({ verdict: 'not-comparable', floor: 'breached' });
    expect(g15.flags).toContain('run-time reading');
    const q17 = classifyMetric(def('Q17'), measured('Q17', false), measured('Q17', true), DEFAULTS);
    expect(q17).toMatchObject({ verdict: 'not-comparable', floor: 'breached' });
    expect(q17.flags).toContain('run-time reading');
    expect(classifyMetric(def('Q17'), measured('Q17', true), measured('Q17', true), DEFAULTS)).toMatchObject({ verdict: 'not-comparable', floor: 'held' });
  });

  it('a current value that is not measurable has no verdict and no floor verdict, its reason flagged', () => {
    const { classifyMetric } = loadCompare();
    const reason = 'the toolchain half was not run (--no-toolchain)';
    const result = classifyMetric(def('Q01'), { id: 'Q01', status: 'not-measurable', reason }, measured('Q01', true), DEFAULTS);
    expect(result).toMatchObject({ verdict: null, floor: null });
    expect(result.flags).toContain(`not-measurable: ${reason}`);
  });

  it('a previous value that is absent or not measurable makes the metric new', () => {
    const { classifyMetric } = loadCompare();
    expect(classifyMetric(def('G02'), measured('G02', 30), { id: 'G02', status: 'not-measurable', reason: 'no relevant commit in the window (total: 0)' }, DEFAULTS).verdict).toBe('new');
    expect(classifyMetric(def('G02'), measured('G02', 30), null, DEFAULTS).verdict).toBe('new');
    expect(classifyMetric(def('G02'), measured('G02', 30), undefined, DEFAULTS).verdict).toBe('new');
  });

  it('a current entry that is not-comparable (D01 on a patch release) stays not-comparable, its reason flagged', () => {
    const { classifyMetric } = loadCompare();
    const reason = 'a patch release: D01 is measured on major and minor releases only (dl-089 §2)';
    const result = classifyMetric(def('D01'), { id: 'D01', status: 'not-comparable', reason }, measured('D01', 95), DEFAULTS);
    expect(result.verdict).toBe('not-comparable');
    expect(result.flags).toContain(reason);
  });

  it("a metric's own tolerance overrides the defaults (5pp for a share, 20% for a count)", () => {
    const { classifyMetric } = loadCompare();
    const g02 = { ...def('G02'), tolerance: '5pp' };
    expect(classifyMetric(g02, measured('G02', 35), measured('G02', 30), DEFAULTS).verdict).toBe('stable');
    expect(classifyMetric(g02, measured('G02', 35.01), measured('G02', 30), DEFAULTS).verdict).toBe('improved');
    const q05 = { ...def('Q05'), tolerance: '20%' };
    const prev = measured('Q05', { complex: 1000, long: 20 });
    expect(classifyMetric(q05, measured('Q05', { complex: 1200, long: 20 }), prev, DEFAULTS).verdict).toBe('stable');
    expect(classifyMetric(q05, measured('Q05', { complex: 1201, long: 20 }), prev, DEFAULTS).verdict).toBe('regressed');
  });

  it('a retired metric has no verdict and is flagged retired', () => {
    const { classifyMetric } = loadCompare();
    const result = classifyMetric({ ...def('G02'), status: 'retired', retired_in: 'v0.3' }, measured('G02', 30), measured('G02', 10), DEFAULTS);
    expect(result.verdict).toBeNull();
    expect(result.flags).toContain('retired');
  });

  it('flags a small sample, the unchecked and unresolved counts (F8 item 2) and an unpinned Node', () => {
    const { classifyMetric } = loadCompare();
    expect(classifyMetric(def('G02'), measured('G02', 30, { items: 10, small_sample: true }), measured('G02', 30), DEFAULTS).flags).toContain('small-sample');
    const p02 = (unchecked: number): MetricEntry => measured('P02', 0, { raw: { checked: 529, failing: 0, unchecked }, items: 529 });
    expect(classifyMetric(def('P02'), p02(121), p02(0), DEFAULTS).flags).toContain('unchecked 121');
    const p03 = measured('P03', 0, { raw: { checked: 4, failing: 0, unresolved: 3 }, items: 4 });
    expect(classifyMetric(def('P03'), p03, p03, DEFAULTS).flags).toContain('unresolved 3');
    const q03 = (node: Record<string, string>): MetricEntry => ({ id: 'Q03', status: 'measured', value: { statements: 95, branches: 90, functions: 93, lines: 95 }, raw: node });
    expect(classifyMetric(def('Q03'), q03({ node: 'v22.21.0', node_pinned: 'v22.12.0' }), q03({}), DEFAULTS).flags).toContain('node v22.21.0 (pinned v22.12.0)');
  });
});

describe('evaluateFloor — every declared floor, held and breached', () => {
  const floor = (id: string, value: unknown): 'held' | 'breached' | null => loadCompare().evaluateFloor(id, measured(id, value));

  it.each([
    ['G01', 100, 99.99],
    ['G05', 100, 99.99],
    ['G06', 100, 99.99],
    ['G10', 100, 99.99],
    ['Q10', 100, 99.99],
    ['Q11', 100, 99.99],
    ['G07', 0, 1],
    ['G14', 0, 1],
    ['Q09', 0, 1],
    ['P01', 0, 1],
    ['P02', 0, 1],
    ['P03', 0, 1],
    ['P04', 0, 1],
    ['P05', 0, 1],
    ['Q01', true, false],
    ['Q17', true, false],
    ['P07', true, false],
    ['Q12', 999.99, 1000],
    ['Q20', 0, -1],
    ['G08', { conforming_share: 100, approve_reject_with_ai: 0 }, { conforming_share: 99.99, approve_reject_with_ai: 0 }],
    ['G08', { conforming_share: null, approve_reject_with_ai: 0 }, { conforming_share: 100, approve_reject_with_ai: 1 }],
    ['G15', { stale_branches: 0, duplicate_ids: 0 }, { stale_branches: 0, duplicate_ids: 1 }],
    ['G15', { stale_branches: 0, duplicate_ids: 0 }, { stale_branches: 1, duplicate_ids: 0 }],
    ['Q02', { total: 10, failing: 0, disabled: 0 }, { total: 10, failing: 1, disabled: 0 }],
    ['Q02', { total: 10, failing: 0, disabled: 0 }, { total: 10, failing: 0, disabled: 1 }],
    ['Q04', { 'src/memory/audit.ts': 90, 'src/memory/state-machine.ts': 100 }, { 'src/memory/audit.ts': 89.99, 'src/memory/state-machine.ts': 100 }],
    ['Q07', { cycles: 0, bypasses: 0 }, { cycles: 1, bypasses: 0 }],
    ['Q07', { cycles: 0, bypasses: 0 }, { cycles: 0, bypasses: 1 }],
    ['Q08', { unused_runtime_dependencies: 0, install_size_bytes: 5 }, { unused_runtime_dependencies: 1, install_size_bytes: 5 }],
  ])('%s: %j holds, %j breaches', (id, held, breached) => {
    expect(floor(id, held)).toBe('held');
    expect(floor(id, breached)).toBe('breached');
  });

  it('a trend metric has no floor; a floor that is not measurable has no floor verdict', () => {
    const { evaluateFloor } = loadCompare();
    expect(evaluateFloor('G02', measured('G02', 30))).toBeNull();
    expect(evaluateFloor('G07', { id: 'G07', status: 'not-measurable', reason: 'no team.members at the point' })).toBeNull();
  });
});

describe('the declared tables match the catalogue (guards)', () => {
  const live = CATALOGUE.metrics.filter((m) => m.status !== 'retired');

  it('FLOORS covers exactly the non-retired floor metrics', () => {
    const { FLOORS } = loadCompare();
    expect(Object.keys(FLOORS).sort()).toEqual(live.filter((m) => m.kind === 'floor').map((m) => m.id).sort());
  });

  it('COMPONENTS covers exactly the non-retired metrics that are neither info nor pending — floors included (ruling H)', () => {
    const { COMPONENTS } = loadCompare();
    expect(Object.keys(COMPONENTS).sort()).toEqual(live.filter((m) => m.kind !== 'info' && m.direction !== 'pending').map((m) => m.id).sort());
  });

  it('RUN_TIME_READINGS is G15, Q17 and E01–E05 (ruling I, until dl-173 puts it in the catalogue)', () => {
    const { RUN_TIME_READINGS } = loadCompare();
    expect([...RUN_TIME_READINGS].sort()).toEqual(RUN_TIME);
  });
});

/** The ids that get a comparison verdict when the current entry is measured: not info, not pending, not run-time. */
function comparableIds(report: Report): string[] {
  return CATALOGUE.metrics
    .filter((m) => m.kind !== 'info' && m.direction !== 'pending' && !RUN_TIME.includes(m.id) && m.status !== 'retired')
    .map((m) => m.id)
    .filter((id) => report.metrics.find((e) => e.id === id)?.status === 'measured');
}

describe('compareReports — two runs (dl-089 §3)', () => {
  it('one row per catalogue metric, in catalogue order', async () => {
    const comparison = await loadCompare().compareReports({ catalogue: CATALOGUE, current: fixtureReport('v0.2'), previous: fixtureReport('v0.1'), history: [fixtureReport('v0.1'), fixtureReport('v0.2')] });
    expect(comparison.rows.map((r) => r.id)).toEqual(CATALOGUE.metrics.map((m) => m.id));
    expect(rowOf(comparison, 'G02')).toMatchObject({ previous: 40.25, value: 45.5, verdict: 'improved' });
    expect(rowOf(comparison, 'G01')).toMatchObject({ verdict: 'stable', floor: 'held' });
  });

  it('with no previous report every comparable metric is new', async () => {
    const current = fixtureReport('v0.1');
    const comparison = await loadCompare().compareReports({ catalogue: CATALOGUE, current, previous: null, history: [current] });
    const ids = comparableIds(current);
    expect(ids.length).toBeGreaterThan(30);
    expect(comparison.rows.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.verdict])).toEqual(ids.map((id) => [id, 'new']));
  });

  it('a run whose window was named by --previous has no previous report: every comparable metric is new, the header names the revision (F7)', async () => {
    const { compareReports, renderReport } = loadCompare();
    const current: Report = { ...fixtureReport('v0.2'), previous: { release: 'abc1234', commit: SHA('1'), report: null, basis: '--previous' } as unknown as Report['previous'] };
    const comparison = await compareReports({ catalogue: CATALOGUE, current, previous: null, history: [current] });
    const ids = comparableIds(current);
    expect(comparison.rows.filter((r) => ids.includes(r.id)).map((r) => r.verdict)).toEqual(ids.map(() => 'new'));
    expect(renderReport(comparison)).toMatch(/^\| Previous run \|.*abc1234.*\|$/m);
  });
});

/** A catalogue at version 3: a copy of the live one whose v3 change redefines G02 and adds G17. */
function catalogueV3(): Catalogue {
  const base = liveCatalogue();
  const metrics = [...base.metrics];
  const g16 = metrics.findIndex((m) => m.id === 'G16');
  metrics.splice(g16 + 1, 0, { id: 'G17', name: 'Fixture metric', definition: 'A metric added by the fixture catalogue.', scope: 'window', kind: 'trend', direction: 'up' });
  return { ...base, version: 3, changes: [...base.changes, { version: 3, source: 'dl-999-fixture', added: ['G17'], redefined: ['G02'] }], metrics };
}

describe('compareReports — across catalogue versions, like-for-like (dl-089 §3)', () => {
  const v3 = catalogueV3();
  const v1Ids = v3.changes.find((c) => c.version === 1)!.added!;

  /** The previous run, measured with catalogue 1: only the v1 metrics, G02 stored at 30. */
  function previousAtV1(): Report {
    const old = withEntry(fixtureReport('v0.2'), 'G02', { status: 'measured', value: 30, raw: { with_body: 120, total: 400 }, items: 400, small_sample: false });
    return { ...old, catalogue_version: 1, metrics: old.metrics.filter((m) => v1Ids.includes(m.id)) };
  }

  /** The current run, measured with catalogue 3: G17 measured. */
  function currentAtV3(): Report {
    const now = fixtureReport('v0.3');
    const metrics = [...now.metrics];
    metrics.splice(metrics.findIndex((m) => m.id === 'G16') + 1, 0, { id: 'G17', status: 'measured', value: 10 });
    return { ...now, catalogue_version: 3, metrics };
  }

  it('the catalogue fixture is valid', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateCatalogue } = require('../../scripts/release-health/catalogue.cjs') as { validateCatalogue: (doc: unknown) => string[] };
    expect(validateCatalogue(v3)).toEqual([]);
  });

  it('re-measures the previous point once and compares with the re-measured values; the header says so', async () => {
    const { compareReports, renderReport } = loadCompare();
    const previous = previousAtV1();
    const remeasured = withEntry({ ...currentAtV3(), release: previous.release, measurement_point: previous.measurement_point, previous: previous.previous }, 'G02', { status: 'measured', value: 46, raw: { with_body: 184, total: 400 }, items: 400, small_sample: false });
    const remeasure = jest.fn(async (report: Report) => (report === previous ? remeasured : report));
    const current = currentAtV3();
    const comparison = await compareReports({ catalogue: v3, current, previous, history: [previous, current], remeasure });
    expect(remeasure).toHaveBeenCalledTimes(1);
    expect(remeasure.mock.calls[0]![0]).toBe(previous);
    expect(rowOf(comparison, 'G02')).toMatchObject({ previous: 46, value: 46.75, verdict: 'stable' });
    expect(rowOf(comparison, 'G17').verdict).toBe('stable');
    expect(renderReport(comparison)).toMatch(/^\| Catalogue \|.*re-measured like-for-like: yes.*\|$/m);
  });

  it('when the re-measurement fails, a redefined metric is not-comparable (naming the version), an added one new, the rest compared with the stored values', async () => {
    const { compareReports, renderReport } = loadCompare();
    const previous = previousAtV1();
    const current = currentAtV3();
    const remeasure = jest.fn(async (): Promise<Report> => {
      throw new Error('the worktree could not be created');
    });
    const comparison = await compareReports({ catalogue: v3, current, previous, history: [previous, current], remeasure });
    expect(remeasure).toHaveBeenCalledTimes(1);
    const g02 = rowOf(comparison, 'G02');
    expect(g02.verdict).toBe('not-comparable');
    expect(g02.flags).toContainEqual(expect.stringMatching(/redefined in catalogue v3/));
    const g08 = rowOf(comparison, 'G08');
    expect(g08.verdict).toBe('not-comparable');
    expect(g08.flags).toContainEqual(expect.stringMatching(/redefined in catalogue v2/));
    expect(rowOf(comparison, 'G17').verdict).toBe('new');
    expect(rowOf(comparison, 'G16').verdict).toBe('info');
    expect(rowOf(comparison, 'Q18').verdict).toBe('new');
    expect(rowOf(comparison, 'G01')).toMatchObject({ previous: 100, value: 100, verdict: 'stable' });
    expect(renderReport(comparison)).toMatch(/^\| Catalogue \|.*re-measured like-for-like: no \(.+\).*\|$/m);
  });
});

describe('the trend over three runs (dl-089 §3)', () => {
  it("with three runs, the Trend section lists each metric's last three values", async () => {
    const { compareReports, renderReport } = loadCompare();
    const runs = ['v0.1', 'v0.2', 'v0.3'].map(fixtureReport);
    const trend = section(renderReport(await compareReports({ catalogue: CATALOGUE, current: runs[2]!, previous: runs[1]!, history: runs })), 'Trend');
    expect(trend).toMatch(/^.*G02.*v0\.1: 40\.25\b.*v0\.2: 45\.5\b.*v0\.3: 46\.75\b.*$/m);
    expect(trend).toMatch(/^.*G09.*v0\.1: 5\.5\b.*v0\.2: 4\.25\b.*v0\.3: 4\b.*$/m);
  });

  it('with two runs, the Trend section says there is no trend yet', async () => {
    const { compareReports, renderReport } = loadCompare();
    const runs = ['v0.2', 'v0.3'].map(fixtureReport);
    const trend = section(renderReport(await compareReports({ catalogue: CATALOGUE, current: runs[1]!, previous: runs[0]!, history: runs })), 'Trend');
    expect(trend).toContain('fewer than three runs (2): no trend yet');
  });
});

describe('renderReport — report-layout.md', () => {
  it('writes the title, the header table and the sections in the layout order, one Comparison row per metric', async () => {
    const { compareReports, renderReport } = loadCompare();
    const md = renderReport(await compareReports({ catalogue: CATALOGUE, current: fixtureReport('v0.2'), previous: fixtureReport('v0.1'), history: [fixtureReport('v0.1'), fixtureReport('v0.2')] }));
    expect(md.split('\n')[0]).toBe('# Release health — v0.2');
    for (const label of ['Release', 'Measurement point', 'Previous run', 'Catalogue', 'Toolchain']) expect(md).toMatch(new RegExp(`^\\| ${label} \\|`, 'm'));
    expect([...md.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(SECTIONS);
    expect([...section(md, 'Comparison').matchAll(/^\| ([A-Z][0-9]{2}) \|/gm)].map((m) => m[1])).toEqual(CATALOGUE.metrics.map((m) => m.id));
  });

  it('is byte-identical on the same inputs (REQ-SYS-07)', async () => {
    const { compareReports, renderReport } = loadCompare();
    const run = async (): Promise<string> => renderReport(await compareReports({ catalogue: CATALOGUE, current: fixtureReport('v0.3'), previous: fixtureReport('v0.2'), history: ['v0.1', 'v0.2', 'v0.3'].map(fixtureReport) }));
    const first = await run();
    expect(await run()).toBe(first);
  });

  const LAYOUT = readFileSync(join(REPO_ROOT, 'docs', '08_health', 'report-layout.md'), 'utf-8');
  const flat = (text: string): string => text.replace(/`/g, '').replace(/\s+/g, ' ');

  it('AC 2 (task-307): the Previous proposals placeholder lists pending beside the four dl-089 §4 labels', () => {
    const start = LAYOUT.indexOf('\n## Previous proposals\n');
    const end = LAYOUT.indexOf('\n## Improvements\n');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const placeholder = flat(LAYOUT.slice(start, end));
    for (const label of ['adopted and effective', 'adopted, no effect yet', 'not adopted', 'superseded', 'pending']) expect(placeholder).toContain(label);
  });

  it('AC 2 (task-307): a settle paragraph says pending applies when the previous release is kind: patch, naming dl-167', () => {
    const prose = LAYOUT.slice(LAYOUT.lastIndexOf('```') + 3).split(/\n\s*\n/).map(flat);
    expect(prose.filter((p) => p.includes('pending') && p.includes('kind: patch') && p.includes('dl-167'))).toHaveLength(1);
  });
});

describe('compare.cjs — the command line', () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach(removeTempDir));

  /** A root with the catalogue, the schema and the v0.1 and v0.2 fixture reports under paths.health. */
  function root(): string {
    const dir = makeTempGitRepo();
    roots.push(dir);
    const health = join(dir, 'docs', '08_health');
    mkdirSync(health, { recursive: true });
    mkdirSync(join(dir, '.wingfoil'), { recursive: true });
    copyFileSync(join(REPO_ROOT, '.wingfoil', 'memory.yaml'), join(dir, '.wingfoil', 'memory.yaml'));
    writeFileSync(join(dir, '.wingfoil', 'dna.yaml'), 'version: 1\npaths:\n  health: [ docs/08_health/ ]\n');
    for (const name of ['metrics.yaml', 'release-health.schema.json']) copyFileSync(join(REPO_ROOT, 'docs', '08_health', name), join(health, name));
    for (const version of ['v0.1', 'v0.2']) copyFileSync(join(FIXTURES, `release-health-${version}.json`), join(health, `release-health-${version}.json`));
    return dir;
  }

  function writeReport(dir: string, path: string, report: unknown): string {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    return target;
  }

  function run(dir: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [COMPARE_SCRIPT, ...args], { cwd: dir, encoding: 'utf-8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  const MD = join('docs', '08_health', 'release-health-v0.2.md');

  it('exit 0: writes release-health-<version>.md beside the report and prints its path; no finding, no immediate bug', () => {
    const dir = root();
    const result = run(dir, ['--release', 'v0.2', '--root', dir]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim().endsWith(MD)).toBe(true);
    expect(existsSync(join(dir, MD))).toBe(true);
    expect(readFileSync(join(dir, MD), 'utf-8').split('\n')[0]).toBe('# Release health — v0.2');
    expect(result.stderr).not.toContain('immediate bug-ingest');
  });

  it.each([
    ['a missing --release', [] as string[], ['--release']],
    ['an unknown argument', ['--release', 'v0.2', '--bogus'], ['--bogus']],
  ])('exit 2 on %s, the message naming it', (_what, args, named) => {
    const dir = root();
    const result = run(dir, [...args, '--root', dir]);
    expect(result.status).toBe(2);
    expect(result.stderr.startsWith('release-health compare: ')).toBe(true);
    for (const word of named) expect(result.stderr).toContain(word);
    expect(result.stdout).toBe('');
    expect(existsSync(join(dir, MD))).toBe(false);
  });

  it('exit 2 on a report that does not validate against the schema, naming the file', () => {
    const dir = root();
    writeReport(dir, 'docs/08_health/release-health-v0.2.json', { ...fixtureReport('v0.2'), schema_version: 7 });
    const result = run(dir, ['--release', 'v0.2', '--root', dir]);
    expect(result.status).toBe(2);
    expect(result.stderr.startsWith('release-health compare: ')).toBe(true);
    expect(result.stderr).toContain('release-health-v0.2.json');
    expect(existsSync(join(dir, MD))).toBe(false);
  });

  it("exit 2 when the report's release.version is not --release, naming both", () => {
    const dir = root();
    const other = writeReport(dir, 'elsewhere/report.json', fixtureReport('v0.3'));
    const result = run(dir, ['--release', 'v0.2', '--report', other, '--root', dir]);
    expect(result.status).toBe(2);
    expect(result.stderr.startsWith('release-health compare: ')).toBe(true);
    expect(result.stderr).toContain('v0.3');
    expect(result.stderr).toContain('v0.2');
  });

  it("exit 2 when the report's catalogue_version is not the catalogue's version", () => {
    const dir = root();
    writeReport(dir, 'docs/08_health/release-health-v0.2.json', { ...fixtureReport('v0.2'), catalogue_version: 1 });
    const result = run(dir, ['--release', 'v0.2', '--root', dir]);
    expect(result.status).toBe(2);
    expect(result.stderr.startsWith('release-health compare: ')).toBe(true);
    expect(result.stderr).toContain('catalogue');
    expect(existsSync(join(dir, MD))).toBe(false);
  });

  it('exit 2 when the previous report the report names is absent, naming it', () => {
    const dir = root();
    unlinkSync(join(dir, 'docs', '08_health', 'release-health-v0.1.json'));
    const result = run(dir, ['--release', 'v0.2', '--root', dir]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('release-health-v0.1.json');
    expect(existsSync(join(dir, MD))).toBe(false);
  });

  // Review send-back F4: a malformed catalogue tolerance is refused, never replaced by the default.
  it.each([
    ['no unit', '"5"', /["'`]5["'`]/],
    ['a relative tolerance on a share-only metric', '"5%"', /5%/],
  ])('exit 2 on a catalogue tolerance with %s, naming the metric and the value (G02)', (_what, tolerance, value) => {
    const dir = root();
    const path = join(dir, 'docs', '08_health', 'metrics.yaml');
    const text = readFileSync(path, 'utf-8');
    const patched = text.replace(/( {2}- id: G02\n(?: {4}.*\n)*? {4}direction: up\n)/, `$1    tolerance: ${tolerance}\n`);
    expect(patched).not.toBe(text);
    writeFileSync(path, patched);
    const result = run(dir, ['--release', 'v0.2', '--root', dir]);
    expect(result.status).toBe(2);
    expect(result.stderr.startsWith('release-health compare: ')).toBe(true);
    expect(result.stderr).toContain('G02');
    expect(result.stderr).toMatch(value);
    expect(existsSync(join(dir, MD))).toBe(false);
  });

  /** A root whose current run is the patch v0.3.2, its previous the patch v0.3.1 (with its .md), the v0.3 minor before. */
  function patchRoot(): string {
    const dir = root();
    copyFileSync(join(FIXTURES, 'release-health-v0.3.json'), join(dir, 'docs', '08_health', 'release-health-v0.3.json'));
    writeReport(dir, 'docs/08_health/release-health-v0.3.1.json', patchReport('v0.3.1', SHA('4'), { release: 'v0.3', commit: SHA('3') }));
    writeFileSync(join(dir, 'docs', '08_health', 'release-health-v0.3.1.md'), PATCH_PREVIOUS_MD);
    writeReport(dir, 'docs/08_health/release-health-v0.3.2.json', patchReport('v0.3.2', SHA('5'), { release: 'v0.3.1', commit: SHA('4') }));
    // A decoy: were retro-v0.3.1 looked up, RH-v0.3.1-01 would settle as adopted.
    mkdirSync(join(dir, 'docs', '04_memory', 'design', 'dls'), { recursive: true });
    writeFileSync(join(dir, 'docs', '04_memory', 'design', 'dls', 'retro-v0.3.1.md'), `---\nid: retro-v0.3.1\ntype: decision-log\nstatus: ready\n---\n\n${PATCH_RETRO}`);
    return dir;
  }

  it("AC 1 (task-307): a patch previous run — every RH-v0.3.1-NN is pending (the next minor's retrospective), the decoy retro-v0.3.1 never read", () => {
    const dir = patchRoot();
    for (const version of ['v0.3.1', 'v0.3.2']) expect(schemaErrors(JSON.parse(readFileSync(join(dir, 'docs', '08_health', `release-health-${version}.json`), 'utf-8')))).toEqual([]);
    const result = run(dir, ['--release', 'v0.3.2', '--root', dir]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const previous = section(readFileSync(join(dir, 'docs', '08_health', 'release-health-v0.3.2.md'), 'utf-8'), 'Previous proposals');
    for (const n of ['01', '02', '03']) expect(previous).toContain(`| RH-v0.3.1-${n} | — | pending (${PENDING_NOTE}) |`);
    expect(previous).not.toMatch(/adopted/);
  });

  it('AC 1 (task-307, characterization): a minor previous run with no retrospective still settles as not adopted (no retrospective)', () => {
    const dir = root();
    copyFileSync(join(FIXTURES, 'release-health-v0.3.json'), join(dir, 'docs', '08_health', 'release-health-v0.3.json'));
    writeFileSync(join(dir, 'docs', '08_health', 'release-health-v0.2.md'), [
      '# Release health — v0.2',
      '',
      '## Proposals',
      '',
      '### RH-v0.2-01 — Q05 Complexity',
      '',
      '- Finding: Q05 regressed (complex 30 → 36)',
      '- Evidence: the fixture.',
      '- Proposed element: decision-log',
      '- Proposed target release: v0.3',
      '',
      '## Previous proposals',
      '',
    ].join('\n'));
    const result = run(dir, ['--release', 'v0.3', '--root', dir]);
    expect(result.status).toBe(0);
    const previous = section(readFileSync(join(dir, 'docs', '08_health', 'release-health-v0.3.md'), 'utf-8'), 'Previous proposals');
    expect(previous).toContain('| RH-v0.2-01 | — | not adopted (no disposition recorded (no retrospective)) |');
  });
});
