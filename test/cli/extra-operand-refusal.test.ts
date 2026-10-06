/**
 * task-129-refuse-operand-beyond-command-declares-exit-2-before (`bug-171`, `bug-131`) — the registrar
 * refuses every operand beyond the one a command declares (`dl-082-cli-parameter-shape`: at most one
 * positional per command), at exit `2`, naming the command and the count, BEFORE it resolves the
 * project root — so before anything is read, and a fortiori before anything is written.
 *
 * In-process, over fixture modules, so the "before any read" half is observable directly: the
 * `resolveRoot`, `buildParams` and `fn` spies must never be called. The same refusal is driven through
 * the compiled CLI, for every command in `CORE_MODULES`, by `./extra-operand-refusal.integration.test.ts`.
 */
import { buildCliCommands, type CliCommand } from '../../src/cli/registrar';
import type { CoreModule } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';

function find(commands: readonly CliCommand[], noun: string, verb: string): CliCommand {
  const found = commands.find((c) => c.noun === noun && c.verb === verb);
  if (!found) throw new Error(`fixture bug: ${noun} ${verb} not derived`);
  return found;
}

describe('the registrar refuses an operand beyond the declared one, before any read (task-129)', () => {
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let resolveRoot: jest.Mock;
  let buildParams: jest.Mock;
  let fn: jest.Mock;
  let commands: CliCommand[];

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    resolveRoot = jest.fn(() => '/fixture-root');
    buildParams = jest.fn((ctx: { root: string; positionals?: readonly string[] }) => ({ root: ctx.root, positionals: ctx.positionals }));
    fn = jest.fn(async () => coreOk({ done: true }));
    const dnaPath = { name: 'path', required: true, description: 'p', surplusHint: 'the value travels in --value' };
    const modules: CoreModule[] = [
      {
        name: 'memory',
        operations: {
          memoryApprove: { name: 'memoryApprove', mutates: true, positional: { name: 'id', required: true, description: 'the id' }, fn },
        },
      },
      { name: 'workflow', operations: { workflowList: { name: 'workflowList', mutates: false, fn } } },
      { name: 'paths', operations: { paths: { name: 'paths', mutates: false, positional: { name: 'category', description: 'c' }, fn } } },
      {
        name: 'dna',
        operations: {
          dnaSet: { name: 'dnaSet', mutates: true, positional: dnaPath, fn },
        },
      },
    ];
    commands = buildCliCommands(modules, { resolveRoot, buildParams });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  function expectRefusedBeforeAnyRead(message: string): void {
    expect(stderrSpy).toHaveBeenCalledWith(`error: ${message}\n`);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(resolveRoot).not.toHaveBeenCalled();
    expect(buildParams).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
  }

  it('a command declaring one positional, given two: names the command, the positional and the count', async () => {
    await find(commands, 'memory', 'approve').run('console', ['task-1', 'task-2']);
    expectRefusedBeforeAnyRead('wingfoil memory approve takes one positional <id> (got 2 positionals)');
  });

  it('a command declaring none, given one (bug-131): says it takes none, and the count', async () => {
    await find(commands, 'workflow', 'list').run('console', ['sw-life-cycle']);
    expectRefusedBeforeAnyRead('wingfoil workflow list takes no positional (got 1 positional)');
  });

  it('a flat command is named by its noun alone', async () => {
    await find(commands, 'paths', '').run('console', ['sources', 'tests', 'docs']);
    expectRefusedBeforeAnyRead('wingfoil paths takes one positional <category> (got 3 positionals)');
  });

  it('the refusal honours --format, like every other error', async () => {
    await find(commands, 'memory', 'approve').run('json', ['task-1', 'task-2']);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolveRoot).not.toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(JSON.parse(written)).toEqual(expect.objectContaining({ error: expect.anything() }));
    expect(written).toContain('takes one positional <id> (got 2 positionals)');
  });

  it('the declared count or fewer still reaches the operation', async () => {
    await find(commands, 'memory', 'approve').run('console', ['task-1']);
    await find(commands, 'workflow', 'list').run('console', []);
    await find(commands, 'workflow', 'list').run('console');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(exitSpy).not.toHaveBeenCalledWith(2);
  });

  it('a declared surplusHint follows what the command takes, and is refused before any read too (task-179, bug-180)', async () => {
    await find(commands, 'dna', 'set').run('console', ['project.name', 'bogus']);
    expectRefusedBeforeAnyRead('wingfoil dna set takes one positional <path>; the value travels in --value (got 2 positionals)');
  });

  it('a missing required operand: `missing required argument: <id>` and the usage hint, before any read (task-179, bug-168)', async () => {
    await find(commands, 'memory', 'approve').run('console', []);
    expect(stderrSpy).toHaveBeenNthCalledWith(1, 'error: missing required argument: <id>\n');
    expect(stderrSpy).toHaveBeenNthCalledWith(2, 'hint: usage: wingfoil memory approve <id>\n');
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolveRoot).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
  });

  it('an optional positional may be omitted', async () => {
    await find(commands, 'paths', '').run('console', []);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
