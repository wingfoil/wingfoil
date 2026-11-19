/**
 * task-376, design addendum — the `memory.add` arguments that cannot be passed although they name a pattern token, and
 * the declared literals of `workflow show`, on the compiled `dist/cli.js` (`spec-017` §2, §6.1, §7.6 as amended at
 * `ed64d5a2c`).
 *
 * - A name `memory add --set` reserves (`slug`, `n`): left out of the offered and of the shown command, and reported by
 *   `workflow list` with the reserved-name message.
 * - A numeric token `memory add` generates (`nnn`): left out, declared or not, and reported with the numeric-token
 *   message; the offered command creates an id `memory add` numbered.
 * - `workflow show`: a declared literal stays as declared; an operand that depends on an instance or that interpolates
 *   a value is a placeholder.
 *
 * The project is what `wingfoil init --template Scrum --no-interactive` writes, with the workflows below. Children run
 * without the agent markers (`test/agent-markers.cjs`). `dist/` is built once by jest's `globalSetup` (`bug-003`).
 * Deterministic: fixed fixture, fixed identity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { cloneTempRepo, commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 120_000;
const CODE = 'W_ACTION_ARGUMENT_NOT_PASSED';

const RESERVED_SLUG = 'memory.add(type: bug, slug: fixed)';
const RESERVED_N = 'memory.add(type: adr, n: 7)';
const ACCEPTED = 'memory.add(type: release, kind: minor)';
const NUMERIC = 'memory.add(type: bug, nnn: 7)';
const UNDECLARED = 'memory.add(type: bug)';
const LITERAL = 'memory.add(type: bug, title: "Fixed title here", tags: [demo, two])';
const INTERPOLATED_TITLE = 'memory.add(type: bug, title: "Retro {release.version}")';
const INTERPOLATED_TAGS = 'memory.add(type: adr, title: "Tagged", tags: [demo, "{release.version}"])';
const INTERPOLATED_SET = 'memory.add(type: task, title: "A task", release: "{release.version}")';

function workflow(name: string, actions: readonly string[], element = ''): string {
  return `name: ${name}\nstartable: true\n${element}phases:\n  - name: capture\n    actions:\n${actions.map((action) => `      - '${action}'\n`).join('')}`;
}

/** The project of the reserved names, the accepted control and the declared literals. */
const RESERVED_WORKFLOWS: Record<string, string> = {
  reserved: workflow('reserved', [RESERVED_SLUG]),
  'reserved-n': workflow('reserved-n', [RESERVED_N]),
  accepted: workflow('accepted', [ACCEPTED]),
  literals: workflow('literals', [LITERAL, ACCEPTED, INTERPOLATED_TITLE, INTERPOLATED_TAGS, INTERPOLATED_SET], 'element: release\n'),
};

/** The project whose bug type numbers its ids with `{nnn}`. */
const NUMERIC_WORKFLOWS: Record<string, string> = {
  numeric: workflow('numeric', [NUMERIC]),
  undeclared: workflow('undeclared', [UNDECLARED]),
};

interface Diagnostic {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}
interface OfferedAction {
  token: string;
  binding: { argv?: string[] };
}
interface NextPayload {
  instance: { id: string };
  next: { key: string; actions: OfferedAction[] };
  diagnostics: Diagnostic[];
}
interface ShowPayload {
  workflow: { phases: { actions: OfferedAction[] }[] };
}

function wingfoil(cwd: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: { ...withoutAgentMarkers(process.env) } as NodeJS.ProcessEnv });
}

