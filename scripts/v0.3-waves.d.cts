/** One element of the mapping: a v0.3 task and the wave its Implementation Notes declare (`null` for `none`). */
export interface MappingEntry {
  readonly id: string;
  /** Root-relative path at HEAD. */
  readonly path: string;
  readonly wave: string | null;
}

/** One amend of a batch: the release (batch 0) or a waved task. */
export interface BatchItem extends MappingEntry {
  readonly kind: 'release' | 'task';
}

/** Items per task batch (batches 1…). */
export const BATCH_SIZE: number;
/** `minor-v0.3`, the release batch 0 amends. */
export const RELEASE_ID: string;
/** The release's root-relative path. */
export const RELEASE_PATH: string;
/** `['w0', 'w1', 'w2', 'w3']`, the release's `waves:`. */
export const WAVE_KEYS: readonly string[];

/** The body of `## Implementation Notes`, up to the next `## ` heading; `null` when absent. Pure. */
export function implementationNotes(text: string): string | null;

/** The wave a task's Implementation Notes declare: `wN` for `**wave:** N` (0–3), `null` for `none`; else a refusal. Pure. */
export function notesWave(text: string): { readonly ok: true; readonly wave: string | null } | { readonly ok: false; readonly message: string };

/** The document's frontmatter as an object (`{}` when absent or not a mapping). Pure. */
export function frontmatterOf(text: string): Record<string, unknown>;

/** The mapping, one entry per task document, sorted by task number; a refusal names the first bad document. Pure. */
export function deriveMapping(
  documents: readonly { readonly path: string; readonly text: string }[],
): { readonly ok: true; readonly entries: MappingEntry[] } | { readonly ok: false; readonly message: string };

/** Batch 0 the release, then the waved tasks in mapping order, `size` (default {@link BATCH_SIZE}) per batch. Pure. */
export function batches(entries: readonly MappingEntry[], size?: number): BatchItem[][];

/** Whether the document text already holds the item's target value. Pure. */
export function isApplied(item: Pick<BatchItem, 'kind' | 'wave'>, text: string): boolean;

/** The amend `--reason` of a task placed in `wave`. Pure. */
export function taskReason(wave: string): string;

/** The amend `--reason` of an item. Pure. */
export function reasonFor(item: Pick<BatchItem, 'kind' | 'wave'>): string;

/** POSIX-shell quoting. Pure. */
export function shellQuote(value: string): string;

/** The two shell lines of one item (`--edit`, then `memory amend`). Pure. */
export function printLines(item: BatchItem): string[];

/** Parsed command line, or a usage refusal. Pure. */
export function parseArgs(
  argv: readonly string[],
):
  | { readonly ok: true; readonly mode: 'plan' | 'print' | 'run' | 'check' | 'edit'; readonly batch: number | null; readonly id: string | null }
  | { readonly ok: false; readonly message: string };

/** The CLI against the repository at `root`; returns the exit code (0, 1 or 2). */
export function main(argv: readonly string[], root: string, out: (text: string) => void, err: (text: string) => void): number;
