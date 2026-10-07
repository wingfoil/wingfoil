/**
 * task-220 — `wingfoil agent show <run-id>` on the compiled CLI (`spec-016` §6; BDD
 * `p5-interaction/P5.3.5-agent-show.feature`): the bytes a user sees — the console's `key: value`
 * lines, the `json` / `yaml` payload, the `hint:` line of a run only the working tree holds, and the
 * exit codes. The operation's own cases are `test/core/agent-show.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { NOT_REPORTED, recordRun, serializeRunRecord, type RunRecord } from '../../src/agent';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const ELEMENT_ID = 'task-042-login-form';
const LOG = `docs/runs/${ELEMENT_ID}.jsonl`;

const DNA = `version: 1
modules:
  - name: core
    path: src/core
team:
  members:
    - name: ada
      roles: [ approver ]
  roles:
    - name: approver
paths:
  sources: [ src/ ]
  runs: [ docs/runs/ ]
`;

const RUN: RunRecord = {
  id: `${ELEMENT_ID}/red/1`,
  element: `task:${ELEMENT_ID}`,
  workflow: 'dev-loop',
  phase: 'red',
  role: 'developer',
  mode: 'fresh',
  agent: 'claude',
  adapter: 'built-in/claude-code',
  agent_version: NOT_REPORTED,
  model: NOT_REPORTED,
  session: NOT_REPORTED,
  tokens: { input: NOT_REPORTED, output: NOT_REPORTED, cache_read: NOT_REPORTED, cache_write: NOT_REPORTED },
  wingfoil: '0.3.0 (unknown)',
  state_ref: 'b'.repeat(40),
  duration_ms: 61000,
  exit_status: 130,
  result: 'n/a',
  notes: `${ELEMENT_ID}#execution-notes`,
};

describe('task-220 — wingfoil agent show on the compiled CLI', () => {
  let repo: string;
  let sha: string;

  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA);
    commitAll(repo, 'seed');
    const recorded = recordRun(repo, LOG, RUN);
    if (!recorded.ok) throw new Error(recorded.error.message);
    sha = recorded.value.sha;
  });

  afterAll(() => removeTempDir(repo));

  const head = (): string => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();

  it('console (the default): one key: value line per field in §4.2 order, tokens flattened, then commit', () => {
    const run = runCliEntry(repo, ['agent', 'show', RUN.id]);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(
      [
        `id: ${RUN.id}`,
        `element: task:${ELEMENT_ID}`,
        'workflow: dev-loop',
        'phase: red',
        'role: developer',
        'mode: fresh',
        'agent: claude',
        'adapter: built-in/claude-code',
        'agent_version: not-reported',
        'model: not-reported',
        'session: not-reported',
        'tokens.input: not-reported',
        'tokens.output: not-reported',
        'tokens.cache_read: not-reported',
        'tokens.cache_write: not-reported',
        'wingfoil: 0.3.0 (unknown)',
        `state_ref: ${'b'.repeat(40)}`,
        'duration_ms: 61000',
        'exit_status: 130',
        'result: n/a',
        `notes: ${ELEMENT_ID}#execution-notes`,
        `commit: ${sha}`,
        '',
      ].join('\n'),
    );
    expect(runCliEntry(repo, ['agent', 'show', RUN.id, '--format', 'console']).stdout).toBe(run.stdout);
  });

  it('--format json: {baseline: {rev: "HEAD", commit}, run, commit}, compact, on one line', () => {
    const run = runCliEntry(repo, ['agent', 'show', RUN.id, '--format', 'json']);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`${JSON.stringify({ baseline: { rev: 'HEAD', commit: head() }, run: RUN, commit: sha })}\n`);
  });

  it('--format yaml: the same structure', () => {
    const run = runCliEntry(repo, ['agent', 'show', RUN.id, '--format', 'yaml']);
    expect(run.status).toBe(0);
    expect(yamlLoad(run.stdout)).toEqual({ baseline: { rev: 'HEAD', commit: head() }, run: RUN, commit: sha });
  });

  it('a malformed id: exit 2, error: invalid run id "<value>", expected <element-id>/<phase>/<n>', () => {
    const run = runCliEntry(repo, ['agent', 'show', ELEMENT_ID]);
    expect(run).toEqual({
      status: 2,
      stdout: '',
      stderr: `error: invalid run id "${ELEMENT_ID}", expected <element-id>/<phase>/<n>\n`,
    });
  });

  it('a missing operand: exit 2, the one missing-operand form with the usage hint', () => {
    const run = runCliEntry(repo, ['agent', 'show']);
    expect(run.status).toBe(2);
    expect(run.stderr).toBe('error: missing required argument: <run-id>\nhint: usage: wingfoil agent show <run-id>\n');
  });

  it('an unknown id: exit 1, error: run not found: <run-id>, no hint', () => {
    const run = runCliEntry(repo, ['agent', 'show', `${ELEMENT_ID}/red/2`]);
    expect(run).toEqual({ status: 1, stdout: '', stderr: `error: run not found: ${ELEMENT_ID}/red/2\n` });
  });

  describe('a run only the working tree holds', () => {
    const uncommitted: RunRecord = { ...RUN, id: `${ELEMENT_ID}/red/2` };
    const hint = `the working tree's ${LOG} holds ${uncommitted.id}, but HEAD does not: agent show reads HEAD; commit the run log to show it`;

    beforeAll(() => appendFileSync(join(repo, LOG), serializeRunRecord(uncommitted)));
    afterAll(() => execFileSync('git', ['-C', repo, 'checkout', '--quiet', '--', LOG]));

    it('console: the refusal stands (exit 1), and a hint: line says the working tree holds it', () => {
      const run = runCliEntry(repo, ['agent', 'show', uncommitted.id]);
      expect(run).toEqual({ status: 1, stdout: '', stderr: `error: run not found: ${uncommitted.id}\nhint: ${hint}\n` });
    });

    it('--format json: the hint is the error object\'s hint field', () => {
      const run = runCliEntry(repo, ['agent', 'show', uncommitted.id, '--format', 'json']);
      expect(run.status).toBe(1);
      expect(JSON.parse(run.stderr)).toEqual({ error: `run not found: ${uncommitted.id}`, hint });
    });
  });
});