function must(cwd: string, args: readonly string[]): SpawnedRun {
  const run = wingfoil(cwd, args);
  if (run.status !== 0) throw new Error(`wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
  return run;
}

function setIdentity(repo: string): void {
  git(repo, ['config', 'user.name', 'Demo Dev']);
  git(repo, ['config', 'user.email', 'demo@example.invalid']);
}

function patch(repo: string, path: string, from: string, to: string): void {
  const text = readFileSync(join(repo, path), 'utf-8');
  if (!text.includes(from)) throw new Error(`${path} does not hold: ${from}`);
  writeFixtureFile(repo, path, text.replace(from, to));
}

function buildProject(bugPattern: string, workflows: Record<string, string>): string {
  const repo = makeTempGitRepo();
  setIdentity(repo);
  must(repo, ['init', '--template', 'Scrum', '--no-interactive']);
  patch(repo, '.wingfoil/memory.yaml', 'id_pattern: "bug-{n}-{slug}"', `id_pattern: "${bugPattern}"`);
  patch(repo, '.wingfoil/memory.yaml', 'path: docs/memory/task/{id}.md', 'path: docs/memory/{release}/{id}.md');
  patch(repo, '.wingfoil/memory.yaml', 'id_pattern: "release-{n}"', 'id_pattern: "{kind}-{version}"');
  patch(repo, '.wingfoil/dna.yaml', '  members: []\n', '  members:\n    - name: Demo Dev\n      email: demo@example.invalid\n      roles: [ approver, developer ]\n');
  writeFixtureFile(
    repo,
    '.wingfoil/workflows.yaml',
    `version: 1\nformat: 1\n\ninclude:\n${Object.keys(workflows).map((name) => `  - workflows/custom/${name}.yaml\n`).join('')}`,
  );
  for (const [name, content] of Object.entries(workflows)) writeFixtureFile(repo, `.wingfoil/workflows/custom/${name}.yaml`, content);
  commitAll(repo, 'the fixture workflows');
  return repo;
}

function listed(repo: string): Diagnostic[] {
  const run = wingfoil(repo, ['workflow', 'list', '--format', 'json']);
  expect(run.status).toBe(0);
  return (JSON.parse(run.stdout) as { diagnostics: Diagnostic[] }).diagnostics.filter((entry) => entry.code === CODE);
}

const warning = (name: string, message: string): Diagnostic => ({
  code: CODE,
  severity: 'warning',
  file: `.wingfoil/workflows/custom/${name}.yaml`,
  path: 'phases[0].actions[0]',
  message,
});

function nextJson(repo: string, ref: string): NextPayload {
  return JSON.parse(must(repo, ['workflow', 'next', ref, '--format', 'json']).stdout) as NextPayload;
}

function offered(payload: NextPayload, action: string): string[] {
  const found = payload.next.actions.find((entry) => entry.token === action);
  if (found?.binding.argv === undefined) throw new Error(`no command offered for ${action}`);
  return found.binding.argv;
}

function shown(repo: string, name: string, action: string): string[] {
  const payload = JSON.parse(must(repo, ['workflow', 'show', name, '--format', 'json']).stdout) as ShowPayload;
  const found = payload.workflow.phases[0]!.actions.find((entry) => entry.token === action);
  if (found?.binding.argv === undefined) throw new Error(`no command shown for ${action}`);
  return found.binding.argv;
}

/** The printed command as a child's arguments, `<title>` filled. */
const asPrinted = (argv: readonly string[], title: string): string[] => argv.slice(1).map((element) => (element === '<title>' ? title : element));

const SHOWN_TAIL = ['--workflow', '<instance-id>', '--step', '<key>'];

describe('task-376 design addendum — tokens that cannot be passed (spec-017 §2, §6.1)', () => {
  const repos: string[] = [];
  let reservedBase: string;
  let numericBase: string;

  function project(source: string): string {
    const repo = cloneTempRepo(source);
    repos.push(repo);
    setIdentity(repo);
    return repo;
  }

  beforeAll(() => {
    reservedBase = buildProject('bug-{n}-{slug}', RESERVED_WORKFLOWS);
    numericBase = buildProject('bug-{nnn}-{slug}', NUMERIC_WORKFLOWS);
  }, TIMEOUT_MS);
  afterAll(() => {
    for (const repo of [...repos, reservedBase, numericBase]) removeTempDir(repo);
  });

  describe('a name memory add --set reserves', () => {
    it('workflow list: exit 0, one warning per reserved argument, with the reserved-name message', () => {
      expect(listed(reservedBase)).toEqual(
        expect.arrayContaining([
          warning('reserved', "memory.add argument 'slug' cannot be passed: memory add --set reserves the name 'slug'"),
          warning('reserved-n', "memory.add argument 'n' cannot be passed: memory add --set reserves the name 'n'"),
        ]),
      );
      expect(listed(reservedBase)).toHaveLength(2);
    }, TIMEOUT_MS);

    it('workflow next: the offered command leaves slug out, and the payload reports no such diagnostic', () => {
      const repo = project(reservedBase);
      must(repo, ['workflow', 'start', 'reserved']);
      const payload = nextJson(repo, 'reserved');
      expect(offered(payload, RESERVED_SLUG)).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', '--workflow', payload.instance.id, '--step', 'reserved.capture',
      ]);
      expect(payload.diagnostics.map((entry) => entry.code)).not.toContain(CODE);
    }, TIMEOUT_MS);

    it('workflow show: the shown command leaves slug out', () => {
      expect(shown(reservedBase, 'reserved', RESERVED_SLUG)).toEqual(['wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', ...SHOWN_TAIL]);
    }, TIMEOUT_MS);

    it('the offered command, with <title> filled, exits 0 as printed: --set refuses nothing', () => {
      const repo = project(reservedBase);
      must(repo, ['workflow', 'start', 'reserved']);
      const run = wingfoil(repo, asPrinted(offered(nextJson(repo, 'reserved'), RESERVED_SLUG), 'Probe one'));
      expect([run.status, run.stderr]).toEqual([0, '']);
    }, TIMEOUT_MS);

    it('control: an argument naming an accepted token is offered as --set and raises no diagnostic', () => {
      const repo = project(reservedBase);
      must(repo, ['workflow', 'start', 'accepted']);
      const payload = nextJson(repo, 'accepted');
      expect(offered(payload, ACCEPTED)).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'release', '--title', '<title>', '--set', 'kind=minor', '--set', 'version=<version>',
        '--workflow', payload.instance.id, '--step', 'accepted.capture',
      ]);
      expect(listed(reservedBase).filter((entry) => entry.file === '.wingfoil/workflows/custom/accepted.yaml')).toEqual([]);
    }, TIMEOUT_MS);
  });

  describe('a numeric token memory add generates', () => {
    it('workflow list: exit 0, exactly one warning, with the numeric-token message', () => {
      expect(listed(numericBase)).toEqual([warning('numeric', "memory.add argument 'nnn' cannot be passed: memory add generates the numeric token {nnn}")]);
    }, TIMEOUT_MS);

    it.each<[string, string]>([
      ['numeric', NUMERIC],
      ['undeclared', UNDECLARED],
    ])('workflow next and workflow show on %s: no argv element holds nnn=', (name, action) => {
      const repo = project(numericBase);
      must(repo, ['workflow', 'start', name]);
      const payload = nextJson(repo, name);
      expect(offered(payload, action)).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', '--workflow', payload.instance.id, '--step', `${name}.capture`,
      ]);
      expect(shown(repo, name, action)).toEqual(['wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', ...SHOWN_TAIL]);
    }, TIMEOUT_MS);

    it('the offered command, with <title> filled, exits 0 and creates an id memory add numbered, not the declared 7', () => {
      const repo = project(numericBase);
      must(repo, ['workflow', 'start', 'numeric']);
      const run = wingfoil(repo, asPrinted(offered(nextJson(repo, 'numeric'), NUMERIC), 'Probe one'));
      expect([run.status, run.stderr]).toEqual([0, '']);
      expect((JSON.parse(run.stdout) as { id: string }).id).toBe('bug-001-probe-one');
    }, TIMEOUT_MS);
  });

  describe('workflow show keeps a declared literal (spec-017 §7.6)', () => {
    it('a literal title and literal tags stay as declared; the instance operands are placeholders', () => {
      expect(shown(reservedBase, 'literals', LITERAL)).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'bug', '--title', 'Fixed title here', '--tags', 'demo,two', ...SHOWN_TAIL,
      ]);
    }, TIMEOUT_MS);

    it('a literal pattern token stays as declared; a token not given is a placeholder', () => {
      expect(shown(reservedBase, 'literals', ACCEPTED)).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'release', '--title', '<title>', '--set', 'kind=minor', '--set', 'version=<version>', ...SHOWN_TAIL,
      ]);
    }, TIMEOUT_MS);

    it('a title that interpolates a value is <title> as a whole', () => {
      expect(shown(reservedBase, 'literals', INTERPOLATED_TITLE)).toEqual(['wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', ...SHOWN_TAIL]);
    }, TIMEOUT_MS);

    it('a tags list that interpolates a value is <tags> as a whole, its literal entry included', () => {
      expect(shown(reservedBase, 'literals', INTERPOLATED_TAGS)).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'adr', '--title', 'Tagged', '--tags', '<tags>', ...SHOWN_TAIL,
      ]);
    }, TIMEOUT_MS);

    it('a pattern token that interpolates a value is its placeholder', () => {
      expect(shown(reservedBase, 'literals', INTERPOLATED_SET)).toEqual([
        'wingfoil', 'memory', 'add', '--type', 'task', '--title', 'A task', '--set', 'release=<release>', ...SHOWN_TAIL,
      ]);
    }, TIMEOUT_MS);
  });
});
