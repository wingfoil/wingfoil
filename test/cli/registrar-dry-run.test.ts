/**
 * task-210 — the registrar's `--dry-run` seam (`src/cli/registrar.ts`) and `runAsDryRun`
 * (`src/core/dry-run.ts`), in-process on a synthetic registry. The real CLI drive is
 * `test/cli/dry-run.integration.test.ts`; this pins, where coverage sees it: the flag is derived from
 * `mutates` and from nothing else, it never reaches the operation's params, and each of the four ways a
 * dry run can end maps to the result the surface renders.
 */
import { DRY_RUN_FLAG, runAsDryRun } from '../../src/core/dry-run';
import type { CoreModule, ParamsContext } from '../../src/core/registry';
import { coreErr, coreOk, type CoreResult } from '../../src/core/types';
import { buildCliCommands, type CliCommand } from '../../src/cli/registrar';
import { writeAndCommit } from '../../src/storage';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

describe('runAsDryRun', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('a run that reaches its commit becomes a success carrying the plan, and no commit', async () => {
    const result = await runAsDryRun(async () => coreOk(writeAndCommit(repo, [{ path: 'a.md', content: 'a\n' }], 'wf(x): add a'), { sha: 'never', message: 'never' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commit).toBeUndefined();
    expect(result.value).toMatchObject({ dryRun: true, subject: 'wf(x): add a', paths: ['a.md'] });
  });

  it('a refusal is returned unchanged, so the exit code is the refusal\'s', async () => {
    const refusal: CoreResult<never> = coreErr({ code: 'CONFLICT', message: 'already there' });
    await expect(runAsDryRun(async () => refusal)).resolves.toBe(refusal);
  });

  it('a throw is rethrown for the surface to render', async () => {
    await expect(runAsDryRun(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('a success that commits nothing is returned unchanged', async () => {
    const unchanged = coreOk({ already: true });
    await expect(runAsDryRun(async () => unchanged)).resolves.toBe(unchanged);
  });
});

describe('the registrar adds --dry-run to mutating commands only, and keeps it out of the params', () => {
  const seen: ParamsContext[] = [];
  const MODULES: CoreModule[] = [
    {
      name: 'thing',
      operations: {
        thingShow: { name: 'thingShow', mutates: false, fn: async () => coreOk({}) },
        thingSet: { name: 'thingSet', mutates: true, flags: [{ name: 'force', description: 'f' }], fn: async () => coreOk({ set: true }) },
        thingAdd: { name: 'thingAdd', mutates: true, fn: async () => coreOk({ added: true }) },
      },
    },
  ];
  let commands: CliCommand[];
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    seen.length = 0;
    commands = buildCliCommands(MODULES, { resolveRoot: () => '/fixture-root', buildParams: (ctx) => (seen.push(ctx), {}) });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  const command = (verb: string): CliCommand => commands.find((candidate) => candidate.verb === verb) as CliCommand;

  it('derives the flag from mutates: after the operation\'s own flags, and absent on a read', () => {
    expect(command('show').flags).toBeUndefined();
    expect(command('set').flags?.map((flag) => flag.name)).toEqual(['force', DRY_RUN_FLAG.name]);
    expect(command('add').flags?.map((flag) => flag.name)).toEqual([DRY_RUN_FLAG.name]);
  });

  it('passes the operation\'s own flags on, without --dry-run', async () => {
    await command('set').run('json', [], { force: true, [DRY_RUN_FLAG.name]: true });
    await command('add').run('json', [], { [DRY_RUN_FLAG.name]: true });
    await command('add').run('json', [], { [DRY_RUN_FLAG.name]: false });
    expect(seen.map((ctx) => ctx.flags)).toEqual([{ force: true }, undefined, undefined]);
    expect(exitSpy.mock.calls).toEqual([[0], [0], [0]]);
  });
});
