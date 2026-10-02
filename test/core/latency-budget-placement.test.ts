/**
 * Structural guard for where and how the suite measures latency. Born of
 * `bug-011-cli-latency-assertion-measures-spawn-contention` (task-067-fix-cli-latency-assertion);
 * given one statistical shape and an honest statement of its reach by
 * `task-154-give-latency-budgets-statistical-shape-guard-says-what` (`bug-012`, `bug-013`, `bug-014`).
 *
 * **What it enforces — a same-file, textual check.** For every `.ts`/`.cjs` file under `test/` (this
 * file excepted), it reads that file's own source text and asserts two rules:
 *
 * 1. **One clock.** No file but `test/core/helpers/latency.ts` contains a wall-clock marker
 *    ({@link WALL_CLOCK_MARKERS}). Every timing suite therefore measures through that module, whose
 *    samplers refuse fewer than 20 runs and whose `p95` is the one percentile in use — REQ-PERF's
 *    "p95 over >= 20 runs" (`docs/02_requirements/03_sard/02_performance-nfr.md`). This is what
 *    retired the single-sample MCP budget of `bug-012`.
 * 2. **No timed spawn without a documented exemption.** No file both *spawns* and *times*, unless it
 *    is listed in {@link EXEMPTIONS} with its reason. A file spawns if its text contains a spawn
 *    marker ({@link SPAWN_MARKERS}) or imports the suite's spawn helper, `test/cli/helpers/spawn-cli.ts`;
 *    it times if its text contains a clock marker or imports `test/core/helpers/latency.ts`. That
 *    combination is what reproduced bug-011: a wall-clock budget wrapped around a spawned
 *    `node dist/cli.js`, which measured Node startup and CPU contention from sibling jest workers
 *    rather than the query, and failed on an unmodified `main`. Every exemption must still name an
 *    existing file that really does both, so a stale one fails too.
 *
 * **What it does not see.** The check reads one file at a time and follows no import other than the
 * two named above. A spawn reached through any other module is invisible to it: the git calls inside
 * `test/storage/helpers/git-fixture.ts` (which `test/core/query-latency.test.ts` uses to seed its
 * repository, outside the timed region), and the git processes production code starts inside a timed
 * operation (`memory history` shells out to git — part of the cost the budget is about, not an
 * error). Nor does it recognise timing taken through `new Date(` (dates are built for other reasons in
 * the suite) or derived from timers. So it makes the bug-011 regression *harder to reintroduce by
 * copy-paste*; it does not make it impossible. An import-graph pass would close the gap, and would be
 * a different instrument.
 *
 * The check is textual, so a marker named in a *comment* counts too. That is intentional rather than
 * merely tolerated: it stops a removed pattern from being reintroduced by copy-paste out of a
 * "here is what we used to do" note. A file explaining why it no longer reads the clock should say so
 * in prose ("a wall-clock reading taken around it"), not by quoting the API. The two helper imports
 * are matched in `from '…'` form only, so a helper path mentioned in prose is not an import.
 *
 * Grounding: the `testing` directive ("Tests are deterministic and isolated; no reliance on external
 * services or wall-clock/random", and its T1 — a guard says exactly what it asserts) and the
 * `determinism` directive (REQ-SYS-07).
 *
 * Lives in `test/core/` with the project's other cross-cutting structural guards
 * (`module-layout.test.ts`, `pillar-isolation.test.ts`, `parity.test.ts`), and excludes itself from
 * the scan, since the marker lists below would otherwise match its own source.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const TEST_ROOT = join(__dirname, '..');

/** This file's own path, relative to `test/` — excluded from the scan (see the module doc). */
const SELF = relative(TEST_ROOT, __filename).split(sep).join('/');

/** The one module allowed to read the wall clock (rule 1). */
const LATENCY_HELPER = 'core/helpers/latency.ts';

/** Source markers for starting a child process. `child_process` catches the `node:`-prefixed form too. */
const SPAWN_MARKERS = ['child_process', 'execFileSync', 'execSync', 'spawnSync'] as const;

/** Source markers for reading the wall clock — matched without call parentheses, so a reference
 * passed around (`const now = Date.now`) is caught as well as a call. */
const WALL_CLOCK_MARKERS = ['Date.now', 'performance.now', 'process.hrtime', 'perf_hooks'] as const;

/** `from '…/helpers/spawn-cli'`: the suite's own spawn helper (task-145). */
const SPAWN_HELPER_IMPORT = /from\s+['"][^'"]*helpers\/spawn-cli['"]/;

/** `from '…/helpers/latency'`: the one clock (rule 1). */
const LATENCY_HELPER_IMPORT = /from\s+['"][^'"]*helpers\/latency['"]/;

/**
 * Files allowed to spawn and time (rule 2), each with the reason it does not reproduce bug-011.
 * An entry is a decision, not a convenience: it says why the measured number is about the code.
 */
