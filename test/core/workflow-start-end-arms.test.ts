/**
 * task-217 — the arms of `workflow start` / `workflow end` the BDD-shaped suite does not reach
 * (`test/core/workflow-start-end.test.ts` holds the acceptance cases): the console renderers (a dry-run plan,
 * a complete first step, an active instance after `end`), an `id_pattern` with a `{n}` counter and a `path`
 * with no `{scope}`, an abandoned instance (`spec-017` §4.11), and a plan whose workflow is not loaded, no instance
 * since task-345 (§3.2).
 *
 * task-346 (`spec-017` §7.1 as amended): `start` leaves its plan `draft` (`bug-390`) — the console names
 * `wingfoil memory submit <id>` (AC 1 item 5), and an `end` after a `start` submits the plan first; the submit arm
 * of `StartVerbs` is gone (D4), so the case of a refused submit is too. `workflow` and `phase` are written whatever the
 * plan type's `id_pattern` and `path` declare (`bug-491`, AC 2 items 1–6).
 */
import { CORE_MODULES, enumerateOperations, renderEndConsole, renderStartConsole, type EndResult, type StartResult } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { MemoryYaml } from '../../src/memory/schema';
import { resolveWaitingTarget } from '../../src/memory/state-machine';
import { appendFileSync, readFileSync } from 'fs';
import { join } from 'path';

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

/** The plan type of a fixture: its patterns, and (task-346 AC 2) its `required` fields and template when not the default ones. */
interface PlanShape {
  readonly path: string;
  readonly idPattern: string;
  readonly required?: readonly string[];
  readonly template?: string;
}

function memoryYaml(plan: PlanShape): string {
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
        required: [ ${(plan.required ?? ['title']).join(', ')} ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;
}

const RELEASE_CYCLE = 'name: release-cycle\nstartable: true\nelement: release\nphases:\n  - name: ship\n    role: developer\n    actions:\n      - element.set_state(released)\n';
const DONE_AT_ONCE = 'name: tidy\nstartable: true\nphases:\n  - name: check\n    role: developer\n    produces: [ "README.md" ]\n';

function writeProject(root: string, plan: PlanShape): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n  - workflows/custom/tidy.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/tidy.yaml', DONE_AT_ONCE);
  writeFixtureFile(root, '.wingfoil/memory.yaml', memoryYaml(plan));
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', plan.template ?? TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  writeFixtureFile(root, 'docs/releases/minor-v1.md', '---\nid: "minor-v1"\ntype: release\ntitle: "minor-v1"\nstatus: in-development\n---\n');
  commitAll(root, 'fixture');
}

function operation(name: string, module = 'workflow'): CoreFn<unknown, unknown> {
  return enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === module && entry.operation.name === name)!.operation.fn;
}

