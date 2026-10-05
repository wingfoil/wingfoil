/** The build record `dist/build-info.json` carries (task-192, `dl-111` Q2 (a)). */
export interface BuildInfo {
  /** `package.json`'s `version`. */
  readonly version: string;
  /** `git rev-parse HEAD` of the built tree, `-dirty` when a build input has changes, `unknown` without git. */
  readonly commit: string;
}

/** The build inputs, as git pathspecs: a change under one of them makes the build `-dirty` (D4 (c)). */
export const BUILD_INPUTS: readonly string[];

/** The commit value of a build git could not describe. */
export const UNKNOWN_COMMIT: 'unknown';

/** The build record for the package at `root`. */
export function computeBuildInfo(root: string): BuildInfo;

/** The record's bytes: two-space JSON, keys `version` then `commit`, one trailing newline. */
export function serializeBuildInfo(info: BuildInfo): string;

/** Compute the record for `root` and write it to `<root>/dist/build-info.json`. */
export function writeBuildInfo(root: string): BuildInfo;
