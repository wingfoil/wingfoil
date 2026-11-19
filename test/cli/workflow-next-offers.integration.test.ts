/**
 * task-376 AC 2, AC 3 and AC 5 — the commands `workflow next` offers, on the compiled `dist/cli.js` (`spec-017` §2,
 * §6.1, §7.5, §8; `spec-008` §1).
 *
 * - AC 2 (`bug-439`): a step that has created its element no longer offers `memory add` and names what is missing.
 * - AC 3 (`bug-490`): the offered `memory add` carries the action's arguments and the pattern tokens it needs; an
 *   argument it cannot take is the `workflow list` warning `W_ACTION_ARGUMENT_NOT_PASSED`.
 * - AC 5 (`bug-518`): one command per element with an edge for the verb, the others reported apart, and each printed
 *   command, run as printed with its placeholders filled, exits 0.
 *
 * The project is what `wingfoil init --template Scrum --no-interactive` writes, with the workflows below. Every child
 * runs without the agent markers (`test/agent-markers.cjs`), because AC 5 drives the approver-gated verbs.
 * `dist/` is built once by jest's `globalSetup` (`bug-003`). Deterministic: fixed fixture, fixed identity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { cloneTempRepo, commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 120_000;

const DEMO = `name: demo
startable: true
description: "Capture one bug"
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug, title: "Fixed title here", tags: [demo, two], severity: low)'
      - memory.submit
`;

const PAIR = `name: pair
startable: true
phases:
  - name: seed
    actions:
      - 'memory.add(type: bug, title: "First")'
      - 'memory.add(type: decision-log, title: "Second")'
`;

const TOKENS = `name: tokens
startable: true
phases:
  - name: seed
    actions:
      - 'memory.add(type: release, kind: minor)'
      - 'memory.add(type: task, title: "A task")'
`;

const INTERP = `name: interp
startable: true
element: release
phases:
  - name: capture
    actions:
      - 'memory.add(type: task, title: "{release.title}", release: "{release.version}")'
      - 'memory.add(type: decision-log, title: "Retrospective {release.version}")'
      - 'memory.add(type: adr, title: "Retrospective {release.title}")'
`;

const ADOPTED = `name: adopted
startable: true
phases:
  - name: capture
    actions:
      - 'memory.add(type: adr, title: "Adopted one")'
      - memory.submit
`;

const WITH_PATH = `name: withpath
startable: true
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug, title: "With path")'
      - memory.submit
    produces:
      - { type: bug, path: "docs/notes/{id}.md" }
`;

const SWEEP = `name: sweep
startable: true
phases:
  - name: gate
    where: { type: decision-log, status: [ draft, pending ] }
    actions:
      - memory.approve
      - memory.reject
      - memory.submit
      - memory.deprecate
`;

const UNPASSABLE = `name: unpassable
startable: true
phases:
  - name: first
    actions:
      - 'memory.add(type: bug, title: "One", severity: low, owner: me)'
      - ops.not_bound
  - name: second
    actions:
      - memory.submit
      - 'memory.add(type: bug, title: "Two", priority: high)'
`;

const UNPASSABLE_SUB = `name: unpassable-sub
includable: true
phases:
  - name: only
    actions:
      - 'memory.add(type: adr, title: "Sub", audience: all)'
`;

const WORKFLOWS: Record<string, string> = {
  demo: DEMO,
  pair: PAIR,
  tokens: TOKENS,
  interp: INTERP,
  adopted: ADOPTED,
  withpath: WITH_PATH,
  sweep: SWEEP,
  unpassable: UNPASSABLE,
  'unpassable-sub': UNPASSABLE_SUB,
};

interface Binding {
  kind: string;
  argv?: string[];
  commands?: string[][];
}
interface ElementRef {
  type: string;
  id: string;
  status: string;
}
interface OfferedAction {
  token: string;
  binding: Binding;
  done?: ElementRef[];
  notOffered?: { element: ElementRef; reason: string }[];
}
interface OfferedStep {
  key: string;
  actions: OfferedAction[];
  evidence: { kinds: string[]; missing: string[]; finalizable: boolean };
  pendingCreated?: { element: ElementRef; reaches: string | null; missingPaths: string[] }[];
}
interface NextPayload {
  instance: { id: string };
  next: OfferedStep;
  diagnostics: { code: string }[];
}
interface Diagnostic {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

/** The CLI in `cwd`, with `process.env` minus every agent marker. */
function wingfoil(cwd: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: { ...withoutAgentMarkers(process.env) } as NodeJS.ProcessEnv });
}

