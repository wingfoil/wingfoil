/** One decision of {@link distTagFor}. */
export type DistTagDecision =
  | {
      /** The version may be promoted. */
      readonly ok: true;
      /** `latest`, or `latest-<X>.<Y>` of the version's own line. */
      readonly distTag: string;
      /** One readable line explaining the choice, citing dl-159. */
      readonly message: string;
    }
  | {
      /** The version must not be promoted. */
      readonly ok: false;
      /** One readable line naming the refused version or published entry. */
      readonly message: string;
    };

/** Outcome of {@link parsePublishedVersions}. */
export type PublishedVersions =
  | {
      /** The output was a JSON array of strings, or a lone string. */
      readonly ok: true;
      /** The published versions, in npm's order. */
      readonly versions: readonly string[];
    }
  | {
      /** The output could not be read as published versions. */
      readonly ok: false;
      /** One readable line explaining why. */
      readonly message: string;
    };

/**
 * task-266 (`dl-159` Decision 6, Action A1.2) — pure: the npm dist-tag a version receives. `latest` when
 * `version` (`X.Y.Z`) is greater, by semver, than every published release; otherwise `latest-X.Y`.
 * Published prereleases are ignored when finding the highest version (approver ruling D4 (a)); a version
 * already published, a prerelease, a malformed version or a published entry that is not semver is refused.
 * Neither argument is mutated, and the order of `published` does not matter.
 */
export function distTagFor(version: string, published: readonly string[]): DistTagDecision;

/**
 * task-266 — `npm view <name> versions --json` output → the versions. npm prints a lone JSON string for a
 * package with one version; that is read as a one-element list.
 */
export function parsePublishedVersions(json: string): PublishedVersions;
