/**
 * task-335 AC 6 (red-first) — `agent execute`'s step forms refuse a step that only waits, then apply the launch-kind
 * rule to the step they resolve (`dl-171` (c), `dl-183` Q4 (a); `spec-016` §3.2 step 1, §3.7 `STEP_AWAITING`;
 * approver ruling D8 (a)), on the compiled CLI with the fake adapter and no terminal.
 *
 * Three waiting shapes (`../agent/helpers/agent-execute-awaiting-fixture.ts`): an approval with a carried element in
 * its gate state (`gated`), an approval record no element carries (`signoff`), an `awaits:` party (`outreach`).
 * For each, `--next`, `--workflow <instance>` and `--step <key>` alone exit `1` with the `error:` line equal to the
 * line `workflow next` prints for that step in the same fixture, and spawn nothing; `--element <type>:<id>` makes the
 * step an explicit target and launches it. `--next --headless` on a waiting step is the same refusal with no kind
 * warning (the step is resolved first); on a step that does not wait, whose phase declares `launch: interactive`, it
 * launches headless with AC 2's warning.
 */
import { removeTempDir } from '../storage/helpers/git-fixture';
import { TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { AWAITING_INSTANCE, seedAwaiting, seedLaunch, type AwaitingCase } from '../agent/helpers/agent-execute-awaiting-fixture';
import { cli, errorLine, execute, expectNothingRan, headOf, launchArgv, records, removeRunScratch, warningLines } from './helpers/agent-execute-cli';

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

const CASES: readonly [AwaitingCase, string, string][] = [
  // case, step key, the line `workflow next` prints for it — copied from a real `wingfoil workflow next` in each
  // fixture (the task's red notes).
  ['gated', `gated.review@task:${TASK_ID}`, `human needed: approve or reject ${TASK_ID} — routed to WingFoil Test <wf-test@example.invalid>`],
  ['signoff', 'signoff.review@release:minor-1', 'human needed: finalize signoff.review@release:minor-1 — routed to WingFoil Test <wf-test@example.invalid>'],
  [
    'outreach',
    'outreach.announce@release:minor-1',
    'waiting for the press office: press.ack (a phase record completes it: wingfoil workflow finalize outreach-1 --step outreach.announce@release:minor-1)',
  ],
];

describe.each(CASES)('task-335 AC 6 — %s: a step that only waits is refused (STEP_AWAITING)', (which, key, line) => {
  let repo: string;
  beforeAll(() => {
    repo = seedAwaiting(which);
    repos.push(repo);
  });

  it('the fixture: workflow next prints that line for the step (characterization of the fixture)', () => {
    const next = cli(repo, ['workflow', 'next']);
    expect(next.status).toBe(0);
    expect(next.stdout).toContain(`next step: ${key}\n`);
    expect(next.stdout.split('\n').map((text) => text.trim())).toContain(line);
  });

  it.each([[['--next']], [['--workflow', AWAITING_INSTANCE[which]]], [['--step', key]], [['--next', '--headless']]])('%j → exit 1, the error line is the step line, nothing spawned, no kind warning', (args) => {
    const before = headOf(repo);
    const run = execute(repo, args);
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)).toBe(`error: ${line}`);
    expect(warningLines(run.stderr).filter((text) => text.includes('launch'))).toEqual([]);
    expectNothingRan(repo, run, before);
  });

  it('--format json: exit 1, the error document is exactly { error: <the step line> } (spec-005 §3.2: no details object)', () => {
    const before = headOf(repo);
    const run = execute(repo, ['--next', '--format', 'json']);
    const documents = run.stderr
      .split('\n')
      .filter((text) => text !== '')
      .map((text) => JSON.parse(text) as Record<string, unknown>);
    expect(run.status).toBe(1);
    // The core error's `details` object (step, instance, awaiting) is pinned in process
    // (`test/core/agent-execute-awaiting.test.ts`); the CLI renders `details` only from `details.issues`.
    expect(documents.filter((document) => 'error' in document)).toEqual([{ error: line }]);
    expectNothingRan(repo, run, before);
  });
});

describe('task-335 AC 6 — with --element the waiting step is an explicit target and is launched', () => {
  it('gated: --next --element task:<id> launches as the step role, the record names the step', () => {
    const repo = seedAwaiting('gated');
    repos.push(repo);
    const run = execute(repo, ['--next', '--element', TASK_REF]);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(launchArgv(run)).toContain('--prompt');
    expect(records(repo, TASK_ID)).toEqual([expect.objectContaining({ id: `${TASK_ID}/review/1`, workflow: 'gated', phase: 'review', role: 'reviewer' })]);
  });
});

describe('task-335 AC 6 — the launch-kind rule applies to the step --next resolves (dl-183 Q4 (a))', () => {
  it('a step that does not wait, phase launch: interactive, --next --headless → launched headless with the contradiction warning', () => {
    const repo = seedLaunch('interactive');
    repos.push(repo);
    const run = execute(repo, ['--next', '--headless']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual(["warning: phase 'loop.implement' declares launch: interactive; launching headless (--headless)"]);
    expect(launchArgv(run)[0]).toBe('--headless');
  });
});
