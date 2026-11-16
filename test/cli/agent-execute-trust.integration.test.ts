/**
 * task-353 AC 2 (red-first; `spec-016` §3.3 step 16, §3.5, §3.7 `START_UP_HINT` and §4.2 key 18, as amended at the
 * design gate `c0ac033df`; `bug-500`; approver ruling D5) — on the compiled CLI with the fake agent, an agent that
 * exits without getting past its start-up is reported with the folder-trust hint.
 *
 * The fixture is `seed()` with a custom adapter derived inline from the fake's (`manifest(name, …)`; `fake.yaml` itself
 * is unchanged): `fake-trust` declares `launch.interactive.trust: prompt` and `launch.headless.trust: prompt`,
 * `fake-implied` declares `implied` on both, and the agent `Fake Agent` is given that adapter. Each case runs on a
 * fresh repository, so its run is `<task>/adhoc/1`.
 *
 * - (a) `fake-trust`, interactive, the fake exits `1`: exit `1`; stderr holds, in this order, the `warning:` line of
 *   §3.3 step 16 naming `launch.interactive.trust` and the unchanged `error: agent exited 1; run … recorded`; the
 *   record's `notes` is the hint text;
 * - (b) the same with `--headless`: the warning names `launch.headless.trust`;
 * - (c) `fake-trust`, the fake exits `0`: exit `0`, no warning, `notes` `none`;
 * - (d) the fake exits `1` under `fake-implied`, and under the unchanged `fake` (no `trust`): no hint, `notes` `none`;
 * - (e) `fake-trust`, the fake commits (`WINGFOIL_FAKE_AGENT_COMMIT=1`) then exits `1`: no hint, `notes` `none`.
 *
 * Each absence (c)–(e) runs beside the positive case (a) (dl-097 (a)). The error line and the banner order are copied
 * from a real run of today's build (`WINGFOIL_FAKE_AGENT_EXIT=1 node dist/cli.js agent execute --element <ref> --role
 * developer`, the task's red notes): `error: agent exited 1; run <id> recorded`. Expected red today: `fake-trust` and
 * `fake-implied` are refused by the strict schema (`Unrecognized key: "trust"`) before any launch, so (a), (b), (c)
 * and the `implied` half of (d) and (e) fail on the exit code or the missing warning.
 */
import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, manifest, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { errorLine, execute, headOf, records, removeRunScratch, warningLines, type AgentRun } from './helpers/agent-execute-cli';

/** `spec-016` §4.2 key 18's fixed text. */
const HINT_NOTES = 'none (no commit since state_ref: the agent CLI may have stopped at its folder-trust step)';

const RUN_1 = `${TASK_ID}/adhoc/1`;

/** `spec-016` §3.3 step 16's warning line, as the console renders it. */
const hintLine = (exitStatus: string, adapter: string, kind: 'interactive' | 'headless'): string =>
  `warning: run ${RUN_1}: the agent exited ${exitStatus} with no commit since state_ref: its CLI may have stopped at its folder-trust step (adapter '${adapter}' declares launch.${kind}.trust: prompt)`;

/** `fake.yaml` with `trust` declared on both launch kinds. */
const TRUST = (value: string) => (text: string): string =>
  text.replace('    terminal: optional\n', `    terminal: optional\n    trust: ${value}\n`).replace('    output: json\n', `    output: json\n    trust: ${value}\n`);

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

/** A fresh `seed()` whose `Fake Agent` uses `adapter` (derived from the fake with `trust: <value>`), or the fake itself. */
function repoWith(adapter: 'fake-trust' | 'fake-implied' | 'fake'): string {
  const repo = seed((root) => {
    if (adapter === 'fake') return;
    writeFixtureFile(root, `.wingfoil/agents/custom/${adapter}.yaml`, manifest(adapter, TRUST(adapter === 'fake-trust' ? 'prompt' : 'implied')));
    writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', `adapter: ${adapter}`));
  });
  repos.push(repo);
  return repo;
}

const hintWarnings = (run: AgentRun): string[] => warningLines(run.stderr).filter((line) => line.includes('folder-trust'));
const lastNotes = (repo: string): unknown => records(repo, TASK_ID).at(-1)?.['notes'];

describe('task-353 AC 2 — the start-up hint (spec-016 §3.3 step 16, §3.7 START_UP_HINT, §4.2 key 18)', () => {
  it('(a) trust: prompt, interactive, the agent exits 1 with no commit: the warning, then the unchanged error; notes is the hint', () => {
    const repo = repoWith('fake-trust');
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer'], { WINGFOIL_FAKE_AGENT_EXIT: '1' });
    expect(run.status).toBe(1);
    const lines = run.stderr.split('\n');
    const warning = hintLine('1', 'fake-trust', 'interactive');
    const error = `error: agent exited 1; run ${RUN_1} recorded`;
    expect(lines).toContain(warning);
    expect(lines).toContain(error);
    expect(lines.indexOf(warning)).toBeLessThan(lines.indexOf(error));
    expect(hintWarnings(run)).toEqual([warning]);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${RUN_1}`);
    expect(lastNotes(repo)).toBe(HINT_NOTES);
  });

  it('(b) the same with --headless: the warning names launch.headless.trust', () => {
    const repo = repoWith('fake-trust');
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless'], { WINGFOIL_FAKE_AGENT_EXIT: '1' });
    expect(run.status).toBe(1);
    expect(hintWarnings(run)).toEqual([hintLine('1', 'fake-trust', 'headless')]);
    expect(errorLine(run.stderr)).toBe(`error: agent exited 1; run ${RUN_1} recorded`);
    expect(lastNotes(repo)).toBe(HINT_NOTES);
  });

  it('(c) trust: prompt, the agent exits 0: exit 0, no warning, notes none', () => {
    const repo = repoWith('fake-trust');
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer']);
    expect(run.status).toBe(0);
    expect(run.fake.length).toBeGreaterThan(0);
    expect(hintWarnings(run)).toEqual([]);
    expect(lastNotes(repo)).toBe('none');
  });

  it.each<['fake-implied' | 'fake']>([['fake-implied'], ['fake']])('(d) %s (implied / no trust), the agent exits 1: no hint, notes none, the unchanged error', (adapter) => {
    const repo = repoWith(adapter);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer'], { WINGFOIL_FAKE_AGENT_EXIT: '1' });
    expect(run.status).toBe(1);
    expect(run.fake.length).toBeGreaterThan(0);
    expect(errorLine(run.stderr)).toBe(`error: agent exited 1; run ${RUN_1} recorded`);
    expect(hintWarnings(run)).toEqual([]);
    expect(lastNotes(repo)).toBe('none');
  });

  it('(e) trust: prompt, the agent commits then exits 1: no hint (HEAD moved past state_ref), notes none', () => {
    const repo = repoWith('fake-trust');
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer'], { WINGFOIL_FAKE_AGENT_EXIT: '1', WINGFOIL_FAKE_AGENT_COMMIT: '1' });
    expect(run.status).toBe(1);
    expect(run.fake.length).toBeGreaterThan(0);
    expect(git(repo, ['log', '--format=%s', `${before}..HEAD`]).trim().split('\n')).toEqual([`agent: record ${RUN_1}`, 'fake: work']);
    expect(errorLine(run.stderr)).toBe(`error: agent exited 1; run ${RUN_1} recorded`);
    expect(hintWarnings(run)).toEqual([]);
    expect(lastNotes(repo)).toBe('none');
  });
});
