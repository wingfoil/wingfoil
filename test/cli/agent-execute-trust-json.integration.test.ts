/**
 * task-353 AC 2 (developer test, green; `spec-016` §3.3 step 16, §3.4; `bug-500`) — the start-up hint under
 * `--format json`, which the red left unpinned: the warning is the CLI's JSON warning document,
 * `{"warning": "<the step 16 text>"}`, one line on stderr before the `{"error": …}` document, and the run's record and
 * exit code are those of the console run. The fixture is the one of `agent-execute-trust.integration.test.ts`: the
 * fake adapter with `launch.interactive.trust: prompt` declared, as `fake-trust`.
 */
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, manifest, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { execute, records, removeRunScratch } from './helpers/agent-execute-cli';

const RUN_1 = `${TASK_ID}/adhoc/1`;

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

/** The stderr lines that parse as JSON documents. */
function documents(stderr: string): Record<string, unknown>[] {
  return stderr
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('task-353 — the start-up hint under --format json', () => {
  it('trust: prompt, the agent exits 1: a {"warning": …} document before the {"error": …} document', () => {
    const repo = seed((root) => {
      writeFixtureFile(root, '.wingfoil/agents/custom/fake-trust.yaml', manifest('fake-trust', (text) => text.replace('    terminal: optional\n', '    terminal: optional\n    trust: prompt\n')));
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: fake-trust'));
    });
    repos.push(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--format', 'json'], { WINGFOIL_FAKE_AGENT_EXIT: '1' });
    expect(run.status).toBe(1);
    const docs = documents(run.stderr);
    const hint = `run ${RUN_1}: the agent exited 1 with no commit since state_ref: its CLI may have stopped at its folder-trust step (adapter 'fake-trust' declares launch.interactive.trust: prompt)`;
    const warningAt = docs.findIndex((doc) => doc['warning'] === hint);
    const errorAt = docs.findIndex((doc) => 'error' in doc);
    expect(warningAt).toBeGreaterThanOrEqual(0);
    expect(errorAt).toBeGreaterThan(warningAt);
    expect(records(repo, TASK_ID).at(-1)?.['notes']).toBe('none (no commit since state_ref: the agent CLI may have stopped at its folder-trust step)');
  });
});
