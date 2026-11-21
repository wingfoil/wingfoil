/**
 * task-350 — the global `--project <dir>` option (`dl-198` (a); `spec-008` §1, §2, §11 and `spec-011`
 * § Git-root detection algorithm, amended at the task's design gate; design D1 (a), D2 (a), D5 (a)), on
 * the compiled CLI.
 *
 * - AC 1 (red-first): every command accepts `--project <dir>`, which names the project root; a `<dir>` that
 *   is not itself a git root (no walk, D1 (a)) is refused at exit `1` with
 *   `error: E_NOT_AT_GIT_ROOT: --project is not a git root: <absolute dir>`; a blank value at exit `2` (D5 (a));
 *   reads, writes, `task-333`'s identity and membership pre-flight and the MCP server all act on the named
 *   repository.
 * - AC 2 (characterization): without `--project`, a command run from a subdirectory of the root is still
 *   refused with `error: E_NOT_AT_GIT_ROOT: run wingfoil from the project root` (exit `1`). A subdirectory of a
 *   fixture, never a directory "outside any repository": a spawned CLI's walk cannot be bounded.
 * - AC 5 (red-first, D2 (a)): `agent execute --project <root>` run from elsewhere launches and records in the
 *   named root, and its MCP server serves it (the registration's `args` are pinned in
 *   `test/cli/agent-execute-config-arg.integration.test.ts` and `test/agent/execute.test.ts`).
 *
 * The command list is the enumeration of `buildProgram(CORE_MODULES, …)`'s leaf commands (as
 * `test/docs/x-cli-cmds.test.ts` enumerates them, Commander's `help` excluded), never a literal count; the leaves
 * whose operation declares `readsProject: false` (task-362, `spec-019` §1: `capabilities`) are left out of both
 * sweeps, since they check neither `--project` nor the current directory. Every
 * child runs with `process.env` minus the agent markers (`test/agent-markers.cjs`). The expected lines were
 * copied from runs of the code build (`node dist/cli.js`, at the design commit) named in the task's notes.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import { deriveVerb, enumerateOperations } from '../../src/core/registry';
import { withoutAgentMarkers } from '../agent-markers.cjs';
import { seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import {
  commitAll,
  git,
  makeBoundedOutsideDir,
  makeTempGitRepo,
  removeTempDir,
  writeFixtureFile,
} from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const SWEEP_TIMEOUT = 180000;
const CHILD_TIMEOUT = 60000;

const NOT_AT_ROOT = 'error: E_NOT_AT_GIT_ROOT: run wingfoil from the project root\n';
const notAGitRoot = (dir: string): string => `error: E_NOT_AT_GIT_ROOT: --project is not a git root: ${dir}\n`;
const BLANK = 'error: invalid flag value: --project must not be blank\n';

/** A leaf command: its words, and whether it registers an argument (it then gets one `x` operand). */
interface Leaf {
  readonly path: string;
  readonly argv: readonly string[];
}

async function leafCommands(root: string): Promise<Leaf[]> {
  const program: Command = await buildProgram(CORE_MODULES, { resolveRoot: () => root, buildParams: () => ({}) });
  const out: Leaf[] = [];
  const add = (words: string[], command: Command): void => {
    out.push({ path: words.join(' '), argv: command.registeredArguments.length > 0 ? [...words, 'x'] : words });
  };
  for (const top of program.commands) {
    const subs = top.commands.filter((sub) => sub.name() !== 'help');
    if (subs.length === 0) add([top.name()], top);
    else for (const sub of subs) add([top.name(), sub.name()], sub);
  }
  return out;
}

/**
 * The leaf commands whose operation declares `readsProject: false` (task-362, `spec-019` §1): they read no project,
 * so neither `--project` nor the current directory is checked, and both sweeps below leave them out. Looked up in
 * `CORE_MODULES`, never by a name literal; the set is pinned to `['capabilities']` below so it cannot grow silently.
 */
function readsNoProject(): Set<string> {
  return new Set(
    enumerateOperations(CORE_MODULES)
      .filter(({ operation }) => (operation as { readsProject?: unknown }).readsProject === false)
      .map(({ module, operation }) => {
        const verb = deriveVerb(module.name, operation.name);
        return verb === '' ? module.name : `${module.name} ${verb}`;
      }),
  );
}

