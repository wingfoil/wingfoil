/**
 * task-354 AC3 (`bug-317`; `spec-008` §6, the unknown-field row as amended by task-354 D2 (b)) — on the compiled
 * CLI, every command that resolved `HEAD` itself labels a configuration file `HEAD:` in its unknown-field
 * warning, never the 40-hex sha it resolved `HEAD` to.
 *
 * The fixture is the `agent execute` step fixture (`test/agent/helpers/agent-execute-step-fixture.ts`): a
 * `delivery` instance open on `minor-1`, its frontier two `loop.implement@task:<id>` steps, one recorded run
 * `task-202-explicit-override/implement/1`, and a committed `dna.yaml` ending with the unknown field `mystery: 1`.
 *
 * What is asserted, on stderr:
 * - `workflow list`, `workflow show delivery`, `workflow next delivery-1` (console and `--format json`),
 *   `workflow status`, `agent list`, `agent list --waiting` and `agent show <run-id>` each print
 *   `warning: HEAD:.wingfoil/dna.yaml: unknown field(s) ignored: mystery` (the json form inside its
 *   `{"warning": …}` line), and no line holding `<40-hex>:`;
 * - `agent execute --step loop.implement@task:<id> --dry-run` prints that warning exactly once, labelled
 *   `HEAD:`, and nothing else on stderr.
 *
 * Observed before task-354's change, by a scratch run of the compiled CLI on this same fixture (task-354's red
 * Execution Notes name the probe): each of the seven commands printed the one line
 * `warning: <the fixture's HEAD sha>:.wingfoil/dna.yaml: unknown field(s) ignored: mystery`, and the `--step`
 * dry run printed two lines, that one and then `warning: HEAD:.wingfoil/dna.yaml: unknown field(s) ignored: mystery`.
 *
 * The compiled CLI runs as a child process, so these cases count toward no coverage; the in-process half is
 * `test/core/loaders-label.test.ts`. `dist/` is built by jest's global setup, never here.
 */
import { NOT_REPORTED, recordRun, type RunRecord } from '../../src/agent';
import { DNA_YAML, TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { RELEASE_ID, seedStep, startInstance } from '../agent/helpers/agent-execute-step-fixture';
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const WARNING = 'HEAD:.wingfoil/dna.yaml: unknown field(s) ignored: mystery';
const SHA_LABEL = /[0-9a-f]{40}:/;
const RUN_ID = `${TASK_ID}/implement/1`;

const RUN: RunRecord = {
  id: RUN_ID,
  element: `task:${TASK_ID}`,
  workflow: 'loop',
  phase: 'implement',
  role: 'developer',
  mode: 'fresh',
  agent: 'Fake Agent',
  adapter: 'custom/fake',
  agent_version: NOT_REPORTED,
  model: NOT_REPORTED,
  session: NOT_REPORTED,
  tokens: { input: NOT_REPORTED, output: NOT_REPORTED, cache_read: NOT_REPORTED, cache_write: NOT_REPORTED },
  wingfoil: '0.3.0 (unknown)',
  state_ref: 'b'.repeat(40),
  duration_ms: 1000,
  exit_status: 0,
  result: 'n/a',
  notes: `${TASK_ID}#execution-notes`,
};

/** The compiled CLI in `repo`, with the test's environment minus any fake-agent or git identity override. */
function cli(repo: string, args: readonly string[]): SpawnedRun {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)));
  return spawnCapture(process.execPath, [CLI_ENTRY, ...args], { cwd: repo, env, timeout: 60_000 });
}

describe('task-354 AC3 — the commands that resolve HEAD label dna.yaml HEAD: in the unknown-field warning (bug-317)', () => {
  let repo: string;

  beforeAll(() => {
    repo = seedStep((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', `${DNA_YAML}mystery: 1\n`));
    startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
    const recorded = recordRun(repo, `docs/runs/${TASK_ID}.jsonl`, RUN);
    if (!recorded.ok) throw new Error(recorded.error.message);
  });

  afterAll(() => removeTempDir(repo));

  it.each([
    ['workflow list', ['workflow', 'list']],
    ['workflow show delivery', ['workflow', 'show', 'delivery']],
    ['workflow next delivery-1', ['workflow', 'next', 'delivery-1']],
    ['workflow status', ['workflow', 'status']],
    ['agent list', ['agent', 'list']],
    ['agent list --waiting', ['agent', 'list', '--waiting']],
    [`agent show ${RUN_ID}`, ['agent', 'show', RUN_ID]],
  ])('%s → warning: HEAD:.wingfoil/dna.yaml: …, no sha label', (_name, args) => {
    const run = cli(repo, args);
    expect(run.status).toBe(0);
    expect(run.stderr).toContain(`warning: ${WARNING}\n`);
    expect(run.stderr.split('\n').filter((line) => SHA_LABEL.test(line))).toEqual([]);
  }, 60_000);

  it('workflow next delivery-1 --format json → the {"warning": …} line says HEAD:, no sha label', () => {
    const run = cli(repo, ['workflow', 'next', 'delivery-1', '--format', 'json']);
    expect(run.status).toBe(0);
    const warnings = run.stderr
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => (JSON.parse(line) as { warning?: string }).warning);
    expect(warnings).toContain(WARNING);
    expect(run.stderr.split('\n').filter((line) => SHA_LABEL.test(line))).toEqual([]);
  }, 60_000);

  it('agent execute --step loop.implement@task:<id> --dry-run → that warning once, labelled HEAD:, and nothing else', () => {
    const run = cli(repo, ['agent', 'execute', '--step', `loop.implement@task:${TASK_ID}`, '--dry-run']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`warning: ${WARNING}\n`);
  }, 60_000);
});
