/**
 * task-334 AC 3 (the registrar half) (`src/cli/registrar.ts`, `spec-018` §2.4, §2.6; design "src/cli/registrar.ts",
 * D4, D7) — the `--ai-model <id>` option, in-process on a synthetic registry, where coverage sees it. The real CLI drive
 * is `test/cli/agent-attribution.integration.test.ts`.
 *
 * - derived exactly as `--co-author` (D7): on every `mutates: true` operation, after `--co-author`; absent on a read and
 *   on an operation declaring `agentAttribution: false` (`agent execute`, `spec-018` §1.1);
 * - never reaches the operation's params (stripped from `ctx.options` as `--co-author` is); handed to the core through
 *   `withAgentInvocation`: `currentAgentInvocation().aiModel`;
 * - its usage checks, exit `2`, before `resolveRoot()`, after the blank `--co-author` check: blank (D4), one line (no
 *   control character, tab included, D4), then the combination (no `--co-author` and no environment marker), then a
 *   multi-line `WINGFOIL_AGENT_MODEL` when `--ai-model` is absent and a marker is present (D4).
 *
 * The suite's own environment carries no marker (`test/global-setup.cjs` scrubs them); a case that needs an
 * environment marker sets it on this worker's `process.env` and restores it after. The option is named by its
 * spelling, `ai-model` (`spec-018` §2.4), not by an export. Red until green: the option is not derived today, so
 * `--ai-model` is ignored and every refusal case exits `0`.
 */
import { CO_AUTHOR_OPTION, currentAgentInvocation, type AgentInvocation } from '../../src/core/agent-context';
import type { CoreModule, ParamsContext } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';
import { buildCliCommands, type CliCommand } from '../../src/cli/registrar';

const AI_MODEL = 'ai-model';
const COMBINATION = 'invalid flag combination: --ai-model needs an agent context (--co-author, or a session an agent started)';
const ONE_LINE = 'invalid flag value: --ai-model must be one line';
const BLANK = 'invalid flag value: --ai-model must not be blank';
const ENV_ONE_LINE = 'invalid environment value: WINGFOIL_AGENT_MODEL must be one line';

describe('task-334 — the registrar derives --ai-model beside --co-author and hands it to the core', () => {
  const seen: ParamsContext[] = [];
  const invocations: AgentInvocation[] = [];
  const MODULES: CoreModule[] = [
    {
      name: 'thing',
      operations: {
        thingShow: { name: 'thingShow', mutates: false, fn: async () => coreOk({}) },
        thingAdd: {
          name: 'thingAdd',
          mutates: true,
          options: [{ name: 'title' }],
          fn: async () => {
            invocations.push(currentAgentInvocation());
            return coreOk({ added: true });
          },
        },
        thingLaunch: { name: 'thingLaunch', mutates: true, agentAttribution: false, fn: async () => coreOk({}) },
      },
    },
  ];
  let commands: CliCommand[];
  let resolved: number;
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  const saved: Record<string, string | undefined> = {};
  const ENV_KEYS = ['WINGFOIL_AGENT', 'WINGFOIL_AGENT_MODEL'] as const;

  beforeEach(() => {
    seen.length = 0;
    invocations.length = 0;
    resolved = 0;
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    commands = buildCliCommands(MODULES, {
      resolveRoot: () => {
        resolved += 1;
        return '/fixture-root';
      },
      buildParams: (ctx) => (seen.push(ctx), {}),
    });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  const command = (verb: string): CliCommand => commands.find((candidate) => candidate.verb === verb) as CliCommand;
  const stderr = (): string => stderrSpy.mock.calls.map(([text]) => String(text)).join('');

  it('is derived after --co-author on a mutating operation; absent on a read and on agentAttribution: false', () => {
    expect(command('add').options?.map((option) => option.name)).toEqual(['title', CO_AUTHOR_OPTION.name, AI_MODEL]);
    expect(command('add').options?.find((option) => option.name === AI_MODEL)?.valueName).toBe('id');
    expect(command('show').options).toBeUndefined();
    expect(command('launch').options).toBeUndefined();
  });

  it('never reaches ctx.options; the operation reads it from currentAgentInvocation().aiModel', async () => {
    await command('add').run('json', [], undefined, { title: 'T', 'co-author': 'Claude', [AI_MODEL]: 'm-1' });
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(seen[0]?.options).toEqual({ title: 'T' });
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.coAuthor).toBe('Claude');
    expect(invocations[0]?.aiModel).toBe('m-1');
  });

  it('an environment marker is an agent context for --ai-model too (WINGFOIL_AGENT set, no --co-author)', async () => {
    process.env.WINGFOIL_AGENT = 'Claude';
    await command('add').run('json', [], undefined, { [AI_MODEL]: 'm-1' });
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(invocations[0]?.aiModel).toBe('m-1');
    expect(seen[0]?.options).toBeUndefined();
  });

  it('without --ai-model the invocation carries no aiModel key', async () => {
    await command('add').run('json', [], undefined, { title: 'T' });
    expect(Object.prototype.hasOwnProperty.call(invocations[0], 'aiModel')).toBe(false);
  });

  it('--ai-model with no agent context: exit 2, the combination refusal, before resolveRoot(), the operation never run (T-21)', async () => {
    await command('add').run('json', [], undefined, { [AI_MODEL]: 'm-1' });
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolved).toBe(0);
    expect(invocations).toHaveLength(0);
    expect(stderr()).toContain(COMBINATION);
  });

  it.each([
    ['a newline', 'a\nb'],
    ['a carriage return', 'a\rb'],
    ['a tab (D4)', 'a\tb'],
    ['U+2028', 'a\u2028b'],
  ])('--ai-model carrying %s, with --co-author: exit 2, "must be one line", before resolveRoot()', async (_label, value) => {
    await command('add').run('json', [], undefined, { 'co-author': 'Claude', [AI_MODEL]: value });
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolved).toBe(0);
    expect(invocations).toHaveLength(0);
    expect(stderr()).toContain(ONE_LINE);
  });

  it.each(['', '   '])('a blank --ai-model (%j), with --co-author: exit 2, "must not be blank" (D4)', async (value) => {
    await command('add').run('json', [], undefined, { 'co-author': 'Claude', [AI_MODEL]: value });
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolved).toBe(0);
    expect(stderr()).toContain(BLANK);
  });

  it('a blank --co-author is reported before any --ai-model check', async () => {
    await command('add').run('json', [], undefined, { 'co-author': ' ', [AI_MODEL]: 'a\nb' });
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderr()).toContain('invalid flag value: --co-author must not be blank');
    expect(stderr()).not.toContain(ONE_LINE);
  });

  it('a multi-line WINGFOIL_AGENT_MODEL with a marker and no --ai-model: exit 2, the environment refusal, before resolveRoot() (D4)', async () => {
    process.env.WINGFOIL_AGENT = 'Claude';
    process.env.WINGFOIL_AGENT_MODEL = 'a\nb';
    await command('add').run('json', [], undefined, { title: 'T' });
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolved).toBe(0);
    expect(invocations).toHaveLength(0);
    expect(stderr()).toContain(ENV_ONE_LINE);
  });

  it('control: a multi-line WINGFOIL_AGENT_MODEL with no marker is not read (exit 0)', async () => {
    process.env.WINGFOIL_AGENT_MODEL = 'a\nb';
    await command('add').run('json', [], undefined, { title: 'T' });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
