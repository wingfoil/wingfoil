/**
 * task-217 — `wingfoil workflow start <name>` and `wingfoil workflow end [<ref>]` (`spec-017` §3.1–§3.5,
 * §7.1, §7.2, §8 `StartResult` / `EndResult`, §10, §11; BDD P4.2, P4.3; REQ-STATE-03), through the registered
 * `CORE_MODULES` operations, on fixture repositories committed at `HEAD`.
 *
 * - AC 1: BDD P4.2 sc. 1 (the instance becomes active and its first step is reported), sc. 2 (a second start
 *   makes the new instance active, the first stays open), sc. 3 (a sub workflow is refused, nothing written).
 * - AC 2: BDD P4.3 sc. 1 (`end` closes a complete instance, no active one is left), sc. 2 (ending the active
 *   instance restores the previous one), sc. 3 (`no active workflow to end`), and the new scenario: an
 *   incomplete instance is refused with its current step and the `memory deprecate` hint.
 * - AC 3: each `start` commit touches only the plan file; a refused second commit leaves the plan `draft` and
 *   names `wingfoil memory submit <id>`; a project with no `plan` type is refused with §10's message.
 * - AC 4: the element errors of §10 and the `CONFLICT` of a colliding `--set phase=`.
 *
 * The CLI's exit codes and usage errors are `test/cli/workflow-start-end.integration.test.ts`.
 */
import { chmodSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { CORE_MODULES, enumerateOperations } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  bug:
    path: "docs/bugs/{id}.md"
    id_pattern: "bug-{n}-{slug}"
    states:
      sequence: [ draft, open, closed ]
  plan:
    path: "docs/plans/{scope}/{id}.md"
    id_pattern: "{workflow}-{phase}-plan"
    template:
      frontmatter:
        required: [ title, workflow, phase ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const PLAN_TEMPLATE = `---
id: ""
type: plan
title: ""
status: draft
workflow: ""
phase: ""
element: ""
parent: ""
---

## Steps

<!-- placeholder -->
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
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

/** BDD P4.2 Background: the main `release-cycle`, bound to a release. */
const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
description: "Deliver one release"
phases:
  - name: ship
    role: developer
    actions:
      - element.set_state(released)
`;

/** A startable main that declares no element and completes from a committed file. */
const REPORT_BUG = `name: report-bug
startable: true
description: "Report a bug"
phases:
  - name: triage
    role: developer
    produces: [ "README.md" ]
`;

/** A startable main that declares no element and whose one phase is a checkpoint: never complete here. */
const CHECKLIST = `name: checklist
startable: true
phases:
  - name: tick
    role: developer
`;

/** BDD P4.2 sc. 3: a sub workflow. */
const DEV_LOOP = `name: dev-loop
kind: sub
phases:
  - name: red
    role: developer
`;

const WORKFLOWS = ['release-cycle', 'report-bug', 'checklist', 'dev-loop'];

function element(type: string, id: string, status: string): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n---\n\n## Body\n`;
}

/** A repository with the four workflows, the plan type and one release, committed. */
function writeProject(root: string, options: { plan?: boolean } = {}): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${WORKFLOWS.map((name) => `  - workflows/custom/${name}.yaml\n`).join('')}`);
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/report-bug.yaml', REPORT_BUG);
  writeFixtureFile(root, '.wingfoil/workflows/custom/checklist.yaml', CHECKLIST);
  writeFixtureFile(root, '.wingfoil/workflows/custom/dev-loop.yaml', DEV_LOOP);
  const memoryYaml = options.plan === false ? MEMORY_YAML.slice(0, MEMORY_YAML.indexOf('  plan:\n')) : MEMORY_YAML;
  writeFixtureFile(root, '.wingfoil/memory.yaml', memoryYaml);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  writeFixtureFile(root, 'docs/releases/minor-v1.md', element('release', 'minor-v1', 'in-development'));
  commitAll(root, 'fixture');
}

function operation(name: 'workflowStart' | 'workflowEnd'): CoreFn<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === name);
  if (found === undefined) throw new Error(`${name} is not registered`);
  return found.operation.fn;
}

interface StartParams {
  readonly name?: string;
  readonly element?: string;
  readonly title?: string;
  readonly set?: readonly string[];
}

async function start(root: string, params: StartParams): Promise<CoreResult<unknown>> {
  const options: Record<string, string | readonly string[]> = {};
  if (params.element !== undefined) options['element'] = params.element;
  if (params.title !== undefined) options['title'] = params.title;
  if (params.set !== undefined) options['set'] = params.set;
  return operation('workflowStart')({ root, ...(params.name === undefined ? {} : { positional: params.name }), options });
}

async function end(root: string, ref?: string): Promise<CoreResult<unknown>> {
  return operation('workflowEnd')({ root, ...(ref === undefined ? {} : { positional: ref }) });
}

const out = (root: string, args: string[]): string => git(root, args).trim();
const head = (root: string): string => out(root, ['rev-parse', 'HEAD']);
const subjects = (root: string, range: string): string[] => out(root, ['log', '--format=%s', range]).split('\n').filter((line) => line !== '');
const changedPaths = (root: string, commit: string): string[] => out(root, ['show', '--name-only', '--format=', commit]).split('\n');
const statusOf = (root: string, path: string): string | undefined => /^status: (\S+)/m.exec(readFileSync(join(root, path), 'utf-8'))?.[1];

interface InstanceView {
  readonly id: string;
  readonly workflow: string;
  readonly element: { readonly type: string; readonly id: string } | null;
  readonly context: { readonly type: string; readonly id: string } | null;
  readonly planStatus: string;
  readonly active: boolean;
}

interface StartValue {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly instance: InstanceView;
  readonly next: { readonly key: string } | null;
  readonly commits: readonly string[];
}

interface EndValue {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly ended: InstanceView;
  readonly active: InstanceView | null;
  readonly commit: string;
}

function startValue(result: CoreResult<unknown>): StartValue {
  if (!result.ok) throw new Error(`expected a start, got ${result.error.code}: ${result.error.message}`);
  return result.value as StartValue;
}

function endValue(result: CoreResult<unknown>): EndValue {
  if (!result.ok) throw new Error(`expected an end, got ${result.error.code}: ${result.error.message}`);
  return result.value as EndValue;
}

describe('workflow start and workflow end (task-217, spec-017 §7.1–§7.2)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  describe('BDD P4.2 — workflow start (AC 1)', () => {
    it('sc. 1: the instance is recorded as an active plan, becomes the active instance, and its first step is reported', async () => {
      const before = head(repo);
      const value = startValue(await start(repo, { name: 'release-cycle', element: 'release:minor-v1' }));

      expect(value.instance).toMatchObject({
        id: 'release-cycle-minor-v1-plan',
        workflow: 'release-cycle',
        element: { type: 'release', id: 'minor-v1' },
        planStatus: 'active',
        active: true,
      });
      expect(value.next?.key).toBe('release-cycle.ship@release:minor-v1');
      expect(value.baseline).toEqual({ rev: 'HEAD', commit: head(repo) });
      expect(value.commits).toEqual(out(repo, ['rev-list', '--reverse', `${before}..HEAD`]).split('\n'));

      const path = 'docs/plans/release-cycle/release-cycle-minor-v1-plan.md';
      expect(subjects(repo, `${before}..HEAD`)).toEqual(['wf(plan): submit release-cycle-minor-v1-plan', 'wf(plan): add release-cycle-minor-v1-plan']);
      const document = readFileSync(join(repo, path), 'utf-8');
      expect(document).toMatch(/^status: active$/m);
      expect(document).toMatch(/^workflow: "release-cycle"$/m);
      expect(document).toMatch(/^phase: "minor-v1"$/m);
      expect(document).toMatch(/^element: "minor-v1"$/m);
      expect(document).toMatch(/^title: "release-cycle — minor-v1"$/m);
      expect(document).toMatch(/^parent: ""$/m);
      expect(out(repo, ['status', '--porcelain'])).toBe('');
    });

    it('sc. 2: a second start makes the new instance active; the first stays open', async () => {
      startValue(await start(repo, { name: 'release-cycle', element: 'release:minor-v1' }));
      const second = startValue(await start(repo, { name: 'report-bug' }));

      expect(second.instance).toMatchObject({ workflow: 'report-bug', active: true, planStatus: 'active' });
      // Both instances are open, the second one active (spec-017 §3.3).
      const ended = endValue(await end(repo));
      expect(ended.ended.workflow).toBe('report-bug');
      expect(ended.active).toMatchObject({ id: 'release-cycle-minor-v1-plan', workflow: 'release-cycle', active: true });
    });

    it('sc. 3: a sub workflow is refused, nothing written', async () => {
      const before = head(repo);
      const result = await start(repo, { name: 'dev-loop' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ code: 'VALIDATION', message: 'cannot start a sub workflow directly: dev-loop' });
      expect(head(repo)).toBe(before);
      expect(out(repo, ['status', '--porcelain'])).toBe('');
    });

    it('an unknown workflow is NOT_FOUND `unknown workflow: <name>`, nothing written', async () => {
      const before = head(repo);
      const result = await start(repo, { name: 'ghost' });
      expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: 'unknown workflow: ghost' });
      expect(head(repo)).toBe(before);
    });
  });

  describe('plan tokens and the context element (spec-017 §3.5, §7.1, ruling R18)', () => {
    it('a workflow with no element and no active instance takes phase `1` and scope = its name', async () => {
      const value = startValue(await start(repo, { name: 'checklist' }));
      expect(value.instance).toMatchObject({ id: 'checklist-1-plan', element: null, context: null });
      expect(existsSync(join(repo, 'docs/plans/checklist/checklist-1-plan.md'))).toBe(true);
      expect(readFileSync(join(repo, 'docs/plans/checklist/checklist-1-plan.md'), 'utf-8')).toMatch(/^element: ""$/m);
    });

    it('started while the active instance has a bound element, the plan records it as the context', async () => {
      startValue(await start(repo, { name: 'release-cycle', element: 'release:minor-v1' }));
      const value = startValue(await start(repo, { name: 'report-bug' }));
      expect(value.instance).toMatchObject({ id: 'report-bug-minor-v1-plan', element: null, context: { type: 'release', id: 'minor-v1' } });
      expect(readFileSync(join(repo, 'docs/plans/report-bug/report-bug-minor-v1-plan.md'), 'utf-8')).toMatch(/^element: "minor-v1"$/m);
    });

    it('an occupied derived id takes the lowest free `-<n>` suffix (n ≥ 2), on every ref', async () => {
      startValue(await start(repo, { name: 'checklist' }));
      // A plan id held only by another branch counts too (dl-101).
      git(repo, ['checkout', '--quiet', '-b', 'elsewhere']);
      writeFixtureFile(repo, 'docs/plans/checklist/checklist-1-2-plan.md', element('plan', 'checklist-1-2-plan', 'done'));
      commitAll(repo, 'a plan on another branch');
      git(repo, ['checkout', '--quiet', 'main']);

      const value = startValue(await start(repo, { name: 'checklist' }));
      expect(value.instance.id).toBe('checklist-1-3-plan');
    });

    it('`--set phase=` and `--set scope=` override the derived tokens, `--title` the title', async () => {
      const value = startValue(await start(repo, { name: 'checklist', title: 'My checklist', set: ['phase=rel-v0.3', 'scope=rl-v1/rel-v0.3'] }));
      expect(value.instance.id).toBe('checklist-rel-v0.3-plan');
      const document = readFileSync(join(repo, 'docs/plans/rl-v1/rel-v0.3/checklist-rel-v0.3-plan.md'), 'utf-8');
      expect(document).toMatch(/^title: "My checklist"$/m);
      expect(document).toMatch(/^phase: "rel-v0.3"$/m);
    });

    it('a declared element is inherited from the active instance when its type matches', async () => {
      startValue(await start(repo, { name: 'release-cycle', element: 'release:minor-v1' }));
      // Same workflow, same element: the derived id collides, so it takes the suffix.
      const value = startValue(await start(repo, { name: 'release-cycle' }));
      expect(value.instance).toMatchObject({ id: 'release-cycle-minor-v1-2-plan', element: { type: 'release', id: 'minor-v1' } });
    });
  });

  describe('element errors and collisions (spec-017 §10, AC 4)', () => {
    it('a declared element absent, with no active instance to inherit it from', async () => {
      const before = head(repo);
      const result = await start(repo, { name: 'release-cycle' });
      expect(result.ok ? null : result.error).toMatchObject({
        code: 'VALIDATION',
        message: "workflow 'release-cycle' needs a release element: give --element release:<id>",
      });
      expect(head(repo)).toBe(before);
    });

    it('an element that does not exist at HEAD', async () => {
      const result = await start(repo, { name: 'release-cycle', element: 'release:minor-v9' });
      expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: 'element not found: release:minor-v9' });
    });

    it('an element held only by the working tree is not found (HEAD decides)', async () => {
      writeFixtureFile(repo, 'docs/releases/minor-v2.md', element('release', 'minor-v2', 'in-development'));
      const result = await start(repo, { name: 'release-cycle', element: 'release:minor-v2' });
      expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: 'element not found: release:minor-v2' });
    });

    it('an element of another type than the workflow declares', async () => {
      const result = await start(repo, { name: 'release-cycle', element: 'bug:minor-v1' });
      expect(result.ok ? null : result.error).toMatchObject({
        code: 'VALIDATION',
        message: "workflow 'release-cycle' needs a release element: give --element release:<id>",
      });
    });

    it('`--element` on a workflow that declares no element', async () => {
      const result = await start(repo, { name: 'checklist', element: 'release:minor-v1' });
      expect(result.ok ? null : result.error).toMatchObject({ code: 'VALIDATION', message: "workflow 'checklist' declares no element: --element is not accepted" });
    });

    it('a colliding `--set phase=` is CONFLICT `plan id already exists: <id>`, nothing written', async () => {
      startValue(await start(repo, { name: 'checklist' }));
      const before = head(repo);
      const result = await start(repo, { name: 'checklist', set: ['phase=1'] });
      expect(result.ok ? null : result.error).toMatchObject({ code: 'CONFLICT', message: 'plan id already exists: checklist-1-plan' });
      expect(head(repo)).toBe(before);
    });
  });

  describe('commit scope, a refused second commit, no plan type (AC 3)', () => {
    it('each of the two commits touches only the plan file', async () => {
      const before = head(repo);
      const value = startValue(await start(repo, { name: 'checklist' }));
      expect(value.commits).toHaveLength(2);
      for (const commit of value.commits) expect(changedPaths(repo, commit)).toEqual(['docs/plans/checklist/checklist-1-plan.md']);
      expect(out(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('2');
    });

    it('a refused second commit leaves the plan draft and names `wingfoil memory submit <id>`', async () => {
      // A hook that refuses the submit commit only.
      writeFixtureFile(repo, '.git/hooks/commit-msg', '#!/bin/sh\nif grep -q "^wf(plan): submit" "$1"; then echo "no submit here" >&2; exit 1; fi\nexit 0\n');
      chmodSync(join(repo, '.git/hooks/commit-msg'), 0o755);
      const before = head(repo);

      const result = await start(repo, { name: 'checklist' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('IO');
      expect(result.error.message).toMatch(/^plan checklist-1-plan was added but not submitted: run wingfoil memory submit checklist-1-plan/);
      expect(subjects(repo, `${before}..HEAD`)).toEqual(['wf(plan): add checklist-1-plan']);
      expect(statusOf(repo, 'docs/plans/checklist/checklist-1-plan.md')).toBe('draft');
      // The instance is open (draft), so `end` refuses it as not submitted.
      const ended = await end(repo);
      expect(ended.ok ? null : ended.error).toMatchObject({
        code: 'INVALID_TRANSITION',
        message: "workflow 'checklist' was not submitted: run wingfoil memory submit checklist-1-plan",
      });
    });

    it('a project whose memory.yaml declares no plan type is refused with §10\'s message', async () => {
      const bare = makeTempGitRepo();
      try {
        writeProject(bare, { plan: false });
        const before = head(bare);
        const result = await start(bare, { name: 'checklist' });
        expect(result.ok ? null : result.error).toMatchObject({
          code: 'VALIDATION',
          message: "memory type 'plan' is not declared in memory.yaml; workflow start records an instance as a plan element",
        });
        expect(head(bare)).toBe(before);
      } finally {
        removeTempDir(bare);
      }
    });
  });

  describe('BDD P4.3 — workflow end (AC 2)', () => {
    it('sc. 1: ends the active complete instance with `wf(plan): finalize <id> [active → done]`; no instance stays active', async () => {
      startValue(await start(repo, { name: 'report-bug' }));
      const before = head(repo);
      const value = endValue(await end(repo));

      expect(value.ended).toMatchObject({ id: 'report-bug-1-plan', workflow: 'report-bug' });
      expect(value.active).toBeNull();
      expect(value.commit).toBe(head(repo));
      expect(subjects(repo, `${before}..HEAD`)).toEqual(['wf(plan): finalize report-bug-1-plan [active → done]']);
      expect(changedPaths(repo, 'HEAD')).toEqual(['docs/plans/report-bug/report-bug-1-plan.md']);
      expect(statusOf(repo, 'docs/plans/report-bug/report-bug-1-plan.md')).toBe('done');
      expect((await end(repo)).ok).toBe(false);
    });

    it('sc. 2: ending the named active instance restores the previous one', async () => {
      startValue(await start(repo, { name: 'release-cycle', element: 'release:minor-v1' }));
      startValue(await start(repo, { name: 'report-bug' }));
      const value = endValue(await end(repo, 'report-bug'));
      expect(value.ended.workflow).toBe('report-bug');
      expect(value.active).toMatchObject({ workflow: 'release-cycle', active: true });
    });

    it('an instance id selects it too', async () => {
      startValue(await start(repo, { name: 'report-bug' }));
      const value = endValue(await end(repo, 'report-bug-1-plan'));
      expect(value.ended.id).toBe('report-bug-1-plan');
    });

    it('sc. 3: no open instance is NOT_FOUND `no active workflow to end`', async () => {
      const result = await end(repo);
      expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: 'no active workflow to end' });
    });

    it('a `<ref>` that names no open instance is NOT_FOUND', async () => {
      startValue(await start(repo, { name: 'report-bug' }));
      const notOpen = await end(repo, 'checklist');
      expect(notOpen.ok ? null : notOpen.error).toMatchObject({ code: 'NOT_FOUND', message: 'workflow is not open: checklist' });
      const unknown = await end(repo, 'ghost');
      expect(unknown.ok ? null : unknown.error).toMatchObject({ code: 'NOT_FOUND', message: 'unknown workflow: ghost' });
    });

    it('new scenario: an incomplete instance is refused with its current step and the `memory deprecate` hint', async () => {
      startValue(await start(repo, { name: 'release-cycle', element: 'release:minor-v1' }));
      const before = head(repo);
      const result = await end(repo);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({
        code: 'CONFLICT',
        message: "workflow 'release-cycle' is not complete: current step release-cycle.ship@release:minor-v1",
        hint: 'wingfoil memory deprecate release-cycle-minor-v1-plan abandons it',
      });
      expect(head(repo)).toBe(before);

      // Once the release is released, the instance is complete and ends.
      writeFixtureFile(repo, 'docs/releases/minor-v1.md', element('release', 'minor-v1', 'released'));
      commitAll(repo, 'wf(release): finalize minor-v1 [in-development → released]');
      expect(endValue(await end(repo)).ended.id).toBe('release-cycle-minor-v1-plan');
    });
  });
});
