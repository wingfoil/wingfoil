/**
 * task-376 AC 1 and AC 4 — what `workflow next`, `workflow status` and `workflow show` offer, through the exported
 * core API (`spec-017` §6.1, §7.6, §8).
 *
 * - AC 1 (`bug-486`): `evidence.manualOnly` on a step built by `buildStep`, for each combination of evidence kinds the
 *   design names; a `run`-bound and a `manual`-bound checkpoint answer alike; the payload of `next` and of `status`
 *   carries the mark; the console of `next` and of `status` prints it.
 * - AC 4 (`bug-479`): `workflow show`'s built-in bindings are whole commands with placeholders.
 *
 * The field is read through a local type, so these suites typecheck before and after the field ships: the red is the
 * assertion. AC 2, AC 3 and AC 5 run on the compiled CLI: `test/cli/workflow-next-offers.integration.test.ts`.
 */
import {
  buildStep,
  CORE_MODULES,
  renderNextConsole,
  renderStatusConsole,
  type NextResult,
  type StatusResult,
  type Step,
} from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import type { DeducedStep } from '../../src/workflow/deduce';
import type { Workflow } from '../../src/workflow/schema';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  bug:
    path: "docs/bugs/{id}.md"
    id_pattern: "bug-{n}-{slug}"
    states:
      sequence: [ draft, pending, approved ]
      gates:
        pending: { reject: draft }
  task:
    path: "docs/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
    states:
      sequence: [ draft, pending, approved ]
      gates:
        pending: { reject: draft }
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
    - name: Morgan
      email: morgan@example.invalid
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

const BINDINGS_YAML = `version: 1.0
actions:
  ops.run_it: { run: [echo, done] }
  ops.confirm: { manual: true }
`;

const CP_RUN = `name: cp-run
startable: true
phases:
  - name: checkpoint
    actions:
      - ops.run_it
`;

const CP_MANUAL = `name: cp-manual
startable: true
phases:
  - name: checkpoint
    actions:
      - ops.confirm
`;

const SHOWN = `name: shown
startable: true
phases:
  - name: all
    actions:
      - 'memory.add(type: bug)'
      - 'memory.add(type: task)'
      - memory.submit
      - memory.approve
      - memory.reject
      - memory.deprecate
      - agent.execute
      - config.init
`;

const WORKFLOWS: Record<string, string> = {
  'workflows/custom/cp-run.yaml': CP_RUN,
  'workflows/custom/cp-manual.yaml': CP_MANUAL,
  'workflows/custom/shown.yaml': SHOWN,
};

function plan(id: string, workflow: string): string {
  return `---\nid: "${id}"\ntype: plan\ntitle: "${id}"\nstatus: active\nworkflow: "${workflow}"\nphase: "x"\n---\n\n## Body\n`;
}

