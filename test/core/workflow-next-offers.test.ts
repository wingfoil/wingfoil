/**
 * task-376 — what `workflow next`, `workflow status` and `workflow show` report about a step and its commands
 * (`spec-017` §6.1, §7.4, §7.6, §8), through the registered `CORE_MODULES` operations. The commands driven on the
 * compiled CLI are `test/cli/workflow-next-offers.integration.test.ts`.
 *
 * - AC 1 (`bug-486`): `evidence.manualOnly` and its two console forms.
 * - AC 4 (`bug-479`): `workflow show` prints a built-in binding as a whole command with placeholders.
 */
import { CORE_MODULES, renderStatusConsole, type StatusResult, type Step } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { renderNextConsole, type NextResult } from '../../src/core/workflow-next';
import { elementDoc, makeOffersRepo, startWorkflow } from '../cli/helpers/workflow-offers-fixture';
import { removeTempDir } from '../storage/helpers/git-fixture';

function operation(name: 'workflowNext' | 'workflowStatus' | 'workflowShow') {
  const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations[name];
  if (op === undefined) throw new Error(`workflow.${name} is not registered in CORE_MODULES`);
  return op;
}

function ok<T>(result: CoreResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

const next = async (root: string, ref: string): Promise<NextResult> => ok((await operation('workflowNext').fn({ root, positional: ref })) as CoreResult<NextResult>);
const status = async (root: string): Promise<StatusResult> => ok((await operation('workflowStatus').fn({ root })) as CoreResult<StatusResult>);

const phase = (name: string, body: string, head = ''): string => `name: ${name}\nstartable: true\n${head}phases:\n  - name: go\n    role: developer\n${body}`;
const gate = (name: string, state: string): string =>
  phase(name, `    approval: { by_role: approver }\n    actions:\n      - element.set_state(${state})\n`, 'element: release\n');

const MANUAL_ONLY_LINE = 'evidence missing: record (finalizable) manual only: no evidence checks this step';

describe('task-376 AC 1 — a step only a record can finish is marked manual only (bug-486, spec-017 §6.1)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeOffersRepo({
      workflows: {
        'bound-run': phase('bound-run', '    actions:\n      - checkpoint.run\n'),
        'bound-manual': phase('bound-manual', '    actions:\n      - checkpoint.manual\n'),
        waits: phase('waits', '    awaits: { party: "a vendor", evidence: "vendor.ack" }\n'),
        creates: phase('creates', '    actions:\n      - "memory.add(type: bug)"\n'),
        'state-held': gate('state-held', 'planning'),
        'state-missing': gate('state-missing', 'released'),
      },
      bindings: 'version: 1.0\nformat: 1\nactions:\n  checkpoint.run: { run: [ npm, test ] }\n  checkpoint.manual: { manual: true }\nchecks:\n  vendor.ack: { manual: true }\n',
      files: { 'docs/releases/minor-v1.md': elementDoc('release', 'minor-v1', 'planning', 'version: "v1"\n') },
    });
    for (const name of ['bound-run', 'bound-manual', 'waits', 'creates']) startWorkflow(repo, name);
    for (const name of ['state-held', 'state-missing']) startWorkflow(repo, name, 'release:minor-v1');
  });
  afterAll(() => removeTempDir(repo));

  const evidenceOf = async (ref: string): Promise<Step['evidence']> => (await next(repo, ref)).next!.evidence;

  it('[record] is manual only, and a run-bound and a manual-bound checkpoint answer alike', async () => {
    const expected = { kinds: ['record'], missing: ['record'], finalizable: true, manualOnly: true };
    expect(await evidenceOf('bound-run')).toEqual(expected);
    expect(await evidenceOf('bound-manual')).toEqual(expected);
  });

  it('[awaits, record] is manual only', async () => {
    expect(await evidenceOf('waits')).toEqual({ kinds: ['awaits', 'record'], missing: ['record'], finalizable: true, manualOnly: true });
  });

  it('[created, record] with nothing created is manual only', async () => {
    expect(await evidenceOf('creates')).toEqual({ kinds: ['created', 'record'], missing: ['record'], finalizable: true, manualOnly: true });
  });

  it('[state, record] is finalizable but not manual only: a state stands behind it', async () => {
    expect(await evidenceOf('state-held')).toEqual({ kinds: ['state', 'record'], missing: ['record'], finalizable: true, manualOnly: false });
  });

  it('a step that is not finalizable is not manual only, and finalizable stays a boolean', async () => {
    expect(await evidenceOf('state-missing')).toEqual({ kinds: ['state', 'record'], missing: ['state', 'record'], finalizable: false, manualOnly: false });
  });

  it('workflow next (console) appends the mark to the evidence line of a manual-only step, and of no other', async () => {
    expect(renderNextConsole(await next(repo, 'bound-run'))).toContain(MANUAL_ONLY_LINE);
    expect(renderNextConsole(await next(repo, 'state-held'))).not.toContain('manual only');
    expect(renderNextConsole(await next(repo, 'state-missing'))).not.toContain('manual only');
  });

  it('workflow status reports the mark in its payload and appends "; manual only" to the frontier line of that step alone', async () => {
    const value = await status(repo);
    const frontier = value.open.flatMap((entry) => entry.frontier);
    expect(frontier.find((step) => step.key === 'bound-run.go')!.evidence).toEqual({ kinds: ['record'], missing: ['record'], finalizable: true, manualOnly: true });
    const lines = renderStatusConsole(value).split('\n');
    const lineOf = (key: string): string => lines.find((line) => line.includes(`- ${key} (`))!;
    expect(lineOf('bound-run.go')).toContain('; manual only');
    expect(lineOf('state-held.go@release:minor-v1')).not.toContain('manual only');
    expect(lineOf('state-missing.go@release:minor-v1')).not.toContain('manual only');
  });
});

