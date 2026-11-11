/**
 * task-356 AC 1 (b) (red-first, `bug-372`; `spec-016` §2.5, §3.3 step 4 and §3.7 `MCP_SERVER_DECLARED`, as amended
 * at the design gate; approver rulings D1 (a), D1.2, D1.3) — `agent execute`'s conflict probe, in process through
 * `agentExecutePipeline` (the pattern of `test/agent/execute-config-arg.test.ts`): before the launch, the
 * adapter's `mcp.conflict_args` runs the agent CLI to ask whether its own configuration declares an MCP server
 * named `wingfoil`, which a `-c` override would merge into (the design addendum's H1: `codex mcp get wingfoil`
 * exits 0 exactly when Codex would load such a table, 1 otherwise; only the exit status is read).
 *
 * The adapter is `test/fixtures/agents/config-arg/fake-conflict.yaml` (`fake-config-arg.yaml` plus
 * `mcp.conflict_args: [test/fixtures/agents/fake-agent.cjs, --mcp-get, wingfoil]`); the fake answers `--mcp-get`
 * with the exit `WINGFOIL_FAKE_AGENT_MCP_GET` declares (`0`, `1`, `hang`) and records the invocation:
 *
 * - exit 0 → `CONFLICT`, the §3.7 message, `details` naming the adapter and the argv; nothing launched, nothing
 *   committed; on a dry run the same (D1.2); before the git-identity check (§3.3 step 4 precedes step 5);
 * - exit 1 → the launch runs;
 * - the probe times out → one `warning:` naming the adapter and `timed out`, and the launch runs (D1.3). The
 *   probe's limit is read from `LaunchHost.lookupTimeoutMs`, as the post-run lookups' is, set short here.
 *
 * Today the manifest's `mcp.conflict_args` is an unknown key: the adapter is refused at load (`VALIDATION`) and the
 * fake is never asked.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { agentExecutePipeline, type AgentExecuteHost } from '../../src/agent';
import { coreOk, type CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { AGENTS_FIXTURES, DNA_YAML, seed, TASK_ID } from './helpers/agent-execute-fixture';

const ADAPTER = 'fake-conflict';
const HOST: AgentExecuteHost = {
  mcpServer: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] },
  isTerminal: () => true,
  lookupTimeoutMs: 1000,
};

const MESSAGE = `adapter '${ADAPTER}': the agent's own configuration declares an MCP server named 'wingfoil', which it would merge into the server agent execute registers: remove or rename it`;

const repos: string[] = [];
const scratch: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** The fixture project with the `fake-conflict` adapter selected; `tweak` runs after the seed's commit. */
function fixture(tweak: (root: string) => void = () => undefined): string {
  const repo = seed((root) => {
    writeFixtureFile(root, `.wingfoil/agents/custom/${ADAPTER}.yaml`, readFileSync(join(AGENTS_FIXTURES, 'config-arg', `${ADAPTER}.yaml`), 'utf-8'));
    writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('      adapter: fake\n', `      adapter: ${ADAPTER}\n`));
  });
  tweak(repo);
  repos.push(repo);
  return repo;
}

interface Outcome {
  readonly result: CoreResult<undefined>;
  readonly launched: boolean;
  readonly warnings: string[];
  /** The argv of every fake invocation, in order (after `node <script>`). */
  readonly fake: string[][];
}

