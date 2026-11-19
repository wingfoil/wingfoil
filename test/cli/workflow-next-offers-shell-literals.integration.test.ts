/**
 * task-376, fix round after re-review — the console quotes a declared literal shaped like a placeholder, and only a real
 * placeholder stays unquoted (`spec-017` §6.1), on the compiled `dist/cli.js`. The spelling cannot tell the two apart, so
 * each printed command is also run through a real shell: `--title <draft>` unquoted is a redirection.
 *
 * The project is what `wingfoil init --template Scrum --no-interactive` writes, with the workflows below. Children run
 * without the agent markers (`test/agent-markers.cjs`). `dist/` is built once by jest's `globalSetup` (`bug-003`).
 * Deterministic: fixed fixture, fixed identity.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { cloneTempRepo, commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 120_000;

const LITERALS = `name: literals
startable: true
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug, title: "<draft>")'
      - 'memory.add(type: task, title: "Set literal", release: "<rel>")'
      - 'memory.add(type: adr, title: "Tagged", tags: ["<tag>"])'
      - 'memory.add(type: release, kind: "<kind>")'
      - 'memory.add(type: decision-log)'
`;

const COLLIDING = `name: colliding
startable: true
element: release
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug, title: "<tags>", tags: ["{release.title}"])'
`;

const RUNS = `name: runs
startable: true
phases:
  - name: capture
    actions:
      - 'ops.say(word: "<draft>")'
      - ops.fixed
`;

const CHAINED = `name: chained
startable: true
phases:
  - name: checkpoint
    actions:
      - ops.fixed
  - name: capture
    actions:
      - 'memory.add(type: bug, title: "<draft>")'
`;

const BINDINGS = `version: 1.0
actions:
  ops.say: { run: [echo, "{word}"] }
  ops.fixed: { run: [echo, "<fixed>"] }
`;

const WORKFLOWS: Record<string, string> = { literals: LITERALS, colliding: COLLIDING, runs: RUNS, chained: CHAINED };

interface OfferedAction {
  token: string;
  binding: { argv?: string[] };
}

const childEnv = (path: string = process.env['PATH'] ?? ''): NodeJS.ProcessEnv => ({ ...withoutAgentMarkers(process.env), PATH: path }) as NodeJS.ProcessEnv;

function must(cwd: string, args: readonly string[]): SpawnedRun {
  const run = spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: childEnv() });
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
  writeFixtureFile(repo, '.wingfoil/workflows/bindings.yaml', BINDINGS);
  commitAll(repo, 'the fixture workflows');
  return repo;
}

/** The command the console prints for the action whose text is `action`. */
function printed(stdout: string, action: string): string {
  const line = stdout.split('\n').find((entry) => entry.startsWith(`    - ${action} [`));
  const command = line === undefined ? undefined : /\[(?:wingfoil|run): (.*)\]$/.exec(line)?.[1];
  if (command === undefined) throw new Error(`no command printed for ${action} in:\n${stdout}`);
  return command;
}

