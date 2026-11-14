/**
 * task-218 — the pure and near-pure parts of `agent execute`'s pre-launch half (`spec-016` §2.4, §2.5,
 * §2.3's temporary files, §3.2 step 4, §3.3 steps 4, 11 and 12), unit by unit. The pipeline as a user
 * meets it is `test/cli/agent-execute.integration.test.ts`.
 *
 * task-338 AC 1 and AC 3 (`spec-016` §2.4 as amended, `dl-180` (c), `bug-369`, `bug-370`): the bootstrap is a
 * function of the launching build's signature too, and carries `{cli_line}` and `spec-018` Consequences'
 * `{attribution_line}`; `cliShim` writes the POSIX `wingfoil` script and the win32 `wingfoil.cmd` (its text only,
 * design D5); `runningBuildCli` names the build that runs `agent execute`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

import {
  agentCommandFound,
  cliShim,
  handoffLine,
  mcpPreflight,
  renderBootstrap,
  renderMcpTemplate,
  runningBuildCli,
  runningBuildMcpServer,
  selectAgent,
  withRunFiles,
} from '../../src/agent';
import type { DnaYaml } from '../../src/dna';
import { CLI_ENTRY, DIST_DIR } from '../cli/helpers/spawn-cli';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const REPO_ROOT = join(__dirname, '..', '..');

describe('renderBootstrap (§2.4) — a pure function of (role, element, run id, state_ref, signing entry, build)', () => {
  const BUILD = '9.9.9 (0123abc)';

  it('task-338 AC 1, AC 3 — the fixed six-line template, LF-terminated: context instruction, CLI line, handoff line, attribution line', () => {
    const text = renderBootstrap({
      role: 'developer',
      element: 'task:task-001-a',
      runId: 'task-001-a/adhoc/1',
      stateRef: SHA,
      handoff: handoffLine(true),
      agent: { name: 'Fake Agent', email: 'fake-agent@example.com' },
      build: BUILD,
    });
    expect(text).toBe(
      [
        'WingFoil run task-001-a/adhoc/1: act as role "developer" on element task:task-001-a.',
        `Your context is assembled at commit ${SHA} and served by the "wingfoil" MCP server`,
        `registered for this session. Load it before any other action: Read the MCP resource "wingfoil://session/developer/task:task-001-a/${SHA}".`,
        'Run WingFoil commands as "wingfoil <command>": the build that launched you is first on your PATH, and "wingfoil --version" prints "9.9.9 (0123abc)"; if it prints anything else, run "$WINGFOIL_CLI" in place of "wingfoil".',
        'Record your handoff in the element\'s "## Execution Notes" section.',
        'Commits wingfoil writes for you already end with "Co-Authored-By: Fake Agent <fake-agent@example.com>" and an "AI-Model:" trailer: pass --ai-model <your model identifier> to each wingfoil command that writes a commit, or that trailer records "AI-Model: not-reported"; end a commit you write yourself with git commit with the trailer paragraph "Co-Authored-By: Fake Agent <fake-agent@example.com>" and "AI-Model: <your model identifier>"; never run memory approve, memory reject or memory amend, which refuse in your session (git-conventions §7).',
        '',
      ].join('\n'),
    );
  });

  it('task-338 AC 3 — no longer asks the agent to type its model into an amend (bug-370)', () => {
    const text = renderBootstrap({
      role: 'developer',
      element: 'task:task-001-a',
      runId: 'task-001-a/adhoc/1',
      stateRef: SHA,
      handoff: handoffLine(true),
      agent: { name: 'Fake Agent', email: 'fake-agent@example.com' },
      build: BUILD,
    });
    expect(text).not.toContain('<the model identifier you run as>');
    expect(text).not.toContain('--amend');
  });

  it('task-338 AC 1 — another build is named in its own CLI line; no host path enters the bootstrap', () => {
    const input = { role: 'qa', element: 'bug:bug-1', runId: 'bug-1/adhoc/2', stateRef: SHA, handoff: handoffLine(false), agent: { name: 'A', email: 'a@users.noreply.github.com' } };
    const text = renderBootstrap({ ...input, build: '1.2.3 (fedcba9)' });
    expect(text.split('\n')[3]).toBe(
      'Run WingFoil commands as "wingfoil <command>": the build that launched you is first on your PATH, and "wingfoil --version" prints "1.2.3 (fedcba9)"; if it prints anything else, run "$WINGFOIL_CLI" in place of "wingfoil".',
    );
    expect(text).not.toContain(process.execPath);
    expect(text).not.toContain(REPO_ROOT);
  });

  it('the same inputs render the same bytes', () => {
    const input = { role: 'qa', element: 'bug:bug-1', runId: 'bug-1/adhoc/2', stateRef: SHA, handoff: handoffLine(false), agent: { name: 'A', email: 'a@example.com' }, build: BUILD };
    expect(renderBootstrap(input)).toBe(renderBootstrap({ ...input }));
  });
});

describe('task-338 AC 1 — cliShim: the wingfoil shim of the launching build (spec-016 §2.4, design D1, D5)', () => {
  const cli = { command: '/opt/node/bin/node', args: ['/opt/wf/dist/cli.js'] };

  it('POSIX: named wingfoil, a /bin/sh script that execs the Node executable and cli.js with its arguments, single-quoted', () => {
    const shim = cliShim(cli, 'linux');
    expect(shim.name).toBe('wingfoil');
    const lines = shim.text.split('\n');
    expect(lines[0]).toBe('#!/bin/sh');
    expect(lines).toContain(`exec '/opt/node/bin/node' '/opt/wf/dist/cli.js' "$@"`);
    expect(shim.text.endsWith('\n')).toBe(true);
    expect(shim.text).not.toContain('\r');
  });

  it("POSIX: a quote in a path is written '\\''", () => {
    const shim = cliShim({ command: "/opt/it's/node", args: ["/a b/o'k/cli.js"] }, 'darwin');
    expect(shim.text.split('\n')).toContain(`exec '/opt/it'\\''s/node' '/a b/o'\\''k/cli.js' "$@"`);
  });

  it('POSIX: the script runs that build with every argument intact, through sh, no other shell expansion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-cli-shim-'));
    try {
      // A stand-in "cli.js" in a path with a quote and a space, which prints the arguments it receives.
      const fakeCli = join(dir, "o'k dir", 'cli.js');
      mkdirSync(dirname(fakeCli));
      writeFileSync(fakeCli, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
      const shim = cliShim({ command: process.execPath, args: [fakeCli] }, 'linux');
      const file = join(dir, shim.name);
      writeFileSync(file, shim.text, { mode: 0o700 });
      const out = execFileSync('sh', [file, '--version', 'a b', '$HOME', "q'uote"], { encoding: 'utf-8' });
      expect(JSON.parse(out)).toEqual(['--version', 'a b', '$HOME', "q'uote"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('win32: named wingfoil.cmd, one CRLF line running the Node executable and cli.js with %*', () => {
    const shim = cliShim({ command: 'C:\\Program Files\\nodejs\\node.exe', args: ['C:\\wf\\dist\\cli.js'] }, 'win32');
    expect(shim.name).toBe('wingfoil.cmd');
    expect(shim.text).toBe('@"C:\\Program Files\\nodejs\\node.exe" "C:\\wf\\dist\\cli.js" %*\r\n');
  });
});

describe('task-338 AC 1 — runningBuildCli: the build that runs agent execute (spec-016 §2.4)', () => {
  it('from the compiled build: the Node executable and [<dist>/cli.js]', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dist = require(join(DIST_DIR, 'agent')) as { runningBuildCli: typeof runningBuildCli };
    expect(dist.runningBuildCli()).toEqual({ command: process.execPath, args: [CLI_ENTRY] });
  });

  it('from the sources: the Node executable and this tree\'s cli entry beside the module', () => {
    const cli = runningBuildCli();
    expect(cli.command).toBe(process.execPath);
    expect(cli.args).toHaveLength(1);
    expect(cli.args[0]!.endsWith(`${sep}cli.js`)).toBe(true);
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
    const rendered = renderMcpTemplate(template, { command: '/opt/node "v22"/bin/node', args: ['/a\\b/cli.js', 'mcp'] });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(JSON.parse(rendered.value)).toEqual({ mcpServers: { wingfoil: { command: '/opt/node "v22"/bin/node', args: ['/a\\b/cli.js', 'mcp'] } } });
  });

  it('leaves braces that are not a placeholder alone', () => {
    expect(renderMcpTemplate('{"a": {}} {mcp_command}', { command: 'node', args: [] })).toEqual({ ok: true, value: '{"a": {}} node' });
  });
});

describe('task-355 AC 3 — renderMcpTemplate escapes U+007F and refuses an unpaired surrogate (bug-371, spec-016 §2.3, §3.7)', () => {
  const DEL = String.fromCharCode(0x7f);

  it('U+007F in the command is written as the escape \\u007f, never raw', () => {
    const rendered = renderMcpTemplate('x="{mcp_command}"', { command: '/a\u007fb/node', args: [] });
    expect(rendered).toEqual({ ok: true, value: 'x="/a\\u007fb/node"' });
    expect(JSON.stringify(rendered).includes(DEL)).toBe(false);
  });

  it('U+007F in an argument is written as the escape \\u007f, never raw', () => {
    const rendered = renderMcpTemplate('{mcp_args}', { command: 'node', args: ['/a\u007fb', 'mcp'] });
    expect(rendered).toEqual({ ok: true, value: '["/a\\u007fb","mcp"]' });
    expect(JSON.stringify(rendered).includes(DEL)).toBe(false);
  });

  it("an unpaired high surrogate in the command: VALIDATION naming the command and the code point", () => {
    expect(renderMcpTemplate('x="{mcp_command}"', { command: '/a\ud800b', args: [] })).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: "mcp.template cannot carry the MCP server's command: it holds an unpaired surrogate (U+D800)" },
    });
  });

  it('an unpaired low surrogate in an argument: VALIDATION naming the argument, from 1', () => {
    expect(renderMcpTemplate('{mcp_args}', { command: 'node', args: ['/x\udc00', 'mcp'] })).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: "mcp.template cannot carry the MCP server's argument 1: it holds an unpaired surrogate (U+DC00)" },
    });
  });

  it('a low surrogate before a high one pairs with nothing: the first is named', () => {
    expect(renderMcpTemplate('x="{mcp_command}"', { command: '\udc00\ud800', args: [] })).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: "mcp.template cannot carry the MCP server's command: it holds an unpaired surrogate (U+DC00)" },
    });
  });

  it('a paired surrogate (U+1F600) is accepted and written raw', () => {
    expect(renderMcpTemplate('x="{mcp_command}"', { command: '/a\u{1F600}b', args: [] })).toEqual({ ok: true, value: 'x="/a\u{1F600}b"' });
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

// task-350 AC 5 (design D2 (a), `spec-016` §2.5 amended): the registered server names the root `agent execute`
// resolved, so it serves that root whatever working directory the agent CLI starts it in.
describe('runningBuildMcpServer (§2.5) — the build that runs agent execute, serving the root it resolved', () => {
  const ROOT = '/fixture/project-root';

  it('from the compiled build: the Node executable and [<dist>/cli.js, "--project", <root>, "mcp"]', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dist = require(join(DIST_DIR, 'agent')) as { runningBuildMcpServer: typeof runningBuildMcpServer };
    expect(dist.runningBuildMcpServer(ROOT)).toEqual({ command: process.execPath, args: [CLI_ENTRY, '--project', ROOT, 'mcp'] });
  });

  it('from the sources it names this tree’s cli entry beside the module, then --project <root> mcp (no build: the pre-flight then fails as unreachable)', () => {
    const server = runningBuildMcpServer(ROOT);
    expect(server.command).toBe(process.execPath);
    expect(server.args.slice(1)).toEqual(['--project', ROOT, 'mcp']);
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

describe('mcpPreflight — a server that answers the session Resource with no text is unreachable (§3.3 step 11)', () => {
  it('task-355 AC 4 — an empty contents list: MCP_UNREACHABLE naming the empty session resource', async () => {
    const root = makeTempGitRepo();
    try {
      // A minimal stdio MCP server: initialize, then an empty contents list for any resources/read.
      writeFixtureFile(
        root,
        'stub-server.cjs',
        [
          "const rl = require('readline').createInterface({ input: process.stdin });",
          "const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');",
          "rl.on('line', (line) => {",
          '  const m = JSON.parse(line);',
          "  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { resources: {} }, serverInfo: { name: 'stub', version: '1' } } });",
          "  else if (m.method === 'resources/read') send({ id: m.id, result: { contents: [] } });",
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
      expect(result.error.details?.['cause']).toBe(`the session resource wingfoil://session/developer/task:task-001-a/${SHA} returned no context text`);
    } finally {
      removeTempDir(root);
    }
  }, 30000);
});

describe('task-355 AC 4 — the pre-flight reads only the session Resource the bootstrap names (bug-376, spec-016 §3.3 step 11)', () => {
  it('a server that serves the Resource and refuses prompts/get: ok, and prompts/get is never asked', async () => {
    const root = makeTempGitRepo();
    try {
      // A stdio MCP server that answers initialize and resources/read, refuses prompts/get with -32601, and
      // appends the method of every message it receives to methods.log.
      writeFixtureFile(
        root,
        'resource-server.cjs',
        [
          "const { appendFileSync } = require('fs');",
          "const log = require('path').join(__dirname, 'methods.log');",
          "const rl = require('readline').createInterface({ input: process.stdin });",
          "const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');",
          "rl.on('line', (line) => {",
          '  const m = JSON.parse(line);',
          "  appendFileSync(log, m.method + '\\n');",
          "  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { resources: {} }, serverInfo: { name: 'resource-only', version: '1' } } });",
          "  else if (m.method === 'resources/read') send({ id: m.id, result: { contents: [{ uri: m.params.uri, mimeType: 'text/markdown', text: 'context' }] } });",
          "  else if (m.method === 'prompts/get') send({ id: m.id, error: { code: -32601, message: 'Method not found' } });",
          '});',
          '',
        ].join('\n'),
      );
      const result = await mcpPreflight({
        root,
        server: { command: process.execPath, args: [join(root, 'resource-server.cjs')] },
        role: 'developer',
        element: 'task:task-001-a',
        stateRef: SHA,
        timeoutMs: 20000,
      });
      expect(result).toEqual({ ok: true, value: undefined });
      const methods = readFileSync(join(root, 'methods.log'), 'utf-8').split('\n').filter((line) => line !== '');
      expect(methods).not.toContain('prompts/get');
      expect(methods).toContain('resources/read');
    } finally {
      removeTempDir(root);
    }
  }, 30000);
});

describe('task-228 — the B3 handovers on the pre-launch half', () => {
  it('the MCP pre-flight has one deadline: initialize and the session Resource read share it (REQ-PERF-01; task-355 AC 4)', async () => {
    const root = makeTempGitRepo();
    try {
      // A stub that takes 1.5 s to answer initialize and 1.5 s to answer the Resource read: each answer is
      // within a 2.5 s limit, both together are not.
      writeFixtureFile(
        root,
        'slow-server.cjs',
        [
          "const rl = require('readline').createInterface({ input: process.stdin });",
          "const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');",
          "const later = (f) => setTimeout(f, 1500);",
          "rl.on('line', (line) => {",
          '  const m = JSON.parse(line);',
          "  if (m.method === 'initialize') later(() => send({ id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { resources: {} }, serverInfo: { name: 'slow', version: '1' } } }));",
          "  else if (m.method === 'resources/read') later(() => send({ id: m.id, result: { contents: [{ uri: m.params.uri, mimeType: 'text/markdown', text: 'context' }] } }));",
          '});',
          '',
        ].join('\n'),
      );
      const result = await mcpPreflight({
        root,
        server: { command: process.execPath, args: [join(root, 'slow-server.cjs')] },
        role: 'developer',
        element: 'task:task-001-a',
        stateRef: SHA,
        timeoutMs: 2500,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe('context pre-load failed: MCP server unreachable');
    } finally {
      removeTempDir(root);
    }
  }, 30000);

  it.each([['SIGINT'], ['SIGTERM'], ['SIGHUP']])('%s before the spawn removes the temporary directory and ends the process by that signal', (signal) => {
    // A child that holds withRunFiles open on the compiled module, prints its directory, and waits.
    const script = [
      `const { withRunFiles } = require(${JSON.stringify(join(DIST_DIR, 'agent'))});`,
      "withRunFiles({ bootstrap_file: 'x' }, async (paths) => {",
      "  process.stdout.write(require('path').dirname(paths.bootstrap_file) + '\\n');",
      '  await new Promise(() => setInterval(() => undefined, 60000));',
      '});',
    ].join('\n');
    const out = execFileSync(
      process.execPath,
      [
        '-e',
        [
          "const { spawn } = require('child_process');",
          `const child = spawn(process.execPath, ['-e', ${JSON.stringify(script)}], { stdio: ['ignore', 'pipe', 'inherit'] });`,
          "let dir = '';",
          "child.stdout.on('data', (chunk) => { dir += chunk; if (dir.endsWith('\\n')) child.kill(" + JSON.stringify(signal) + '); });',
          "child.on('close', (code, sig) => { process.stdout.write(JSON.stringify({ dir: dir.trim(), code, sig, exists: require('fs').existsSync(dir.trim()) })); });",
        ].join('\n'),
      ],
      { encoding: 'utf-8' },
    );
    const { dir, code, sig, exists } = JSON.parse(out) as { dir: string; code: number | null; sig: string | null; exists: boolean };
    expect(dir).toMatch(/wingfoil-run-/);
    expect(exists).toBe(false);
    expect({ code, sig }).toEqual({ code: null, sig: signal });
  }, 30000);
});

describe('withRunFiles — signals (review fix 1)', () => {
  it('its cleanup listeners are installed before the temporary directory is created', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const baseline = process.listenerCount('SIGINT');
    let atCreate = -1;
    const original = fs.mkdtempSync;
    const spy = jest.spyOn(fs, 'mkdtempSync').mockImplementation(((prefix: string) => {
      atCreate = process.listenerCount('SIGINT');
      return original(prefix);
    }) as typeof fs.mkdtempSync);
    try {
      await withRunFiles({ bootstrap_file: 'x' }, async () => undefined);
    } finally {
      spy.mockRestore();
    }
    expect(atCreate).toBe(baseline + 1);
    expect(process.listenerCount('SIGINT')).toBe(baseline);
  });

  it('a signal before the spawn removes the directory and re-raises it on this process', async () => {
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    let dir = '';
    let existedAfterSignal = true;
    let calls: unknown[][] | undefined;
    try {
      await withRunFiles({ bootstrap_file: 'x' }, async (paths) => {
        dir = dirname(paths.bootstrap_file!);
        process.emit('SIGTERM', 'SIGTERM');
        existedAfterSignal = existsSync(dir);
      });
      calls = kill.mock.calls;
    } finally {
      kill.mockRestore();
    }
    // Removed by the signal handler itself, before the work settled.
    expect(existedAfterSignal).toBe(false);
    expect(calls).toEqual([[process.pid, 'SIGTERM']]);
  });
});

describe('withRunFiles — signals around the directory\'s creation (re-review 4)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  const counts = (): number[] => SIGNALS.map((signal) => process.listenerCount(signal));

  it('a mkdtempSync that throws: the error is rethrown and the listeners are removed', async () => {
    const before = counts();
    const spy = jest.spyOn(fs, 'mkdtempSync').mockImplementation(() => {
      throw new Error('EACCES fake');
    });
    try {
      await expect(withRunFiles({ bootstrap_file: 'x' }, async () => 'ran')).rejects.toThrow('EACCES fake');
    } finally {
      spy.mockRestore();
    }
    expect(counts()).toEqual(before);
  });

  it('a signal before the directory exists re-raises it with nothing to remove, and nothing is left', async () => {
    const original = fs.mkdtempSync;
    const spy = jest.spyOn(fs, 'mkdtempSync').mockImplementation(((prefix: string) => {
      process.emit('SIGTERM', 'SIGTERM');
      return original(prefix);
    }) as typeof fs.mkdtempSync);
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    let dir = '';
    let calls: unknown[][] | undefined;
    try {
      await withRunFiles({ bootstrap_file: 'x' }, async (paths) => {
        dir = dirname(paths.bootstrap_file!);
      });
      calls = kill.mock.calls;
    } finally {
      kill.mockRestore();
      spy.mockRestore();
    }
    expect(calls).toEqual([[process.pid, 'SIGTERM']]);
    expect(existsSync(dir)).toBe(false);
  });
});
