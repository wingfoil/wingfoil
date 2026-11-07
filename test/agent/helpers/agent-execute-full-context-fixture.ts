/**
 * REQ-PERF-01's full-context fixture (task-228 AC 5), shared by `test/agent/agent-execute-latency.test.ts` (the
 * budget, in the opt-in latency pass) and `test/agent/agent-execute-full-context.test.ts` (one run to the spawn,
 * in the parallel pass; task-357, `bug-221`). Moved out of `test/agent/agent-execute-latency.test.ts` unchanged.
 *
 * The fixture holds more relevant Memory than `spec-012` §6's default limits admit (`maxDocs` 40, `maxBytes`
 * 256 KiB): 60 relevant documents of about 7 KiB, so the context builder fills and truncates at its defaults,
 * the largest context the default limits assemble. A run calls `agentExecuteFn` in process, as the CLI's
 * operation, through every pre-launch step — the configuration and the element at `HEAD`, the adapter, the run
 * log, the execution context, and the MCP pre-flight against the compiled build — up to the spawn, where the
 * host's `spawn` ends the run at the instant the agent would start (`spec-016` §3.3 step 14).
 */
import { join } from 'node:path';

import type { AgentExecuteHost } from '../../../src/agent';
import { agentExecuteFn } from '../../../src/core/agent-execute';
import { withNoticeSink, withWarningSink } from '../../../src/validation/warning';
import { writeFixtureFile } from '../../storage/helpers/git-fixture';
import { REPO_ROOT, seed, TASK_REF } from './agent-execute-fixture';

/** What the host's `spawn` throws: the run reached step 14. */
const SPAWN_REACHED = 'the spawn instant (REQ-PERF-01 "agent ready")';

/** The refusal a run that reached the spawn ends with: the fake adapter's command could not be started. */
export const SPAWN_REACHED_MESSAGE = `agent command 'node' could not be started (adapter 'fake'): ${SPAWN_REACHED}`;

const HOST: AgentExecuteHost = {
  mcpServer: { command: process.execPath, args: [join(REPO_ROOT, 'dist', 'cli.js'), 'mcp'] },
  isTerminal: () => false,
  spawn: () => {
    throw new Error(SPAWN_REACHED);
  },
};

/** The number of relevant documents: more than `spec-012` §6's default `maxDocs` (40). */
export const RELEVANT_DOCS = 60;

/** A relevant, non-draft task of about 7 KiB: it shares the subject's tag (`spec-012` §6 T4). */
function relevantDoc(index: number): string {
  const id = `task-${String(500 + index)}-load`;
  const paragraph = `Paragraph ${String(index)} of the load fixture, deterministic text for the context builder. `.repeat(8);
  const body = Array.from({ length: 9 }, () => paragraph).join('\n\n');
  return ['---', `id: ${id}`, 'type: task', `title: "${id}"`, 'release: "v0.1"', 'status: backlog', 'tags: [ context ]', '---', '', '## Description', '', body, ''].join('\n');
}

/** Seed the agent-execute fixture with the {@link RELEVANT_DOCS} relevant documents; returns the repository root. */
export function seedFullContext(): string {
  return seed((root) => {
    for (let index = 0; index < RELEVANT_DOCS; index += 1) {
      writeFixtureFile(root, `docs/04_memory/v0.1/task-${String(500 + index)}-load.md`, relevantDoc(index));
    }
  });
}

/** One run of `agent execute` on the fixture, as the developer, to the spawn: `'ok'` or the refusal's message. */
export async function runToSpawn(repo: string): Promise<string> {
  const result = await withNoticeSink(
    () => undefined,
    () => withWarningSink(() => undefined, () => agentExecuteFn({ root: repo, options: { element: TASK_REF, role: 'developer' }, host: HOST })),
  );
  return result.ok ? 'ok' : result.error.message;
}
