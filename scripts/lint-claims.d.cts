/** The shape a claim-lint warning reports (`dl-097` §2 (b)). */
export type ClaimWarningKind = 'state-claim' | 'empty-output';

/** One warning: a claim whose shape lacks its evidence. */
export interface ClaimWarning {
  /** Repository-relative path (or the path as given). */
  readonly file: string;
  /** 1-based line of the phrase. */
  readonly line: number;
  readonly kind: ClaimWarningKind;
  readonly message: string;
}

/** A warning of {@link lintMarkdown}, before a file is attached. */
export type MarkdownWarning = Omit<ClaimWarning, 'file'>;

/** The warnings of one Markdown text; `lines`, when given, limits them to items holding one of those lines. */
export function lintMarkdown(text: string, lines?: ReadonlySet<number>): MarkdownWarning[];

/** The outcome of {@link lintClaims}. */
export interface ClaimLintReport {
  readonly files: readonly string[];
  readonly warnings: readonly ClaimWarning[];
}

/** Options of {@link lintClaims}: `base` lints the Memory documents `base...HEAD` changed; `files` lints those files whole. */
export interface ClaimLintOptions {
  readonly base?: string;
  readonly files?: readonly string[];
}

/** Lint the given files, or the Memory documents a range changed, in the repository at `root`. */
export function lintClaims(root: string, options: ClaimLintOptions): ClaimLintReport;
