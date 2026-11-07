/** The environment variable that overrides the gate directory (`dl-170`, task-349 D5). */
export const GATE_DIR_ENV: string;

/** The environment variable a holder hands every process it starts: the holder's pid, so a gate inside it is nested. */
export const GATE_HOLDER_ENV: string;

/** An environment as the gate reads it. */
export type GateEnv = Readonly<Record<string, string | undefined>>;

/**
 * The machine-wide gate directory: `env.WINGFOIL_GATE_DIR` when non-empty, else `<tmpdir>/wingfoil-heavy-gate-<uid>`
 * (defaults `os.tmpdir()`, `process.getuid()`).
 */
export function gateDir(env: GateEnv, options?: { readonly tmpdir?: string; readonly uid?: number }): string;

/** `<dir>/heavy-gate.lock`. */
export function gateLockPath(dir: string): string;

/** `<dir>/heavy-gate.trace.jsonl`, the append-only trace `task-344` reads. */
export function gateTracePath(dir: string): string;

/** The options of {@link acquireHeavyGate}; every dependency is injectable. */
export interface HeavyGateOptions {
  /** The gate directory (see {@link gateDir}); created on first use. */
  readonly dir: string;
  /** The gate's name: `test`, `coverage`, `build` or `typecheck`. */
  readonly gate: string;
  /** The absolute worktree the gate runs in, recorded in the lock and the trace. */
  readonly worktree: string;
  /** The holder's pid; defaults to this process. */
  readonly pid?: number;
  /** The environment read for `WINGFOIL_GATE_HOLDER` and `CI`; defaults to `process.env`. */
  readonly env?: GateEnv;
  /** The load averages; defaults to `os.loadavg`. */
  readonly loadavg?: () => number[];
  /** The number of cores; defaults to `os.cpus().length`. */
  readonly cpus?: () => number;
  /** Whether a pid is a live process; defaults to `process.kill(pid, 0)` (EPERM = alive). */
  readonly isAlive?: (pid: number) => boolean;
  /** The clock, in milliseconds; defaults to `Date.now`. */
  readonly now?: () => number;
  /** One wait between polls; defaults to a real timer. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Where the one wait line and a takeover line go; defaults to stderr. */
  readonly log?: (message: string) => void;
  /** How often to poll while waiting, in milliseconds; defaults to 2000. */
  readonly pollMs?: number;
}

/**
 * Take the machine-wide lock, waiting while it is held by a live pid or (unless `CI=true`) while the 1-minute load
 * average is above the cores; a lock left by a dead pid or unreadable is taken over. Nested (`WINGFOIL_GATE_HOLDER`
 * names the live pid the lock records): returns at once, writing nothing.
 */
export function acquireHeavyGate(options: HeavyGateOptions): Promise<{ readonly nested: boolean }>;

/** Remove the lock if it records `pid` and write the `release` record; `false`, and nothing changed, otherwise. */
export function releaseHeavyGate(options: {
  readonly dir: string;
  readonly pid?: number;
  readonly now?: () => number;
  /** The gate's exit status; `null` when it ended on a signal. */
  readonly status?: number | null;
}): boolean;

/**
 * Acquire, run `run` with the environment plus `WINGFOIL_GATE_HOLDER` (the holder's pid), release unless nested;
 * resolves to `run`'s result.
 */
export function withHeavyGate(
  options: HeavyGateOptions,
  run: (childEnv: Record<string, string | undefined>) => number | null | Promise<number | null>,
): Promise<number | null>;
