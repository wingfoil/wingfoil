/**
 * The one helper every **read-only** `git` invocation of the Memory pillar goes through
 * (`task-142-run-memory-git-read-through-helper-captures-stderr`).
 *
 * Three defects of the same class led here, each written by a different task because nothing said
 * how a Memory git read must be made:
 *
 * - **No `maxBuffer`** (`bug-072`): Node's 1 MiB default applied, a larger `git log` threw `ENOBUFS`,
 *   and a `catch` folded it into "this document has no history".
 * - **Inherited stderr** (`bug-071`, `bug-093`): without `stdio`, the child writes git's own
 *   `fatal:` straight to the operator's terminal, beside the message WingFoil meant to print.
 * - **Failures swallowed**: "git could not answer" read as an empty answer.
 *
 * {@link runGitRead} settles all three in one place: stderr is piped (never inherited) and carried
 * inside the error, the buffer is {@link GIT_READ_MAX_BUFFER}, and any exit status the caller did not
 * declare as an answer throws {@link StorageError} `E_GIT_READ_FAILED`. A caller that expects a
 * failure — a path absent at a commit — names that exit status in `accepted` and decides what it
 * means; nothing else is absorbed. `test/memory/git-read.test.ts` pins that no `src/memory` module
 * spawns git any other way.
 */
import { spawnSync } from 'child_process';

import { E_GIT_READ_FAILED, StorageError } from './errors';

/**
 * Large enough for any answer a Memory read asks of git — a whole tree's path list, a full history
 * walk; an answer past it fails loudly ({@link runGitRead}), it is never truncated.
 */
export const GIT_READ_MAX_BUFFER = 256 * 1024 * 1024;

/** Options for {@link runGitRead}. */
export interface GitReadOptions {
  /**
   * The exit statuses that are answers rather than failures (default `[0]`). A caller that lists a
   * non-zero status interprets it itself — e.g. `128` from `git show <sha>:<path>` for a path that
   * commit does not hold.
   */
  readonly accepted?: readonly number[];
  /** Bytes written to the child's stdin (e.g. `git cat-file --batch` requests); stdin is closed otherwise. */
  readonly input?: string;
  /** Additional environment, merged over `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/** What {@link runGitRead} returns: the exit status (one of `accepted`) and both output streams. */
export interface GitReadResult<Out extends string | Buffer> {
  readonly status: number;
  readonly stdout: Out;
  /** git's own diagnostics, captured — the caller decides whether they mean anything. */
  readonly stderr: string;
}

function spawnGit(root: string, args: readonly string[], options: GitReadOptions, encoding: 'utf-8' | 'buffer') {
  return spawnSync('git', ['-C', root, ...args], {
    // `undefined` returns Buffers; Node rejects the literal 'buffer' once `input` is given.
    encoding: encoding === 'buffer' ? undefined : encoding,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    maxBuffer: GIT_READ_MAX_BUFFER,
    input: options.input,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
}

function failure(root: string, args: readonly string[], detail: string): StorageError {
  return new StorageError(E_GIT_READ_FAILED, `git ${args.join(' ')} failed in ${root}: ${detail}`);
}

/**
 * Run `git -C <root> <args>` for its answer, with stdout decoded as UTF-8.
 *
 * @param root - The repository to read.
 * @param args - git's arguments, passed verbatim (never through a shell).
 * @param options - {@link GitReadOptions}.
 * @returns The exit status, stdout and the captured stderr.
 * @throws {@link StorageError} `E_GIT_READ_FAILED` — carrying git's stderr, or the spawn error — when
 *   git cannot be spawned, its output exceeds {@link GIT_READ_MAX_BUFFER}, it is killed, or it exits
 *   with a status outside `accepted`.
 */
export function runGitRead(root: string, args: readonly string[], options: GitReadOptions = {}): GitReadResult<string> {
  const run = spawnGit(root, args, options, 'utf-8');
  const accepted = options.accepted ?? [0];
  if (run.error !== undefined || run.status === null || !accepted.includes(run.status)) {
    throw failure(root, args, run.error !== undefined ? run.error.message : (run.stderr as string).trim());
  }
  return { status: run.status, stdout: run.stdout as string, stderr: run.stderr as string };
}

/**
 * {@link runGitRead} for an answer that is bytes, not text — `git cat-file --batch`, whose object
 * sizes are byte counts and whose tree objects are binary.
 *
 * @throws {@link StorageError} `E_GIT_READ_FAILED` on the same conditions as {@link runGitRead}.
 */
export function runGitReadBytes(root: string, args: readonly string[], options: GitReadOptions = {}): GitReadResult<Buffer> {
  const run = spawnGit(root, args, options, 'buffer');
  const accepted = options.accepted ?? [0];
  const stderr = (run.stderr as Buffer | null)?.toString('utf-8') ?? '';
  if (run.error !== undefined || run.status === null || !accepted.includes(run.status)) {
    throw failure(root, args, run.error !== undefined ? run.error.message : stderr.trim());
  }
  return { status: run.status, stdout: run.stdout as Buffer, stderr };
}

/** A full commit name: 40 hexadecimal digits (SHA-1), or 64 (SHA-256). */
const FULL_COMMIT_NAME_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * `name`, checked to be a full commit name, as a reader of `git log --format=%H` output takes it
 * (`task-268`, `bug-291`).
 *
 * Every `git log` reader passes `--no-show-signature`, so a `log.showSignature` configuration cannot
 * print signature text ("No signature", "Good … signature for …") among the formatted lines. This is
 * the second half: whatever still arrives where a name was expected is refused, never used — a
 * garbled name used as a sha silently drops the commit it should have named (a phase record left
 * uncounted) or surfaces as an unrelated error ("creation commit No signature is not present …").
 * `agent show` makes the same check on its own reader (`task-220` review F1).
 *
 * @param name - The text the reader parsed as a commit name.
 * @param command - The git command that printed it, for the message (e.g. `git log --follow`).
 * @returns `name`, unchanged.
 * @throws {@link StorageError} `E_GIT_READ_FAILED` — `IO` at the core boundary — when `name` is not a
 *   full commit name: `<command> printed "<name>" where a commit name was expected`, `name` quoted as a
 *   JSON string so a line break in it stays visible.
 */
export function requireCommitName(name: string, command: string): string {
  if (!FULL_COMMIT_NAME_RE.test(name)) {
    throw new StorageError(E_GIT_READ_FAILED, `${command} printed ${JSON.stringify(name)} where a commit name was expected`);
  }
  return name;
}
