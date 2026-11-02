/**
 * task-330 (`bug-340`; `spec-016` §3.7, `spec-017` §10, approver ruling D3 of the design gate) — the three
 * out-of-frontier `--step` refusals carry `details.frontier`, the frontier's step keys in frontier order, and
 * their message text is unchanged:
 *
 * - `memory add --workflow --step` (`resolveAddLink`) and `agent execute --step` (`selectFrontierStep`, in
 *   `test/core/agent-execute-step.test.ts` over synthetic inputs, and here over a real deduction): red-first,
 *   they keep `{ instance, step }` / `{ step, instance }` and gain `frontier`;
 * - `workflow finalize` (`workflowFinalizeAtHead`) already carries `{ frontier }` since task-226: characterization.
 *
 * The CLI drops `details` (bug-303), so the observable is the `CoreResult` of the core functions. The fixture is
 * the step fixture's `delivery-1`: two parallel `loop.implement` steps. The keys below are the `next.key` and
 * `more[0].key` of `wingfoil workflow next --format json` on this very tree (the fixture started with
 * `startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID)`).
 */
import { selectFrontierStep } from '../../src/agent/step';
import { deduceWorkflowStateAtHead } from '../../src/core';
import { resolveAddLink } from '../../src/core/memory-add-link';
import { workflowFinalizeAtHead } from '../../src/core/workflow-finalize';
import { TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { RELEASE_ID, seedStep, SIBLING_ID, startInstance } from '../agent/helpers/agent-execute-step-fixture';
import { removeTempDir } from '../storage/helpers/git-fixture';

const FIRST_KEY = `loop.implement@task:${TASK_ID}`;
const SECOND_KEY = `loop.implement@task:${SIBLING_ID}`;
const OFF = 'loop.review@task:nope';
const MESSAGE = `step '${OFF}' is not on the frontier of delivery-1`;

describe('task-330 — out-of-frontier --step rejections list the frontier (bug-340)', () => {
  let repo: string;

  beforeAll(() => {
    repo = seedStep();
    startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
  });

  afterAll(() => removeTempDir(repo));

  it('the fixture’s frontier is the two parallel implement steps, in this order (the keys the assertions below name)', () => {
    const deduced = deduceWorkflowStateAtHead(repo).instances.find((entry) => entry.instance.id === 'delivery-1');
    expect(deduced?.frontier.map((step) => step.key)).toEqual([FIRST_KEY, SECOND_KEY]);
  });

  it('memory add --workflow --step off the frontier: CONFLICT, message unchanged, details gain frontier', () => {
    const result = resolveAddLink(repo, 'delivery-1', OFF, 'task');
    expect(result).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: MESSAGE, details: { instance: 'delivery-1', step: OFF, frontier: [FIRST_KEY, SECOND_KEY] } },
    });
    expect(result.ok ? '' : result.error.message).toBe(MESSAGE);
  });

  it('workflow finalize --step off the frontier: details.frontier (characterization, passes before the change)', () => {
    const result = workflowFinalizeAtHead(repo, { ref: 'delivery-1', step: OFF });
    expect(result).toEqual({ ok: false, error: { code: 'CONFLICT', message: MESSAGE, details: { frontier: [FIRST_KEY, SECOND_KEY] } } });
  });

  it('agent execute --step (selectFrontierStep) over the same deduction: details keep step and instance, and gain frontier', () => {
    const deduced = deduceWorkflowStateAtHead(repo).instances.find((entry) => entry.instance.id === 'delivery-1')!;
    const [next, ...more] = deduced.frontier;
    const result = selectFrontierStep(
      { baseline: { rev: 'HEAD', commit: deduced.instance.startCommit }, instance: deduced.instance, complete: false, next: next!, more, diagnostics: [] } as never,
      OFF,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: MESSAGE, details: { step: OFF, instance: 'delivery-1', frontier: [FIRST_KEY, SECOND_KEY] } },
    });
  });
});
