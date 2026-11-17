/**
 * `scripts/run-tests.cjs` — what `npm test` runs (task-154, `bug-013`). Pins the approver's ruling
 * (2026-10-03): the latency pass runs only when asked for explicitly — `WINGFOIL_LATENCY=1 npm test`,
 * `npm run test:latency`, or an argument naming a latency suite — and never from CI, `prepublishOnly`
 * or the publish workflow, so no publish is blocked by wall-clock noise.
 *
 * task-349 (`dl-170` Decision 1, AC 1 / AC 2; red-first): a run with no suite filter is a heavy gate and runs
 * every planned invocation inside one hold of the machine-wide lock (`scripts/heavy-gate.cjs`); a targeted run
 * of named suites does not take it. `runTests` takes its `spawn` and `gate` as injected dependencies, so the
 * wrapping is pinned here without a real jest or a real lock: `gate(options, run)` has `withHeavyGate`'s shape
 * and `run(childEnv)` returns the exit status; `spawn(jestArgv, env)` returns one jest run's exit status.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { LATENCY_SUITES } from '../latency-suites.cjs';
import { LATENCY_CONFIG, LATENCY_ENV, gateName, isHeavyRun, plannedRuns, runTests } from '../../scripts/run-tests.cjs';

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
    // task-349 (dl-170 Decision 1, ruling D2 (a)): the coverage run goes through this script, so through its lock.
    expect(pkg.scripts['test:coverage']).toBe('node scripts/run-tests.cjs --coverage');
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

describe('task-349 AC 1 / AC 2 — isHeavyRun: a run with no suite filter is a heavy gate, a targeted run is not', () => {
  it.each([[[]], [['--silent']], [['--coverage']], [['-t', 'x']], [['--maxWorkers=2']], [['--coverage', '--json', '--outputFile=coverage/jest-results.json']]])(
    'heavy: %j',
    (args: string[]) => {
      expect(isHeavyRun(args)).toBe(true);
    },
  );

  it.each([
    [['test/core/foo.test.ts']],
    [['./test/x.test.ts', '-t', 'y']],
    [['src/core/index.ts']],
    [['./src/core/index.ts']],
    [['core/foo.test.ts']],
    [['--testPathPattern', 'core']],
    [['--testPathPattern=core']],
    [['--testPathPatterns', 'core']],
    [['--testPathPatterns=core']],
    [['--findRelatedTests', 'src/a.ts']],
    [['--findRelatedTests=src/a.ts']],
  ])('targeted: %j', (args: string[]) => {
    expect(isHeavyRun(args)).toBe(false);
  });

  it('an argument naming a latency suite is a targeted run', () => {
    for (const suite of LATENCY_SUITES) {
      expect(isHeavyRun([suite])).toBe(false);
      expect(isHeavyRun([`./${suite}`])).toBe(false);
    }
  });

  it('gateName is `coverage` when --coverage is among the arguments, else `test`', () => {
    expect(gateName([])).toBe('test');
    expect(gateName(['--silent'])).toBe('test');
    expect(gateName(['--coverage'])).toBe('coverage');
    expect(gateName(['--coverage', '--json', '--outputFile=coverage/jest-results.json'])).toBe('coverage');
  });
});

describe('task-349 AC 1 / AC 2 — runTests: one hold around every planned run of a heavy gate, none for a targeted run', () => {
  type Env = Record<string, string | undefined>;

  /** A fake `gate` and `spawn` recording what runTests asks of them; `statuses` are the spawns' exit statuses, in order. */
  function fakes(statuses: (number | null)[] = []) {
    const holds: { options: Record<string, unknown> }[] = [];
    const spawns: { argv: readonly string[]; env: Env; insideHold: boolean }[] = [];
    let inside = false;
    const gate = async (options: Record<string, unknown>, run: (childEnv: Env) => number | Promise<number>): Promise<number> => {
      holds.push({ options });
      inside = true;
      try {
        return await run({ ...(options.env as Env | undefined), WINGFOIL_GATE_HOLDER: '4242' });
      } finally {
        inside = false;
      }
    };
    const spawn = (argv: readonly string[], env: Env): number | null => {
      spawns.push({ argv: [...argv], env, insideHold: inside });
      return statuses.length > 0 ? statuses.shift()! : 0;
    };
    return { gate, spawn, holds, spawns };
  }

  it('no arguments: one hold of gate `test`, the parallel run inside it, its env carrying WINGFOIL_GATE_HOLDER', async () => {
    const f = fakes();
    await expect(runTests({ args: [], env: { KEEP: 'kept' }, spawn: f.spawn, gate: f.gate })).resolves.toBe(0);
    expect(f.holds).toHaveLength(1);
    expect(f.holds[0]!.options).toMatchObject({ gate: 'test' });
    expect(f.spawns.map((s) => [s.argv, s.insideHold, s.env.WINGFOIL_GATE_HOLDER])).toEqual([[[], true, '4242']]);
  });

  it('WINGFOIL_LATENCY=1: the parallel run and the latency pass are one hold', async () => {
    const f = fakes();
    await expect(runTests({ args: [], env: { WINGFOIL_LATENCY: '1' }, spawn: f.spawn, gate: f.gate })).resolves.toBe(0);
    expect(f.holds).toHaveLength(1);
    expect(f.spawns.map((s) => [s.argv, s.insideHold, s.env.WINGFOIL_GATE_HOLDER])).toEqual([
      [[], true, '4242'],
      [['-c', LATENCY_CONFIG], true, '4242'],
    ]);
  });

  it('--coverage: one hold of gate `coverage`, the arguments reaching jest unchanged', async () => {
    const f = fakes();
    const args = ['--coverage', '--json', '--outputFile=coverage/jest-results.json'];
    await runTests({ args, env: {}, spawn: f.spawn, gate: f.gate });
    expect(f.holds).toHaveLength(1);
    expect(f.holds[0]!.options).toMatchObject({ gate: 'coverage' });
    expect(f.spawns.map((s) => [s.argv, s.insideHold])).toEqual([[args, true]]);
  });

  it('a targeted run of named suites takes no hold and spawns jest exactly as before, with the env it was given', async () => {
    const f = fakes();
    const env = { KEEP: 'kept' };
    await expect(runTests({ args: ['test/core/foo.test.ts', '-t', 'name'], env, spawn: f.spawn, gate: f.gate })).resolves.toBe(0);
    expect(f.holds).toEqual([]);
    expect(f.spawns).toHaveLength(1);
    expect(f.spawns[0]!.argv).toEqual(['test/core/foo.test.ts', '-t', 'name']);
    expect(f.spawns[0]!.insideHold).toBe(false);
    expect(f.spawns[0]!.env.WINGFOIL_GATE_HOLDER).toBeUndefined();
    expect(f.spawns[0]!.env.KEEP).toBe('kept');
  });

  it('a failing parallel run ends the hold with its status, and the latency pass does not run', async () => {
    const f = fakes([1]);
    await expect(runTests({ args: [], env: { WINGFOIL_LATENCY: '1' }, spawn: f.spawn, gate: f.gate })).resolves.toBe(1);
    expect(f.spawns.map((s) => s.argv)).toEqual([[]]);
  });
});
