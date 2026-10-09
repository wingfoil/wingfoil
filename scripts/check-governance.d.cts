/**
 * The rule a governance finding breaks (`dl-103` §1): the subject grammar, the canonical bracket, the
 * `Approver:`/`Reason:` body shape, the author's approval authority, the element's state, or a versioned
 * config file's `version:` over a `--base` range (`bug-249`, task-208).
 */
export type GovernanceRule = 'subject' | 'bracket' | 'body' | 'authority' | 'state' | 'config';

/** A check added after the script itself (task-208): each gates only the commits after its own introduction. */
export type GovernanceCheck = 'verb-edge' | 'status-outside-wf' | 'supersedes-pair' | 'config-version';

/**
 * Each later check's marker: the string whose first appearance in `scripts/check-governance.cjs`, on
 * `HEAD`'s first-parent line, is that check's introduction commit.
 */
export const CHECKS: Readonly<Record<GovernanceCheck, string>>;

/** One rule broken by one commit. */
export interface GovernanceFinding {
  /** The full sha of the commit. */
  readonly sha: string;
  /** The commit's subject line. */
  readonly subject: string;
  readonly rule: GovernanceRule;
  /** What is wrong, in one line. */
  readonly message: string;
  /**
   * `true` when the commit is not an ancestor of (nor) the introduction commit: the finding fails the
   * check. `false` for history, which is reported and does not fail it.
   */
  readonly gated: boolean;
  /** The later check that produced the finding, when it is one (task-208); absent for the base rules. */
  readonly check?: GovernanceCheck;
}

/** A commit whose state could not be checked, and why. A commit may have several entries. */
export interface UncheckedState {
  readonly sha: string;
  readonly subject: string;
  readonly reason: string;
}

/** The outcome of {@link checkGovernance}. */
export interface GovernanceReport {
  /** The commit the range ends at — the repository's `HEAD`. */
  readonly head: string;
  /** The exclusive start of the range, or `null` for the whole history. */
  readonly base: string | null;
  /** The commit that introduced the check, or `null` when none did (every commit is then gated). */
  readonly introducedAt: string | null;
  /** The `wf()` commits checked (configuration scopes excluded). */
  readonly checked: number;
  /**
   * Each later check's introduction commit, or `null` when no commit brought its marker in (it then
   * falls back to {@link introducedAt}); every entry is {@link introducedAt} when that was given.
   */
  readonly checkIntroductions: Readonly<Record<GovernanceCheck, string | null>>;
  /** The other non-merge commits of the range: read for status changes outside a `wf()` operation (`dl-139`). */
  readonly otherCommits: number;
  /** How many of {@link checked} are gated. */
  readonly gatedCommits: number;
  /** Every finding, oldest commit first, then by rule. */
  readonly findings: readonly GovernanceFinding[];
  /**
   * Commits whose state was not fully checked, and why. On a gated commit, a missing or invalid
   * `memory.yaml` is a finding instead of an entry here.
   */
  readonly stateUnchecked: readonly UncheckedState[];
}

/** Options of {@link checkGovernance}. */
export interface GovernanceOptions {
  /** Check `base..HEAD` instead of the whole history. */
  readonly base?: string;
  /**
   * The introduction commit. Defaults to the commit of `HEAD`'s first-parent line that added
   * `scripts/check-governance.cjs` — on `main`, the merge that landed it.
   */
  readonly introducedAt?: string;
}

/** Check every `wf()` commit of `base..HEAD` (or of the whole history) in the repository at `root`. */
export function checkGovernance(root: string, options?: GovernanceOptions): GovernanceReport;

/** `1` when any finding is gated, else `0`. */
export function exitCodeFor(report: GovernanceReport): 0 | 1;

/** The report as the lines the command prints. */
export function formatReport(report: GovernanceReport): string;
