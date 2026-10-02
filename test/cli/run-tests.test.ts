/**
 * `scripts/run-tests.cjs` — what `npm test` runs (task-154, `bug-013`): the parallel jest run, then the
 * latency suites alone. Pins the argument rule: no arguments runs both passes; any argument is a
 * targeted run, passed to the parallel run verbatim, with no latency pass.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { LATENCY_CONFIG, plannedRuns } from '../../scripts/run-tests.cjs';

const REPO_ROOT = join(__dirname, '..', '..');

describe('scripts/run-tests.cjs — the two passes of npm test', () => {
  it('with no arguments, runs the parallel suite and then the latency config', () => {
    expect(plannedRuns([])).toEqual([[], ['-c', LATENCY_CONFIG]]);
  });

  it('with arguments, runs only the parallel suite, with those arguments unchanged', () => {
    expect(plannedRuns(['test/core/foo.test.ts', '-t', 'name'])).toEqual([['test/core/foo.test.ts', '-t', 'name']]);
  });

  it('npm test runs this script, and the latency config it names exists', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe('node scripts/run-tests.cjs');
    expect(existsSync(join(REPO_ROOT, LATENCY_CONFIG))).toBe(true);
  });
});
