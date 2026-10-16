/**
 * The version-bump check on the pending change (task-183, `bug-143`, `dl-047` option 1), used by
 * `test/lint/version-bump.test.ts`. Not a `.test.ts` file, so jest never collects it as a suite.
 *
 * The pending change is the working tree (staged or not) against `HEAD`. A file whose bytes differ
 * from `HEAD` must declare a top-level `version:` numerically greater, as YAML reads it, than the one
 * at `HEAD` (`isVersionIncrease`, `src/validation`, shared with `scripts/check-governance.cjs`'s range
 * rule; task-208, `bug-249`: a downgrade or a re-quoting is no bump) — unless `HEAD` already carries a
 * bump over the file's version at its fork point from its integration branch: the bump baseline is
 * the integration branch, `main` or `release/<major>.<minor>` (doc-versioning, `git-conventions` §1,
 * `dl-159` A1 item 7, task-287), so a branch bumps a file once.
 *
 * This judges the PENDING change only; what was committed is judged over a pushed range by the
 * governance check's `config` rule (`--base`, task-208), which `governance.yml` runs in CI.
 *
 * "Differs" is git's verdict (`git diff HEAD`), so eol conversion is honoured. The integration branch
 * is chosen by {@link integrationBranchOf} among LOCAL branches only: a stale local branch can credit
 * a bump the branch did not make, a line with no local branch is not seen, and with no candidate the
 * check is strict, against `HEAD` alone. Deterministic: candidates are read in a sorted order
 * (`main`, then the release lines by major and minor, numerically), no clock, no randomness; the
 * verdict depends only on git objects, file bytes, the eol settings and where the local candidate
 * branches point.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { isVersionIncrease } from '../../../src/validation';

/** The config files that declare a `version:` the doc-versioning bump rule applies to, in report order. */
export const VERSIONED_CONFIG_FILES: readonly string[] = [
  '.wingfoil/dna.yaml',
  '.wingfoil/memory.yaml',
  '.wingfoil/workflows.yaml',
  '.wingfoil/roles.yaml',
];

/**
 * The trunk (`git-conventions` §1): an integration-branch candidate, and the name chosen on a tie with a
 * release line (the same fork-point commit: a `release/X.Y` just cut, or a merge-forward commit both
 * lines contain — then `main` is reported even for a branch cut from `release/X.Y`, or for `HEAD` on it;
 * the fork point, and so the verdict, is the same).
 */
export const TRUNK_BRANCH = 'main';

/**
 * The name of a maintenance line, `release/<major>.<minor>` (`git-conventions` §1, `dl-159`): numbers
 * without leading zeros, so `release/foo`, `release/0.3.1`, `release/v0.3` or `release/0.03` is no
 * integration-branch candidate.
 */