function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(WORKFLOWS).map((file) => `  - ${file}\n`).join('')}`);
  for (const [file, content] of Object.entries(WORKFLOWS)) writeFixtureFile(root, `.wingfoil/${file}`, content);
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture configuration');
  writeFixtureFile(root, 'docs/plans/cp-run-plan.md', plan('cp-run-plan', 'cp-run'));
  commitAll(root, 'wf(plan): add cp-run-plan');
  writeFixtureFile(root, 'docs/plans/cp-manual-plan.md', plan('cp-manual-plan', 'cp-manual'));
  commitAll(root, 'wf(plan): add cp-manual-plan');
}

function operation(name: 'workflowNext' | 'workflowStatus' | 'workflowShow') {
  const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations[name];
  if (op === undefined) throw new Error(`workflow.${name} is not registered in CORE_MODULES`);
  return op;
}

async function value<T>(name: 'workflowNext' | 'workflowStatus' | 'workflowShow', root: string, positional?: string): Promise<T> {
  const raw = await operation(name).fn({ root, ...(positional === undefined ? {} : { positional }) });
  const result = (typeof raw === 'object' && raw !== null && 'ok' in raw ? raw : { ok: true, value: raw }) as CoreResult<T>;
  if (!result.ok) throw new Error(`${name} refused: ${result.error.message}`);
  return result.value;
}

/** The evidence as `spec-017` §8 declares it, whatever the `Step` type holds at this commit. */
interface MarkedEvidence {
  kinds: string[];
  missing: string[];
  finalizable: boolean;
  manualOnly?: boolean;
}
const evidenceOf = (step: Step): MarkedEvidence => step.evidence as unknown as MarkedEvidence;

const BUG = { type: 'bug', id: 'bug-1', status: 'draft' };

function built(kinds: string[], missing: string[], finalizable: boolean, created: unknown[]): Step {
  const workflow = { name: 'loop', phases: [{ name: 'gate', optional: false, cadence: 'once' }] } as unknown as Workflow;
  const deduced = {
    key: 'loop.gate',
    instance: 'rc-1',
    trail: [],
    workflow: 'loop',
    phase: 'gate',
    scope: null,
    role: null,
    optional: false,
    produces: [],
    created,
    evidence: { kinds, missing, finalizable },
    reentered: false,
    reentryCommit: null,
    actions: [],
  } as unknown as DeducedStep;
  return buildStep(deduced, { workflows: [workflow], memoryYaml: null, dnaYaml: null, bindings: null, rolesYaml: null, directiveFiles: [] });
}

describe('task-376 AC 1 — evidence.manualOnly marks a finalizable step no checkable evidence stands behind (bug-486, spec-017 §6.1)', () => {
  it.each<[string, string[], string[], boolean, unknown[], boolean]>([
    ['[record]', ['record'], ['record'], true, [], true],
    ['[awaits, record]', ['awaits', 'record'], ['record'], true, [], true],
    ['[created, record] with nothing created', ['created', 'record'], ['record'], true, [], true],
    ['[created, record] with an element created', ['created', 'record'], ['record'], true, [BUG], false],
    ['[state, record]', ['state', 'record'], ['record'], true, [], false],
    ['[record], not finalizable', ['record'], [], false, [], false],
    ['[state], not finalizable', ['state'], ['state'], false, [], false],
  ])('%s', (_name, kinds, missing, finalizable, created, manualOnly) => {
    expect(evidenceOf(built(kinds, missing, finalizable, created))).toEqual({ kinds, missing, finalizable, manualOnly });
  });
});

describe('task-376 AC 1 — the mark in the payload and on the console of next and status (bug-486, spec-017 §6.1, §8)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it.each([['cp-run'], ['cp-manual']])('workflow next: the checkpoint of %s is manual only, whatever its binding kind', async (name) => {
    const result = await value<NextResult>('workflowNext', repo, name);
    expect(evidenceOf(result.next!)).toEqual({ kinds: ['record'], missing: ['record'], finalizable: true, manualOnly: true });
  });

  it('workflow status: each frontier step carries the mark in its payload', async () => {
    const result = await value<StatusResult>('workflowStatus', repo);
    const steps = result.open.flatMap((entry) => entry.frontier);
    expect(steps.map((step) => [step.key, evidenceOf(step).manualOnly]).sort()).toEqual([
      ['cp-manual.checkpoint', true],
      ['cp-run.checkpoint', true],
    ]);
  });

  it('the console of next keeps (finalizable) and appends the manual-only sentence to the evidence line', async () => {
    const result = await value<NextResult>('workflowNext', repo, 'cp-run');
    expect(renderNextConsole(result).split('\n')).toContain('  evidence missing: record (finalizable) manual only: no evidence checks this step');
  });

  it('the console of next prints no such sentence for a finalizable step that evidence checks', () => {
    const step = built(['state', 'record'], ['record'], true, []);
    const result: NextResult = { baseline: { rev: 'HEAD', commit: 'abc' }, instance: null, complete: false, next: step, more: [], diagnostics: [] };
    const text = renderNextConsole(result);
    expect(text.split('\n')).toContain('  evidence missing: record (finalizable)');
    expect(text).not.toContain('manual only');
  });

  it('the console of status appends "; manual only" to the line of a manual-only step, and to no other', async () => {
    const result = await value<StatusResult>('workflowStatus', repo);
    const lineOf = (text: string): string => text.split('\n').find((line) => line.startsWith('      - cp-run.checkpoint')) ?? '';
    expect(lineOf(renderStatusConsole(result))).toContain('; manual only');

    const unmarked = {
      ...result,
      open: result.open.map((entry) => ({
        ...entry,
        frontier: entry.frontier.map((step) => ({ ...step, evidence: { ...step.evidence, manualOnly: false } })),
      })),
    } as unknown as StatusResult;
    expect(lineOf(renderStatusConsole(unmarked))).not.toBe('');
    expect(lineOf(renderStatusConsole(unmarked))).not.toContain('manual only');
  });
});

describe('task-376 AC 4 — workflow show prints a built-in binding as a whole command with placeholders (bug-479, spec-017 §7.6)', () => {
  let repo: string;
  let argvByAction: Map<string, string[] | undefined>;
  beforeAll(async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    const shown = await value<{ workflow: { phases: { actions: { token: string; binding: { argv?: string[] } }[] }[] } }>('workflowShow', repo, 'shown');
    argvByAction = new Map(shown.workflow.phases[0]!.actions.map((action) => [action.token, action.binding.argv]));
  });
  afterAll(() => removeTempDir(repo));

  it.each<[string, string[]]>([
    ['memory.submit', ['wingfoil', 'memory', 'submit', '<id>']],
    ['memory.approve', ['wingfoil', 'memory', 'approve', '<id>', '--reason', '<reason>']],
    ['memory.reject', ['wingfoil', 'memory', 'reject', '<id>', '--reason', '<reason>']],
    ['memory.deprecate', ['wingfoil', 'memory', 'deprecate', '<id>']],
    ['memory.add(type: bug)', ['wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', '--workflow', '<instance-id>', '--step', '<key>']],
    [
      'memory.add(type: task)',
      ['wingfoil', 'memory', 'add', '--type', 'task', '--title', '<title>', '--set', 'release=<release>', '--workflow', '<instance-id>', '--step', '<key>'],
    ],
    ['agent.execute', ['wingfoil', 'agent', 'execute', '--workflow', '<instance-id>', '--step', '<key>']],
  ])('%s', (token, argv) => {
    expect(argvByAction.get(token)).toEqual(argv);
  });

  it('config.init stays wingfoil init: it takes no operand', () => {
    expect(argvByAction.get('config.init')).toEqual(['wingfoil', 'init']);
  });
});
