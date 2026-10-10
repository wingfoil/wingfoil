/**
 * Project-root confinement as a mutating-op **pre-flight** (REQ-SEC-06 —
 * `task-102`, `bug-044-symlinked-directives-custom-escapes-confinement`; extended to the write
 * paths' own question by `task-106`, `bug-120`).
 *
 * The boundary is decided once, in `src/storage/confinement.ts`; this is the thin layer that turns
 * that answer into the `CoreResult` a core operation returns, exactly as `requireGitIdentity`
 * (REQ-SEC-01) and `requireCustomAsset` (REQ-SEC-07) do for their own rules. It lives in `src/core`
 * for their reason too: the rule crosscuts pillars, and the CLI and MCP surfaces must enforce it
 * identically because they run the same function (REQ-SYS-05).
 *
 * Two entry points, because a delete and a write do not ask the same thing:
 * {@link requireConfinedTarget} for an operation whose syscall acts on a link (`unlinkSync`), and
 * {@link requireConfinedWriteTarget} for one whose syscall follows it (`writeFileSync`).
 *
 * **Why a pre-flight and not a check at the write.** `bug-044`'s whole defect is order. The shipped
 * `directive remove` unlinked the outside file and only then failed, on `git add`, with a raw
 * `execFileSync` message — so the operator lost a file, got git's text instead of a mapped refusal,
 * and no commit recorded any of it. A check that runs after the deletion reports a loss it could
 * have prevented; the refusal has to land before the filesystem is touched at all.
 *
 * **Baseline.** This guard resolves against the **working tree**, not `HEAD`, and that is deliberate
 * — the filesystem-effect read the `command-baseline` directive and `spec-006-core-domain-api` §6
 * declare, argued in `task-102`'s Execution Notes and ratified in
 * `dl-086-a-guard-over-a-filesystem-effect-resolves-on-the-filesystem`, never settled here. The
 * one-line reason: what this predicts is where `unlinkSync` — or, on the write path,
 * `writeFileSync` — will land, and both follow the symlinks that are on disk, not the ones a commit
 * records.
 */
import { join } from 'node:path';

import { resolveRealPathInRoot, symlinkTargetRefusal, targetIsSymlink } from '../storage/confinement';

import { coreErr, coreOk, type CoreResult } from './types';

/**
 * Refuse, before anything on disk changes, a target whose **real** path lies outside the project
 * root.
 *
 * Resolution is the point. A prefix check over `relativePath` cannot see this: the path this bug is
 * about — `.wingfoil/directives/custom/legacy-rule.md` under a `custom` that is a symlink to another
 * directory — is inside the project in every segment and outside it on the filesystem. So the check
 * resolves first and compares afterwards.
 *
 * Returns a `VALIDATION` `CoreResult.error`, which `exitCodeForError` maps to exit **1**: a
 * well-formed invocation refused on the state of the repository, never the `2` that
 * `spec-005-cli-command-contract` §1 reserves for a malformed one. The message names both spellings
 * of the path — the one the operator typed against and the one it really resolves to — because the
 * two differing is the entire finding, and it deliberately carries no child-process text
 * (`bug-071`/`bug-093`).
 *
 * **What it answers, and what it does not.** This decides where the path *leads*: the target's
 * parent is real-resolved and its own name is kept, which is right for a deletion and insufficient
 * for a write ({@link resolveRealPathInRoot}'s own doc, `bug-120`). A caller that is about to
 * **write** asks {@link requireConfinedWriteTarget} instead, which adds the second question this one
 * does not ask.
 *
 * @param root - Project root.
 * @param relativePath - The path of the file the operation is about to touch, as the refusal should
 *   name it: root-relative POSIX, or absolute (resolved as is) — the run log passes its configured
 *   `paths.runs` spelling, so a refusal names `/etc/<id>.jsonl` rather than a `../` climb (bug-288).
 * @param action - The verb for the refusal's first clause, e.g. `'remove'` → `cannot remove '<path>'`
 *   (P3.3's own message shape, shared with `requireCustomAsset`).
 */
export function requireConfinedTarget(
  root: string,
  relativePath: string,
  action: string,
): CoreResult<void> {
  const resolved = resolveRealPathInRoot(root, relativePath);
  if (resolved.within) return coreOk<void>(undefined);
  return coreErr({
    code: 'VALIDATION',
    message:
      `cannot ${action} '${relativePath}': it resolves to '${resolved.real}', outside the project root. ` +
      'Nothing has been written or deleted — this check runs before the operation touches the filesystem; ' +
      'check whether a directory on the way to it is a symlink.',
  });
}

/**
 * {@link requireConfinedTarget} plus the question a **write** has to ask and a delete must not: the
 * target's own name may not be a symbolic link (task-106,
 * `bug-120-a-symlinked-document-leaf-is-followed-by-the-write`).
 *
 * `unlinkSync` acts on a link; `writeFileSync` follows it. So the parent-resolved, leaf-unresolved
 * shape that makes a symlinked directive file removable (`bug-044`'s benign case) lets a write land
 * wherever the link points — measured on the four Memory transition verbs, which rewrote a linked
 * document *outside the project root* and then failed with git's own text (`bug-120` D2). The
 * asymmetry is therefore read per verb, which is `dl-086`'s ground and is argued there rather than
 * here: resolve the parent everywhere, refuse a symlinked leaf where the syscall would follow it.
 *
 * Order matters and is the confinement one first: a path that leaves the project is reported as
 * leaving the project, whatever its leaf is, so the operator reads the boundary finding and not a
 * narrower one that happens to fire first. Both refusals are `VALIDATION` → exit `1`, and the
 * symlink sentence is {@link symlinkTargetRefusal}, shared verbatim with the `StorageError`
 * `memory add` raises through `resolveConfinedMemoryPath`, so the two surfaces cannot drift.
 *
 * The TOCTOU window between this check and the write is real and is not closable on a path-based
 * API — Node's `fs` exposes no `O_NOFOLLOW` (see {@link targetIsSymlink}). This turns a routine,
 * self-inflicted loss into a refusal; it is not an adversarial defence.
 *
 * @param root - Project root.
 * @param relativePath - Root-relative POSIX path of the file the operation is about to write.
 * @param action - The verb for the refusal's first clause, e.g. `'write'` → `cannot write '<path>'`.
 */
export function requireConfinedWriteTarget(
  root: string,
  relativePath: string,
  action: string,
): CoreResult<void> {
  const confined = requireConfinedTarget(root, relativePath, action);
  if (!confined.ok) return confined;
  if (!targetIsSymlink(join(root, relativePath))) return coreOk<void>(undefined);
  return coreErr({ code: 'VALIDATION', message: symlinkTargetRefusal(action, relativePath) });
}
