/**
 * task-376 — the commands `workflow next` offers, on the compiled CLI (`spec-017` §2, §6.1, §7.5, §8). Each command the
 * suite calls runnable is run as printed, its placeholders filled. The payload's marks and `workflow show` are
 * `test/core/workflow-next-offers.test.ts`.
 *
 * - AC 2 (`bug-439`): a creation already made is no longer offered, and the step names what is missing.
 * - AC 3 (`bug-490`): the offered `memory add` carries the action's arguments; one it cannot take is a `workflow list`
 *   warning.
 * - AC 5 (`bug-518`): a verb's command names only the targets with an edge for it, one command per target.
 *
 * The tests titled "control" pass before the task: they prove that the verbs accept the commands the other tests
 * expect to be printed, so that those fail on what is offered and not on the fixture.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';
import { elementDoc, makeOffersRepo, startWorkflow, type OffersProject } from './helpers/workflow-offers-fixture';

interface Ref {
  readonly type: string;
  readonly id: string;
  readonly status: string;
}
interface ActionView {
  readonly token: string;
  readonly text: string;
  readonly binding: { readonly kind: string; readonly argv?: readonly string[]; readonly commands?: readonly (readonly string[])[] };
  readonly done?: readonly Ref[];
  readonly notOffered?: readonly { readonly element: Ref; readonly reason: string }[];
}
interface StepView {
  readonly key: string;
  readonly actions: readonly ActionView[];
  readonly created: readonly Ref[];
  readonly evidence: { readonly kinds: readonly string[]; readonly missing: readonly string[]; readonly finalizable: boolean; readonly manualOnly?: boolean };
  readonly pendingCreated?: readonly { readonly element: Ref; readonly reaches: string | null; readonly missingPaths: readonly string[] }[];
}
interface Diagnostic {
  readonly code: string;
  readonly severity: string;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

const NOT_PASSED = 'W_ACTION_ARGUMENT_NOT_PASSED';

function nextStep(root: string, ref: string): StepView {
  const run = runCliEntry(root, ['workflow', 'next', ref, '--format', 'json']);
  if (run.status !== 0) throw new Error(`workflow next ${ref} exited ${run.status}: ${run.stderr}`);
  return (JSON.parse(run.stdout) as { next: StepView }).next;
}

const consoleOf = (root: string, ref: string): string => runCliEntry(root, ['workflow', 'next', ref]).stdout;
const action = (step: StepView, token: string): ActionView => step.actions.find((entry) => entry.token === token)!;

/** Run a printed command in an environment free of agent markers (`spec-018` §1), as the approver's terminal is. */
function runPrinted(root: string, argv: readonly string[]): SpawnedRun {
  expect(argv[0]).toBe('wingfoil');
  return spawnCapture('node', [CLI_ENTRY, ...argv.slice(1)], { cwd: root, env: withoutAgentMarkers(process.env) as NodeJS.ProcessEnv });
}

const fill = (argv: readonly string[], values: Readonly<Record<string, string>>): string[] =>
  argv.map((element) => Object.entries(values).reduce((text, [placeholder, value]) => text.replace(placeholder, value), element));

const BUG_ACTION = 'memory.add(type: bug, title: "Fixed title here", tags: [demo, two], severity: low)';

