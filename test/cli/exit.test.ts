/**
 * `exitWith`, the single exit mechanism of `spec-005` §1, in-process (task-249, `bug-222`).
 *
 * `./piped-output-drain.integration.test.ts` proves the behaviour end to end, through real pipes; a
 * spawned process is invisible to coverage, so this file pins each branch of the mechanism itself:
 * nothing queued → `process.exit` at once; output queued → `process.exitCode` now and `process.exit`
 * only once every queued stream has completed (or failed with `EPIPE`), always with the caller's code.
 *
 * The queue is simulated on the real `process.stdout`/`process.stderr`: an own `writableLength`
 * property shadows the prototype getter, and `write` is spied so the test decides when the empty
 * "flush marker" write completes. Each case loads a fresh copy of the module, because the deferred
 * flag is module state.
 */
import type * as ExitModule from '../../src/cli/exit';

type Stream = NodeJS.WriteStream;

/** A fresh `src/cli/exit` (its deferred flag starts `false`). */
function loadExit(): typeof ExitModule {
  let loaded: typeof ExitModule | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof ExitModule>('../../src/cli/exit');
  });
  return loaded!;
}

/** Make `stream` report `bytes` still queued, until restored. */
function queue(stream: Stream, bytes: number): void {
  Object.defineProperty(stream, 'writableLength', { value: bytes, configurable: true });
}

function unqueue(stream: Stream): void {
  delete (stream as unknown as { writableLength?: number }).writableLength;
}

/** The completion callbacks of the empty writes `exitWith` queued on `spy`'s stream. */
function flushMarkers(spy: jest.SpyInstance): Array<(error?: Error | null) => void> {
  return spy.mock.calls.filter((call) => call[0] === '').map((call) => call[1] as (error?: Error | null) => void);
}

let exitSpy: jest.SpyInstance;
let stdoutSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance;
let savedExitCode: typeof process.exitCode;
let savedErrorListeners: Map<Stream, Function[]>;

/** Remove only the `error` listeners added since `beforeEach` — never the test runner's own. */
function removeAddedErrorListeners(): void {
  for (const [stream, before] of savedErrorListeners) {
    for (const listener of stream.listeners('error')) {
      if (!before.includes(listener)) stream.removeListener('error', listener as (...args: unknown[]) => void);
    }
  }
}

beforeEach(() => {
  savedExitCode = process.exitCode;
  savedErrorListeners = new Map([process.stdout, process.stderr].map((stream) => [stream, stream.listeners('error')]));
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  unqueue(process.stdout);
  unqueue(process.stderr);
  removeAddedErrorListeners();
  exitSpy.mockRestore();
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = savedExitCode;
});

describe('exitWith — nothing queued: the process ends at once', () => {
  it('calls process.exit with the code, once, and writes the message to stderr first', () => {
    const { exitWith, isExitDeferred } = loadExit();
    exitWith(2, 'error: refused');
    expect(stderrSpy).toHaveBeenCalledWith('error: refused\n');
    expect(exitSpy.mock.calls).toEqual([[2]]);
    expect(isExitDeferred()).toBe(false);
  });
});

describe('exitWith — output still queued for a pipe: the exit waits for it (bug-222)', () => {
  it('sets process.exitCode now and calls process.exit only when the queued stdout has been written', () => {
    queue(process.stdout, 200_000);
    const { exitWith, isExitDeferred } = loadExit();

    exitWith(0);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    expect(isExitDeferred()).toBe(true);

    const [marker] = flushMarkers(stdoutSpy);
    marker!(null);
    expect(exitSpy.mock.calls).toEqual([[0]]);
  });

  it('waits for BOTH streams when both hold output, and keeps the code of a failure', () => {
    queue(process.stdout, 1);
    queue(process.stderr, 1);
    const { exitWith } = loadExit();

    exitWith(1, 'error: not found');
    flushMarkers(stdoutSpy)[0]!(null);
    expect(exitSpy).not.toHaveBeenCalled();
    flushMarkers(stderrSpy)[0]!(null);
    expect(exitSpy.mock.calls).toEqual([[1]]);
  });

  it('a reader that went away (EPIPE) ends the wait with the same code, once, not with a stream error', () => {
    queue(process.stdout, 1);
    const { exitWith } = loadExit();

    exitWith(1);
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    process.stdout.emit('error', epipe);
    flushMarkers(stdoutSpy)[0]!(epipe);
    expect(exitSpy.mock.calls).toEqual([[1]]);
  });
});

describe('DeferredExit', () => {
  it('carries the chosen code and a name the compiled test harness recognises', () => {
    const { DeferredExit } = loadExit();
    const error = new DeferredExit(2);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(2);
    expect(error.name).toBe('DeferredExit');
  });
});
