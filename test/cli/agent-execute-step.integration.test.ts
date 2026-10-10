/**
 * task-235 — `wingfoil agent execute --next | --workflow <ref> | --step <key>` (`spec-016-agent-execution`
 * §3.1, §3.2 steps 1–3 and 6, §3.7's step rows; R16; `dl-135` point 3), on the compiled CLI with the fake
 * adapter (`test/fixtures/agents/`, task-200) and no terminal, against the step fixture
 * (`test/agent/helpers/agent-execute-step-fixture.ts`): a `delivery` instance whose frontier holds two
 * parallel `loop.implement@task:<id>` steps.
 *
 * What is asserted:
 * - AC 1 (P5.3.1 sc. 1): `--next` launches the fake as the step's role on the step's element; the record
 *   carries the step's `workflow` and `phase`, and its id is `<id>/<phase>/1`; `n` counts per
 *   `(element, phase)`;
 * - AC 2 (P5.3.1 sc. 3): no open instance, or a complete one (`next: null`) → exit 1 `no next step to
 *   execute`, nothing spawned, nothing written;
 * - AC 3 (P5.3.2): the role comes from the step (sc. 1–2); a step role not in `dna.yaml` stops execution
 *   before anything starts (sc. 3; the registry refuses it at load, Execution Notes decision 1);
 * - AC 4: `--step` off the frontier (`CONFLICT`), `--workflow` naming no workflow or no open instance,
 *   `NO_STEP_ELEMENT`, `NO_STEP_ROLE`;
 * - AC 5: with two parallel frontier steps, the `agent` binding argv `workflow next` prints for the second
 *   step (`spec-017` §6.1), run as written, launches on that step;
 * - AC 6: a phase declaring `mode: resume` still runs `fresh`, with no warning; `--resume` exits 2.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { GHOSTLY, GHOSTLY_FILE, headOf, RELEASE_ID, seedStep, SIBLING_ID, startInstance, STEP_WORKFLOWS } from '../agent/helpers/agent-execute-step-fixture';
import { CLI_ENTRY } from './helpers/spawn-cli';

const scratch: string[] = [];
const repos: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  for (const repo of repos) removeTempDir(repo);
});

function track(repo: string): string {
  repos.push(repo);
  return repo;
}

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** The argv of every fake invocation (the launch first, then the post-run lookups). */
  readonly fake: string[][];
}

/** Run the compiled CLI in `repo`, the fake's record file and a private `TMPDIR` set. */
function cli(repo: string, args: readonly string[]): Run {
  const tmp = scratchDir('wf-step-tmp-');
  const recordFile = join(scratchDir('wf-step-rec-'), 'fake.jsonl');
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)));
  const run = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    cwd: repo,
    encoding: 'utf-8',
    env: { ...inherited, TMPDIR: tmp, TMP: tmp, TEMP: tmp, WINGFOIL_FAKE_AGENT_RECORD: recordFile },
  });
  if (run.error) throw run.error;
  const fake = existsSync(recordFile)
    ? readFileSync(recordFile, 'utf-8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => (JSON.parse(line) as { argv: string[] }).argv)
    : [];
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, fake };
}

const execute = (repo: string, args: readonly string[]): Run => cli(repo, ['agent', 'execute', ...args]);

