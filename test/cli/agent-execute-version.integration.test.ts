/**
 * task-337 AC 2 (red-first) and AC 3 (characterization) — on the compiled CLI with the fake agent and no terminal
 * (`spec-016` §2.6 "The agent CLI's version", §4.2 keys 9, 17 and 19 and "The 18-key form", as amended at
 * `2d193b318`; `dl-180` version (b), `dl-181` Q1 (a), `bug-366`; approver rulings D1 (a), D2 (a), D7 (a); BDD
 * `P5.3.1-agent-execute.feature` "An agent CLI that updates itself during the run is recorded at the version that ran"
 * and "A run log written before agent_version_after existed is still read").
 *
 * The fake's version is driven by `WINGFOIL_FAKE_AGENT_VERSION_FILE` (`--version` prints its first line when it exists,
 * else `fake-agent 1.0.0`) and `WINGFOIL_FAKE_AGENT_UPDATE_TO` (a launch writes that version to the file): an agent CLI
 * that updates itself during the session.
 *
 * - AC 2: with an update, the record's `agent_version` is the version before the launch and `agent_version_after` the
 *   one after, stderr has the exact "the agent CLI changed during the run" warning, exit `0`; without one, both are
 *   `fake-agent 1.0.0` and no such warning; the fake's record shows `--version` before the launch entry; a read that
 *   prints nothing before the launch is warned before the banner, one after the run after it; `agent show` prints
 *   `agent_version_after` after `notes`; `agent list --past --format json` reads an 18-key line with
 *   `agent_version_after: "not-reported"`.
 * - AC 3 (characterization, passes today): a work run's `result` is `n/a`, interactive and headless (`launch.ts` writes
 *   `result: 'n/a'` for both kinds; `test/cli/agent-execute-headless.integration.test.ts` pins it for the headless run).
 *
 * Expected red: today `version_args` runs once, after the run, and the record has 18 keys.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { cli, execute, records, removeRunScratch, warningLines } from './helpers/agent-execute-cli';

const RUN_1 = `${TASK_ID}/adhoc/1`;
const BANNER = `run ${RUN_1}: launching Fake Agent (custom/fake) as developer on ${TASK_REF}`;
const CHANGED = "warning: adapter 'fake': the agent CLI changed during the run: version_args printed 'fake-agent 1.0.0' before the launch and 'fake-agent 1.0.1' after it";

const repos: string[] = [];
const cleanup: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const root of repos.splice(0)) removeTempDir(root);
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(): string {
  const root = seed();
  repos.push(root);
  return root;
}

/** A version file path in a fresh scratch directory (the file itself absent). */
function versionFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-337-version-'));
  cleanup.push(dir);
  return join(dir, 'version');
}

const run1 = (root: string): Record<string, unknown> | undefined => records(root, TASK_ID).find((record) => record['id'] === RUN_1);

