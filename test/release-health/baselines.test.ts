/**
 * task-241 AC 3 — guard on the two baseline reports (red until the developer's session 3 commits them; the runs
 * themselves are by hand, under the slot, approver ruling D3). The reports are `docs/08_health/release-health-v0.1.json`
 * (measured at `5b16ab61`, the released transition of minor-v0.1: no v0.1 tag exists) and
 * `docs/08_health/release-health-v0.2.json` (at the published tag `v0.2.1`, its window from the v0.1 report).
 *
 * Also pinned, from the approver's rulings of 2026-10-13: A — G07 is `not-measurable` at both points (no root
 * `.wingfoil/dna.yaml` there, so no `team.members`); B — the runs were `--offline` (E01–E05, Q17 not measured);
 * C — only the JSON reports are committed, no comparison Markdown; D3 — `--any-node`, recorded on every measured
 * toolchain entry. The comparison of the two runs (dl-089 §7) is the developer's notes, not asserted here.
 *
 * Deterministic: reads committed files and resolves fixed revisions.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';

import type { Report } from '../../scripts/release-health/measure.cjs';
import { git } from '../storage/helpers/git-fixture';
import { REPO_ROOT, liveCatalogue, loadCompare } from './helpers/compare-api';

const HEALTH = join(REPO_ROOT, 'docs', '08_health');
const TOOLCHAIN = ['Q01', 'Q02', 'Q03', 'Q04', 'Q11', 'Q12', 'Q17'];

function baseline(version: string): Report {
  const path = join(HEALTH, `release-health-${version}.json`);
  expect(existsSync(path)).toBe(true);
  return JSON.parse(readFileSync(path, 'utf-8')) as Report;
}

const rev = (name: string): string => git(REPO_ROOT, ['rev-parse', name]).trim();

describe('AC 3 — the v0.1 and v0.2 baselines under paths.health', () => {
  it.each(['v0.1', 'v0.2'])('release-health-%s.json exists and validates against the schema', (version) => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(JSON.parse(readFileSync(join(HEALTH, 'release-health.schema.json'), 'utf-8')) as object);
    validate(baseline(version));
    expect((validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`)).toEqual([]);
  });

  it('v0.1 is measured at 5b16ab61, its released transition, with no previous run', () => {
    const report = baseline('v0.1');
    expect(report.release).toMatchObject({ version: 'v0.1' });
    expect(report.measurement_point).toMatchObject({ commit: rev('5b16ab61'), basis: 'released-transition' });
    expect(report.previous).toBeNull();
  });

  it('v0.2 is measured at the published tag v0.2.1, its window from the v0.1 report', () => {
    const report = baseline('v0.2');
    expect(report.release).toMatchObject({ version: 'v0.2' });
    expect(report.measurement_point).toMatchObject({ ref: 'v0.2.1', commit: rev('v0.2.1^{commit}'), basis: 'published-tag' });
    expect(report.previous).toEqual({ release: 'v0.1', commit: rev('5b16ab61'), report: 'docs/08_health/release-health-v0.1.json', basis: 'report' });
  });

  it.each(['v0.1', 'v0.2'])('%s: catalogue version 2; every measured toolchain entry records node_pinned (--any-node, ruling D3)', (version) => {
    const report = baseline(version);
    expect(report.catalogue_version).toBe(2);
    const toolchain = report.metrics.filter((m) => TOOLCHAIN.includes(m.id) && m.status === 'measured');
    expect(toolchain.length).toBeGreaterThan(0);
    for (const m of toolchain) expect(m.raw).toHaveProperty('node_pinned');
  });

  it.each(['v0.1', 'v0.2'])('%s: G07 not-measurable (ruling A); E01–E05 and Q17 not read (--offline, ruling B)', (version) => {
    const report = baseline(version);
    for (const id of ['G07', 'E01', 'E02', 'E03', 'E04', 'E05', 'Q17']) {
      expect([id, report.metrics.find((m) => m.id === id)?.status]).toEqual([id, 'not-measurable']);
    }
  });

  it('no comparison Markdown is committed beside them (ruling C)', () => {
    const tracked = git(REPO_ROOT, ['ls-files', 'docs/08_health']).split('\n');
    expect(tracked).not.toContain('docs/08_health/release-health-v0.1.md');
    expect(tracked).not.toContain('docs/08_health/release-health-v0.2.md');
  });

  it('compareReports on the two: one row per catalogue metric, no re-measurement (same catalogue)', async () => {
    const catalogue = liveCatalogue();
    const remeasure = jest.fn();
    const v01 = baseline('v0.1');
    const v02 = baseline('v0.2');
    const comparison = await loadCompare().compareReports({ catalogue, current: v02, previous: v01, history: [v01, v02], remeasure });
    expect(comparison.rows.map((r) => r.id)).toEqual(catalogue.metrics.map((m) => m.id));
    expect(remeasure).not.toHaveBeenCalled();
  });
});
