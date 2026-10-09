/**
 * task-218 — the pure and near-pure parts of `agent execute`'s pre-launch half (`spec-016` §2.4, §2.5,
 * §2.3's temporary files, §3.2 step 4, §3.3 steps 4, 11 and 12), unit by unit. The pipeline as a user
 * meets it is `test/cli/agent-execute.integration.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

import {
  agentCommandFound,
  handoffLine,
  mcpPreflight,
  renderBootstrap,
  renderMcpTemplate,
  runningBuildMcpServer,
  selectAgent,
  withRunFiles,
} from '../../src/agent';
import type { DnaYaml } from '../../src/dna';
import { CLI_ENTRY, DIST_DIR } from '../cli/helpers/spawn-cli';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const REPO_ROOT = join(__dirname, '..', '..');

describe('renderBootstrap (§2.4) — a pure function of (role, element, run id, state_ref)', () => {
  it('is the fixed template, LF-terminated, with the context instruction and the handoff line', () => {
    const text = renderBootstrap({
      role: 'developer',
      element: 'task:task-001-a',
      runId: 'task-001-a/adhoc/1',
      stateRef: SHA,
      handoff: handoffLine(true),
    });
    expect(text).toBe(
      [
        'WingFoil run task-001-a/adhoc/1: act as role "developer" on element task:task-001-a.',
        `Your context is assembled at commit ${SHA} and served by the "wingfoil" MCP server`,
        `registered for this session. Load it before any other action: Get the MCP prompt "developer-session" with arguments element="task:task-001-a" and state="${SHA}".`,
        'Record your handoff in the element\'s "## Execution Notes" section.',
        '',
      ].join('\n'),
    );
  });

  it('the same inputs render the same bytes', () => {
    const input = { role: 'qa', element: 'bug:bug-1', runId: 'bug-1/adhoc/2', stateRef: SHA, handoff: handoffLine(false) };
    expect(renderBootstrap(input)).toBe(renderBootstrap({ ...input }));
  });
});

describe('handoffLine (§2.4) — chosen by the type template’s `## Execution Notes` heading', () => {
  it('the section line when the template has the heading, the fallback otherwise', () => {
    expect(handoffLine(true)).toBe('Record your handoff in the element\'s "## Execution Notes" section.');
    expect(handoffLine(false)).toBe("Record your handoff in the element's body and in your commit messages.");
  });
});

describe('renderMcpTemplate (§2.3) — {mcp_command} and {mcp_args} in mcp.template', () => {
  it('fills the command as JSON string content and the args as a JSON array', () => {
    const template = '{"mcpServers": {"wingfoil": {"command": "{mcp_command}", "args": {mcp_args}}}}\n';
    const text = renderMcpTemplate(template, { command: '/opt/node "v22"/bin/node', args: ['/a\\b/cli.js', 'mcp'] });
    expect(JSON.parse(text)).toEqual({ mcpServers: { wingfoil: { command: '/opt/node "v22"/bin/node', args: ['/a\\b/cli.js', 'mcp'] } } });
  });

  it('leaves braces that are not a placeholder alone', () => {
    expect(renderMcpTemplate('{"a": {}} {mcp_command}', { command: 'node', args: [] })).toBe('{"a": {}} node');
  });
});

describe('withRunFiles (§2.3) — the temporary files live in the OS temporary directory and are removed on every exit path', () => {
  // `os.tmpdir()` as the module sees it: the process's own temporary directory, never the repository.
  const base = realpathSync(tmpdir());

  it('writes each file under the temporary directory, hands their paths over, and removes them when the work resolves', async () => {
    let seen: Record<string, string> = {};
    const value = await withRunFiles({ bootstrap_file: 'hello\n', mcp_config_file: '{}\n' }, async (paths) => {
      seen = { ...paths };
      for (const path of Object.values(paths)) {
        expect(existsSync(path)).toBe(true);
        expect(realpathSync(path).startsWith(`${base}${sep}`)).toBe(true);
        expect(relative(REPO_ROOT, realpathSync(path)).startsWith('..')).toBe(true);
      }
      return 42;
    });
    expect(value).toBe(42);
    expect(Object.keys(seen).sort()).toEqual(['bootstrap_file', 'mcp_config_file']);
    for (const path of Object.values(seen)) expect(existsSync(dirname(path))).toBe(false);
  });

  it('removes them when the work throws, and rethrows', async () => {
    let seen = '';
    await expect(
      withRunFiles({ mcp_config_file: '{}' }, async (paths) => {
        seen = paths.mcp_config_file!;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(seen).not.toBe('');
    expect(existsSync(dirname(seen))).toBe(false);
  });

  it('their contents are the rendered texts; a file not asked for is not written', async () => {
    await withRunFiles({ bootstrap_file: 'line\n' }, async (paths) => {
      expect(readFileSync(paths.bootstrap_file!, 'utf-8')).toBe('line\n');
      expect(paths.mcp_config_file).toBeUndefined();
      expect(readdirSync(dirname(paths.bootstrap_file!))).toEqual(['bootstrap.txt']);
    });
  });
});

describe('runningBuildMcpServer (§2.5) — the build that runs agent execute', () => {
  it('from the compiled build: the Node executable and [<dist>/cli.js, "mcp"]', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dist = require(join(DIST_DIR, 'agent')) as { runningBuildMcpServer: typeof runningBuildMcpServer };
    expect(dist.runningBuildMcpServer()).toEqual({ command: process.execPath, args: [CLI_ENTRY, 'mcp'] });
  });

  it('from the sources it names this tree’s cli entry beside the module (no build: the pre-flight then fails as unreachable)', () => {
    const server = runningBuildMcpServer();
    expect(server.command).toBe(process.execPath);
    expect(server.args[1]).toBe('mcp');
  });
});

describe('agentCommandFound (§3.3 step 4) — PATH, or a path relative to the project root, never a shell', () => {
  let root: string;
  beforeAll(() => {
    root = makeTempGitRepo();
  });
  afterAll(() => removeTempDir(root));

  it('a name on PATH is found; one that is not, is not', () => {
    expect(agentCommandFound(root, 'node', process.env.PATH)).toBe(true);
    expect(agentCommandFound(root, 'wingfoil-no-such-agent-cli', process.env.PATH)).toBe(false);
  });

  it('an empty or absent PATH finds no name', () => {
    expect(agentCommandFound(root, 'node', undefined)).toBe(false);
    expect(agentCommandFound(root, 'node', '')).toBe(false);
  });

  it('a path with a separator is resolved against the project root and must be an executable file', () => {
    writeFixtureFile(root, 'bin/plain.txt', 'text');
    expect(agentCommandFound(root, 'bin/plain.txt', process.env.PATH)).toBe(false);
    expect(agentCommandFound(root, 'bin/absent', process.env.PATH)).toBe(false);
    expect(agentCommandFound(root, 'bin', process.env.PATH)).toBe(false);
    expect(agentCommandFound(root, process.execPath, undefined)).toBe(true);
  });
});

const team = (agents: unknown[]): DnaYaml =>
  ({ team: { roles: [{ name: 'developer' }, { name: 'qa' }], agents } }) as unknown as DnaYaml;

describe('selectAgent (§3.2 step 4)', () => {
  const fake = { name: 'Fake', email: 'fake@example.com', executes_as: ['developer'], adapter: 'fake' };
  const plain = { name: 'Plain', email: 'plain@example.com', executes_as: ['developer', 'qa'] };
  const second = { name: 'Second', email: 'second@example.com', executes_as: ['developer', 'qa'], adapter: 'other' };

  it('without --agent: the first agent, in declared order, with an adapter that executes the role', () => {
    const picked = selectAgent(team([plain, fake, second]), 'developer', undefined);
    expect(picked.ok && picked.value.name).toBe('Fake');
    const qa = selectAgent(team([plain, fake, second]), 'qa', undefined);
    expect(qa.ok && qa.value.name).toBe('Second');
  });

  it('NO_AGENT when none has both', () => {
    expect(selectAgent(team([plain, fake]), 'qa', undefined)).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: "no agent in dna.yaml with an adapter executes as role 'qa'" },
    });
    expect(selectAgent(team([]), 'qa', undefined).ok).toBe(false);
    expect(selectAgent({ team: { roles: [] } } as unknown as DnaYaml, 'qa', undefined).ok).toBe(false);
  });

  it('with --agent: unknown, lacking the role, declaring no adapter, or selected', () => {
    const dna = team([plain, fake]);
    expect(selectAgent(dna, 'developer', 'Ghost')).toEqual({ ok: false, error: { code: 'VALIDATION', message: "unknown agent 'Ghost'" } });
    expect(selectAgent(dna, 'qa', 'Fake')).toEqual({ ok: false, error: { code: 'VALIDATION', message: "agent 'Fake' does not execute as role 'qa'" } });
    expect(selectAgent(dna, 'qa', 'Plain')).toEqual({ ok: false, error: { code: 'VALIDATION', message: "agent 'Plain' declares no adapter" } });
    const picked = selectAgent(dna, 'developer', 'Fake');
    expect(picked.ok && picked.value).toEqual(fake);
  });
});

describe('mcpPreflight (§3.3 step 11) — any failure is MCP_UNREACHABLE', () => {
  it('a server that cannot start: the P5.4.3 sc. 3 message, the cause as a detail with no absolute project path', async () => {
    const root = makeTempGitRepo();
    try {
      const result = await mcpPreflight({
        root,
        server: { command: process.execPath, args: [join(root, 'no-such-cli.js'), 'mcp'] },
        role: 'developer',
        element: 'task:task-001-a',
        stateRef: SHA,
        timeoutMs: 20000,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('IO');
      expect(result.error.message).toBe('context pre-load failed: MCP server unreachable');
      expect(JSON.stringify(result.error.details)).not.toContain(root);
    } finally {
      removeTempDir(root);
    }
  }, 30000);

  it('a server that answers the Prompt: ok', async () => {
    const root = makeTempGitRepo();
    try {
      writeFixtureFile(root, '.wingfoil/dna.yaml', 'version: 1\nmodules: []\nstacks:\n  technologies: []\nteam:\n  members: []\n  roles:\n    - name: developer\npaths: {}\n');
      writeFixtureFile(root, '.wingfoil/memory.yaml', 'version: 1\ntypes:\n  task:\n    path: "docs/tasks/{id}.md"\n');
      writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments: {}\nglobal: []\n');
      writeFixtureFile(root, 'docs/tasks/task-001-a.md', '---\nid: task-001-a\ntype: task\ntitle: "a"\nstatus: draft\n---\n\nBody.\n');
      commitAll(root, 'seed');
      const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
      const result = await mcpPreflight({
        root,
        server: runningBuildFromDist(),
        role: 'developer',
        element: 'task:task-001-a',
        stateRef: sha,
        timeoutMs: 30000,
      });
      expect(result).toEqual({ ok: true, value: undefined });
    } finally {
      removeTempDir(root);
    }
  }, 60000);
});

/** The compiled build's server, as `runningBuildMcpServer` computes it from `dist/`. */
function runningBuildFromDist(): { command: string; args: string[] } {
  return { command: process.execPath, args: [CLI_ENTRY, 'mcp'] };
}

describe('mcpPreflight — a server that answers the Prompt with no text is unreachable (§3.3 step 11)', () => {
  it('an empty messages list: MCP_UNREACHABLE naming the empty prompt', async () => {
    const root = makeTempGitRepo();
    try {
      // A minimal stdio MCP server: initialize, then an empty prompt for any prompts/get.
      writeFixtureFile(
        root,
        'stub-server.cjs',
        [
          "const rl = require('readline').createInterface({ input: process.stdin });",
          "const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');",
          "rl.on('line', (line) => {",
          '  const m = JSON.parse(line);',
          "  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { prompts: {} }, serverInfo: { name: 'stub', version: '1' } } });",
          "  else if (m.method === 'prompts/get') send({ id: m.id, result: { messages: [] } });",
          '});',
          '',
        ].join('\n'),
      );
      const result = await mcpPreflight({
        root,
        server: { command: process.execPath, args: [join(root, 'stub-server.cjs')] },
        role: 'developer',
        element: 'task:task-001-a',
        stateRef: SHA,
        timeoutMs: 20000,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('context pre-load failed: MCP server unreachable');
      expect(result.error.details?.['cause']).toBe('the developer-session prompt returned no context text');
    } finally {
      removeTempDir(root);
    }
  }, 30000);
});
