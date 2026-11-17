/**
 * task-337 — the fake agent's additions for the run record's usage and versions (`spec-016` §2.7 as amended at
 * `2d193b318`: "optionally writes a declared transcript for the session id it was launched with … and optionally
 * prints, after its launch, a version other than the one it printed before"), driven directly, with no `agent execute`:
 *
 * - `WINGFOIL_FAKE_AGENT_VERSION_FILE`: `--version` prints the file's first line when the file exists (an empty first
 *   line prints nothing), else `fake-agent 1.0.0`;
 * - `WINGFOIL_FAKE_AGENT_UPDATE_TO`: a launch writes that version and a newline to the version file;
 * - `WINGFOIL_FAKE_AGENT_TRANSCRIPT`: a launch carrying `--session-id <id>` copies the file to
 *   `<HOME>/.fake-agent/projects/<slug of the real cwd>/<id>.jsonl`; without `--session-id` it writes nothing.
 *
 * These are test fixtures, not production code: the cases pin what the red suites of task-337 rely on, and pass on
 * first run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FAKE_SCRIPT = join(__dirname, '..', 'fixtures', 'agents', 'fake-agent.cjs');
const TRANSCRIPT = join(__dirname, '..', 'fixtures', 'agents', 'transcripts', 'two-messages.jsonl');

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function dir(prefix: string): string {
  const made = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(made);
  return made;
}

/** Run the fake with `args` in `cwd`, no inherited `WINGFOIL_FAKE_AGENT_*`, and `env` added. */
function runFake(args: readonly string[], env: Record<string, string>, cwd: string): { status: number | null; stdout: string } {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('WINGFOIL_FAKE_AGENT_')));
  const run = spawnSync(process.execPath, [FAKE_SCRIPT, ...args], { cwd, encoding: 'utf-8', env: { ...inherited, ...env } });
  if (run.error) throw run.error;
  return { status: run.status, stdout: run.stdout };
}

const LAUNCH = ['--mcp-config', 'unused.json', '--prompt', 'bootstrap'];

describe('task-337 — the fake agent: the version file and the self-update (spec-016 §2.7)', () => {
  it('--version prints fake-agent 1.0.0 without a version file, or with one that does not exist', () => {
    const cwd = dir('wf-337-fake-');
    expect(runFake(['--version'], {}, cwd).stdout).toBe('fake-agent 1.0.0\n');
    expect(runFake(['--version'], { WINGFOIL_FAKE_AGENT_VERSION_FILE: join(cwd, 'absent') }, cwd).stdout).toBe('fake-agent 1.0.0\n');
  });

  it("--version prints the version file's first line, an empty one printing nothing", () => {
    const cwd = dir('wf-337-fake-');
    const file = join(cwd, 'version');
    writeFileSync(file, 'fake-agent 2.0.0\nignored\n');
    expect(runFake(['--version'], { WINGFOIL_FAKE_AGENT_VERSION_FILE: file }, cwd).stdout).toBe('fake-agent 2.0.0\n');
    writeFileSync(file, '\n');
    expect(runFake(['--version'], { WINGFOIL_FAKE_AGENT_VERSION_FILE: file }, cwd).stdout).toBe('\n');
  });

  it('a launch with UPDATE_TO writes the version and a newline; the next --version prints it', () => {
    const cwd = dir('wf-337-fake-');
    const file = join(cwd, 'version');
    const env = { WINGFOIL_FAKE_AGENT_VERSION_FILE: file, WINGFOIL_FAKE_AGENT_UPDATE_TO: 'fake-agent 1.0.1' };
    expect(runFake(['--version'], env, cwd).stdout).toBe('fake-agent 1.0.0\n');
    expect(runFake(LAUNCH, env, cwd).status).toBe(0);
    expect(readFileSync(file, 'utf-8')).toBe('fake-agent 1.0.1\n');
    expect(runFake(['--version'], env, cwd).stdout).toBe('fake-agent 1.0.1\n');
  });
});

describe('task-337 — the fake agent: the transcript (spec-016 §2.7, §2.3 {launch_dir_slug})', () => {
  it('a launch with --session-id copies the transcript under HOME/.fake-agent/projects/<slug>/<id>.jsonl', () => {
    const cwd = dir('wf-337-fake.cwd_');
    const home = dir('wf-337-home-');
    expect(runFake([...LAUNCH, '--session-id', 'sid-1'], { HOME: home, WINGFOIL_FAKE_AGENT_TRANSCRIPT: TRANSCRIPT }, cwd).status).toBe(0);
    const slug = realpathSync(cwd).replace(/[^A-Za-z0-9]/g, '-');
    expect(slug).not.toMatch(/[._/]/);
    expect(readFileSync(join(home, '.fake-agent', 'projects', slug, 'sid-1.jsonl'), 'utf-8')).toBe(readFileSync(TRANSCRIPT, 'utf-8'));
  });

  it('a launch without --session-id writes no transcript', () => {
    const cwd = dir('wf-337-fake-');
    const home = dir('wf-337-home-');
    expect(runFake(LAUNCH, { HOME: home, WINGFOIL_FAKE_AGENT_TRANSCRIPT: TRANSCRIPT }, cwd).status).toBe(0);
    expect(existsSync(join(home, '.fake-agent'))).toBe(false);
  });
});
