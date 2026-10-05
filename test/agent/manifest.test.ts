/**
 * The agent adapter manifest (task-177, `spec-016` §2.2–§2.3, `adr-012` points 2 and 6): a strict Zod
 * schema run through `spec-009`'s two-pass entry, the closed placeholder set with whole-argv-element
 * filling (`dl-090` Q3 (a)) and the per-field legality, and the required-with rules.
 *
 * Every case starts from the fake adapter fixture (`test/fixtures/agents/custom/fake.yaml`), which
 * declares every §2.2 field and is valid, and changes one thing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { dump, load } from 'js-yaml';

import {
  ADAPTER_MANIFEST_FORMAT,
  ADAPTER_PLACEHOLDERS,
  AdapterManifest,
  E_ADAPTER_MANIFEST,
  E_ADAPTER_PLACEHOLDER,
  parseAdapterManifest,
  placeholderIssues,
  type AdapterKind,
} from '../../src/agent';
import { ValidationError, type ValidationIssue } from '../../src/validation';

const FIXTURE = join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml');

type Manifest = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A fresh, mutable copy of the fake adapter. */
function fake(): Manifest {
  return load(readFileSync(FIXTURE, 'utf-8')) as Manifest;
}

/** Parse `manifest` as `<kind>/<name>.yaml`; the issues it is refused with, or `[]` when it loads. */
function issuesOf(manifest: Manifest, kind: AdapterKind = 'custom', name = 'fake'): readonly ValidationIssue[] {
  try {
    parseAdapterManifest(dump(manifest), { name, kind, file: `HEAD:.wingfoil/agents/${kind}/${name}.yaml` });
    return [];
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return error.issues;
  }
}

/** The single issue at `path` whose message matches `pattern` (the test fails on none). */
function expectIssue(issues: readonly ValidationIssue[], path: string, pattern: RegExp): void {
  expect(issues.filter((issue) => issue.path === path && pattern.test(issue.message))).toHaveLength(1);
}

describe('the fake adapter fixture', () => {
  it('is a valid custom manifest, and parses to its declared values (the terminal default is not applied over `optional`)', () => {
    expect(issuesOf(fake())).toEqual([]);
    const parsed = parseAdapterManifest(readFileSync(FIXTURE, 'utf-8'), {
      name: 'fake',
      kind: 'custom',
      file: 'test/fixtures/agents/custom/fake.yaml',
    });
    expect(parsed.name).toBe('fake');
    expect(parsed.format).toBe(1);
    expect(parsed.launch.interactive.terminal).toBe('optional');
  });

  it('`launch.interactive.terminal` defaults to `required` (spec-016 §2.2)', () => {
    const manifest = fake();
    delete manifest.launch.interactive.terminal;
    const parsed = parseAdapterManifest(dump(manifest), { name: 'fake', kind: 'custom', file: 'f.yaml' });
    expect(parsed.launch.interactive.terminal).toBe('required');
  });
});

