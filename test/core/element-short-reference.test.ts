/**
 * task-332 — a short element reference in the `--element` option of `workflow start`, `workflow adopt` and
 * `agent execute` (design D1 (b), approved 2026-11-01; `spec-008-cli-grammar` §7 and §12). The ten lookups of D1 (b)
 * resolve `<ref>` among the documents of `<type>` at `HEAD` and carry the FULL id on everywhere after: the plan's
 * `element` and its id, the adoption record and its `WingFoil-Adopted:` trailer, the run record and its run-log file.
 *
 * What stays exact (D1 (b), D9) is pinned too, as characterization — it passes at red and must stay green:
 * `agent list --element` (a filter, not a lookup) and the `{role}-session` Prompt (`assembleExecutionContext`).
 *
 * Fixtures: `./helpers/adopt-fixture.ts` (`workflow adopt`), `../agent/helpers/agent-execute-fixture.ts`
 * (`agent execute`, its `task-{n}-{slug}` family) and, for `workflow start`, a project of this file (a `release`
 * family `release-{n}` and a startable `release-cycle` that declares `element: release`, as the P4.2 background does).
 *
 * Red-first: today every one of them matches the frontmatter `id` exactly, so `release:release-3`, `adr:adr-3` and
 * `task:task-202` answer `element not found: <type>:<ref>`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `src/core` is imported first: with `src/core/agent-execute` imported before it, `CORE_MODULES.agent.agentList.fn` was
// undefined in this file (`TypeError: operation.fn is not a function`, observed at red), which looks like a circular import.
import { CORE_MODULES, enumerateOperations } from '../../src/core';
import type { AgentExecuteHost, AgentLaunchPlan } from '../../src/agent';
import { agentExecuteFn } from '../../src/core/agent-execute';
import { assembleExecutionContext } from '../../src/core/context';
import { runAsDryRun } from '../../src/core/dry-run';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { seed, TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { adopt, buildLifeRepo, element, finalParagraph, head, INSTANCE, messageOf, ok, start as startLife, subjectOf } from './helpers/adopt-fixture';

const CONFLICT_HINT = 'give the full id, or a longer prefix of it';

// ---------------------------------------------------------------------------------------------------------------
// workflow start --element
// ---------------------------------------------------------------------------------------------------------------

const START_MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    id_pattern: "release-{n}"
    states:
      sequence: [ draft, planning, in-development, released ]
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

const START_DNA = `version: 1.0
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

function startProject(releases: readonly string[]): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE);
  writeFixtureFile(root, '.wingfoil/memory.yaml', START_MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', START_DNA);
  for (const id of releases) writeFixtureFile(root, `docs/releases/${id}.md`, element('release', id, 'in-development'));
  commitAll(root, 'fixture');
  return root;
}

function workflowStart(root: string, elementRef: string): Promise<CoreResult<unknown>> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === 'workflowStart');
  if (found === undefined) throw new Error('workflowStart is not registered');
  return Promise.resolve(found.operation.fn({ root, positional: 'release-cycle', options: { element: elementRef } })) as Promise<CoreResult<unknown>>;
}

interface StartValue {
  readonly instance: { readonly id: string; readonly element: { readonly type: string; readonly id: string } | null };
}

describe('task-332 AC 5 — workflow start --element resolves a short reference and binds the full id (red-first)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  const project = (...releases: string[]): string => {
    const root = startProject(releases);
    roots.push(root);
    return root;
  };

  it.each([['release:release-3'], ['release:release-0003']])(
    '%s: the instance is bound to release-003 — its id, its plan file and its commits name the full id only',
    async (reference) => {
      const root = project('release-003', 'release-010');

      const result = await workflowStart(root, reference);

      const value = ok<StartValue>(result);
      expect(value.instance.element).toMatchObject({ type: 'release', id: 'release-003' });
      expect(value.instance.id).toBe('release-cycle-release-003-plan');
      const shortId = reference.slice('release:'.length);
      expect(readFileSync(join(root, 'docs/plans/release-cycle/release-cycle-release-003-plan.md'), 'utf-8')).not.toContain(shortId);
      for (const sha of git(root, ['rev-list', 'HEAD~2..HEAD']).trim().split('\n')) expect(messageOf(root, sha)).not.toContain(shortId);
    },
  );

  it('D2: release-00 is number-shaped and no release has number 0 — element not found: release:release-00, nothing written', async () => {
    const root = project('release-003', 'release-010');
    const before = head(root);
    const result = await workflowStart(root, 'release:release-00');
    expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: 'element not found: release:release-00' });
    expect(head(root)).toBe(before);
  });

  it('an ambiguous reference is CONFLICT with every candidate, and no plan is written', async () => {
    const root = project('release-5', 'release-05');
    const before = head(root);
    const unchanged = snapshotPersistence(root);

    const result = await workflowStart(root, 'release:release-005');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'CONFLICT',
      message: 'ambiguous reference: release-005 matches 2 elements',
      hint: CONFLICT_HINT,
      details: { candidates: ['release-05', 'release-5'] },
    });
    expect(head(root)).toBe(before);
    assertPersistenceUnchanged(root, unchanged, 'ambiguous --element');
  });

  it('D8: a reference nothing names keeps "element not found: release:release-9"', async () => {
    const root = project('release-003');
    const result = await workflowStart(root, 'release:release-9');
    expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: 'element not found: release:release-9' });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// workflow adopt --element
// ---------------------------------------------------------------------------------------------------------------

/** `./helpers/adopt-fixture.ts`'s `memory.yaml` with the `adr` family `adr-{n}-{slug}`, so a number can name an adr. */
const ADOPT_MEMORY_YAML = `version: 1.0
types:
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
  release-line:
    path: "docs/planning/{id}.md"
    states:
      sequence: [ draft, planning, active ]
      gates:
        planning: { reject: draft }
  adr:
    path: "docs/adrs/{id}.md"
    id_pattern: "adr-{n}-{slug}"
    states:
      sequence: [ draft, pending, accepted ]
      gates:
        pending: { reject: draft }
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, done ]
`;

