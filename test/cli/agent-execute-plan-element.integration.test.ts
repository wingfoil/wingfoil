/**
 * task-353 AC 3 (red-first; `spec-016` §3.2 step 2 and §5, as amended at the design gate `c0ac033df`; `bug-418`;
 * approver ruling D6 (a)) — `agent execute --next` and `agent list --waiting` agree on an unscoped step of an instance
 * with no bound element: both take the instance's own `plan` element, `plan:<instance-id>`.
 *
 * The fixture is `bug-418`'s reproduction: a fresh `init --template Scrum`, `workflow start sw-life-cycle`
 * (`sw-life-cycle-1-plan`, first step `sw-life-cycle.inception`, role `product-owner`, no scope), and one `team.agents`
 * entry, `Fake Agent`, executing as `product-owner` and `developer` with the fake adapter (`custom/fake`, copied with
 * the fake agent script, as `test/agent/helpers/agent-execute-fixture.ts` does).
 *
 * - `agent execute --next --dry-run` (`--format json` and `--format console`): exit `0`, stderr empty, `subject`
 *   `agent: record sw-life-cycle-1-plan/inception/1`, `paths` `["docs/runs/sw-life-cycle-1-plan.jsonl"]`, `run.id`
 *   `sw-life-cycle-1-plan/inception/1`, `run.element` `plan:sw-life-cycle-1-plan`, nothing launched or written;
 * - `agent list --waiting --format json`: the one waiting step with `element` `plan:sw-life-cycle-1-plan`; the console
 *   line is unchanged; `--element plan:sw-life-cycle-1-plan` keeps it, `--element task:task-1` drops it;
 * - the same `element`, in process, through the registered `agentList` operation (coverage of `src/core`);
 * - the real `--next` run launches the fake on the plan and commits its record to the plan's run log.
 *
 * The expected values are copied from a real run of today's build with the element given by hand
 * (`agent execute --next --element plan:sw-life-cycle-1-plan --dry-run --format json` on this fixture, task-353's red
 * notes). Expected red today: `--next` exits `1` with `error: step 'sw-life-cycle.inception' has no element: give
 * --element <type>:<id>`, and the waiting step's `element` is `null` (so `--element plan:…` drops it).
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { commitAll, git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { AGENTS_FIXTURES, FAKE_SCRIPT_REL } from '../agent/helpers/agent-execute-fixture';
import { cli, headOf, records, removeRunScratch } from './helpers/agent-execute-cli';
import { runCliEntry } from './helpers/spawn-cli';

jest.setTimeout(120_000);

const INSTANCE = 'sw-life-cycle-1-plan';
const PLAN_REF = `plan:${INSTANCE}`;
const RUN_1 = `${INSTANCE}/inception/1`;
const LOG = `docs/runs/${INSTANCE}.jsonl`;

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

/** `bug-418`'s project: the Scrum scaffold, `sw-life-cycle` started, `Fake Agent` on the fake adapter. */
function scaffold(): string {
  const repo = makeTempGitRepo();
  repos.push(repo);
  const step = (args: string[]): void => {
    const run = runCliEntry(repo, args);
    if (run.status !== 0) throw new Error(`fixture: wingfoil ${args.join(' ')} → ${run.status}: ${run.stderr}`);
  };
  step(['init', '--template', 'Scrum', '--no-interactive']);
  step(['workflow', 'start', 'sw-life-cycle']);
  mkdirSync(join(repo, '.wingfoil', 'agents', 'custom'), { recursive: true });
  copyFileSync(join(AGENTS_FIXTURES, 'custom', 'fake.yaml'), join(repo, '.wingfoil', 'agents', 'custom', 'fake.yaml'));
  mkdirSync(join(repo, 'test', 'fixtures', 'agents'), { recursive: true });
  copyFileSync(join(AGENTS_FIXTURES, 'fake-agent.cjs'), join(repo, FAKE_SCRIPT_REL));
  commitAll(repo, 'add the fake adapter');
  step(['dna', 'add', 'team.agents', '--value', 'Fake Agent', '--entry-email', '1+fake-agent@users.noreply.github.com', '--entry-executes_as', 'product-owner,developer', '--entry-adapter', 'fake']);
  return repo;
}

