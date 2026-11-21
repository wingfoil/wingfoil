/**
 * task-367 AC 8 (`bug-538`, approver ruling D9; characterization) — the blank `--project` refusal (`spec-008` §1),
 * reached in process so coverage instruments it.
 *
 * `bug-538` is that the refusal was proved only by the spawned `test/cli/project-option.integration.test.ts`, which
 * runs `dist/` and so is not measured. Since `task-362` the refusal is raised by `buildProgram` itself, before any
 * root is resolved (the `resolveRoot` the bin entry passes is a plain project-root resolver), so this file drives the
 * public program: a derived `<noun> <verb>` command with `--project '  '` exits `2` with the usage line, and neither
 * the root resolver, the parameter builder nor the operation runs.
 *
 * The expected line is a real run's (`node dist/cli.js memory search --project '  '` at this task's head printed
 * `error: invalid flag value: --project must not be blank` on stderr and exited `2`). The registry is synthetic, as in
 * `./program.test.ts`, so the operation's `fn` is a mock whose calls can be counted; `memory search` and `memory add`
 * mirror the shape of their real registrations (a read with value options, a mutating verb with a required option).
 *
 * Nothing here spawns a process and nothing reads the wall clock (`test/core/latency-budget-placement.test.ts`).
 */
import { buildProgram } from '../../src/cli/program';
import type { CoreModule } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';

const BLANK_PROJECT = 'error: invalid flag value: --project must not be blank\n';

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
  process.exitCode = undefined;
});

/** The text written to that spy across all its calls, concatenated. */
function written(spy: jest.SpyInstance): string {
  return spy.mock.calls.map((call) => String(call[0])).join('');
}

/** Build the program over a synthetic `memory` module, parse `argv`, and hand back every mock it could reach. */
async function run(...argv: string[]) {
  const search = jest.fn(async () => coreOk({ results: [] }));
  const add = jest.fn(async () => coreOk({ id: 'task-001' }));
  const modules: CoreModule[] = [
    {
      name: 'memory',
      operations: {
        memorySearch: { name: 'memorySearch', mutates: false, options: [{ name: 'type' }, { name: 'status' }], fn: search },
        memoryAdd: { name: 'memoryAdd', mutates: true, options: [{ name: 'type', required: true }], fn: add },
      },
    },
  ];
  const resolveRoot = jest.fn((): string => '/fixture-root');
  const buildParams = jest.fn(() => ({ root: '/fixture-root' }));
  const program = await buildProgram(modules, { resolveRoot, buildParams });
  await program.parseAsync(['node', 'wingfoil', ...argv]);
  return { search, add, resolveRoot, buildParams };
}

describe('buildProgram — a blank --project is refused before the command runs (task-367 AC 8, bug-538)', () => {
  it.each([
    ['a read command, the flag after the verb', ['memory', 'search', '--project', '  '], 'search'],
    ['a read command, the flag before the noun', ['--project', '  ', 'memory', 'search'], 'search'],
    ['a mutating command', ['memory', 'add', '--type', 'task', '--project', '  '], 'add'],
  ] as const)('%s: exit 2, the usage line, and the operation not called', async (_label, argv, op) => {
    const mocks = await run(...argv);

    expect(written(stderrSpy)).toBe(BLANK_PROJECT);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(written(stdoutSpy)).toBe('');
    expect(mocks[op]).not.toHaveBeenCalled();
    expect(mocks.resolveRoot).not.toHaveBeenCalled();
    expect(mocks.buildParams).not.toHaveBeenCalled();
  });

  it('the same refusal honours --format json', async () => {
    const mocks = await run('memory', 'search', '--project', '  ', '--format', 'json');

    expect(written(stderrSpy)).toBe(`${JSON.stringify({ error: 'invalid flag value: --project must not be blank' })}\n`);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
