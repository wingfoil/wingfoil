/**
 * task-294 — the fixture of the `workflow adopt` suites (P4.21, `spec-017` §7.11, BDD P4.21's Background): a
 * startable main `life` whose first phase `seed` adds a `release-line` (`memory.add(type: release-line, version:
 * "v1")`, as `sw-life-cycle.seed-first-release-line` does), on a repository where `rl-v1` was committed in
 * `planning`, by hand, before the instance started — so nothing links it to a step.
 *
 * The phases after `seed` vary per suite ({@link PHASES}); the step keys after `seed` carry the instance's
 * context element (`life.close@release-line:rl-v1` once `rl-v1` counts as created, measured on the code build at
 * red). `WingFoil Test` (the fixture's git identity) holds no `approver` role; Morgan does (as in
 * `test/core/workflow-finalize-bdd.test.ts`).
 *
 * The operations are reached through the registered `CORE_MODULES` entries, never by importing the module that
 * implements them, so a suite fails per test (`workflowAdopt is not registered`) until it is registered.
 */
import { CORE_MODULES, enumerateOperations } from '../../../src/core';
import type { CoreFn, CoreOperation } from '../../../src/core/registry';
import type { CoreResult } from '../../../src/core/types';
import { commitAll, git, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';

export const INSTANCE = 'life-1-plan';
export const SUBJECT_RL_V1 = `workflow: adopt ${INSTANCE} life.seed release-line:rl-v1`;

export const MORGAN = { name: 'Morgan', email: 'morgan@example.invalid' } as const;
export const DEVELOPER = { name: 'WingFoil Test', email: 'wf-test@example.invalid' } as const;
export const MORGAN_APPROVER_LINE = 'Approver: Morgan <morgan@example.invalid> (approver)';
export const BULK_REFUSAL = 'user not authorized to apply adoptions in bulk';

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
    path: "docs/planning/{id}.md"
    states:
      sequence: [ draft, planning, active ]
      gates:
        planning: { reject: draft }
  adr:
    path: "docs/adrs/{id}.md"
    states:
      sequence: [ draft, pending, accepted ]
      gates:
        pending: { reject: draft }
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, done ]
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
      roles: [ reviewer, approver ]
  roles:
    - name: developer
    - name: reviewer
    - name: approver
paths:
  sources: [ src/ ]
`;

/** The phases the suites compose `life` from. */
export const PHASES = {
  /** Adds the release-line `version: "v1"` (`sw-life-cycle.seed-first-release-line`'s declared rule). */
  seed: `  - name: seed
    role: developer
    actions:
      - 'memory.add(type: release-line, version: "v1")'
      - memory.submit
`,
  /** Adds an adr, no declared field. */
  adr: `  - name: adr
    role: developer
    actions:
      - 'memory.add(type: adr)'
`,
  /** Adds a task, no declared field. */
  note: `  - name: note
    role: developer
    actions:
      - 'memory.add(type: task)'
`,
  /** Holds the release-line at its gate state `planning` until the approver approves it. */
  approve: `  - name: approve
    role: reviewer
    approval: { by_role: approver }
    actions:
      - memory.approve
`,
  /** A checkpoint: no Memory or file evidence, completed only by a record. */
  close: `  - name: close
    role: developer
`,
} as const;

/** `life` from the named phases, in order. */
export function lifeYaml(phases: readonly (keyof typeof PHASES)[], name = 'life'): string {
  return `name: ${name}\nstartable: true\nphases:\n${phases.map((phase) => PHASES[phase]).join('')}`;
}

/** A Memory document. */
export function element(type: string, id: string, status: string, extra: Record<string, string> = {}): string {
  const fields = Object.entries(extra)
    .map(([key, value]) => `${key}: "${value}"\n`)
    .join('');
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${fields}---\n\n## Body\n`;
}

export const RL_V1_PATH = 'docs/planning/rl-v1.md';

export interface LifeRepo {
  /** The phases of `life`; default `seed`, `close`. */
  readonly phases?: readonly (keyof typeof PHASES)[];
  /** More workflow files, by name, each included after `life`. */
  readonly workflows?: Readonly<Record<string, string>>;
  /** More documents, by path, committed with `rl-v1` before the instance starts. */
  readonly documents?: Readonly<Record<string, string>>;
}

/** The fixture repository, committed (`rl-v1` in `planning`, `version: v1`), no instance started yet. */
export function buildLifeRepo(options: LifeRepo = {}): string {
  const root = makeTempGitRepo();
  const workflows = { life: lifeYaml(options.phases ?? ['seed', 'close']), ...(options.workflows ?? {}) };
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(workflows).map((name) => `  - workflows/custom/${name}.yaml\n`).join('')}`);
  for (const [name, yaml] of Object.entries(workflows)) writeFixtureFile(root, `.wingfoil/workflows/custom/${name}.yaml`, yaml);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, RL_V1_PATH, element('release-line', 'rl-v1', 'planning', { version: 'v1' }));
  for (const [path, content] of Object.entries(options.documents ?? {})) writeFixtureFile(root, path, content);
  commitAll(root, 'fixture: configuration and the pre-engine release-line');
  return root;
}

type WorkflowOperation = 'workflowStart' | 'workflowNext' | 'workflowStatus' | 'workflowFinalize' | 'workflowAdopt';

/** The registered `workflow` operation `name`; throws `<name> is not registered` when it is not. */
export function workflowOperation(name: WorkflowOperation): CoreOperation<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === name);
  if (found === undefined) throw new Error(`${name} is not registered`);
  return found.operation as CoreOperation<unknown, unknown>;
}

export interface Invocation {
  readonly positional?: string;
  readonly options?: Readonly<Record<string, string | readonly string[]>>;
  readonly flags?: Readonly<Record<string, boolean>>;
}

/** Call the registered operation `name` in-process, as the CLI adapter calls it. */
export async function call(name: WorkflowOperation, root: string, invocation: Invocation = {}): Promise<CoreResult<unknown>> {
  const fn = workflowOperation(name).fn as CoreFn<unknown, unknown>;
  return (await fn({
    root,
    ...(invocation.positional === undefined ? {} : { positional: invocation.positional }),
    options: invocation.options ?? {},
    ...(invocation.flags === undefined ? {} : { flags: invocation.flags }),
  })) as CoreResult<unknown>;
}

/** `workflowAdopt` in-process. */
export function adopt(root: string, invocation: Invocation): Promise<CoreResult<unknown>> {
  return call('workflowAdopt', root, invocation);
}

/** What a call did: returned a result, or threw (a `UsageError`, exit 2). */
export type Outcome = { readonly result: CoreResult<unknown> } | { readonly thrown: unknown };

export async function outcomeOf(run: () => Promise<CoreResult<unknown>>): Promise<Outcome> {
  try {
    return { result: await run() };
  } catch (error) {
    return { thrown: error };
  }
}

export function ok<T>(result: CoreResult<unknown>): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}: ${result.error.message}`);
  return result.value as T;
}