describe('task-376 AC 2 — a creation already made is no longer offered (bug-439, spec-017 §6.1)', () => {
  const SOLO = (name: string): string => `name: ${name}\nstartable: true\nphases:\n  - name: file\n    role: developer\n    actions:\n      - "memory.add(type: bug)"\n      - memory.submit\n`;
  const TWO_TYPES = 'name: two-types\nstartable: true\nphases:\n  - name: file\n    role: developer\n    actions:\n      - "memory.add(type: bug)"\n      - "memory.add(type: decision-log)"\n      - memory.submit\n';

  let repo: string;
  let linked: string;
  let adopted: string;
  let second: string;

  /** The id `memory add` allocated, from its JSON answer. */
  function add(args: readonly string[]): string {
    const run = runCliEntry(repo, ['memory', 'add', '--type', 'bug', ...args, '--format', 'json']);
    if (run.status !== 0) throw new Error(`memory add exited ${run.status}: ${run.stderr}`);
    return (JSON.parse(run.stdout) as { id: string }).id;
  }

  beforeAll(() => {
    repo = makeOffersRepo({ workflows: { linked: SOLO('linked'), adopted: SOLO('adopted'), 'two-types': TWO_TYPES } });
    for (const name of ['linked', 'adopted', 'two-types']) startWorkflow(repo, name);
    linked = add(['--title', 'Linked one', '--workflow', 'linked-1-plan', '--step', 'linked.file']);
    second = add(['--title', 'Second type', '--workflow', 'two-types-1-plan', '--step', 'two-types.file']);
    adopted = add(['--title', 'Adopted one']);
    const adoption = runCliEntry(repo, ['workflow', 'adopt', 'adopted-1-plan', '--step', 'adopted.file', '--element', `bug:${adopted}`, '--reason', 'The bug was filed before the run.']);
    if (adoption.status !== 0) throw new Error(`workflow adopt exited ${adoption.status}: ${adoption.stderr}`);
  });
  afterAll(() => removeTempDir(repo));

  const draft = (id: string): Ref => ({ type: 'bug', id, status: 'draft' });
  const startsAdd = (entry: ActionView): boolean => entry.binding.argv?.slice(0, 3).join(' ') === 'wingfoil memory add';

  it.each([
    ['linked with --workflow --step', 'linked', (): string => linked],
    ['adopted with workflow adopt', 'adopted', (): string => adopted],
  ])('an element %s: no memory add is offered, done lists it, the submit stays', (_how, ref, id) => {
    const step = nextStep(repo, ref);
    expect(step.actions.filter(startsAdd)).toEqual([]);
    expect(action(step, 'memory.add(type: bug)').done).toEqual([draft(id())]);
    expect(action(step, 'memory.submit').binding.argv!.slice(0, 3)).toEqual(['wingfoil', 'memory', 'submit']);
  });

  it.each([
    ['linked', (): string => linked],
    ['adopted', (): string => adopted],
  ])('%s: pendingCreated names what the element lacks, and the kind created stays missing', (ref, id) => {
    const step = nextStep(repo, ref);
    expect(step.pendingCreated).toEqual([{ element: draft(id()), reaches: 'pending', missingPaths: [] }]);
    expect(step.evidence.missing).toEqual(['created']);
  });

  it('console: the action reads done with its id, the evidence line names the state the phase leaves it in', () => {
    const text = consoleOf(repo, 'linked');
    expect(text).toContain(`- memory.add(type: bug) — done: ${linked}`);
    expect(text).toContain(`evidence missing: created (${linked} is draft, the phase leaves it pending)`);
    expect(text).not.toContain('wingfoil memory add');
  });

  it('a second type not created yet keeps its offer', () => {
    const step = nextStep(repo, 'two-types');
    expect(action(step, 'memory.add(type: bug)').done).toEqual([draft(second)]);
    expect(action(step, 'memory.add(type: bug)').binding.argv).toBeUndefined();
    const other = action(step, 'memory.add(type: decision-log)');
    expect(other.done).toBeUndefined();
    expect(other.binding.argv).toEqual(['wingfoil', 'memory', 'add', '--type', 'decision-log', '--title', '<title>', '--workflow', 'two-types-1-plan', '--step', step.key]);
  });
});

