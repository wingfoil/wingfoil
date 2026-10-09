/**
 * task-218 — `agentExecuteFn` (`spec-016` §3.3 steps 1–12) driven in process, with the host facts a
 * test controls: the MCP server is the compiled build's (`dist/cli.js mcp`, which the sources cannot
 * name), the terminal answer is given, `PATH` may be emptied. The bytes a user sees are
 * `test/cli/agent-execute.integration.test.ts`; this suite reaches the pipeline's branches in the
 * coverage-measured process, and the cases the CLI suite cannot set up (no commit, an uncommitted
 * pillar file, a manifest with `prompt.via: file` or `mcp.via: args`).
 */
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentExecuteHost, AgentLaunchPlan } from '../../src/agent';
import { agentExecuteFn } from '../../src/core/agent-execute';
import { runAsDryRun } from '../../src/core/dry-run';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { DNA_YAML, manifest, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const HOST: AgentExecuteHost = { mcpServer: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] }, isTerminal: () => false };

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});
const fixture = (tweak?: (repo: string) => void): string => {
  const repo = seed(tweak);
  repos.push(repo);
  return repo;
};

interface Outcome {
  readonly result: CoreResult<unknown>;
  readonly warnings: string[];
  readonly notices: string[];
}

/** Run the operation (as a dry run unless `real`), collecting the warnings it raises. */
async function run(root: string, options: Record<string, string>, host: AgentExecuteHost = HOST, real = false): Promise<Outcome> {
  const warnings: string[] = [];
  const notices: string[] = [];
  const call = () => agentExecuteFn({ root, options, host });
  const result = await withNoticeSink(
    (text) => notices.push(text),
    () => withWarningSink((text) => warnings.push(text), () => (real ? call() : runAsDryRun(call))),
  );
  return { result, warnings, notices };
}

const refusal = (outcome: Outcome) => (outcome.result.ok ? undefined : outcome.result.error);

describe('agentExecuteFn — usage and project refusals', () => {
  it('no --element: a UsageError (exit 2), before the project is read', async () => {
    await expect(agentExecuteFn({ root: '/nonexistent', options: {} })).rejects.toThrow('missing required argument: --next or --element');
  });

  it('a malformed element-ref: a UsageError with spec-008 §7’s message', async () => {
    await expect(agentExecuteFn({ root: '/nonexistent', options: { element: 'task' } })).rejects.toThrow('malformed element-ref "task": expected <type>:<id>');
  });

  it('a repeated option takes its last value', async () => {
    const repo = fixture();
    const outcome = await run(repo, { element: TASK_REF, role: 'developer' });
    const repeated = await run(repo, { element: ['task:nope', TASK_REF] as unknown as string, role: 'developer' });
    expect(repeated.result).toEqual(outcome.result);
  }, 60000);

  it('no .wingfoil/: the not-initialized refusal', async () => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    const outcome = await run(repo, { element: TASK_REF });
    expect(refusal(outcome)?.message).toMatch(/not initialized/);
  });

  it('no commit yet: HEAD names no commit', async () => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    expect((await run(repo, { element: TASK_REF })).result.ok).toBe(false);
  });

  it('dna.yaml or memory.yaml not committed: NOT_FOUND naming the file', async () => {
    const noDna = fixture((repo) => unlinkSync(join(repo, '.wingfoil/dna.yaml')));
    writeFixtureFile(noDna, '.wingfoil/dna.yaml', DNA_YAML);
    expect(refusal(await run(noDna, { element: TASK_REF }))?.message).toBe('.wingfoil/dna.yaml is not committed at HEAD, which agent execute reads: commit it first');
    const noMemory = fixture((repo) => unlinkSync(join(repo, '.wingfoil/memory.yaml')));
    expect(refusal(await run(noMemory, { element: TASK_REF }))?.message).toBe('.wingfoil/memory.yaml is not committed at HEAD, which agent execute reads: commit it first');
  }, 60000);

  it('an invalid committed dna.yaml: VALIDATION with its issues', async () => {
    const repo = fixture((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('  members:\n', '  members: 3\n  ignored:\n')));
    const error = refusal(await run(repo, { element: TASK_REF }));
    expect(error?.code).toBe('VALIDATION');
    expect(error?.details?.['issues']).toBeDefined();
  }, 60000);
});

