/**
 * task-333 — the registrar's `--co-author` seam (`src/cli/registrar.ts`, `spec-018` §1 row 2, §2.5; design D4, D5),
 * in-process on a synthetic registry, where coverage sees it. The real CLI drive is
 * `test/cli/agent-context-refusal.integration.test.ts` (T-3).
 *
 * - derived from `mutates`, and absent on an operation declaring `agentAttribution: false` (`agent execute`, §1.1);
 * - never reaches the operation's params: stripped from `ctx.options` as `--dry-run` is stripped from `ctx.flags`;
 * - handed to the core through `withAgentInvocation`, with `process.env`: `currentAgentInvocation()` inside the
 *   operation reads it;
 * - a blank value is a usage error, exit `2`, before `resolveRoot()`.
 */
import { CO_AUTHOR_OPTION, currentAgentInvocation, type AgentInvocation } from '../../src/core/agent-context';
import type { CoreModule, ParamsContext } from '../../src/core/registry';
import { coreOk } from '../../src/core/types';
import { buildCliCommands, type CliCommand } from '../../src/cli/registrar';

describe('task-333 — the registrar derives --co-author and hands it to the core as the agent invocation', () => {
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

  beforeEach(() => {
    seen.length = 0;
    invocations.length = 0;
    resolved = 0;
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
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  const command = (verb: string): CliCommand => commands.find((candidate) => candidate.verb === verb) as CliCommand;

  it('is derived for a mutating operation, after its own options; absent on a read and on agentAttribution: false', () => {
    // `--ai-model` follows it (task-334, `spec-018` §2.4, design D7).
    expect(command('add').options?.map((option) => option.name)).toEqual(['title', CO_AUTHOR_OPTION.name, 'ai-model']);
    expect(command('show').options).toBeUndefined();
    expect(command('launch').options).toBeUndefined();
  });

  it('never reaches ctx.options, and the operation reads it from currentAgentInvocation() with process.env', async () => {
    await command('add').run('json', [], undefined, { title: 'T', 'co-author': 'Claude' });
    expect(seen[0]?.options).toEqual({ title: 'T' });
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.coAuthor).toBe('Claude');
    expect(invocations[0]?.env).toBe(process.env);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('leaves ctx.options undefined when --co-author was the only option given', async () => {
    await command('add').run('json', [], undefined, { 'co-author': 'Claude' });
    expect(seen[0]?.options).toBeUndefined();
  });

  it('without --co-author the invocation carries none', async () => {
    await command('add').run('json', [], undefined, { title: 'T' });
    expect(invocations[0]?.coAuthor).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(invocations[0], 'coAuthor')).toBe(false);
  });

  it.each(['', '   '])('a blank value (%j) is refused at exit 2 before resolveRoot(), the operation never run', async (value) => {
    await command('add').run('json', [], undefined, { 'co-author': value });
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(resolved).toBe(0);
    expect(invocations).toHaveLength(0);
    expect(stderrSpy.mock.calls.map(([text]) => String(text)).join('')).toContain('invalid flag value: --co-author must not be blank');
  });
});
