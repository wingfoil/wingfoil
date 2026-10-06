/**
 * The version-bump check on the pending change (task-183, `bug-143`, `dl-047` option 1), used by
 * `test/lint/version-bump.test.ts`. Not a `.test.ts` file, so jest never collects it as a suite.
 *
 * The pending change is the working tree (staged or not) against `HEAD`. A file whose bytes differ
 * from `HEAD` must declare a top-level `version:` that differs, as YAML reads it, from the one at
 * `HEAD` — unless `HEAD` already carries a bump over the file's version at its fork point from
 * {@link TRUNK_BRANCH}: the bump baseline is `main`, so a branch bumps a file once (doc-versioning).
 *
 * "Differs" is git's verdict (`git diff HEAD`), so eol conversion is honoured. The relaxation trusts
 * the LOCAL `refs/heads/main`: a stale local `main` (one that predates the file's last bump on the
 * real trunk) can credit a bump the branch did not make; with no local `main` the check is strict,
 * against `HEAD` alone. The verdict therefore depends on git objects, file bytes, the eol settings and
 * where the local `main` points.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

/** The config files that declare a `version:` the doc-versioning bump rule applies to, in report order. */
export const VERSIONED_CONFIG_FILES: readonly string[] = [
  '.wingfoil/dna.yaml',
  '.wingfoil/memory.yaml',
  '.wingfoil/workflows.yaml',
  '.wingfoil/roles.yaml',
];

/** The trunk every task branch is cut from (`git-conventions` §2): the doc-versioning bump baseline. */
export const TRUNK_BRANCH = 'main';

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

type VersionRead = { readonly version: string | null } | { readonly error: string };

/** The top-level `version:` as YAML reads it (so `1.10` reads as `1.1`), or the parse error. */
function readVersion(text: string): VersionRead {
  let document: unknown;
  try {
    document = load(text);
  } catch (error) {
    return { error: (error as Error).message.split('\n')[0] as string };
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) return { version: null };
  const version = (document as Record<string, unknown>).version;
  return { version: version === undefined || version === null ? null : String(version) };
}

/** The top-level `version:` token as written (`1.0`, not YAML's `1`), for the message only. */
function writtenVersion(text: string): string | null {
  const match = /^version:[ \t]*([^\s#]+)/m.exec(text);
  return match === null ? null : (match[1] as string);
}

/** The version a text declares, or `null` when it declares none or does not parse. */
function versionOrNull(text: string | null): string | null {
  if (text === null) return null;
  const read = readVersion(text);
  return 'version' in read ? read.version : null;
}

/** The commit where `HEAD` left {@link TRUNK_BRANCH}, or `null` when there is no such branch. */
function trunkForkPoint(root: string): string | null {
  if (gitOrNull(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${TRUNK_BRANCH}`]) === null) return null;
  const base = gitOrNull(root, ['merge-base', 'HEAD', TRUNK_BRANCH]);
  return base === null ? null : base.trim();
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
    const headVersion = versionOrNull(head);
    if (read.version !== headVersion) continue;

    if (forkPoint === undefined) forkPoint = trunkForkPoint(root);
    if (forkPoint !== null && versionOrNull(textAt(root, forkPoint, path)) !== headVersion) continue;

    const written = writtenVersion(working) ?? read.version;
    const headWritten = writtenVersion(head) ?? headVersion;
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