describe('task-376 AC 3 — the offered memory add carries the action arguments (bug-490, spec-017 §2, §6.1)', () => {
  const INSTANCE = 'args-minor-v1-plan';
  const STEP = 'args.seed@release:minor-v1';
  const RELEASE_ACTION = 'memory.add(type: release, kind: minor)';
  const TASK_ACTION = 'memory.add(type: task)';
  const CLEAN = 'memory.add(type: task, title: "Retro {release.version}", release: "{release.version}")';
  const SPACED = 'memory.add(type: task, title: "Retro {release.title}", release: "{release.title}")';
  const TWO_LEFT_OUT = 'memory.add(type: bug, severity: low, priority: high)';

  const PROJECT: OffersProject = {
    workflows: {
      capture: `name: capture\nstartable: true\nphases:\n  - name: file\n    role: developer\n    actions:\n      - '${BUG_ACTION}'\n`,
      args: ['name: args', 'startable: true', 'element: release', 'phases:', '  - name: seed', '    role: developer', '    actions:', ...[RELEASE_ACTION, TASK_ACTION, CLEAN, SPACED, TWO_LEFT_OUT].map((token) => `      - '${token}'`), ''].join('\n'),
    },
    files: { 'docs/releases/minor-v1.md': elementDoc('release', 'minor-v1', 'planning', 'version: "v1"\n').replace('title: "minor-v1"', 'title: "Has a space"') },
  };

  function makeRepo(): string {
    const root = makeOffersRepo(PROJECT);
    startWorkflow(root, 'capture');
    startWorkflow(root, 'args', 'release:minor-v1');
    return root;
  }

  let repo: string;
  beforeAll(() => {
    repo = makeRepo();
  });
  afterAll(() => removeTempDir(repo));

  const link = ['--workflow', INSTANCE, '--step', STEP];
  const offered = (token: string): readonly string[] | undefined => action(nextStep(repo, 'args'), token).binding.argv;

  it('the title and the tags of the action are passed, and severity is left out', () => {
    expect(action(nextStep(repo, 'capture'), BUG_ACTION).binding.argv).toEqual([
      'wingfoil', 'memory', 'add', '--type', 'bug', '--title', 'Fixed title here', '--tags', 'demo,two', '--workflow', 'capture-1-plan', '--step', 'capture.file',
    ]);
  });

  it('a pattern token the action gives is --set kind=minor, and one it does not give is a placeholder', () => {
    expect(offered(RELEASE_ACTION)).toEqual(['wingfoil', 'memory', 'add', '--type', 'release', '--title', '<title>', '--set', 'kind=minor', '--set', 'version=<version>', ...link]);
  });

  it('a path token the action does not give is --set release=<release>', () => {
    expect(offered(TASK_ACTION)).toEqual(['wingfoil', 'memory', 'add', '--type', 'task', '--title', '<title>', '--set', 'release=<release>', ...link]);
  });

  it('an interpolated value of the ID class is passed, the title as one argv element', () => {
    expect(offered(CLEAN)).toEqual(['wingfoil', 'memory', 'add', '--type', 'task', '--title', 'Retro v1', '--set', 'release=v1', ...link]);
  });

  it('an interpolated value holding a space prints the placeholder', () => {
    expect(offered(SPACED)).toEqual(['wingfoil', 'memory', 'add', '--type', 'task', '--title', '<title>', '--set', 'release=<release>', ...link]);
  });

  it('console: an element a shell would split is quoted, a placeholder never', () => {
    expect(consoleOf(repo, 'capture')).toContain("wingfoil memory add --type bug --title 'Fixed title here' --tags demo,two --workflow capture-1-plan --step capture.file");
    const text = consoleOf(repo, 'args');
    expect(text).toContain("--title 'Retro v1' --set release=v1 --workflow");
    expect(text).toContain('--title <title> --set kind=minor --set version=<version> --workflow');
  });

  it('control: memory add accepts the shape of each expected command', () => {
    const root = makeRepo();
    try {
      const commands = [
        ['wingfoil', 'memory', 'add', '--type', 'bug', '--title', 'Fixed title here', '--tags', 'demo,two', '--workflow', 'capture-1-plan', '--step', 'capture.file'],
        ['wingfoil', 'memory', 'add', '--type', 'release', '--title', 'Next', '--set', 'kind=minor', '--set', 'version=v2', ...link],
        ['wingfoil', 'memory', 'add', '--type', 'task', '--title', 'Retro v1', '--set', 'release=v1', ...link],
      ];
      for (const command of commands) {
        const run = runPrinted(root, command);
        expect([command.join(' '), run.status, run.stderr]).toEqual([command.join(' '), 0, '']);
      }
    } finally {
      removeTempDir(root);
    }
  });

  it('each offered command, run as printed with its placeholders filled, exits 0', () => {
    const root = makeRepo();
    try {
      const values = { '<title>': 'Filled title', '<version>': 'v2', '<release>': 'v1' };
      const printed = [action(nextStep(root, 'capture'), BUG_ACTION).binding.argv!, ...[RELEASE_ACTION, TASK_ACTION, CLEAN].map((token) => action(nextStep(root, 'args'), token).binding.argv!)];
      for (const command of printed) {
        const run = runPrinted(root, fill(command, values));
        expect([command.join(' '), run.status, run.stderr]).toEqual([command.join(' '), 0, '']);
      }
    } finally {
      removeTempDir(root);
    }
  });

  describe('an argument memory add cannot take', () => {
    const diagnosticsOf = (args: readonly string[]): { status: number; diagnostics: readonly Diagnostic[] } => {
      const run = runCliEntry(repo, [...args, '--format', 'json']);
      return { status: run.status, diagnostics: (JSON.parse(run.stdout) as { diagnostics: readonly Diagnostic[] }).diagnostics };
    };
    const message = (name: string, type: string): string => `memory.add argument '${name}' cannot be passed: type '${type}' has no token {${name}} in its id_pattern or path`;

    it('workflow list reports each one once as a warning, with its file, path and message, and exits 0', () => {
      const { status, diagnostics } = diagnosticsOf(['workflow', 'list']);
      expect(status).toBe(0);
      const reported = diagnostics.filter((entry) => entry.code === NOT_PASSED);
      expect(reported.filter((entry) => entry.file === 'workflows/custom/capture.yaml')).toEqual([
        { code: NOT_PASSED, severity: 'warning', file: 'workflows/custom/capture.yaml', path: 'phases[0].actions[0]', message: message('severity', 'bug') },
      ]);
      expect(reported.filter((entry) => entry.file === 'workflows/custom/args.yaml')).toEqual([
        { code: NOT_PASSED, severity: 'warning', file: 'workflows/custom/args.yaml', path: 'phases[0].actions[4]', message: message('severity', 'bug') },
        { code: NOT_PASSED, severity: 'warning', file: 'workflows/custom/args.yaml', path: 'phases[0].actions[4]', message: message('priority', 'bug') },
      ]);
    });

    it('workflow list --all reports them too', () => {
      const { status, diagnostics } = diagnosticsOf(['workflow', 'list', '--all']);
      expect(status).toBe(0);
      expect(diagnostics.filter((entry) => entry.code === NOT_PASSED)).toHaveLength(3);
    });

    it('they come after every other diagnostic of the payload', () => {
      const codes = diagnosticsOf(['workflow', 'list']).diagnostics.map((entry) => entry.code);
      expect(codes.slice(-3)).toEqual([NOT_PASSED, NOT_PASSED, NOT_PASSED]);
    });

    it.each([
      ['workflow next', ['workflow', 'next', 'capture']],
      ['workflow status', ['workflow', 'status']],
      ['workflow show', ['workflow', 'show', 'capture']],
    ])('%s does not report them', (_name, args) => {
      const { status, diagnostics } = diagnosticsOf(args);
      expect(status).toBe(0);
      expect(diagnostics.filter((entry) => entry.code === NOT_PASSED)).toEqual([]);
    });
  });
});

