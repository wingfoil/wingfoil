/**
 * task-235 — the step forms of `agent execute` in process (`spec-016` §3.1, §3.2 steps 1–3, §3.7's step
 * rows): the pure resolution over a `NextResult` (`src/agent/step.ts`) on synthetic inputs, for the cases a
 * committed repository cannot reach, and `agentExecuteFn` with `--next` / `--workflow` / `--step` as dry runs
 * on the step fixture, in the coverage-measured process. The bytes a user sees, and the real launch, are
 * `test/cli/agent-execute-step.integration.test.ts`.
 */
import type { AgentExecuteHost, AgentLaunchPlan } from '../../src/agent';
import { NO_NEXT_STEP_MESSAGE, resolveStepRole, selectFrontierStep, stepTargetElement } from '../../src/agent/step';
import { agentExecuteFn } from '../../src/core/agent-execute';
import type { NextResult, Step } from '../../src/core';
import { runAsDryRun } from '../../src/core/dry-run';
import type { CoreResult } from '../../src/core/types';
import type { DnaYaml } from '../../src/dna/schema';
import type { Instance } from '../../src/workflow/deduce';
import { withWarningSink } from '../../src/validation/warning';
import { TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { GHOSTLY, GHOSTLY_FILE, headOf, RELEASE_ID, seedStep, SIBLING_ID, startInstance, STEP_WORKFLOWS } from '../agent/helpers/agent-execute-step-fixture';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import * as revision from '../../src/core/revision';
import * as stepModule from '../../src/agent/step';
import { duplicateAdapterRefusal } from '../../src/agent/discovery';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const HOST: AgentExecuteHost = { mcpServer: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] }, isTerminal: () => false };

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

// --- the pure resolution -----------------------------------------------------------------------------

const INSTANCE: Instance = {
  id: 'delivery-1',
  workflow: 'delivery',
  element: { type: 'release', id: 'minor-1', status: 'in-development' },
  context: null,
  created: [],
  planStatus: 'active',
  startCommit: 'a'.repeat(40),
  active: true,
  abandoned: false,
};

/** A step with only the fields the resolution reads; the rest is `buildStep`'s and irrelevant here. */
function step(key: string, scope: Step['scope'], role: string | null): Step {
  return { key, instance: INSTANCE.id, workflow: 'loop', phase: key.split('@')[0]!.split('.')[1]!, scope, role } as unknown as Step;
}

function result(next: Step | null, more: Step[] = [], instance: Instance | null = INSTANCE): NextResult {
  return { baseline: { rev: 'HEAD', commit: 'a'.repeat(40) }, instance, complete: next === null, next, more, diagnostics: [] };
}

const TASK_SCOPE: Step['scope'] = { element: { type: 'task', id: 'task-1', status: 'backlog' } };
const FIRST = step('loop.implement@task:task-1', TASK_SCOPE, 'developer');
const SECOND = step('loop.implement@task:task-2', { element: { type: 'task', id: 'task-2', status: 'backlog' } }, 'developer');

const DNA = { team: { roles: [{ name: 'developer' }, { name: 'reviewer' }] } } as unknown as DnaYaml;