export const RELEASE_LINE_PATTERN: RegExp = /^release\/(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

/** The integration branch of `HEAD` and the commit where `HEAD` left it. */
export interface IntegrationBranch {
  /** Local branch name: `main` or `release/<major>.<minor>`. */
  readonly name: string;
  /** Full sha of `git merge-base HEAD <name>`. */
  readonly forkPoint: string;
}

/** One versioned config file whose pending edit does not bump `version:`. */
export interface VersionBumpFinding {
  /** Repository-relative path. */
  readonly path: string;
  /** Why the edit fails the gate. */
  readonly reason: string;
}

/** `git` output in `root`, or `null` when the command fails (absent object, unknown ref). */
function gitOrNull(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** The file's text at `commit`, or `null` when it does not exist there. */
function textAt(root: string, commit: string, path: string): string | null {
  return gitOrNull(root, ['show', `${commit}:${path}`]);
}

/**
 * True when the file in the working tree (staged or not) differs from `HEAD` as git sees it: through
 * `git diff`, so eol conversion (`core.autocrlf`, `.gitattributes`) is applied and a clean checkout
 * with CRLF line ends is not a change. `git diff --quiet` exits 1 on a difference.
 */
function differsFromHead(root: string, path: string): boolean {
  const result = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', path], { cwd: root, stdio: 'ignore' });
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(`git diff HEAD -- ${path} failed in ${root} (exit ${String(result.status)})`);
}

/** The file's text in the working tree, or `null` when it does not exist there. */
function workingText(root: string, path: string): string | null {
  try {
    return readFileSync(join(root, path), 'utf-8');
  } catch {
    return null;
  }
}

type VersionRead = { readonly version: string | null; readonly value: unknown } | { readonly error: string };

/** The top-level `version:` as YAML reads it (so `1.10` reads as `1.1`), or the parse error. */
function readVersion(text: string): VersionRead {
  let document: unknown;
  try {
    document = load(text);
  } catch (error) {
    return { error: (error as Error).message.split('\n')[0] as string };
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) return { version: null, value: null };
  const version = (document as Record<string, unknown>).version;
  return { version: version === undefined || version === null ? null : String(version), value: version ?? null };
}

/** The top-level `version:` token as written (`1.0`, not YAML's `1`), for the message only. */
function writtenVersion(text: string): string | null {
  const match = /^version:[ \t]*([^\s#]+)/m.exec(text);
  return match === null ? null : (match[1] as string);
}

/** The `version:` value a text declares as YAML reads it, or `null` when it declares none or does not parse. */
function versionValueOrNull(text: string | null): unknown {
  if (text === null) return null;
  const read = readVersion(text);
  return 'version' in read ? read.value : null;
}

/** The (major, minor) of a release-line name {@link RELEASE_LINE_PATTERN} accepts. */
function lineNumbers(name: string): [number, number] {
  const match = RELEASE_LINE_PATTERN.exec(name) as RegExpExecArray;
  return [Number(match[1]), Number(match[2])];
}

/** Candidate order: {@link TRUNK_BRANCH} first, then the release lines by major and minor, numerically. */
function compareCandidates(a: string, b: string): number {
  if (a === TRUNK_BRANCH) return -1;
  if (b === TRUNK_BRANCH) return 1;
  const [aMajor, aMinor] = lineNumbers(a);
  const [bMajor, bMinor] = lineNumbers(b);
  return aMajor - bMajor || aMinor - bMinor;
}

/** True when `ancestor` is `descendant` or one of its ancestors. `--is-ancestor` exits 1 on "no". */
function isAncestor(root: string, ancestor: string, descendant: string): boolean {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root, stdio: 'ignore' });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git merge-base --is-ancestor ${ancestor} ${descendant} failed in ${root} (exit ${String(result.status)})`);
}

/**
 * The integration branch of `HEAD` (`git-conventions` §1, `dl-159`), read offline from local branches:
 * among the local {@link TRUNK_BRANCH} and every local `release/<major>.<minor>`
 * ({@link RELEASE_LINE_PATTERN}), the one whose fork point with `HEAD` (`git merge-base HEAD <name>`)
 * descends from every other candidate's — the line `HEAD` left most recently. Candidates sharing that
 * commit are a tie, won by the first in candidate order ({@link TRUNK_BRANCH}, then the release lines
 * numerically), so the name never changes the commit: right after a merge forward, `main` is reported for
 * `HEAD` on `release/X.Y` or cut from it. On a line itself the fork point is `HEAD`, so nothing is
 * credited. A
 * candidate with no common history is dropped; with no candidate, or when no fork point descends from
 * all the others (a branch that merged the other line), `null`.
 */
export function integrationBranchOf(root: string): IntegrationBranch | null {
  const listed = gitOrNull(root, ['for-each-ref', '--format=%(refname:strip=2)', `refs/heads/${TRUNK_BRANCH}`, 'refs/heads/release']) ?? '';
  const names = listed
    .split('\n')
    .filter((name) => name === TRUNK_BRANCH || RELEASE_LINE_PATTERN.test(name))
    .sort(compareCandidates);
  const candidates: IntegrationBranch[] = [];
  for (const name of names) {
    const base = gitOrNull(root, ['merge-base', 'HEAD', `refs/heads/${name}`]);
    if (base !== null) candidates.push({ name, forkPoint: base.trim() });
  }
  return (
    candidates.find((candidate) =>
      candidates.every((other) => other.forkPoint === candidate.forkPoint || isAncestor(root, other.forkPoint, candidate.forkPoint)),
    ) ?? null
  );
}

/** Every versioned config file whose pending edit leaves `version:` unbumped, in declared order. */
export function checkPendingVersionBumps(root: string): VersionBumpFinding[] {
  const findings: VersionBumpFinding[] = [];
  let forkPoint: string | null | undefined;
  for (const path of VERSIONED_CONFIG_FILES) {
    const head = textAt(root, 'HEAD', path);
    const working = workingText(root, path);
    if (head === null || working === null || !differsFromHead(root, path)) continue;

    const read = readVersion(working);
    if ('error' in read) {
      findings.push({ path, reason: `content differs from HEAD but is not readable YAML: ${read.error}` });
      continue;
    }
    if (read.version === null) {
      findings.push({ path, reason: 'content differs from HEAD but declares no top-level version:' });
      continue;
    }
    const headValue = versionValueOrNull(head);
    if (isVersionIncrease(headValue, read.value)) continue;

    const written = writtenVersion(working) ?? read.version;
    const headWritten = writtenVersion(head) ?? String(headValue);
    if (read.version !== (headValue === null ? null : String(headValue))) {
      // A change that is no increase: a downgrade, or a value that does not read as a greater number.
      findings.push({ path, reason: `content differs from HEAD but version: ${written} is not greater than HEAD's ${headWritten}` });
      continue;
    }

    if (forkPoint === undefined) forkPoint = integrationBranchOf(root)?.forkPoint ?? null;
    if (forkPoint !== null && isVersionIncrease(versionValueOrNull(textAt(root, forkPoint, path)), headValue)) continue;

    findings.push({
      path,
      reason:
        written === headWritten
          ? `content differs from HEAD but version: is still ${written}`
          : `content differs from HEAD but version: ${written} reads as ${read.version} in YAML, the same as HEAD's ${headWritten}`,
    });
  }
  return findings;
}

/** One line per finding: `<path>: <reason>`. */
export function formatVersionBumpFindings(findings: readonly VersionBumpFinding[]): string {
  return findings.map((finding) => `${finding.path}: ${finding.reason}`).join('\n');
}