/** The leaves both sweeps run: every leaf but those of {@link readsNoProject}. */
const projectReading = (leaves: readonly Leaf[]): Leaf[] => leaves.filter((leaf) => !readsNoProject().has(leaf.path));

/** Run the compiled CLI in `cwd` with `process.env` minus the agent markers, plus `extra`. */
function wingfoil(cwd: string, args: readonly string[], extra: Record<string, string> = {}): SpawnedRun {
  return spawnCapture(process.execPath, [CLI_ENTRY, ...args], {
    cwd,
    env: { ...withoutAgentMarkers(process.env), ...extra } as NodeJS.ProcessEnv,
    timeout: CHILD_TIMEOUT,
  });
}

/** A second repository, initialised and committed, whose local identity is not a member of the fixture's team. */
function makeElsewhere(): string {
  const dir = makeTempGitRepo();
  git(dir, ['config', 'user.name', 'Elsewhere Person']);
  git(dir, ['config', 'user.email', 'elsewhere@example.invalid']);
  writeFixtureFile(dir, 'README.md', 'elsewhere\n');
  commitAll(dir, 'elsewhere: initial');
  return dir;
}

const withReadme = (repo: string): void => writeFixtureFile(repo, 'README.md', 'fixture\n');

describe('task-350 AC 1 — every command accepts --project <dir>, which names the project root', () => {
  let root: string;
  let sub: string;
  let elsewhere: string;
  let bounded: { dir: string; ceiling: string };
  let leaves: Leaf[];

  beforeAll(async () => {
    root = seed(withReadme);
    sub = join(root, 'sub');
    mkdirSync(sub);
    elsewhere = makeElsewhere();
    bounded = makeBoundedOutsideDir();
    leaves = await leafCommands(root);
  });
  afterAll(() => {
    for (const dir of [root, elsewhere, bounded?.ceiling]) if (dir !== undefined) removeTempDir(dir);
  });

  it('task-362: the leaves left out of both sweeps, those whose operation reads no project, are exactly [\'capabilities\']', () => {
    expect([...readsNoProject()].sort()).toEqual(['capabilities']);
    expect(leaves.map((leaf) => leaf.path)).toContain('capabilities');
  });

  it(
    'every leaf command that reads a project, run from another repository with --project <a subdirectory of the root>, is refused with E_NOT_AT_GIT_ROOT naming it (never `unknown option`)',
    () => {
      const swept = projectReading(leaves);
      expect(swept.length).toBeGreaterThan(0);
      const results = swept.map((leaf) => {
        const run = wingfoil(elsewhere, ['--project', sub, ...leaf.argv]);
        return [leaf.path, run.status, run.stderr];
      });
      expect(results).toEqual(swept.map((leaf) => [leaf.path, 1, notAGitRoot(sub)]));
    },
    SWEEP_TIMEOUT,
  );

  it.each([
    ['a directory outside every repository', (): string => bounded.dir],
    ['a missing path', (): string => join(root, 'nope')],
    ['a file', (): string => join(root, 'README.md')],
  ] as const)('dna show --project <%s> is refused with E_NOT_AT_GIT_ROOT naming its absolute path, exit 1', (_label, named) => {
    const dir = named();
    expect(wingfoil(elsewhere, ['--project', dir, 'dna', 'show'])).toEqual({ status: 1, stdout: '', stderr: notAGitRoot(dir) });
  });

  it('a relative value is resolved against the current directory and named by its absolute path', () => {
    expect(wingfoil(root, ['--project', 'sub', 'dna', 'show'])).toEqual({ status: 1, stdout: '', stderr: notAGitRoot(sub) });
  });

  it('dna show reads the named root: the same stdout from the root, from elsewhere with --project <root>, and from a subdirectory with --project ..', () => {
    const atRoot = wingfoil(root, ['--format', 'json', 'dna', 'show']);
    expect(atRoot.status).toBe(0);
    expect(atRoot.stdout).toMatch(/"name":"Fixture"/);
    expect(wingfoil(elsewhere, ['--format', 'json', '--project', root, 'dna', 'show'])).toEqual(atRoot);
    expect(wingfoil(sub, ['--format', 'json', '--project', '..', 'dna', 'show'])).toEqual(atRoot);
  });

  it('the flag is also accepted after the verb', () => {
    const atRoot = wingfoil(root, ['--format', 'json', 'dna', 'show']);
    expect(wingfoil(elsewhere, ['dna', 'show', '--project', root, '--format', 'json'])).toEqual(atRoot);
  });

  it('D5 (a) — a blank value is refused at exit 2, for dna show, init and mcp alike', () => {
    expect(wingfoil(elsewhere, ['dna', 'show', '--project', ''])).toEqual({ status: 2, stdout: '', stderr: BLANK });
    expect(wingfoil(elsewhere, ['init', '--project', ''])).toEqual({ status: 2, stdout: '', stderr: BLANK });
    expect(wingfoil(elsewhere, ['mcp', '--project', ''])).toEqual({ status: 2, stdout: '', stderr: BLANK });
  });

  it('D5 (a) — an invalid --format is refused first (spec-008 §1 order)', () => {
    expect(wingfoil(elsewhere, ['--format', 'bogus', 'dna', 'show', '--project', ''])).toEqual({
      status: 2,
      stdout: '',
      stderr: 'error: invalid --format value "bogus", expected one of: console, json, yaml\n',
    });
  });

  it('--help and --version keep their precedence: the value is not checked', () => {
    expect(wingfoil(elsewhere, ['--project', sub, '--help']).status).toBe(0);
    expect(wingfoil(elsewhere, ['--project', '', '--help']).status).toBe(0);
    const version = wingfoil(elsewhere, ['--project', sub, '--version']);
    expect(version.status).toBe(0);
    // The build stamp ends in `-dirty` when a build input had changes (test/cli/build-info.test.ts, review finding 1).
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\S* \([0-9a-f]{40}(?:-dirty)?\)\n$/);
  });

  it(
    'mcp --project <root>, started in another repository, serves the named root',
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [CLI_ENTRY, '--project', root, 'mcp'],
        cwd: elsewhere,
        env: withoutAgentMarkers(process.env) as Record<string, string>,
        stderr: 'pipe',
      });
      const client = new Client({ name: 'task-350-project-option', version: '0.0.0' });
      try {
        await client.connect(transport);
        const result = await client.readResource({ uri: 'wingfoil://dna' });
        const text = (result.contents[0] as { text: string }).text;
        expect((JSON.parse(text) as { project: { name: string } }).project.name).toBe('Fixture');
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    CHILD_TIMEOUT,
  );
});

