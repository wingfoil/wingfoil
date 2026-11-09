/**
 * task-237 — `mcp.via: config-arg` in the pre-launch pipeline, in process (`spec-016` §2.3, pending
 * amendment; approver ruling D-1 (a), 2026-10-14). The CLI integration test
 * (`test/cli/agent-execute-config-arg.integration.test.ts`) runs the compiled build in a child process,
 * which coverage does not see; this pins the same hand-over in process: the prepared launch carries the
 * rendered `mcp.template` as `mcpConfig` and declares no temporary file, and under `config-file` it
 * carries none.
 *
 * task-355 AC 3 (red-first, `bug-371`; approver ruling D3 (a)): an MCP server argument holding an unpaired
 * surrogate is refused at step 10, before the pre-flight starts anything, with `renderMcpTemplate`'s
 * `VALIDATION` — under `config-arg` and `config-file` alike, and on a dry run as on a launch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { agentExecutePipeline, renderMcpTemplate, type AgentExecuteHost, type PreparedLaunch } from '../../src/agent';
import { coreOk, type CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { AGENTS_FIXTURES, DNA_YAML, seed, TASK_ID } from './helpers/agent-execute-fixture';

const ADAPTER = 'fake-config-arg';
const HOST: AgentExecuteHost = { mcpServer: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] }, isTerminal: () => true };

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

/** The pipeline up to the spawn; the launch callback only captures what it was handed. */
async function prepare(root: string): Promise<PreparedLaunch> {
  let prepared: PreparedLaunch | undefined;
  const result = await withNoticeSink(
    () => undefined,
    () =>
      withWarningSink(
        () => undefined,
        () =>
          agentExecutePipeline(root, { element: { type: 'task', id: TASK_ID }, role: 'developer' }, HOST, async (launch) => {
            prepared = launch;
            return coreOk(undefined);
          }),
      ),
  );
  expect(result).toEqual({ ok: true, value: undefined });
  return prepared!;
}

describe('agentExecutePipeline — mcp.via: config-arg (task-237)', () => {
  it('hands the launch the rendered template as mcpConfig, and no temporary MCP file', async () => {
    const template = readFileSync(join(AGENTS_FIXTURES, 'config-arg', `${ADAPTER}.yaml`), 'utf-8');
    const repo = seed((root) => {
      writeFixtureFile(root, `.wingfoil/agents/custom/${ADAPTER}.yaml`, template);
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('      adapter: fake\n', `      adapter: ${ADAPTER}\n`));
    });
    repos.push(repo);
    const prepared = await prepare(repo);
    expect(prepared.adapter.manifest.mcp.via).toBe('config-arg');
    expect(renderMcpTemplate(prepared.adapter.manifest.mcp.template!, HOST.mcpServer!)).toEqual({ ok: true, value: prepared.mcpConfig });
    expect(prepared.files).toEqual({});
  }, 60000);

  it('under mcp.via: config-file the launch gets the file and no mcpConfig', async () => {
    const repo = seed();
    repos.push(repo);
    const prepared = await prepare(repo);
    expect(prepared.mcpConfig).toBeUndefined();
    expect(Object.keys(prepared.files)).toEqual(['mcp_config_file']);
  }, 60000);
});

describe("task-355 AC 3 — an MCP server argument mcp.template cannot carry is refused at step 10 (bug-371, spec-016 §3.7)", () => {
  const BAD_HOST: AgentExecuteHost = { ...HOST, mcpServer: { command: process.execPath, args: ['/x\ud800/cli.js', 'mcp'] } };

  /** The pipeline with {@link BAD_HOST}; the launch callback records that it was reached. */
  async function refused(root: string, dryRun: boolean): Promise<{ result: CoreResult<undefined>; launched: boolean }> {
    let launched = false;
    const result = await withNoticeSink(
      () => undefined,
      () =>
        withWarningSink(
          () => undefined,
          () =>
            agentExecutePipeline(root, { element: { type: 'task', id: TASK_ID }, role: 'developer', dryRun }, BAD_HOST, async () => {
              launched = true;
              return coreOk(undefined);
            }),
        ),
    );
    return { result, launched };
  }

  const configArg = (): string =>
    seed((root) => {
      writeFixtureFile(root, `.wingfoil/agents/custom/${ADAPTER}.yaml`, readFileSync(join(AGENTS_FIXTURES, 'config-arg', `${ADAPTER}.yaml`), 'utf-8'));
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('      adapter: fake\n', `      adapter: ${ADAPTER}\n`));
    });

  it.each<[string, boolean, () => string]>([
    ['config-arg', false, configArg],
    ['config-arg', true, configArg],
    ['config-file', false, () => seed()],
    ['config-file', true, () => seed()],
  ])('mcp.via: %s, dry run %s: VALIDATION naming argument 1 and U+D800; nothing launched', async (_via, dryRun, make) => {
    const repo = make();
    repos.push(repo);
    const { result, launched } = await refused(repo, dryRun);
    expect(result).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: "mcp.template cannot carry the MCP server's argument 1: it holds an unpaired surrogate (U+D800)" },
    });
    expect(launched).toBe(false);
  }, 60000);
});
