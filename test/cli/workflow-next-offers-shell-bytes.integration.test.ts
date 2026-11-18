/**
 * task-376, fix round after the third review — a value the console prints reaches a real shell byte for byte (`spec-017`
 * §6.1), on the compiled `dist/cli.js`. An element is bare only when it matches an allow list; bash otherwise rewrites
 * `x=~/notes` or `x{a,b}y` with exit 0 and no warning.
 *
 * The route is a project `run` binding, `ops.say(word: "<value>")`: an action argument reaches its `run` element whole,
 * braces included, where a `memory.add` title would read `{a,b}` as a token. One bash process runs every printed command,
 * and its function `emit` reports the arguments it received.
 *
 * Children run without the agent markers (`test/agent-markers.cjs`). `dist/` is built once by jest's `globalSetup`
 * (`bug-003`). Deterministic: fixed fixture, fixed identity.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 120_000;

/** What the console may print bare (the ruling of the third review). */
const BARE = /^[A-Za-z0-9_@%+=:,./-]+$/;

const PRINTABLE = Array.from({ length: 0x7f - 0x20 }, (_unused, index) => String.fromCharCode(0x20 + index));

/** Each printable character alone, at the start, in the middle, at the end, after `=` and after `:`. */
const PER_CHARACTER = PRINTABLE.flatMap((char) => [char, `${char}x`, `a${char}b`, `a${char}`, `k=${char}v`, `k:${char}v`]);

const NAMED = ['x=~/notes', 'see=~root', 'k=~', 'x{a,b}y', '{1..3}', 'dir=~/out', 'a^b', '#x', '~', 'plain-1.2_x', 'a=b:c,d/e', 'é', '[x', 'x#y', '%a', '-n', ''];

const VALUES = [...new Set([...PER_CHARACTER, ...NAMED])];

/** The action declaring `value`, in the quotes the value does not hold. */
function sayToken(value: string): string {
  const quote = value.includes('"') ? "'" : '"';
  return `ops.say(word: ${quote}${value}${quote})`;
}

const yamlList = (tokens: readonly string[]): string => tokens.map((token) => `      - ${JSON.stringify(token)}\n`).join('');

const BYTES = `name: bytes\nstartable: true\nphases:\n  - name: say\n    actions:\n${yamlList(VALUES.map(sayToken))}`;

const TITLED = `name: titled\nstartable: true\nphases:\n  - name: capture\n    actions:\n${yamlList(['memory.add(type: bug, title: "x=~/notes")'])}`;

const BINDINGS = `version: 1.0\nactions:\n  ops.say: { run: [emit, "{word}"] }\n`;

/** One line per call of `emit`: the argument count, then each argument, every field closed by a NUL. */
const PROLOGUE = `emit() { printf '%d\\0' "$#"; for a in "$@"; do printf '%s\\0' "$a"; done; }\n`;

const childEnv = (path: string = process.env['PATH'] ?? ''): NodeJS.ProcessEnv => ({ ...withoutAgentMarkers(process.env), PATH: path }) as NodeJS.ProcessEnv;

