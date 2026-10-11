/**
 * task-217 — the arms of `workflow start` / `workflow end` the BDD-shaped suite does not reach
 * (`test/core/workflow-start-end.test.ts` holds the acceptance cases): the console renderers (a dry-run plan,
 * a complete first step, an active instance after `end`), an `id_pattern` with a `{n}` counter and a `path`
 * with no `{scope}`, a submit refused by a result rather than a throw, and the two incomplete instances whose
 * frontier is empty — abandoned (`spec-017` §4.11) and not loaded (§4.9).
 */
import { CORE_MODULES, enumerateOperations, renderEndConsole, renderStartConsole, type EndResult, type StartResult } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { coreErr, type CoreResult } from '../../src/core/types';
import { workflowStart } from '../../src/core/workflow-start-end';
import { MemoryYaml } from '../../src/memory/schema';
import { resolveWaitingTarget } from '../../src/memory/state-machine';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

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
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const TEMPLATE = '---\nid: ""\ntype: plan\ntitle: ""\nstatus: draft\nworkflow: ""\nphase: ""\nelement: ""\n---\n\n## Steps\n';

function memoryYaml(plan: { path: string; idPattern: string }): string {
  return `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, in-development, released ]
  plan:
    path: "${plan.path}"
    id_pattern: "${plan.idPattern}"
    template:
      frontmatter:
        required: [ title ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;
}

const RELEASE_CYCLE = 'name: release-cycle\nstartable: true\nelement: release\nphases:\n  - name: ship\n    role: developer\n    actions:\n      - element.set_state(released)\n';
const DONE_AT_ONCE = 'name: tidy\nstartable: true\nphases:\n  - name: check\n    role: developer\n    produces: [ "README.md" ]\n';

function writeProject(root: string, plan: { path: string; idPattern: string }): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n  - workflows/custom/tidy.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/tidy.yaml', DONE_AT_ONCE);
  writeFixtureFile(root, '.wingfoil/memory.yaml', memoryYaml(plan));
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  writeFixtureFile(root, 'docs/releases/minor-v1.md', '---\nid: "minor-v1"\ntype: release\ntitle: "minor-v1"\nstatus: in-development\n---\n');
  commitAll(root, 'fixture');
}

function operation(name: string): CoreFn<unknown, unknown> {
  return enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === name)!.operation.fn;
}

const BASELINE = { rev: 'HEAD' as const, commit: 'c'.repeat(40) };
const INSTANCE = { id: 'tidy-1-plan', workflow: 'tidy', element: null, context: null, created: [], planStatus: 'active' as const, startCommit: 'a'.repeat(40), active: true, abandoned: false };

describe('workflow start / end — the console renderers (task-217, spec-017 §8)', () => {
  it('a dry run prints its plan as JSON', () => {
    const plan = { dryRun: true, subject: 'wf(plan): add tidy-1-plan', paths: [] } as unknown;
    expect(JSON.parse(renderStartConsole(plan as StartResult))).toEqual(plan);
    expect(JSON.parse(renderEndConsole(plan as EndResult))).toEqual(plan);
  });

  it('start with no first step says the workflow is complete', () => {
    const text = renderStartConsole({ baseline: BASELINE, instance: INSTANCE, next: null, commits: ['a', 'b'] });
    expect(text).toBe("started tidy as tidy-1-plan (active)\nno next step: workflow 'tidy' is complete\n");
  });

  it('end names the instance now active', () => {
    const active = { ...INSTANCE, id: 'release-cycle-minor-v1-plan', workflow: 'release-cycle' };
    expect(renderEndConsole({ baseline: BASELINE, ended: INSTANCE, active, commit: 'd' })).toBe(
      'ended tidy (tidy-1-plan)\nactive: release-cycle (release-cycle-minor-v1-plan)\n',
    );
  });
});

describe('workflow start / end — arms past the acceptance cases (task-217)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('an id_pattern with a {n} counter and a path with no {scope}: only the tokens the patterns hold are passed', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{id}.md', idPattern: 'plan-{n}' });
    const result = (await operation('workflowStart')({ root: repo, positional: 'tidy', options: {} })) as CoreResult<StartResult>;
    expect(result.ok ? result.value.instance.id : result.error).toBe('plan-001');
    expect(git(repo, ['ls-files', 'docs/plans']).trim()).toBe('docs/plans/plan-001.md');
  });

  it('a submit refused by its result keeps the plan draft and names `wingfoil memory submit <id>`', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{scope}/{id}.md', idPattern: '{workflow}-{phase}-plan' });
    const refused = await workflowStart(
      { root: repo, positional: 'tidy', options: {} },
      { add: enumerateOperations(CORE_MODULES).find((entry) => entry.operation.name === 'memoryAdd')!.operation.fn as never, submit: async () => coreErr({ code: 'VALIDATION', message: 'no' }) },
    );
    expect(refused.ok ? null : refused.error).toMatchObject({
      code: 'VALIDATION',
      message: 'plan tidy-1-plan was added but not submitted: run wingfoil memory submit tidy-1-plan',
      details: { id: 'tidy-1-plan', issues: [{ detail: 'no' }] },
    });
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe('wf(plan): add tidy-1-plan');
  });

  it('end refuses an abandoned instance (its element deprecated) and one whose workflow is not loaded', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{scope}/{id}.md', idPattern: '{workflow}-{phase}-plan' });
    const started = (await operation('workflowStart')({ root: repo, positional: 'release-cycle', options: { element: 'release:minor-v1' } })) as CoreResult<StartResult>;
    expect(started.ok).toBe(true);
    writeFixtureFile(repo, 'docs/releases/minor-v1.md', '---\nid: "minor-v1"\ntype: release\ntitle: "minor-v1"\nstatus: deprecated\n---\n');
    commitAll(repo, 'wf(release): deprecate minor-v1 [in-development → deprecated]');
    const abandoned = await operation('workflowEnd')({ root: repo });
    expect(abandoned.ok ? null : abandoned.error).toMatchObject({
      code: 'CONFLICT',
      message: "workflow 'release-cycle' is not complete: it is abandoned: its element release:minor-v1 is deprecated",
      hint: 'wingfoil memory deprecate release-cycle-minor-v1-plan abandons it',
    });

    writeFixtureFile(repo, 'docs/plans/ghost/ghost-1-plan.md', '---\nid: "ghost-1-plan"\ntype: plan\ntitle: "ghost"\nstatus: active\nworkflow: "ghost"\nphase: "1"\nelement: ""\n---\n');
    commitAll(repo, 'a plan of a workflow the registry does not load');
    const unknown = await operation('workflowEnd')({ root: repo, positional: 'ghost-1-plan' });
    expect(unknown.ok ? null : unknown.error).toMatchObject({ code: 'CONFLICT', message: "workflow 'ghost' is not complete: workflow 'ghost' is not loaded" });
  });
});

describe('resolveWaitingTarget — the edge workflow end takes (task-217)', () => {
  const memory = MemoryYaml.parse({
    version: 1,
    types: { plan: { path: 'p/{id}.md', states: { sequence: ['draft', 'active', 'done'], waiting: ['active'] } } },
  });

  it('active -> done', () => {
    expect(resolveWaitingTarget(memory, 'plan', 'active', 'p/x.md')).toBe('done');
  });

  it.each(['draft', 'done', 'nope'])("refuses '%s' with dl-032's message and (none)", (state) => {
    expect(() => resolveWaitingTarget(memory, 'plan', state, 'p/x.md')).toThrow(`illegal transition ${state} -> (none) for type 'plan'`);
  });
});
