/**
 * `src/cli`'s registrar — the thin, Commander-independent adapter that derives one
 * `wingfoil <noun> <verb>` command descriptor per operation from a `CoreModule[]` registry
 * (spec-006 §2/§4, spec-005 exit-code/format/error contract, spec-008 grammar). No business logic
 * here beyond dispatch: these tests only exercise parse-format -> call-core-fn -> render-CoreResult,
 * never a real domain operation. The actual `commander` wiring over this model — a thin, mechanical
 * pass-through — is covered by `./program.test.ts` (in-process: task-065-fix-commander-esm-jest-harness
 * lifted the ESM barrier `bug-007` describes) and by `./program.integration.test.ts` (out-of-process,
 * against the compiled `dist/`).
 */
import type { CoreModule } from '../../src/core/registry';
import { coreErr, coreOk } from '../../src/core/types';
import type { CoreErrorCode, CoreResult } from '../../src/core/types';
import { buildCliCommands, listRegisteredCliCommands, type CliCommand } from '../../src/cli/registrar';
import { StorageError, E_NO_GIT_ROOT } from '../../src/storage/errors';

const FIXTURE_MODULES: CoreModule[] = [
  {
    name: 'dna',
    operations: {
      dnaShow: { name: 'dnaShow', mutates: false, fn: async () => coreOk({ hello: 'world' }) },
      dnaSet: {
        name: 'dnaSet',
        mutates: true,
        fn: async () => coreOk({ committed: true }, { sha: 'abc123', message: 'wf(dna): set' }),
      },
    },
  },
  {
    name: 'memory',
    operations: {
      memoryApprove: {
        name: 'memoryApprove',
        mutates: true,
        fn: async () => coreErr({ code: 'INVALID_TRANSITION', message: 'illegal transition: draft to approved' }),
      },
    },
  },
];

function buildTestCommands(): CliCommand[] {
  return buildCliCommands(FIXTURE_MODULES, {
    resolveRoot: () => '/fixture-root',
    buildParams: () => ({}),
  });
}

function findCommand(commands: readonly CliCommand[], noun: string, verb: string): CliCommand {
  const found = commands.find((c) => c.noun === noun && c.verb === verb);
  if (!found) throw new Error(`fixture bug: ${noun} ${verb} not derived`);
  return found;
}

describe('buildCliCommands — command derivation (spec-006 §4: CLI exposes every operation)', () => {
  it('derives one `wingfoil <noun> <verb>` command per operation, regardless of `mutates`', () => {
    expect(listRegisteredCliCommands(buildTestCommands())).toEqual(['dna set', 'dna show', 'memory approve']);
  });

  it('tags each derived command with the operation\'s own `mutates` flag', () => {
    const commands = buildTestCommands();
    expect(findCommand(commands, 'dna', 'show').mutates).toBe(false);
    expect(findCommand(commands, 'dna', 'set').mutates).toBe(true);
    expect(findCommand(commands, 'memory', 'approve').mutates).toBe(true);
  });
});

