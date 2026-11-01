/**
 * task-330 (`bug-354`; `spec-016` §4.5, §5, §6) — a run log committed as a symbolic link, on the compiled CLI.
 * `agent list --past` and `agent show` list the directory's blobs by kind: the link is not read and a
 * `W_RUN_LOG_SYMLINK` warning names it (today both exit 1 with "line 1 is not a valid run record: not
 * terminated by a newline", the link's target path read as text). `agent list` also carries the diagnostic in
 * its payload's `diagnostics`.
 */
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { NOT_REPORTED, serializeRunRecord, type RunRecord } from '../../src/agent';
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
paths:
  sources: [ src/ ]
  runs: [ docs/runs/ ]
`;

const LINK_LOG = 'docs/runs/task-1.jsonl';
const WARNING = `W_RUN_LOG_SYMLINK (${LINK_LOG}): run log ${LINK_LOG} is a symbolic link: not read`;
const DIAGNOSTIC = { code: 'W_RUN_LOG_SYMLINK', severity: 'warning', file: LINK_LOG, path: '', message: `run log ${LINK_LOG} is a symbolic link: not read` };

const RUN: RunRecord = {
  id: 'task-2/red/1',
  element: 'task:task-2',
  workflow: 'dev-loop',
  phase: 'red',
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

describe('task-330 — a symlinked run log on the compiled CLI (bug-354)', () => {
  let repo: string;

  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA);
    writeFixtureFile(repo, 'docs/target.txt', 'not a run log');
    mkdirSync(join(repo, 'docs/runs'), { recursive: true });
    symlinkSync('../target.txt', join(repo, LINK_LOG));
    writeFixtureFile(repo, 'docs/runs/task-2.jsonl', serializeRunRecord(RUN));
    commitAll(repo, 'seed');
  });

  afterAll(() => removeTempDir(repo));

  it('agent list --past: exit 0, the regular log listed, one warning: line for the link', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--past']);
    expect(result.stderr).toBe(`warning: ${WARNING}\n`);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(['past runs: 1', 'task-2/red/1  developer  claude  0  61.0s  1200/340', ''].join('\n'));
  });

  it('agent list --past --format json: the payload’s diagnostics hold the diagnostic', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--past', '--format', 'json']);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as { diagnostics: unknown[] };
    expect(payload.diagnostics).toEqual([DIAGNOSTIC]);
  });

  it('agent show of the link’s run id: the warning precedes "run not found", exit 1, no hint', () => {
    const result = runCliEntry(repo, ['agent', 'show', 'task-1/adhoc/1']);
    expect(result.stderr.split('\n')).toEqual([`warning: ${WARNING}`, 'error: run not found: task-1/adhoc/1', '']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });
});
