/**
 * CLI dispatch of the first mutating op's two new seam concerns (task-025-implement-dna-set):
 *
 *  1. A core op that throws a `UsageError` must terminate through the SAME single spec-005 §1 exit path
 *     as every other outcome, but at exit **2** (usage/argument error) with the error's clean message —
 *     not the blanket exit 1 the catch used before this task. This is what surfaces `dna set`'s
 *     invalid-key-path case (AC(c)) as exit 2.
 *  2. `dna set <key> <value>` needs TWO data inputs, so the generic CLI seam is extended additively with
 *     `ParamsContext.positionals` (the full positional list); `positional` is kept as `positionals[0]`
 *     so `dna show [section]` / `paths [category]` are untouched. task-020's `memory add` reuses it.
 *
 * Both are exercised generically (a fixture module), not tied to `dnaSet` itself — the same mechanism
 * every future mutating op inherits.
 */
import { buildCliCommands, type CliCommand } from '../../src/cli/registrar';
import type { CoreModule } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';

function find(commands: readonly CliCommand[], noun: string, verb: string): CliCommand {
  const found = commands.find((c) => c.noun === noun && c.verb === verb);
  if (!found) throw new Error(`fixture bug: ${noun} ${verb} not derived`);
  return found;
}

describe('CLI dispatch — UsageError -> exit 2 (task-025)', () => {
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

  it('a core fn throwing a UsageError emits its clean message and exits 2, never touching stdout', async () => {
    const modules: CoreModule[] = [
      {
        name: 'dna',
        operations: {
          dnaSet: {
            name: 'dnaSet',
            mutates: true,
            positional: { name: 'path', required: true, description: 'p' },
            fn: async () => {
              throw new UsageError("invalid key path: '..language'");
            },
          },
        },
      },
    ];
    const commands = buildCliCommands(modules, {
      resolveRoot: () => '/fixture-root',
      buildParams: (ctx) => ({ root: ctx.root, positionals: ctx.positionals }),
    });
    await find(commands, 'dna', 'set').run('console', ['..language']);
    expect(stderrSpy).toHaveBeenCalledWith("error: invalid key path: '..language'\n");
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('the positional list reaches buildParams as ctx.positionals, with ctx.positional == positionals[0]', async () => {
    let seen: unknown;
    const modules: CoreModule[] = [
      {
        name: 'dna',
        operations: {
          dnaSet: {
            name: 'dnaSet',
            mutates: true,
            positional: { name: 'path', required: true, description: 'p' },
            fn: async (p) => coreOk(p),
          },
        },
      },
    ];
    const commands = buildCliCommands(modules, {
      resolveRoot: () => '/fixture-root',
      buildParams: (ctx) => {
        seen = { positional: ctx.positional, positionals: ctx.positionals };
        return seen;
      },
    });
    // Since task-179 (`bug-180`) the registrar refuses a surplus for every command, so the list carries
    // at most the one declared operand.
    await find(commands, 'dna', 'set').run('json', ['tech_stack.language']);
    expect(seen).toEqual({ positional: 'tech_stack.language', positionals: ['tech_stack.language'] });
  });
});
