/**
 * task-200 — the fake agent and its custom adapters (`spec-016-agent-execution` §2.7, `adr-012`
 * point 6): what lets every `agent execute` path run under Jest and CI with no real agent and no
 * terminal.
 *
 * - AC 1: `custom/fake.yaml` passes task-177's validation and declares every §2.2 field — asserted by
 *   walking the schema's keys against the fixture; `custom/fake-terminal.yaml` is the same adapter with
 *   `terminal: required`.
 * - AC 2: driven directly (no `agent execute`) through a rendered MCP config pointing at
 *   `node dist/cli.js mcp`, the fake completes `initialize` and the `{role}-session` Prompt fetch with
 *   `element`/`state`, and the Prompt text it records equals task-176's payload for that triple.
 * - AC 3: the record holds environment variable NAMES, never values (`REQ-SEC-08`); no fixture file
 *   holds a secret-shaped literal (`security-secrets` S1, `dl-122`).
 * - AC 4: no suite needs a pseudo-terminal.
 * - The rest of §2.7's script: `--version`, the declared JSON document (`--lookup`, a headless launch),
 *   a declared exit code, waiting for a signal, stdin.
 */
import { spawn, spawnSync } from 'child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { load } from 'js-yaml';
import { z } from 'zod';

import { AdapterManifest, loadAdapter, parseAdapterManifest, type AdapterManifest as Manifest } from '../../src/agent';
import { assembleExecutionContext } from '../../src/core';
import { scanText } from '../../src/validation/secret-scan';
import { CLI_ENTRY } from '../cli/helpers/spawn-cli';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const AGENTS_FIXTURES = join(REPO_ROOT, 'test', 'fixtures', 'agents');
const FAKE_SCRIPT = join(AGENTS_FIXTURES, 'fake-agent.cjs');
/** The script's path as the manifests name it: repository-relative, resolved against the agent's cwd. */
const FAKE_SCRIPT_REL = 'test/fixtures/agents/fake-agent.cjs';
const FAKE_YAML = join(AGENTS_FIXTURES, 'custom', 'fake.yaml');
const FAKE_TERMINAL_YAML = join(AGENTS_FIXTURES, 'custom', 'fake-terminal.yaml');

type Raw = Record<string, unknown>;

/** One line the fake appends to its record file. */
interface RecordEntry {
  readonly argv: string[];
  readonly stdin: string | null;
  readonly env: string[];
  readonly mcp: {
    readonly server?: { readonly name: string };
    readonly prompt?: { readonly name: string; readonly arguments: Record<string, string> };
    readonly text?: string | null;
    readonly warnings?: string[];
    readonly error?: { readonly code: number; readonly message: string };
  } | null;
  readonly failure?: string;
}

const scratch: string[] = [];

/** A fresh scratch directory outside any repository, removed after the suite. */
function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-fake-agent-'));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** The parsed records of `file`, one per invocation, in order. */
function records(file: string): RecordEntry[] {
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as RecordEntry);
}

/** Run the fake once with `args` and the extra `env`; its status, both streams, and its records. */
function runFake(args: readonly string[], env: Record<string, string> = {}, options: { cwd?: string; input?: string } = {}) {
  const recordFile = join(scratchDir(), 'record.jsonl');
  const run = spawnSync('node', [FAKE_SCRIPT, ...args], {
    cwd: options.cwd,
    encoding: 'utf-8',
    input: options.input,
    env: { ...process.env, WINGFOIL_FAKE_AGENT_RECORD: recordFile, ...env },
  });
  if (run.error) throw run.error;
  return { status: run.status, signal: run.signal, stdout: run.stdout, stderr: run.stderr, records: records(recordFile) };
}

/**
 * Every leaf key path of a Zod object schema, wrappers (`optional`, `default`) looked through:
 * `name`, `launch.interactive.args`, `usage.fields.model`, … An array is a leaf.
 */