describe('selectFrontierStep — spec-016 §3.2 step 1', () => {
  it('without --step: NextResult.next', () => {
    expect(selectFrontierStep(result(FIRST, [SECOND]), undefined)).toEqual({ ok: true, value: FIRST });
  });

  it('with --step: the frontier step it names, the further ready ones included', () => {
    expect(selectFrontierStep(result(FIRST, [SECOND]), SECOND.key)).toEqual({ ok: true, value: SECOND });
  });

  it('next: null, or no open instance → NO_NEXT_STEP (P5.3.1 sc. 3, verbatim)', () => {
    const noNext = { ok: false, error: { code: 'NOT_FOUND', message: NO_NEXT_STEP_MESSAGE } };
    expect(NO_NEXT_STEP_MESSAGE).toBe('no next step to execute');
    expect(selectFrontierStep(result(null), undefined)).toEqual(noNext);
    expect(selectFrontierStep(result(null, [], null), undefined)).toEqual(noNext);
    expect(selectFrontierStep(result(null, [], null), FIRST.key)).toEqual(noNext);
  });

  it('a --step off the frontier → CONFLICT naming the step and the instance (spec-017 §10)', () => {
    for (const next of [FIRST, null]) {
      expect(selectFrontierStep(result(next), 'loop.review@task:task-1')).toEqual({
        ok: false,
        error: { code: 'CONFLICT', message: "step 'loop.review@task:task-1' is not on the frontier of delivery-1", details: { step: 'loop.review@task:task-1', instance: 'delivery-1' } },
      });
    }
  });
});

describe('stepTargetElement — spec-016 §3.2 step 2', () => {
  const override = { type: 'bug', id: 'bug-9' };

  it('--element first, then the step scope element, then the instance bound element', () => {
    expect(stepTargetElement(FIRST, INSTANCE, override)).toEqual({ ok: true, value: override });
    expect(stepTargetElement(FIRST, INSTANCE, undefined)).toEqual({ ok: true, value: { type: 'task', id: 'task-1' } });
    expect(stepTargetElement(step('solo.go', null, 'developer'), INSTANCE, undefined)).toEqual({ ok: true, value: { type: 'release', id: 'minor-1' } });
    const itemStep = step('sweep.entry@modules#core', { item: { collection: 'modules', key: 'core' } }, 'developer');
    expect(stepTargetElement(itemStep, INSTANCE, undefined)).toEqual({ ok: true, value: { type: 'release', id: 'minor-1' } });
  });

  it('none of the three → NO_STEP_ELEMENT', () => {
    const itemStep = step('sweep.entry@modules#core', { item: { collection: 'modules', key: 'core' } }, 'developer');
    expect(stepTargetElement(itemStep, { ...INSTANCE, element: null }, undefined)).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: "step 'sweep.entry@modules#core' has no element: give --element <type>:<id>" },
    });
  });
});

describe('resolveStepRole — spec-016 §3.2 step 3 (P5.3.2)', () => {
  it('--role first, else the step role', () => {
    expect(resolveStepRole(DNA, FIRST, 'reviewer')).toEqual({ ok: true, value: 'reviewer' });
    expect(resolveStepRole(DNA, FIRST, undefined)).toEqual({ ok: true, value: 'developer' });
  });

  it('a step with no role and no --role → NO_STEP_ROLE', () => {
    expect(resolveStepRole(DNA, step('solo.go', null, null), undefined)).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: "step 'solo.go' declares no role: give --role <role>" },
    });
  });

  // Defence only: through a repository this cannot be reached, because the registry refuses such a phase at
  // load (E_PHASE_ROLE_UNKNOWN) against the same committed dna.yaml; P5.3.2 sc. 3 now carries that message
  // (approver ruling 2026-10-11, task-235 D1). The step here is synthetic.
  it('a step role dna.yaml does not define → VALIDATION, for a step deduced without the registry check', () => {
    expect(resolveStepRole(DNA, step('solo.go', null, 'ghost'), undefined)).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: "step role 'ghost' not defined in dna.yaml" },
    });
  });
});

// --- agentExecuteFn with the step forms, as dry runs -------------------------------------------------

interface Outcome {
  readonly result: CoreResult<AgentLaunchPlan>;
  readonly warnings: string[];
}

async function plan(root: string, params: { next?: boolean; options?: Record<string, string> }): Promise<Outcome> {
  const warnings: string[] = [];
  const result = (await withWarningSink(
    (text) => warnings.push(text),
    () => runAsDryRun(() => agentExecuteFn({ root, host: HOST, ...params })),
  )) as CoreResult<AgentLaunchPlan>;
  return { result, warnings };
}