describe('task-332 AC 5 — workflow adopt --element resolves a short reference and records the full id (red-first)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  it('a unique prefix: release-line:rl-v adopts rl-v1, the subject and the WingFoil-Adopted: trailer name rl-v1', async () => {
    const root = buildLifeRepo();
    roots.push(root);
    await startLife(root);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v', reason: 'created by hand' } });

    expect(ok<{ adopted: readonly { element: { type: string; id: string } }[] }>(result).adopted.map((entry) => entry.element.id)).toEqual(['rl-v1']);
    expect(subjectOf(root)).toBe(`workflow: adopt ${INSTANCE} life.seed release-line:rl-v1`);
    expect(finalParagraph(root)).toContain('WingFoil-Adopted: release-line:rl-v1');
    expect(messageOf(root)).not.toMatch(/release-line:rl-v(?!1)/);
  });

  it('a number: adr:adr-3 adopts adr-003-adopt-me, the record names the full id', async () => {
    const root = buildLifeRepo({
      phases: ['adr', 'close'],
      documents: {
        '.wingfoil/memory.yaml': ADOPT_MEMORY_YAML,
        'docs/adrs/adr-003-adopt-me.md': element('adr', 'adr-003-adopt-me', 'draft'),
        'docs/adrs/adr-030-another.md': element('adr', 'adr-030-another', 'draft'),
      },
    });
    roots.push(root);
    await startLife(root);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.adr', element: 'adr:adr-3', reason: 'created by hand' } });

    expect(ok<{ adopted: readonly { element: { id: string } }[] }>(result).adopted.map((entry) => entry.element.id)).toEqual(['adr-003-adopt-me']);
    expect(subjectOf(root)).toBe(`workflow: adopt ${INSTANCE} life.adr adr:adr-003-adopt-me`);
    expect(finalParagraph(root)).toContain('WingFoil-Adopted: adr:adr-003-adopt-me');
    expect(messageOf(root).split(/\s+/)).not.toContain('adr:adr-3');
  });

  it('an ambiguous reference is CONFLICT with every candidate, and no record is written', async () => {
    const root = buildLifeRepo({
      phases: ['adr', 'close'],
      documents: {
        '.wingfoil/memory.yaml': ADOPT_MEMORY_YAML,
        'docs/adrs/adr-003-first.md': element('adr', 'adr-003-first', 'draft'),
        'docs/adrs/adr-003-second.md': element('adr', 'adr-003-second', 'draft'),
      },
    });
    roots.push(root);
    await startLife(root);
    const unchanged = snapshotPersistence(root);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.adr', element: 'adr:adr-3', reason: 'x' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'CONFLICT',
      message: 'ambiguous reference: adr-3 matches 2 elements',
      hint: CONFLICT_HINT,
      details: { candidates: ['adr-003-first', 'adr-003-second'] },
    });
    assertPersistenceUnchanged(root, unchanged, 'ambiguous adopt --element');
  });

  it('D8: a reference nothing names keeps "element not found: release-line:rl-v9"', async () => {
    const root = buildLifeRepo();
    roots.push(root);
    await startLife(root);
    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v9', reason: 'x' } });
    expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: 'element not found: release-line:rl-v9' });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// agent execute --element, and what stays exact
