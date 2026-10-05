/**
 * `scripts/run-tests.cjs` — what `npm test` runs (task-154, `bug-013`). Pins the approver's ruling
 * (2026-10-03): the latency pass runs only when asked for explicitly — `WINGFOIL_LATENCY=1 npm test`,
 * `npm run test:latency`, or an argument naming a latency suite — and never from CI, `prepublishOnly`
 * or the publish workflow, so no publish is blocked by wall-clock noise.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { LATENCY_SUITES } from '../latency-suites.cjs';
import { LATENCY_CONFIG, LATENCY_ENV, plannedRuns } from '../../scripts/run-tests.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf-8');

describe('scripts/run-tests.cjs — the latency pass runs only when asked for', () => {
  it('with no arguments and no opt-in, runs only the parallel suite', () => {
    expect(plannedRuns([], {})).toEqual([[]]);
    expect(plannedRuns([], { [LATENCY_ENV]: '0' })).toEqual([[]]);
  });

  it(`with no arguments and ${'WINGFOIL_LATENCY'}=1, runs the parallel suite and then the latency config`, () => {
    expect(LATENCY_ENV).toBe('WINGFOIL_LATENCY');
    expect(plannedRuns([], { WINGFOIL_LATENCY: '1' })).toEqual([[], ['-c', LATENCY_CONFIG]]);
  });

  it('with arguments, runs only the parallel suite, with those arguments unchanged — opt-in or not', () => {
    expect(plannedRuns(['test/core/foo.test.ts', '-t', 'name'], {})).toEqual([['test/core/foo.test.ts', '-t', 'name']]);
    expect(plannedRuns(['--silent'], { WINGFOIL_LATENCY: '1' })).toEqual([['--silent']]);
  });

  it('an argument naming a latency suite routes the whole invocation to the latency config', () => {
    for (const suite of LATENCY_SUITES) {
      expect(plannedRuns([suite], {})).toEqual([['-c', LATENCY_CONFIG, suite]]);
      expect(plannedRuns([`./${suite}`, '-t', 'x'], {})).toEqual([['-c', LATENCY_CONFIG, `./${suite}`, '-t', 'x']]);
    }
  });

  it('npm test runs this script, and npm run test:latency runs the latency config alone', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe('node scripts/run-tests.cjs');
    expect(pkg.scripts['test:latency']).toBe(`jest -c ${LATENCY_CONFIG}`);
    expect(existsSync(join(REPO_ROOT, LATENCY_CONFIG))).toBe(true);
  });

  it('neither CI nor the publish workflow opts in: prepublishOnly is the plain npm test, and no workflow names the latency pass', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.prepublishOnly).not.toMatch(/WINGFOIL_LATENCY|test:latency|jest\.latency/);
    for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/publish.yml']) {
      expect({ workflow, mentions: /WINGFOIL_LATENCY|test:latency|jest\.latency/.test(read(workflow)) }).toEqual({ workflow, mentions: false });
    }
  });
});
