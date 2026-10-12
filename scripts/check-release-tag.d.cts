/** Outcome of {@link checkReleaseTag}. */
export interface ReleaseTagCheck {
  /**
   * `true` only when the tag is `vX.Y.Z` and equals `v` + the package version, and `server.json`'s
   * `version` and every `packages[].version` equal that same version.
   */
  readonly ok: boolean;
  /** One human-readable line explaining the verdict. */
  readonly message: string;
}

/** The part of the MCP Registry `server.json` the version check reads (spec-015 §1a). */
export interface ServerJsonVersions {
  /** The listing's own version. */
  readonly version?: unknown;
  /** One entry per distributed package; each carries its own `version`. */
  readonly packages?: unknown;
}

/**
 * spec-015 §4: the release tag must be `vX.Y.Z` and equal `v` + `package.json` `version`, and
 * `server.json` `version` and every `packages[].version` must equal `package.json` `version`
 * (`dl-093` point 5, option (a)).
 */
export function checkReleaseTag(
  tag: string | undefined,
  version: string,
  server: ServerJsonVersions | undefined,
): ReleaseTagCheck;

/**
 * spec-015 §4 / `dl-057` (d): the release tag must be annotated — `objectType` (what `refs/tags/<tag>` names)
 * must be `tag`. A lightweight tag (`commit`), a missing ref (`undefined`) or no tag at all is refused.
 */
export function checkAnnotatedTag(tag: string | undefined, objectType: string | undefined): ReleaseTagCheck;

/**
 * The object type `refs/tags/<tag>` names in the repository at `root` (`git cat-file -t`), or `undefined` when
 * git cannot resolve the ref.
 */
export function tagObjectType(root: string, tag: string): string | undefined;
