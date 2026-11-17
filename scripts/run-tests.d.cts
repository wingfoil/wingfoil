/** The jest config holding the suites that must run alone (`jest.latency.config.js`). */
export const LATENCY_CONFIG: string;

/** The environment variable that opts `npm test` (no arguments) into the latency pass, when `1`. */
export const LATENCY_ENV: string;

/**
 * The jest invocations `npm test` makes for `args` under `env`, in order. Arguments naming a latency
 * suite go to the latency config; other arguments, to the parallel run only; no arguments, to the
 * parallel run, followed by the latency pass only when `WINGFOIL_LATENCY=1`.
 */
export function plannedRuns(args: readonly string[], env: Readonly<Record<string, string | undefined>>): string[][];

/**
 * Whether `args` make `npm test` a heavy gate (`dl-170` Decision 1): `false` for a targeted run — an argument naming
 * a suite (`test/…`, `./test/…`, `src/…`, `./src/…`, or ending in `.test.ts`), or `--testPathPattern`,
 * `--testPathPatterns` or `--findRelatedTests` — `true` otherwise, the empty list included.
 */
export function isHeavyRun(args: readonly string[]): boolean;

/** The gate name of a heavy run: `coverage` when `--coverage` is among `args`, else `test`. */
export function gateName(args: readonly string[]): string;

/** The injected dependencies of {@link runTests}. */
export interface RunTestsOptions {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  /** One jest run with `argv` under `env`; returns its exit status, `null` when it ended on a signal. */
  readonly spawn: (argv: readonly string[], env: Record<string, string | undefined>) => number | null;
  /** `withHeavyGate`'s shape: hold the gate around `run`, which receives the child environment and returns the status. */
  readonly gate: (
    options: { readonly gate: string; readonly env: Readonly<Record<string, string | undefined>> },
    run: (childEnv: Record<string, string | undefined>) => number | Promise<number>,
  ) => Promise<number>;
}

/**
 * Run {@link plannedRuns} for `args`: a heavy run inside one hold of `gate`, a targeted run without one; resolves to
 * the first non-zero exit status, or 0.
 */
export function runTests(options: RunTestsOptions): Promise<number>;
