/**
 * task-330 (`bug-339`; `spec-016` §3.3 step 2) — in process, the coverage-measured counterpart of
 * `test/cli/agent-execute-diagnostics.integration.test.ts`: `agentExecuteFn --next` as a dry run on the step
 * fixture with an uncommitted edit to a deduction input reports the deduction's `W_UNCOMMITTED_INPUTS`
 * diagnostic through the warning sink, before any other warning. The text is the line
 * `wingfoil workflow next --format json` carried as that diagnostic's `message` on this tree.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentExecuteHost, AgentLaunchPlan } from '../../src/agent';
import { agentExecuteFn } from '../../src/core/agent-execute';
import { runAsDryRun } from '../../src/core/dry-run';
import type { CoreResult } from '../../src/core/types';
import { withWarningSink } from '../../src/validation/warning';
import { RELEASE_ID, seedStep, SIBLING_ID, startInstance } from '../agent/helpers/agent-execute-step-fixture';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import { removeTempDir } from '../storage/helpers/git-fixture';

const HOST: AgentExecuteHost = { mcpServer: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] }, isTerminal: () => false };
const DIRTY_FILE = `docs/04_memory/v0.1/${SIBLING_ID}.md`;

describe('task-330 — agentExecuteFn reports the deduction’s diagnostics (bug-339, in process)', () => {
  let repo: string;
  beforeAll(() => {
    repo = seedStep();
    startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
    appendFileSync(join(repo, DIRTY_FILE), 'an edit the deduction does not read\n');
  });
  afterAll(() => removeTempDir(repo));

  it('--next on a tree with an uncommitted deduction input: the first warning is W_UNCOMMITTED_INPUTS', async () => {
    const warnings: string[] = [];
    const result = (await withWarningSink(
      (text) => warnings.push(text),
      () => runAsDryRun(() => agentExecuteFn({ root: repo, host: HOST, next: true })),
    )) as CoreResult<AgentLaunchPlan>;
    expect(result.ok).toBe(true);
    expect(warnings[0]).toBe(`W_UNCOMMITTED_INPUTS (${DIRTY_FILE}): uncommitted change to a deduction input, not read (the answer is computed from HEAD): ${DIRTY_FILE}`);
  }, 60000);
});
