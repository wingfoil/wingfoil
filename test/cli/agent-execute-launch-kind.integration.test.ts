/**
 * task-335 AC 2, AC 3 (red-first) — who chooses the launch kind (`dl-183` Q1 (a), Q2 (a), Q3 (a); `spec-016` §3.1,
 * §3.2 step 7, §3.3 step 4, §3.7 `NO_LAUNCH_KIND`; `spec-008` §12; approver ruling D4 (a)), on the compiled CLI with
 * the fake adapter (`test/fixtures/agents/custom/fake.yaml`, which declares both kinds) and no terminal, against
 * the step fixture whose `loop.implement` phase declares `launch:` (`seedLaunch`).
 *
 * The kind shows in the argv the fake records: `launch.headless.args` start with `--headless`, `launch.interactive.args`
 * do not (both are followed by `session.assign_args`).
 *
 * - AC 2 (a): `--headless` / `--interactive` override the phase's `launch`, with one `warning:` line when the
 *   option contradicts a declared kind; none when the phase declares nothing;
 * - AC 2 (b): both together exit `2` with `spec-016` §3.1's message, before the project is read (in a git
 *   repository with no `.wingfoil/`, where any read of the project would be the not-initialized refusal);
 * - AC 2 (c): an `approver` step, or `--role approver`, is never launched, whichever flag is given;
 * - AC 2 (d): the command flag `--interactive` and the global `--no-interactive` do not collide;
 * - AC 3 (a): an adapter without `launch.headless` is refused with `NO_LAUNCH_KIND` before any side effect, before
 *   `AGENT_NOT_FOUND`;
 * - AC 3 (b): `launch: any` launches interactive with no option, headless with `--headless`, no warning either way;
 *   `launch: headless` with no option launches headless.
 *
 * Expected messages are `spec-016` §3.1/§3.7's (amended at the design gate) for the new refusals and warning, and
 * copied from real runs of this build for the existing ones (the task's red notes name the commands).
 */
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, manifest, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { seedLaunch } from '../agent/helpers/agent-execute-awaiting-fixture';
import { RELEASE_ID, seedStep, startInstance, STEP_WORKFLOWS } from '../agent/helpers/agent-execute-step-fixture';
import { errorLine, execute, expectNothingRan, headOf, launchArgv, records, removeRunScratch, warningLines, type AgentRun } from './helpers/agent-execute-cli';

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

function track(repo: string): string {
  repos.push(repo);
  return repo;
}

/** The fake's launch was the headless one (`fake.yaml`'s `launch.headless.args` start with `--headless`). */
const ranHeadless = (run: AgentRun): boolean => launchArgv(run)[0] === '--headless';

/** `fake.yaml` without its `launch.headless` block. */
const NO_HEADLESS = (text: string): string => text.replace(/^ {2}headless:\n(?: {4}.*\n)+/m, '');

/** The warning `spec-016` §3.2 step 7 prints when the option contradicts the phase. */
const contradiction = (declared: string, kind: string): string => `warning: phase 'loop.implement' declares launch: ${declared}; launching ${kind} (--${kind})`;

describe('task-335 AC 2 (a) — the option over the phase, with a warning on a contradiction (dl-183 Q2 (a))', () => {
  it('launch: interactive + --headless → the headless argv and exactly the contradiction warning', () => {
    const repo = track(seedLaunch('interactive'));
    const run = execute(repo, ['--next', '--headless']);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([contradiction('interactive', 'headless')]);
    expect(ranHeadless(run)).toBe(true);
    expect(records(repo, TASK_ID)).toEqual([expect.objectContaining({ id: `${TASK_ID}/implement/1`, workflow: 'loop', phase: 'implement', result: 'n/a' })]);
  });

  it('launch: headless + --interactive → the interactive argv and the mirror warning', () => {
    const repo = track(seedLaunch('headless'));
    const run = execute(repo, ['--next', '--interactive']);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([contradiction('headless', 'interactive')]);
    expect(ranHeadless(run)).toBe(false);
  });

  it('no launch declared + --headless → the headless argv, no warning', () => {
    const repo = track(seedLaunch(undefined));
    const run = execute(repo, ['--next', '--headless']);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([]);
    expect(ranHeadless(run)).toBe(true);
  });
});

describe('task-335 AC 2 (b) — --headless with --interactive is a usage error, exit 2', () => {
  const MESSAGE = 'error: invalid flag combination: --headless cannot be combined with --interactive';

  it('in a project: exit 2, nothing spawned, nothing written', () => {
    const repo = track(seedLaunch(undefined));
    const before = headOf(repo);
    const run = execute(repo, ['--next', '--headless', '--interactive']);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(MESSAGE);
    expectNothingRan(repo, run, before);
  });

  it('before the project is read: in a git repository with no .wingfoil/, the same exit 2 (not the not-initialized refusal)', () => {
    const repo = track(makeTempGitRepo());
    const run = execute(repo, ['--next', '--headless', '--interactive']);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(MESSAGE);
  });
});

