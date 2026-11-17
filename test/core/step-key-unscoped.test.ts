/**
 * task-356 AC 3 (red-first, `bug-468`; `spec-017` §4.9, §7.9–§7.11 and §10, `spec-016` §3.2 step 1, as amended at
 * the design gate; approver rulings D4 (a), D5) — a `--step` key given without its scope, at each of the four sites
 * that take one: `memory add --workflow --step` (`resolveAddLink`), `workflow finalize --step`
 * (`workflowFinalizeAtHead`), `workflow adopt --step` (`workflowAdoptAtHead`) and `agent execute --step`
 * (`selectFrontierStep`).
 *
 * - one frontier step of that workflow and phase → it resolves to the step's full key: the add's link (its
 *   `WingFoil-Step:` trailer), the finalize record's subject, the adoption record's subject, `Step.key`;
 * - two → `CONFLICT` `step '<key>' names 2 steps of <instance>: give --step, one of: <k1>, <k2>`, `details`
 *   `{ step, instance, steps }`, nothing committed;
 * - none → each site's out-of-frontier refusal, its `details` unchanged (`test/core/step-refusal-frontier.test.ts`
 *   keeps pinning them for a scoped key); a scoped key off the frontier stays that refusal even when its unscoped
 *   part names a frontier step.
 *
 * The fixture is the `agent execute` step fixture (`test/agent/helpers/agent-execute-step-fixture.ts`) with a
 * registry of its own, each workflow the shape of the step fixture's `delivery`/`loop`: `delivery` iterates `loop`
 * over the release's `backlog` tasks, whose first phase `implement` adds a `bug` (so `memory add` and `adopt` have
 * a step to link to); `checks` iterates `gate` over the same tasks, whose only phase `confirm` is a checkpoint (so
 * `finalize` has a step a record completes). With both tasks in `backlog` each instance's frontier holds two steps
 * of one phase (`many`); with the sibling task in `draft`, one (`one`). The frontier keys are the ones the first
 * test of each describe reads back from the deduction.
 */
