/**
 * task-335 AC 4, AC 5 (red-first) — the headless work run and its time bound, on the compiled CLI with the fake
 * adapter and no terminal (`spec-016` §3.3 steps 14–15 and 18, §3.5, §3.7 `TIMED_OUT`; `dl-181` Q1 (a), Q3 (c),
 * Q4 (a); approver rulings D5 (a), D6 (a)).
 *
 * - AC 4: `--headless` launches `launch.headless.args` rendered + `session.assign_args`; the agent's stdin is not
 *   connected (the fake reads it to its end and records `""`, although `agent execute`'s own stdin was given
 *   text); a `terminal: required` adapter (`fake-terminal.yaml`) still runs; under `--format json` stdout is
 *   exactly the one document `{ "run": <record> }` (the fake's own stdout document is captured, not echoed) and
 *   the summary is a notice on stderr; the committed record has `result: "n/a"`, `exit_status: 0`.
 * - AC 5: a malformed or too long `--timeout` is exit `2` with `spec-008` §12's messages, before the project is
 *   read; one real run with a 1 s bound and a fake that waits for a signal (`WINGFOIL_FAKE_AGENT_WAIT=signal`)
 *   ends `exit 1`, `agent timed out after 1s; run <id> recorded`, the record `exit_status: "signal:SIGTERM"`. No
 *   assertion is made on any duration.
 */
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { errorLine, execute, expectNothingRan, headOf, launchArgv, launchEntry, records, removeRunScratch } from './helpers/agent-execute-cli';

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

function fixture(tweak?: (repo: string) => void): string {
  const repo = seed(tweak);
  repos.push(repo);
  return repo;
}

const RUN_1 = `${TASK_ID}/adhoc/1`;

describe('task-335 AC 4 — the headless work run (spec-016 §3.5)', () => {
  let repo: string;
  let before: string;
  let run: ReturnType<typeof execute>;
  beforeAll(() => {
    repo = fixture();
    before = headOf(repo);
    run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless', '--format', 'json'], { WINGFOIL_FAKE_AGENT_STDIN: '1' }, 'text agent execute was given on its stdin\n');
  });

  it('exits 0 and launches launch.headless.args rendered, then session.assign_args', () => {
    expect(run.status).toBe(0);
    expect(launchArgv(run)).toEqual(['--headless', '--mcp-config', expect.any(String), '--prompt', expect.stringContaining(`WingFoil run ${RUN_1}:`), '--session-id', expect.any(String)]);
  });

  it("the agent's stdin is not connected: the fake read it to its end and found nothing", () => {
    // task-337: the launch entry, no longer fake[0] (version_args runs before the launch too).
    expect(launchEntry(run).stdin).toBe('');
  });

  it('stdout is exactly { "run": <record> }, the committed record; result n/a, exit_status 0', () => {
    const committed = records(repo, TASK_ID);
    expect(committed).toEqual([expect.objectContaining({ id: RUN_1, result: 'n/a', exit_status: 0, workflow: 'n/a', phase: 'adhoc' })]);
    expect(JSON.parse(run.stdout)).toEqual({ run: committed[0] });
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${RUN_1}`);
    expect(git(repo, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
  });

  it('stderr: one JSON document per line; the summary is a notice', () => {
    const documents = run.stderr
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(documents.filter((document) => 'notice' in document).map((document) => document['notice'])).toEqual([
      expect.stringMatching(new RegExp(`^run ${RUN_1}: launching Fake Agent \\(custom/fake\\) as developer on ${TASK_REF}$`)),
      expect.stringMatching(new RegExp(`^run ${RUN_1}: agent exited 0 after \\d+\\.\\d s \\(recorded in [0-9a-f]{7}\\)$`)),
    ]);
    expect(documents.filter((document) => 'error' in document)).toEqual([]);
  });

  it('a terminal: required adapter needs no terminal for a headless run', () => {
    const terminal = fixture((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: fake-terminal')));
    const headless = execute(terminal, ['--element', TASK_REF, '--role', 'developer', '--headless']);
    expect(errorLine(headless.stderr)).toBeUndefined();
    expect(headless.status).toBe(0);
    expect(records(terminal, TASK_ID)).toEqual([expect.objectContaining({ id: RUN_1, adapter: 'custom/fake-terminal', result: 'n/a', exit_status: 0 })]);
  });
});

describe('task-335 AC 5 — --timeout (spec-016 §3.1, §3.3 steps 15 and 18; spec-008 §12)', () => {
  it.each([
    ['0s', 'error: invalid flag value: --timeout expects <n>s, <n>m or <n>h, got "0s"'],
    ['5', 'error: invalid flag value: --timeout expects <n>s, <n>m or <n>h, got "5"'],
    ['25h', 'error: invalid flag value: --timeout must be at most 24h, got "25h"'],
  ])('--timeout %s → exit 2, before the project is read (a git repository with no .wingfoil/)', (raw, message) => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    const run = execute(repo, ['--next', '--timeout', raw]);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(message);
  });

  it('--timeout 05m in a project: exit 2, nothing spawned, nothing written', () => {
    const repo = fixture();
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--timeout', '05m']);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe('error: invalid flag value: --timeout expects <n>s, <n>m or <n>h, got "05m"');
    expectNothingRan(repo, run, before);
  });

  it('a 1 s bound on an agent that waits for a signal: SIGTERM, recorded signal:SIGTERM, exit 1 "agent timed out after 1s"', () => {
    const repo = fixture();
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless', '--timeout', '1s'], { WINGFOIL_FAKE_AGENT_WAIT: 'signal' });
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)).toBe(`error: agent timed out after 1s; run ${RUN_1} recorded`);
    expect(records(repo, TASK_ID)).toEqual([expect.objectContaining({ id: RUN_1, exit_status: 'signal:SIGTERM', result: 'n/a' })]);
    expect(git(repo, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
  });
});