describe('task-376 after re-review — a declared literal shaped like a placeholder (spec-017 §6.1)', () => {
  const repos: string[] = [];
  let base: string;
  let shim: string;

  function project(): string {
    const repo = cloneTempRepo(base);
    repos.push(repo);
    setIdentity(repo);
    return repo;
  }

  /** `command` as a POSIX shell runs it, `wingfoil` being the compiled CLI. */
  const inShell = (repo: string, command: string): SpawnedRun =>
    spawnCapture('bash', ['-c', command], { cwd: repo, env: childEnv(`${shim}:${process.env['PATH'] ?? ''}`) });

  beforeAll(() => {
    base = buildBase();
    shim = mkdtempSync(join(tmpdir(), 'wf-376-shell-'));
    writeFileSync(join(shim, 'wingfoil'), `#!/bin/sh\nexec node "${resolve(CLI_ENTRY)}" "$@"\n`);
    chmodSync(join(shim, 'wingfoil'), 0o755);
  }, TIMEOUT_MS);
  afterAll(() => {
    for (const repo of [...repos, base]) removeTempDir(repo);
    rmSync(shim, { recursive: true, force: true });
  });

  describe('workflow next', () => {
    let repo: string;
    let stdout: string;
    beforeAll(() => {
      repo = project();
      must(repo, ['workflow', 'start', 'literals']);
      stdout = must(repo, ['workflow', 'next', 'literals']).stdout;
    }, TIMEOUT_MS);

    it.each<[string, string]>([
      ['memory.add(type: bug, title: "<draft>")', "--title '<draft>' --workflow"],
      ['memory.add(type: task, title: "Set literal", release: "<rel>")', "--set 'release=<rel>' --workflow"],
      ['memory.add(type: adr, title: "Tagged", tags: ["<tag>"])', "--tags '<tag>' --workflow"],
    ])('%s: the literal is quoted', (action, expected) => {
      expect(printed(stdout, action)).toContain(expected);
    });

    it('a literal spelled as a token placeholder is quoted, and the real placeholders beside it are not', () => {
      expect(printed(stdout, 'memory.add(type: release, kind: "<kind>")')).toContain("--title <title> --set 'kind=<kind>' --set version=<version> --workflow");
    });

    it('a real placeholder stays unquoted', () => {
      expect(printed(stdout, 'memory.add(type: decision-log)')).toContain('--title <title> --workflow');
    });

    it('the JSON argv holds each literal as declared, with no quotes', () => {
      const payload = JSON.parse(must(repo, ['workflow', 'next', 'literals', '--format', 'json']).stdout) as { next: { actions: OfferedAction[] } };
      const argv = payload.next.actions.flatMap((action) => action.binding.argv ?? []);
      expect(argv).toEqual(expect.arrayContaining(['<draft>', 'release=<rel>', '<tag>', 'kind=<kind>', 'version=<version>']));
    }, TIMEOUT_MS);

    it('the printed title literal runs as printed in a real shell', () => {
      const copy = project();
      must(copy, ['workflow', 'start', 'literals']);
      const run = inShell(copy, printed(stdout, 'memory.add(type: bug, title: "<draft>")'));
      expect([run.status, run.stderr]).toEqual([0, '']);
      const { path } = JSON.parse(run.stdout) as { path: string };
      expect(readFileSync(join(copy, path), 'utf-8')).toContain('title: "<draft>"');
    }, TIMEOUT_MS);

    it('the printed --set literal runs as printed in a real shell', () => {
      const copy = project();
      must(copy, ['workflow', 'start', 'literals']);
      const run = inShell(copy, printed(stdout, 'memory.add(type: task, title: "Set literal", release: "<rel>")'));
      expect([run.status, run.stderr]).toEqual([0, '']);
      expect((JSON.parse(run.stdout) as { path: string }).path).toContain('/<rel>/');
    }, TIMEOUT_MS);
  });

  it('the same spelling in one command: the literal title is quoted, the placeholder of the tags is not', () => {
    const repo = project();
    must(repo, ['memory', 'add', '--type', 'release', '--title', 'Two words', '--set', 'kind=minor', '--set', 'version=v1']);
    must(repo, ['workflow', 'start', 'colliding', '--element', 'release:minor-v1']);
    const stdout = must(repo, ['workflow', 'next', 'colliding']).stdout;
    expect(printed(stdout, 'memory.add(type: bug, title: "<tags>", tags: ["Two words"])')).toContain("--title '<tags>' --tags <tags> --workflow");
  }, TIMEOUT_MS);

  describe('a project run binding holds no placeholder', () => {
    let repo: string;
    let stdout: string;
    beforeAll(() => {
      repo = project();
      must(repo, ['workflow', 'start', 'runs']);
      stdout = must(repo, ['workflow', 'next', 'runs']).stdout;
    }, TIMEOUT_MS);

    it.each<[string, string, string]>([
      ['ops.say(word: "<draft>")', "echo '<draft>'", '<draft>\n'],
      ['ops.fixed', "echo '<fixed>'", '<fixed>\n'],
    ])('%s prints %s and runs as printed in a real shell', (action, command, output) => {
      expect(printed(stdout, action)).toBe(command);
      const run = inShell(repo, printed(stdout, action));
      expect([run.status, run.stdout, run.stderr]).toEqual([0, output, '']);
    }, TIMEOUT_MS);
  });

  describe('the other commands that print a step', () => {
    it('workflow start quotes the literal', () => {
      expect(must(project(), ['workflow', 'start', 'literals']).stdout).toContain("--title '<draft>' --workflow");
    }, TIMEOUT_MS);

    it('workflow finalize quotes the literal of the step it moves to', () => {
      const repo = project();
      must(repo, ['workflow', 'start', 'chained']);
      expect(must(repo, ['workflow', 'finalize', 'chained']).stdout).toContain("--title '<draft>' --workflow");
    }, TIMEOUT_MS);
  });
});
