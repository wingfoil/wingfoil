/**
 * task-249-let-piped-cli-output-drain-before-the-process-exits (`bug-222`, `spec-005` §1, REQ-INT-04):
 * output larger than a pipe's buffer reaches the reader whole, and the exit code is the command's.
 *
 * A write to a pipe is asynchronous in Node: the kernel takes what fits in the pipe buffer (64 KiB on
 * Linux) and libuv queues the rest. `exitWith` used to call `process.exit` right after the payload was
 * written, so whatever was still queued was dropped and the process still exited with the command's
 * code — `memory search --format json | jq` got truncated JSON and exit `0`. A file or a TTY is written
 * synchronously, which is why the same command redirected to a file was complete.
 *
 * Every case spawns the published entry point (`dist/cli.js`, built once by jest's `globalSetup`) the
 * way a shell does, through a real pipe: once as `spawnSync`'s own stdout/stderr pipes, once as a shell
 * pipeline into a slow reader, with `PIPESTATUS[0]` reporting the CLI's code. Each runs
 * {@link RUNS} times, because a truncation depends on how fast the reader drains the pipe: the
 * assertion is that the output is complete on EVERY run, not on a lucky one. The slow reader makes the
 * truncation reproducible (every pipeline case failed on every run before the fix); `spawnSync`'s
 * reader is the test process itself, fast enough that the unfixed CLI lost the race only sometimes —
 * those cases are the AC's `spawnSync` half, and they hold on every run since the fix.
 *
 * The payloads are deterministic (REQ-SYS-07): the success path reads `memory search` over the
 * 1,000-document REQ-PERF-02 reference repository (`seedReferenceRepo`, index-derived content), and the
 * two error paths echo a fixed {@link LONG_NAME} back in their message — Commander's unknown-command
 * refusal (exit `2`, through `buildProgram`'s `exitOverride`) and core's not-found error (exit `1`,
 * through the registrar).
 */
import { spawnSync } from 'child_process';

import { CLI_ENTRY, runCliEntry } from './helpers/spawn-cli';
import { seedReferenceRepo } from '../core/helpers/reference-repo';
import { removeTempDir } from '../storage/helpers/git-fixture';

/** The pipe buffer the payloads must exceed (Linux's default capacity). */
const PIPE_BUFFER_BYTES = 64 * 1024;

/** Runs per case: a truncation is a race with the reader, so a single complete run proves nothing. */
const RUNS = 3;

/** An operand long enough that the error message echoing it exceeds the pipe buffer by a margin, and short
 * enough for one argv entry (Linux refuses a single argument over 128 KiB, `MAX_ARG_STRLEN`). */
const LONG_NAME = `x${'a'.repeat(PIPE_BUFFER_BYTES + 32 * 1024)}`;

interface PipedRun {
  readonly status: number;
  readonly output: string;
}

/**
 * Run `node dist/cli.js args…` in `cwd` as the left side of a shell pipeline into a slow reader, and
 * report the CLI's own exit status (`PIPESTATUS[0]`) with everything the reader received. `stream` picks
 * which of the CLI's streams goes into the pipe; the other is discarded.
 *
 * The reader takes one byte, pauses, then reads the rest — the shape of any consumer that is slower
 * than the writer (`jq` on a large document, a pager). Waiting for the first byte means the pause
 * starts only once the CLI has written, so a CLI that ends without draining has ended before the
 * reader asks for more: the truncation is reproduced on every run instead of on an unlucky one. The
 * pause bounds nothing that is asserted; it only orders the two processes.
 */
function runThroughShellPipe(cwd: string, args: readonly string[], stream: 'stdout' | 'stderr'): PipedRun {
  const redirect = stream === 'stdout' ? '2>/dev/null' : '2>&1 >/dev/null';
  const reader = '{ dd bs=1 count=1 2>/dev/null; sleep 0.5; cat; }';
  const script = `node "$0" "$@" ${redirect} | ${reader}; exit "\${PIPESTATUS[0]}"`;
  const run = spawnSync('bash', ['--noprofile', '--norc', '-c', script, CLI_ENTRY, ...args], {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  if (run.status === null) throw new Error(`pipeline ended on signal ${run.signal ?? 'unknown'}`);
  return { status: run.status, output: run.stdout };
}

let root: string;

beforeAll(() => {
  ({ root } = seedReferenceRepo());
});

afterAll(() => {
  removeTempDir(root);
});

describe('a payload larger than the pipe buffer reaches the reader whole (task-249, bug-222)', () => {
  const SEARCH = ['memory', 'search', '--format', 'json'] as const;

  /** What `memory search` returns for the reference repository: one entry per document. */
  function expectWholeSearchResult(text: string): void {
    expect(text.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
    const parsed = JSON.parse(text) as { matches: unknown[] };
    expect(parsed.matches).toHaveLength(1000);
  }

  it.each(Array.from({ length: RUNS }, (_, run) => run + 1))(
    'memory search --format json through spawnSync: complete, parseable JSON and exit 0 (run %i)',
    (_run) => {
      const run = runCliEntry(root, SEARCH);
      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
      expectWholeSearchResult(run.stdout);
    },
  );

  it.each(Array.from({ length: RUNS }, (_, run) => run + 1))(
    'memory search --format json | <slow reader>: complete, parseable JSON and exit 0 (run %i)',
    (_run) => {
      const run = runThroughShellPipe(root, SEARCH, 'stdout');
      expect(run.status).toBe(0);
      expectWholeSearchResult(run.output);
    },
  );
});

describe('the error path keeps its exit code and its whole stderr under a pipe (task-249, bug-222)', () => {
  const cases = [
    {
      label: 'an unknown command (Commander refusal, exit 2)',
      args: [LONG_NAME],
      code: 2,
      message: `error: unknown command '${LONG_NAME}'\n`,
    },
    {
      label: 'a document that does not exist (core error, exit 1)',
      args: ['memory', 'history', `task-${LONG_NAME}`],
      code: 1,
      message: `error: document not found: task-${LONG_NAME}\n`,
    },
  ] as const;

  for (const { label, args, code, message } of cases) {
    it.each(Array.from({ length: RUNS }, (_, run) => run + 1))(`${label} through spawnSync (run %i)`, (_run) => {
      const run = runCliEntry(root, args);
      expect(run.status).toBe(code);
      expect(run.stderr.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
      expect(run.stderr).toBe(message);
    });

    it.each(Array.from({ length: RUNS }, (_, run) => run + 1))(`${label} with stderr piped into a slow reader (run %i)`, (_run) => {
      const run = runThroughShellPipe(root, args, 'stderr');
      expect(run.status).toBe(code);
      expect(run.output.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
      expect(run.output).toBe(message);
    });
  }
});
