/** The jest config holding the suites that must run alone (`jest.latency.config.js`). */
export const LATENCY_CONFIG: string;

/**
 * The jest invocations `npm test` makes for `args`, in order: with no arguments, the parallel run and
 * then the latency pass; with arguments, only the parallel run, with them.
 */
export function plannedRuns(args: readonly string[]): string[][];
