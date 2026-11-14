/**
 * task-228 — the pure parts of `agent execute`'s launch half (`spec-016` §2.3 rendering, §2.6 session
 * id and the JSON paths of `session.field` / `usage.fields`, §2.4 attribution line), unit by unit. The
 * launch as a user meets it is `test/cli/agent-execute-launch.integration.test.ts`. task-338 AC 3 rewrites the
 * attribution line to `spec-018` Consequences' text (`bug-370`); `assignedSessionId`'s computation is unchanged by
 * task-338 (only its first argument becomes the clone's salt, design §3), so its cases below stay.
 */
import { createHash } from 'node:crypto';

import {
  ATTRIBUTION_LINE_PREFIX,
  assignedSessionId,
  attributionLine,
  handoffLine,
  readJsonPath,
  renderBootstrap,
  renderLaunchArgv,
  renderMcpTemplate,
  SESSION_ID_NAMESPACE,
  type AdapterManifest,
  type LaunchValues,
} from '../../src/agent';

/**
 * RFC 4122 §4.3 name-based UUID, version 5 (SHA-1), written independently of the module under test so
 * the test pins the algorithm, not a copy of it.
 */
function referenceUuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf-8')])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** RFC 4122 Appendix C's URL namespace. */
const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

describe('assignedSessionId (§2.6) — UUID v5 over a fixed namespace and `<abs root>\\n<run id>`', () => {
  it('the namespace is the v5 UUID of "wingfoil:spec-016:session" in the URL namespace', () => {
    expect(SESSION_ID_NAMESPACE).toBe(referenceUuidV5(URL_NAMESPACE, 'wingfoil:spec-016:session'));
  });

  it('is the v5 UUID of `<root>\\n<run id>`, stable for the same clone and run', () => {
    const id = assignedSessionId('/work/clone', 'task-001-a/adhoc/1');
    expect(id).toBe(referenceUuidV5(SESSION_ID_NAMESPACE, '/work/clone\ntask-001-a/adhoc/1'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(assignedSessionId('/work/clone', 'task-001-a/adhoc/1')).toBe(id);
  });

  it('differs for another run id, and for another clone', () => {
    const id = assignedSessionId('/work/clone', 'task-001-a/adhoc/1');
    expect(assignedSessionId('/work/clone', 'task-001-a/adhoc/2')).not.toBe(id);
    expect(assignedSessionId('/work/other', 'task-001-a/adhoc/1')).not.toBe(id);
  });
});

/** A manifest with only what rendering reads; the rest is the fake's shape. */
function manifestWith(overrides: { args: string[]; via?: 'config-file' | 'args' | 'config-arg'; id?: 'assign' | 'lookup' | 'none'; assign?: string[] }): AdapterManifest {
  return {
    name: 'm',
    format: 1,
    command: 'agent-cli',
    launch: { interactive: { args: overrides.args, terminal: 'optional' } },
    prompt: { via: 'arg' },
    mcp: { via: overrides.via ?? 'config-file', template: '{}' },
    session: { id: overrides.id ?? 'assign', assign_args: overrides.assign, resume: { supported: false } },
    usage: { from: 'none' },
  } as AdapterManifest;
}

describe('renderLaunchArgv (§2.3, §3.3 step 14) — whole elements, {mcp_args} expands, assign_args appended', () => {
  const values = {
    bootstrap: 'WingFoil run x: "quoted" $HOME `tick`\n',
    files: { mcp_config_file: '/tmp/wingfoil-run-1/mcp-config.json', bootstrap_file: '/tmp/wingfoil-run-1/bootstrap.txt' },
    mcpServer: { command: '/usr/bin/node', args: ['/opt/wf/dist/cli.js', 'mcp'] },
    sessionId: '00000000-0000-5000-8000-000000000000',
  };

  it('fills each placeholder element with its value, bytes intact (no shell), and appends assign_args under assign', () => {
    const argv = renderLaunchArgv(
      manifestWith({ args: ['--mcp-config', '{mcp_config_file}', '--prompt', '{bootstrap}', '--flag'], assign: ['--session-id', '{session_id}'] }),
      values,
    );
    expect(argv).toEqual(['--mcp-config', values.files.mcp_config_file, '--prompt', values.bootstrap, '--flag', '--session-id', values.sessionId]);
  });

  it('{mcp_args} expands to several elements; {mcp_command} and {bootstrap_file} fill one each', () => {
    const argv = renderLaunchArgv(manifestWith({ via: 'args', args: ['--server', '{mcp_command}', '{mcp_args}', '--file', '{bootstrap_file}'], id: 'none' }), values);
    expect(argv).toEqual(['--server', '/usr/bin/node', '/opt/wf/dist/cli.js', 'mcp', '--file', values.files.bootstrap_file]);
  });

  it('assign_args are not appended when the session id is not assigned', () => {
    expect(renderLaunchArgv(manifestWith({ args: ['{bootstrap}'], id: 'lookup', assign: ['--session-id', '{session_id}'] }), values)).toEqual([values.bootstrap]);
  });
});

describe('task-237 (h) — {mcp_config} renders as exactly ONE argv element (mcp.via: config-arg, ruling D-1 (a))', () => {
  /** A rendered TOML override as `-c` takes it: spaces, quotes, `=`, braces and a backslash, all in one element. */
  const mcpConfig = 'mcp_servers.wingfoil={command = "/a b/node", args = ["/c\\"d/cli.js","mcp"], enabled = true, required = true}';
  // `mcpConfig` is the new optional LaunchValues field (task-237); the cast lets this file compile
  // before it exists, so the test fails on its assertion, not on a type error.
  const values = {
    bootstrap: 'WingFoil run x: "quoted"\n',
    files: {},
    mcpServer: { command: '/a b/node', args: ['/c"d/cli.js', 'mcp'] },
    sessionId: '00000000-0000-5000-8000-000000000000',
    mcpConfig,
  } as LaunchValues;

  it('replaces {mcp_config} by the rendered template, verbatim, as one element (no split, no shell)', () => {
    const argv = renderLaunchArgv(manifestWith({ via: 'config-arg', args: ['-c', '{mcp_config}', '{bootstrap}'], id: 'none' }), values);
    expect(argv).toHaveLength(3);
    expect(argv).toEqual(['-c', mcpConfig, values.bootstrap]);
  });

  it('renderMcpTemplate fills a TOML template as it fills JSON: {mcp_command} as string content, {mcp_args} as an array (characterization)', () => {
    const rendered = renderMcpTemplate('x={command = "{mcp_command}", args = {mcp_args}}', { command: '/a b/node', args: ['/c"d/cli.js', 'mcp'] });
    expect(rendered).toEqual({ ok: true, value: 'x={command = "/a b/node", args = ["/c\\"d/cli.js","mcp"]}' });
  });
});

describe('readJsonPath (§2.2 `session.field`, `usage.fields`) — a dotted path into one JSON value', () => {
  const doc = { session_id: 's-1', usage: { input: 120, nested: { deep: 'x' } }, list: [1] };

  it('reads a top-level and a nested key', () => {
    expect(readJsonPath(doc, 'session_id')).toBe('s-1');
    expect(readJsonPath(doc, 'usage.input')).toBe(120);
    expect(readJsonPath(doc, 'usage.nested.deep')).toBe('x');
  });

  it('an absent key, a path through a scalar or an array, or a non-object document reads as undefined', () => {
    expect(readJsonPath(doc, 'usage.output')).toBeUndefined();
    expect(readJsonPath(doc, 'session_id.length')).toBeUndefined();
    expect(readJsonPath(doc, 'list.0')).toBeUndefined();
    expect(readJsonPath(null, 'a')).toBeUndefined();
    expect(readJsonPath('text', 'a')).toBeUndefined();
  });
});

describe('the attribution line (§2.4 as amended by task-338, spec-018 Consequences, dl-158 Rule 1 (a), git-conventions §7)', () => {
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const input = {
    role: 'developer',
    element: 'task:task-001-a',
    runId: 'task-001-a/adhoc/1',
    stateRef: SHA,
    handoff: handoffLine(true),
    agent: { name: 'Fake Agent', email: 'fake-agent@example.com' },
    build: '9.9.9 (0123abc)',
  };

  it('task-338 AC 3 — the prefix is spec-018 Consequences\' opening words', () => {
    expect(ATTRIBUTION_LINE_PREFIX).toBe('Commits wingfoil writes for you already end with');
  });

  it('task-338 AC 3 — closes the bootstrap with spec-018 Consequences\' text, naming the signing entry, after the handoff line', () => {
    const lines = renderBootstrap(input).split('\n');
    expect(lines[lines.length - 1]).toBe('');
    expect(lines[lines.length - 2]).toBe(
      `${ATTRIBUTION_LINE_PREFIX} "Co-Authored-By: Fake Agent <fake-agent@example.com>" and an "AI-Model:" trailer: pass --ai-model <your model identifier> to each wingfoil command that writes a commit, or that trailer records "AI-Model: not-reported"; end a commit you write yourself with git commit with the trailer paragraph "Co-Authored-By: Fake Agent <fake-agent@example.com>" and "AI-Model: <your model identifier>"; never run memory approve, memory reject or memory amend, which refuse in your session (git-conventions §7).`,
    );
    expect(lines[lines.length - 3]).toBe(handoffLine(true));
  });

  it('task-338 AC 3 — attributionLine is that line, and never names the old placeholder or an amend (bug-370)', () => {
    const line = attributionLine({ name: 'Fake Agent', email: 'fake-agent@example.com' });
    expect(renderBootstrap(input).split('\n')).toContain(line);
    expect(line).not.toContain('<the model identifier you run as>');
    expect(line).not.toContain('--amend');
  });

  it('another entry is named in its own line', () => {
    const text = renderBootstrap({ ...input, agent: { name: 'Second Agent', email: 'second@example.com' } });
    expect(text).toContain('"Co-Authored-By: Second Agent <second@example.com>"');
    expect(text).not.toContain('Fake Agent');
  });
});