function leafPaths(schema: z.ZodType, prefix = ''): string[] {
  let node: z.ZodType = schema;
  while (node instanceof z.ZodOptional || node instanceof z.ZodDefault) node = node.unwrap() as z.ZodType;
  if (!(node instanceof z.ZodObject)) return [prefix];
  return Object.entries(node.shape as Record<string, z.ZodType>).flatMap(([key, child]) =>
    leafPaths(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** The value at a dotted `path` of `raw`, or `undefined`. */
function at(raw: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value !== null && typeof value === 'object' ? (value as Raw)[key] : undefined), raw);
}

describe('AC 1 — custom/fake.yaml declares every §2.2 field and validates', () => {
  const raw = load(readFileSync(FAKE_YAML, 'utf-8')) as Raw;

  it('the schema walk finds the §2.2 fields (a guard on the walk itself)', () => {
    const paths = leafPaths(AdapterManifest);
    expect(paths).toEqual(
      expect.arrayContaining(['name', 'format', 'command', 'verified_with', 'launch.interactive.terminal', 'session.resume.args', 'usage.fields.cache_write', 'summary.export_args']),
    );
    expect(paths).toHaveLength(26);
  });

  it.each(leafPaths(AdapterManifest).map((path) => [path]))('declares `%s`', (path) => {
    expect(at(raw, path)).toBeDefined();
  });

  it('passes task-177’s validation as a custom adapter, and as a built-in (it carries verified_with)', () => {
    const text = readFileSync(FAKE_YAML, 'utf-8');
    const custom = parseAdapterManifest(text, { name: 'fake', kind: 'custom', file: 'test/fixtures/agents/custom/fake.yaml' });
    expect(custom.launch.interactive.terminal).toBe('optional');
    expect(() => parseAdapterManifest(text, { name: 'fake', kind: 'built-in', file: 'fake.yaml' })).not.toThrow();
  });

  it('launches the fake script through `node`, by its repository-relative path, in every argv that runs it', () => {
    const manifest = parseAdapterManifest(readFileSync(FAKE_YAML, 'utf-8'), { name: 'fake', kind: 'custom', file: 'fake.yaml' });
    expect(manifest.command).toBe('node');
    for (const args of [manifest.version_args, manifest.launch.interactive.args, manifest.launch.headless?.args, manifest.session.lookup_args, manifest.usage.lookup_args, manifest.summary?.export_args]) {
      expect(args?.[0]).toBe(FAKE_SCRIPT_REL);
    }
  });

  it('custom/fake-terminal.yaml is the same adapter, named fake-terminal, with launch.interactive.terminal: required', () => {
    const fake = parseAdapterManifest(readFileSync(FAKE_YAML, 'utf-8'), { name: 'fake', kind: 'custom', file: 'fake.yaml' });
    const terminal = parseAdapterManifest(readFileSync(FAKE_TERMINAL_YAML, 'utf-8'), {
      name: 'fake-terminal',
      kind: 'custom',
      file: 'test/fixtures/agents/custom/fake-terminal.yaml',
    });
    expect(terminal.launch.interactive.terminal).toBe('required');
    const sameAs = (manifest: Manifest) => ({ ...manifest, name: '', launch: { ...manifest.launch, interactive: { ...manifest.launch.interactive, terminal: '' } } });
    expect(sameAs(terminal)).toEqual(sameAs(fake));
    // Declared explicitly, not by the default (spec-016 §2.7).
    expect(at(load(readFileSync(FAKE_TERMINAL_YAML, 'utf-8')), 'launch.interactive.terminal')).toBe('required');
  });

  it('both load through loadAdapter at HEAD from .wingfoil/agents/custom/', () => {
    const root = makeTempGitRepo();
    try {
      writeFixtureFile(root, '.wingfoil/agents/custom/fake.yaml', readFileSync(FAKE_YAML, 'utf-8'));
      writeFixtureFile(root, '.wingfoil/agents/custom/fake-terminal.yaml', readFileSync(FAKE_TERMINAL_YAML, 'utf-8'));
      commitAll(root, 'fake adapters');
      const fake = loadAdapter(root, 'fake');
      const terminal = loadAdapter(root, 'fake-terminal');
      expect(fake.ok && fake.value.manifest.launch.interactive.terminal).toBe('optional');
      expect(terminal.ok && terminal.value.manifest.launch.interactive.terminal).toBe('required');
    } finally {
      removeTempDir(root);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// AC 2 — the Prompt fetch against the built `wingfoil mcp`
// ---------------------------------------------------------------------------------------------

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
`;

const DNA_YAML = `
version: 1.1
project:
  name: Fixture
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
    - name: reviewer
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = `
version: 1.0
assignments:
  developer:
    - testing
  reviewer:
    - code-review
global:
  - doc-versioning
`;

const ELEMENT_ID = 'task-001-active';

function directiveMd(id: string): string {
  return `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n\nRule body of ${id}.\n`;
}

function taskMd(id: string, body: string): string {
  return ['---', `id: ${id}`, 'type: task', 'release: "v0.1"', 'status: backlog', 'tags: [ context ]', '---', '', body, ''].join('\n');
}

/** A project with the fake adapter and its script committed where the manifest names them. */
function seedProject(): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  for (const id of ['testing', 'code-review', 'doc-versioning']) {
    writeFixtureFile(root, `.wingfoil/directives/custom/${id}.md`, directiveMd(id));
  }
  writeFixtureFile(root, '.wingfoil/agents/custom/fake.yaml', readFileSync(FAKE_YAML, 'utf-8'));
  writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, 'Body of the active task.'));
  writeFixtureFile(root, 'docs/04_memory/v0.1/task-002-sibling.md', taskMd('task-002-sibling', 'A sibling sharing the context tag.'));
  mkdirSync(join(root, dirname(FAKE_SCRIPT_REL)), { recursive: true });
  copyFileSync(FAKE_SCRIPT, join(root, FAKE_SCRIPT_REL));
  commitAll(root, 'seed task-200 fake-agent fixture');
  return root;
}

/** `spec-016` §2.4's bootstrap for `(role, element, run id, state_ref)`, task template branch. */
function bootstrap(role: string, element: string, runId: string, stateRef: string): string {
  return [
    `WingFoil run ${runId}: act as role "${role}" on element ${element}.`,
    `Your context is assembled at commit ${stateRef} and served by the "wingfoil" MCP server`,
    `registered for this session. Load it before any other action: Get the MCP prompt "${role}-session" with arguments element="${element}" and state="${stateRef}".`,
    'Record your handoff in the element\'s "## Execution Notes" section.',
    '',
  ].join('\n');
}

/** Fill one argv template: each placeholder is a whole element (§2.3); `{mcp_args}` would expand. */
function renderArgv(args: readonly string[], values: Readonly<Record<string, string>>): string[] {
  return args.map((element) => {
    const match = /^\{([a-z_]+)\}$/.exec(element);
    return match === null ? element : values[match[1]!]!;
  });
}

describe('AC 2 — driven directly, the fake fetches the {role}-session Prompt from `node dist/cli.js mcp`', () => {
  let root: string;
  beforeAll(() => {
    root = seedProject();
  });
  afterAll(() => removeTempDir(root));

  it('completes initialize and the Prompt fetch with element/state, and records the payload task-176 builds', async () => {
    const loaded = loadAdapter(root, 'fake');
    if (!loaded.ok) throw new Error(`fixture: ${loaded.error.message}`);
    const manifest = loaded.value.manifest;
    const sha = git(root, ['rev-parse', 'HEAD']).trim();
    const element = `task:${ELEMENT_ID}`;

    // The MCP registration, rendered from the manifest's own template (§2.3, §2.5): the running build.
    const dir = scratchDir();
    const mcpConfigFile = join(dir, 'mcp.json');
    writeFileSync(
      mcpConfigFile,
      manifest.mcp.template!.replace('{mcp_command}', process.execPath).replace('{mcp_args}', JSON.stringify([CLI_ENTRY, 'mcp'])),
    );
    const recordFile = join(dir, 'record.jsonl');
    const argv = renderArgv([...manifest.launch.interactive.args, ...(manifest.session.assign_args ?? [])], {
      mcp_config_file: mcpConfigFile,
      bootstrap: bootstrap('developer', element, 'run-0001', sha),
      session_id: 'fake-session-1',
    });

    const run = spawnSync(manifest.command, argv, {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, WINGFOIL_FAKE_AGENT_RECORD: recordFile, WINGFOIL_FAKE_AGENT_CONNECT: '1' },
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);

    const [entry, ...rest] = records(recordFile);
    expect(rest).toEqual([]);
    // The script records what follows its own path: argv[0] of the launch is the script itself.
    expect(argv[0]).toBe(FAKE_SCRIPT_REL);
    expect(entry!.argv).toEqual(argv.slice(1));
    expect(entry!.mcp?.server?.name).toBe('wingfoil');
    expect(entry!.mcp?.prompt).toEqual({ name: 'developer-session', arguments: { element, state: sha } });
    expect(entry!.mcp?.error).toBeUndefined();

    const built = assembleExecutionContext(root, { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: sha });
    if (!built.ok) throw new Error(`fixture: ${built.error.message}`);
    expect(entry!.mcp?.text).toBe(built.value.payload);
  }, 60000);

  it('records the server’s refusal, not a payload, when the element does not exist at state', () => {
    const sha = git(root, ['rev-parse', 'HEAD']).trim();
    const dir = scratchDir();
    const mcpConfigFile = join(dir, 'mcp.json');
    writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: { wingfoil: { command: process.execPath, args: [CLI_ENTRY, 'mcp'] } } }));
    const run = runFake(['--mcp-config', mcpConfigFile, '--prompt', bootstrap('developer', 'task:task-999-absent', 'run-0002', sha)], { WINGFOIL_FAKE_AGENT_CONNECT: '1' }, { cwd: root });
    expect(run.status).toBe(0);
    expect(run.records[0]!.mcp?.text).toBeUndefined();
    expect(run.records[0]!.mcp?.error?.code).toBe(-32602);
    expect(run.records[0]!.mcp?.error?.message).toMatch(/not found/);
  }, 60000);

  it('exits 1 and records the failure when the bootstrap names no Prompt, or the server cannot be started', () => {
    const noInstruction = runFake(['--mcp-config', '/nonexistent.json', '--prompt', 'hello'], { WINGFOIL_FAKE_AGENT_CONNECT: '1' });
    expect(noInstruction.status).toBe(1);
    expect(noInstruction.records[0]!.failure).toMatch(/names no MCP prompt/);

    const dir = scratchDir();
    const config = join(dir, 'mcp.json');
    writeFileSync(config, JSON.stringify({ mcpServers: { wingfoil: { command: join(dir, 'no-such-server'), args: [] } } }));
    const unreachable = runFake(['--mcp-config', config, '--prompt', bootstrap('developer', 'task:x', 'run-1', 'abc')], { WINGFOIL_FAKE_AGENT_CONNECT: '1' });
    expect(unreachable.status).toBe(1);
    expect(unreachable.stderr).toMatch(/^fake-agent: /);
    expect(unreachable.records[0]!.mcp).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// AC 3 — names, never values; no secret-shaped literal
// ---------------------------------------------------------------------------------------------

describe('AC 3 — the record holds environment variable names only, and no fixture holds a secret-shaped literal', () => {
  it('records the name of every variable it received and none of their values (REQ-SEC-08)', () => {
    // A value no other part of the record could contain; built at runtime, never a source literal.
    const value = ['probe', 'value', String(process.pid), 'z9'].join('-');
    const run = runFake(['--version'], { WINGFOIL_FAKE_AGENT_PROBE: value });
    expect(run.status).toBe(0);
    const [entry] = run.records;
    expect(entry!.env).toContain('WINGFOIL_FAKE_AGENT_PROBE');
    expect(entry!.env).toContain('WINGFOIL_FAKE_AGENT_RECORD');
    expect(entry!.env).toEqual([...entry!.env].sort());
    expect(JSON.stringify(run.records)).not.toContain(value);
  });

  it.each([[FAKE_SCRIPT], [FAKE_YAML], [FAKE_TERMINAL_YAML]].map(([file]) => [relative(REPO_ROOT, file!)]))('the spec-007 scanner finds nothing in %s', (file) => {
    const result = scanText(readFileSync(join(REPO_ROOT, file!), 'utf-8'), file!);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// AC 4 — no pseudo-terminal anywhere in the suite
// ---------------------------------------------------------------------------------------------

/** Every regular file under `dir`, recursively. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('AC 4 — no test needs a pseudo-terminal', () => {
  it('no file under test/ names a pseudo-terminal package or the script(1) quiet mode, and package.json depends on none', () => {
    // Built from fragments, so that this file does not match its own search.
    const needles = [['node', 'pty'].join('-'), ['script', '-q'].join(' ')];
    const hits = filesUnder(join(REPO_ROOT, 'test')).filter((file) => {
      const text = readFileSync(file, 'utf-8');
      return needles.some((needle) => text.includes(needle));
    });
    expect(hits).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as Record<string, Record<string, string> | undefined>;
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((name) => /pty/.test(name))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The rest of §2.7's script
// ---------------------------------------------------------------------------------------------

describe('the fake script (spec-016 §2.7)', () => {
  const manifest = parseAdapterManifest(readFileSync(FAKE_YAML, 'utf-8'), { name: 'fake', kind: 'custom', file: 'fake.yaml' });

  it('`version_args` prints the version that `verified_with` names', () => {
    const run = runFake(manifest.version_args!.slice(1));
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`${manifest.verified_with}\n`);
  });

  it('`lookup_args` print one JSON document whose declared fields resolve to the session id, model and usage', () => {
    const args = renderArgv(manifest.session.lookup_args!, { session_id: 'fake-session-7' }).slice(1);
    const run = runFake(args);
    expect(run.status).toBe(0);
    const document = JSON.parse(run.stdout) as unknown;
    expect(at(document, manifest.session.field!)).toBe('fake-session-7');
    for (const [key, path] of Object.entries(manifest.usage.fields!)) {
      expect([key, at(document, path!)]).toEqual([key, expect.anything()]);
    }
  });

  it('prints the document the caller declares instead of its default', () => {
    const declared = { session_id: 's', model: 'm', usage: { input: 1, output: 2 } };
    const run = runFake(['--lookup', 's'], { WINGFOIL_FAKE_AGENT_DOCUMENT: JSON.stringify(declared) });
    expect(JSON.parse(run.stdout)).toEqual(declared);
  });

  it('`summary.export_args` prints a summary line', () => {
    const run = runFake(manifest.summary!.export_args!.slice(1));
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('fake-agent: session summary\n');
  });

  it('an interactive launch prints nothing on stdout and exits with the declared code', () => {
    const run = runFake(['--mcp-config', '/unused.json', '--prompt', 'p', '--session-id', 'sid'], { WINGFOIL_FAKE_AGENT_EXIT: '3' });
    expect(run.status).toBe(3);
    expect(run.stdout).toBe('');
    expect(run.records[0]!.argv).toEqual(['--mcp-config', '/unused.json', '--prompt', 'p', '--session-id', 'sid']);
    expect(run.records[0]!.mcp).toBeNull();
  });

  it('a headless launch prints the document for its session on stdout (launch.headless.output: json)', () => {
    const run = runFake(['--headless', '--mcp-config', '/unused.json', '--prompt', 'p', '--session-id', 'sid-h']);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ session_id: 'sid-h', model: 'fake-model' });
  });

  it('records stdin when asked to read it, and null otherwise', () => {
    expect(runFake(['--version'], { WINGFOIL_FAKE_AGENT_STDIN: '1' }, { input: 'from stdin\n' }).records[0]!.stdin).toBe('from stdin\n');
    expect(runFake(['--version']).records[0]!.stdin).toBeNull();
  });

  it('reads its bootstrap from --prompt-file, or from stdin when neither is given', () => {
    const dir = scratchDir();
    const promptFile = join(dir, 'bootstrap.txt');
    writeFileSync(promptFile, 'no instruction here\n');
    const fromFile = runFake(['--prompt-file', promptFile, '--mcp-config', '/x.json'], { WINGFOIL_FAKE_AGENT_CONNECT: '1' });
    expect(fromFile.records[0]!.failure).toMatch(/names no MCP prompt/);
    const fromStdin = runFake(['--headless', '--mcp-config', '/x.json'], { WINGFOIL_FAKE_AGENT_CONNECT: '1', WINGFOIL_FAKE_AGENT_STDIN: '1' }, { input: 'none either\n' });
    expect(fromStdin.records[0]!.stdin).toBe('none either\n');
    expect(fromStdin.records[0]!.failure).toMatch(/names no MCP prompt/);
  });

  it('waits until a signal ends it when asked to, after writing its record', async () => {
    const recordFile = join(scratchDir(), 'record.jsonl');
    const child = spawn('node', [FAKE_SCRIPT, '--prompt', 'p'], {
      stdio: 'ignore',
      env: { ...process.env, WINGFOIL_FAKE_AGENT_RECORD: recordFile, WINGFOIL_FAKE_AGENT_WAIT: 'signal' },
    });
    try {
      const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.on('exit', (code, signal) => resolve({ code, signal }));
      });
      // The record is written before the wait starts; poll for it rather than sleeping a fixed time.
      for (let tries = 0; tries < 200; tries += 1) {
        try {
          if (records(recordFile).length === 1) break;
        } catch {
          // not written yet
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(records(recordFile)).toHaveLength(1);
      expect(child.exitCode).toBeNull();
      child.kill('SIGTERM');
      expect(await ended).toEqual({ code: null, signal: 'SIGTERM' });
    } finally {
      // Never leave the waiting child behind when an assertion above fails (review F6).
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 30000);
});

// ---------------------------------------------------------------------------------------------
// Review fixes (task-200 review F1–F4): what task-218/228 need from the fake
// ---------------------------------------------------------------------------------------------

/** A stub MCP server script in a scratch directory, and an MCP config that registers it as `wingfoil`. */
function stubServer(source: string): string {
  const dir = scratchDir();
  const script = join(dir, 'server.cjs');
  writeFileSync(script, source);
  const config = join(dir, 'mcp.json');
  writeFileSync(config, JSON.stringify({ mcpServers: { wingfoil: { command: process.execPath, args: [script] } } }));
  return config;
}

/** Answers `initialize`, then `prompts/get` with `text`, its bytes written in two chunks cut at byte `cutAfter(buf)`. */
const SPLIT_SERVER = `
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { serverInfo: { name: 'wingfoil', version: 'x' }, protocolVersion: '2025-06-18', capabilities: {} } }) + '\n');
  if (m.method === 'prompts/get') {
    const buf = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { messages: [{ role: 'user', content: { type: 'text', text: 'a\u2014b' } }] } }) + '\n');
    const cut = buf.indexOf(0xe2) + 1;
    process.stdout.write(buf.subarray(0, cut));
    setTimeout(() => process.stdout.write(buf.subarray(cut)), 200);
  }
});
`;

const NOISY_SERVER = `
process.stdout.write('not json\n');
process.stdin.resume();
setInterval(() => undefined, 1000);
`;

describe('review fixes — the fake is usable by agent execute (F1–F4)', () => {
  const connect = { WINGFOIL_FAKE_AGENT_CONNECT: '1' };
  const prompt = bootstrap('developer', 'task:x', 'run-1', 'abc');

  it('F1: WAIT and EXIT apply to a launch only — --version, --lookup and --summary still answer and exit 0', () => {
    const env = { WINGFOIL_FAKE_AGENT_WAIT: 'signal', WINGFOIL_FAKE_AGENT_EXIT: '3' };
    for (const args of [['--version'], ['--lookup', 's1'], ['--summary']]) {
      const recordFile = join(scratchDir(), 'record.jsonl');
      const run = spawnSync('node', [FAKE_SCRIPT, ...args], {
        encoding: 'utf-8',
        timeout: 20000,
        env: { ...process.env, WINGFOIL_FAKE_AGENT_RECORD: recordFile, ...env },
      });
      expect([args[0], run.signal, run.status]).toEqual([args[0], null, 0]);
    }
  });

  it('F1: WINGFOIL_FAKE_AGENT_LOOKUP=fail makes --lookup exit 1 with nothing on stdout, and leaves a launch alone', () => {
    const lookup = runFake(['--lookup', 's1'], { WINGFOIL_FAKE_AGENT_LOOKUP: 'fail' });
    expect(lookup.status).toBe(1);
    expect(lookup.stdout).toBe('');
    expect(lookup.records).toHaveLength(1);
    const launch = runFake(['--mcp-config', '/unused.json', '--prompt', 'p'], { WINGFOIL_FAKE_AGENT_LOOKUP: 'fail' });
    expect(launch.status).toBe(0);
  });

  it('F1: WINGFOIL_FAKE_AGENT_LOOKUP=hang makes --lookup wait until killed, after writing its record', () => {
    const recordFile = join(scratchDir(), 'record.jsonl');
    const run = spawnSync('node', [FAKE_SCRIPT, '--lookup', 's1'], {
      encoding: 'utf-8',
      timeout: 3000,
      env: { ...process.env, WINGFOIL_FAKE_AGENT_RECORD: recordFile, WINGFOIL_FAKE_AGENT_LOOKUP: 'hang' },
    });
    expect(run.signal).toBe('SIGTERM');
    expect(run.stdout).toBe('');
    expect(records(recordFile)).toHaveLength(1);
  });

  it('F2: a multi-byte character split across two stdout chunks is recorded intact', () => {
    const run = runFake(['--mcp-config', stubServer(SPLIT_SERVER), '--prompt', prompt], connect);
    expect(run.status).toBe(0);
    expect(run.records[0]!.mcp?.text).toBe('a\u2014b');
  }, 30000);

  it('F3: a non-JSON line from the server fails the fake with a record, instead of crashing it', () => {
    const recordFile = join(scratchDir(), 'record.jsonl');
    const run = spawnSync('node', [FAKE_SCRIPT, '--mcp-config', stubServer(NOISY_SERVER), '--prompt', prompt], {
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, WINGFOIL_FAKE_AGENT_RECORD: recordFile, ...connect },
    });
    expect(run.signal).toBeNull();
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^fake-agent: non-JSON line from server: not json/);
    expect(records(recordFile)[0]!.failure).toMatch(/^non-JSON line from server: not json/);
  }, 30000);

  it('F4: a declared document without session_id gets the session asked for; one with it is kept', () => {
    const withoutId = runFake(['--lookup', 's1'], { WINGFOIL_FAKE_AGENT_DOCUMENT: JSON.stringify({ model: 'm' }) });
    expect(JSON.parse(withoutId.stdout)).toEqual({ model: 'm', session_id: 's1' });
    const withId = runFake(['--lookup', 's1'], { WINGFOIL_FAKE_AGENT_DOCUMENT: JSON.stringify({ session_id: 'other' }) });
    expect(JSON.parse(withId.stdout)).toEqual({ session_id: 'other' });
  });
});
