/**
 * The per-clone session salt (`spec-016-agent-execution` §2.6 as amended, `dl-168` Q1 (b), task-338): 32 random bytes,
 * written once per clone as 64 lowercase hexadecimal digits and a line feed to {@link SESSION_SALT_FILE} of the
 * repository's common git directory, which the linked worktrees of a clone share. The assigned session id hashes it
 * with the run id (`assignedSessionId`, `./launch.ts`), so a committed record no longer lets a guessed repository path
 * be tested against it.
 *
 * The salt is outside the working tree: never committed, and no `.gitignore` entry is needed (`spec-011` §
 * `.gitignore` policy). It is created owner-only and atomically — a temporary file in the same directory, hard-linked
 * to the salt's name — so two launches of one clone never use two salts: the one whose link finds the name taken
 * reads the winner's.
 *
 * **Determinism.** The salt is the one random value of a launch; it enters the session id only, never the bootstrap,
 * the context, the run id or another record field (`determinism`, "context assembly").
 */
import { randomBytes } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runGitRead } from '../storage';
import { coreErr, coreOk, type CoreResult } from '../core/types';

/** The salt's path relative to the common git directory (`git rev-parse --git-common-dir`). */
export const SESSION_SALT_FILE = 'wingfoil/session-salt';

/** The one text a salt file may hold. */
const SALT_TEXT_RE = /^[0-9a-f]{64}\n$/;

/** §2.6's `VALIDATION` message for a salt that is not exactly that text. */
const MALFORMED_MESSAGE = `the session salt in the git directory (${SESSION_SALT_FILE}) is not 64 lowercase hexadecimal digits: remove it, and a new one is created at the next launch`;

/** §2.6's `IO` refusal, `cause` naming no absolute path. */
function ioRefusal(cause: string): CoreResult<never> {
  return coreErr({ code: 'IO', message: `cannot create or read the session salt in the git directory (${SESSION_SALT_FILE}): ${cause}` });
}

/**
 * A file-system error as a cause with no path: Node's `<CODE>: <description>, <syscall> '<path>'` cut before the
 * syscall, the syscall named after it.
 */
function causeOf(error: unknown): string {
  const failed = error as NodeJS.ErrnoException;
  if (typeof failed.code === 'string') {
    const description = (failed.message ?? '').replace(/, \w+ '[\s\S]*$/, '');
    return failed.syscall === undefined ? description : `${description} (${failed.syscall})`;
  }
  return 'unexpected error';
}

/** The salt's text, or `undefined` when the file does not exist. */
function readSalt(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** The 64 digits of a salt's `text`, or §2.6's `VALIDATION` refusal. */
function checked(text: string): CoreResult<string> {
  return SALT_TEXT_RE.test(text) ? coreOk(text.slice(0, 64)) : coreErr({ code: 'VALIDATION', message: MALFORMED_MESSAGE });
}

/**
 * The clone's session salt (§2.6): read from {@link SESSION_SALT_FILE} of `root`'s common git directory, or created
 * there when absent — the directory `0700`, the file `0600`, by a hard link from a temporary file in the same
 * directory, so a concurrent creator's salt wins and is read back. A salt that exists is never replaced.
 *
 * @param root - The project root (any worktree of the clone).
 * @returns The 64 digits, without the line feed; `VALIDATION` when the file is not exactly 64 lowercase hexadecimal
 *   digits and a line feed; `IO` when it cannot be created or read, the cause naming no absolute path.
 */
export function sessionSalt(root: string): CoreResult<string> {
  let commonDir: string;
  try {
    commonDir = runGitRead(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']).stdout.trim();
  } catch {
    return ioRefusal('git rev-parse --git-common-dir failed');
  }
  const file = join(commonDir, SESSION_SALT_FILE);
  try {
    const existing = readSalt(file);
    if (existing !== undefined) return checked(existing);
    const dir = join(file, '..');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temporary = join(dir, `.session-salt-${process.pid}-${randomBytes(8).toString('hex')}`);
    try {
      writeFileSync(temporary, `${randomBytes(32).toString('hex')}\n`, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      try {
        linkSync(temporary, file);
      } catch (error) {
        // A concurrent launch linked its salt first: that one is the clone's.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } finally {
      rmSync(temporary, { force: true });
    }
    return checked(readFileSync(file, 'utf-8'));
  } catch (error) {
    return ioRefusal(causeOf(error));
  }
}
