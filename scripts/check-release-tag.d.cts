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

/**
 * task-265 (`dl-159` Decision 4, A1.1) — pure: the remote-tracking refs a release tag `vX.Y.Z` may sit on, in
 * order: `origin/main`, then `origin/release/X.Y` of the tag's own major.minor. A tag that is not `vX.Y.Z`, or
 * no tag at all, is refused with `refs: []` and the same message as {@link checkReleaseTag}.
 */
export function releaseLineRefs(tag: string | undefined): {
  readonly ok: boolean;
  readonly message: string;
  readonly refs: readonly string[];
};

/** One release-line ref as probed in the gate's checkout (task-265). */
export interface LineProbe {
  /** The remote-tracking ref, e.g. `origin/release/0.3`. */
  readonly ref: string;
  /** Whether the branch exists on `origin` at run time (`git ls-remote`). */
  readonly onRemote: boolean;
  /** Whether the tagged commit is an ancestor of the ref (`git merge-base --is-ancestor`). */
  readonly ancestor: boolean;
}

/**
 * task-265 — pure verdict over the probes (order kept): passes when the commit is an ancestor of at least one
 * ref that exists on `origin`; the message names every ref checked and its state.
 */
export function checkTagOnLine(tag: string, commit: string, probes: readonly LineProbe[]): ReleaseTagCheck;

/**
 * task-265 — I/O: `git ls-remote`, one `git fetch --no-tags`, then `git merge-base --is-ancestor` per ref, in the
 * repository at `root`; `{ ok: false, message }` on a git failure (fail closed).
 */
export function probeReleaseLines(
  root: string,
  commit: string,
  refs: readonly string[],
): { readonly ok: true; readonly probes: readonly LineProbe[] } | { readonly ok: false; readonly message: string };
