/** The release fields the derivation reads (`memory.yaml` `release`: `kind`, `dl-092`, and `version`). */
export interface ReleaseFields {
  /** `minor` or `patch` (`dl-092`); absent or `""` on a release predating `dl-092` (template `exempt`). */
  readonly kind?: string;
  /** The release version: `vX.Y` for a minor, `vX.Y.Z` (Z ≥ 1) for a patch. */
  readonly version?: string;
}

/** Outcome of {@link integrationBranch}: the branch, or the refusal naming the field at fault. */
export type IntegrationBranch =
  | { readonly ok: true; readonly branch: string }
  | { readonly ok: false; readonly message: string };

/**
 * `dl-159` point 4, `git-conventions` §1/§3: the integration branch of a release — `release/X.Y` for a
 * `patch` of `vX.Y.Z` (Z ≥ 1), `main` for a `minor` or a release with no `kind`. Any other kind, or a patch
 * whose version is not `vX.Y.Z` with Z ≥ 1, is refused with a message naming the value. Pure.
 */
export function integrationBranch(release: ReleaseFields): IntegrationBranch;

/** Outcome of {@link checkHead}. */
export interface HeadCheck {
  /** `true` only when `HEAD` is on the expected integration branch. */
  readonly ok: boolean;
  /** One human-readable line explaining the verdict. */
  readonly message: string;
}

/**
 * Pure verdict: `current` (the branch `HEAD` is on, `null` when detached) against `expected`, the
 * integration branch of release `version`.
 */
export function checkHead(expected: string, version: string, current: string | null): HeadCheck;

/**
 * I/O: `git -C root symbolic-ref --quiet --short HEAD`. `branch: null` when `HEAD` is detached (git exit 1);
 * a refusal `could not read HEAD: <cause>` when `root` is not a repository, git exits otherwise, or git
 * cannot be run.
 */
export function readHeadBranch(
  root: string,
): { readonly ok: true; readonly branch: string | null } | { readonly ok: false; readonly message: string };
