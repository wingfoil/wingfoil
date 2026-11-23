/**
 * task-380 (green) — in process, the help command's path ends at the first option token (`bug-452`, `spec-008` §8):
 * the exit callback of `buildProgram` over `CORE_MODULES` answers `wingfoil help memory add --bogus` with `memory add`'s
 * help at exit 0, as `wingfoil memory add --help` does, never with `error: unknown command '--bogus'`. The compiled CLI
 * half is `help-path-option-token.integration.test.ts`; this half is what the coverage run sees.
 *
 * `process.exit` throws so execution stops where the real process ends (as `program.test.ts` does): Commander keeps
 * running after a callback that returns.
 *
 * Unasserted here (T1): the path walk itself (`help-command-path.integration.test.ts`, `program.test.ts`).
 */
import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';

class ProcessExited extends Error {
  constructor(readonly code: unknown) {
    super(`process.exit(${String(code)})`);
  }
}

let exitSpy: jest.SpyInstance;
let stdoutSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance;

beforeEach(() => {
  exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ProcessExited(code);
  });
  stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  exitSpy.mockRestore();
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

const written = (spy: jest.SpyInstance): string => spy.mock.calls.map((call) => String(call[0])).join('');

async function run(...argv: readonly string[]): Promise<{ code: unknown; stdout: string; stderr: string }> {
  const program = await buildProgram(CORE_MODULES, { resolveRoot: () => '/unused', buildParams: () => ({}) });
  let code: unknown;
  try {
    await program.parseAsync(['node', 'wingfoil', ...argv]);
  } catch (error) {
    if (!(error instanceof ProcessExited)) throw error;
    code = error.code;
  }
  const result = { code, stdout: written(stdoutSpy), stderr: written(stderrSpy) };
  stdoutSpy.mockClear();
  stderrSpy.mockClear();
  return result;
}

describe('task-380 — an option token ends the help command path (in process)', () => {
  it('`help memory add --bogus` prints what `memory add --help` prints, at exit 0', async () => {
    const direct = await run('memory', 'add', '--help');
    expect(direct.code).toBe(0);
    expect(direct.stdout.split('\n')[0]).toMatch(/^Usage: wingfoil memory add /);
    expect(await run('help', 'memory', 'add', '--bogus')).toEqual({ code: 0, stdout: direct.stdout, stderr: '' });
  });
});
