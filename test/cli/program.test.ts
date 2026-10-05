/**
 * `src/cli/program.ts` — the real `commander` wiring, exercised **in-process**
 * (task-065-fix-commander-esm-jest-harness, `bug-007-commander-esm-jest-untestable`).
 *
 * Until this suite existed, `program.ts` could not be loaded by a jest test at all: `commander` v15
 * is ESM-only and `buildProgram` reaches it through `await import('commander')`, which TypeScript
 * *preserves* under `module: Node16` — correct for production node, but jest's CommonJS runtime has
 * no dynamic-import callback, so the call died with `TypeError: A dynamic import callback was
 * invoked without --experimental-vm-modules`. The file was therefore excluded from every automated
 * test AND from the coverage report (it never appeared, not even at 0 %, because jest discovers
 * untested files by crawling `roots`, which is `test/` only — so an `src/` file no test requires is
 * invisible). `bug-007` calls that the *white-box* gap.
 *
 * The harness fix lives entirely in `jest.config.js` + `tsconfig.test.json` (no `src/` change, no new
 * dependency — see the task's Execution Notes for the routes rejected under
 * `dl-010-minimal-dependencies`): ts-jest compiles the sources with `module: CommonJS`, which
 * downlevels that `import()` to `require('commander')`, and `transformIgnorePatterns` lets ts-jest
 * transform `commander`'s own ESM on the way in. **So the commander driven below is the real
 * commander v15 — its real `Command`, real option parsing, real `unknownCommand` behaviour — but
 * transpiled to CommonJS for the test runtime.** The published CLI loads it as ESM; that ESM path
 * stays covered black-box by `./program.integration.test.ts`, which spawns the compiled `dist/`.
 * This suite owns the complementary white-box half: that `buildProgram` wires the right commands,
 * options and arguments onto Commander and forwards each invocation to `registrar.ts`'s `run`.
 *
 * Deliberately *not* black-box: exit codes, messages and output shape for the production
 * `CORE_MODULES` are `program.integration.test.ts`'s job. Here the module registry is synthetic (as
 * in `./registrar.test.ts`), so the assertions are about wiring rather than about any one domain
 * operation. `./init-command.ts` and `./mcp-command.ts` are mocked for the same reason: their own
 * behaviour has dedicated suites (`./init-command.test.ts`, `./mcp-command.test.ts`), and running the
 * real ones here would write to a repo / open a real stdio MCP transport.
 *
 * Nothing here spawns a process and nothing reads the wall clock, so
 * `test/core/latency-budget-placement.test.ts` (bug-011) is satisfied by construction.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildProgram } from '../../src/cli/program';
import { exitCodeForParseOutcome } from '../../src/core/exit-code';
import type { CoreModule, ParamsContext } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';
import { TEMPLATE_NAMES } from '../../src/storage';

jest.mock('../../src/cli/init-command', () => ({
  runInit: jest.fn(async () => undefined),
  createReadlinePrompt: jest.fn(() => async () => ''),
}));
jest.mock('../../src/cli/mcp-command', () => ({
  runMcp: jest.fn(async () => undefined),
}));

import { runInit, createReadlinePrompt } from '../../src/cli/init-command';
import { runMcp } from '../../src/cli/mcp-command';

const PKG_VERSION = (
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')) as { version: string }
).version;

/**
 * A synthetic registry covering all three command shapes `program.ts` has to wire: a plain
 * `<noun> <verb>` read op, a `<noun> <verb>` op with value-bearing `--{name} <value>` options
 * (task-020), and a flat, self-named op with a boolean `--{flag}` (task-028).
 */
