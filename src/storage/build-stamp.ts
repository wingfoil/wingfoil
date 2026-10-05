/**
 * The build signature WingFoil puts on every commit it writes, and prints for `--version`
 * (task-192, `dl-111-tool-signature-in-commits` Q2 (a), Q3 (i), Action 3).
 *
 * The `build` script writes `dist/build-info.json` (`{version, commit}`,
 * `scripts/write-build-info.cjs`); this module turns it into the stamp `<semver> (<sha>)`. The stamp
 * is read here, at run time, rather than asked of git, because an installed package has no `.git`
 * and, inside a user's repository, `git rev-parse HEAD` would name the user's commit, not WingFoil's
 * (`dl-111` Q2 (b), rejected).
 *
 * Without a usable record — a run from `src/` through ts-jest, a `dist/` built by `tsc` alone, a
 * record whose commit is not a sha — the stamp is `<semver> (unknown)`: a commit WingFoil writes still
 * carries the trailer, so "no trailer" keeps meaning "not written by WingFoil" (Q3 (i)).
 *
 * Deterministic (REQ-SYS-07): the stamp is a function of two files shipped with the package, read
 * from fixed paths; no clock, no environment.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/** The trailer key `dl-111` reserves for the build signature (refused in a `--reason`, `dl-067` clause 4). */
export const WINGFOIL_VERSION_TRAILER_KEY = 'WingFoil-Version';

/** What stands for the commit when no trustworthy build record exists (`dl-111` Q3 (i)). */
const UNKNOWN_COMMIT = 'unknown';

/**
 * A commit the record may name: an abbreviated-or-full hex object name (SHA-1 or SHA-256), optionally
 * `-dirty`. Anything else — a branch name, a value carrying a newline that would forge a second
 * trailer line — is not trusted and reads as {@link UNKNOWN_COMMIT}.
 */
const BUILD_COMMIT_RE = /^[0-9a-f]{7,64}(?:-dirty)?$/;

/** The `commit` of the record at `path`, or `null` when it is absent, unreadable or not a commit. */
function recordedCommit(path: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
  const commit = (parsed as { commit?: unknown } | null)?.commit;
  return typeof commit === 'string' && BUILD_COMMIT_RE.test(commit) ? commit : null;
}

/**
 * The running build's stamp, `<semver> (<sha>)` — `<semver>` from `package.json`, `<sha>` from the
 * build record, or `unknown`.
 *
 * Both files are located from `moduleDir`, the directory of a module one level below the compiled
 * root: `build-info.json` one level up (`dist/build-info.json` from `dist/storage/`), `package.json`
 * two levels up, which is the package root in the `src/` and the `dist/` layout alike and where npm
 * installs the manifest. The version is the manifest's, never the record's: `package.json` is what
 * npm installed, and the record only adds the commit.
 *
 * @param moduleDir - Defaults to this module's own directory; a test passes a fixture's.
 */
export function readBuildStamp(moduleDir: string = __dirname): string {
  const { version } = JSON.parse(readFileSync(join(moduleDir, '..', '..', 'package.json'), 'utf-8')) as { version: string };
  const commit = recordedCommit(join(moduleDir, '..', 'build-info.json')) ?? UNKNOWN_COMMIT;
  return `${version} (${commit})`;
}

/** The trailer line for `stamp`: `WingFoil-Version: <stamp>`. */
export function formatVersionTrailer(stamp: string): string {
  return `${WINGFOIL_VERSION_TRAILER_KEY}: ${stamp}`;
}