/** The CLI, which must exit 0. */
function must(cwd: string, args: readonly string[]): SpawnedRun {
  const run = wingfoil(cwd, args);
  if (run.status !== 0) throw new Error(`wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
  return run;
}

function setIdentity(repo: string): void {
  git(repo, ['config', 'user.name', 'Demo Dev']);
  git(repo, ['config', 'user.email', 'demo@example.invalid']);
}

/** Replace `from` in the file at `path`, which must hold it. */
function patch(repo: string, path: string, from: string, to: string): void {
  const text = readFileSync(join(repo, path), 'utf-8');
  if (!text.includes(from)) throw new Error(`${path} does not hold: ${from}`);
  writeFixtureFile(repo, path, text.replace(from, to));
}

function buildBase(): string {
  const repo = makeTempGitRepo();
  setIdentity(repo);
  must(repo, ['init', '--template', 'Scrum', '--no-interactive']);
  patch(repo, '.wingfoil/memory.yaml', 'path: docs/memory/task/{id}.md', 'path: docs/memory/{release}/{id}.md');
  patch(repo, '.wingfoil/memory.yaml', 'id_pattern: "release-{n}"', 'id_pattern: "{kind}-{version}"');
  patch(repo, '.wingfoil/dna.yaml', '  members: []\n', '  members:\n    - name: Demo Dev\n      email: demo@example.invalid\n      roles: [ approver, developer ]\n');
  writeFixtureFile(
    repo,
    '.wingfoil/workflows.yaml',
    `version: 1\nformat: 1\n\ninclude:\n${Object.keys(WORKFLOWS).map((name) => `  - workflows/custom/${name}.yaml\n`).join('')}`,
  );
  for (const [name, content] of Object.entries(WORKFLOWS)) writeFixtureFile(repo, `.wingfoil/workflows/custom/${name}.yaml`, content);
  commitAll(repo, 'the fixture workflows');
  return repo;
}

function nextJson(repo: string, ref: string): NextPayload {
  return JSON.parse(must(repo, ['workflow', 'next', ref, '--format', 'json']).stdout) as NextPayload;
}

function actionOf(step: OfferedStep, token: string): OfferedAction {
  const found = step.actions.find((entry) => entry.token === token);
  if (found === undefined) throw new Error(`no action ${token} in ${step.key}: ${step.actions.map((entry) => entry.token).join(', ')}`);
  return found;
}

const isMemoryAdd = (argv: string[] | undefined): boolean => argv !== undefined && argv.slice(0, 3).join(' ') === 'wingfoil memory add';

/** A printed command, as a child's arguments, with each placeholder of `fill` replaced. */
function asPrinted(command: readonly string[], fill: Record<string, string>): string[] {
  expect(command[0]).toBe('wingfoil');
  return command.slice(1).map((element) => Object.entries(fill).reduce((text, [from, to]) => text.split(from).join(to), element));
}

const DEMO_ADD = 'memory.add(type: bug, title: "Fixed title here", tags: [demo, two], severity: low)';

describe('task-376 — the commands workflow next offers (spec-017 §6.1)', () => {
  let base: string;
  const clones: string[] = [];

  /** A fresh copy of the fixture project. */
  function project(source: string = base): string {
    const repo = cloneTempRepo(source);
    clones.push(repo);
    setIdentity(repo);
    return repo;
  }

  beforeAll(() => {
    base = buildBase();
  }, TIMEOUT_MS);
  afterAll(() => {
    for (const repo of clones) removeTempDir(repo);
    removeTempDir(base);
  });

  describe('AC 2 — a step that has created its element (bug-439)', () => {
    it('before the creation: the add is offered, nothing is done and nothing is pending', () => {
      const repo = project();
      must(repo, ['workflow', 'start', 'demo']);
      const step = nextJson(repo, 'demo').next;
      expect(isMemoryAdd(actionOf(step, DEMO_ADD).binding.argv)).toBe(true);
      expect(actionOf(step, DEMO_ADD).done).toBeUndefined();
      expect(step.pendingCreated).toBeUndefined();
    }, TIMEOUT_MS);

    describe('a draft element linked by memory add --workflow --step', () => {
      const ID = 'bug-001-fixed-title-here';
      let repo: string;
      let step: OfferedStep;
      beforeAll(() => {
        repo = project();
        must(repo, ['workflow', 'start', 'demo']);
        must(repo, ['memory', 'add', '--type', 'bug', '--title', 'Fixed title here', '--workflow', 'demo', '--step', 'demo.capture']);
        step = nextJson(repo, 'demo').next;
      }, TIMEOUT_MS);

      it('no action offers memory add, and the action reports the element in done', () => {
        expect(step.actions.filter((action) => isMemoryAdd(action.binding.argv))).toEqual([]);
        expect(actionOf(step, DEMO_ADD).binding.argv).toBeUndefined();
        expect(actionOf(step, DEMO_ADD).done).toEqual([{ type: 'bug', id: ID, status: 'draft' }]);
      });

      it('pendingCreated names the state the phase leaves it in; the kind created stays missing', () => {
        expect(step.pendingCreated).toEqual([{ element: { type: 'bug', id: ID, status: 'draft' }, reaches: 'pending', missingPaths: [] }]);
        expect(step.evidence.missing).toEqual(['created']);
      });

      it('the memory.submit command stays', () => {
        expect(actionOf(step, 'memory.submit').binding.argv).toEqual(['wingfoil', 'memory', 'submit', ID]);
      });

      it('the console prints the action as done and says what is really missing', () => {
        const lines = must(repo, ['workflow', 'next', 'demo']).stdout.split('\n');
        expect(lines).toContain(`    - ${DEMO_ADD} — done: ${ID}`);
        expect(lines).toContain(`  evidence missing: created (${ID} is draft, the phase leaves it pending)`);
        expect(lines.join('\n')).not.toContain('wingfoil memory add');
      }, TIMEOUT_MS);
    });

    it('an element adopted by workflow adopt counts as created: no add is offered', () => {
      const ID = 'adr-001-adopted-one';
      const repo = project();
      must(repo, ['workflow', 'start', 'adopted']);
      must(repo, ['memory', 'add', '--type', 'adr', '--title', 'Adopted one']);
      must(repo, ['workflow', 'adopt', 'adopted', '--step', 'adopted.capture', '--element', `adr:${ID}`, '--reason', 'Counts as created here']);
      const step = nextJson(repo, 'adopted').next;
      const add = actionOf(step, 'memory.add(type: adr, title: "Adopted one")');
      expect(add.binding.argv).toBeUndefined();
      expect(add.done).toEqual([{ type: 'adr', id: ID, status: 'draft' }]);
      expect(step.pendingCreated).toEqual([{ element: { type: 'adr', id: ID, status: 'draft' }, reaches: 'pending', missingPaths: [] }]);
    }, TIMEOUT_MS);

    it('a { type, path } entry not committed is named in missingPaths', () => {
      const ID = 'bug-001-with-path';
      const repo = project();
      must(repo, ['workflow', 'start', 'withpath']);
      must(repo, ['memory', 'add', '--type', 'bug', '--title', 'With path', '--workflow', 'withpath', '--step', 'withpath.capture']);
      must(repo, ['memory', 'submit', ID]);
      const step = nextJson(repo, 'withpath').next;
      expect(step.pendingCreated).toEqual([{ element: { type: 'bug', id: ID, status: 'pending' }, reaches: 'pending', missingPaths: [`docs/notes/${ID}.md`] }]);
      expect(step.evidence.missing).toEqual(['created']);
    }, TIMEOUT_MS);

    it('a second type not created yet keeps its offer, and a further element stays accepted (design gate D5)', () => {
      const repo = project();
      must(repo, ['workflow', 'start', 'pair']);
      must(repo, ['memory', 'add', '--type', 'bug', '--title', 'First', '--workflow', 'pair', '--step', 'pair.seed']);
      const payload = nextJson(repo, 'pair');
      const step = payload.next;
      expect(actionOf(step, 'memory.add(type: bug, title: "First")').binding.argv).toBeUndefined();
      expect(actionOf(step, 'memory.add(type: decision-log, title: "Second")').binding.argv).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'decision-log', '--title', 'Second', '--workflow', payload.instance.id, '--step', step.key,
      ]);
      expect(wingfoil(repo, ['memory', 'add', '--type', 'bug', '--title', 'Another', '--workflow', 'pair', '--step', step.key]).status).toBe(0);
    }, TIMEOUT_MS);
  });

  describe('AC 3 — the offered memory add carries the action arguments (bug-490)', () => {
    it('type, title and tags in the fixed order; an argument the verb cannot take is left out', () => {
      const repo = project();
      must(repo, ['workflow', 'start', 'demo']);
      const payload = nextJson(repo, 'demo');
      expect(actionOf(payload.next, DEMO_ADD).binding.argv).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'bug', '--title', 'Fixed title here', '--tags', 'demo,two', '--workflow', payload.instance.id, '--step', 'demo.capture',
      ]);
    }, TIMEOUT_MS);

    it('the console quotes the title a shell would split', () => {
      const repo = project();
      must(repo, ['workflow', 'start', 'demo']);
      expect(must(repo, ['workflow', 'next', 'demo']).stdout).toContain(
        "wingfoil memory add --type bug --title 'Fixed title here' --tags demo,two --workflow demo-1-plan --step demo.capture",
      );
    }, TIMEOUT_MS);

    it('a declared pattern token is a --set; a token not given is a --set placeholder, printed unquoted', () => {
      const repo = project();
      must(repo, ['workflow', 'start', 'tokens']);
      const payload = nextJson(repo, 'tokens');
      const tail = ['--workflow', payload.instance.id, '--step', 'tokens.seed'];
      expect(actionOf(payload.next, 'memory.add(type: release, kind: minor)').binding.argv).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'release', '--title', '<title>', '--set', 'kind=minor', '--set', 'version=<version>', ...tail,
      ]);
      expect(actionOf(payload.next, 'memory.add(type: task, title: "A task")').binding.argv).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'task', '--title', 'A task', '--set', 'release=<release>', ...tail,
      ]);
      const text = must(repo, ['workflow', 'next', 'tokens']).stdout;
      expect(text).toContain('--title <title> --set kind=minor --set version=<version> --workflow');
      expect(text).toContain("--title 'A task' --set release=<release> --workflow");
    }, TIMEOUT_MS);

    it.each<[string, Record<string, string>]>([
      ['memory.add(type: release, kind: minor)', { '<title>': 'Minor one', '<version>': 'v9' }],
      ['memory.add(type: task, title: "A task")', { '<release>': 'v9' }],
    ])('%s succeeds as printed once its placeholders are filled', (token, fill) => {
      const repo = project();
      must(repo, ['workflow', 'start', 'tokens']);
      const argv = actionOf(nextJson(repo, 'tokens').next, token).binding.argv;
      expect(argv).toBeDefined();
      const run = wingfoil(repo, asPrinted(argv!, fill));
      expect([run.status, run.stderr]).toEqual([0, '']);
    }, TIMEOUT_MS);

    it.each<[string, string, string[]]>([
      ['demo', 'demo.capture', ['--type', 'bug', '--title', 'Fixed title here', '--tags', 'demo,two']],
      ['tokens', 'tokens.seed', ['--type', 'release', '--title', 'Minor one', '--set', 'kind=minor', '--set', 'version=v9']],
      ['tokens', 'tokens.seed', ['--type', 'task', '--title', 'A task', '--set', 'release=v9']],
    ])('control: on %s at %s, memory add %j exits 0 on this fixture, whoever prints it', (workflow, key, args) => {
      const repo = project();
      must(repo, ['workflow', 'start', workflow]);
      const run = wingfoil(repo, ['memory', 'add', ...args, '--workflow', workflow, '--step', key]);
      expect([run.status, run.stderr]).toEqual([0, '']);
    }, TIMEOUT_MS);

    describe('an interpolated value (dl-090 Q3 (a), design gate D6)', () => {
      let repo: string;
      let payload: NextPayload;
      beforeAll(() => {
        repo = project();
        must(repo, ['memory', 'add', '--type', 'release', '--title', 'Two words', '--set', 'kind=minor', '--set', 'version=v1']);
        must(repo, ['workflow', 'start', 'interp', '--element', 'release:minor-v1']);
        payload = nextJson(repo, 'interp');
      }, TIMEOUT_MS);

      const tail = (): string[] => ['--workflow', payload.instance.id, '--step', payload.next.key];

      it('a value holding a space prints the placeholder; a value in the ID class is printed', () => {
        expect(actionOf(payload.next, 'memory.add(type: task, title: "{release.title}", release: "{release.version}")').binding.argv).toEqual([
          'wingfoil', 'memory', 'add', '--type', 'task', '--title', '<title>', '--set', 'release=v1', ...tail(),
        ]);
      });

      it('a title around an interpolated value is one argv element', () => {
        expect(actionOf(payload.next, 'memory.add(type: decision-log, title: "Retrospective {release.version}")').binding.argv).toEqual([
          'wingfoil', 'memory', 'add', '--type', 'decision-log', '--title', 'Retrospective v1', ...tail(),
        ]);
      });

      it('a title around a value outside the ID class prints the placeholder', () => {
        expect(actionOf(payload.next, 'memory.add(type: adr, title: "Retrospective {release.title}")').binding.argv).toEqual([
          'wingfoil', 'memory', 'add', '--type', 'adr', '--title', '<title>', ...tail(),
        ]);
      });
    });

    describe('W_ACTION_ARGUMENT_NOT_PASSED (spec-017 §2, §7.5)', () => {
      const CODE = 'W_ACTION_ARGUMENT_NOT_PASSED';
      const expected = (file: string, path: string, name: string, type: string): Diagnostic => ({
        code: CODE,
        severity: 'warning',
        file: `.wingfoil/workflows/custom/${file}.yaml`,
        path,
        message: `memory.add argument '${name}' cannot be passed: type '${type}' has no token {${name}} in its id_pattern or path`,
      });
      const listed = (args: string[]): Diagnostic[] => {
        const run = wingfoil(base, ['workflow', 'list', ...args, '--format', 'json']);
        expect(run.status).toBe(0);
        return (JSON.parse(run.stdout) as { diagnostics: Diagnostic[] }).diagnostics;
      };
      const ofFile = (diagnostics: Diagnostic[], file: string): Diagnostic[] =>
        diagnostics.filter((entry) => entry.code === CODE && entry.file === `.wingfoil/workflows/custom/${file}.yaml`);

      it.each([[[] as string[]], [['--all']]])('workflow list %j: one warning per argument, by phase, action and argument, exit 0', (args) => {
        const diagnostics = listed(args);
        expect(ofFile(diagnostics, 'demo')).toEqual([expected('demo', 'phases[0].actions[0]', 'severity', 'bug')]);
        expect(ofFile(diagnostics, 'unpassable')).toEqual([
          expected('unpassable', 'phases[0].actions[0]', 'severity', 'bug'),
          expected('unpassable', 'phases[0].actions[0]', 'owner', 'bug'),
          expected('unpassable', 'phases[1].actions[1]', 'priority', 'bug'),
        ]);
        expect(ofFile(diagnostics, 'unpassable-sub')).toEqual([expected('unpassable-sub', 'phases[0].actions[0]', 'audience', 'adr')]);
        expect(diagnostics.filter((entry) => entry.code === CODE)).toHaveLength(5);
      }, TIMEOUT_MS);

      it('comes after every other diagnostic of the payload', () => {
        const codes = listed([]).map((entry) => entry.code);
        expect(codes).toContain('W_WORKFLOW_UNBOUND_TOKEN');
        const first = codes.indexOf(CODE);
        expect(first).toBeGreaterThan(-1);
        expect(codes.slice(first).every((code) => code === CODE)).toBe(true);
      }, TIMEOUT_MS);

      it('no other command reports it', () => {
        const repo = project();
        must(repo, ['workflow', 'start', 'demo']);
        for (const args of [['workflow', 'next', 'demo'], ['workflow', 'status'], ['workflow', 'show', 'demo']]) {
          expect(must(repo, [...args, '--format', 'json']).stdout).not.toContain(CODE);
        }
      }, TIMEOUT_MS);
    });
  });

  describe('AC 5 — one command per element with an edge for the verb (bug-518, spec-008 §1)', () => {
    const ALPHA = 'dl-001-alpha';
    const BETA = 'dl-002-beta';
    const GAMMA = 'dl-003-gamma';
    const ref = (id: string, status: string): ElementRef => ({ type: 'decision-log', id, status });

    /** A project with one draft and two pending decision-logs, the sweep started. */
    function selection(): string {
      const repo = project();
      for (const title of ['Alpha', 'Beta', 'Gamma']) must(repo, ['memory', 'add', '--type', 'decision-log', '--title', title]);
      must(repo, ['memory', 'submit', BETA]);
      must(repo, ['memory', 'submit', GAMMA]);
      must(repo, ['workflow', 'start', 'sweep']);
      return repo;
    }

    describe('one draft and two pending', () => {
      let repo: string;
      let step: OfferedStep;
      beforeAll(() => {
        repo = selection();
        step = nextJson(repo, 'sweep').next;
      }, TIMEOUT_MS);

      it('memory.approve: a command for each pending element, argv the first, the draft one reported apart', () => {
        const approve = actionOf(step, 'memory.approve');
        expect(approve.binding.commands).toEqual([
          ['wingfoil', 'memory', 'approve', BETA, '--reason', '<reason>'],
          ['wingfoil', 'memory', 'approve', GAMMA, '--reason', '<reason>'],
        ]);
        expect(approve.binding.argv).toEqual(approve.binding.commands?.[0]);
        expect(approve.notOffered).toEqual([{ element: ref(ALPHA, 'draft'), reason: "no approve edge from 'draft'" }]);
      });

      it('memory.reject: the same rule', () => {
        const reject = actionOf(step, 'memory.reject');
        expect(reject.binding.commands).toEqual([
          ['wingfoil', 'memory', 'reject', BETA, '--reason', '<reason>'],
          ['wingfoil', 'memory', 'reject', GAMMA, '--reason', '<reason>'],
        ]);
        expect(reject.notOffered).toEqual([{ element: ref(ALPHA, 'draft'), reason: "no reject edge from 'draft'" }]);
      });

      it('memory.submit: one eligible element, so argv alone, the pending ones reported apart', () => {
        const submit = actionOf(step, 'memory.submit');
        expect(submit.binding.argv).toEqual(['wingfoil', 'memory', 'submit', ALPHA]);
        expect(submit.binding.commands).toBeUndefined();
        expect(submit.notOffered).toEqual([
          { element: ref(BETA, 'pending'), reason: "no submit edge from 'pending'" },
          { element: ref(GAMMA, 'pending'), reason: "no submit edge from 'pending'" },
        ]);
      });

      it('memory.deprecate: every element has the edge, so nothing is reported apart', () => {
        const deprecate = actionOf(step, 'memory.deprecate');
        expect(deprecate.binding.commands).toEqual([ALPHA, BETA, GAMMA].map((id) => ['wingfoil', 'memory', 'deprecate', id]));
        expect(deprecate.notOffered).toBeUndefined();
      });

      it('the console prints one command per element and the reason, never two ids in a command', () => {
        const text = must(repo, ['workflow', 'next', 'sweep']).stdout;
        expect(text).toContain(`wingfoil memory approve ${BETA} --reason <reason>`);
        expect(text).toContain(`wingfoil memory approve ${GAMMA} --reason <reason>`);
        expect(text).toContain("no approve edge from 'draft'");
        expect(text).not.toContain(`${BETA} ${GAMMA}`);
      }, TIMEOUT_MS);

      it.each<[string, number]>([
        ['memory.approve', 2],
        ['memory.reject', 2],
        ['memory.deprecate', 3],
      ])('each command %s prints exits 0 as printed, with the reason filled', (token, count) => {
        const commands = actionOf(step, token).binding.commands ?? [];
        expect(commands).toHaveLength(count);
        const copy = project(repo);
        for (const command of commands) {
          const run = wingfoil(copy, asPrinted(command, { '<reason>': 'Checked by the suite' }));
          expect([command.join(' '), run.status, run.stderr]).toEqual([command.join(' '), 0, '']);
        }
      }, TIMEOUT_MS);

      it.each<[string, string[][]]>([
        ['approve', [['memory', 'approve', BETA, '--reason', 'Checked by the suite'], ['memory', 'approve', GAMMA, '--reason', 'Checked by the suite']]],
        ['reject', [['memory', 'reject', BETA, '--reason', 'Checked by the suite'], ['memory', 'reject', GAMMA, '--reason', 'Checked by the suite']]],
        ['deprecate', [['memory', 'deprecate', ALPHA], ['memory', 'deprecate', BETA], ['memory', 'deprecate', GAMMA]]],
        ['submit', [['memory', 'submit', ALPHA]]],
      ])('control: the one-id %s commands exit 0 on this fixture, whoever prints them', (_verb, commands) => {
        const copy = project(repo);
        for (const command of commands) {
          const run = wingfoil(copy, command);
          expect([command.join(' '), run.status, run.stderr]).toEqual([command.join(' '), 0, '']);
        }
      }, TIMEOUT_MS);

      it('the one command memory.submit prints exits 0 as printed', () => {
        const argv = actionOf(step, 'memory.submit').binding.argv ?? [];
        expect(argv).toEqual(['wingfoil', 'memory', 'submit', ALPHA]);
        const run = wingfoil(project(repo), asPrinted(argv, {}));
        expect([run.status, run.stderr]).toEqual([0, '']);
      }, TIMEOUT_MS);
    });

    it('one eligible element: argv names it, with no commands and nothing reported apart', () => {
      const repo = project();
      must(repo, ['memory', 'add', '--type', 'decision-log', '--title', 'Alpha']);
      must(repo, ['memory', 'submit', ALPHA]);
      must(repo, ['workflow', 'start', 'sweep']);
      const approve = actionOf(nextJson(repo, 'sweep').next, 'memory.approve');
      expect(approve.binding.argv).toEqual(['wingfoil', 'memory', 'approve', ALPHA, '--reason', '<reason>']);
      expect(approve.binding.commands).toBeUndefined();
      expect(approve.notOffered).toBeUndefined();
    }, TIMEOUT_MS);

    it('no eligible element: no argv, and the element is reported apart', () => {
      const repo = project();
      must(repo, ['memory', 'add', '--type', 'decision-log', '--title', 'Alpha']);
      must(repo, ['workflow', 'start', 'sweep']);
      const approve = actionOf(nextJson(repo, 'sweep').next, 'memory.approve');
      expect(approve.binding.argv).toBeUndefined();
      expect(approve.binding.commands).toBeUndefined();
      expect(approve.notOffered).toEqual([{ element: ref(ALPHA, 'draft'), reason: "no approve edge from 'draft'" }]);
      expect(must(repo, ['workflow', 'next', 'sweep']).stdout).not.toContain('wingfoil memory approve');
    }, TIMEOUT_MS);

    it('a target not known yet stays the placeholder <id>', () => {
      const repo = project();
      must(repo, ['workflow', 'start', 'demo']);
      expect(actionOf(nextJson(repo, 'demo').next, 'memory.submit').binding.argv).toEqual(['wingfoil', 'memory', 'submit', '<id>']);
    }, TIMEOUT_MS);
  });
});
