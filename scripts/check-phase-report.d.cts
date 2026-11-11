/**
 * The mismatch kinds of `scripts/check-phase-report.cjs` (task-344 AC 1–2), in the order the `report`
 * subcommand checks and prints them: `task`, `head`, `commit-unknown`, `commit-outside`, `commit-unlisted`,
 * `trailer-missing`, `trailer-identity`, `trailer-forbidden`, `trailer-paragraph`, `file-unclaimed`,
 * `file-unchanged`, `uncommitted-unclaimed`, `uncommitted-missing`, `gate-missing`, `gate-status`, `gate-open`,
 * `plan-parent`.
 */
export const MISMATCH_KINDS: readonly string[];

/** One `gate <test|coverage|build|typecheck> exit=<integer>` claim of a report. */
export interface GateClaim {
  readonly gate: string;
  readonly exit: number;
}

/** A phase report's header and claims block, as {@link parseReport} reads it; the prose after the block is not read. */
export interface PhaseReport {
  /** `task-<n>` or the task's full id, from the header `REPORT <task> <phase> head=<sha>`. */
  readonly task: string;
  /** The phase token of the header (`design`, `red`, `green+refactor`, `review`); recorded, not checked. */
  readonly phase: string;
  /** The claimed head sha, 7–40 lowercase hex. */
  readonly head: string;
  /** The shas of the `commit` lines, the text after each sha dropped. */
  readonly commits: readonly string[];
  /** The paths of the `file` lines. */
  readonly files: readonly string[];
  /** The paths of the `uncommitted` lines. */
  readonly uncommitted: readonly string[];
  /** One entry per `gate` line, in the report's order (two lines for one gate claim two runs). */
  readonly gates: readonly GateClaim[];
}

/** A report whose header or claims block does not read: {@link line} is the 1-based line number at fault. */
export class ReportFormatError extends Error {
  readonly line: number;
}

/** One claim git or the gate trace contradicts. */
export interface Mismatch {
  /** One of {@link MISMATCH_KINDS}. */
  readonly kind: string;
  /** What is wrong, naming the offending sha, path or gate; printed after `<kind>: `. */
  readonly detail: string;
}

/** Read a report's header and claims block; throws {@link ReportFormatError}. */
export function parseReport(text: string): PhaseReport;

/**
 * Check a parsed report against the worktree's git state (`base..HEAD` on the first-parent line, the status) and the
 * heavy-gate trace at `tracePath`; `since` (ISO-8601) defaults to the committer date of `base`. `[]` when clean.
 */
export function checkReport(options: {
  readonly worktree: string;
  readonly report: PhaseReport;
  readonly base: string;
  readonly since?: string;
  readonly tracePath: string;
}): Mismatch[];

/**
 * The `plan-parent` mismatches of the `plan` documents at `rev` (default `HEAD`) whose non-empty `parent` names no
 * workflow, or no phase of its workflow, of the registry at that rev; only the plans among `paths` when given. Sorted
 * by path.
 */
export function checkPlanParents(options: {
  readonly worktree: string;
  readonly rev?: string;
  readonly paths?: readonly string[];
}): Mismatch[];

/**
 * The command line: `report --report <file> --base <rev> [--since <ISO-8601>] [--worktree <dir>] [--trace <file>]`
 * or `plans [--rev <rev>] [--worktree <dir>]`. Returns `0` (no mismatch), `1` (one stdout line per mismatch, then a
 * summary line) or `2` (a usage error, one stderr line `check-phase-report: <message>`).
 */
export function main(
  argv: readonly string[],
  io?: { readonly stdout?: (line: string) => void; readonly stderr?: (line: string) => void },
): number;
