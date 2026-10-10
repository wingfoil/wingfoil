/** The test suites that run alone, only when asked for, relative to the repository root: the spawning ones and {@link IN_PROCESS_LATENCY_SUITES}. */
export const LATENCY_SUITES: readonly string[];
/** The opt-in suites that time an operation in-process, spawning nothing they time (task-216). */
export const IN_PROCESS_LATENCY_SUITES: readonly string[];