describe('task-350 AC 1 — a write lands in the named root, and task-333\'s pre-flight reads the named root', () => {
  let root: string;
  let elsewhere: string;

  beforeAll(() => {
    root = seed(withReadme);
    elsewhere = makeElsewhere();
  });
  afterAll(() => {
    for (const dir of [root, elsewhere]) if (dir !== undefined) removeTempDir(dir);
  });

  it('memory add --project <root>, run from another repository whose identity is no member, commits in the root as the root\'s member identity', () => {
    const elsewhereHead = git(elsewhere, ['rev-parse', 'HEAD']).trim();
    const run = wingfoil(elsewhere, ['memory', 'add', '--type', 'task', '--title', 't', '--set', 'release=v0.1', '--project', root]);
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(git(root, ['log', '-1', '--format=%s']).trim()).toBe('wf(task): add task-204-t');
    expect(git(root, ['log', '-1', '--format=%an <%ae>']).trim()).toBe('WingFoil Test <wf-test@example.invalid>');
    expect(git(elsewhere, ['rev-parse', 'HEAD']).trim()).toBe(elsewhereHead);
  });

  it('with the root\'s own identity no member, the refusal names the root\'s identity, not the current directory\'s', () => {
    git(root, ['config', 'user.name', 'No Body']);
    git(root, ['config', 'user.email', 'nobody@example.invalid']);
    try {
      const run = wingfoil(elsewhere, ['memory', 'add', '--type', 'task', '--title', 't2', '--set', 'release=v0.1', '--project', root]);
      expect(run.status).toBe(1);
      expect(run.stderr.split('\n')[0]).toBe(
        'error: E_NOT_A_MEMBER: the git identity No Body <nobody@example.invalid> is not a team member: no team.members entry of the dna.yaml committed at HEAD has the email nobody@example.invalid, and only a member changes this project (dl-220)',
      );
    } finally {
      git(root, ['config', 'user.name', 'WingFoil Test']);
      git(root, ['config', 'user.email', 'wf-test@example.invalid']);
    }
  });
});

