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