// ---------------------------------------------------------------------------------------------------------------

const HOST: AgentExecuteHost = { mcpServer: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] }, isTerminal: () => false };

async function execute(root: string, elementRef: string, real = false): Promise<CoreResult<unknown>> {
  const call = () => agentExecuteFn({ root, options: { element: elementRef, role: 'developer' }, host: HOST });
  return real ? call() : runAsDryRun(call);
}

describe('task-332 AC 5 — agent execute --element resolves a short reference and records the full id (red-first)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  const project = (tweak?: (repo: string) => void): string => {
    const root = seed(tweak);
    roots.push(root);
    return root;
  };

  it.each([
    ['a number', 'task:task-202'],
    ['a number, padded', 'task:task-0202'],
    ['a unique prefix', 'task:task-202-explicit'],
  ])('%s (%s): the dry-run plan names the full id in its subject, path and run id', async (_kind, reference) => {
    const root = project();

    const result = await execute(root, reference);

    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    const plan = result.value as AgentLaunchPlan;
    expect(plan.subject).toBe(`agent: record ${TASK_ID}/adhoc/1`);
    expect(plan.paths).toEqual([`docs/runs/${TASK_ID}.jsonl`]);
    expect(plan.run.id).toBe(`${TASK_ID}/adhoc/1`);
    expect(JSON.stringify(plan)).not.toContain(reference.slice('task:'.length) + '/');
    expect(plan.run).toMatchObject({ element: `task:${TASK_ID}` });
  }, 60000);

  it('an ambiguous reference is CONFLICT with every candidate, nothing written', async () => {
    const root = project((repo) => writeFixtureFile(repo, 'docs/04_memory/v0.1/task-202-explicit-other.md', element('task', 'task-202-explicit-other', 'draft')));
    const unchanged = snapshotPersistence(root);

    const result = await execute(root, 'task:task-202');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'CONFLICT',
      message: 'ambiguous reference: task-202 matches 2 elements',
      hint: CONFLICT_HINT,
      details: { candidates: ['task-202-explicit-other', TASK_ID] },
    });
    assertPersistenceUnchanged(root, unchanged, 'ambiguous agent execute --element');
  }, 60000);

  it('D8: a reference nothing names keeps "element not found: task:task-999"', async () => {
    const root = project();
    const result = await execute(root, 'task:task-999');
    expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: 'element not found: task:task-999' });
  }, 60000);
});

describe('task-332 D1 (b) (characterization) — agent list --element and the session Prompt stay exact', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  interface ListValue {
    readonly past?: readonly { readonly id: string; readonly element: string }[];
  }

  async function listPast(root: string, elementRef: string): Promise<readonly { id: string; element: string }[]> {
    const operation = CORE_MODULES.find((module) => module.name === 'agent')?.operations['agentList'];
    if (!operation) throw new Error('"agentList" is not registered on the agent module');
    const value = await (operation.fn as CoreFn<unknown, ListValue>)({ root, options: { element: elementRef }, past: true });
    const result = (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<ListValue>;
    if (!result.ok) throw new Error(`agent list refused: ${result.error.message}`);
    return result.value.past ?? [];
  }

  it('agent list --element task:task-202 lists nothing while task:<full id> lists the recorded run (an equality filter)', async () => {
    const root = seed();
    roots.push(root);
    const launched = await execute(root, `task:${TASK_ID}`, true);
    if (!launched.ok) throw new Error(`${launched.error.code}: ${launched.error.message}`);

    expect((await listPast(root, `task:${TASK_ID}`)).map((record) => record.id)).toEqual([`${TASK_ID}/adhoc/1`]);
    expect(await listPast(root, 'task:task-202')).toEqual([]);
    expect(await listPast(root, 'task:task-202-explicit')).toEqual([]);
  }, 60000);

  it('the {role}-session Prompt (assembleExecutionContext) does not resolve a short element: element \'task:task-202\' not found', () => {
    const root = seed();
    roots.push(root);
    const sha = git(root, ['rev-parse', 'HEAD']).trim();

    const result = assembleExecutionContext(root, { role: 'developer', element: { type: 'task', id: 'task-202' }, stateRef: 'HEAD' });

    expect(result.ok ? null : result.error).toMatchObject({ code: 'NOT_FOUND', message: `element 'task:task-202' not found at ${sha}` });
  }, 60000);
});