describe('task-350 AC 5 — agent execute --project <root>, run from another repository, acts on the named root', () => {
  const scratch: string[] = [];
  let root: string;
  let elsewhere: string;

  beforeAll(() => {
    root = seed();
    elsewhere = makeElsewhere();
  });
  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
    for (const dir of [root, elsewhere]) if (dir !== undefined) removeTempDir(dir);
  });

  it(
    'exits 0, records the run in the root, and the agent reads the session Resource through the registered server',
    () => {
      const before = git(root, ['rev-parse', 'HEAD']).trim();
      const elsewhereHead = git(elsewhere, ['rev-parse', 'HEAD']).trim();
      const tmp = mkdtempSync(join(tmpdir(), 'wf-project-option-tmp-'));
      const recDir = mkdtempSync(join(tmpdir(), 'wf-project-option-rec-'));
      scratch.push(tmp, recDir);
      const recordFile = join(recDir, 'fake.jsonl');
      const inherited = Object.fromEntries(
        Object.entries(withoutAgentMarkers(process.env)).filter(([name]) => !/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)),
      ) as Record<string, string>;
      const run = spawnCapture(process.execPath, [CLI_ENTRY, 'agent', 'execute', '--element', TASK_REF, '--role', 'developer', '--project', root], {
        cwd: elsewhere,
        env: { ...inherited, TMPDIR: tmp, TMP: tmp, TEMP: tmp, WINGFOIL_FAKE_AGENT_RECORD: recordFile, WINGFOIL_FAKE_AGENT_CONNECT: '1' },
        timeout: SWEEP_TIMEOUT,
      });
      expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: expect.not.stringMatching(/^error: /m) });
      expect(git(root, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
      expect(git(root, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${TASK_ID}/adhoc/1`);
      expect(git(elsewhere, ['rev-parse', 'HEAD']).trim()).toBe(elsewhereHead);
      const launch = readFileSync(recordFile, 'utf-8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as { argv: string[]; mcp: { resource?: { uri: string }; text?: string | null } | null })
        .find((entry) => entry.argv.includes('--prompt'));
      expect(launch?.mcp?.resource).toEqual({ uri: `wingfoil://session/developer/${TASK_REF}/${before}` });
      expect(launch?.mcp?.text).toEqual(expect.stringMatching(/\S/));
    },
    SWEEP_TIMEOUT,
  );
});

describe('task-350 AC 2 — without --project, a command run from a subdirectory of the root is still refused', () => {
  let root: string;
  let sub: string;
  let leaves: Leaf[];

  beforeAll(async () => {
    root = seed();
    sub = join(root, 'sub');
    mkdirSync(sub);
    leaves = await leafCommands(root);
  });
  afterAll(() => {
    if (root !== undefined) removeTempDir(root);
  });

  it(
    'every leaf command that reads a project exits 1 with `error: E_NOT_AT_GIT_ROOT: run wingfoil from the project root`',
    () => {
      const swept = projectReading(leaves);
      expect(swept.length).toBeGreaterThan(0);
      const results = swept.map((leaf) => {
        const run = wingfoil(sub, leaf.argv);
        return [leaf.path, run.status, run.stderr];
      });
      expect(results).toEqual(swept.map((leaf) => [leaf.path, 1, NOT_AT_ROOT]));
    },
    SWEEP_TIMEOUT,
  );

  it('with --format json the refusal is the JSON error object', () => {
    expect(wingfoil(sub, ['workflow', 'list', '--format', 'json'])).toEqual({
      status: 1,
      stdout: '',
      stderr: '{"error":"E_NOT_AT_GIT_ROOT: run wingfoil from the project root"}\n',
    });
  });
});
