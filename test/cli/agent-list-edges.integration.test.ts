/**
 * task-240 review F6 — `wingfoil agent list --format json` with a dirty run log, on the compiled CLI
 * (`spec-016` §5; review decision 2): stdout is the payload alone, one JSON document carrying the
 * `W_UNCOMMITTED_INPUTS` diagnostic, and the same diagnostic is the success warning on stderr, as one
 * `{"warning": …}` line. Red's CLI suite is `test/cli/agent-list.integration.test.ts`.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { NOT_REPORTED, recordRun, serializeRunRecord, type RunRecord } from '../../src/agent';
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

function run(n: number): RunRecord {
  return {
    id: `task-1/red/${n}`,
    element: 'task:task-1',
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
    state_ref: 'c'.repeat(40),
    duration_ms: 1000,
    exit_status: 0,
    result: 'n/a',
    notes: 'none',
  };
}

describe('task-240 review F6 — agent list --format json with a dirty run log', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA);
    commitAll(repo, 'seed');
    const recorded = recordRun(repo, 'docs/runs/task-1.jsonl', run(1));
    if (!recorded.ok) throw new Error(recorded.error.message);
    appendFileSync(join(repo, 'docs/runs/task-1.jsonl'), serializeRunRecord(run(2)));
  });
  afterAll(() => removeTempDir(repo));

  it('stdout is pure JSON (the payload, its diagnostic included); stderr carries the warning; exit 0', () => {
    const result = runCliEntry(repo, ['agent', 'list', '--past', '--format', 'json']);
    expect(result.status).toBe(0);
    const message = 'uncommitted change to a deduction input, not read (the answer is computed from HEAD): docs/runs/task-1.jsonl';
    const payload = JSON.parse(result.stdout) as { past: readonly RunRecord[]; diagnostics: readonly unknown[] };
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(payload.past.map((record) => record.id)).toEqual(['task-1/red/1']);
    expect(payload.diagnostics).toEqual([{ code: 'W_UNCOMMITTED_INPUTS', severity: 'warning', file: 'docs/runs/task-1.jsonl', path: '', message }]);
    expect(result.stderr).toBe(`${JSON.stringify({ warning: `W_UNCOMMITTED_INPUTS (docs/runs/task-1.jsonl): ${message}` })}\n`);
  });
});