function must(cwd: string, args: readonly string[]): SpawnedRun {
  const run = spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: childEnv() });
  if (run.status !== 0) throw new Error(`wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
  return run;
}

function patch(repo: string, path: string, from: string, to: string): void {
  const text = readFileSync(join(repo, path), 'utf-8');
  if (!text.includes(from)) throw new Error(`${path} does not hold: ${from}`);
  writeFixtureFile(repo, path, text.replace(from, to));
}

function buildProject(): string {
  const repo = makeTempGitRepo();
  git(repo, ['config', 'user.name', 'Demo Dev']);
  git(repo, ['config', 'user.email', 'demo@example.invalid']);
  must(repo, ['init', '--template', 'Scrum', '--no-interactive']);
  patch(repo, '.wingfoil/dna.yaml', '  members: []\n', '  members:\n    - name: Demo Dev\n      email: demo@example.invalid\n      roles: [ approver, developer ]\n');
  writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1\nformat: 1\n\ninclude:\n  - workflows/custom/bytes.yaml\n  - workflows/custom/titled.yaml\n');
  writeFixtureFile(repo, '.wingfoil/workflows/custom/bytes.yaml', BYTES);
  writeFixtureFile(repo, '.wingfoil/workflows/custom/titled.yaml', TITLED);
  writeFixtureFile(repo, '.wingfoil/workflows/bindings.yaml', BINDINGS);
  commitAll(repo, 'the fixture workflows');
  return repo;
}

/** The arguments of each call of `emit`, in call order. */
function emitted(stdout: string): string[][] {
  const fields = stdout.split('\0').slice(0, -1);
  const calls: string[][] = [];
  for (let at = 0; at < fields.length; ) {
    const count = Number(fields[at]);
    calls.push(fields.slice(at + 1, at + 1 + count));
    at += 1 + count;
  }
  return calls;
}

describe('task-376 after the third review — a printed value reaches bash byte for byte (spec-017 §6.1)', () => {
  let repo: string;
  let shim: string;
  let commands: string[];
  let argvs: string[][];
  let delivered: SpawnedRun;

  beforeAll(() => {
    repo = buildProject();
    must(repo, ['workflow', 'start', 'bytes']);
    commands = must(repo, ['workflow', 'next', 'bytes'])
      .stdout.split('\n')
      .flatMap((line) => /^ {4}- ops\.say\(.*?\) \[run: (emit.*)\]$/.exec(line)?.[1] ?? []);
    const payload = JSON.parse(must(repo, ['workflow', 'next', 'bytes', '--format', 'json']).stdout) as { next: { actions: { binding: { argv: string[] } }[] } };
    argvs = payload.next.actions.map((action) => action.binding.argv);
    delivered = spawnCapture('bash', ['-c', `${PROLOGUE}${commands.join('\n')}\n`], { cwd: repo, env: childEnv() });
    shim = mkdtempSync(join(tmpdir(), 'wf-376-bytes-'));
    writeFileSync(join(shim, 'wingfoil'), `#!/bin/sh\nexec node "${resolve(CLI_ENTRY)}" "$@"\n`);
    chmodSync(join(shim, 'wingfoil'), 0o755);
  }, TIMEOUT_MS);
  afterAll(() => {
    removeTempDir(repo);
    rmSync(shim, { recursive: true, force: true });
  });

  /** The values of `subset` that bash did not receive whole, each with what was printed and what arrived. */
  function changed(subset: readonly string[]): { value: string; printed: string; arrived: string[] | undefined }[] {
    const calls = emitted(delivered.stdout);
    return subset.flatMap((value) => {
      const index = VALUES.indexOf(value);
      const arrived = calls[index];
      return arrived !== undefined && arrived.length === 1 && arrived[0] === value ? [] : [{ value, printed: commands[index]!, arrived }];
    });
  }

  it('the fixture: one printed command and one JSON argv per value, each argv holding the value as declared', () => {
    expect(commands).toHaveLength(VALUES.length);
    expect(argvs).toEqual(VALUES.map((value) => ['emit', value]));
  });

  it('bash runs the whole batch', () => {
    expect([delivered.status, delivered.stderr]).toEqual([0, '']);
    expect(emitted(delivered.stdout)).toHaveLength(VALUES.length);
  });

  it('every printable ASCII character, in every position, arrives as declared', () => {
    expect(changed(PER_CHARACTER)).toEqual([]);
  });

  it('the named values arrive as declared', () => {
    expect(changed(NAMED)).toEqual([]);
  });

  it('what bash receives equals the JSON argv', () => {
    expect(emitted(delivered.stdout)).toEqual(argvs.map((argv) => argv.slice(1)));
  });

  it('an element is bare exactly when the allow list admits it, and quoted otherwise', () => {
    const wrong = VALUES.filter((value, index) => (commands[index] === `emit ${value}`) !== BARE.test(value));
    expect(wrong).toEqual([]);
  });

  it('the empty string prints as an empty pair of quotes', () => {
    expect(commands[VALUES.indexOf('')]).toBe("emit ''");
  });

  it('memory add: a title holding a tilde is written to Memory as declared', () => {
    must(repo, ['workflow', 'start', 'titled']);
    const line = must(repo, ['workflow', 'next', 'titled']).stdout.split('\n').find((entry) => entry.includes('[wingfoil: wingfoil memory add'));
    const command = /\[wingfoil: (.*)\]$/.exec(line ?? '')?.[1] ?? '';
    const run = spawnCapture('bash', ['-c', command], { cwd: repo, env: childEnv(`${shim}:${process.env['PATH'] ?? ''}`) });
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(readFileSync(join(repo, (JSON.parse(run.stdout) as { path: string }).path), 'utf-8')).toContain('title: "x=~/notes"');
  }, TIMEOUT_MS);
});