describe('buildCliCommands — flat (no-verb) commands (spec-008-cli-grammar §1, task-028: `wingfoil paths [category]`)', () => {
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  // Unified seam (reconciled onto task-026's merged `ParamsContext.positional?: string`): `paths` is a
  // flat, self-named op that declares only a `--list` flag; its `category` rides the SAME generic
  // single bare positional `dna show`'s `section` does (no per-op positional metadata).
  const FLAT_MODULES: CoreModule[] = [
    {
      name: 'paths',
      operations: {
        paths: {
          name: 'paths',
          mutates: false,
          // Declared, so the registrar lets one operand through (task-129 refuses a surplus).
          positional: { name: 'category', description: 'a path category' },
          flags: [{ name: 'list' }],
          fn: async () => coreOk({ category: 'sources', paths: ['src/'] }),
        },
      },
    },
  ];

  it('a "self-named" operation (module name === operation name) derives an empty verb, not a subcommand', () => {
    const commands = buildCliCommands(FLAT_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    const flat = findCommand(commands, 'paths', '');
    expect(flat.verb).toBe('');
    expect(flat.flags).toEqual([{ name: 'list' }]);
  });

  it('`listRegisteredCliCommands` renders a flat command as the bare noun, not "noun " with a trailing space', () => {
    const commands = buildCliCommands(FLAT_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    expect(listRegisteredCliCommands(commands)).toEqual(['paths']);
  });

  it('`run` forwards the single positional value and the parsed flags into `buildParams` via `ParamsContext`', async () => {
    let seenPositional: unknown;
    let seenFlags: unknown;
    const commands = buildCliCommands(FLAT_MODULES, {
      resolveRoot: () => '/fixture-root',
      buildParams: (ctx) => {
        seenPositional = ctx.positional;
        seenFlags = ctx.flags;
        return { root: ctx.root, positional: ctx.positional, ...(ctx.flags ?? {}) };
      },
    });
    const flat = findCommand(commands, 'paths', '');
    await flat.run('json', ['sources'], { list: true });
    expect(seenPositional).toBe('sources');
    expect(seenFlags).toEqual({ list: true });
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify({ category: 'sources', paths: ['src/'] }) + '\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('`run` still works with no positional/flags supplied (backward compatible with the 1-arg call shape)', async () => {
    const commands = buildCliCommands(FLAT_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    const flat = findCommand(commands, 'paths', '');
    await expect(flat.run('console')).resolves.toBeUndefined();
  });
});

describe('CliCommand.run — dispatch behavior', () => {
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('a successful read-only call renders the CoreResult value as JSON on stdout and exits 0', async () => {
    await findCommand(buildTestCommands(), 'dna', 'show').run('console');
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }, null, 2) + '\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('--format json renders a compact single JSON value on stdout', async () => {
    await findCommand(buildTestCommands(), 'dna', 'show').run('json');
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }) + '\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('--format yaml renders the same value as YAML on stdout', async () => {
    await findCommand(buildTestCommands(), 'dna', 'show').run('yaml');
    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written).toContain('hello: world');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('an invalid --format value exits 2 with a usage error on stderr, and never calls the core fn', async () => {
    await findCommand(buildTestCommands(), 'dna', 'show').run('xml');
    expect(stderrSpy).toHaveBeenCalledWith(
      'error: invalid --format value "xml", expected one of: console, json, yaml\n',
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('a CoreResult.error from a mutating op emits `error: <reason>` on stderr and exits 1', async () => {
    await findCommand(buildTestCommands(), 'memory', 'approve').run('console');
    expect(stderrSpy).toHaveBeenCalledWith('error: illegal transition: draft to approved\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('--format json renders a single JSON error object on stderr and exits 1', async () => {
    await findCommand(buildTestCommands(), 'memory', 'approve').run('json');
    expect(stderrSpy).toHaveBeenCalledWith(JSON.stringify({ error: 'illegal transition: draft to approved' }) + '\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('--format yaml renders a CoreResult.error as YAML on stderr and exits 1', async () => {
    await findCommand(buildTestCommands(), 'memory', 'approve').run('yaml');
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain('illegal transition: draft to approved');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('a successful mutating call still exits 0 and renders the value (commit metadata is not part of the payload)', async () => {
    await findCommand(buildTestCommands(), 'dna', 'set').run('json');
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify({ committed: true }) + '\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('an uncaught exception from the core fn is still reported through emitError/exitWith(1), never a bare crash', async () => {
    const commands = buildCliCommands(
      [{ name: 'x', operations: { xBoom: { name: 'xBoom', mutates: false, fn: async () => { throw new Error('boom'); } } } }],
      { resolveRoot: () => '/fixture-root', buildParams: () => ({}) },
    );
    await findCommand(commands, 'x', 'boom').run('console');
    expect(stderrSpy).toHaveBeenCalledWith('error: boom\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('a resolveRoot() failure (no git root) is reported via emitError/exitWith(1), not an escaped throw (bug-002)', async () => {
    const commands = buildCliCommands(FIXTURE_MODULES, {
      resolveRoot: () => {
        throw new StorageError(E_NO_GIT_ROOT, 'not inside a WingFoil project (no .git found)');
      },
      buildParams: (ctx) => ({ root: ctx.root }),
    });
    await findCommand(commands, 'dna', 'show').run('console');
    expect(stderrSpy).toHaveBeenCalledWith('error: E_NO_GIT_ROOT: not inside a WingFoil project (no .git found)\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('an uncaught non-Error throw (e.g. a plain string) is still stringified and reported the same way', async () => {
    const commands = buildCliCommands(
      [{ name: 'x', operations: { xBoom: { name: 'xBoom', mutates: false, fn: async () => { throw 'boom-string'; } } } }],
      { resolveRoot: () => '/fixture-root', buildParams: () => ({}) },
    );
    await findCommand(commands, 'x', 'boom').run('console');
    expect(stderrSpy).toHaveBeenCalledWith('error: boom-string\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('positional argument threading (task-026-implement-dna-show — generic seam reused by task-025/028)', () => {
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  /** A one-operation module whose core fn just echoes back whatever params it received. */
  function echoCommand(): CliCommand {
    const commands = buildCliCommands(
      [
        {
          name: 'x',
          operations: {
            // Declares its positional: the registrar refuses an undeclared operand (task-129).
            xEcho: { name: 'xEcho', mutates: false, positional: { name: 'section', description: 's' }, fn: async (params) => coreOk(params) },
          },
        },
      ],
      {
        resolveRoot: () => '/fixture-root',
        buildParams: (ctx) => ({ root: ctx.root, positional: ctx.positional }),
      },
    );
    return findCommand(commands, 'x', 'echo');
  }

  it('`CliCommand.run`\'s optional positional list reaches `buildParams` as `ctx.positional` (first element), generically (not dna-specific)', async () => {
    await echoCommand().run('json', ['some-section']);
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify({ root: '/fixture-root', positional: 'some-section' }) + '\n');
  });

  it('an omitted positional list is threaded through as `undefined` (first element of an empty/absent list)', async () => {
    await echoCommand().run('json');
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify({ root: '/fixture-root' }) + '\n');
  });
});

describe('value-bearing option threading (task-020-implement-memory-add — `--type`/`--title`/`--tags` seam reused by task-021)', () => {
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  /** A one-op module declaring value options; its fn echoes back the params it received. */
  const OPTION_MODULES: CoreModule[] = [
    {
      name: 'memory',
      operations: {
        memoryAdd: {
          name: 'memoryAdd',
          mutates: true,
          options: [
            { name: 'type', required: true },
            { name: 'title', required: true },
            { name: 'tags' },
          ],
          fn: async (params) => coreOk(params),
        },
      },
    },
  ];

  it('copies `CoreOperation.options` onto the derived `CliCommand` (so program.ts can register `--<name> <value>`)', () => {
    const commands = buildCliCommands(OPTION_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    const add = findCommand(commands, 'memory', 'add');
    expect(add.options).toEqual([{ name: 'type', required: true }, { name: 'title', required: true }, { name: 'tags' }]);
  });

  it('`run` threads the parsed value options into `buildParams` as `ctx.options`', async () => {
    let seenOptions: unknown;
    const commands = buildCliCommands(OPTION_MODULES, {
      resolveRoot: () => '/fixture-root',
      buildParams: (ctx) => {
        seenOptions = ctx.options;
        return { root: ctx.root, options: ctx.options };
      },
    });
    const add = findCommand(commands, 'memory', 'add');
    await add.run('json', [], undefined, { type: 'decision', title: 'Use PostgreSQL' });
    expect(seenOptions).toEqual({ type: 'decision', title: 'Use PostgreSQL' });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('the option seam is additive: a command that reads no options is unaffected (dna show still 0-arg)', async () => {
    await findCommand(buildTestCommands(), 'dna', 'show').run('json');
    expect(stdoutSpy).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }) + '\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('exit-code matrix (REQ-INT-04, task-012) — dispatch routes 0/1/2 through core selection', () => {
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  /** A one-operation module whose single op returns the given CoreResult, for driving `.run`. */
  function commandReturning(result: CoreResult<unknown>): CliCommand {
    const commands = buildCliCommands(
      [{ name: 'x', operations: { xDo: { name: 'xDo', mutates: false, fn: async () => result } } }],
      { resolveRoot: () => '/fixture-root', buildParams: () => ({}) },
    );
    return findCommand(commands, 'x', 'do');
  }

  it('success → exit 0', async () => {
    await commandReturning(coreOk({ ok: true })).run('console');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  const LOGIC_ERROR_CODES: readonly CoreErrorCode[] = [
    'NOT_FOUND',
    'INVALID_TRANSITION',
    'VALIDATION',
    'CONFLICT',
    'IO',
  ];

  it.each(LOGIC_ERROR_CODES)('a %s CoreResult.error → exit 1 (logic error)', async (code) => {
    await commandReturning(coreErr({ code, message: `boom: ${code}` })).run('console');
    expect(exitSpy).toHaveBeenLastCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(`error: boom: ${code}\n`);
  });

  it('an invalid --format value → exit 2 (usage error, decided pre-core by the CLI)', async () => {
    await commandReturning(coreOk({ ok: true })).run('xml');
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

describe('an operation\'s own console rendering and a core hint (task-220, spec-016 §6, spec-005 §3.1)', () => {
  const MODULES: CoreModule[] = [
    {
      name: 'agent',
      operations: {
        agentShow: {
          name: 'agentShow',
          mutates: false,
          fn: async () => coreOk({ id: 'x/red/1' }),
          renderConsole: (value) => `id: ${(value as { id: string }).id}\n`,
        },
        agentHint: {
          name: 'agentHint',
          mutates: false,
          fn: async () => coreErr({ code: 'NOT_FOUND', message: 'run not found: x/red/2', hint: 'commit the run log' }),
        },
      },
    },
  ];
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  const written = (spy: jest.SpyInstance): string => spy.mock.calls.map(([chunk]) => String(chunk)).join('');
  const command = (verb: string): CliCommand =>
    findCommand(buildCliCommands(MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) }), 'agent', verb);

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('console prints renderConsole\'s text', async () => {
    await command('show').run('console');
    expect(written(stdoutSpy)).toBe('id: x/red/1\n');
  });

  it('json ignores renderConsole and prints the payload', async () => {
    await command('show').run('json');
    expect(written(stdoutSpy)).toBe('{"id":"x/red/1"}\n');
  });

  it('a CoreError hint is the hint: line under the error, and the exit code stays 1', async () => {
    await command('hint').run('console');
    expect(written(stderrSpy)).toBe('error: run not found: x/red/2\nhint: commit the run log\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