describe('task-376 AC 4 — workflow show prints a built-in binding as a whole command (bug-479, spec-017 §7.6)', () => {
  interface ShownAction {
    readonly token: string;
    readonly binding: { readonly kind: string; readonly argv?: readonly string[] };
  }
  interface ShowValue {
    readonly workflow: { readonly phases: readonly { readonly actions: readonly ShownAction[] }[] };
  }

  let repo: string;
  let actions: readonly ShownAction[];
  beforeAll(async () => {
    repo = makeOffersRepo({
      workflows: {
        shown: phase(
          'shown',
          ['    actions:', '      - "memory.add(type: bug)"', '      - memory.submit', '      - memory.approve', '      - memory.reject', '      - memory.deprecate', '      - agent.execute', '      - config.init', ''].join('\n'),
        ),
      },
    });
    const value = ok((await operation('workflowShow').fn({ root: repo, positional: 'shown' })) as CoreResult<ShowValue>);
    actions = value.workflow.phases[0]!.actions;
  });
  afterAll(() => removeTempDir(repo));

  const argvOf = (token: string): readonly string[] | undefined => actions.find((action) => action.token === token)!.binding.argv;

  it('memory.submit: wingfoil memory submit <id>', () => {
    expect(argvOf('memory.submit')).toEqual(['wingfoil', 'memory', 'submit', '<id>']);
  });

  it('memory.approve: wingfoil memory approve <id> --reason <reason>', () => {
    expect(argvOf('memory.approve')).toEqual(['wingfoil', 'memory', 'approve', '<id>', '--reason', '<reason>']);
  });

  it('memory.reject: wingfoil memory reject <id> --reason <reason>', () => {
    expect(argvOf('memory.reject')).toEqual(['wingfoil', 'memory', 'reject', '<id>', '--reason', '<reason>']);
  });

  it('memory.deprecate: wingfoil memory deprecate <id>', () => {
    expect(argvOf('memory.deprecate')).toEqual(['wingfoil', 'memory', 'deprecate', '<id>']);
  });

  it('memory.add: the type, --title <title>, --workflow <instance-id> and --step <key>', () => {
    expect(argvOf('memory.add(type: bug)')).toEqual(['wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', '--workflow', '<instance-id>', '--step', '<key>']);
  });

  it('agent.execute: wingfoil agent execute --workflow <instance-id> --step <key>', () => {
    expect(argvOf('agent.execute')).toEqual(['wingfoil', 'agent', 'execute', '--workflow', '<instance-id>', '--step', '<key>']);
  });

  it('config.init stays wingfoil init: it has no operand', () => {
    expect(argvOf('config.init')).toEqual(['wingfoil', 'init']);
  });
});
