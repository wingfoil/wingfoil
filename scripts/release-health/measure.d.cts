/**
 * One metric of a release-health report (`docs/08_health/release-health.schema.json` `$defs.metric`): measured with
 * its value and raw counts, or not measured with the reason.
 */
export interface MetricEntry {
  readonly id: string;
  readonly status: 'measured' | 'not-measurable' | 'not-comparable';
  readonly reason?: string;
  readonly value?: unknown;
  readonly raw?: Readonly<Record<string, number | string | boolean | null>>;
  readonly items?: number;
  readonly small_sample?: boolean;
  readonly failing?: readonly string[];
  readonly evidence?: { readonly command?: string; readonly read_on?: string; readonly benchmark_commit?: string; readonly wingfoil_build?: string };
}

/** A release-health report, `release-health-<version>.json` (`docs/08_health/release-health.schema.json`). */
export interface Report {
  readonly schema_version: 1;
  readonly catalogue_version: number;
  readonly release: { readonly id: string; readonly version: string; readonly kind: 'major' | 'minor' | 'patch' };
  readonly measurement_point: { readonly ref: string; readonly commit: string; readonly basis: 'published-tag' | 'released-transition' };
  readonly previous: null | { readonly release: string; readonly commit: string; readonly report: string };
  readonly toolchain: { readonly node: string; readonly npm: string; readonly lockfile_sha256: string };
  readonly metrics: readonly MetricEntry[];
}

/** What an external source answered: the parsed JSON body and the response's `Date` header, or why it failed. */
export interface ExternalResponse {
  readonly ok: boolean;
  readonly body?: unknown;
  readonly date?: string | null;
  readonly error?: string;
}

/** Reads one external source: a GitHub API path (`gh api`) or a URL. The default runs `gh api --include` / `curl --include`. */
export type ExternalReader = (source: { readonly kind: 'gh' | 'url'; readonly target: string }) => ExternalResponse;