describe('AC 1 — strict schema: unknown key, missing required field, format ≠ 1', () => {
  it('refuses an unknown top-level key (a misspelt `args` must not launch an agent without its MCP registration)', () => {
    const manifest = fake();
    manifest.env = { TOKEN: 'x' };
    expect(issuesOf(manifest).some((issue) => /env/.test(issue.message))).toBe(true);
  });

  it('refuses an unknown nested key', () => {
    const manifest = fake();
    manifest.launch.interactive.argz = manifest.launch.interactive.args;
    expect(issuesOf(manifest).some((issue) => issue.path === 'launch.interactive' && /argz/.test(issue.message))).toBe(true);
  });

  it.each([
    ['name'],
    ['format'],
    ['command'],
    ['launch'],
    ['prompt'],
    ['mcp'],
    ['session'],
    ['usage'],
  ])('refuses a manifest with no `%s`', (field) => {
    const manifest = fake();
    delete manifest[field];
    expect(issuesOf(manifest).some((issue) => issue.path === field)).toBe(true);
  });

  it.each([
    ['launch.interactive.args', (m: Manifest) => delete m.launch.interactive.args],
    ['prompt.via', (m: Manifest) => delete m.prompt.via],
    ['mcp.via', (m: Manifest) => delete m.mcp.via],
    ['session.id', (m: Manifest) => delete m.session.id],
    ['session.resume', (m: Manifest) => delete m.session.resume],
    ['session.resume.supported', (m: Manifest) => delete m.session.resume.supported],
    ['usage.from', (m: Manifest) => delete m.usage.from],
    ['launch.headless.output', (m: Manifest) => delete m.launch.headless.output],
  ])('refuses a manifest with no `%s`', (path, mutate) => {
    const manifest = fake();
    mutate(manifest);
    expect(issuesOf(manifest).some((issue) => issue.path === path)).toBe(true);
  });

  it.each([[2], [0], ['1'], [1.5]])('refuses `format: %p` — only format 1 exists', (format) => {
    const manifest = fake();
    manifest.format = format;
    expect(issuesOf(manifest).some((issue) => issue.path === 'format')).toBe(true);
  });

  it('refuses a `name` outside the spec-009 id class', () => {
    const manifest = fake();
    manifest.name = 'Fake Agent';
    expect(issuesOf(manifest, 'custom', 'Fake Agent').some((issue) => issue.path === 'name')).toBe(true);
  });

  it.each([
    ['launch.interactive.terminal', (m: Manifest) => (m.launch.interactive.terminal = 'sometimes')],
    ['launch.headless.output', (m: Manifest) => (m.launch.headless.output = 'xml')],
    ['prompt.via', (m: Manifest) => (m.prompt.via = 'pipe')],
    ['session.id', (m: Manifest) => (m.session.id = 'guess')],
    ['usage.from', (m: Manifest) => (m.usage.from = 'guess')],
  ])('refuses a value outside the enum of `%s`', (path, mutate) => {
    const manifest = fake();
    mutate(manifest);
    expect(issuesOf(manifest).some((issue) => issue.path === path)).toBe(true);
  });

  it('refuses a non-string argv element', () => {
    const manifest = fake();
    manifest.launch.interactive.args = ['--x', 42];
    expect(issuesOf(manifest).some((issue) => issue.path === 'launch.interactive.args.1')).toBe(true);
  });

  it('refuses a `usage.fields` key that is not one of model, input, output, cache_read, cache_write', () => {
    const manifest = fake();
    manifest.usage.fields.total = 'usage.total';
    expect(issuesOf(manifest).some((issue) => issue.path === 'usage.fields' && /total/.test(issue.message))).toBe(true);
  });

  it('has no `env:` field (spec-016 §2.2: credentials stay inside the agent CLI)', () => {
    const manifest = fake();
    manifest.launch.interactive.env = { A: 'b' };
    expect(issuesOf(manifest).some((issue) => issue.path === 'launch.interactive' && /env/.test(issue.message))).toBe(true);
  });
});