const EXEMPTIONS: Readonly<Record<string, string>> = {
  'cli/command-latency.test.ts':
    "REQ-PERF-02's Fit Criterion is worded against the commands (bug-013). The file spawns a measured " +
    'process-start floor and each command in the same run and budgets the per-run difference ' +
    "(sampleMarginalLatency), so the asserted number is the command's cost over the spawn, not the " +
    "spawn's wall-clock that bug-011 measured.",
};

/** What to do instead, named in every failure so a hit costs no lookup. */
const REMEDY_CLOCK = `time through test/${LATENCY_HELPER} (sampleLatency or sampleMarginalLatency, then p95) instead of reading the clock here`;
const REMEDY_SPAWN =
  'measure the operation in-process through the latency helper, as test/core/query-latency.test.ts does; ' +
  'if the budget really is worded at process level, budget the marginal cost over a measured floor ' +
  '(sampleMarginalLatency) and list the file in EXEMPTIONS in test/core/latency-budget-placement.test.ts with its reason';

/** Every jest-executed source file under `test/`, as `test/`-relative POSIX paths, sorted
 * (REQ-SYS-07 — `readdirSync` order is not guaranteed stable, so sort explicitly). */
function listTestSourceFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const absolute = join(dir, entry);
    const relativePath = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(absolute).isDirectory()) {
      out.push(...listTestSourceFiles(absolute, relativePath));
    } else if (entry.endsWith('.ts') || entry.endsWith('.cjs')) {
      out.push(relativePath);
    }
  }
  return out;
}

const SCANNED_FILES = listTestSourceFiles(TEST_ROOT).filter((path) => path !== SELF);

/** What a file's own source text shows it doing, by the markers and imports above. */
interface Classification {
  readonly clockMarkers: readonly string[];
  readonly spawnMarkers: readonly string[];
  readonly spawns: boolean;
  readonly times: boolean;
}

function classify(relativePath: string): Classification {
  const source = readFileSync(join(TEST_ROOT, relativePath), 'utf-8');
  const clockMarkers = WALL_CLOCK_MARKERS.filter((marker) => source.includes(marker));
  const spawnMarkers = SPAWN_MARKERS.filter((marker) => source.includes(marker));
  return {
    clockMarkers,
    spawnMarkers,
    spawns: spawnMarkers.length > 0 || SPAWN_HELPER_IMPORT.test(source),
    times: clockMarkers.length > 0 || LATENCY_HELPER_IMPORT.test(source),
  };
}

describe('latency budgets: one clock, no timed spawn without a documented exemption — same-file textual check (bug-011, bug-012, bug-014)', () => {
  it('scans a non-trivial, real set of test sources and recognises the suites it is about', () => {
    // Guards the guard: a broken path, filter or pattern would make every case below vacuously pass.
    expect(SCANNED_FILES.length).toBeGreaterThan(40);
    expect(SCANNED_FILES).not.toContain(SELF);
    expect(SCANNED_FILES).toContain(LATENCY_HELPER);
    expect(classify(LATENCY_HELPER)).toMatchObject({ times: true, spawns: false });
    for (const timingSuite of ['core/query-latency.test.ts', 'mcp/resource-latency.test.ts', 'mcp/server.test.ts']) {
      expect({ timingSuite, ...classify(timingSuite) }).toMatchObject({ times: true, spawns: false });
    }
    expect(classify('cli/program.integration.test.ts').spawns).toBe(true);
    expect(classify('cli/helpers/spawn-cli.ts')).toMatchObject({ spawns: true, times: false });
  });

  it.each(SCANNED_FILES.filter((path) => path !== LATENCY_HELPER))(
    'test/%s takes no wall-clock reading of its own (rule 1)',
    (relativePath) => {
      const problems = classify(relativePath).clockMarkers.map((marker) => `test/${relativePath} names ${marker}: ${REMEDY_CLOCK}`);
      expect(problems).toEqual([]);
    },
  );

  it.each(SCANNED_FILES)('test/%s does not time a spawned process unless exempted with a reason (rule 2)', (relativePath) => {
    const { spawns, times, spawnMarkers, clockMarkers } = classify(relativePath);
    const problems =
      spawns && times && !(relativePath in EXEMPTIONS)
        ? [
            `test/${relativePath} both spawns (${spawnMarkers.join(', ') || 'imports helpers/spawn-cli'}) and times ` +
              `(${clockMarkers.join(', ') || 'imports helpers/latency'}): ${REMEDY_SPAWN}`,
          ]
        : [];
    expect(problems).toEqual([]);
  });

  it('every exemption is live: it names an existing file that spawns and times, and gives a reason', () => {
    for (const [relativePath, reason] of Object.entries(EXEMPTIONS)) {
      expect({ relativePath, exists: existsSync(join(TEST_ROOT, relativePath)) }).toEqual({ relativePath, exists: true });
      expect({ relativePath, ...classify(relativePath) }).toMatchObject({ spawns: true, times: true });
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });
});
