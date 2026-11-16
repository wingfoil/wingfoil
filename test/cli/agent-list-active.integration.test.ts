/**
 * task-336 AC 6 (red-first) — `wingfoil agent list --active` on the compiled CLI (`spec-016` §5, §5.1 and §7 as amended
 * at the design gate; `spec-008` §12; `dl-181`; approver rulings D10 (a), D13 (a)): the bytes a user sees. Registry
 * entries are written by the test under the fixture's `.wingfoil/run/` (git-ignored by its committed
 * `.wingfoil/.gitignore`), their `pid` the Jest worker's own (alive while the CLI runs).
 *
 * - console: `active runs: <n>`, then `<id>  <role>  <agent>  <pid>  <started>` in §5's order; nothing on stderr;
 * - `--format json --active`: exactly `{ baseline, active, diagnostics }`, each entry §7's object;
 * - `--format json` with no flag: the keys `baseline, past, waiting, active, diagnostics` in that order;
 * - `--element` filters it;
 * - a malformed file: one `warning:` line `.wingfoil/run/<path>: not an active run entry: removed`, exit 0, the file
 *   gone; an entry whose process has exited: not listed, gone from disk.
 *
 * Today `--active` is an unknown option (exit 2), and no section reads `.wingfoil/run/`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const DNA = `version: 1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ada
      roles: [ approver ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
  runs: [ docs/runs/ ]
`;
const GITIGNORE = "# wingfoil agent execute's registry of running agents: local to this checkout, never committed.\n/run/\n";
const STARTED_MS = 1794817800000;
const STARTED = '2026-11-16T08:30:00.000Z';

interface Entry {
  readonly id: string;
  readonly pid: number;
  readonly workflow: string;
  readonly phase: string;
  readonly element: string;
  readonly role: string;
  readonly agent: string;
  readonly session: string;
  readonly started_ms: number;
}

function entry(elementId: string, phase: string, n: number, pid: number = process.pid): Entry {
  return { id: `${elementId}/${phase}/${n}`, pid, workflow: 'dev-loop', phase, element: `task:${elementId}`, role: 'developer', agent: 'claude', session: 'not-reported', started_ms: STARTED_MS };
}

function put(repo: string, relative: string, text: string): void {
  const path = join(repo, '.wingfoil', 'run', relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const putEntry = (repo: string, value: Entry): void => put(repo, `${value.id}.json`, `${JSON.stringify(value)}\n`);

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

function project(): { repo: string; sha: string } {
  const repo = makeTempGitRepo();
  repos.push(repo);
  writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA);
  writeFixtureFile(repo, '.wingfoil/.gitignore', GITIGNORE);
  commitAll(repo, 'seed');
  return { repo, sha: execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim() };
}

describe('task-336 AC 6 — wingfoil agent list --active on the compiled CLI', () => {
  let repo: string;
  let sha: string;
  beforeAll(() => {
    ({ repo, sha } = project());
    putEntry(repo, entry('task-b', 'red', 1));
    putEntry(repo, entry('task-a', 'red', 10));
    putEntry(repo, entry('task-a', 'red', 2));
  });

  it('console: the heading, then one line per entry in element, phase, n order; nothing on stderr, exit 0', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--active']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const pid = String(process.pid);
    expect(result.stdout).toBe(
      ['active runs: 3', `task-a/red/2  developer  claude  ${pid}  ${STARTED}`, `task-a/red/10  developer  claude  ${pid}  ${STARTED}`, `task-b/red/1  developer  claude  ${pid}  ${STARTED}`, ''].join('\n'),
    );
  });

  it('--format json --active: exactly baseline, active and diagnostics', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--active', '--format', 'json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ baseline: { rev: 'HEAD', commit: sha }, active: [entry('task-a', 'red', 2), entry('task-a', 'red', 10), entry('task-b', 'red', 1)], diagnostics: [] });
  });

  it('--format json with no flag: baseline, past, waiting, active, diagnostics, in that order', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--format', 'json']);
    expect(result.status).toBe(0);
    expect(Object.keys(JSON.parse(result.stdout) as object)).toEqual(['baseline', 'past', 'waiting', 'active', 'diagnostics']);
  });

  it('--element filters the active entries', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--active', '--element', 'task:task-b', '--format', 'json']);
    expect(result.status).toBe(0);
    expect((JSON.parse(result.stdout) as { active: Entry[] }).active.map((item) => item.id)).toEqual(['task-b/red/1']);
  });
});

describe('task-336 AC 6 — pruning on read (spec-016 §7; D10 (a))', () => {
  it('a malformed file: one warning: line, exit 0, the file removed and not listed', () => {
    const { repo } = project();
    putEntry(repo, entry('task-a', 'red', 1));
    put(repo, 'task-m/red/1.json', 'not json\n');
    const result = runCliEntry(repo, ['agent', 'list', '--active']);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('warning: .wingfoil/run/task-m/red/1.json: not an active run entry: removed\n');
    expect(result.stdout).toBe(['active runs: 1', `task-a/red/1  developer  claude  ${process.pid}  ${STARTED}`, ''].join('\n'));
    expect(existsSync(join(repo, '.wingfoil/run/task-m/red/1.json'))).toBe(false);
  });

  it('an entry whose process has exited: not listed, removed, no warning', () => {
    const { repo } = project();
    putEntry(repo, entry('task-z', 'green', 1, spawnSync(process.execPath, ['-e', '']).pid!));
    const result = runCliEntry(repo, ['agent', 'list', '--active']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('no active runs\n');
    expect(existsSync(join(repo, '.wingfoil/run/task-z/green/1.json'))).toBe(false);
  });
});