describe('AC 2 — §2.3 placeholders', () => {
  it('the placeholder set is closed and exactly §2.3’s', () => {
    expect([...ADAPTER_PLACEHOLDERS]).toEqual([
      'bootstrap',
      'bootstrap_file',
      'mcp_config_file',
      'mcp_command',
      'mcp_args',
      'session_id',
    ]);
  });

  it('refuses an unknown placeholder', () => {
    const manifest = fake();
    manifest.launch.interactive.args.push('{workspace}');
    expectIssue(issuesOf(manifest), 'launch.interactive.args.5', /unknown placeholder \{workspace\}/);
  });

  it('refuses an unknown placeholder in mcp.template', () => {
    const manifest = fake();
    manifest.mcp.template = '{"cwd": "{repo_root}"}';
    expectIssue(issuesOf(manifest), 'mcp.template', /unknown placeholder \{repo_root\}/);
  });

  it.each([['--x={bootstrap}'], ['{bootstrap}x'], ['{mcp_command} {mcp_args}']])(
    'refuses a placeholder concatenated inside an argv element: %p',
    (element) => {
      const manifest = fake();
      manifest.prompt.via = 'arg';
      manifest.mcp.via = 'args';
      delete manifest.mcp.template;
      manifest.launch.interactive.args = [element];
      expectIssue(issuesOf(manifest), 'launch.interactive.args.0', /whole argv element/);
    },
  );

  it('accepts placeholders inside mcp.template, where the body is text, not argv', () => {
    const manifest = fake();
    manifest.mcp.template = 'command = "{mcp_command}"\nargs = {mcp_args}\n';
    expect(issuesOf(manifest)).toEqual([]);
  });

  it.each([['stdin'], ['file']])('refuses {bootstrap} when prompt.via is %s', (via) => {
    const manifest = fake();
    manifest.prompt.via = via;
    const issues = issuesOf(manifest);
    expectIssue(issues, 'launch.interactive.args.4', /\{bootstrap\}.*prompt\.via/);
    expectIssue(issues, 'launch.headless.args.5', /\{bootstrap\}.*prompt\.via/);
  });

  it('refuses {bootstrap_file} when prompt.via is arg, and accepts it under file', () => {
    const manifest = fake();
    manifest.launch.interactive.args[4] = '{bootstrap_file}';
    expectIssue(issuesOf(manifest), 'launch.interactive.args.4', /\{bootstrap_file\}.*prompt\.via/);
    manifest.prompt.via = 'file';
    manifest.launch.headless.args[5] = '{bootstrap_file}';
    expect(issuesOf(manifest)).toEqual([]);
  });

  it('refuses {mcp_config_file} under mcp.via args, and {mcp_command} / {mcp_args} in launch args under config-file', () => {
    const viaArgs = fake();
    viaArgs.mcp.via = 'args';
    delete viaArgs.mcp.template;
    expectIssue(issuesOf(viaArgs), 'launch.interactive.args.2', /\{mcp_config_file\}.*mcp\.via/);

    const viaFile = fake();
    viaFile.launch.interactive.args.push('{mcp_command}', '{mcp_args}');
    const issues = issuesOf(viaFile);
    expectIssue(issues, 'launch.interactive.args.5', /\{mcp_command\}.*mcp\.via/);
    expectIssue(issues, 'launch.interactive.args.6', /\{mcp_args\}.*mcp\.via/);
  });

  it('accepts {mcp_command} and {mcp_args} as whole launch elements under mcp.via args', () => {
    const manifest = fake();
    manifest.mcp.via = 'args';
    delete manifest.mcp.template;
    manifest.launch.interactive.args = ['--mcp', '{mcp_command}', '{mcp_args}', '{bootstrap}'];
    manifest.launch.headless.args = ['--mcp', '{mcp_command}', '{mcp_args}', '{bootstrap}'];
    expect(issuesOf(manifest)).toEqual([]);
  });

  it.each([['session.lookup_args'], ['usage.lookup_args']])(
    'refuses {session_id} in %s under session.id: lookup',
    (field) => {
      const manifest = fake();
      manifest.session.id = 'lookup';
      delete manifest.session.assign_args;
      const [section] = field.split('.');
      manifest[section!].lookup_args = ['--last', '{session_id}'];
      if (section === 'session') manifest.usage.lookup_args = ['--last'];
      else manifest.session.lookup_args = ['--last'];
      expectIssue(issuesOf(manifest), `${field}.1`, /\{session_id\}.*session\.id/);
    },
  );

  it('refuses {session_id} in usage.lookup_args under session.id: output', () => {
    const manifest = fake();
    manifest.session.id = 'output';
    delete manifest.session.assign_args;
    delete manifest.session.lookup_args;
    expectIssue(issuesOf(manifest), 'usage.lookup_args.2', /\{session_id\}.*session\.id/);
  });

  it('refuses {session_id} in a field §2.3 does not list (version_args, summary.export_args)', () => {
    const manifest = fake();
    manifest.version_args = ['{session_id}'];
    manifest.summary.export_args = ['--id', '{session_id}'];
    const issues = issuesOf(manifest);
    expectIssue(issues, 'version_args.0', /\{session_id\}/);
    expectIssue(issues, 'summary.export_args.1', /\{session_id\}/);
  });

  it('refuses a placeholder in a scalar field that takes none (command)', () => {
    const manifest = fake();
    manifest.command = '{mcp_command}';
    expectIssue(issuesOf(manifest), 'command', /\{mcp_command\}/);
  });

  it('refuses prompt.via: stdin, because every format-1 manifest declares an interactive launch', () => {
    const manifest = fake();
    manifest.prompt.via = 'stdin';
    manifest.launch.interactive.args = manifest.launch.interactive.args.slice(0, 3);
    manifest.launch.headless.args = manifest.launch.headless.args.slice(0, 4);
    expectIssue(issuesOf(manifest), 'prompt.via', /stdin.*interactive/);
  });
});