const FIXTURE_MODULES: CoreModule[] = [
  {
    name: 'dna',
    operations: {
      dnaShow: {
        name: 'dnaShow',
        mutates: false,
        positional: { name: 'section', description: 'a top-level key' },
        fn: async () => coreOk({ hello: 'world' }),
      },
      // Mirrors the real registration since `dl-082-cli-parameter-shape`: the path is the command's
      // positional, the value a declared `--value` option (`CORE_MODULES`, `src/core/index.ts`).
      dnaSet: {
        name: 'dnaSet',
        mutates: true,
        positional: { name: 'path', required: true, description: 'the dotted path', refusesExtraItself: true },
        options: [{ name: 'value' }],
        fn: async () => coreOk({ committed: true }),
      },
    },
  },
  {
    name: 'memory',
    operations: {
      memoryAdd: {
        name: 'memoryAdd',
        mutates: true,
        options: [
          { name: 'type', required: true },
          { name: 'title' },
          { name: 'set', repeatable: true, valueName: 'name=value' },
        ],
        fn: async () => coreOk({ id: 'task-001' }),
      },
    },
  },
  {
    name: 'paths',
    operations: {
      paths: {
        name: 'paths',
        mutates: false,
        positional: { name: 'category', description: 'a path category' },
        flags: [{ name: 'list' }],
        fn: async () => coreOk({ category: 'sources' }),
      },
    },
  },
];

/** Every `ParamsContext` `buildParams` saw during the last `parseAsync`, in call order. */
let seenContexts: ParamsContext[];
let exitSpy: jest.SpyInstance;
let stdoutSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance;

/** Build the program over {@link FIXTURE_MODULES}, recording every `ParamsContext` into `seenContexts`. */
async function buildFixtureProgram() {
  const program = await buildProgram(FIXTURE_MODULES, {
    resolveRoot: () => '/fixture-root',
    buildParams: (ctx) => {
      seenContexts.push(ctx);
      return { root: ctx.root };
    },
  });
  // Commander's own terminal paths (`--version`, `--help`, unknown command) end the process:
  // `buildProgram` itself installs an `exitOverride` that calls `exitWith` (task-101). Replacing it
  // with commander's DEFAULT override turns those paths into throws instead, so they can be asserted
  // without ending the jest worker. It has to be applied to every command in the tree, not just the
  // root: `.command()` copies the parent's callback into each subcommand at REGISTRATION time
  // (`copyInheritedSettings`), so subcommands already carry `buildProgram`'s process-exiting one.
  const applyDefaultOverride = (command: Awaited<ReturnType<typeof buildProgram>>): void => {
    command.exitOverride();
    command.commands.forEach(applyDefaultOverride);
  };
  applyDefaultOverride(program);
  return program;
}

/**
 * The same program with `buildProgram`'s OWN `exitOverride` left in place — the callback that routes
 * commander's terminations through the contract and, since
 * task-103-a-missing-verb-exits-2-with-an-error-line, writes the `error:` line commander does not
 * (`bug-103`). `buildFixtureProgram` above replaces that callback, so nothing in this suite exercised
 * it; here it runs for real against the `process.stderr.write` spy installed in `beforeEach`.
 *
 * `process.exit` must STOP execution for these, which the suite-wide no-op spy does not: commander
 * keeps running after the callback returns and reaches code the real process never gets to. Measured
 * rather than assumed — with the no-op spy, `wingfoil help` prints its help, exits 0, then *continues*
 * into `_dispatchHelpCommand`'s `_findCommand(undefined)` fallback and raises a SECOND termination,
 * this time an incomplete invocation, so the callback writes `error: missing required argument:
 * wingfoil help <command>` for an invocation the real binary answers at exit 0 with empty stderr.
 * That is a harness artefact and asserting on it would pin a fiction, so {@link ProcessExited} turns
 * the first exit into a throw and {@link parseIgnoringFallout} catches it — leaving exactly one
 * termination per invocation, as in the real process.
 *
 * The process-level proof stays `./missing-verb-exit-code.integration.test.ts`, which spawns the
 * compiled CLI; this half proves WHICH line and WHICH code the callback chooses.
 */