/** One toolchain command of the quality half (task-232), run in the measurement worktree. */
export interface ToolCall {
  /**
   * What the command measures: `install`, `build`, `typecheck`, `lint`, `test`, `coverage`, `examples/<name>`, `latency`,
   * `npm-view`; and, run by {@link measureRelease} after them (task-233, Q08's install size), `footprint-ls`, `footprint-pack`.
   */
  readonly step: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** What one toolchain command did: its exit status or signal, its output, or why it could not start. */
export interface ToolResult {
  readonly status: number | null;
  readonly signal?: string | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly error?: string;
}

/** Runs one toolchain command. The default spawns it; tests pass a stub. */
export type ToolRunner = (call: ToolCall) => ToolResult | Promise<ToolResult>;

/** Options of {@link measureToolchain}. */
export interface ToolchainOptions {
  /** The runner; default: spawn the command. */
  readonly tools?: ToolRunner;
  /** Measure even when the running Node is not the pipeline's pinned one (`publish.yml` `env.NODE_VERSION`). */
  readonly anyNode?: boolean;
  /** Skip what needs the network (Q17's `npm view`). */
  readonly offline?: boolean;
  /** `--maxWorkers` for the two jest runs (Q02, Q03/Q04). */
  readonly maxWorkers?: number;
  /** Progress lines (default: none). */
  readonly log?: (line: string) => void;
}

/** The signal handling of {@link measureRelease}'s worktree (`bug-329`); injectable for tests. */
export interface Interrupts {
  /** Where the handlers are installed (default: `process`). */
  readonly target?: { on(signal: string, handler: () => void): unknown; removeListener(signal: string, handler: () => void): unknown };
  /** What happens once the worktree is removed (default: re-raise the signal on this process). */
  readonly die?: (signal: string) => void | Promise<void>;
  /** The signals handled (default: SIGINT, SIGTERM, SIGHUP). */
  readonly signals?: readonly string[];
}

/** Options of {@link measureRelease}; the command-line flags of the same names. */
export interface MeasureOptions {
  /** The release version, `vX.Y` or `vX.Y.Z`: a release element at `HEAD` must carry it. */
  readonly release: string;
  /** The measurement point; default: the published tag, else the released transition (`dl-089` §1). */
  readonly at?: string;
  /** The previous measurement point; default: the most recent earlier report under `paths.health`. */
  readonly previous?: string;
  /** Skip the external snapshot: E01–E05 are `not-measurable`. */
  readonly offline?: boolean;
  /** The external reader (tests pass a stub). */
  readonly external?: ExternalReader;
  /** The catalogue file; default: `metrics.yaml` under `paths.health`. */
  readonly catalogue?: string;
  /** `false` skips the toolchain half (`--no-toolchain`): its seven metrics are `not-measurable` with that reason. */
  readonly toolchain?: boolean;
  /** The toolchain runner (tests pass a stub). */
  readonly tools?: ToolRunner;
  /** `--any-node`: see {@link ToolchainOptions.anyNode}. */
  readonly anyNode?: boolean;
  /** `--max-workers <n>`: see {@link ToolchainOptions.maxWorkers}. */
  readonly maxWorkers?: number;
  /** Progress lines (the command line writes them to stderr). */
  readonly log?: (line: string) => void;
  /** The worktree's signal handling (tests inject it). */
  readonly interrupts?: Interrupts;
}

/**
 * Run `fn` with a throw-away worktree of `commit` (detached, under a temporary directory), removed afterwards, guarded
 * against SIGINT, SIGTERM and SIGHUP (`bug-329`): a signal stops the running tool, removes the worktree and the
 * directory and re-raises, including one that landed while `fn` was synchronous; the promise then rejects
 * (`interrupted by <signal>`) instead of resolving.
 */
export function withGuardedWorktree<T>(
  root: string,
  commit: string,
  fn: (tree: string, dir: string, guard: { readonly interrupted: string | null; readonly stoppers: Set<() => Promise<void>> }) => Promise<T>,
  interrupts?: Interrupts,
): Promise<T>;

/** Measure a release of the repository at `root`: one entry per catalogue metric, in catalogue order. */
export function measureRelease(root: string, options: MeasureOptions): Promise<Report>;

/**
 * The toolchain half (task-232): Q01–Q04, Q11, Q12 and Q17 measured in `tree` (a checkout of the measurement point),
 * after `npm ci`, with the tool outputs written under `scratch`. A tool that fails makes its metric `not-measurable`.
 */
export function measureToolchain(tree: string, scratch: string, options?: ToolchainOptions): Promise<MetricEntry[]>;

/** What the latency pass's report (`WINGFOIL_LATENCY_REPORT=1`) says, or `null` when the output carries none. */
export interface LatencyReading {
  readonly machine: string;
  readonly idle: boolean;
  readonly load: { readonly before: number; readonly after: number } | null;
  readonly floorP95: number | null;
  readonly commands: readonly { readonly command: string; readonly marginalP95: number; readonly totalP95: number }[];
}

/** Read the latency pass's report out of its output (`test/core/helpers/latency.ts` `latencyReport`). */
export function parseLatencyReport(text: string): LatencyReading | null;

/** The process conformance of `base..point` (REQ-STATE-10): P01–P06, each with items checked and failing items named. */
export function processConformance(root: string, point: string, base: string | null): MetricEntry[];

/** The measurement point of the release `version` (`dl-089` §1): `at` when given, else the published tag, else the released transition. */
export function resolveMeasurementPoint(root: string, version: string, at?: string): Report['measurement_point'];

/** The report as written: two-space JSON and a final newline. */
export function formatReportJson(report: Report): string;

/** Split an HTTP response printed with its headers into `{ ok, date, body }` or `{ ok: false, error }`. */
export function parseHttp(text: string): ExternalResponse;

/** An HTTP `Date` header's day, `YYYY-MM-DD`, or `null`. */
export function httpDay(header: string | null | undefined): string | null;

/** The command line: writes the report, prints its path; returns the exit code (0, or 2 when it could not run). */
export function main(argv: readonly string[]): Promise<number>;

/** How {@link classifyTask} reads a task (Q18/Q19, `dl-133` §1; `memory.yaml` `task.stop_the_line`). */
export interface TaskClassRule {
  /** The release's version: before v0.3 the name-or-`bug:` heuristic decides, from v0.3 the declared field. */
  readonly version: string;
  /** The field the classification is declared in (`stop_the_line.field`, `kind`). */
  readonly field: string;
  /** The value that makes a task a fix (`stop_the_line.counts`, `fix`). */
  readonly counts: string;
  /** The field's declared values (`template.frontmatter.values`), when declared. */
  readonly values?: readonly string[];
}

/**
 * A task's class for Q18/Q19: `fix`, `feature`, or `null` when it cannot be classified. Before v0.3 (`dl-133` §1
 * backfill): fix when an id segment is `fix` or `bug:` names a bug. From v0.3: the declared field, `counts` → fix,
 * another declared value → feature; a feature task that absorbed a bug stays a feature.
 */
export function classifyTask(frontmatter: Readonly<Record<string, unknown>>, rule: TaskClassRule): 'fix' | 'feature' | null;
