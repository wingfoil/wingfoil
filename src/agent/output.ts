/**
 * A headless run's output (`spec-016` §3.3 steps 13, 14 and 16, §3.5; `dl-182` Q1–Q5 (a); task-336): the line
 * splitter both of the agent's streams go through on their way to the caller's stderr, the `--log <path>` copy, and the
 * `git check-ignore` question step 13 asks of the registry entry and of the log file.
 *
 * - **Lines** ({@link lineSplitter}): a line ends at a newline (`\n`, excluded from the line); one still pending at
 *   {@link OUTPUT_LINE_CAP} bytes is forwarded as it stands (cut before a UTF-8 sequence that would otherwise be split);
 *   the bytes are decoded as UTF-8 with U+FFFD for an invalid sequence, so a sequence split across two chunks decodes
 *   whole; a carriage return before the newline stays in the line; what is pending when the stream ends is forwarded as
 *   a last line (approver ruling D11).
 * - **The copy** ({@link openLog}): the file `--log` names, resolved against the current directory (D5), opened for
 *   appending and created owner-only (mode `0600`) when absent; each forwarded line is appended in the console form
 *   (the line and a newline), whatever `--format` says, and none of WingFoil's own lines. WingFoil keeps no log of its
 *   own: the output may hold secrets, and this file is the caller's, never committed (Q3 (a), Q5 (a)).
 * - **Ignored?** ({@link notIgnoredInRepository}): `git check-ignore` asked of a path inside the project root, git's
 *   own answer (a tracked file is not ignored); a path outside the root is not asked (git answers `128` there).
 *
 * Determinism: nothing here reads a clock or a random source; the order of the lines is the order the pipes deliver
 * them, each stream's own order kept.
 */
import { closeSync, openSync, realpathSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { runGitRead } from '../storage';

/** How long a pending line may grow before it is forwarded as it stands (§3.5, D11): 64 KiB. */
export const OUTPUT_LINE_CAP = 64 * 1024;

/** §3.1 / §3.2 step 7 (`LOG_INTERACTIVE`): `--log` on a launch that is not headless → exit `2` with this reason. */
export const LOG_INTERACTIVE = 'invalid flag combination: --log needs a headless launch, and this run launches interactive';

/** A splitter of one stream into lines: bytes in, whole lines out to its `emit`. */
export interface LineSplitter {
  /** Take the next chunk; every line it completes is emitted, in order. */
  readonly write: (chunk: Buffer) => void;
  /** The stream has ended: what is pending is emitted as a last line. Idempotent; later writes are ignored. */
  readonly end: () => void;
}

/**
 * Where to cut `bytes` at most `cap` long so no UTF-8 character is split: before the lead byte of a sequence that starts
 * in the last three bytes before the cap and would end past it; at the cap otherwise (a stray continuation byte, or an
 * invalid lead, is cut as it stands and decodes as U+FFFD).
 */
function boundary(bytes: Buffer, cap: number): number {
  for (let at = cap - 1; at >= Math.max(0, cap - 3); at -= 1) {
    const byte = bytes[at]!;
    if ((byte & 0xc0) === 0x80) continue; // a continuation byte: look further back for its lead
    const length = byte >= 0xf8 ? 1 : byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return at > 0 && at + length > cap ? at : cap;
  }
  return cap;
}

/**
 * Split a stream into lines (§3.5, D11): each complete line goes to `emit`, its newline excluded, decoded as UTF-8
 * (U+FFFD for an invalid sequence); a line still pending at `cap` bytes is emitted as it stands; {@link LineSplitter.end}
 * emits what is pending.
 */
export function lineSplitter(emit: (line: string) => void, cap: number = OUTPUT_LINE_CAP): LineSplitter {
  let pending: Buffer = Buffer.alloc(0);
  let ended = false;
  return {
    write(chunk) {
      if (ended) return;
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      for (;;) {
        const newline = pending.indexOf(0x0a);
        if (newline !== -1 && newline <= cap) {
          emit(pending.subarray(0, newline).toString('utf-8'));
          pending = pending.subarray(newline + 1);
        } else if (pending.length >= cap) {
          const cut = boundary(pending, cap);
          emit(pending.subarray(0, cut).toString('utf-8'));
          pending = pending.subarray(cut);
        } else {
          break;
        }
      }
    },
    end() {
      if (ended) return;
      ended = true;
      if (pending.length > 0) emit(pending.toString('utf-8'));
      pending = Buffer.alloc(0);
    },
  };
}

/** The `--log` file, open for appending (§3.3 step 13). */
export interface OpenLog {
  /** Append one forwarded line in the console form (the line and a newline). */
  readonly append: (line: string) => void;
  /** Close the file. Idempotent. */
  readonly close: () => void;
}

/**
 * Open the file `--log` names (§3.3 step 13): `path` resolved against the current directory, opened for appending,
 * created with mode `0600` when absent (an existing file keeps its mode and its bytes).
 *
 * @returns the open log, or the cause it could not be opened (the system's message, for `LOG_UNWRITABLE`).
 */
export function openLog(path: string): { ok: true; log: OpenLog } | { ok: false; cause: string } {
  let fd: number;
  try {
    fd = openSync(resolve(path), 'a', 0o600);
  } catch (error) {
    return { ok: false, cause: error instanceof Error ? error.message : String(error) };
  }
  let open = true;
  return {
    ok: true,
    log: {
      append(line) {
        if (open) writeSync(fd, `${line}\n`);
      },
      close() {
        if (!open) return;
        open = false;
        closeSync(fd);
      },
    },
  };
}

/** `path` with its symbolic links resolved, as far up as it exists (a file not created yet keeps its own name). */
function realPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : resolve(realPath(parent), relative(parent, path));
  }
}

/**
 * `absolute`'s path relative to `root` when it is inside it (both with their symbolic links resolved), else
 * `undefined`. The root itself is not inside it.
 */
function insideRoot(root: string, absolute: string): string | undefined {
  const rel = relative(realPath(root), realPath(absolute));
  return rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? undefined : rel;
}

/**
 * Whether `path` (resolved against the current directory) is inside the project root and `git check-ignore` does not
 * report it ignored — a file git tracks, or one no ignore rule covers (§3.3 step 13). A path outside the root is not
 * asked, and answers `false`; a question git cannot answer counts as not ignored, so the warning errs on the side of
 * being printed.
 */
export function notIgnoredInRepository(root: string, path: string): boolean {
  const rel = insideRoot(root, resolve(path));
  if (rel === undefined) return false;
  try {
    return runGitRead(root, ['check-ignore', '-q', '--', rel.split(sep).join('/')], { accepted: [0, 1] }).status !== 0;
  } catch {
    return true;
  }
}

/** §3.3 step 13's warning for a `--log` inside the repository that git does not ignore, without the `warning: ` prefix. */
export function logNotIgnoredWarning(given: string): string {
  return `--log ${given} is inside the repository and not git-ignored: the agent's output may hold secrets`;
}
