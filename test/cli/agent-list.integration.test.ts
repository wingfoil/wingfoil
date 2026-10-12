/**
 * task-240 — `wingfoil agent list` on the compiled CLI (`spec-016` §5; BDD
 * `p5-interaction/P5.3.4-agent-list.feature`): the bytes a user sees — the console sections, the
 * `warning:` lines on stderr, the `json` / `yaml` payload — and the exit codes, `--active` included. The
 * operation's own cases (ordering, waiting steps, filters) are `test/core/agent-list.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { NOT_REPORTED, recordRun, serializeRunRecord, type RunRecord } from '../../src/agent';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const DNA = (runs: boolean): string => `version: 1
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
${runs ? '  runs: [ docs/runs/ ]\n' : ''}`;

function run(elementId: string, phase: string, n: number): RunRecord {
  return {
    id: `${elementId}/${phase}/${n}`,
    element: `task:${elementId}`,
    workflow: 'dev-loop',
    phase,
    role: 'developer',
    mode: 'fresh',
    agent: 'claude',
    adapter: 'built-in/claude-code',
    agent_version: NOT_REPORTED,
    model: NOT_REPORTED,
    session: NOT_REPORTED,
    tokens: { input: 1200, output: 340, cache_read: NOT_REPORTED, cache_write: NOT_REPORTED },
    wingfoil: '0.3.0 (unknown)',
    state_ref: 'b'.repeat(40),
    duration_ms: 61000,
    exit_status: 0,
    result: 'n/a',
    notes: 'none',
  };
}

describe('task-240 — wingfoil agent list on the compiled CLI', () => {
  let repo: string;
  let sha: string;

  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA(true));
    commitAll(repo, 'seed');
    const recorded = recordRun(repo, 'docs/runs/task-042-login-form.jsonl', run('task-042-login-form', 'red', 1));
    if (!recorded.ok) throw new Error(recorded.error.message);
    sha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  });

  afterAll(() => removeTempDir(repo));

  it('console (the default), no flag: both sections, nothing on stderr, exit 0', () => {
    const result = runCliEntry(repo, ['agent', 'list']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(['past runs: 1', 'task-042-login-form/red/1  developer  claude  0  61.0s  1200/340', 'no waiting steps', ''].join('\n'));
  });

  it('--format json --past: one object with baseline, past and diagnostics only', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--past', '--format', 'json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ baseline: { rev: 'HEAD', commit: sha }, past: [run('task-042-login-form', 'red', 1)], diagnostics: [] });
  });

  it('--format yaml --waiting: baseline, waiting and diagnostics', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--waiting', '--format', 'yaml']);
    expect(result.status).toBe(0);
    expect(yamlLoad(result.stdout)).toEqual({ baseline: { rev: 'HEAD', commit: sha }, waiting: [], diagnostics: [] });
  });

  it('--active is v0.4: an unknown option, exit 2', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--active']);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^error: unknown option '--active'/);
  });

  it('a malformed --element: exit 2', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--element', 'task']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^error: /);
  });

  it('a record only the working tree holds is not listed: one warning: line names the dirty run log, exit 0', () => {
    appendFileSync(join(repo, 'docs/runs/task-042-login-form.jsonl'), serializeRunRecord(run('task-042-login-form', 'red', 2)));
    try {
      const result = runCliEntry(repo, ['agent', 'list', '--past']);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(['past runs: 1', 'task-042-login-form/red/1  developer  claude  0  61.0s  1200/340', ''].join('\n'));
      expect(result.stderr).toBe(
        'warning: W_UNCOMMITTED_INPUTS (docs/runs/task-042-login-form.jsonl): uncommitted change to a deduction input, not read (the answer is computed from HEAD): docs/runs/task-042-login-form.jsonl\n',
      );
    } finally {
      execFileSync('git', ['-C', repo, 'checkout', '--', 'docs/runs/task-042-login-form.jsonl']);
    }
  });
});

describe('task-240 — wingfoil agent list: no run log, and an invalid one', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('no paths.runs: "no past runs", a warning: line, exit 0', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA(false));
    commitAll(repo, 'seed');
    const result = runCliEntry(repo, ['agent', 'list', '--past']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('no past runs\n');
    expect(result.stderr).toBe('warning: dna.yaml declares no run log (paths.runs)\n');
  });

  it('a committed line that is not a run record: exit 1, naming the file and the line', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA(true));
    writeFixtureFile(repo, 'docs/runs/task-1.jsonl', 'not json\n');
    commitAll(repo, 'seed');
    const result = runCliEntry(repo, ['agent', 'list']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('error: run log docs/runs/task-1.jsonl: line 1 is not a valid run record: not JSON\n');
  });
});
