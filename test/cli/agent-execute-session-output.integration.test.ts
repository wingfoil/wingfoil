/**
 * task-356 AC 2 (c) (red-first, `bug-375`; `spec-016` §2.6 `session.id: output`, §3.5, as amended at the design
 * gate; approver ruling D2 (a)) — end to end on the compiled CLI: a headless work run of an adapter with
 * `session.id: output` records the session id its stdout carried.
 *
 * The adapter is `test/fixtures/agents/custom/fake-session-output.yaml` (`launch.headless.output: json`,
 * `session.field: session_id`, no id assigned); the fake prints `WINGFOIL_FAKE_AGENT_DOCUMENT` on stdout when its
 * headless launch ends (`test/fixtures/agents/fake-agent.cjs`). Under `--format json` stdout is the one document
 * `{ "run": <record> }`, the record as committed. Today the record's `session` is `not-reported`: nothing reads the
 * work run's stdout.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { AGENTS_FIXTURES, DNA_YAML, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { execute, headOf, launchArgv, records, removeRunScratch } from './helpers/agent-execute-cli';

const ADAPTER = 'fake-session-output';
const RUN_1 = `${TASK_ID}/adhoc/1`;
const SESSION = 's-356-from-stdout';

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

describe('task-356 AC 2 (c) — agent execute --headless records the session id of the agent’s stdout (bug-375)', () => {
  let repo: string;
  let before: string;
  let run: ReturnType<typeof execute>;
  beforeAll(() => {
    repo = seed((root) => {
      writeFixtureFile(root, `.wingfoil/agents/custom/${ADAPTER}.yaml`, readFileSync(join(AGENTS_FIXTURES, 'custom', `${ADAPTER}.yaml`), 'utf-8'));
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('      adapter: fake\n', `      adapter: ${ADAPTER}\n`));
    });
    repos.push(repo);
    before = headOf(repo);
    run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless', '--format', 'json'], {
      WINGFOIL_FAKE_AGENT_DOCUMENT: JSON.stringify({ session_id: SESSION, model: 'fake-model' }),
    });
  });

  it('exits 0; the launch is the headless argv, with no --session-id (no id is assigned)', () => {
    expect([run.status, run.stderr.split('\n').filter((line) => line.includes('"error"'))]).toEqual([0, []]);
    expect(launchArgv(run)).toEqual(['--headless', '--mcp-config', expect.any(String), '--prompt', expect.stringContaining(`WingFoil run ${RUN_1}:`)]);
  });

  it('stdout is { "run": <record> }, the committed record, whose session is the id the agent printed', () => {
    const committed = records(repo, TASK_ID);
    expect(JSON.parse(run.stdout)).toEqual({ run: committed[0] });
    expect(committed).toEqual([expect.objectContaining({ id: RUN_1, adapter: `custom/${ADAPTER}`, session: SESSION, result: 'n/a', exit_status: 0 })]);
    expect(git(repo, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
  });
});
