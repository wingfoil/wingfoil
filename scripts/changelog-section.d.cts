/** Outcome of {@link changelogSection}: the notes, or why there are none. */
export type ChangelogSection =
  | { readonly ok: true; readonly notes: string; readonly message?: undefined }
  | { readonly ok: false; readonly message: string; readonly notes?: undefined };

/**
 * task-229 (`dl-130` step 1): the body of `CHANGELOG.md`'s `## [X.Y.Z]` section — up to the next `## `
 * heading, blank edge lines and closing link reference definitions dropped. A missing, duplicated or empty
 * section, or a version not of the form `X.Y.Z`, is `ok: false`.
 */
export function changelogSection(text: string, version: string): ChangelogSection;

/** A file kind's `{lowest, highest}` format range (spec-019 §3.1). */
export interface FormatRange {
  readonly lowest: number;
  readonly highest: number;
}

/**
 * The part of a capabilities document the CHANGELOG lines read (spec-019 §5, §8); `commands`, `wingfoil` and
 * unknown keys are ignored.
 */
export interface CapabilitiesDocumentLines {
  readonly format: number;
  readonly formats: Readonly<Record<string, FormatRange>>;
  readonly capabilities: readonly string[];
}

/** Outcome of {@link releaseLines}: the two lines and the `### Breaking` items, or the removals without a bump. */
export type ReleaseLines =
  | {
      readonly ok: true;
      readonly formatsRead: string;
      readonly capabilities: string;
      readonly breaking: readonly string[];
      readonly problems?: undefined;
    }
  | {
      readonly ok: false;
      readonly problems: readonly string[];
      readonly formatsRead?: undefined;
      readonly capabilities?: undefined;
      readonly breaking?: undefined;
    };

/** Outcome of {@link checkReleaseSection}: the section is in form, or each problem. */
export type ReleaseSectionCheck =
  | { readonly ok: true; readonly problems?: undefined }
  | { readonly ok: false; readonly problems: readonly string[] };

/** task-363 (spec-019 §8): a range as `Formats read:` writes it — `none` for `undefined`, `N`, or `L..H`. */
export function formatRange(range: FormatRange | undefined): string;

/**
 * task-363 (spec-019 §8, `dl-213` (a)): the `Formats read:` and `Capabilities:` lines and the `### Breaking` items
 * from the previous and the current capabilities documents. A file kind or a capability removed while `format` has
 * not risen is `ok: false`, one problem per removal, kinds first.
 */
export function releaseLines(previous: CapabilitiesDocumentLines, current: CapabilitiesDocumentLines): ReleaseLines;

/** task-363 (spec-019 §8): the highest `vX.Y.Z` tag below `version` in numeric semver order, or `undefined`. */
export function previousReleaseTag(version: string, tags: readonly string[]): string | undefined;

/**
 * task-363 (`dl-213` (a)): the form of a release section's notes — the two lines as its first two paragraphs, a
 * patch's `Feature in a patch:` lines right after them, `### Breaking` and `### Deprecated` at most once, each with
 * an item, `### Breaking` first.
 */
export function checkReleaseSection(notes: string, version: string): ReleaseSectionCheck;

/** The sections of `CHANGELOG.md` written before `dl-213`, never held to {@link checkReleaseSection}. */
export const LINES_GRANDFATHERED: readonly string[];

/** The §5 fixture's path, read at the previous release tag (spec-019 §5). */
export const FIXTURE_PATH: string;

/** The 0.3.2 baseline's path, the previous document when the previous release tag holds no fixture (spec-019 §8). */
export const BASELINE_PATH: string;
