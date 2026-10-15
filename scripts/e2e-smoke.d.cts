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
  /**
   * task-243: run this step with the fake agent switched on — `WINGFOIL_FAKE_AGENT_CONNECT=1` and
   * `WINGFOIL_FAKE_AGENT_RECORD=<a file outside the project>` (spec-016 §2.7). Read by {@link smokeAgentRun} only.
   */
  readonly fakeAgent?: boolean;
}

/**
 * task-243: copy fixture files into the project and commit them. `from` is relative to the fixtures
 * directory ({@link AGENT_FIXTURES}), `to` relative to the project; copied byte for byte, then
 * `git add` of every `to` and `git commit -m <commit>`. Label `[<T>/agent] commit <to1>, <to2>`.
 */
export interface SmokeCopyStep {
  readonly copy: ReadonlyArray<readonly [string, string]>;
  readonly commit: string;
}

/**
 * task-243: a check on what `agent execute` left, not a CLI call. `run` may hold a `{<name>.<field>}`
 * placeholder.
 * - `record-commit` — exactly one commit subject starts with `agent: record `, it is `agent: record <run>`,
 *   and that commit changes only `docs/runs/<element-id>.jsonl`. Label `[<T>/agent] one agent: record commit for <run>`.
 * - `fake-read` — the fake's record holds exactly one launch line that read the session Resource
 *   `wingfoil://session/<role>/task:<element-id>/<parent of the record commit>` from the `wingfoil` server.
 *   Label `[<T>/agent] the fake agent read the session Resource for <run>`.
 */
export interface SmokeProbeStep {
  readonly probe: 'record-commit' | 'fake-read';
  readonly run: string;
  readonly role?: string;
}

/** One step of the task-243 agent run: a CLI step, a copy step, or a probe. */
export type SmokeAgentStep = SmokeStep | SmokeCopyStep | SmokeProbeStep;

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

/** task-243: the checkout's agent fixtures (`test/fixtures/agents`), the source of every copy step. */
export const AGENT_FIXTURES: string;

/** task-243: the agent run's scenario for `template`, `init` first (spec-016 §2.7). */
export function agentRunSteps(template: string): readonly SmokeAgentStep[];

/**
 * task-243: run `steps` (default: {@link agentRunSteps}) in its own fresh throwaway git repository; every
 * check labelled `[<template>/agent] …`, the working tree required clean after each step, stops at the
 * first failure. Each step's environment is passed to `invoke` as its third argument: `env` without any
 * `WINGFOIL_FAKE_AGENT_*` variable, plus `WINGFOIL_FAKE_AGENT_CONNECT=1` and
 * `WINGFOIL_FAKE_AGENT_RECORD=<a file outside the project>` on a `fakeAgent` step.
 */
export function smokeAgentRun(
  template: string,
  invoke: (args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) => { status: number | null; stdout: string; stderr: string },
  env: NodeJS.ProcessEnv,
  steps?: readonly SmokeAgentStep[],
  fixtures?: string,
): SmokeCheck[];

/**
 * task-242 (`bug-328`): the Journey 4 example the smoke runs per template, from the checkout:
 * `<checkout>/docs/examples/06-workflow-approval/run.sh`.
 */
export const JOURNEY_SCRIPT: string;

/**
 * task-242: the `wingfoil` commands the journey's transcript (`$ wingfoil …` lines) must hold, in order:
 * `workflow start`, `workflow next`, `memory add … --workflow`, `memory submit`, `workflow status`,
 * `memory approve`, `workflow next`, `workflow finalize`, `workflow end`.
 */
export const JOURNEY_COMMANDS: readonly string[];

/**
 * task-242 (`bug-328`): run `bash <script>` (default {@link JOURNEY_SCRIPT}) with a `wingfoil` shim that
 * execs `argv` (program first) on `PATH`, `WINGFOIL=wingfoil` and `WINGFOIL_EXAMPLE_TEMPLATE=<template>` set
 * over `env` (an inherited `WINGFOIL` never applies). One check, labelled
 * `[<template>/journey] bash docs/examples/06-workflow-approval/run.sh`: ok iff exit 0, the last non-empty
 * stdout line starts `OK: `, and the transcript holds {@link JOURNEY_COMMANDS} in order. Passing detail
 * `exit 0, <n> wingfoil commands, <the OK line>`; failing details `could not find <cmd> on PATH` (the program
 * `argv[0]` resolves to no executable), `exit <n>: <the last "FAIL: " line of stderr, else its last line, else
 * "no output on stderr">` (`<n>` the signal when bash died of one), `exit 0, but no "OK: " line ends its
 * output`, `the transcript lacks: <command>`, `could not run bash: <message>`, and `could not run the journey:
 * <message>` (any other error, caught). Never throws.
 *
 * `timeoutMs` (default `600000`, 600 s) bounds the run: on expiry `bash` is killed with `SIGKILL` and the check
 * fails with detail `timed out after <timeoutMs / 1000> s`.
 */
export function smokeJourney(
  template: string,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  script?: string,
  timeoutMs?: number,
): SmokeCheck;

/** The Markdown report `--report` writes (`bug-134`): no clock in it, so the same run gives the same bytes. */
export function formatReport(report: SmokeReport, meta: SmokeReportMeta): string;

/** Run the dl-023 smoke; stops at the first failing check. Throws on an invalid `expectedCommit`. */
export function runSmoke(options: SmokeOptions): SmokeReport;

/**
 * task-282 (`bug-310`): the porcelain status of the pack inputs (`PACK_INPUTS`, `write-build-info.cjs`) in
 * `root` — `''` when none has a change. Throws `--candidate: git could not report the status of the pack
 * inputs` when git cannot answer.
 */
export function candidateStatus(root: string): string;

/** task-282 (`bug-310`): remove `<root>/dist` recursively; a no-op when it is absent. */
export function removeBuildOutput(root: string): void;

/** The result of one agent-run probe. */
export interface SmokeProbeResult {
  readonly ok: boolean;
  readonly detail: string;
}

/** task-243's git runner for the probes, in the agent run's project. */
export type SmokeGit = (args: readonly string[]) => { status: number | null; stdout: string; stderr: string };

/**
 * task-243's `fake-read` probe, exported by task-282 (handover 3): a record line that is not an object
 * with an array `argv` fails it with `line <n> of the fake agent's record has no argv` (1-based), before
 * any git call.
 */
export function probeFakeRead(run: string, role: string, git: SmokeGit, recordFile: string): SmokeProbeResult;

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
