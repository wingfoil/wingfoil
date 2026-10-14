/**
 * task-241 review send-back F3 (red-first) — a cross-version comparison re-measures the previous run at its
 * measurement point's **commit**, which is immutable, never at its `ref`, which may have moved since (`dl-089` §3).
 *
 * `compareRelease` runs in a temporary root holding the catalogue, the schema, a previous report measured with
 * catalogue 1 whose point is `ref: main` at a fixed commit, and a current report at catalogue 2; the default
 * re-measurement is observed by replacing `measure.cjs`'s `measureRelease` with a recording stub (`jest.doMock`),
 * so nothing is measured. Deterministic: fixed fixture reports, no clock, no git, no network.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Report } from '../../scripts/release-health/measure.cjs';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { COMPARE_SCRIPT, REPO_ROOT, fixtureReport, liveCatalogue } from './helpers/compare-api';

const MEASURE_SCRIPT = join(REPO_ROOT, 'scripts', 'release-health', 'measure.cjs');
const POINT = '1'.repeat(40);

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

describe('F3 — the like-for-like re-measurement runs at the previous point commit', () => {
  it('measureRelease receives `at` = measurement_point.commit when the ref (main) is not the commit', async () => {
    const dir = makeTempGitRepo();
    roots.push(dir);
    const health = join(dir, 'docs', '08_health');
    mkdirSync(health, { recursive: true });
    mkdirSync(join(dir, '.wingfoil'), { recursive: true });
    copyFileSync(join(REPO_ROOT, '.wingfoil', 'memory.yaml'), join(dir, '.wingfoil', 'memory.yaml'));
    writeFileSync(join(dir, '.wingfoil', 'dna.yaml'), 'version: 1\npaths:\n  health: [ docs/08_health/ ]\n');
    for (const name of ['metrics.yaml', 'release-health.schema.json']) copyFileSync(join(REPO_ROOT, 'docs', '08_health', name), join(health, name));
    const v1Ids = liveCatalogue().changes.find((c) => c.version === 1)!.added!;
    const old = fixtureReport('v0.1');
    const previous: Report = { ...old, catalogue_version: 1, measurement_point: { ref: 'main', commit: POINT, basis: 'released-transition' }, metrics: old.metrics.filter((m) => v1Ids.includes(m.id)) };
    writeFileSync(join(health, 'release-health-v0.1.json'), `${JSON.stringify(previous, null, 2)}\n`);
    writeFileSync(join(health, 'release-health-v0.2.json'), `${JSON.stringify(fixtureReport('v0.2'), null, 2)}\n`);

    const calls: { root: string; options: Record<string, unknown> }[] = [];
    let compareRelease: ((root: string, options: Record<string, unknown>) => Promise<unknown>) | undefined;
    jest.isolateModules(() => {
      jest.doMock(MEASURE_SCRIPT, () => ({
        measureRelease: async (root: string, options: Record<string, unknown>) => {
          calls.push({ root, options });
          return { ...fixtureReport('v0.1'), measurement_point: previous.measurement_point };
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      compareRelease = (require(COMPARE_SCRIPT) as { compareRelease: typeof compareRelease }).compareRelease;
    });
    expect(typeof compareRelease).toBe('function');
    await compareRelease!(dir, { release: 'v0.2', search: () => ({ query: '', matches: [] }) });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options).toMatchObject({ release: 'v0.1', at: POINT });
  });
});