async function buildFixtureProgramWithRealExitCallback() {
  return buildProgram(FIXTURE_MODULES, {
    resolveRoot: () => '/fixture-root',
    buildParams: (ctx) => {
      seenContexts.push(ctx);
      return { root: ctx.root };
    },
  });
}

/** What the `process.exit` spy throws so execution stops where the real process would end. */
class ProcessExited extends Error {
  constructor(readonly code: unknown) {
    super(`process.exit(${String(code)})`);
  }
}

/** Parse, catching the {@link ProcessExited} the first termination throws. */
async function parseIgnoringFallout(
  program: Awaited<ReturnType<typeof buildProgram>>,
  ...argv: readonly string[]
): Promise<void> {
  try {
    await program.parseAsync(['node', 'wingfoil', ...argv]);
  } catch (error) {
    if (!(error instanceof ProcessExited)) throw error;
  }
}

/** The text written to stdout (or stderr) across all calls of that spy, concatenated. */
function written(spy: jest.SpyInstance): string {
  return spy.mock.calls.map((call) => String(call[0])).join('');
}

beforeEach(() => {
  seenContexts = [];
  jest.clearAllMocks();
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  exitSpy.mockRestore();
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe('buildProgram — the program itself (bug-007: this module is now loadable in-process)', () => {
  it('builds a real commander `Command` named `wingfoil`', async () => {
    const program = await buildFixtureProgram();
    expect(program.name()).toBe('wingfoil');
    // The real commander class, not a stand-in: its prototype carries Commander's own API.
    expect(typeof program.parseAsync).toBe('function');
    expect(typeof program.opts).toBe('function');
  });

  it('registers the four global flags from spec-008 §2 plus `-V, --version` (bug-001)', async () => {
    const program = await buildFixtureProgram();
    expect(program.options.map((option) => option.flags)).toEqual([
      '-V, --version',
      '--format <format>',
      '--verbose',
      '--no-color',
      '--no-interactive',
    ]);
  });

  it('`--format` defaults to `console`; the negatable flags resolve to enabled once an invocation is parsed', async () => {
    const program = await buildFixtureProgram();
    // Only `--format` carries a commander *default value*, so it is the only key present before a
    // parse; `--no-color` / `--no-interactive` resolve to `true` when argv is actually read.
    expect(program.opts()).toEqual({ format: 'console' });
    await program.parseAsync(['node', 'wingfoil', 'dna', 'show']);
    expect(program.opts()).toEqual({ format: 'console', color: true, interactive: true });
  });

  it('`--version` prints the package.json version and terminates with commander exit code 0', async () => {
    const program = await buildFixtureProgram();
    await expect(program.parseAsync(['node', 'wingfoil', '--version'])).rejects.toMatchObject({
      code: 'commander.version',
      exitCode: 0,
    });
    expect(written(stdoutSpy).trim()).toBe(PKG_VERSION);
  });
});

describe('buildProgram — command tree derivation (spec-006 §4, spec-008 §1)', () => {
  it('registers `init`, `mcp` and one command per derived noun, in `enumerateOperations` order', async () => {
    const program = await buildFixtureProgram();
    expect(program.commands.map((command) => command.name())).toEqual(['init', 'mcp', 'dna', 'memory', 'paths']);
  });

  it('nests each verb under its noun, and registers a self-named operation as a FLAT command (task-028)', async () => {
    const program = await buildFixtureProgram();
    const nameOf = (noun: string) => program.commands.find((command) => command.name() === noun);
    expect(nameOf('dna')?.commands.map((command) => command.name())).toEqual(['set', 'show']);
    expect(nameOf('memory')?.commands.map((command) => command.name())).toEqual(['add']);
    // `paths` is self-named (`deriveVerb` -> ''), so it carries no subcommand at all.
    expect(nameOf('paths')?.commands).toEqual([]);
  });

  it('registers a declared positional under its own name, optional and variadic to Commander (task-120)', async () => {
    const program = await buildFixtureProgram();
    const dnaShow = program.commands.find((c) => c.name() === 'dna')?.commands.find((c) => c.name() === 'show');
    expect(dnaShow?.registeredArguments.map((argument) => argument.name())).toEqual(['section']);
    // Parsing is unchanged by the name: Commander still accepts any number of operands and never
    // refuses a missing one — core does (task-120 AC 4).
    expect(dnaShow?.registeredArguments[0]?.variadic).toBe(true);
    expect(dnaShow?.registeredArguments[0]?.required).toBe(false);
  });

  it('registers no argument for a command that declares no positional, and lets an operand reach the registrar\'s refusal (task-120, task-129)', async () => {
    const program = await buildFixtureProgram();
    const memoryAdd = program.commands.find((c) => c.name() === 'memory')?.commands.find((c) => c.name() === 'add');
    expect(memoryAdd?.registeredArguments).toEqual([]);
    // Not Commander's "too many arguments": the surplus reaches `registrar.run`, which refuses it at
    // exit 2 with WingFoil's own wording, before `buildParams` is ever called (bug-131).
    await program.parseAsync(['node', 'wingfoil', 'memory', 'add', 'extra', '--type', 'task']);
    expect(seenContexts).toEqual([]);
    expect(written(stderrSpy)).toBe('error: wingfoil memory add takes no positional (got 1 positional)\n');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('forwards every operand to an operation that refuses a surplus itself (the DNA path verbs, task-129)', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'dna', 'set', 'project.license', 'extra', '--value', 'MIT']);
    expect(seenContexts[0]).toMatchObject({ positional: 'project.license', positionals: ['project.license', 'extra'], options: { value: 'MIT' } });
  });

  it('registers one `--{flag}` per declared boolean flag and one `--{name} <value>` per declared option', async () => {
    const program = await buildFixtureProgram();
    const paths = program.commands.find((command) => command.name() === 'paths');
    expect(paths?.options.map((option) => option.flags)).toEqual(['--list']);
    const memoryAdd = program.commands.find((c) => c.name() === 'memory')?.commands.find((c) => c.name() === 'add');
    expect(memoryAdd?.options.map((option) => option.flags)).toEqual(['--type <value>', '--title <value>', '--set <name=value>']);
  });

  it("an unknown noun terminates through commander's own `unknownCommand`, whose SUGGESTED exit code is 1", async () => {
    const program = await buildFixtureProgram();
    const error = await program.parseAsync(['node', 'wingfoil', 'bogus', 'verb']).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    // Commander's raw outcome, with the override this suite installs in place of `buildProgram`'s: the
    // code string and the `1` commander itself suggests. Those are facts about commander v15, and they
    // are exactly the two inputs the contract reads.
    expect(error).toMatchObject({ code: 'commander.unknownCommand', exitCode: 1 });
    // And the contract's answer for that outcome, which is what the CLI actually exits with since
    // task-101-route-commander-parse-errors-through-the-exit-code-contract (`bug-098`): a usage error,
    // exit 2 (spec-005 §1). The real process-level proof is
    // `./commander-parse-exit-codes.integration.test.ts`, which spawns the compiled CLI.
    expect(exitCodeForParseOutcome(error as { code: string; exitCode: number })).toBe(2);
  });
});

describe('buildProgram — action forwarding into `registrar.run` (the wiring bug-007 left unverified)', () => {
  it('forwards the ambient `--format`, the positional list and the declared options of a `<noun> <verb>` command', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'dna', 'set', 'tech_stack.language', '--value', 'python', '--format', 'json']);

    expect(seenContexts).toHaveLength(1);
    expect(seenContexts[0]).toMatchObject({
      moduleName: 'dna',
      operationName: 'dnaSet',
      root: '/fixture-root',
      positional: 'tech_stack.language',
      positionals: ['tech_stack.language'],
      options: { value: 'python' },
    });
    expect(written(stdoutSpy)).toBe(JSON.stringify({ committed: true }) + '\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('honors a global flag placed BEFORE the noun/verb exactly like one placed after it', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', '--format', 'json', 'dna', 'show']);
    expect(written(stdoutSpy)).toBe(JSON.stringify({ hello: 'world' }) + '\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('collapses a declared boolean flag into `ctx.flags` for a flat command (task-028)', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'paths', 'sources', '--list']);
    expect(seenContexts[0]).toMatchObject({
      moduleName: 'paths',
      operationName: 'paths',
      positional: 'sources',
      flags: { list: true },
    });
  });

  it('reports a declared flag that was NOT passed as `false`, never as absent (task-028)', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'paths', 'sources']);
    expect(seenContexts[0]?.flags).toEqual({ list: false });
  });

  it('collapses declared value options into `ctx.options`, omitting the ones not passed (task-020)', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'memory', 'add', '--type', 'task']);
    expect(seenContexts[0]?.options).toEqual({ type: 'task' });
    expect(seenContexts[0]?.flags).toBeUndefined();
  });

  it('collects EVERY occurrence of a repeatable option, in order, as an array (task-110, spec-008 §10)', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync([
      'node', 'wingfoil', 'memory', 'add', '--type', 'release', '--set', 'kind=patch', '--set', 'version=v0.2.3',
    ]);
    expect(seenContexts[0]?.options).toEqual({ type: 'release', set: ['kind=patch', 'version=v0.2.3'] });
  });

  it('keeps last-one-wins for a NON-repeatable option given twice (Commander default, unchanged)', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'memory', 'add', '--type', 'a', '--type', 'b']);
    expect(seenContexts[0]?.options).toEqual({ type: 'b' });
  });

  it('leaves `ctx.options`/`ctx.flags` undefined for a command declaring neither', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'dna', 'show']);
    expect(seenContexts[0]?.options).toBeUndefined();
    expect(seenContexts[0]?.flags).toBeUndefined();
  });

  it('an invalid `--format` value is rejected by the registrar before core runs: exit 2, nothing on stdout', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'dna', 'show', '--format', 'xml']);
    expect(seenContexts).toEqual([]);
    expect(written(stdoutSpy)).toBe('');
    expect(written(stderrSpy)).toBe('error: invalid --format value "xml", expected one of: console, json, yaml\n');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('buildProgram — the special bootstrap commands `init` and `mcp`', () => {
  it('registers `init` with its `--template <name>` option and a description', async () => {
    const program = await buildFixtureProgram();
    const init = program.commands.find((command) => command.name() === 'init');
    expect(init?.options.map((option) => option.flags)).toEqual(['--template <name>']);
    expect(init?.description()).toBe('scaffold .wingfoil/ in the current git repository and commit it');
  });

  it('`init --help` names every registered template in the `--template` description (task-119 AC 2, bug-140)', async () => {
    const program = await buildFixtureProgram();
    const init = program.commands.find((command) => command.name() === 'init');
    const template = init?.options.find((option) => option.flags === '--template <name>');
    expect(template?.description).toBe(
      `methodology template, one of: ${TEMPLATE_NAMES.join(', ')} (required without a terminal or with --no-interactive)`,
    );
    expect(init?.helpInformation()).toContain(TEMPLATE_NAMES.join(', '));
  });

  it('`init --template <name>` drives `runInit` with the resolved root and the ambient global options', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'init', '--template', 'scrum', '--format', 'json']);

    expect(createReadlinePrompt).toHaveBeenCalledTimes(1);
    expect(runInit).toHaveBeenCalledTimes(1);
    expect(jest.mocked(runInit).mock.calls[0]?.[0]).toEqual({ template: 'scrum', interactive: true, format: 'json' });
    expect(jest.mocked(runInit).mock.calls[0]?.[1]).toMatchObject({ root: '/fixture-root' });
  });

  it('`init` outside a WingFoil project emits the resolve-root failure and exits 1 without running the wizard', async () => {
    const program = await buildProgram(FIXTURE_MODULES, {
      resolveRoot: () => {
        throw new Error('E_NO_GIT_ROOT: not inside a git repository');
      },
      buildParams: (ctx) => ({ root: ctx.root }),
    });
    program.exitOverride();
    await program.parseAsync(['node', 'wingfoil', 'init']);

    expect(runInit).not.toHaveBeenCalled();
    expect(written(stderrSpy)).toBe('error: E_NO_GIT_ROOT: not inside a git repository\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('`init` outside a WingFoil project honours `--format json` (task-130, `bug-114`)', async () => {
    const program = await buildProgram(FIXTURE_MODULES, {
      resolveRoot: () => {
        throw new Error('E_NO_GIT_ROOT: not inside a git repository');
      },
      buildParams: (ctx) => ({ root: ctx.root }),
    });
    program.exitOverride();
    await program.parseAsync(['node', 'wingfoil', '--format', 'json', 'init']);

    expect(written(stderrSpy)).toBe(`${JSON.stringify({ error: 'E_NO_GIT_ROOT: not inside a git repository' })}\n`);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('`init` stringifies a non-Error thrown by `resolveRoot` rather than printing `undefined`', async () => {
    const program = await buildProgram(FIXTURE_MODULES, {
      resolveRoot: () => {
        // Deliberately not an `Error`: this is the `String(error)` branch of the init action's handler.
        throw 'not an Error instance';
      },
      buildParams: (ctx) => ({ root: ctx.root }),
    });
    program.exitOverride();
    await program.parseAsync(['node', 'wingfoil', 'init']);

    expect(written(stderrSpy)).toBe('error: not an Error instance\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // bug-179 (task-165): a surplus operand on a bootstrap command gets the shared refusal at exit 2,
  // in the active `--format`, before the root is resolved and without running the command.
  it.each([
    [['init', 'extra'], 'error: wingfoil init takes no positional (got 1 positional)\n'],
    [['--format', 'json', 'mcp', 'a', 'b'], `${JSON.stringify({ error: 'wingfoil mcp takes no positional (got 2 positionals)' })}\n`],
  ])('`wingfoil %j` refuses the surplus operand before resolving the root (bug-179)', async (argv, expected) => {
    const resolveRoot = jest.fn(() => '/fixture-root');
    const program = await buildProgram(FIXTURE_MODULES, { resolveRoot, buildParams: (ctx) => ({ root: ctx.root }) });
    program.exitOverride();
    await program.parseAsync(['node', 'wingfoil', ...argv]);

    expect(written(stderrSpy)).toBe(expected);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolveRoot).not.toHaveBeenCalled();
    expect(runInit).not.toHaveBeenCalled();
    expect(runMcp).not.toHaveBeenCalled();
  });

  it('`mcp` drives `runMcp` with the package version and the validated ambient format', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'mcp', '--format', 'yaml']);
    expect(runMcp).toHaveBeenCalledTimes(1);
    expect(jest.mocked(runMcp).mock.calls[0]?.[0]).toMatchObject({ version: PKG_VERSION, format: 'yaml' });
  });

  it('`mcp` with an unusable `--format` falls back to `console` rather than forwarding garbage', async () => {
    const program = await buildFixtureProgram();
    await program.parseAsync(['node', 'wingfoil', 'mcp', '--format', 'xml']);
    expect(jest.mocked(runMcp).mock.calls[0]?.[0]).toMatchObject({ format: 'console' });
  });
});

