/** One CLI step of the per-template smoke run. */
export interface SmokeStep {
  /** argv passed to `wingfoil`. */
  readonly args: readonly string[];
  /** When `true`, stdout must parse as JSON. */
  readonly json?: boolean;
  /** Keep this step's parsed JSON stdout under this name, for a later `'{<name>.<field>}'` arg. */
  readonly capture?: string;
  /** Fields this step's parsed JSON stdout must carry, with exactly these values. */
  readonly expect?: Readonly<Record<string, string>>;
}

/** One observed smoke check. */
export interface SmokeCheck {
  /** What was checked, e.g. `[Scrum] wingfoil dna show --format json`. */
  readonly label: string;
  /** Whether the check passed. */
  readonly ok: boolean;
  /** Exit code / reason summary. */
  readonly detail: string;
}

/** Result of {@link runSmoke}. */
export interface SmokeReport {
  /** `true` when every recorded check passed. */
  readonly ok: boolean;
  /** Checks in execution order, up to and including the first failure. */
  readonly checks: readonly SmokeCheck[];
}

/** Options for {@link runSmoke}. */
export interface SmokeOptions {
  /** Executable to spawn — `wingfoil` on PATH at staging, `node` in tests. */
  readonly command: string;
  /** argv prepended to every invocation, e.g. `[".../dist/cli.js"]`. */
  readonly commandArgs?: readonly string[];
  /** Environment for every spawned process (defaults to `process.env`). */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * When given, `wingfoil --version` must print this semver: bare, or as the build stamp
   * `<semver> (<commit>)` with any commit (`unknown` and `-dirty` included) unless
   * {@link expectedCommit} is given too.
   */
  readonly expectedVersion?: string;
  /**
   * When given, `wingfoil --version` must print exactly `<expectedVersion> (<expectedCommit>)`
   * (task-254, `bug-235`). Requires {@link expectedVersion}; must be a hex commit name of 7–64 digits,
   * never `unknown` or `-dirty`. {@link runSmoke} throws otherwise.
   */
  readonly expectedCommit?: string;
  /** Progress sink, one line per check. */
  readonly log?: (line: string) => void;
}

/** Every template `wingfoil init` supports, in smoke order. */
export const SMOKE_TEMPLATES: readonly string[];

/** The per-template CLI steps, `init` first. */
export function smokeSteps(template: string): readonly SmokeStep[];

/** Run the dl-023 smoke; stops at the first failing check. Throws on an invalid `expectedCommit`. */
export function runSmoke(options: SmokeOptions): SmokeReport;

/** Throw unless `commit` is a hex commit name of 7–64 digits (no `-dirty`, not `unknown`). */
export function assertCommitName(commit: string): void;

/** Parse `[--expect-version X [--expect-commit SHA]] [-- command args...]`; throws on a bad argument. */
export function parseSmokeArgs(argv: readonly string[]): {
  command: string;
  commandArgs: string[];
  expectedVersion?: string;
  expectedCommit?: string;
};
