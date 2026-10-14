/**
 * task-237 — `mcp.via: config-arg` in the pre-launch pipeline, in process (`spec-016` §2.3, pending
 * amendment; approver ruling D-1 (a), 2026-10-14). The CLI integration test
 * (`test/cli/agent-execute-config-arg.integration.test.ts`) runs the compiled build in a child process,
 * which coverage does not see; this pins the same hand-over in process: the prepared launch carries the
 * rendered `mcp.template` as `mcpConfig` and declares no temporary file, and under `config-file` it
 * carries none.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { agentExecutePipeline, renderMcpTemplate, type AgentExecuteHost, type PreparedLaunch } from '../../src/agent';
import { coreOk } from '../../src/core/types';
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
    expect(prepared.mcpConfig).toBe(renderMcpTemplate(prepared.adapter.manifest.mcp.template!, HOST.mcpServer!));
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
