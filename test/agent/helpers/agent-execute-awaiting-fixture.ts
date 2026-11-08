/**
 * task-335 — the `agent execute` fixtures of a step that only waits (`dl-171` (c), `spec-016` §3.2 step 1,
 * §3.7 `STEP_AWAITING`) and of a phase that declares `launch:` (`dl-183` Q1 (a), `spec-003` Layer 2), built on
 * the task-235 step fixture (`./agent-execute-step-fixture.ts`: the fake adapter, the `delivery`/`loop`
 * registry, a release and two backlog tasks).
 *
 * The waiting shapes mirror this repository's workflows: {@link GATED} is `dev-loop`'s `start`, `review` and `done` (the review's role
 * `reviewer`, `memory.submit`, `approval: { by_role: approver }`, a `fallback`; then `memory.approve`), its task carried in the gate
 * state `in-review`; {@link SIGNOFF} is an `approval:` phase whose actions move no element through a gate (its
 * approval record is all that is missing, `spec-017` §5.1); {@link OUTREACH} is an `awaits:` phase (§5.4).
 *
 * {@link loopWithLaunch} is the `loop` sub-workflow of the step fixture with `launch: <kind>` on its
 * `implement` phase, laid out as `.wingfoil/workflows/custom/dev-loop.yaml` lays out a phase's keys.
 */
import { commitAll, writeFixtureFile } from '../../storage/helpers/git-fixture';
import { TASK_ID } from './agent-execute-fixture';
import { elementWithStatus, RELEASE_ID, seedStep, startInstance, STEP_WORKFLOWS } from './agent-execute-step-fixture';

/** `dev-loop`'s `start`, `review` and `done`: the reviewer submits, the approver decides; the task waits in `in-review`. */
export const GATED = `name: gated
startable: true
element: task
phases:
  - name: start
    role: developer
    actions:
      - element.set_state(in-progress)
  - name: review
    role: reviewer
    actions:
      - memory.submit
    approval: { by_role: approver }
    fallback: { step: review }
  - name: done
    role: developer
    actions:
      - memory.approve
      - element.set_state(done)
`;

/** An approval no element carries: only the phase's record is missing (P4.14 sc. 4's shape). */
export const SIGNOFF = `name: signoff
startable: true
element: release
phases:
  - name: review
    role: reviewer
    approval: { by_role: approver }
`;

/** A phase that waits for a third party (`spec-017` §5.4). */
export const OUTREACH = `name: outreach
startable: true
element: release
phases:
  - name: announce
    role: developer
    awaits: { party: "the press office", evidence: "press.ack" }
`;

/** The registry of the waiting fixtures: the step fixture's, plus the three waiting workflows. */
export const AWAITING_WORKFLOWS: Readonly<Record<string, string>> = {
  ...STEP_WORKFLOWS,
  'workflows/custom/gated.yaml': GATED,
  'workflows/custom/signoff.yaml': SIGNOFF,
  'workflows/custom/outreach.yaml': OUTREACH,
};

/** Which waiting shape a fixture opens. */
export type AwaitingCase = 'gated' | 'signoff' | 'outreach';

/** The instance id each case opens. */
export const AWAITING_INSTANCE: Readonly<Record<AwaitingCase, string>> = { gated: 'gated-1', signoff: 'signoff-1', outreach: 'outreach-1' };

/**
 * The step fixture with the waiting registry and the instance of `which` open (the only one, so it is the
 * active instance). For `gated` the task then moves `backlog → in-progress → in-review` in two commits, the
 * gate state the approval decides.
 */
export function seedAwaiting(which: AwaitingCase): string {
  const repo = seedStep(undefined, AWAITING_WORKFLOWS);
  if (which !== 'gated') {
    startInstance(repo, AWAITING_INSTANCE[which], which, RELEASE_ID);
    return repo;
  }
  startInstance(repo, AWAITING_INSTANCE.gated, 'gated', TASK_ID);
  // The task reaches the gate state through the verbs' commits after the start, as a dev-loop run does.
  const path = `docs/04_memory/v0.1/${TASK_ID}.md`;
  writeFixtureFile(repo, path, elementWithStatus('task', TASK_ID, 'in-progress', TASK_BODY, 'bug: []\n'));
  commitAll(repo, `wf(task): start ${TASK_ID} [backlog → in-progress]`);
  writeFixtureFile(repo, path, elementWithStatus('task', TASK_ID, 'in-review', TASK_BODY, 'bug: []\n'));
  commitAll(repo, `wf(task): submit ${TASK_ID}`);
  return repo;
}

/** The step fixture's task body (`seedStep`). */
const TASK_BODY = '## Description\n\nOverride the next step.\n\n## Execution Notes';

/** The step fixture's `loop`, its `implement` phase declaring `launch: <kind>` (none when `kind` is `undefined`). */
export function loopWithLaunch(kind: string | undefined): string {
  return `name: loop
includable: true
element: task
phases:
  - name: implement
    role: developer
    mode: resume
${kind === undefined ? '' : `    launch: ${kind}\n`}    actions:
      - element.set_state(in-progress)
      - agent.execute
  - name: review
    role: reviewer
    actions:
      - memory.submit
`;
}

/** The step fixture whose `loop.implement` declares `launch: <kind>`, with the `delivery` instance open. */
export function seedLaunch(kind: string | undefined, tweak: (repo: string) => void = () => undefined): string {
  const repo = seedStep(tweak, { ...STEP_WORKFLOWS, 'workflows/custom/loop.yaml': loopWithLaunch(kind) });
  startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
  return repo;
}
