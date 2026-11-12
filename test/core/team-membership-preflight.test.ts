/**
 * task-333 fix round (review finding 1) — the membership step (`dl-220` Q2 (b), `spec-006` §7 "Membership") at each
 * mutating call site, IN PROCESS: the child-process suite `test/cli/team-membership.integration.test.ts` proves the
 * CLI contract, and coverage does not see a child process, so these cases call each registered operation's `fn`
 * directly as a git identity outside the committed team and expect the `E_NOT_A_MEMBER` refusal, nothing written.
 *
 * The sites only the child-process suite reached before: `memory add`, `directive create`, `directive remove`,
 * `workflow start`, `end`, `finalize`, `adopt` (single and `--plan --apply`), `rekey`, `create`, `remove`, and
 * `agent execute` (its step 5). Deterministic: fixed fixtures, fixed identities.
 */
import type { AgentExecuteHost } from '../../src/agent';
import { CORE_MODULES } from '../../src/core';
import { agentExecuteFn } from '../../src/core/agent-execute';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { withWarningSink } from '../../src/validation/warning';
import { seed, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { buildL0Repo, notAMemberRefusal, STRANGER } from './helpers/l0-fixture';

const STRANGER_AS_CONFIGURED = { name: 'WingFoil Test', email: STRANGER.email };

function operation(module: string, name: string): CoreFn<unknown, unknown> {
  const found = CORE_MODULES.find((candidate) => candidate.name === module)?.operations[name];
  if (found === undefined) throw new Error(`fixture bug: ${module}.${name} is not registered`);
  return found.fn as CoreFn<unknown, unknown>;
}

/** Make the repository's configured identity a non-member: the fixture's name, an email no `team.members` entry has. */
function actAsStranger(repo: string): void {
  git(repo, ['config', 'user.email', STRANGER.email]);
}

function expectNotAMember(result: CoreResult<unknown>): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  const { error, hint } = notAMemberRefusal(STRANGER_AS_CONFIGURED);
  expect(result.error).toEqual({ code: 'VALIDATION', message: error, hint });
}

/** Each operation and the params of an invocation that passes its usage checks on {@link buildL0Repo}. */
const CASES: readonly (readonly [string, string, string, (root: string) => Record<string, unknown>])[] = [
  ['memory add', 'memory', 'memoryAdd', (root) => ({ root, options: { type: 'task', title: 'Added by a stranger' } })],
  ['directive create', 'directive', 'directiveCreate', (root) => ({ root, options: { name: 'stranger-rule' } })],
  ['directive remove', 'directive', 'directiveRemove', (root) => ({ root, positional: 'testing' })],
  ['workflow start', 'workflow', 'workflowStart', (root) => ({ root, positional: 'renamed' })],
  ['workflow end', 'workflow', 'workflowEnd', (root) => ({ root, positional: 'rc-1' })],
  ['workflow finalize', 'workflow', 'workflowFinalize', (root) => ({ root, positional: 'rc-1', options: { reason: 'r' } })],
  [
    'workflow adopt (single)',
    'workflow',
    'workflowAdopt',
    (root) => ({ root, positional: 'adoptable-1-plan', options: { step: 'adoptable.seed', element: 'adr:adr-001-adopt-me', reason: 'r' } }),
  ],
  ['workflow adopt --plan --apply', 'workflow', 'workflowAdopt', (root) => ({ root, positional: 'adoptable-1-plan', options: { reason: 'r' }, plan: true, apply: true })],
  [
    'workflow rekey',
    'workflow',
    'workflowRekey',
    (root) => ({ root, positional: 'renamed-1-plan', options: { from: 'renamed.old-name', to: 'renamed.new-name', reason: 'r' } }),
  ],
  ['workflow create', 'workflow', 'workflowCreate', (root) => ({ root, positional: 'stranger-flow', startable: true })],
  ['workflow remove', 'workflow', 'workflowRemove', (root) => ({ root, positional: 'renamed' })],
];

describe('task-333 — every mutating operation refuses a non-member in process (dl-220 Q2 (b), spec-006 §7)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  it.each(CASES)('%s: E_NOT_A_MEMBER, VALIDATION, with its hint; nothing written', async (_label, module, name, params) => {
    const root = buildL0Repo();
    roots.push(root);
    actAsStranger(root);
    const unchanged = snapshotPersistence(root);

    const result = (await operation(module, name)(params(root))) as CoreResult<unknown>;

    expectNotAMember(result);
    assertPersistenceUnchanged(root, unchanged, name);
  });

  it('agent execute: the identity of its step 5 must be a member too (design D3)', async () => {
    const root = seed();
    roots.push(root);
    actAsStranger(root);
    const unchanged = snapshotPersistence(root);
    const host: AgentExecuteHost = { mcpServer: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] }, isTerminal: () => false };

    const result = await withWarningSink(
      () => undefined,
      () => agentExecuteFn({ root, options: { element: TASK_REF, role: 'developer' }, host }),
    );

    expectNotAMember(result as CoreResult<unknown>);
    assertPersistenceUnchanged(root, unchanged, 'agent execute');
  }, 60_000);
});
