/**
 * task-362 (`spec-019` §1, §3.5; design items 3, 5, 7) — the wiring the developer added around the capabilities
 * query, in-process, so its coverage is not left to the spawned CLI suites:
 *
 * - the `src/core` barrel and `src/core/surface-reads.ts` re-export the leaf modules' functions and constants
 *   unchanged;
 * - the `capabilities` operation's `renderConsole` is `renderCapabilitiesConsole`;
 * - `buildProgram`'s `checkProject` step: a blank `--project` exits `2` for `capabilities` (which resolves no root)
 *   and for a project-reading command (before its root is resolved), and a non-blank one is not checked by
 *   `capabilities`.
 */
import { buildProgram } from '../../src/cli/program';
import * as core from '../../src/core';
import * as leaf from '../../src/core/capabilities';
import * as surfaceReads from '../../src/core/surface-reads';
import { readBuildIdentity } from '../../src/storage/build-stamp';

const BLANK = 'error: invalid flag value: --project must not be blank\n';

describe('task-362 — the barrels re-export the capabilities query unchanged', () => {
  it('src/core re-exports the leaf module\'s functions and constants', () => {
    expect(core.buildCapabilitiesDocument).toBe(leaf.buildCapabilitiesDocument);
    expect(core.renderCapabilitiesConsole).toBe(leaf.renderCapabilitiesConsole);
    expect(core.BOOTSTRAP_COMMANDS).toBe(leaf.BOOTSTRAP_COMMANDS);
    expect(core.CAPABILITIES).toBe(leaf.CAPABILITIES);
    expect(core.CAPABILITIES_DOCUMENT_FORMAT).toBe(leaf.CAPABILITIES_DOCUMENT_FORMAT);
    expect(core.RESERVED_CAPABILITY_NAMES).toBe(leaf.RESERVED_CAPABILITY_NAMES);
  });

  it('src/core/surface-reads re-exports readBuildIdentity', () => {
    expect(surfaceReads.readBuildIdentity).toBe(readBuildIdentity);
  });

  it('the capabilities operation renders its console text with renderCapabilitiesConsole', async () => {
    const operation = core.CORE_MODULES.find((module) => module.name === 'capabilities')!.operations.capabilities!;
    const result = await operation.fn({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(operation.renderConsole?.(result.value)).toBe(leaf.renderCapabilitiesConsole(result.value as leaf.CapabilitiesDocument));
  });
});

describe('task-362 — buildProgram\'s checkProject step (spec-008 §1, spec-019 §1)', () => {
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

  const written = (spy: jest.SpyInstance): string => spy.mock.calls.map((call) => String(call[0])).join('');

  async function run(...argv: string[]): Promise<jest.Mock> {
    const resolveRoot = jest.fn((): string => '/fixture-root');
    const program = await buildProgram(core.CORE_MODULES, { resolveRoot, buildParams: () => ({}) });
    await program.parseAsync(['node', 'wingfoil', ...argv]);
    return resolveRoot;
  }

  it('capabilities with a blank --project exits 2 with the refusal, and resolves no root', async () => {
    const resolveRoot = await run('--project', ' ', 'capabilities');
    expect(written(stderrSpy)).toBe(BLANK);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolveRoot).not.toHaveBeenCalled();
    expect(written(stdoutSpy)).toBe('');
  });

  it('capabilities with a non-blank --project is not checked: exit 0, no root resolved', async () => {
    const resolveRoot = await run('--project', '/nonexistent', 'capabilities', '--format', 'json');
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(resolveRoot).not.toHaveBeenCalled();
    expect(JSON.parse(written(stdoutSpy)).commands).toContain('capabilities');
  });

  it('a project-reading command with a blank --project exits 2 before its root is resolved', async () => {
    const resolveRoot = await run('--project', '', 'paths');
    expect(written(stderrSpy)).toBe(BLANK);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolveRoot).not.toHaveBeenCalled();
  });

  it('without --project a project-reading command resolves the root once, given no value', async () => {
    const resolveRoot = await run('paths');
    expect(resolveRoot).toHaveBeenCalledTimes(1);
    expect(resolveRoot).toHaveBeenCalledWith(undefined);
  });
});