interface Waiting {
  readonly instance: string;
  readonly key: string;
  readonly element: string | null;
  readonly role: string;
  readonly agents: readonly string[];
}

const waitingOf = (stdout: string): Waiting[] => (JSON.parse(stdout) as { waiting: Waiting[] }).waiting;

describe('task-353 AC 3 — an unscoped step of an unbound instance runs on plan:<instance-id> (spec-016 §3.2 step 2, §5; bug-418)', () => {
  let repo: string;
  beforeAll(() => {
    repo = scaffold();
  });

  it.each(['json', 'console'])('agent execute --next --dry-run --format %s: exit 0, the run on plan:sw-life-cycle-1-plan, nothing written', (format) => {
    const before = headOf(repo);
    const run = cli(repo, ['agent', 'execute', '--next', '--dry-run', '--format', format]);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(JSON.parse(run.stdout)).toMatchObject({
      dryRun: true,
      subject: `agent: record ${RUN_1}`,
      paths: [LOG],
      run: { id: RUN_1, element: PLAN_REF, workflow: 'sw-life-cycle', phase: 'inception', role: 'product-owner', agent: 'Fake Agent', adapter: 'custom/fake', state_ref: before },
    });
    expect(run.fake).toEqual([]);
    expect(headOf(repo)).toBe(before);
  });

  it('agent list --waiting --format json: the waiting step\'s element is plan:sw-life-cycle-1-plan; the console line is unchanged', () => {
    const json = cli(repo, ['agent', 'list', '--waiting', '--format', 'json']);
    expect([json.status, json.stderr]).toEqual([0, '']);
    expect(waitingOf(json.stdout)).toEqual([
      expect.objectContaining({ instance: INSTANCE, key: 'sw-life-cycle.inception', element: PLAN_REF, role: 'product-owner', agents: ['Fake Agent'] }),
    ]);
    const plain = cli(repo, ['agent', 'list', '--waiting']);
    expect([plain.status, plain.stderr]).toEqual([0, '']);
    expect(plain.stdout).toBe('waiting steps: 1\nsw-life-cycle.inception  product-owner  Fake Agent\n');
  });

  it('agent list --waiting --element: plan:sw-life-cycle-1-plan keeps the step, task:task-1 drops it', () => {
    const kept = cli(repo, ['agent', 'list', '--waiting', '--element', PLAN_REF, '--format', 'json']);
    expect(kept.status).toBe(0);
    expect(waitingOf(kept.stdout).map((step) => step.key)).toEqual(['sw-life-cycle.inception']);
    const dropped = cli(repo, ['agent', 'list', '--waiting', '--element', 'task:task-1', '--format', 'json']);
    expect(dropped.status).toBe(0);
    expect(waitingOf(dropped.stdout)).toEqual([]);
  });

  it('in process: the agentList operation reports the same element', async () => {
    const operation = CORE_MODULES.find((module) => module.name === 'agent')?.operations['agentList'];
    if (operation === undefined) throw new Error('"agentList" is not registered on the agent module');
    const result = (await (operation.fn as CoreFn<unknown, unknown>)({ root: repo, options: {}, waiting: true })) as Record<string, unknown>;
    const value = ('ok' in result ? result['value'] : result) as { waiting: Waiting[] };
    expect(value.waiting.map((step) => [step.key, step.element])).toEqual([['sw-life-cycle.inception', PLAN_REF]]);
  });

  it('agent execute --next (no dry run): the fake runs on the plan and the record lands in the plan\'s run log', () => {
    const local = scaffold();
    const before = headOf(local);
    const run = cli(local, ['agent', 'execute', '--next']);
    expect([run.status, run.stdout]).toEqual([0, '']);
    expect(run.fake.length).toBeGreaterThan(0);
    expect(git(local, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${RUN_1}`);
    expect(git(local, ['diff', '--name-only', before, 'HEAD']).trim()).toBe(LOG);
    expect(records(local, INSTANCE)).toEqual([expect.objectContaining({ id: RUN_1, element: PLAN_REF, workflow: 'sw-life-cycle', phase: 'inception', role: 'product-owner', state_ref: before })]);
  });
});
