/**
 * task-237 (i) — `wingfoil agent execute` end to end with an adapter declaring `mcp.via: config-arg`
 * (approver ruling D-1 (a), 2026-10-14; spec-016 §2.2/§2.3 pending amendment), on the compiled CLI with
 * no real agent and no terminal: the fake (`test/fixtures/agents/fake-agent.cjs`) under the fixture
 * `test/fixtures/agents/config-arg/fake-config-arg.yaml`, whose launch is
 * `fake-agent.cjs --mcp-config-json {mcp_config} --prompt {bootstrap}`.
 *
 * What is asserted: the rendered `mcp.template` reaches the agent as exactly ONE argv element (the
 * running build's server: `process.execPath` and `[<dist/cli.js>, "mcp"]`, §2.5), the fake's MCP
 * connection through that text reads the session Resource the bootstrap names (§2.4), the run exits `0`
 * and is recorded with `adapter: custom/fake-config-arg`. No temporary file is written for the MCP
 * registration (`config-arg` has none).
 *
 * The fixture lives outside `test/fixtures/agents/custom/` so the fake adapters every other suite and
 * the e2e-smoke gate copy from there are unchanged; it is copied into the project's `agents/custom/`.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { AGENTS_FIXTURES, DNA_YAML, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { CLI_ENTRY, spawnCapture } from './helpers/spawn-cli';

const ADAPTER = 'fake-config-arg';
const FIXTURE = join(AGENTS_FIXTURES, 'config-arg', `${ADAPTER}.yaml`);
const LOG = `docs/runs/${TASK_ID}.jsonl`;
const RUN_1 = `${TASK_ID}/adhoc/1`;

/** What the fake wrote for one invocation (task-200's record line). */
interface FakeEntry {
  readonly argv: string[];
  readonly mcp: {
    readonly server?: { readonly name: string };
    readonly resource?: { readonly uri: string };
    readonly text?: string | null;
    readonly error?: { readonly code: number; readonly message: string };
  } | null;
  readonly failure?: string;
}

const scratch: string[] = [];
let repo: string;
let before: string;
let run: { status: number; stdout: string; stderr: string; leftInTmp: string[]; fake: FakeEntry[] };

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

beforeAll(() => {
  // The project's agent `Fake Agent` points at the config-arg adapter, copied into agents/custom/.
  repo = seed((root) => {
    writeFixtureFile(root, `.wingfoil/agents/custom/${ADAPTER}.yaml`, readFileSync(FIXTURE, 'utf-8'));
    writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('      adapter: fake\n', `      adapter: ${ADAPTER}\n`));
  });
  before = git(repo, ['rev-parse', 'HEAD']).trim();

  const tmp = scratchDir('wf-config-arg-tmp-');
  const recordFile = join(scratchDir('wf-config-arg-rec-'), 'fake.jsonl');
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)));
  const result = spawnCapture(process.execPath, [CLI_ENTRY, 'agent', 'execute', '--element', TASK_REF, '--role', 'developer'], {
    cwd: repo,
    env: { ...inherited, TMPDIR: tmp, TMP: tmp, TEMP: tmp, WINGFOIL_FAKE_AGENT_RECORD: recordFile, WINGFOIL_FAKE_AGENT_CONNECT: '1' },
  });
  const fake = existsSync(recordFile)
    ? readFileSync(recordFile, 'utf-8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as FakeEntry)
    : [];
  run = { status: result.status, stdout: result.stdout, stderr: result.stderr, leftInTmp: readdirSync(tmp), fake };
}, 120000);

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  if (repo !== undefined) removeTempDir(repo);
});

describe('task-237 (i) — agent execute with mcp.via: config-arg (headless, the fake)', () => {
  it('exits 0 with nothing on stdout', () => {
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: expect.not.stringMatching(/^error: /m) });
    expect(run.stdout).toBe('');
    expect(run.leftInTmp).toEqual([]);
  });

  it('the rendered mcp.template reaches the agent as exactly ONE argv element, naming the running build', () => {
    const launch = run.fake.find((entry) => entry.argv.includes('--mcp-config-json'));
    expect(launch).toBeDefined();
    // The fake records the argv after `node <script>`: --mcp-config-json <one element> --prompt <bootstrap>.
    expect(launch!.argv).toHaveLength(4);
    expect(launch!.argv[0]).toBe('--mcp-config-json');
    expect(launch!.argv[2]).toBe('--prompt');
    const expected = `{"mcpServers": {"wingfoil": {"command": "${JSON.stringify(process.execPath).slice(1, -1)}", "args": ${JSON.stringify([CLI_ENTRY, 'mcp'])}}}}`;
    expect(launch!.argv[1]).toBe(expected);
  });

  it('through that text the fake connects to the wingfoil server and reads the session Resource the bootstrap names', () => {
    const launch = run.fake.find((entry) => entry.argv.includes('--mcp-config-json'));
    expect(launch?.failure).toBeUndefined();
    expect(launch?.mcp?.server?.name).toBe('wingfoil');
    expect(launch?.mcp?.resource).toEqual({ uri: `wingfoil://session/developer/${TASK_REF}/${before}` });
    expect(launch?.mcp?.error).toBeUndefined();
    expect(launch?.mcp?.text).toEqual(expect.stringMatching(/\S/));
  });

  it('the run is recorded with adapter custom/fake-config-arg in one `agent: record` commit', () => {
    expect(git(repo, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`agent: record ${RUN_1}`);
    const records = git(repo, ['show', `HEAD:${LOG}`]).split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: RUN_1, adapter: `custom/${ADAPTER}`, agent: 'Fake Agent', exit_status: 0 });
  });
});
