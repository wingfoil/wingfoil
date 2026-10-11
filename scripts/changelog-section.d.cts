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