describe("buildProgram — the exit callback's own behaviour (task-103, `bug-103`)", () => {
  // These drive `buildProgram`'s REAL `exitOverride` (see `buildFixtureProgramWithRealExitCallback`),
  // which every other test in this file replaces. They are the white-box half of
  // `./missing-verb-exit-code.integration.test.ts`: that suite proves the process really exits 2 and
  // really writes the line, this one proves WHICH line and WHICH code the callback asks for, against a
  // synthetic registry, without spawning anything.

  beforeEach(() => {
    // Replaces the suite-wide no-op `process.exit` spy with one that stops execution, so each
    // invocation terminates exactly once — see `buildFixtureProgramWithRealExitCallback`'s doc for the
    // measured reason. `afterEach`'s `mockRestore` still cleans it up.
    exitSpy.mockImplementation((code?: unknown) => {
      throw new ProcessExited(code);
    });
  });

  it('a noun invoked with no verb asks for exit 2 and writes the error line commander does not', async () => {
    const program = await buildFixtureProgramWithRealExitCallback();
    await parseIgnoringFallout(program, 'dna');
    expect(written(stderrSpy)).toContain('error: missing required argument: wingfoil dna <command>');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('`wingfoil` with no arguments at all is the same case one level up', async () => {
    const program = await buildFixtureProgramWithRealExitCallback();
    await parseIgnoringFallout(program);
    expect(written(stderrSpy)).toContain('error: missing required argument: wingfoil <command>');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('`help <unknown>` gets the unknown-command line, read off the root program\'s own operands', async () => {
    // The operands come from `program.args` — commander's own parse result, global options already
    // removed — so the callback never re-parses argv. `--format json` before the noun proves it: a
    // naive `process.argv.slice(2)` would name `--format` as the unknown command here.
    const program = await buildFixtureProgramWithRealExitCallback();
    // Since task-130 (`bug-114`) the line honours that `--format json`, so it is the JSON object.
    await parseIgnoringFallout(program, '--format', 'json', 'help', 'nosuchnoun');
    expect(written(stderrSpy)).toBe(`${JSON.stringify({ error: "unknown command 'nosuchnoun'" })}\n`);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("a commander refusal under `--format json` is WingFoil's `{error}` object (task-130, `bug-114`)", async () => {
    const program = await buildFixtureProgramWithRealExitCallback();
    await parseIgnoringFallout(program, '--format', 'json', 'dna', 'show', '--bogus');
    expect(written(stderrSpy)).toBe(`${JSON.stringify({ error: "unknown option '--bogus'" })}\n`);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("commander's suggestion becomes `hint`, and the help of an incomplete invocation is not written (task-130)", async () => {
    const program = await buildFixtureProgramWithRealExitCallback();
    await parseIgnoringFallout(program, '--format', 'yaml', 'dnaa');
    expect(written(stderrSpy)).toBe("error: unknown command 'dnaa'\nhint: Did you mean dna?\n");

    stderrSpy.mockClear();
    const incomplete = await buildFixtureProgramWithRealExitCallback();
    await parseIgnoringFallout(incomplete, '--format', 'json', 'dna');
    expect(written(stderrSpy)).toBe(`${JSON.stringify({ error: 'missing required argument: wingfoil dna <command>' })}\n`);
  });

  it('an explicit `help` writes NO error line and asks for exit 0 — the trap, at the callback level', async () => {
    // `help` and `wingfoil dna` reach this callback through the SAME commander code
    // (`commander.help`); only the suggested exit code separates them. If that discriminator is ever
    // weakened, this is the assertion that fails rather than a user discovering `wingfoil help` exits
    // 2.
    const program = await buildFixtureProgramWithRealExitCallback();
    await parseIgnoringFallout(program, 'help');
    expect(written(stderrSpy)).toBe('');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('an error commander DID write a message for gets no second line from the callback', async () => {
    const program = await buildFixtureProgramWithRealExitCallback();
    await parseIgnoringFallout(program, 'nosuchnoun');
    expect(written(stderrSpy)).toContain("error: unknown command 'nosuchnoun'");
    // Exactly one `error: ` line: the callback must not add its own on top of commander's.
    expect(written(stderrSpy).split('error: ').length - 1).toBe(1);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