describe('AC 3 — required-with rules', () => {
  it('mcp.template is required with mcp.via: config-file', () => {
    const manifest = fake();
    delete manifest.mcp.template;
    expectIssue(issuesOf(manifest), 'mcp.template', /required.*config-file/);
  });

  it('mcp.via has no `none`', () => {
    const manifest = fake();
    manifest.mcp.via = 'none';
    expect(issuesOf(manifest).some((issue) => issue.path === 'mcp.via')).toBe(true);
  });

  it('session.assign_args is required with session.id: assign', () => {
    const manifest = fake();
    delete manifest.session.assign_args;
    expectIssue(issuesOf(manifest), 'session.assign_args', /required.*assign/);
  });

  it('session.lookup_args and session.field are required with session.id: lookup', () => {
    const manifest = fake();
    manifest.session.id = 'lookup';
    delete manifest.session.assign_args;
    delete manifest.session.lookup_args;
    delete manifest.session.field;
    manifest.usage.lookup_args = ['--last'];
    const issues = issuesOf(manifest);
    expectIssue(issues, 'session.lookup_args', /required.*lookup/);
    expectIssue(issues, 'session.field', /required.*lookup/);
  });

  it('session.field is required with session.id: output', () => {
    const manifest = fake();
    manifest.session.id = 'output';
    delete manifest.session.assign_args;
    delete manifest.session.lookup_args;
    delete manifest.session.field;
    manifest.usage.lookup_args = ['--last'];
    expectIssue(issuesOf(manifest), 'session.field', /required.*output/);
  });

  it('usage.lookup_args and usage.fields are required with usage.from: lookup; usage.fields with output', () => {
    const lookup = fake();
    delete lookup.usage.lookup_args;
    delete lookup.usage.fields;
    const issues = issuesOf(lookup);
    expectIssue(issues, 'usage.lookup_args', /required.*lookup/);
    expectIssue(issues, 'usage.fields', /required.*lookup/);

    const output = fake();
    output.usage.from = 'output';
    delete output.usage.lookup_args;
    delete output.usage.fields;
    expectIssue(issuesOf(output), 'usage.fields', /required.*output/);
  });

  it('session.id: none and usage.from: none need nothing more', () => {
    const manifest = fake();
    manifest.session = { id: 'none', resume: { supported: false } };
    manifest.usage = { from: 'none' };
    expect(issuesOf(manifest)).toEqual([]);
  });

  it('verified_with is required on a built-in, and optional on a custom adapter', () => {
    const manifest = fake();
    expectIssue(issuesOf(manifest, 'built-in'), 'verified_with', /required.*built-in/);
    manifest.verified_with = 'fake 1.0.0';
    expect(issuesOf(manifest, 'built-in')).toEqual([]);
    expect(issuesOf(manifest, 'custom')).toEqual([]);
  });
});

describe('AC 4 (parse half) — the file basename must equal `name`', () => {
  it('refuses a manifest whose name differs from its file basename', () => {
    expectIssue(issuesOf(fake(), 'custom', 'other'), 'name', /basename/);
  });
});

describe('a manifest that is not YAML', () => {
  it('is refused as a parse error naming the file', () => {
    expect(() =>
      parseAdapterManifest('name: [unclosed', { name: 'fake', kind: 'custom', file: 'HEAD:.wingfoil/agents/custom/fake.yaml' }),
    ).toThrow(ValidationError);
  });
});

describe('the module surface', () => {
  it('format 1 is the only format, and the schema alone accepts the fake adapter', () => {
    expect(ADAPTER_MANIFEST_FORMAT).toBe(1);
    expect(AdapterManifest.safeParse(fake()).success).toBe(true);
  });

  it('Pass-2 issues carry their own codes: cross-field rules E_ADAPTER_MANIFEST, placeholders E_ADAPTER_PLACEHOLDER', () => {
    const manifest = fake();
    delete manifest.mcp.template;
    manifest.launch.interactive.args.push('{nope}');
    const codes = new Set(issuesOf(manifest).map((issue) => issue.code));
    expect([...codes].sort()).toEqual([E_ADAPTER_MANIFEST, E_ADAPTER_PLACEHOLDER].sort());
  });

  it('placeholderIssues can be run on its own, and finds nothing in the fake adapter', () => {
    expect(placeholderIssues(fake() as never, 'f.yaml')).toEqual([]);
  });
});