import { selectFrontierStep } from '../../src/agent/step';
import { deduceWorkflowStateAtHead } from '../../src/core';
import { addLinkTrailers, resolveAddLink } from '../../src/core/memory-add-link';
import { workflowAdoptAtHead } from '../../src/core/workflow-adopt';
import { workflowFinalizeAtHead } from '../../src/core/workflow-finalize';
import type { CoreResult } from '../../src/core/types';
import { BUG_ID, TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { elementWithStatus, RELEASE_ID, seedStep, SIBLING_ID, startInstance } from '../agent/helpers/agent-execute-step-fixture';
import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DELIVERY = `name: delivery
startable: true
element: release
description: "Deliver one release"
phases:
  - name: build
    iterate_over: task
    where: { status: [ backlog ] }
    include: loop
`;

const LOOP = `name: loop
includable: true
element: task
phases:
  - name: implement
    role: developer
    actions:
      - 'memory.add(type: bug)'
  - name: review
    role: reviewer
    actions:
      - memory.submit
`;

const CHECKS = `name: checks
startable: true
element: release
phases:
  - name: each
    iterate_over: task
    where: { status: [ backlog ] }
    include: gate
`;

const GATE = `name: gate
includable: true
element: task
phases:
  - name: confirm
    role: developer
`;

const WORKFLOWS: Readonly<Record<string, string>> = {
  'workflows/custom/delivery.yaml': DELIVERY,
  'workflows/custom/loop.yaml': LOOP,
  'workflows/custom/checks.yaml': CHECKS,
  'workflows/custom/gate.yaml': GATE,
};

const IMPLEMENT = 'loop.implement';
const IMPLEMENT_FIRST = `${IMPLEMENT}@task:${TASK_ID}`;
const IMPLEMENT_SECOND = `${IMPLEMENT}@task:${SIBLING_ID}`;
const CONFIRM = 'gate.confirm';
const CONFIRM_FIRST = `${CONFIRM}@task:${TASK_ID}`;
const CONFIRM_SECOND = `${CONFIRM}@task:${SIBLING_ID}`;
const REASON = 'Created by hand before the engine linked it.';

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

/**
 * The fixture with `delivery-1` and `checks-1` open; `oneTask` puts the sibling task in `draft`, so each frontier
 * holds the first task's step only.
 */
function fixture(oneTask: boolean): string {
  const repo = seedStep((root) => {
    if (oneTask) {
      writeFixtureFile(root, `docs/04_memory/v0.1/${SIBLING_ID}.md`, elementWithStatus('task', SIBLING_ID, 'draft', '## Description\n\nA sibling.\n\n## Execution Notes', 'bug: []\n'));
    }
  }, WORKFLOWS);
  startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
  startInstance(repo, 'checks-1', 'checks', RELEASE_ID);
  repos.push(repo);
  return repo;
}

const commits = (repo: string): string => git(repo, ['rev-list', '--count', 'HEAD']).trim();
const subject = (repo: string): string => git(repo, ['log', '-1', '--format=%s']).trim();

function frontierKeys(repo: string, instance: string): string[] {
  return deduceWorkflowStateAtHead(repo).instances.find((entry) => entry.instance.id === instance)?.frontier.map((step) => step.key) ?? [];
}

/** `selectFrontierStep` over the deduction of `instance` at `HEAD` (the shape `step-refusal-frontier.test.ts` builds). */
function select(repo: string, instance: string, key: string): CoreResult<{ key: string }> {
  const deduced = deduceWorkflowStateAtHead(repo).instances.find((entry) => entry.instance.id === instance)!;
  const [next, ...more] = deduced.frontier;
  return selectFrontierStep(
    { baseline: { rev: 'HEAD', commit: deduced.instance.startCommit }, instance: deduced.instance, complete: false, next: next!, more, diagnostics: [] } as never,
    key,
  );
}

/** `workflow adopt <instance> --step <key> --element bug:<BUG_ID> --reason …`, in process. */
function adopt(repo: string, key: string): CoreResult<unknown> {
  return workflowAdoptAtHead(repo, { ref: 'delivery-1', step: key, element: `bug:${BUG_ID}`, plan: false, apply: false, options: { reason: REASON } });
}

/** §10's new refusal for an unscoped key naming several frontier steps. */
function ambiguous(key: string, instance: string, steps: readonly string[]): CoreResult<never> {
  return {
    ok: false,
    error: { code: 'CONFLICT', message: `step '${key}' names ${steps.length} steps of ${instance}: give --step, one of: ${steps.join(', ')}`, details: { step: key, instance, steps } },
  };
}

describe('task-356 AC 3 — an unscoped key matching one frontier step resolves to it (bug-468)', () => {
  it('the fixture: each instance has one frontier step, scoped to the first task', () => {
    const repo = fixture(true);
    expect(frontierKeys(repo, 'delivery-1')).toEqual([IMPLEMENT_FIRST]);
    expect(frontierKeys(repo, 'checks-1')).toEqual([CONFIRM_FIRST]);
  });

  it('memory add --workflow delivery-1 --step loop.implement: the link names the full key, so does its WingFoil-Step trailer', () => {
    const repo = fixture(true);
    const link = resolveAddLink(repo, 'delivery-1', IMPLEMENT, 'bug');
    expect(link).toEqual({ ok: true, value: { instance: 'delivery-1', step: IMPLEMENT_FIRST } });
    if (link.ok) expect(addLinkTrailers(link.value)).toEqual(['WingFoil-Instance: delivery-1', `WingFoil-Step: ${IMPLEMENT_FIRST}`]);
  });

  it('agent execute --step loop.implement (selectFrontierStep): the step with the full key', () => {
    const repo = fixture(true);
    const selected = select(repo, 'delivery-1', IMPLEMENT);
    expect(selected.ok ? selected.value.key : selected.error).toBe(IMPLEMENT_FIRST);
  });

  it('workflow finalize checks-1 --step gate.confirm: one record, its subject naming the full key', () => {
    const repo = fixture(true);
    const before = Number(commits(repo));
    const result = workflowFinalizeAtHead(repo, { ref: 'checks-1', step: CONFIRM });
    expect(result.ok ? result.value.finalized.key : result.error).toBe(CONFIRM_FIRST);
    expect(subject(repo)).toBe(`workflow: finalize checks-1 ${CONFIRM_FIRST}`);
    expect(Number(commits(repo))).toBe(before + 1);
  });

  it('workflow adopt delivery-1 --step loop.implement --element bug:…: one record, its subject naming the full key', () => {
    const repo = fixture(true);
    const before = Number(commits(repo));
    const result = adopt(repo, IMPLEMENT);
    expect(result.ok ? (result.value as { adopted: { step: string }[] }).adopted.map((entry) => entry.step) : result.error).toEqual([IMPLEMENT_FIRST]);
    expect(subject(repo)).toBe(`workflow: adopt delivery-1 ${IMPLEMENT_FIRST} bug:${BUG_ID}`);
    expect(Number(commits(repo))).toBe(before + 1);
  });
});

describe('task-356 AC 3 — an unscoped key matching two frontier steps is refused, listing them (bug-468, spec-017 §10)', () => {
  let repo: string;
  let before: string;
  beforeAll(() => {
    repo = fixture(false);
    before = commits(repo);
  });
  afterEach(() => expect(commits(repo)).toBe(before));

  it('the fixture: each instance has two frontier steps of one phase, in this order', () => {
    expect(frontierKeys(repo, 'delivery-1')).toEqual([IMPLEMENT_FIRST, IMPLEMENT_SECOND]);
    expect(frontierKeys(repo, 'checks-1')).toEqual([CONFIRM_FIRST, CONFIRM_SECOND]);
  });

  it('memory add --step loop.implement: CONFLICT naming both steps, nothing committed', () => {
    expect(resolveAddLink(repo, 'delivery-1', IMPLEMENT, 'bug')).toEqual(ambiguous(IMPLEMENT, 'delivery-1', [IMPLEMENT_FIRST, IMPLEMENT_SECOND]));
  });

  it('agent execute --step loop.implement (selectFrontierStep): the same CONFLICT', () => {
    expect(select(repo, 'delivery-1', IMPLEMENT)).toEqual(ambiguous(IMPLEMENT, 'delivery-1', [IMPLEMENT_FIRST, IMPLEMENT_SECOND]));
  });

  it('workflow finalize --step gate.confirm: the same CONFLICT, nothing committed', () => {
    expect(workflowFinalizeAtHead(repo, { ref: 'checks-1', step: CONFIRM })).toEqual(ambiguous(CONFIRM, 'checks-1', [CONFIRM_FIRST, CONFIRM_SECOND]));
  });

  it('workflow adopt --step loop.implement: the same CONFLICT, nothing committed', () => {
    expect(adopt(repo, IMPLEMENT)).toEqual(ambiguous(IMPLEMENT, 'delivery-1', [IMPLEMENT_FIRST, IMPLEMENT_SECOND]));
  });
});

describe('task-356 AC 3 — no match keeps each site’s out-of-frontier refusal, details unchanged (bug-468, bug-340)', () => {
  let repo: string;
  let before: string;
  beforeAll(() => {
    repo = fixture(true);
    before = commits(repo);
  });
  afterEach(() => expect(commits(repo)).toBe(before));

  const off = (key: string, instance: string): string => `step '${key}' is not on the frontier of ${instance}`;

  it.each([['loop.review'], [`${IMPLEMENT}@task:nope`]])('memory add --step %s: the refusal with { instance, step, frontier }', (key) => {
    expect(resolveAddLink(repo, 'delivery-1', key, 'bug')).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: off(key, 'delivery-1'), details: { instance: 'delivery-1', step: key, frontier: [IMPLEMENT_FIRST] } },
    });
  });

  it.each([['loop.review'], [`${IMPLEMENT}@task:nope`]])('agent execute --step %s: the refusal with { step, instance, frontier }', (key) => {
    expect(select(repo, 'delivery-1', key)).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: off(key, 'delivery-1'), details: { step: key, instance: 'delivery-1', frontier: [IMPLEMENT_FIRST] } },
    });
  });

  it.each([['gate.review'], [`${CONFIRM}@task:nope`]])('workflow finalize --step %s: the refusal with { frontier }', (key) => {
    expect(workflowFinalizeAtHead(repo, { ref: 'checks-1', step: key })).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: off(key, 'checks-1'), details: { frontier: [CONFIRM_FIRST] } },
    });
  });

  it.each([['loop.review'], [`${IMPLEMENT}@task:nope`]])('workflow adopt --step %s: the refusal with { frontier }', (key) => {
    expect(adopt(repo, key)).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: off(key, 'delivery-1'), details: { frontier: [IMPLEMENT_FIRST] } },
    });
  });
});