const runOf = (outcome: Outcome) => (outcome.result.ok ? outcome.result.value.run : outcome.result.error);

describe('agentExecuteFn — the step forms (dry run, in process)', () => {
  let repo: string;
  beforeAll(() => {
    repo = seedStep();
    repos.push(repo);
    startInstance(repo, 'review-1', 'review-only', RELEASE_ID);
    startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
  });

  it('--next: workflow, phase, element and role from the next step; run id <id>/<phase>/1; fresh; no warning', async () => {
    const outcome = await plan(repo, { next: true });
    expect(runOf(outcome)).toMatchObject({ id: `${TASK_ID}/implement/1`, element: `task:${TASK_ID}`, workflow: 'loop', phase: 'implement', role: 'developer', mode: 'fresh' });
    expect(outcome.warnings).toEqual([]);
  }, 60000);

  it('--workflow <name> selects its most recent open instance; --workflow <instance> --step <key> a parallel step', async () => {
    expect(runOf(await plan(repo, { options: { workflow: 'review-only' } }))).toMatchObject({ workflow: 'review-only', phase: 'code-review', role: 'reviewer', element: `release:${RELEASE_ID}` });
    const second = await plan(repo, { options: { workflow: 'delivery-1', step: `loop.implement@task:${SIBLING_ID}` } });
    expect(runOf(second)).toMatchObject({ id: `${SIBLING_ID}/implement/1`, element: `task:${SIBLING_ID}`, phase: 'implement' });
  }, 60000);

  it('--next with --element and --role: both override, the phase stays the step’s', async () => {
    const outcome = await plan(repo, { next: true, options: { element: `task:${SIBLING_ID}`, role: 'reviewer' } });
    expect(runOf(outcome)).toMatchObject({ id: `${SIBLING_ID}/implement/1`, workflow: 'loop', phase: 'implement', role: 'reviewer' });
  }, 60000);

  it('the step refusals pass through: off the frontier, unknown workflow, not open', async () => {
    expect(runOf(await plan(repo, { options: { step: 'loop.review@task:nope' } }))).toMatchObject({ code: 'CONFLICT', message: "step 'loop.review@task:nope' is not on the frontier of delivery-1" });
    expect(runOf(await plan(repo, { options: { workflow: 'nope' } }))).toMatchObject({ code: 'NOT_FOUND', message: 'unknown workflow: nope' });
    expect(runOf(await plan(repo, { options: { workflow: 'chores' } }))).toMatchObject({ code: 'NOT_FOUND', message: 'workflow is not open: chores' });
  }, 60000);

  it('a step role and an element that do not exist are still checked: --element absent at HEAD is NOT_FOUND', async () => {
    expect(runOf(await plan(repo, { next: true, options: { element: 'task:task-999-absent' } }))).toMatchObject({ code: 'NOT_FOUND', message: 'element not found: task:task-999-absent' });
  }, 60000);

  it('a workflow registry with a spec-003 error at HEAD: VALIDATION, every diagnostic in details (step 2)', async () => {
    const ghostly = seedStep(undefined, { ...STEP_WORKFLOWS, [GHOSTLY_FILE]: GHOSTLY });
    repos.push(ghostly);
    const error = runOf(await plan(ghostly, { next: true })) as { code: string; message: string; details?: Record<string, unknown> };
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toMatch(/unknown role 'ghost' \(not defined in dna\.yaml\)$/);
    expect(error.details?.['diagnostics']).toEqual([expect.objectContaining({ code: 'E_PHASE_ROLE_UNKNOWN' })]);
  }, 60000);

  it('an invalid roles.yaml at HEAD under a step form: VALIDATION with its issues, as workflow next refuses it', async () => {
    const broken = seedStep((root) => writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments: 3\n'));
    repos.push(broken);
    startInstance(broken, 'delivery-1', 'delivery', RELEASE_ID);
    const error = runOf(await plan(broken, { next: true })) as { code: string; details?: Record<string, unknown> };
    expect(error.code).toBe('VALIDATION');
    expect(error.details?.['issues']).toBeDefined();
  }, 60000);

  it('a repository with no commit under a step form: HEAD names no commit, as the stepless form', async () => {
    const empty = makeTempGitRepo();
    repos.push(empty);
    writeFixtureFile(empty, '.wingfoil/dna.yaml', 'version: 1\n');
    expect((await plan(empty, { next: true })).result.ok).toBe(false);
  });

  it('none of --next, --workflow, --step, --element: the usage error, before the project is read', async () => {
    await expect(agentExecuteFn({ root: '/nonexistent', options: { role: 'developer' } })).rejects.toThrow('missing required argument: --next or --element');
    await expect(agentExecuteFn({ root: '/nonexistent', next: false, options: {} })).rejects.toThrow('missing required argument: --next or --element');
  });
});

describe('task-235 review F3 — every adapter read takes the run’s one HEAD, not HEAD read again', () => {
  /** A commit that breaks the fake adapter's manifest, made right after the pipeline resolved its HEAD. */
  const breakAdapter = (root: string): void => {
    writeFixtureFile(root, '.wingfoil/agents/custom/fake.yaml', 'name: fake\nargz: [ oops ]\n');
    writeFixtureFile(root, '.wingfoil/agents/built-in/fake.yaml', 'name: fake\n');
    commitAll(root, 'break the adapter after HEAD was resolved');
  };

  afterEach(() => jest.restoreAllMocks());

  it('step form: HEAD moves after the deduction; the adapter is still read at the deduction’s commit', async () => {
    const repo = seedStep();
    repos.push(repo);
    startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
    const real = stepModule.readNextAtHead;
    let deducedAt = '';
    jest.spyOn(stepModule, 'readNextAtHead').mockImplementation((root, ref) => {
      const result = real(root, ref);
      if (result.ok) deducedAt = result.value.baseline.commit;
      breakAdapter(root);
      return result;
    });
    const outcome = await plan(repo, { next: true });
    expect(runOf(outcome)).toMatchObject({ id: `${TASK_ID}/implement/1`, state_ref: deducedAt });
  }, 60000);

  it('stepless form: HEAD moves after it is resolved; the adapter is still read at that commit', async () => {
    const repo = seedStep();
    repos.push(repo);
    const real = revision.resolveRevision;
    let resolvedAt = '';
    jest.spyOn(revision, 'resolveRevision').mockImplementationOnce((root, rev) => {
      resolvedAt = real(root, rev);
      breakAdapter(root);
      return resolvedAt;
    });
    const outcome = await plan(repo, { options: { element: `task:${TASK_ID}`, role: 'developer' } });
    expect(runOf(outcome)).toMatchObject({ element: `task:${TASK_ID}`, state_ref: resolvedAt });
  }, 60000);
});

describe('duplicateAdapterRefusal — at HEAD, at a sha, and the label its refusal spells', () => {
  it('HEAD resolves itself; a sha with a label reads that commit and says HEAD; no commit has no adapter', () => {
    const repo = seedStep((root) => writeFixtureFile(root, '.wingfoil/agents/built-in/fake.yaml', 'name: fake\n'));
    repos.push(repo);
    const sha = headOf(repo);
    const atHead = duplicateAdapterRefusal(repo, 'HEAD');
    expect(atHead?.ok).toBe(false);
    expect(duplicateAdapterRefusal(repo, sha, 'HEAD')).toEqual(atHead);
    const issues = (atHead as unknown as { error: { details: { issues: { detail: string }[] } } }).error.details.issues;
    expect(issues.every((issue) => !issue.detail.includes(sha))).toBe(true);
    const empty = makeTempGitRepo();
    repos.push(empty);
    expect(duplicateAdapterRefusal(empty, 'HEAD')).toBeUndefined();
  });
});
