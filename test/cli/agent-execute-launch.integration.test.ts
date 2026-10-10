/**
 * task-228 — `wingfoil agent execute` launches the agent (`spec-016-agent-execution` §3.3 steps 13–18,
 * §3.4, §2.6, §4.4; REQ-INT-07 as amended by `adr-012`), on the compiled CLI with the fake adapter
 * (`test/fixtures/agents/`, task-200), no real agent and no terminal: under Jest the child's stdin and
 * stdout are pipes, and the fake's manifest declares `terminal: optional`.
 *
 * What is asserted:
 * - AC 1 — REQ-INT-07's four fit-criterion assertions on the full adhoc run: the fake receives exactly
 *   the argv its manifest renders, with no shell (the bootstrap's quotes arrive byte for byte); one
 *   record is appended, `fresh` / `n/a` / `adhoc` / `n/a`, with the fake's session, model and tokens;
 *   exactly one new commit, `agent: record <run-id>`, holding only the run log; exit `0`; empty stdout;
 * - AC 2 — an agent exit `3`, a forwarded `SIGTERM`, an ignored `SIGINT`: each run still recorded;
 * - AC 3 — the assigned session id is spec-016 §2.6's UUID v5, different per run; a failed lookup
 *   records `not-reported` with a `warning:` line and the run succeeds;
 * - AC 4 — `--format json`: every stderr message one JSON document, stdout empty;
 * - AC 7 — the bootstrap carries the attribution line naming the selected `team.agents` entry;
 * - the B3 handover: a `dna.yaml` unknown-field warning is printed once, labelled `HEAD:`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { distBuildStamp } from './helpers/dist-stamp';
import { CLI_ENTRY } from './helpers/spawn-cli';

const scratch: string[] = [];
const repos: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  for (const repo of repos) removeTempDir(repo);
});

function fixture(tweak?: (repo: string) => void): string {
  const repo = seed(tweak);
  repos.push(repo);
  return repo;
}

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/** What the fake wrote for one invocation (task-200's record line). */
interface FakeEntry {
  readonly argv: string[];
  readonly env: string[];
}

interface Run {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly leftInTmp: string[];
  readonly fake: FakeEntry[];
}

/** The environment of one run: a private `TMPDIR`, the fake's record file, the test's variables. */
function runEnv(env: Record<string, string>): { env: NodeJS.ProcessEnv; tmp: string; recordFile: string } {
  const tmp = scratchDir('wf-launch-tmp-');
  const recordFile = join(scratchDir('wf-launch-rec-'), 'fake.jsonl');
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)));
  return { env: { ...inherited, TMPDIR: tmp, TMP: tmp, TEMP: tmp, WINGFOIL_FAKE_AGENT_RECORD: recordFile, ...env }, tmp, recordFile };
}