/** `start` as the CLI passes it; the value, or a thrown refusal. */
async function startOk(root: string, name: string, options: Readonly<Record<string, string | readonly string[]>> = {}): Promise<StartResult> {
  const result = (await operation('workflowStart')({ root, positional: name, options })) as CoreResult<StartResult>;
  if (!result.ok) throw new Error(`expected a start of ${name}, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** A body line into the plan `start` left `draft`, then the registered `memorySubmit` (task-346, `spec-017` §7.1). */
async function writeAndSubmit(root: string, id: string): Promise<CoreResult<unknown>> {
  const path = git(root, ['ls-files', `docs/plans/**/${id}.md`, `docs/plans/${id}.md`]).trim();
  if (path === '') throw new Error(`no plan file for ${id}`);
  appendFileSync(join(root, path), '\nThe plan of this run.\n');
  return (await operation('memorySubmit', 'memory')({ root, positional: id })) as CoreResult<unknown>;
}

const frontmatterOf = (root: string, path: string): string => readFileSync(join(root, path), 'utf-8').split('\n---\n')[0]!;

const BASELINE = { rev: 'HEAD' as const, commit: 'c'.repeat(40) };
const INSTANCE = { id: 'tidy-1-plan', workflow: 'tidy', element: null, context: null, created: [], planStatus: 'active' as const, startCommit: 'a'.repeat(40), active: true, abandoned: false };

describe('workflow start / end — the console renderers (task-217, spec-017 §8)', () => {
  it('a dry run prints its plan as JSON', () => {
    const plan = { dryRun: true, subject: 'wf(plan): add tidy-1-plan', paths: [] } as unknown;
    expect(JSON.parse(renderStartConsole(plan as StartResult))).toEqual(plan);
    expect(JSON.parse(renderEndConsole(plan as EndResult))).toEqual(plan);
  });

  it('start with no first step names the plan to submit, then says the workflow is complete (task-346 D2)', () => {
    const value = { baseline: BASELINE, instance: { ...INSTANCE, planStatus: 'draft' as const }, next: null, commits: ['a'], submit: 'wingfoil memory submit tidy-1-plan' } as StartResult;
    expect(renderStartConsole(value)).toBe(
      "started tidy as tidy-1-plan (active)\nplan tidy-1-plan is draft: write its body, then run wingfoil memory submit tidy-1-plan\nno next step: workflow 'tidy' is complete\n",
    );
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
    // task-346 AC 2 item 5 (bug-491): `workflow` and `phase` are written although the patterns hold neither token.
    expect(frontmatterOf(repo, 'docs/plans/plan-001.md')).toMatch(/^workflow: "tidy"$/m);
    expect(frontmatterOf(repo, 'docs/plans/plan-001.md')).toMatch(/^phase: "1"$/m);
  });

  it('end refuses an abandoned instance (its element deprecated), and a plan whose workflow is not loaded as no instance (task-345 AC 2)', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{scope}/{id}.md', idPattern: '{workflow}-{phase}-plan' });
    const started = (await operation('workflowStart')({ root: repo, positional: 'release-cycle', options: { element: 'release:minor-v1' } })) as CoreResult<StartResult>;
    expect(started.ok).toBe(true);
    // task-346: the plan `start` left `draft` is submitted first, or `end` refuses it as not submitted.
    expect((await writeAndSubmit(repo, 'release-cycle-minor-v1-plan')).ok).toBe(true);
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
    expect(unknown.ok ? null : unknown.error).toMatchObject({ code: 'NOT_FOUND', message: 'workflow is not open: ghost-1-plan' });
  });
});

describe('task-346 AC 1 item 5 — the console of a real start names memory submit (bug-390, spec-017 §7.1, §8)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('a real start of `tidy` (complete at once): the started line, the draft-plan line, then the complete line', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{scope}/{id}.md', idPattern: '{workflow}-{phase}-plan' });
    const value = await startOk(repo, 'tidy');
    expect(renderStartConsole(value)).toBe(
      "started tidy as tidy-1-plan (active)\nplan tidy-1-plan is draft: write its body, then run wingfoil memory submit tidy-1-plan\nno next step: workflow 'tidy' is complete\n",
    );
  });
});

describe('task-346 AC 2 — start writes the plan\'s workflow and phase whatever the patterns declare (bug-491, spec-017 §7.1 as amended)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));
  /** bug-491's plan type: a numbered id and a flat path, neither holding `{workflow}`, `{phase}` nor `{scope}`; every field required. */
  const NUMBERED: PlanShape = { path: 'docs/plans/{id}.md', idPattern: 'plan-{n}-{slug}', required: ['title', 'workflow', 'phase'] };

  it('1: `plan-{n}-{slug}`: the plan records workflow, phase `1` and the title `<workflow> — <phase>` (D3); memory submit then succeeds', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, NUMBERED);
    const value = await startOk(repo, 'tidy');
    expect(value.instance.id).toBe('plan-001-tidy-1');
    const frontmatter = frontmatterOf(repo, 'docs/plans/plan-001-tidy-1.md');
    expect(frontmatter).toMatch(/^status: draft$/m);
    expect(frontmatter).toMatch(/^workflow: "tidy"$/m);
    expect(frontmatter).toMatch(/^phase: "1"$/m);
    expect(frontmatter).toMatch(/^title: "tidy — 1"$/m);
    const submitted = await writeAndSubmit(repo, 'plan-001-tidy-1');
    expect(submitted.ok ? null : submitted.error).toBeNull();
  });

  it('2: the same type, a bound element: phase and element are the element\'s id', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, NUMBERED);
    const value = await startOk(repo, 'release-cycle', { element: 'release:minor-v1' });
    const frontmatter = frontmatterOf(repo, `docs/plans/${value.instance.id}.md`);
    expect(frontmatter).toMatch(/^workflow: "release-cycle"$/m);
    expect(frontmatter).toMatch(/^phase: "minor-v1"$/m);
    expect(frontmatter).toMatch(/^element: "minor-v1"$/m);
  });

  it('3: the same type, `--set phase=capture` is accepted and recorded', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, NUMBERED);
    const value = await startOk(repo, 'tidy', { set: ['phase=capture'] });
    expect(frontmatterOf(repo, `docs/plans/${value.instance.id}.md`)).toMatch(/^phase: "capture"$/m);
  });

  it('4 (unchanged): the same type, `--set scope=x` is still VALIDATION `--set scope: … has no token {scope} …`, nothing written', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, NUMBERED);
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const result = await operation('workflowStart')({ root: repo, positional: 'tidy', options: { set: ['scope=x'] } });
    expect(result.ok ? null : result.error).toMatchObject({ code: 'VALIDATION', message: "--set scope: memory type 'plan' has no token {scope} in its id_pattern or path" });
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
    expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
  });

  it('6: a template with no `phase:` key: the field is still written', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{id}.md', idPattern: 'plan-{n}', template: '---\nid: ""\ntype: plan\ntitle: ""\nstatus: draft\nworkflow: ""\nelement: ""\n---\n\n## Steps\n' });
    await startOk(repo, 'tidy');
    expect(frontmatterOf(repo, 'docs/plans/plan-001.md')).toMatch(/^phase: "1"$/m);
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

describe('workflow start / end — refusals before any read (task-217)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('no git identity: both refuse before reading (REQ-SEC-01)', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{scope}/{id}.md', idPattern: '{workflow}-{phase}-plan' });
    git(repo, ['config', '--unset', 'user.email']);
    const saved = { ...process.env };
    const empty = `${repo}/.git/empty-config`;
    writeFixtureFile(repo, '.git/empty-config', '');
    Object.assign(process.env, { GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' });
    delete process.env['GIT_AUTHOR_EMAIL'];
    delete process.env['GIT_COMMITTER_EMAIL'];
    delete process.env['EMAIL'];
    try {
      const started = await operation('workflowStart')({ root: repo, positional: 'tidy', options: {} });
      const ended = await operation('workflowEnd')({ root: repo });
      expect([started.ok, ended.ok]).toEqual([false, false]);
      expect(started.ok ? '' : started.error.message).toMatch(/identity|user\.email/);
    } finally {
      process.env = saved;
    }
  });

  it('a project with no .wingfoil/ is refused as not initialized', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'README.md', '# x\n');
    commitAll(repo, 'bare');
    for (const name of ['workflowStart', 'workflowEnd']) {
      const result = await operation(name)({ root: repo, positional: 'tidy', options: {} });
      expect(result.ok ? null : result.error.code).toBe('VALIDATION');
    }
  });

  it('a repeated --element keeps the last; a refused add is returned unchanged', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{scope}/{id}.md', idPattern: '{workflow}-{phase}-plan' });
    git(repo, ['rm', '-q', '.wingfoil/memory/templates/plan.md']);
    commitAll(repo, 'no plan template');
    const result = await operation('workflowStart')({ root: repo, positional: 'release-cycle', options: { element: ['release:ghost', 'release:minor-v1'] } });
    expect(result.ok).toBe(false);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe('no plan template');
  });
});
