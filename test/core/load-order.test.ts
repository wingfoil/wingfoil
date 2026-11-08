/**
 * task-354 AC1 (`bug-470`, `bug-317` Expected) — every operation in `CORE_MODULES` has its `fn`, and every
 * exported constant of every compiled module has the same shape, whichever module of `dist/` is loaded first.
 *
 * An import cycle through the core barrel leaves a module's constants `undefined` when one of the cycle's
 * other files is the first one loaded: `require('./dist/core/agent-execute')` before `require('./dist/core')`
 * left `agentExecute` and `agentList` without `fn` in `CORE_MODULES` (`bug-470`).
 *
 * What is asserted, through the probe `helpers/load-order-probe.cjs` run in a child `node` (Node's own
 * CommonJS loader, not jest's module registry):
 * - for every `dist/**\/*.js` but `dist/cli.js` (the `bin` entry runs the CLI when required, task-354 D6), in
 *   byte order, loaded first, then the barrel `dist/core/index.js`, then every module: no `CORE_MODULES`
 *   operation is left without a function `fn`, and no `<module> <export>` differs in shape from the
 *   barrel-first run (the shape: `typeof`, and the keys of plain objects and arrays, to depth 4);
 * - the controls the verdict rests on: the probe tried every compiled module but `dist/cli.js`, and with the
 *   barrel first every operation has its `fn`.
 *
 * It runs against the `dist/` jest's global setup builds (`bug-003`), and builds nothing itself.
 * Deterministic: a sorted file list, the `require.cache` cleared before each try, no clock.
 */
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { DIST_DIR, spawnCapture } from '../cli/helpers/spawn-cli';

const PROBE = join(__dirname, 'helpers', 'load-order-probe.cjs');

interface ProbeReport {
  readonly checked: readonly string[];
  readonly baselineMissingFn: readonly string[];
  readonly problems: Readonly<Record<string, { readonly missingFn: readonly string[]; readonly shapeDiffs: readonly string[] }>>;
}

const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every compiled module under `dist/`, relative to it, in byte order — the list the probe must try. */
function compiledModules(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...compiledModules(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) found.push(relative(DIST_DIR, full).split(sep).join('/'));
  }
  return found.sort(byteOrder);
}

describe('task-354 AC1 — CORE_MODULES and every exported constant do not depend on which dist/ module loads first', () => {
  let report: ProbeReport;

  beforeAll(() => {
    const run = spawnCapture(process.execPath, [PROBE, DIST_DIR], { timeout: 120_000 });
    if (run.status !== 0) throw new Error(`the load-order probe exited ${run.status}:\n${run.stderr}`);
    report = JSON.parse(run.stdout) as ProbeReport;
  }, 150_000);

  it('the probe tried every compiled module but dist/cli.js, in byte order (D6)', () => {
    const expected = compiledModules(DIST_DIR).filter((module) => module !== 'cli.js');
    expect(expected).toContain('core/index.js');
    expect(expected).toContain('core/agent-execute.js');
    expect(report.checked).toEqual(expected);
  });

  it('with the barrel dist/core/index.js loaded first, every CORE_MODULES operation has its fn (the control)', () => {
    expect(report.baselineMissingFn).toEqual([]);
  });

  it('no first module leaves a CORE_MODULES operation without fn, or changes the shape of any exported constant', () => {
    expect(report.problems).toEqual({});
  });
});