/** The pipeline with the fake's `--mcp-get` answering `answer`; the launch callback records that it was reached. */
async function execute(root: string, answer: '0' | '1' | 'hang', dryRun = false): Promise<Outcome> {
  const dir = mkdtempSync(join(tmpdir(), 'wf-356-probe-'));
  scratch.push(dir);
  const recordFile = join(dir, 'fake.jsonl');
  const saved = { record: process.env.WINGFOIL_FAKE_AGENT_RECORD, answer: process.env.WINGFOIL_FAKE_AGENT_MCP_GET };
  process.env.WINGFOIL_FAKE_AGENT_RECORD = recordFile;
  process.env.WINGFOIL_FAKE_AGENT_MCP_GET = answer;
  let launched = false;
  const warnings: string[] = [];
  try {
    const result = await withNoticeSink(
      () => undefined,
      () =>
        withWarningSink(
          (warning) => warnings.push(warning),
          () =>
            agentExecutePipeline(root, { element: { type: 'task', id: TASK_ID }, role: 'developer', dryRun }, HOST, async () => {
              launched = true;
              return coreOk(undefined);
            }),
        ),
    );
    const fake = existsSync(recordFile)
      ? readFileSync(recordFile, 'utf-8')
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => (JSON.parse(line) as { argv: string[] }).argv)
      : [];
    return { result, launched, warnings, fake };
  } finally {
    for (const [name, value] of [['WINGFOIL_FAKE_AGENT_RECORD', saved.record], ['WINGFOIL_FAKE_AGENT_MCP_GET', saved.answer]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const commits = (repo: string): string => git(repo, ['rev-list', '--count', 'HEAD']).trim();

/** The refusal, `details.argv` left to a containment check (the design names `{ adapter, argv }`, not argv's form). */
const REFUSED = {
  ok: false,
  error: { code: 'CONFLICT', message: MESSAGE, details: { adapter: ADAPTER, argv: expect.arrayContaining(['--mcp-get', 'wingfoil']) } },
};

describe('task-356 AC 1 (b) — the conflict probe before the launch (spec-016 §3.3 step 4, bug-372)', () => {
  it('the probe exits 0: CONFLICT MCP_SERVER_DECLARED, the probe ran once, nothing launched, nothing committed', async () => {
    const repo = fixture();
    const before = commits(repo);
    const { result, launched, fake } = await execute(repo, '0');
    expect(result).toEqual(REFUSED);
    expect(fake).toEqual([['--mcp-get', 'wingfoil']]);
    expect(launched).toBe(false);
    expect(commits(repo)).toBe(before);
  }, 60000);

  it('the probe exits 1: no conflict, the launch runs', async () => {
    const repo = fixture();
    const { result, launched, fake, warnings } = await execute(repo, '1');
    expect(result).toEqual({ ok: true, value: undefined });
    expect(launched).toBe(true);
    expect(fake[0]).toEqual(['--mcp-get', 'wingfoil']);
    expect(warnings.filter((warning) => warning.includes(`adapter '${ADAPTER}'`))).toEqual([]);
  }, 60000);

  it('the probe times out: one warning naming the adapter and "timed out", and the launch runs (D1.3)', async () => {
    const repo = fixture();
    const { result, launched, fake, warnings } = await execute(repo, 'hang');
    expect(result).toEqual({ ok: true, value: undefined });
    expect(launched).toBe(true);
    expect(fake[0]).toEqual(['--mcp-get', 'wingfoil']);
    expect(warnings.filter((warning) => warning.includes(`adapter '${ADAPTER}'`) && warning.includes('timed out'))).toHaveLength(1);
  }, 60000);

  it('a dry run runs the probe too, and is refused the same way (D1.2)', async () => {
    const repo = fixture();
    const before = commits(repo);
    const { result, launched, fake } = await execute(repo, '0', true);
    expect(result).toEqual(REFUSED);
    expect(fake).toEqual([['--mcp-get', 'wingfoil']]);
    expect(launched).toBe(false);
    expect(commits(repo)).toBe(before);
  }, 60000);

  it('the probe precedes the git-identity check (§3.3 step 4 before step 5): no identity, probe exit 0 → the conflict', async () => {
    const repo = fixture((root) => {
      git(root, ['config', '--unset', 'user.name']);
      git(root, ['config', '--unset', 'user.email']);
    });
    const { result, fake } = await execute(repo, '0');
    expect(result).toEqual(REFUSED);
    expect(fake).toEqual([['--mcp-get', 'wingfoil']]);
  }, 60000);
});