/** The records of an element's run log, parsed. */
function records(repo: string, elementId: string): Record<string, unknown>[] {
  const path = join(repo, 'docs', 'runs', `${elementId}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** The launch's `--prompt` value: the bootstrap (§2.4). */
function bootstrapOf(run: Run): string {
  const launch = run.fake[0];
  if (launch === undefined) throw new Error(`the fake never launched: ${run.stderr}`);
  return launch[launch.indexOf('--prompt') + 1]!;
}

const subject = (repo: string): string => git(repo, ['log', '-1', '--format=%s']).trim();

/** A refusal leaves the repository as it was and spawns nothing. */
function expectNothingRan(repo: string, run: Run, before: string): void {
  expect(run.fake).toEqual([]);
  expect(run.stdout).toBe('');
  expect(headOf(repo)).toBe(before);
  expect(git(repo, ['status', '--porcelain'])).toBe('');
}

/** The fixture with the `delivery` instance open: two parallel `loop.implement` steps. */
function delivery(): string {
  const repo = track(seedStep());
  startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
  return repo;
}

describe('task-235 AC 1 — P5.3.1 sc. 1: --next launches on the next step (spec-016 §3.2 step 1)', () => {
  let repo: string;
  let first: Run;
  beforeAll(() => {
    repo = delivery();
    first = execute(repo, ['--next']);
  });

  it('launches the fake as the step role on the step element, exit 0, nothing on stdout', () => {
    expect(first.stderr).not.toMatch(/^error:/m);
    expect(first.status).toBe(0);
    expect(first.stdout).toBe('');
    expect(bootstrapOf(first)).toContain(`WingFoil run ${TASK_ID}/implement/1: act as role "developer" on element task:${TASK_ID}.`);
  });

  it("the record has the step's workflow and phase, id <id>/<phase>/1, and is committed alone", () => {
    expect(records(repo, TASK_ID)).toEqual([
      expect.objectContaining({ id: `${TASK_ID}/implement/1`, element: `task:${TASK_ID}`, workflow: 'loop', phase: 'implement', role: 'developer', mode: 'fresh' }),
    ]);
    expect(subject(repo)).toBe(`agent: record ${TASK_ID}/implement/1`);
  });

  it('AC 6 — the phase declares mode: resume, the run is fresh, and no warning is printed', () => {
    expect(first.stderr.split('\n').filter((line) => line.startsWith('warning:'))).toEqual([]);
  });

  it('n counts per (element, phase): a second --next run is /2, an adhoc run on the same element /adhoc/1', () => {
    const second = execute(repo, ['--next']);
    expect(second.status).toBe(0);
    const adhoc = execute(repo, ['--element', `task:${TASK_ID}`, '--role', 'developer']);
    expect(adhoc.status).toBe(0);
    expect(records(repo, TASK_ID).map((record) => [record['id'], record['workflow'], record['phase']])).toEqual([
      [`${TASK_ID}/implement/1`, 'loop', 'implement'],
      [`${TASK_ID}/implement/2`, 'loop', 'implement'],
      [`${TASK_ID}/adhoc/1`, 'n/a', 'adhoc'],
    ]);
  });
});

describe('task-235 AC 2 — P5.3.1 sc. 3: no next step → exit 1, nothing spawned', () => {
  it('no open instance: no next step to execute', () => {
    const repo = track(seedStep());
    const before = headOf(repo);
    const run = execute(repo, ['--next']);
    expect(run.status).toBe(1);
    expect(run.stderr.split('\n')[0]).toBe('error: no next step to execute');
    expectNothingRan(repo, run, before);
  });

  it('a complete instance (next: null): no next step to execute', () => {
    const repo = track(seedStep((root) => writeFixtureFile(root, `docs/04_memory/planning/${RELEASE_ID}.md`, readFileSync(join(root, `docs/04_memory/planning/${RELEASE_ID}.md`), 'utf-8').replace('status: in-development', 'status: releasing'))));
    startInstance(repo, 'review-1', 'review-only', RELEASE_ID);
    expect(JSON.parse(cli(repo, ['workflow', 'next', '--format', 'json']).stdout)).toMatchObject({ next: null, complete: true });
    const before = headOf(repo);
    const run = execute(repo, ['--next']);
    expect(run.status).toBe(1);
    expect(run.stderr.split('\n')[0]).toBe('error: no next step to execute');
    expectNothingRan(repo, run, before);
  });
});

describe('task-235 AC 3 — P5.3.2: the role comes from the step', () => {
  it('sc. 1 — a reviewer step runs as reviewer', () => {
    const repo = track(seedStep());
    startInstance(repo, 'review-1', 'review-only', RELEASE_ID);
    const run = execute(repo, ['--next', '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ run: { role: 'reviewer', workflow: 'review-only', phase: 'code-review', element: `release:${RELEASE_ID}` } });
  });

  it('sc. 2 — a developer step runs as developer; --role overrides it, --element overrides the element and keeps phase and role', () => {
    const repo = delivery();
    const plan = (args: readonly string[]) => (JSON.parse(execute(repo, [...args, '--dry-run', '--format', 'json']).stdout) as { run: Record<string, string> }).run;
    expect(plan(['--next'])).toMatchObject({ role: 'developer', workflow: 'loop', phase: 'implement', element: `task:${TASK_ID}` });
    expect(plan(['--next', '--role', 'reviewer'])).toMatchObject({ role: 'reviewer', phase: 'implement', element: `task:${TASK_ID}` });
    expect(plan(['--next', '--element', `task:${SIBLING_ID}`])).toMatchObject({ id: `${SIBLING_ID}/implement/1`, role: 'developer', workflow: 'loop', phase: 'implement', element: `task:${SIBLING_ID}` });
  });

  it('sc. 3 — a step role not in dna.yaml: execution does not start, exit 1, the message names the role and dna.yaml', () => {
    const repo = track(seedStep(undefined, { ...STEP_WORKFLOWS, [GHOSTLY_FILE]: GHOSTLY }));
    startInstance(repo, 'ghostly-1', 'ghostly', RELEASE_ID);
    const before = headOf(repo);
    const run = execute(repo, ['--next']);
    expect(run.status).toBe(1);
    expect(run.stderr.split('\n')[0]).toMatch(/^error: .*unknown role 'ghost' \(not defined in dna\.yaml\)$/);
    expectNothingRan(repo, run, before);
  });
});

describe('task-235 AC 4 — the step refusals of spec-016 §3.7', () => {
  let repo: string;
  beforeAll(() => {
    repo = delivery();
    startInstance(repo, 'chores-1', 'chores');
    startInstance(repo, 'roleless-1', 'roleless', RELEASE_ID);
  });

  it.each([
    [['--workflow', 'delivery-1', '--step', `loop.review@task:${TASK_ID}`], `step 'loop.review@task:${TASK_ID}' is not on the frontier of delivery-1`],
    [['--workflow', 'nope'], 'unknown workflow: nope'],
    [['--workflow', 'review-only'], 'workflow is not open: review-only'],
    [['--workflow', 'chores'], "step 'chores.tidy' has no element: give --element <type>:<id>"],
    [['--next'], `step 'roleless.wander@release:${RELEASE_ID}' declares no role: give --role <role>`],
  ])('%j → %s', (args, message) => {
    const before = headOf(repo);
    const run = execute(repo, args);
    expect(run.status).toBe(1);
    expect(run.stderr.split('\n')[0]).toBe(`error: ${message}`);
    expectNothingRan(repo, run, before);
  });

  it('--step alone selects on the active instance (roleless-1, started last); --role fills the role it lacks', () => {
    const run = execute(repo, ['--step', `roleless.wander@release:${RELEASE_ID}`, '--role', 'developer', '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ run: { id: `${RELEASE_ID}/wander/1`, workflow: 'roleless', phase: 'wander', role: 'developer', element: `release:${RELEASE_ID}` } });
  });

  it('--workflow chores with --element: the element the step lacks is given', () => {
    const run = execute(repo, ['--workflow', 'chores', '--element', `task:${TASK_ID}`, '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ run: { id: `${TASK_ID}/tidy/1`, workflow: 'chores', phase: 'tidy', role: 'developer' } });
  });
});

describe('task-235 AC 5 — two parallel frontier steps: the agent binding argv of spec-017 §6.1, run as written', () => {
  it('launches on the step it names, not on the first', () => {
    const repo = delivery();
    const next = JSON.parse(cli(repo, ['workflow', 'next', '--format', 'json']).stdout) as {
      next: { key: string };
      more: { key: string; actions: { token: string; binding: { kind: string; argv: string[] } }[] }[];
    };
    expect(next.next.key).toBe(`loop.implement@task:${TASK_ID}`);
    const second = next.more[0]!;
    expect(second.key).toBe(`loop.implement@task:${SIBLING_ID}`);
    const argv = second.actions.find((action) => action.token === 'agent.execute')!.binding.argv;
    expect(argv).toEqual(['wingfoil', 'agent', 'execute', '--workflow', 'delivery-1', '--step', second.key]);
    const run = cli(repo, argv.slice(1));
    expect(run.status).toBe(0);
    expect(bootstrapOf(run)).toContain(`act as role "developer" on element task:${SIBLING_ID}.`);
    expect(records(repo, SIBLING_ID)).toEqual([expect.objectContaining({ id: `${SIBLING_ID}/implement/1`, workflow: 'loop', phase: 'implement' })]);
    expect(records(repo, TASK_ID)).toEqual([]);
  });
});

describe('task-235 AC 6 — --resume is v0.4: an unknown option, exit 2', () => {
  it('--next --resume <run-id> exits 2 and spawns nothing', () => {
    const repo = delivery();
    const before = headOf(repo);
    const run = execute(repo, ['--next', '--resume', `${TASK_ID}/implement/1`]);
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/unknown option '--resume'/);
    expectNothingRan(repo, run, before);
    expect(readdirSync(join(repo, 'docs'))).not.toContain('runs');
  });
});