/** Start `life` (or `workflow`) and answer its instance id. */
export async function start(root: string, workflow = 'life', set?: string): Promise<string> {
  return ok<{ instance: { id: string } }>(await call('workflowStart', root, { positional: workflow, options: set === undefined ? {} : { set: [set] } })).instance.id;
}

/** Run `fn` with `GIT_AUTHOR_*` naming `who`, and restore the environment after. */
export async function as<T>(who: { readonly name: string; readonly email: string }, fn: () => Promise<T>): Promise<T> {
  const saved = { name: process.env.GIT_AUTHOR_NAME, email: process.env.GIT_AUTHOR_EMAIL };
  process.env.GIT_AUTHOR_NAME = who.name;
  process.env.GIT_AUTHOR_EMAIL = who.email;
  try {
    return await fn();
  } finally {
    if (saved.name === undefined) delete process.env.GIT_AUTHOR_NAME;
    else process.env.GIT_AUTHOR_NAME = saved.name;
    if (saved.email === undefined) delete process.env.GIT_AUTHOR_EMAIL;
    else process.env.GIT_AUTHOR_EMAIL = saved.email;
  }
}

export const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();
export const commitCount = (root: string): number => Number(git(root, ['rev-list', '--count', 'HEAD']).trim());
export const messageOf = (root: string, rev = 'HEAD'): string => git(root, ['log', '-1', '--format=%B', rev]).trim();
export const subjectOf = (root: string, rev = 'HEAD'): string => git(root, ['log', '-1', '--format=%s', rev]).trim();
/** The paths a commit changes (`''` for none). */
export const changedPaths = (root: string, rev = 'HEAD'): string => git(root, ['show', '--name-only', '--format=', rev]).trim();
export const blobOf = (root: string, path: string, rev = 'HEAD'): string => git(root, ['rev-parse', `${rev}:${path}`]).trim();
/** The lines of a commit message's final paragraph — the one git reads trailers from. */
export const finalParagraph = (root: string, rev = 'HEAD'): string[] => messageOf(root, rev).split('\n\n').pop()!.split('\n');

/**
 * An adoption record written by hand, exactly as `workflow adopt` writes it (`spec-017` §7.11): an empty commit,
 * the subject, a `Reason:` body, then the trailer paragraph.
 */
export function adoptionByHand(root: string, instance: string, step: string, ref: string): string {
  git(root, ['commit', '--allow-empty', '--quiet', '--cleanup=whitespace', '-m', `workflow: adopt ${instance} ${step} ${ref}`, '-m', 'Reason: created by hand before the engine', '-m', `WingFoil-Instance: ${instance}\nWingFoil-Step: ${step}\nWingFoil-Adopted: ${ref}`]);
  return head(root);
}

/** A step linkage written by hand (`spec-017` §4.8): an add commit of `path` carrying the step trailers. */
export function linkedAddByHand(root: string, path: string, content: string, type: string, id: string, instance: string, step: string): string {
  writeFixtureFile(root, path, content);
  git(root, ['add', '--', path]);
  git(root, ['commit', '--quiet', '--cleanup=whitespace', '-m', `wf(${type}): add ${id}`, '-m', `WingFoil-Instance: ${instance}\nWingFoil-Step: ${step}`]);
  return head(root);
}

/** The views of the payloads the suites read (`spec-017` §8). */
export interface ElementRefView {
  readonly type: string;
  readonly id: string;
  readonly status: string;
}
export interface StepView {
  readonly key: string;
  readonly awaiting: { readonly kind: string; readonly elements?: readonly ElementRefView[] } | null;
}
export interface NextView {
  readonly next: StepView | null;
}
export interface AdoptionView {
  readonly step: string;
  readonly element: ElementRefView;
  readonly commit: string | null;
}
export interface AdoptResultView {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly instance: { readonly id: string; readonly workflow: string };
  readonly adopted: readonly AdoptionView[];
  readonly next: StepView | null;
}
export interface AdoptPlanView {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly instance: { readonly id: string; readonly workflow: string };
  readonly steps: readonly { readonly step: string; readonly type: string; readonly candidates: readonly ElementRefView[]; readonly recorded: boolean }[];
  readonly orphans: readonly { readonly commit: string; readonly key: string; readonly element: ElementRefView | null }[];
  readonly applied: readonly AdoptionView[];
}

export const RL_V1: ElementRefView = { type: 'release-line', id: 'rl-v1', status: 'planning' };
