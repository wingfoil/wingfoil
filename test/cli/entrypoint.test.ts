/**
 * `src/cli.ts` — the `bin` entrypoint (`package.json` `"bin": {"wingfoil": "dist/cli.js"}`,
 * task-007-npm-distribution / REQ-SYS-09), exercised in-process
 * (task-065-fix-commander-esm-jest-harness, `bug-007-commander-esm-jest-untestable`).
 *
 * Like `./program.test.ts`, this file exists because `bug-007` left the CLI *entry-point wiring*
 * outside every automated test and outside the coverage report. `cli.ts` needs a different seam from
 * `program.ts` though: importing it **runs** it (its module body is
 * `buildProgram(...).then((program) => program.parseAsync(process.argv))`), so under jest it would
 * hand *jest's own* argv to commander and then `process.exit`. `./cli/program` is therefore mocked —
 * which is not a workaround but the point: what `cli.ts` actually contributes over `program.ts` is
 * the three arguments it passes (the real `CORE_MODULES`, a git-root `resolveRoot`, and the
 * `buildParams` shape) plus its last-resort `.catch`. Those are what is asserted here; the real
 * commander parse of those same arguments is `./program.integration.test.ts`'s job (it spawns the
 * compiled `dist/`).
 *
 * The `buildParams` assertion is the one that earns its keep: `test/cli/fixtures/cli-harness.cjs`
 * must mirror `cli.ts`'s `buildParams` exactly, since every CLI integration test drives the harness
 * rather than `cli.ts`. That mirror has silently drifted once already — task-021 found `options:
 * ctx.options` missing from the harness, which meant no integration test could exercise a
 * value-bearing option end-to-end. Pinning the shape here makes the next drift a test failure.
 *
 * Nothing here spawns a process and nothing reads the wall clock
 * (`test/core/latency-budget-placement.test.ts` / bug-011).
 */
import { join, resolve } from 'path';

import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { CORE_MODULES } from '../../src/core';
import type { BuildCommandsOptions } from '../../src/cli/registrar';

jest.mock('../../src/cli/program', () => ({ buildProgram: jest.fn() }));

import { buildProgram } from '../../src/cli/program';

let exitSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance;

/** Load `src/cli.ts` fresh (its work happens in the module body) and let its promise chain settle. */
async function runEntrypoint(): Promise<void> {
  jest.isolateModules(() => {
    // A runtime `require`, not a static/dynamic `import`, on purpose: the entrypoint must be
    // (re-)executed inside `isolateModules`'s fresh registry on every call — a static import would
    // run it once at suite load, and a dynamic `import()` of a relative path fails `tsc --noEmit`
    // under the project's `moduleResolution: Node16` (TS2835 wants a `.js` specifier, which jest's
    // resolver would then not find).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../src/cli');
  });
  // One macrotask turn is enough for the module body's `.then`/`.catch` to run: every promise in the
  // chain is already resolved or rejected by construction here (no timers, no I/O, no wall clock).
  await new Promise((resolve) => setImmediate(resolve));
}

/** The `BuildCommandsOptions` `src/cli.ts` handed to `buildProgram` on the last {@link runEntrypoint}. */
function optionsPassedToBuildProgram(): BuildCommandsOptions {
  const call = jest.mocked(buildProgram).mock.calls[0];
  if (!call) throw new Error('src/cli.ts did not call buildProgram');
  return call[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  exitSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = undefined;
});

