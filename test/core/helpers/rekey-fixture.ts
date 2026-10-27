/**
 * task-295 (P4.21, `dl-187` C5; `spec-017` §4.8, §7.12, §10) — the fixture the `workflow rekey` suites share
 * (`test/core/workflow-rekey.test.ts`, `test/core/workflow-rekey-bdd.test.ts`,
 * `test/cli/workflow-rekey.integration.test.ts`), as the design of task-295 lays it out:
 *
 * - `memory.yaml`: `plan` and `release-line` (`docs/rl/{id}.md`, `draft → planning → active`);
 * - `dna.yaml`: `WingFoil Test` (the fixture's `user.*`) as `developer`, `Morgan` as `approver`;
 * - `rl-v1` committed at `planning` before any instance starts, with no linkage;
 * - a startable workflow `life`: `seed` (adds a release-line, so `created` is its only evidence) and `close`
 *   (role approver, a checkpoint);
 * - the instance `life-1-plan`, started through the registered `workflowStart`;
 * - the adoption of `release-line:rl-v1` into `life.seed`, written BY HAND with the exact commit `task-294`'s
 *   writer produces (design D8), so these suites do not depend on `workflow adopt`;
 * - then `seed` renamed `seed-line` in `life.yaml`, committed.
 *
 * Not a `.test.ts` file, so Jest never collects it as a suite.
 */
import { enumerateOperations, CORE_MODULES } from '../../../src/core';
import type { CoreFn } from '../../../src/core/registry';
import type { CoreResult } from '../../../src/core/types';
import { commitAll, git, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';

export const MORGAN = { name: 'Morgan', email: 'morgan@example.invalid' } as const;

const MEMORY_YAML = `version: 1.0
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
    path: "docs/rl/{id}.md"
    states:
      sequence: [ draft, planning, active ]
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
    - name: Morgan
      email: morgan@example.invalid
      roles: [ approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

export const LIFE_FILE = '.wingfoil/workflows/custom/life.yaml';

/** The workflow `life`, its first phase named `seed`. */
export function lifeYaml(seed: string): string {
  return `name: life
startable: true
phases:
  - name: ${seed}
    role: developer
    actions:
      - 'memory.add(type: release-line, version: "v1")'
  - name: close
    role: approver
`;
}

function releaseLine(id: string, status: string): string {
  return `---\nid: "${id}"\ntype: release-line\ntitle: "${id}"\nstatus: ${status}\n---\n\n## Body\n`;
}

export type WorkflowOperation = 'workflowStart' | 'workflowNext' | 'workflowEnd' | 'workflowRekey';

/** The registered `CORE_MODULES` operation `workflow.<name>`, looked up by name. */
export function operation(name: WorkflowOperation): CoreFn<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === name);
  if (found === undefined) throw new Error(`${name} is not registered`);
  return found.operation.fn;
}

/** Call `workflow.<name>` in process, as the CLI and MCP adapters do. */
export async function call(name: WorkflowOperation, root: string, positional?: string, options: Record<string, unknown> = {}): Promise<CoreResult<unknown>> {
  return (await operation(name)({ root, ...(positional === undefined ? {} : { positional }), options })) as CoreResult<unknown>;
}

/** The value of a successful result; a refusal throws with its code and message. */
export function ok<T>(result: CoreResult<unknown>): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}: ${result.error.message}`);
  return result.value as T;
}

/** Run `fn` with `GIT_AUTHOR_*` naming Morgan, the approver, and restore the environment after. */
export async function asMorgan<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { name: process.env.GIT_AUTHOR_NAME, email: process.env.GIT_AUTHOR_EMAIL };
  process.env.GIT_AUTHOR_NAME = MORGAN.name;
  process.env.GIT_AUTHOR_EMAIL = MORGAN.email;
  try {
    return await fn();
  } finally {
    if (saved.name === undefined) delete process.env.GIT_AUTHOR_NAME;
    else process.env.GIT_AUTHOR_NAME = saved.name;
    if (saved.email === undefined) delete process.env.GIT_AUTHOR_EMAIL;
    else process.env.GIT_AUTHOR_EMAIL = saved.email;
  }
}

/** Commit the working tree (or nothing) with `subject`, an optional body paragraph and a final trailer paragraph. */
export function commitWith(root: string, subject: string, trailers: Record<string, string>, body?: string): string {
  git(root, ['add', '-A']);
  const block = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  git(root, ['commit', '--allow-empty', '--quiet', '--cleanup=whitespace', '-m', subject, ...(body === undefined ? [] : ['-m', body]), ...(block === '' ? [] : ['-m', block])]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

/** The adoption record `task-294`'s writer produces (`spec-017` §4.8), written by hand (design D8). */
export function adoptByHand(root: string, instance: string, step: string, ref: string): string {
  return commitWith(
    root,
    `workflow: adopt ${instance} ${step} ${ref}`,
    { 'WingFoil-Instance': instance, 'WingFoil-Step': step, 'WingFoil-Adopted': ref, 'WingFoil-Version': '0.0.0 (test)' },
    'Reason: created by hand before the engine',
  );
}

/** Rename `life`'s first phase from `from` to `to` and commit the change. */
export function renamePhase(root: string, from: string, to: string): void {
  writeFixtureFile(root, LIFE_FILE, lifeYaml(to));
  commitAll(root, `rename life.${from} to life.${to}`);
}

export interface RekeyFixtureOptions {
  /** Also start `life-2-plan` (`--set phase=2`) before the adoption, so its walk holds `life-1-plan`'s adoption. */
  readonly secondInstance?: boolean;
  /** Run after the adoption and before the rename (records that name `life.seed`). */
  readonly beforeRename?: (root: string) => void;
}

/** Build the fixture described in the module doc; answers the repository root. */
export async function buildRekeyRepo(options: RekeyFixtureOptions = {}): Promise<string> {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/life.yaml\n');
  writeFixtureFile(root, LIFE_FILE, lifeYaml('seed'));
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'docs/rl/rl-v1.md', releaseLine('rl-v1', 'planning'));
  commitAll(root, 'fixture');

  const first = ok<{ instance: { id: string } }>(await call('workflowStart', root, 'life')).instance.id;
  if (first !== 'life-1-plan') throw new Error(`fixture: expected life-1-plan, started ${first}`);
  if (options.secondInstance === true) {
    const second = ok<{ instance: { id: string } }>(await call('workflowStart', root, 'life', { set: ['phase=2'] })).instance.id;
    if (second !== 'life-2-plan') throw new Error(`fixture: expected life-2-plan, started ${second}`);
  }
  adoptByHand(root, 'life-1-plan', 'life.seed', 'release-line:rl-v1');
  options.beforeRename?.(root);
  renamePhase(root, 'seed', 'seed-line');
  return root;
}

/** The root-relative path of the instance plan `id` at `HEAD`. */
export function planPath(root: string, id: string): string {
  const found = git(root, ['ls-files', 'docs/plans'])
    .split('\n')
    .find((path) => path.endsWith(`/${id}.md`));
  if (found === undefined) throw new Error(`no plan ${id}`);
  return found;
}