function fakeEntries(recordFile: string): FakeEntry[] {
  if (!existsSync(recordFile)) return [];
  return readFileSync(recordFile, 'utf-8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as FakeEntry);
}

/** Run `agent execute` to completion. */
function execute(repo: string, args: readonly string[], env: Record<string, string> = {}): Run {
  const setup = runEnv(env);
  const run = spawnSync(process.execPath, [CLI_ENTRY, 'agent', 'execute', ...args], { cwd: repo, encoding: 'utf-8', env: setup.env });
  if (run.error) throw run.error;
  return {
    status: run.status,
    signal: run.signal,
    stdout: run.stdout,
    stderr: run.stderr,
    leftInTmp: readdirSync(setup.tmp),
    fake: fakeEntries(setup.recordFile),
  };
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start `agent execute` with the fake waiting for a signal, wait until the fake has recorded its launch,
 * then hand the running child to `act`; resolve when the command has exited.
 */
async function executeWaiting(repo: string, args: readonly string[], act: (pid: number, alive: () => boolean) => Promise<void>): Promise<Run> {
  const setup = runEnv({ WINGFOIL_FAKE_AGENT_WAIT: 'signal' });
  const child = spawn(process.execPath, [CLI_ENTRY, 'agent', 'execute', ...args], { cwd: repo, env: setup.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf-8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding('utf-8').on('data', (chunk: string) => (stderr += chunk));
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  let exited = false;
  void closed.then(() => (exited = true));
  for (let attempt = 0; attempt < 1200 && fakeEntries(setup.recordFile).length === 0 && !exited; attempt += 1) await pause(50);
  if (fakeEntries(setup.recordFile).length === 0) throw new Error(`the fake never launched: ${stderr}`);
  await act(child.pid!, () => !exited);
  const { code, signal } = await closed;
  return { status: code, signal, stdout, stderr, leftInTmp: readdirSync(setup.tmp), fake: fakeEntries(setup.recordFile) };
}

const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();
const toplevel = (repo: string): string => git(repo, ['rev-parse', '--show-toplevel']).trim();
const LOG = `docs/runs/${TASK_ID}.jsonl`;
const RUN_1 = `${TASK_ID}/adhoc/1`;

/** The run log as `HEAD` holds it, one parsed record per line. */
function recordsAtHead(repo: string): Record<string, unknown>[] {
  return git(repo, ['show', `HEAD:${LOG}`])
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** RFC 4122 v5, written independently of `src/agent` (see `test/agent/launch.test.ts`). */
function uuidV5(namespace: string, name: string): string {
  const hash = createHash('sha1').update(Buffer.concat([Buffer.from(namespace.replace(/-/g, ''), 'hex'), Buffer.from(name, 'utf-8')])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const SESSION_NAMESPACE = uuidV5('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'wingfoil:spec-016:session');
const sessionOf = (repo: string, runId: string): string => uuidV5(SESSION_NAMESPACE, `${toplevel(repo)}\n${runId}`);

/** `spec-016` §2.4's bootstrap for the fixture's task and `Fake Agent`, written out by hand. */
function bootstrapOf(runId: string, stateRef: string, agent = 'Fake Agent <fake-agent@example.com>'): string {
  return [
    `WingFoil run ${runId}: act as role "developer" on element ${TASK_REF}.`,
    `Your context is assembled at commit ${stateRef} and served by the "wingfoil" MCP server`,
    `registered for this session. Load it before any other action: Get the MCP prompt "developer-session" with arguments element="${TASK_REF}" and state="${stateRef}".`,
    'Record your handoff in the element\'s "## Execution Notes" section.',
    `End every commit you write, except an approve or reject commit, with the trailer paragraph "Co-Authored-By: ${agent}" and "AI-Model: <the model identifier you run as>"; to a commit wingfoil writes, add them with git commit --amend --no-edit --trailer, never as a paragraph of their own (git-conventions §7, §8).`,
    '',
  ].join('\n');
}

const FULL = ['--element', TASK_REF, '--role', 'developer'];

describe('task-228 AC 1 — the full adhoc run with the terminal: optional fake (REQ-INT-07 fit criterion)', () => {
  let repo: string;
  let before: string;
  let run: Run;
  beforeAll(() => {
    repo = fixture();
    before = head(repo);
    run = execute(repo, FULL);
  }, 120000);

  it('exits 0 with nothing on stdout, and the temporary files are gone', () => {
    expect(run.stderr).not.toMatch(/^error: /m);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    expect(run.leftInTmp).toEqual([]);
  });

  it('the fake receives exactly the argv its manifest renders, with no shell', () => {
    const launch = run.fake[0]!;
    // The fake records the argv after `node <script>`: launch.interactive.args[1..] + session.assign_args.
    expect(launch.argv).toEqual(['--mcp-config', expect.any(String), '--prompt', bootstrapOf(RUN_1, before), '--session-id', sessionOf(repo, RUN_1)]);
    expect(launch.argv[1]).toMatch(/wingfoil-run-[^/]+\/mcp-config\.json$/);
    // Post-run (§3.3 step 16): version_args, then usage.lookup_args with the assigned session id.
    expect(run.fake.slice(1).map((entry) => entry.argv)).toEqual([['--version'], ['--lookup', sessionOf(repo, RUN_1)]]);
  });

  it('one record is appended: fresh, n/a, adhoc, n/a, with the fake\'s session, model and tokens', () => {
    const records = recordsAtHead(repo);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      id: RUN_1,
      element: TASK_REF,
      workflow: 'n/a',
      phase: 'adhoc',
      role: 'developer',
      mode: 'fresh',
      agent: 'Fake Agent',
      adapter: 'custom/fake',
      agent_version: 'fake-agent 1.0.0',
      model: 'fake-model',
      session: sessionOf(repo, RUN_1),
      tokens: { input: 120, output: 45, cache_read: 10, cache_write: 5 },
      wingfoil: distBuildStamp(),
      state_ref: before,
      duration_ms: expect.any(Number),
      exit_status: 0,
      result: 'n/a',
      notes: 'none',
    });
  });

  it('exactly one new commit, `agent: record <run-id>`, holding only the run log', () => {
    expect(git(repo, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${RUN_1}`);
    expect(git(repo, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe(LOG);
    expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
  });

  it('stderr: the launch banner before the spawn, the post-run summary after it', () => {
    const sha7 = head(repo).slice(0, 7);
    const lines = run.stderr.split('\n').filter((line) => line !== '');
    expect(lines[0]).toBe(`run ${RUN_1}: launching Fake Agent (custom/fake) as developer on ${TASK_REF}`);
    expect(lines[lines.length - 1]).toMatch(new RegExp(`^run ${RUN_1}: agent exited 0 after \\d+\\.\\d s \\(recorded in ${sha7}\\)$`));
  });
});

describe('task-228 AC 2 — the agent\'s exit and signals; every run is recorded', () => {
  it('agent exit 3 → exit_status 3 recorded, exit 1, `agent exited 3; run <id> recorded`', () => {
    const repo = fixture();
    const before = head(repo);
    const run = execute(repo, FULL, { WINGFOIL_FAKE_AGENT_EXIT: '3' });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain(`error: agent exited 3; run ${RUN_1} recorded\n`);
    expect(recordsAtHead(repo)[0]).toMatchObject({ id: RUN_1, exit_status: 3 });
    expect(git(repo, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
  }, 120000);

  it('SIGTERM sent to agent execute reaches the agent → exit_status "signal:SIGTERM", recorded, exit 1', async () => {
    const repo = fixture();
    const run = await executeWaiting(repo, FULL, async (pid) => {
      process.kill(pid, 'SIGTERM');
    });
    expect(run.signal).toBeNull();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`error: agent exited signal:SIGTERM; run ${RUN_1} recorded\n`);
    expect(recordsAtHead(repo)[0]).toMatchObject({ id: RUN_1, exit_status: 'signal:SIGTERM' });
    expect(run.leftInTmp).toEqual([]);
  }, 120000);

  it('SIGINT sent to agent execute does not kill it; the run is still recorded', async () => {
    const repo = fixture();
    const run = await executeWaiting(repo, FULL, async (pid, alive) => {
      process.kill(pid, 'SIGINT');
      await pause(1500);
      expect(alive()).toBe(true);
      process.kill(pid, 'SIGTERM');
    });
    expect(run.signal).toBeNull();
    expect(run.status).toBe(1);
    expect(recordsAtHead(repo)).toHaveLength(1);
    expect(recordsAtHead(repo)[0]).toMatchObject({ exit_status: 'signal:SIGTERM' });
  }, 120000);
});

describe('task-228 AC 3 — the assigned session id, and a lookup that fails', () => {
  it('session.id: assign passes the UUID v5 of `<abs root>\\n<run id>`: a second run gets its own', () => {
    const repo = fixture();
    const first = execute(repo, FULL);
    const second = execute(repo, FULL);
    expect([first.status, second.status]).toEqual([0, 0]);
    const runTwo = `${TASK_ID}/adhoc/2`;
    expect(second.fake[0]!.argv.slice(-2)).toEqual(['--session-id', sessionOf(repo, runTwo)]);
    expect(recordsAtHead(repo).map((record) => record['session'])).toEqual([sessionOf(repo, RUN_1), sessionOf(repo, runTwo)]);
    expect(sessionOf(repo, RUN_1)).not.toBe(sessionOf(repo, runTwo));
  }, 180000);

  it('a lookup that fails → model and tokens not-reported, a warning line, and the run succeeds', () => {
    const repo = fixture();
    const run = execute(repo, FULL, { WINGFOIL_FAKE_AGENT_LOOKUP: 'fail' });
    expect(run.status).toBe(0);
    expect(run.stderr).toContain("warning: adapter 'fake': the usage lookup failed (exited 1): model and tokens recorded as not-reported\n");
    expect(recordsAtHead(repo)[0]).toMatchObject({
      model: 'not-reported',
      tokens: { input: 'not-reported', output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' },
      session: sessionOf(repo, RUN_1),
      agent_version: 'fake-agent 1.0.0',
    });
  }, 120000);
});

describe('task-228 AC 4 — --format json: each stderr message one JSON document, stdout empty', () => {
  it('success: {warning}, {notice}, then {run: <record>}', () => {
    const repo = fixture();
    const run = execute(repo, ['--element', TASK_REF, '--format', 'json']);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    const documents = run.stderr.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(documents.map((document) => Object.keys(document))).toEqual([['warning'], ['notice'], ['run']]);
    expect(documents[2]!['run']).toEqual(recordsAtHead(repo)[0]);
  }, 120000);

  it('agent exit 3: {notice}, then {error, details}', () => {
    const repo = fixture();
    const run = execute(repo, [...FULL, '--format', 'json'], { WINGFOIL_FAKE_AGENT_EXIT: '3' });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    const documents = run.stderr.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(documents.map((document) => Object.keys(document)[0])).toEqual(['notice', 'error']);
    expect(documents[1]!['error']).toBe(`agent exited 3; run ${RUN_1} recorded`);
  }, 120000);

  it('yaml: every message a YAML document of its own', () => {
    const repo = fixture();
    const run = execute(repo, [...FULL, '--format', 'yaml']);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr.startsWith('---\nnotice: ')).toBe(true);
    expect(run.stderr).toContain('...\n---\nrun:\n');
  }, 120000);
});

describe('task-228 AC 7 — the bootstrap carries the attribution rule for the selected entry (dl-117 Action 4)', () => {
  it('--agent selects another entry: the dry-run plan\'s bootstrap names it', () => {
    const repo = fixture((root) =>
      writeFixtureFile(
        root,
        '.wingfoil/dna.yaml',
        DNA_YAML.replace(
          '    - name: Plain Agent\n',
          '    - name: Second Agent\n      email: second-agent@example.com\n      executes_as: [ developer ]\n      approval_authority: false\n      adapter: fake\n    - name: Plain Agent\n',
        ),
      ),
    );
    const run = execute(repo, [...FULL, '--agent', 'Second Agent', '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    const plan = JSON.parse(run.stdout) as { bootstrap: string };
    expect(plan.bootstrap).toBe(bootstrapOf(RUN_1, head(repo), 'Second Agent <second-agent@example.com>'));
  }, 120000);
});

describe('task-228 — the B3 handover: a dna.yaml unknown-field warning is printed once, labelled HEAD:', () => {
  it('one warning line, not two, with no sha in its label', () => {
    const repo = fixture((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', `${DNA_YAML}mystery: 1\n`));
    const run = execute(repo, [...FULL, '--dry-run']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe('warning: HEAD:.wingfoil/dna.yaml: unknown field(s) ignored: mystery\n');
  }, 120000);
});
