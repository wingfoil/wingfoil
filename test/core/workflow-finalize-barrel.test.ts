/**
 * W3 B5 gate — `workflow finalize` (task-226, `spec-017` §7.9) reached through the `src/core` barrel, as
 * `test/core/workflow-status-render.test.ts` reaches task-225's values:
 *
 * - `workflowFinalizeAtHead` with no open instance and no `<ref>` refuses with `NO_ACTIVE_WORKFLOW_TO_FINALIZE`
 *   (`NOT_FOUND`, `spec-017` §10);
 * - `phaseRecordTrailers` lists the record's trailers in `spec-003` § "Evidence" order, the scope trailer
 *   naming an element, a collection item, or nothing;
 * - an approval step that waits on the element it carries (a gate held, the element at the gate state) has no
 *   missing evidence and is still not complete (§4.3, §5.1): finalize refuses it, naming the kinds the phase
 *   declares, since none is missing — `evidenceRefusal`'s fallback.
 */
import {
  CORE_MODULES,
  deduceWorkflowStateAtHead,
  NO_ACTIVE_WORKFLOW_TO_FINALIZE,
  phaseRecordTrailers,
  workflowFinalizeAtHead,
} from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ developer ]
    - name: Morgan
      email: morgan@example.invalid
      roles: [ reviewer, approver ]
  roles:
    - name: developer
    - name: reviewer
    - name: approver
paths:
  sources: [ src/ ]
`;

/**
 * `start` takes the task to `in-progress`; `review` submits it into the `in-review` gate and declares
 * `approval:`, so the approver decides it (the shape of `dev-loop.review`).
 */
const DELIVERY = `name: delivery
startable: true
element: task
phases:
  - name: start
    role: developer
    actions:
      - element.set_state(in-progress)
  - name: review
    role: reviewer
    approval: { by_role: approver }
    actions:
      - memory.submit
  - name: close
    role: developer
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** The configuration and the task at `status`; with `open`, one open `delivery` instance bound to it. */
function buildRepo(status: string, open: boolean): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/delivery.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/delivery.yaml', DELIVERY);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments: {}\nglobal: []\n');
  writeFixtureFile(root, 'docs/tasks/task-1.md', element('task', 'task-1', status));
  commitAll(root, 'fixture configuration and the task');
  if (open) {
    writeFixtureFile(root, 'docs/plans/plan-delivery.md', element('plan', 'plan-delivery', 'active', 'workflow: "delivery"\nphase: "x"\nelement: "task-1"\n'));
    commitAll(root, 'wf(plan): add plan-delivery');
  }
  return root;
}

/** The instance's task submitted after it opened: `in-progress → in-review`, the gate `review` holds. */
function submitTask(root: string): void {
  writeFixtureFile(root, 'docs/tasks/task-1.md', element('task', 'task-1', 'in-review'));
  commitAll(root, 'wf(task): submit task-1');
}

describe('W3 B5 gate — workflow finalize through the src/core barrel (task-226)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) removeTempDir(root);
  });

  it('with no open instance and no <ref>, refuses with NO_ACTIVE_WORKFLOW_TO_FINALIZE (NOT_FOUND) and writes nothing', () => {
    const root = buildRepo('in-progress', false);
    roots.push(root);
    const before = git(root, ['rev-parse', 'HEAD']).trim();
    const result = workflowFinalizeAtHead(root, {});
    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: NO_ACTIVE_WORKFLOW_TO_FINALIZE } });
    expect(NO_ACTIVE_WORKFLOW_TO_FINALIZE).toBe('no active workflow to finalize');
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });

  it('phaseRecordTrailers: phase, instance, then the scope trailer — an element, an item, or none', () => {
    const base = { workflow: 'dev-loop', phase: 'red', instance: 'release-cycle-1-plan' };
    expect(phaseRecordTrailers({ ...base, scope: { element: { type: 'task', id: 'task-130', status: 'in-progress' } } })).toEqual([
      'WingFoil-Phase: dev-loop.red completed',
      'WingFoil-Instance: release-cycle-1-plan',
      'WingFoil-Element: task:task-130',
    ]);
    expect(phaseRecordTrailers({ ...base, scope: { item: { collection: 'templates', key: 'kanban' } } } as Parameters<typeof phaseRecordTrailers>[0])).toEqual([
      'WingFoil-Phase: dev-loop.red completed',
      'WingFoil-Instance: release-cycle-1-plan',
      'WingFoil-Item: templates#kanban',
    ]);
    expect(phaseRecordTrailers({ ...base, scope: null })).toEqual(['WingFoil-Phase: dev-loop.red completed', 'WingFoil-Instance: release-cycle-1-plan']);
  });

  it('an approval step waiting on the task it carries has no missing evidence and is not finalizable: CONFLICT naming its declared kinds', async () => {
    const root = buildRepo('in-progress', true);
    roots.push(root);
    submitTask(root);
    const step = deduceWorkflowStateAtHead(root).instances[0]?.frontier[0];
    // The precondition of the fallback: on the frontier, nothing missing, an element awaiting the approver.
    expect(step?.key).toBe('delivery.review@task:task-1');
    expect(step?.evidence.missing).toEqual([]);
    expect(step?.evidence.finalizable).toBe(false);
    expect(step?.approval?.elements.map((ref) => ref.id)).toEqual(['task-1']);
    const kinds = (step?.evidence.kinds ?? []).filter((kind) => kind !== 'record');
    expect(kinds).toEqual(['state']);

    const before = git(root, ['rev-parse', 'HEAD']).trim();
    const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowFinalize'];
    const result = (await op?.fn({ root, options: {} })) as CoreResult<unknown>;
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: `phase 'delivery.review' completes from its evidence: ${kinds.join(', ')}`,
        details: { step: 'delivery.review@task:task-1', missing: [] },
      },
    });
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });
});
