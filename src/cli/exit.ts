/**
 * The exit-code contract (spec-005-cli-command-contract §1, REQ-INT-04). Every `wingfoil`
 * invocation terminates through this single function, so the `0`/`1`/`2` mapping can never be
 * bypassed by an uncaught code path elsewhere in `src/cli`.
 *
 * This module owns only the *mechanism* (the single `process.exit`). The exit-code *selection* —
 * which outcome maps to which code — lives in `src/core` (`exitCodeForError`/`exitCodeForResult`),
 * shared with the MCP surface per REQ-SYS-05 (task-012); `ExitCode` is re-exported from there so the
 * CLI never redeclares the contract's shape.
 *
 * The mechanism lets the output drain first (task-249, `bug-222`). A write to a pipe is asynchronous
 * in Node: the kernel takes what fits in the pipe buffer (64 KiB on Linux) and the rest stays queued
 * in the stream. `process.exit` drops whatever is queued, so a payload larger than the buffer reached
 * a `| jq` cut short while the process still exited `0`. A file or a TTY is written synchronously and
 * never has anything queued, which is why the same command redirected to a file was complete.
 */
import type { ExitCode } from '../core';

export type { ExitCode };

/**
 * Thrown by a caller that cannot simply return after {@link exitWith} deferred the exit — today only
 * the Commander `exitOverride` in `./program.ts`, because Commander calls `process.exit` itself, with
 * its own code, as soon as that callback returns. The entry points (`src/cli.ts`, the test harness)
 * recognise it by its `name` (a copy of this module loaded elsewhere throws the same name) and let the
 * deferred exit happen instead of reporting an error.
 */
export class DeferredExit extends Error {
  constructor(readonly code: ExitCode) {
    super(`exit ${String(code)} deferred until the output drains`);
    this.name = 'DeferredExit';
  }
}

/**
 * The single process-exit mechanism for the CLI (spec-005 §1, REQ-INT-04): optionally write
 * `message` to stderr, then end the process with `code` through the one `process.exit` call.
 *
 * When stdout and stderr have nothing queued — a file, a TTY, or a pipe that took everything — the
 * process ends here and now. When either still holds output for a pipe (task-249, `bug-222`), the exit
 * is deferred until each has written it: `process.exitCode` is set to `code` at once, and
 * `process.exit(code)` runs when the last queued write completes — or fails, as when the reader has
 * gone away (`EPIPE`), which ends the process with the same `code` rather than an unhandled stream
 * error. Either way the code is the one passed here, and the exit is the single `process.exit` call.
 *
 * Every caller returns right after this call, so which of the two happened does not matter to it; the
 * one caller that cannot return normally reads the result.
 *
 * @returns `true` when the exit is deferred until the output drains — the process is still running
 * only to finish writing, and the caller must do nothing else. (When the exit happened, nothing returns
 * at all outside a test that stubs `process.exit`.)
 */
export function exitWith(code: ExitCode, message?: string): boolean {
  if (message) process.stderr.write(message + '\n');
  const queued = [process.stdout, process.stderr].filter((stream) => stream.writableLength > 0);
  if (queued.length === 0) {
    process.exit(code);
    return false;
  }
  process.exitCode = code;
  let waiting = queued.length;
  for (const stream of queued) {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      waiting -= 1;
      if (waiting === 0) process.exit(code);
    };
    // An empty write completes after every write queued before it; an `error` (EPIPE) ends the wait too.
    stream.once('error', settle);
    stream.write('', settle);
  }
  return true;
}
