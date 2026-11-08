/**
 * task-335 AC 6 (red-first) — a step that only waits is refused, in process (`dl-171` (c), `spec-016` §3.2 step 1,
 * §3.7 `STEP_AWAITING`; approver ruling D8 (a)): `refuseWaitingStep(step)` on the three `awaiting` shapes a real
 * deduction gives (`spec-017` §5.1, §5.4) — an approval with a carried element in its gate state, an approval
 * record no element carries, an `awaits:` party — is `CONFLICT` whose message is the line `workflow next`
 * prints for the step (`humanNeededLine`), `details` `{ step, instance, awaiting }`; a step that does not wait
 * passes through. Then `agentExecuteFn`'s step forms on the same fixtures, as dry runs, in the
 * coverage-measured process: refused without `--element`, planned with it (the step keeps its phase and role).
 * The bytes a user sees are `test/cli/agent-execute-awaiting.integration.test.ts`.
 */
import type { AgentExecuteHost, AgentLaunchPlan } from '../../src/agent';
import { refuseWaitingStep } from '../../src/agent/step';
import { agentExecuteFn } from '../../src/core/agent-execute';
import { runAsDryRun } from '../../src/core/dry-run';
import type { CoreResult } from '../../src/core/types';
import { humanNeededLine, workflowNextAtHead, type Step } from '../../src/core/workflow-next';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { AWAITING_INSTANCE, seedAwaiting, seedLaunch, type AwaitingCase } from '../agent/helpers/agent-execute-awaiting-fixture';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import { removeTempDir } from '../storage/helpers/git-fixture';

const HOST: AgentExecuteHost = { mcpServer: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] }, isTerminal: () => false };

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

const CASES: readonly [AwaitingCase, 'approval' | 'party', string][] = [
  // case, details.awaiting, the line `workflow next` prints (copied from a real run, see the task's red notes)
  ['gated', 'approval', `human needed: approve or reject ${TASK_ID} — routed to WingFoil Test <wf-test@example.com>`],
  ['signoff', 'approval', 'human needed: finalize signoff.review@release:minor-1 — routed to WingFoil Test <wf-test@example.com>'],
  [
    'outreach',
    'party',
    'waiting for the press office: press.ack (a phase record completes it: wingfoil workflow finalize outreach-1 --step outreach.announce@release:minor-1)',
  ],
];

const fixtures = new Map<AwaitingCase, string>();
function repoOf(which: AwaitingCase): string {
  let repo = fixtures.get(which);
  if (repo === undefined) {
    repo = seedAwaiting(which);
    repos.push(repo);
    fixtures.set(which, repo);
  }
  return repo;
}

/** The next step of the fixture's only instance, as `workflow next` deduces it. */
function nextStep(repo: string): Step {
  const next = workflowNextAtHead(repo);
  if (!next.ok || next.value.next === null) throw new Error(`no next step: ${JSON.stringify(next)}`);
  return next.value.next;
}

async function dryRun(root: string, params: { next?: boolean; options: Record<string, string> }): Promise<CoreResult<unknown>> {
  const call = () => agentExecuteFn({ root, ...params, host: HOST });
  return withNoticeSink(
    () => undefined,
    () => withWarningSink(() => undefined, () => runAsDryRun(call)),
  );
}

describe('task-335 AC 6 — refuseWaitingStep (spec-016 §3.7 STEP_AWAITING)', () => {
  it.each(CASES)('%s: CONFLICT, the message workflow next prints, details.awaiting %s', (which, awaiting, line) => {
    const step = nextStep(repoOf(which));
    expect(humanNeededLine(step)).toBe(line);
    expect(refuseWaitingStep(step)).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: line, details: { step: step.key, instance: AWAITING_INSTANCE[which], awaiting } },
    });
  }, 60000);

  it('a step that does not wait passes through unchanged', () => {
    const repo = seedLaunch(undefined);
    repos.push(repo);
    const step = nextStep(repo);
    expect(step.awaiting).toBeNull();
    expect(refuseWaitingStep(step)).toEqual({ ok: true, value: step });
  }, 60000);
});

describe('task-335 AC 6 — agentExecuteFn on a waiting step (dry runs, spec-016 §3.2 step 1)', () => {
  it.each(CASES)('%s: --next is refused with the step line; --workflow <instance> and --step <key> alike', async (which, _awaiting, line) => {
    const repo = repoOf(which);
    const key = nextStep(repo).key;
    const forms: { next?: boolean; options: Record<string, string> }[] = [{ next: true, options: {} }, { options: { workflow: AWAITING_INSTANCE[which] } }, { options: { step: key } }];
    for (const params of forms) {
      const outcome = await dryRun(repo, params);
      expect(outcome.ok ? 'ok' : outcome.error).toMatchObject({ code: 'CONFLICT', message: line });
    }
  }, 60000);

  it('gated: with --element the waiting step is an explicit target, planned with its phase and role', async () => {
    const outcome = await dryRun(repoOf('gated'), { next: true, options: { element: TASK_REF } });
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect((outcome.value as AgentLaunchPlan).run).toMatchObject({ element: TASK_REF, workflow: 'gated', phase: 'review', role: 'reviewer' });
  }, 60000);
});