describe('agentExecuteFn — resolution and pre-flight refusals in process', () => {
  it('an element absent, with an unreadable sibling: NOT_FOUND naming it as a detail line', async () => {
    const repo = fixture((root) => writeFixtureFile(root, 'docs/04_memory/v0.1/task-300-broken.md', '---\nid: [unclosed\n---\n'));
    const error = refusal(await run(repo, { element: 'task:task-999-absent', role: 'developer' }));
    expect(error?.message).toBe('element not found: task:task-999-absent');
    expect(error?.details?.['issues']).toEqual([expect.objectContaining({ detail: expect.stringContaining('task-300-broken.md') })]);
  }, 60000);

  it.each([
    [{ role: 'ghost' }, "unknown role 'ghost' (not defined in dna.yaml)"],
    [{ role: 'approver' }, "role 'approver' is never executed by an agent"],
    [{ role: 'qa' }, "no agent in dna.yaml with an adapter executes as role 'qa'"],
    [{ role: 'developer', agent: 'Plain Agent' }, "agent 'Plain Agent' declares no adapter"],
  ])('%j → %s', async (extra, message) => {
    const repo = fixture();
    expect(refusal(await run(repo, { element: TASK_REF, ...extra }))?.message).toBe(message);
  }, 60000);

  it('the adapter’s command not on PATH: AGENT_NOT_FOUND', async () => {
    const repo = fixture();
    const error = refusal(await run(repo, { element: TASK_REF, role: 'developer' }, { ...HOST, searchPath: '' }));
    expect(error).toMatchObject({ code: 'IO', message: "agent command 'node' not found (adapter 'fake')" });
  }, 60000);

  it('an adapter missing at HEAD: loadAdapter’s NOT_FOUND', async () => {
    const repo = fixture((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: missing')));
    expect(refusal(await run(repo, { element: TASK_REF, role: 'developer' }))?.code).toBe('NOT_FOUND');
  }, 60000);

  it('NO_RUN_LOG and INVALID_CONTEXT', async () => {
    const noRuns = fixture((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('  runs: [ docs/runs/ ]\n', '')));
    expect(refusal(await run(noRuns, { element: TASK_REF, role: 'developer' }))?.message).toBe('dna.yaml declares no run log (paths.runs)');
    const noRoles = fixture((root) => unlinkSync(join(root, '.wingfoil/roles.yaml')));
    expect(refusal(await run(noRoles, { element: TASK_REF, role: 'developer' }))?.message).toBe("invalid execution context: missing 'directives' section");
  }, 60000);

  it('MCP_UNREACHABLE: the cause is a detail line with no absolute path; the run raised its warnings first', async () => {
    const repo = fixture();
    const outcome = await run(repo, { element: TASK_REF }, { ...HOST, mcpServer: { command: process.execPath, args: [join(repo, 'no-cli.js'), 'mcp'] } });
    const error = refusal(outcome);
    expect(error?.message).toBe('context pre-load failed: MCP server unreachable');
    expect(error?.details?.['issues']).toEqual([{ detail: expect.any(String) }]);
    expect(JSON.stringify(error?.details)).not.toContain(repo);
    expect(outcome.warnings).toEqual(["no --role given and no workflow step to take one from: running as the default role 'developer'"]);
  }, 60000);

  it('NO_TERMINAL with terminal: required; with a terminal it passes to the plan', async () => {
    const repo = fixture((root) => writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: fake-terminal')));
    expect(refusal(await run(repo, { element: TASK_REF, role: 'developer' }))?.message).toBe('interactive launch needs a terminal on stdin and stdout');
    const outcome = await run(repo, { element: TASK_REF, role: 'developer' }, { ...HOST, isTerminal: () => true });
    expect(outcome.result.ok).toBe(true);
  }, 60000);
});

describe('agentExecuteFn — what follows the pre-launch checks in this build', () => {
  it('a dry run returns the launch plan', async () => {
    const repo = fixture();
    const outcome = await run(repo, { element: TASK_REF, role: 'developer' });
    if (!outcome.result.ok) throw new Error(outcome.result.error.message);
    const plan = outcome.result.value as AgentLaunchPlan;
    expect(plan).toMatchObject({
      dryRun: true,
      subject: `agent: record ${TASK_ID}/adhoc/1`,
      paths: [`docs/runs/${TASK_ID}.jsonl`],
      run: { id: `${TASK_ID}/adhoc/1`, agent: 'Fake Agent', adapter: 'custom/fake', state_ref: git(repo, ['rev-parse', 'HEAD']).trim() },
    });
    expect(outcome.warnings).toEqual([]);
  }, 60000);

  it('a real run launches the agent and commits its record (task-228); the banner is a notice', async () => {
    const repo = fixture();
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const outcome = await run(repo, { element: TASK_REF, role: 'developer' }, HOST, true);
    if (!outcome.result.ok) throw new Error(outcome.result.error.message);
    const value = outcome.result.value as { run: Record<string, unknown>; sha: string };
    expect(value.run).toMatchObject({ id: `${TASK_ID}/adhoc/1`, exit_status: 0, model: 'fake-model', state_ref: before });
    expect(value.sha).toBe(git(repo, ['rev-parse', 'HEAD']).trim());
    expect(outcome.notices).toEqual([`run ${TASK_ID}/adhoc/1: launching Fake Agent (custom/fake) as developer on ${TASK_REF}`]);
  }, 60000);

  it.each([
    ['prompt.via: file', (text: string) => text.replace('via: arg', 'via: file').replace(/"\{bootstrap\}"/g, '"{bootstrap_file}"')],
    ['mcp.via: args', (text: string) => text.replace('via: config-file', 'via: args').replace(/--mcp-config, "\{mcp_config_file\}"/g, '--mcp, "{mcp_command}", "{mcp_args}"').replace(/ {2}template: \|\n.*\n/, '')],
  ])('an adapter with %s passes the same checks', async (_label, edit) => {
    const repo = fixture((root) => {
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: variant'));
      writeFixtureFile(root, '.wingfoil/agents/custom/variant.yaml', manifest('variant', edit));
    });
    const outcome = await run(repo, { element: TASK_REF, role: 'developer' });
    expect(outcome.result.ok ? 'ok' : outcome.result.error.message).toBe('ok');
  }, 60000);

  it('a type whose template file is not committed gets the fallback handoff line', async () => {
    const repo = fixture();
    writeFixtureFile(
      repo,
      '.wingfoil/memory.yaml',
      git(repo, ['show', 'HEAD:.wingfoil/memory.yaml']).replace('      file: "memory/templates/task.md"\n', '      file: "memory/templates/absent.md"\n'),
    );
    commitAll(repo, 'a template file that is not committed');
    const outcome = await run(repo, { element: TASK_REF, role: 'developer' });
    if (!outcome.result.ok) throw new Error(outcome.result.error.message);
    expect((outcome.result.value as AgentLaunchPlan).bootstrap).toContain("Record your handoff in the element's body and in your commit messages.");
  }, 60000);
});

describe('agentExecuteFn — review fixes (task-218 review F1, F3)', () => {
  it('a name in both built-in/ and custom/ is refused at step 2, before a missing element', async () => {
    const repo = fixture((root) => writeFixtureFile(root, '.wingfoil/agents/built-in/fake.yaml', manifest('fake')));
    const error = refusal(await run(repo, { element: 'task:task-999-absent', role: 'developer' }));
    expect(error?.code).toBe('VALIDATION');
    expect(error?.message).toMatch(/^adapter 'fake': declared in both \.wingfoil\/agents\/built-in\/fake\.yaml and \.wingfoil\/agents\/custom\/fake\.yaml/);
  }, 60000);

  it('step 8: a dangling binding’s warnings are raised in §5.1 order, before the plan', async () => {
    const repo = fixture((root) =>
      writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer:\n    - testing\n    - zz-absent\n    - aa-absent\nglobal:\n  - doc-versioning\n'),
    );
    const outcome = await run(repo, { element: TASK_REF, role: 'developer' });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.warnings).toEqual([
      "directive 'aa-absent' bound to role 'developer' has no directive file",
      "directive 'zz-absent' bound to role 'developer' has no directive file",
    ]);
  }, 60000);

  it('no surface sets AgentExecuteParams.host: neither buildParams of the CLI nor the MCP registrar names it', () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const src = join(__dirname, '..', '..', 'src');
    for (const file of ['cli.ts', 'cli/registrar.ts', 'mcp/registrar.ts']) expect(readFileSync(join(src, file), 'utf-8')).not.toMatch(/\bhost\b/);
  });
});

describe('agentExecuteFn — the launch half in process (task-228, spec-016 §3.3 steps 13–18)', () => {
  /** Run with the fake's environment variables set for this call only. */
  async function withFakeEnv<T>(env: Record<string, string>, work: () => Promise<T>): Promise<T> {
    const saved = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
    Object.assign(process.env, env);
    try {
      return await work();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }

  it('a lookup that hangs past its limit → not-reported and a warning; the run still succeeds', async () => {
    const repo = fixture();
    const outcome = await withFakeEnv({ WINGFOIL_FAKE_AGENT_LOOKUP: 'hang' }, () =>
      run(repo, { element: TASK_REF, role: 'developer' }, { ...HOST, lookupTimeoutMs: 1500 }, true),
    );
    if (!outcome.result.ok) throw new Error(outcome.result.error.message);
    expect((outcome.result.value as { run: Record<string, unknown> }).run).toMatchObject({ model: 'not-reported', agent_version: 'fake-agent 1.0.0' });
    expect(outcome.warnings).toEqual(["adapter 'fake': the usage lookup failed (timed out after 1500 ms): model and tokens recorded as not-reported"]);
  }, 60000);

  it('session.id: lookup reads session.field from the lookup document; session.id: output is not-reported for an interactive launch', async () => {
    const lookup = fixture((root) => {
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: looked'));
      writeFixtureFile(
        root,
        '.wingfoil/agents/custom/looked.yaml',
        manifest('looked', (text) => text.replace('id: assign', 'id: lookup').replace(/ {2}assign_args: .*\n/, '').replace(/"\{session_id\}"/g, 'fixed-session')),
      );
    });
    const looked = await withFakeEnv({ WINGFOIL_FAKE_AGENT_DOCUMENT: JSON.stringify({ session_id: 'from-lookup', model: 'm-1', usage: { input: 1 } }) }, () =>
      run(lookup, { element: TASK_REF, role: 'developer' }, HOST, true),
    );
    if (!looked.result.ok) throw new Error(looked.result.error.message);
    expect((looked.result.value as { run: Record<string, unknown> }).run).toMatchObject({
      session: 'from-lookup',
      model: 'm-1',
      tokens: { input: 1, output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' },
    });

    const output = fixture((root) => {
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: outed'));
      writeFixtureFile(
        root,
        '.wingfoil/agents/custom/outed.yaml',
        manifest('outed', (text) =>
          text.replace('id: assign', 'id: output').replace(/ {2}assign_args: .*\n/, '').replace(/"\{session_id\}"/g, 'fixed-session').replace('from: lookup', 'from: none'),
        ),
      );
    });
    const outed = await run(output, { element: TASK_REF, role: 'developer' }, HOST, true);
    if (!outed.result.ok) throw new Error(outed.result.error.message);
    expect((outed.result.value as { run: Record<string, unknown> }).run).toMatchObject({ session: 'not-reported', model: 'not-reported' });
  }, 120000);

  it('a lookup document with a value of the wrong type records not-reported and says so', async () => {
    const repo = fixture();
    const outcome = await withFakeEnv({ WINGFOIL_FAKE_AGENT_DOCUMENT: JSON.stringify({ model: 7, usage: { input: -1, output: 2 } }) }, () =>
      run(repo, { element: TASK_REF, role: 'developer' }, HOST, true),
    );
    if (!outcome.result.ok) throw new Error(outcome.result.error.message);
    expect((outcome.result.value as { run: Record<string, unknown> }).run).toMatchObject({
      model: 'not-reported',
      tokens: { input: 'not-reported', output: 2, cache_read: 'not-reported', cache_write: 'not-reported' },
    });
    expect(outcome.warnings).toEqual([
      "adapter 'fake': the usage lookup's model is not a non-empty string: recorded as not-reported",
      "adapter 'fake': the usage lookup's input is not a non-negative integer: recorded as not-reported",
    ]);
  }, 60000);

  it('an agent that cannot be spawned: IO, no record, nothing committed', async () => {
    const repo = fixture();
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const outcome = await run(
      repo,
      { element: TASK_REF, role: 'developer' },
      {
        ...HOST,
        spawn: () => {
          throw new Error('spawn refused');
        },
      },
      true,
    );
    expect(refusal(outcome)).toMatchObject({ code: 'IO', message: "agent command 'node' could not be started (adapter 'fake'): spawn refused" });
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
  }, 60000);

  it('a record that cannot be committed: recordRun\'s refusal, the record in details', async () => {
    const repo = fixture();
    // The agent leaves the run log modified (the fake appends its own record line to it): the record
    // commit refuses (spec-016 §3.7), and the run is not lost. An empty directory is invisible to git.
    mkdirSync(join(repo, 'docs/runs'), { recursive: true });
    const outcome = await withFakeEnv({ WINGFOIL_FAKE_AGENT_RECORD: join(repo, `docs/runs/${TASK_ID}.jsonl`) }, () =>
      run(repo, { element: TASK_REF, role: 'developer' }, HOST, true),
    );
    const error = refusal(outcome);
    expect(error).toMatchObject({ code: 'CONFLICT', message: `run log docs/runs/${TASK_ID}.jsonl has uncommitted changes` });
    expect(error?.details?.['run_id']).toBe(`${TASK_ID}/adhoc/1`);
  }, 60000);
});
