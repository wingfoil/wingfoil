/**
 * The repository-relative path of the release-health catalogue: `metrics.yaml` in the one directory
 * `.wingfoil/dna.yaml` declares as `paths.health` (`dl-089` §1 (A)). Throws when `paths.health` does not
 * name exactly one directory.
 */
export function catalogueLocation(root: string): string;

/**
 * Check a parsed catalogue against `dl-089` §2's rules: unique ids, a name, a definition, a scope and a
 * kind per metric (a floor with its floor, a trend with its direction), and no metric dropped silently —
 * every id the `changes` log added is still listed, a retired one marked with `retired_in`. Returns the
 * issues in document order; empty when every rule holds.
 */
export function validateCatalogue(doc: unknown): string[];

/** The scopes a metric may declare. */
export const SCOPES: readonly string[];
/** The kinds a metric may declare. */
export const KINDS: readonly string[];
/** The directions a trend metric may declare (`pending`: no rule yet, reported without a verdict). */
export const DIRECTIONS: readonly string[];
