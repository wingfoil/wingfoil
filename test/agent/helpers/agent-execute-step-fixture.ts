/**
 * The task-235 `agent execute` step-form fixture: task-218's project (`./agent-execute-fixture.ts`, the fake
 * adapter, two agents, the templates and directives) plus a workflow registry and open instances, so
 * `--next`, `--workflow <ref>` and `--step <key>` have a frontier to take a step from (`spec-016` §3.2 step 1,
 * `spec-017` §3.3, §4.9).
 *
 * - `delivery` (startable, bound to a `release`) iterates `loop` over the release's `backlog` tasks: with two
 *   backlog tasks its frontier holds two parallel `loop.implement@task:<id>` steps (`dl-014`), role
 *   `developer`, `mode: resume` (`spec-003` § "Execution independence"; v0.3 still runs `fresh`), whose
 *   `agent.execute` action carries the `agent` binding argv `workflow next` prints (`spec-017` §6.1).
 * - `chores` (startable, no element, adds none) has one phase with no scope: `NO_STEP_ELEMENT`.
 * - `roleless` (startable, bound to a `release`) has one phase that declares no role: `NO_STEP_ROLE`.
 * - `ghostly` ({@link GHOSTLY}, registered only by the test that wants it) has one phase whose role
 *   `dna.yaml` does not define (P5.3.2 sc. 3).
 * - `review-only` (startable, bound to a `release`) has one phase whose role is `reviewer` (P5.3.2 sc. 1).
 *
 * Which instances are open is the test's: {@link startInstance} commits one plan per call, so the latest
 * started is the active instance (`spec-017` §3.3).
 */
import { commitAll, git, writeFixtureFile } from '../../storage/helpers/git-fixture';
import { seed, TASK_ID } from './agent-execute-fixture';

export const SIBLING_ID = 'task-203-sibling';
export const RELEASE_ID = 'minor-1';

export const STEP_MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
    template:
      file: "memory/templates/task.md"
      frontmatter:
        required: [ title ]
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
  bug:
    path: "docs/04_memory/bugs/{id}.md"
    id_pattern: "bug-{n}-{slug}"
    template:
      file: "memory/templates/bug.md"
      frontmatter:
        required: [ title ]
  release:
    path: "docs/04_memory/planning/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
  plan:
    path: "docs/05_plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

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
    mode: resume
    actions:
      - element.set_state(in-progress)
      - agent.execute
  - name: review
    role: reviewer
    actions:
      - memory.submit
`;

const CHORES = `name: chores
startable: true
phases:
  - name: tidy
    role: developer
    actions:
      - agent.execute
`;

const ROLELESS = `name: roleless
startable: true
element: release
phases:
  - name: wander
    actions:
      - element.set_state(releasing)
`;

/**
 * A phase whose role `dna.yaml` does not define (P5.3.2 sc. 3). Not in {@link STEP_WORKFLOWS}: the registry
 * refuses it at load (`E_PHASE_ROLE_UNKNOWN`, task-194), so a test adds it on purpose ({@link GHOSTLY_FILE}).
 */
export const GHOSTLY = `name: ghostly
startable: true
element: release
phases:
  - name: haunt
    role: ghost
    actions:
      - element.set_state(releasing)
`;

const REVIEW_ONLY = `name: review-only
startable: true
element: release
phases:
  - name: code-review
    role: reviewer
    actions:
      - element.set_state(releasing)
`;

/** Where a test that registers {@link GHOSTLY} puts it, relative to `.wingfoil/`. */
export const GHOSTLY_FILE = 'workflows/custom/ghostly.yaml';

export const STEP_WORKFLOWS: Readonly<Record<string, string>> = {
  'workflows/custom/delivery.yaml': DELIVERY,
  'workflows/custom/loop.yaml': LOOP,
  'workflows/custom/chores.yaml': CHORES,
  'workflows/custom/roleless.yaml': ROLELESS,
  'workflows/custom/review-only.yaml': REVIEW_ONLY,
};

/** A Memory element with `status` (task-218's `elementMd` writes `draft` only), sharing the `context` tag. */
export function elementWithStatus(type: string, id: string, status: string, body: string, extra = ''): string {
  return ['---', `id: ${id}`, `type: ${type}`, `title: "${id}"`, 'release: "v0.1"', `status: ${status}`, 'tags: [ context ]', `${extra}---`, '', body, ''].join('\n');
}

/** An open instance's plan (`spec-017` §3.1): a `plan` whose `workflow` names the workflow, `element` the bound id. */
export function planMd(id: string, workflow: string, element = ''): string {
  return elementWithStatus('plan', id, 'active', '## Body', `workflow: "${workflow}"\nelement: "${element}"\n`);
}

/** The plan file of instance `id`. */
export const planPath = (id: string): string => `docs/05_plans/${id}.md`;

/**
 * task-218's project with the workflow registry, the release and both tasks in `backlog`, in one commit and
 * with no instance open; `tweak` edits the tree before that commit. `workflows` replaces the registry.
 */
export function seedStep(tweak: (repo: string) => void = () => undefined, workflows: Readonly<Record<string, string>> = STEP_WORKFLOWS): string {
  return seed((repo) => {
    writeFixtureFile(repo, '.wingfoil/memory.yaml', STEP_MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(workflows).map((file) => `  - ${file}\n`).join('')}`);
    for (const [file, content] of Object.entries(workflows)) writeFixtureFile(repo, `.wingfoil/${file}`, content);
    writeFixtureFile(repo, `docs/04_memory/planning/${RELEASE_ID}.md`, elementWithStatus('release', RELEASE_ID, 'in-development', '## Scope'));
    writeFixtureFile(repo, `docs/04_memory/v0.1/${TASK_ID}.md`, elementWithStatus('task', TASK_ID, 'backlog', '## Description\n\nOverride the next step.\n\n## Execution Notes', 'bug: []\n'));
    writeFixtureFile(repo, `docs/04_memory/v0.1/${SIBLING_ID}.md`, elementWithStatus('task', SIBLING_ID, 'backlog', '## Description\n\nA sibling.\n\n## Execution Notes', 'bug: []\n'));
    tweak(repo);
  });
}

/** Start instance `id` of `workflow` in a commit of its own (its start commit, `spec-017` §3.3). */
export function startInstance(repo: string, id: string, workflow: string, element = ''): void {
  writeFixtureFile(repo, planPath(id), planMd(id, workflow, element));
  commitAll(repo, `wf(plan): add ${id}`);
}

/** The full sha `HEAD` names. */
export const headOf = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();