describe('task-376 AC 5 — a verb is offered once per element that has an edge for it (bug-518, spec-017 §6.1)', () => {
  const selection = (name: string, type: string, statuses: string, actions: readonly string[]): string =>
    [`name: ${name}`, 'startable: true', 'phases:', '  - name: decide', '    role: approver', `    where: { type: ${type}, status: [ ${statuses} ] }`, '    actions:', ...actions.map((token) => `      - ${token}`), ''].join('\n');

  const ALPHA: Ref = { type: 'decision-log', id: 'dl-001-alpha', status: 'draft' };
  const BETA: Ref = { type: 'decision-log', id: 'dl-002-beta', status: 'pending' };
  const GAMMA: Ref = { type: 'decision-log', id: 'dl-003-gamma', status: 'pending' };

  const PROJECT: OffersProject = {
    workflows: {
      sweep: selection('sweep', 'decision-log', 'draft, pending', ['memory.approve', 'memory.reject', 'memory.submit', 'memory.deprecate']),
      single: selection('single', 'bug', 'draft, pending', ['memory.approve']),
      nothing: selection('nothing', 'task', 'draft', ['memory.approve']),
      loose: 'name: loose\nstartable: true\nphases:\n  - name: go\n    role: approver\n    actions:\n      - memory.approve\n',
    },
    files: {
      [`docs/dls/${ALPHA.id}.md`]: elementDoc('decision-log', ALPHA.id, 'draft'),
      [`docs/dls/${BETA.id}.md`]: elementDoc('decision-log', BETA.id, 'pending'),
      [`docs/dls/${GAMMA.id}.md`]: elementDoc('decision-log', GAMMA.id, 'pending'),
      'docs/bugs/bug-001-open.md': elementDoc('bug', 'bug-001-open', 'draft'),
      'docs/bugs/bug-002-held.md': elementDoc('bug', 'bug-002-held', 'pending'),
      'docs/tasks/v1/task-001-one.md': elementDoc('task', 'task-001-one', 'draft', 'release: "v1"\n'),
      'docs/tasks/v1/task-002-two.md': elementDoc('task', 'task-002-two', 'draft', 'release: "v1"\n'),
    },
  };

  function makeRepo(): string {
    const root = makeOffersRepo(PROJECT);
    for (const name of Object.keys(PROJECT.workflows)) startWorkflow(root, name);
    return root;
  }

  const REASON = { '<reason>': 'The element is ready.' };
  const statusOf = (root: string, id: string): string => /^status: (.+)$/m.exec(readFileSync(join(root, 'docs/dls', `${id}.md`), 'utf8'))![1]!;

  let repo: string;
  beforeAll(() => {
    repo = makeRepo();
  });
  afterAll(() => removeTempDir(repo));

  const swept = (token: string): ActionView => action(nextStep(repo, 'sweep'), token);

  it('memory approve: one command per pending element, argv the first, the draft one in notOffered', () => {
    const { binding, notOffered } = swept('memory.approve');
    const commands = [BETA, GAMMA].map((ref) => ['wingfoil', 'memory', 'approve', ref.id, '--reason', '<reason>']);
    expect(binding.commands).toEqual(commands);
    expect(binding.argv).toEqual(commands[0]);
    expect(notOffered).toEqual([{ element: ALPHA, reason: "no approve edge from 'draft'" }]);
  });

  it('memory reject follows the same rule', () => {
    const { binding, notOffered } = swept('memory.reject');
    const commands = [BETA, GAMMA].map((ref) => ['wingfoil', 'memory', 'reject', ref.id, '--reason', '<reason>']);
    expect(binding.commands).toEqual(commands);
    expect(binding.argv).toEqual(commands[0]);
    expect(notOffered).toEqual([{ element: ALPHA, reason: "no reject edge from 'draft'" }]);
  });

  it('memory submit: only the draft element, one command, so no commands list; the gated ones in notOffered', () => {
    const { binding, notOffered } = swept('memory.submit');
    expect(binding.argv).toEqual(['wingfoil', 'memory', 'submit', ALPHA.id]);
    expect(binding.commands).toBeUndefined();
    expect(notOffered).toEqual([
      { element: BETA, reason: "no submit edge from 'pending'" },
      { element: GAMMA, reason: "no submit edge from 'pending'" },
    ]);
  });

  it('memory deprecate: legal from every state, one command per element, nothing left out', () => {
    const { binding, notOffered } = swept('memory.deprecate');
    const commands = [ALPHA, BETA, GAMMA].map((ref) => ['wingfoil', 'memory', 'deprecate', ref.id]);
    expect(binding.commands).toEqual(commands);
    expect(binding.argv).toEqual(commands[0]);
    expect(notOffered).toBeUndefined();
  });

  it('console: every command is printed, and an element left out is reported on a line of its own with the reason', () => {
    const lines = consoleOf(repo, 'sweep').split('\n');
    for (const ref of [BETA, GAMMA]) expect(lines.filter((line) => line.includes(`wingfoil memory approve ${ref.id} --reason <reason>`))).toHaveLength(1);
    const reported = lines.filter((line) => line.includes("no approve edge from 'draft'"));
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain(ALPHA.id);
    expect(reported[0]).not.toContain('wingfoil memory approve');
  });

  it('one eligible element: its command in argv and no commands list', () => {
    const { binding, notOffered } = action(nextStep(repo, 'single'), 'memory.approve');
    expect(binding.argv).toEqual(['wingfoil', 'memory', 'approve', 'bug-002-held', '--reason', '<reason>']);
    expect(binding.commands).toBeUndefined();
    expect(notOffered).toEqual([{ element: { type: 'bug', id: 'bug-001-open', status: 'draft' }, reason: "no approve edge from 'draft'" }]);
  });

  it('no eligible element: the binding has no argv, and every target is in notOffered', () => {
    const { binding, notOffered } = action(nextStep(repo, 'nothing'), 'memory.approve');
    expect(binding.kind).toBe('wingfoil');
    expect(binding.argv).toBeUndefined();
    expect(binding.commands).toBeUndefined();
    expect(notOffered!.map((entry) => [entry.element.id, entry.reason])).toEqual([
      ['task-001-one', "no approve edge from 'draft'"],
      ['task-002-two', "no approve edge from 'draft'"],
    ]);
  });

  it('no target known yet: the placeholder <id> stays', () => {
    const { binding, notOffered } = action(nextStep(repo, 'loose'), 'memory.approve');
    expect(binding.argv).toEqual(['wingfoil', 'memory', 'approve', '<id>', '--reason', '<reason>']);
    expect(notOffered).toBeUndefined();
  });

  it('control: each verb takes one id, and refuses two at exit 2 (spec-008 §1)', () => {
    const root = makeRepo();
    try {
      expect(runPrinted(root, ['wingfoil', 'memory', 'approve', BETA.id, GAMMA.id, '--reason', 'Both.']).status).toBe(2);
      const commands = [
        ['wingfoil', 'memory', 'approve', BETA.id, '--reason', 'One.'],
        ['wingfoil', 'memory', 'reject', GAMMA.id, '--reason', 'One.'],
        ['wingfoil', 'memory', 'submit', ALPHA.id],
        ['wingfoil', 'memory', 'deprecate', ALPHA.id],
      ];
      for (const command of commands) {
        const run = runPrinted(root, command);
        expect([command.join(' '), run.status, run.stderr]).toEqual([command.join(' '), 0, '']);
      }
      expect([ALPHA, BETA, GAMMA].map((ref) => statusOf(root, ref.id))).toEqual(['deprecated', 'ready', 'draft']);
    } finally {
      removeTempDir(root);
    }
  });

  it('each printed memory approve, run as printed with the reason filled, exits 0 and moves its element', () => {
    const root = makeRepo();
    try {
      const commands = action(nextStep(root, 'sweep'), 'memory.approve').binding.commands;
      expect(commands).toHaveLength(2);
      for (const command of commands!) {
        const run = runPrinted(root, fill(command, REASON));
        expect([command.join(' '), run.status, run.stderr]).toEqual([command.join(' '), 0, '']);
      }
      expect([BETA, GAMMA].map((ref) => statusOf(root, ref.id))).toEqual(['ready', 'ready']);
      expect(statusOf(root, ALPHA.id)).toBe('draft');
    } finally {
      removeTempDir(root);
    }
  });

  it('each printed memory reject, run as printed with the reason filled, exits 0 and moves its element', () => {
    const root = makeRepo();
    try {
      const commands = action(nextStep(root, 'sweep'), 'memory.reject').binding.commands;
      expect(commands).toHaveLength(2);
      for (const command of commands!) {
        const run = runPrinted(root, fill(command, REASON));
        expect([command.join(' '), run.status, run.stderr]).toEqual([command.join(' '), 0, '']);
      }
      expect([BETA, GAMMA].map((ref) => statusOf(root, ref.id))).toEqual(['draft', 'draft']);
    } finally {
      removeTempDir(root);
    }
  });

  it('the printed memory submit and each printed memory deprecate, run as printed, exit 0', () => {
    const root = makeRepo();
    try {
      const step = nextStep(root, 'sweep');
      const submit = action(step, 'memory.submit').binding.argv!;
      const deprecate = action(step, 'memory.deprecate').binding.commands;
      expect(deprecate).toHaveLength(3);
      for (const command of [submit, ...deprecate!]) {
        const run = runPrinted(root, command);
        expect([command.join(' '), run.status, run.stderr]).toEqual([command.join(' '), 0, '']);
      }
      expect([ALPHA, BETA, GAMMA].map((ref) => statusOf(root, ref.id))).toEqual(['deprecated', 'deprecated', 'deprecated']);
    } finally {
      removeTempDir(root);
    }
  });
});
