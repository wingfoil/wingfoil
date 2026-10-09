/** One CLI step of the per-template smoke run. */
export interface SmokeStep {
  /** argv passed to `wingfoil`; an arg `'{<name>.<field>}'` is filled from an earlier capture. */
  readonly args: readonly string[];
  /** The exit code the step must end with (spec-005 §1); a non-zero one must carry §3's error on stderr. */
  readonly exit: 0 | 1 | 2;
  /** When `true`, stdout must parse as JSON. */
  readonly json?: boolean;
  /** Keep this step's parsed JSON stdout under this name, for a later `'{<name>.<field>}'` arg. */
  readonly capture?: string;
  /**
   * Dotted paths (`matches.0.id`, `entries.length`) that must hold exactly these values: in the parsed
   * JSON stdout of a step that exits 0, in the parsed spec-005 §3 error (`{ error, hint }`) of one that
   * does not. A string value may be a `'{<name>.<field>}'` placeholder.
   */
  readonly expect?: Readonly<Record<string, string | number>>;
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
   * (task-254, `bug-235`). Requires {@link expectedVersion}; must be a full sha (40 or 64 lowercase hex digits),
   * never `unknown` or `-dirty`. {@link runSmoke} throws otherwise.
   */
  readonly expectedCommit?: string;
  /** Progress sink, one line per check. */
  readonly log?: (line: string) => void;
}

/** What {@link formatReport} states about the run besides its checks. */
export interface SmokeReportMeta {
  /** The command the smoke drove, program first. */
  readonly command: readonly string[];
  /** The expected `--version` semver, when one was given. */
  readonly expectedVersion?: string;
  /** The expected build-stamp commit, when one was given. */
  readonly expectedCommit?: string;
}

/** Every template `wingfoil init` supports, in smoke order. */
export const SMOKE_TEMPLATES: readonly string[];

/** The per-template CLI steps, `init` first. */
export function smokeSteps(template: string): readonly SmokeStep[];

/**
 * Run `steps` (default: {@link smokeSteps}) in a fresh throwaway git repository; one check per step, the
 * working tree required clean after each; stops at the first failure.
 */
export function smokeTemplate(
  template: string,
  invoke: (args: readonly string[], cwd: string) => { status: number | null; stdout: string; stderr: string },
  env: NodeJS.ProcessEnv,
  steps?: readonly SmokeStep[],
): SmokeCheck[];

/** The Markdown report `--report` writes (`bug-134`): no clock in it, so the same run gives the same bytes. */
export function formatReport(report: SmokeReport, meta: SmokeReportMeta): string;

/** Run the dl-023 smoke; stops at the first failing check. Throws on an invalid `expectedCommit`. */
export function runSmoke(options: SmokeOptions): SmokeReport;

/** Throw unless `commit` is a full sha, 40 or 64 lowercase hex digits (no `-dirty`, not `unknown`). */
export function assertCommitName(commit: string): void;

/** Parse `[--expect-version X [--expect-commit SHA]] [--report PATH] [-- command args...]`; throws on a bad argument. */
export function parseSmokeArgs(argv: readonly string[]): {
  command: string;
  commandArgs: string[];
  expectedVersion?: string;
  expectedCommit?: string;
  reportPath?: string;
};