describe('src/cli.ts — the `wingfoil` bin entrypoint', () => {
  it('builds the program over the production `CORE_MODULES` and parses the real `process.argv`', async () => {
    const parseAsync = jest.fn(async () => ({}) as Command);
    jest.mocked(buildProgram).mockResolvedValue({ parseAsync } as unknown as Command);

    await runEntrypoint();

    expect(buildProgram).toHaveBeenCalledTimes(1);
    // The production registry, whole — not a subset, not a hand-picked list (spec-006 §4.2: no
    // surface keeps its own allow/deny list). Compared structurally rather than by identity because
    // `jest.isolateModules` gives the entrypoint its own module registry, so its `src/core` is a
    // different instance of the same declaration than the one imported at the top of this file.
    const registered = jest.mocked(buildProgram).mock.calls[0]?.[0];
    expect(registered?.map((module) => module.name)).toEqual(CORE_MODULES.map((module) => module.name));
    expect(registered?.flatMap((module) => Object.keys(module.operations).sort())).toEqual(
      CORE_MODULES.flatMap((module) => Object.keys(module.operations).sort()),
    );
    expect(parseAsync).toHaveBeenCalledWith(process.argv);
  });

  it('passes a `resolveRoot` that is never invoked during wiring (so `--help`/`--version` work outside a repo)', async () => {
    jest.mocked(buildProgram).mockResolvedValue({ parseAsync: jest.fn(async () => ({}) as Command) } as unknown as Command);

    await runEntrypoint();

    // Registration must not resolve the git root: `resolveRoot` is called lazily, once per dispatched
    // command, inside `registrar.ts`'s `run` (spec-005 §1 / spec-008 §1, bug-001).
    expect(typeof optionsPassedToBuildProgram().resolveRoot).toBe('function');
  });

  it('resolves the project root from the CWD *at call time*, via git-root detection (spec-011)', async () => {
    jest.mocked(buildProgram).mockResolvedValue({ parseAsync: jest.fn(async () => ({}) as Command) } as unknown as Command);

    await runEntrypoint();

    // `resolveProjectRoot` is pure filesystem walking (`existsSync` for a `.git` entry — a file in a
    // worktree, a directory in a normal clone), so pointing `process.cwd()` at this repository root
    // makes the assertion deterministic and spawns nothing.
    const repoRoot = resolve(join(__dirname, '..', '..'));
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(repoRoot);
    try {
      expect(optionsPassedToBuildProgram().resolveRoot()).toBe(repoRoot);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('passes a `buildParams` producing the exact shape `test/cli/fixtures/cli-harness.cjs` mirrors', async () => {
    jest.mocked(buildProgram).mockResolvedValue({ parseAsync: jest.fn(async () => ({}) as Command) } as unknown as Command);

    await runEntrypoint();

    const params = optionsPassedToBuildProgram().buildParams({
      moduleName: 'memory',
      operationName: 'memoryAdd',
      root: '/repo',
      positional: 'first',
      positionals: ['first', 'second'],
      flags: { list: true },
      options: { type: 'task' },
    });

    expect(params).toEqual({
      root: '/repo',
      positional: 'first',
      positionals: ['first', 'second'],
      options: { type: 'task' },
      list: true,
    });
  });

  it('spreads an absent `flags` record into nothing rather than into `undefined` keys', async () => {
    jest.mocked(buildProgram).mockResolvedValue({ parseAsync: jest.fn(async () => ({}) as Command) } as unknown as Command);

    await runEntrypoint();

    const params = optionsPassedToBuildProgram().buildParams({
      moduleName: 'dna',
      operationName: 'dnaShow',
      root: '/repo',
    });

    expect(params).toEqual({ root: '/repo', positional: undefined, positionals: undefined, options: undefined });
  });
});

describe('src/cli.ts — the last-resort error handler (bug-002-cli-error-stack-dump)', () => {
  it('prints only the message of an escaped Error, never its stack, and exits 1', async () => {
    const error = new Error('something escaped the per-command exit path');
    error.stack = 'Error: something escaped\n    at /home/someone/secret/path/program.js:1:1';
    jest.mocked(buildProgram).mockRejectedValue(error);

    await runEntrypoint();

    const output = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toBe('error: something escaped the per-command exit path\n');
    expect(output).not.toContain('secret/path');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('lets a DeferredExit through silently: the exit is already chosen and waits for output to drain (task-249)', async () => {
    // Matched by name, so the error need not come from the same copy of `src/cli/exit` the entry loads;
    // `exitWith` has already set `process.exitCode`, which is what makes the name trustworthy.
    const deferred = Object.assign(new Error('exit 2 deferred until the output drains'), { name: 'DeferredExit' });
    jest.mocked(buildProgram).mockRejectedValue(deferred);
    process.exitCode = 2;

    await runEntrypoint();

    expect(stderrSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it('an error merely NAMED DeferredExit, with no exit code chosen, is reported and exits 1 (task-249 review F2)', async () => {
    const impostor = Object.assign(new Error('not from exitWith'), { name: 'DeferredExit' });
    jest.mocked(buildProgram).mockRejectedValue(impostor);

    await runEntrypoint();

    expect(stderrSpy.mock.calls.map((call) => String(call[0])).join('')).toBe('error: not from exitWith\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('waits for queued stdout before exiting 1, through exitWith (task-249 review F1, spec-005 §1)', async () => {
    // A queued stdout is simulated with an own `writableLength`; `stdout.write` is stubbed so the test
    // decides when the empty "flush marker" write completes.
    Object.defineProperty(process.stdout, 'writableLength', { value: 1, configurable: true });
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errorListeners = process.stdout.listeners('error');
    try {
      jest.mocked(buildProgram).mockRejectedValue(new Error('escaped after a large payload'));

      await runEntrypoint();

      expect(stderrSpy.mock.calls.map((call) => String(call[0])).join('')).toBe('error: escaped after a large payload\n');
      expect(exitSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const marker = stdoutSpy.mock.calls.find((call) => call[0] === '')?.[1] as ((error?: Error | null) => void) | undefined;
      expect(marker).toBeDefined();
      marker!(null);
      expect(exitSpy.mock.calls).toEqual([[1]]);
    } finally {
      delete (process.stdout as unknown as { writableLength?: number }).writableLength;
      for (const listener of process.stdout.listeners('error')) {
        if (!errorListeners.includes(listener)) process.stdout.removeListener('error', listener as (...args: unknown[]) => void);
      }
      stdoutSpy.mockRestore();
    }
  });

  it('stringifies a non-Error rejection instead of printing `undefined`', async () => {
    jest.mocked(buildProgram).mockRejectedValue('plain string failure');

    await runEntrypoint();

    expect(stderrSpy.mock.calls.map((call) => String(call[0])).join('')).toBe('error: plain string failure\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