describe('task-337 AC 2 — the agent version read before the launch and after it (spec-016 §2.6, §4.2 key 19)', () => {
  it('an agent CLI that updates itself during the run: agent_version the one that ran, agent_version_after the new one, the warning, exit 0', () => {
    const root = repo();
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer'], {
      WINGFOIL_FAKE_AGENT_VERSION_FILE: versionFile(),
      WINGFOIL_FAKE_AGENT_UPDATE_TO: 'fake-agent 1.0.1',
    });
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ agent_version: 'fake-agent 1.0.0', agent_version_after: 'fake-agent 1.0.1' });
    expect(warningLines(run.stderr).filter((line) => line.includes('changed during the run'))).toEqual([CHANGED]);
    const lines = run.stderr.split('\n');
    expect(lines.indexOf(CHANGED)).toBeGreaterThan(lines.indexOf(BANNER));
  });

  it('no update: both fake-agent 1.0.0, no changed-version warning; --version runs before the launch entry and after it', () => {
    const root = repo();
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer']);
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ agent_version: 'fake-agent 1.0.0', agent_version_after: 'fake-agent 1.0.0' });
    expect(warningLines(run.stderr).filter((line) => line.includes('changed during the run'))).toEqual([]);
    const kinds = run.fake.map((entry) => (entry.argv.includes('--version') ? 'version' : entry.argv.includes('--lookup') ? 'lookup' : 'launch'));
    expect(kinds).toEqual(['version', 'launch', 'version', 'lookup']);
  });

  it('a version read that prints nothing before the launch: its warning precedes the banner; the read after the run is recorded', () => {
    const root = repo();
    const file = versionFile();
    writeFileSync(file, '\n');
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer'], { WINGFOIL_FAKE_AGENT_VERSION_FILE: file, WINGFOIL_FAKE_AGENT_UPDATE_TO: 'fake-agent 1.0.1' });
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ agent_version: 'not-reported', agent_version_after: 'fake-agent 1.0.1' });
    const before = "warning: adapter 'fake': version_args printed nothing before the launch: agent_version recorded as not-reported";
    const lines = run.stderr.split('\n');
    expect(lines).toContain(before);
    expect(lines.indexOf(before)).toBeLessThan(lines.indexOf(BANNER));
    expect(warningLines(run.stderr).filter((line) => line.includes('changed during the run'))).toEqual([]);
  });

  it('a version read that prints nothing after the run: its warning follows the banner; agent_version is recorded', () => {
    const root = repo();
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer'], { WINGFOIL_FAKE_AGENT_VERSION_FILE: versionFile(), WINGFOIL_FAKE_AGENT_UPDATE_TO: '' });
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ agent_version: 'fake-agent 1.0.0', agent_version_after: 'not-reported' });
    const after = "warning: adapter 'fake': version_args printed nothing after the run: agent_version_after recorded as not-reported";
    const lines = run.stderr.split('\n');
    expect(lines).toContain(after);
    expect(lines.indexOf(after)).toBeGreaterThan(lines.indexOf(BANNER));
  });

  it('agent show prints agent_version_after after notes', () => {
    const root = repo();
    expect(execute(root, ['--element', TASK_REF, '--role', 'developer'], { WINGFOIL_FAKE_AGENT_VERSION_FILE: versionFile(), WINGFOIL_FAKE_AGENT_UPDATE_TO: 'fake-agent 1.0.1' }).status).toBe(0);
    const show = cli(root, ['agent', 'show', RUN_1]);
    expect(show.status).toBe(0);
    const lines = show.stdout.split('\n');
    expect(lines.slice(lines.indexOf('notes: none'), lines.indexOf('notes: none') + 2)).toEqual(['notes: none', 'agent_version_after: fake-agent 1.0.1']);
  });
});

describe('task-337 AC 2 — a run log of the 18-key form is read with agent_version_after not-reported (spec-016 §4.2; D7 (a))', () => {
  it("agent list --past --format json on the task-236 run log (written by 0.2.2, read by every build up to 0.3.2): both runs, agent_version_after not-reported", () => {
    const root = makeTempGitRepo();
    repos.push(root);
    const name = 'task-236-ship-verify-hand-builtin-claude-code-adapter-point.jsonl';
    writeFixtureFile(root, '.wingfoil/dna.yaml', LEGACY_DNA);
    writeFixtureFile(root, `docs/runs/${name}`, readFileSync(join(__dirname, '..', 'fixtures', 'run-logs', name), 'utf-8'));
    commitAll(root, 'seed the 18-key run log');
    const list = cli(root, ['agent', 'list', '--past', '--format', 'json']);
    expect(list.status).toBe(0);
    const past = (JSON.parse(list.stdout) as { past: Record<string, unknown>[] }).past;
    expect(past.map((record) => [record['agent_version'], record['agent_version_after']])).toEqual([
      ['2.1.296 (Claude Code)', 'not-reported'],
      ['2.1.299 (Claude Code)', 'not-reported'],
    ]);
    expect(git(root, ['status', '--porcelain'])).toBe('');
  });
});

describe('task-337 AC 3 (characterization) — a work run\'s result is n/a (spec-016 §4.2 key 17, dl-181 Q1 (a))', () => {
  it.each([[[] as string[]], [['--headless']]])('the record of a run with %j has result n/a', (extra) => {
    const root = repo();
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer', ...extra]);
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ result: 'n/a', exit_status: 0 });
  });
});

/** A `dna.yaml` declaring `paths.runs: [docs/runs/]`, the run log's directory. */
const LEGACY_DNA = `version: 1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ approver ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
  runs: [ docs/runs/ ]
`;