/** A phase whose role is `approver` and that awaits nothing (`release-submit.enter-releasing`'s shape). */
const APPROVER_STEP = `name: approver-step
startable: true
element: release
phases:
  - name: enter-releasing
    role: approver
    actions:
      - element.set_state(releasing)
`;

describe('task-335 AC 2 (c) — an approver step is never launched, whichever kind flag is given (spec-016 §3.7 APPROVER_ROLE)', () => {
  let repo: string;
  beforeAll(() => {
    repo = track(seedStep(undefined, { ...STEP_WORKFLOWS, 'workflows/custom/approver-step.yaml': APPROVER_STEP }));
    startInstance(repo, 'approver-step-1', 'approver-step', RELEASE_ID);
  });

  it.each([
    [['--next', '--headless']],
    [['--next', '--interactive']],
    [['--element', TASK_REF, '--role', 'approver', '--headless']],
    [['--element', TASK_REF, '--role', 'approver', '--interactive']],
  ])('%j → exit 1, the APPROVER_ROLE refusal, nothing spawned', (args) => {
    const before = headOf(repo);
    const run = execute(repo, args);
    expect(run.status).toBe(1);
    // Copied from a real run of this build: `agent execute --element task:task-202-explicit-override --role approver`.
    expect(errorLine(run.stderr)).toBe("error: role 'approver' is never executed by an agent");
    expectNothingRan(repo, run, before);
  });
});

describe('task-335 AC 2 (d) — the command flag --interactive and the global --no-interactive do not collide (D4 (a))', () => {
  it('agent execute --no-interactive --element … --interactive --dry-run → exit 0, the plan', () => {
    const repo = track(seedLaunch(undefined));
    const run = execute(repo, ['--no-interactive', '--element', TASK_REF, '--role', 'developer', '--interactive', '--dry-run', '--format', 'json']);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ dryRun: true, run: { element: TASK_REF, role: 'developer' } });
  });
});

describe('task-335 AC 3 (a) — an adapter with no headless launch is refused before any side effect (NO_LAUNCH_KIND)', () => {
  function noHeadless(name: string, edit: (text: string) => string = (text) => text): string {
    return track(
      seedLaunch(undefined, (root) => {
        writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', `adapter: ${name}`));
        writeFixtureFile(root, `.wingfoil/agents/custom/${name}.yaml`, manifest(name, (text) => edit(NO_HEADLESS(text))));
      }),
    );
  }

  it('--headless → exit 1, VALIDATION "adapter … declares no headless launch", stdout empty, nothing spawned or written', () => {
    const repo = noHeadless('fake-no-headless');
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless']);
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)).toBe("error: adapter 'fake-no-headless' declares no headless launch");
    expectNothingRan(repo, run, before);
  });

  it('its command off PATH as well: the same refusal (it precedes AGENT_NOT_FOUND)', () => {
    const repo = noHeadless('gone-no-headless', (text) => text.replace(/^command: node$/m, 'command: wingfoil-no-such-agent-cli'));
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless']);
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)).toBe("error: adapter 'gone-no-headless' declares no headless launch");
    expectNothingRan(repo, run, before);
    // Without --headless the interactive kind meets AGENT_NOT_FOUND, the refusal NO_LAUNCH_KIND precedes.
    expect(errorLine(execute(repo, ['--element', TASK_REF, '--role', 'developer']).stderr)).toBe("error: agent command 'wingfoil-no-such-agent-cli' not found (adapter 'gone-no-headless')");
  });
});

describe('task-335 AC 3 (b) — launch: any is interactive first; launch: headless is headless (dl-183 Q3 (a))', () => {
  it('launch: any, no option → the interactive argv, no warning', () => {
    const repo = track(seedLaunch('any'));
    const run = execute(repo, ['--next']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([]);
    expect(ranHeadless(run)).toBe(false);
  });

  it('launch: any + --headless → the headless argv, no warning', () => {
    const repo = track(seedLaunch('any'));
    const run = execute(repo, ['--next', '--headless']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([]);
    expect(ranHeadless(run)).toBe(true);
  });

  it('launch: headless, no option → the headless argv, no warning', () => {
    const repo = track(seedLaunch('headless'));
    const run = execute(repo, ['--next']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([]);
    expect(ranHeadless(run)).toBe(true);
  });
});

describe('task-335 — the stepless form has no phase: interactive by default (spec-016 §3.2 step 7)', () => {
  it('--element with no option → the interactive argv, no kind warning', () => {
    const repo = track(seedLaunch('headless'));
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([]);
    expect(ranHeadless(run)).toBe(false);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${TASK_ID}/adhoc/1`);
  });
});
