/**
 * task-196 — `wingfoil init` installs the built-in adapter manifests (`spec-016` §2.1, `adr-012` point 2)
 * under `.wingfoil/agents/built-in/`, scaffolds an empty `agents/custom/`, and runs the same pre-write
 * integrity pass over the manifests that it runs over the P3.8 directive templates: the REQ-SEC-10 schema
 * check (task-177's manifest schema) and the spec-007 §4 step 5 secret scan.
 *
 * The mechanism is driven through the test-only `builtinAdapters` seam with a fixture manifest, as the
 * AC asks; the shipped list (`claude-code` since task-236) is pinned per adapter in
 * `test/storage/builtin-adapter-<name>.test.ts`. The empty-list `.gitkeep` branch stays covered through
 * the seam (`templateScaffold(SCRUM, [])`). task-236 also pins the P5.1.1 Scenario Outline for the
 * integrity / secret-scan refusal against the real shipped manifest (the B1 handover). Every "secret"
 * below is an obviously fake value assembled at runtime (`security-secrets` S1, dl-122).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadAdapter, parseAdapterManifest } from '../../src/agent';
import { exitCodeForResult } from '../../src/core';
import { verifyBuiltinTemplates } from '../../src/core/builtin-integrity';
import { initWingfoilProject } from '../../src/core/init';
import {
  BUILTIN_ADAPTERS,
  BUILTIN_ADAPTERS_DIR,
  CUSTOM_ADAPTERS_DIR,
  TEMPLATES,
  builtinTemplateSources,
  templateScaffold,
  type BuiltinAdapterManifest,
} from '../../src/storage';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { FAKE_PEM_RSA_HEADER } from '../validation/helpers/secret-fixtures';

/** A schema-valid built-in manifest for `name`; `extra` lines are appended at the end of the file. */
function manifestText(name: string, extra = ''): string {
  return `name: ${name}
format: 1
command: ${name}
verified_with: "${name} 0.0.0 (test fixture)"
launch:
  interactive:
    args: [ --mcp-config, "{mcp_config_file}", "{bootstrap}" ]
prompt:
  via: arg
mcp:
  via: config-file
  template: |
    {"mcpServers": {"wingfoil": {"command": "{mcp_command}", "args": {mcp_args}}}}
session:
  id: none
  resume:
    supported: false
usage:
  from: none
${extra}`;
}

const FIXTURE: BuiltinAdapterManifest = { name: 'fixture-agent', content: manifestText('fixture-agent') };
const FIXTURE_PATH = `${BUILTIN_ADAPTERS_DIR}/fixture-agent.yaml`;
const CUSTOM_KEEP = `${CUSTOM_ADAPTERS_DIR}/.gitkeep`;
const SCRUM = TEMPLATES[0]!;

/** The paths the init commit (HEAD) touched. */
function committedPaths(repo: string): string[] {
  return git(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter((line) => line !== '');
}

describe('the fixture manifest itself', () => {
  it('is a valid built-in manifest under the task-177 schema (so a failure below is the seam, not the fixture)', () => {
    expect(() =>
      parseAdapterManifest(FIXTURE.content, { name: FIXTURE.name, kind: 'built-in', file: FIXTURE_PATH }),
    ).not.toThrow();
  });
});

describe('templateScaffold — agents/{built-in,custom}/ (spec-016 §2.1)', () => {
  it('writes one file per given built-in adapter, at agents/built-in/<name>.yaml, with its content verbatim', () => {
    const files = templateScaffold(SCRUM, [FIXTURE]);
    expect(files.find((file) => file.path === FIXTURE_PATH)?.content).toBe(FIXTURE.content);
  });

  it('scaffolds agents/custom/ empty: a .gitkeep and nothing else', () => {
    const custom = templateScaffold(SCRUM, [FIXTURE]).filter((file) => file.path.startsWith(`${CUSTOM_ADAPTERS_DIR}/`));
    expect(custom).toEqual([{ path: CUSTOM_KEEP, content: '' }]);
  });

  it('by default installs exactly the shipped list, BUILTIN_ADAPTERS, and no .gitkeep (task-236: the list is non-empty)', () => {
    const installed = templateScaffold(SCRUM)
      .filter((file) => file.path.startsWith(`${BUILTIN_ADAPTERS_DIR}/`))
      .map((file) => file.path);
    expect(BUILTIN_ADAPTERS.length).toBeGreaterThan(0);
    expect(installed).toEqual(BUILTIN_ADAPTERS.map((adapter) => `${BUILTIN_ADAPTERS_DIR}/${adapter.name}.yaml`));
    expect(installed).not.toContain(`${BUILTIN_ADAPTERS_DIR}/.gitkeep`);
  });

  it('with an empty adapter list keeps agents/built-in/ with a .gitkeep and nothing else', () => {
    const installed = templateScaffold(SCRUM, [])
      .filter((file) => file.path.startsWith(`${BUILTIN_ADAPTERS_DIR}/`))
      .map((file) => file.path);
    expect(installed).toEqual([`${BUILTIN_ADAPTERS_DIR}/.gitkeep`]);
  });

  it('keeps the scaffold sorted by path (REQ-SYS-07)', () => {
    const paths = templateScaffold(SCRUM, [FIXTURE]).map((file) => file.path);
    expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('derives an `adapter` integrity source from each built-in manifest, and none from custom/', () => {
    const sources = builtinTemplateSources(templateScaffold(SCRUM, [FIXTURE])).filter((s) => s.kind === 'adapter');
    expect(sources).toEqual([{ name: 'fixture-agent', kind: 'adapter', content: FIXTURE.content }]);
  });
});

describe('initWingfoilProject — installs the built-in adapters in the init commit (AC 1)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('writes the manifest and an empty agents/custom/, both in the single init commit', () => {
    repo = makeTempGitRepo();
    const result = initWingfoilProject(repo, 'Scrum', undefined, [FIXTURE]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.files).toEqual(expect.arrayContaining([FIXTURE_PATH, CUSTOM_KEEP]));
    expect(readFileSync(join(repo, FIXTURE_PATH), 'utf-8')).toBe(FIXTURE.content);
    expect(git(repo, ['rev-list', '--count', 'HEAD']).trim()).toBe('1');
    expect(committedPaths(repo)).toEqual(expect.arrayContaining([FIXTURE_PATH, CUSTOM_KEEP]));
  });

  it('installs a manifest the task-177 loader then loads as a built-in at HEAD', () => {
    repo = makeTempGitRepo();
    expect(initWingfoilProject(repo, 'Scrum', undefined, [FIXTURE]).ok).toBe(true);

    const loaded = loadAdapter(repo, 'fixture-agent');
    expect(loaded).toMatchObject({ ok: true, value: { name: 'fixture-agent', kind: 'built-in', path: FIXTURE_PATH } });
  });
});

describe('initWingfoilProject — a schema-invalid built-in manifest aborts before any write (AC 2, REQ-SEC-10)', () => {
  const cases: ReadonlyArray<readonly [string, BuiltinAdapterManifest]> = [
    ['an unknown key', { name: 'fixture-agent', content: manifestText('fixture-agent', 'env: { TOKEN: x }\n') }],
    ['no verified_with', { name: 'fixture-agent', content: manifestText('fixture-agent').replace(/^verified_with:.*\n/m, '') }],
    ['a name other than the file basename', { name: 'fixture-agent', content: manifestText('other-agent') }],
    ['bytes that are not YAML', { name: 'fixture-agent', content: 'name: [unclosed\n' }],
  ];

  it.each(cases)('%s → VALIDATION naming the adapter, exit 1, nothing written', (_label, broken) => {
    const repo = makeTempGitRepo();
    try {
      const unchanged = snapshotPersistence(repo);
      const result = initWingfoilProject(repo, 'Scrum', undefined, [broken]);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION', message: 'built-in adapter template integrity check failed: fixture-agent' },
      });
      expect(exitCodeForResult(result)).toBe(1);
      expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
      assertPersistenceUnchanged(repo, unchanged);
    } finally {
      removeTempDir(repo);
    }
  });

  it('the same message shape as the built-in directive case: `built-in <kind> template integrity check failed: <name>`', () => {
    const [, broken] = cases[0]!;
    const failure = verifyBuiltinTemplates([{ name: broken.name, kind: 'adapter', content: broken.content }]);
    expect(failure).toEqual({
      name: 'fixture-agent',
      kind: 'adapter',
      message: 'built-in adapter template integrity check failed: fixture-agent',
    });
  });
});

describe('initWingfoilProject — the built-in manifests are secret-scanned before they are written (AC 3, spec-007 §4 step 5)', () => {
  it('a schema-valid manifest carrying a blocking finding aborts init, naming the adapter and the pattern', () => {
    const content = manifestText('fixture-agent', `# ${FAKE_PEM_RSA_HEADER}\n`);
    const line = content.split('\n').findIndex((text) => text.includes(FAKE_PEM_RSA_HEADER)) + 1;
    const repo = makeTempGitRepo();
    try {
      const unchanged = snapshotPersistence(repo);
      const result = initWingfoilProject(repo, 'Scrum', undefined, [{ name: 'fixture-agent', content }]);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION',
          message: `built-in adapter template secret scan failed: fixture-agent (private-key-pem, line ${line})`,
        },
      });
      expect(exitCodeForResult(result)).toBe(1);
      expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
      assertPersistenceUnchanged(repo, unchanged);
    } finally {
      removeTempDir(repo);
    }
  });
});

/**
 * task-236 (B1 handover from task-196's review): the P5.1.1 Scenario Outline "Error - a built-in adapter
 * manifest fails the pre-write check" pins the two refusals against the real shipped `claude-code`
 * manifest. This test reads the two `message` cells of its Examples table and drives each row.
 */
describe('P5.1.1 Scenario Outline — a built-in adapter manifest fails the pre-write check (task-236)', () => {
  const FEATURE = join(__dirname, '..', '..', 'docs', '02_requirements', '02_bdd', 'features', 'p5-interaction', 'P5.1.1-init.feature');
  const TITLE = 'Scenario Outline: Error - a built-in adapter manifest fails the pre-write check';

  /** The `message` cells of the outline's Examples table, in row order. */
  function exampleMessages(): string[] {
    const lines = readFileSync(FEATURE, 'utf-8').split('\n');
    const start = lines.findIndex((line) => line.trim() === TITLE);
    expect({ scenario: TITLE, found: start >= 0 }).toEqual({ scenario: TITLE, found: true });
    const rows: string[][] = [];
    let inExamples = false;
    for (const line of lines.slice(start + 1)) {
      const text = line.trim();
      if (/^(Scenario|Scenario Outline):/.test(text)) break;
      if (text === 'Examples:') inExamples = true;
      else if (inExamples && text.startsWith('|')) rows.push(text.slice(1, -1).split('|').map((cell) => cell.trim()));
    }
    const [header, ...body] = rows;
    expect(header).toEqual(['defect', 'message']);
    return body.map((row) => row[1]!);
  }

  function shippedClaudeCode(): BuiltinAdapterManifest {
    const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === 'claude-code');
    expect(entry).toBeDefined();
    return entry!;
  }

  it('declares exactly the two rows: integrity check and secret scan, both naming claude-code', () => {
    expect(exampleMessages()).toEqual([
      'built-in adapter template integrity check failed: claude-code',
      'built-in adapter template secret scan failed: claude-code (private-key-pem, line',
    ]);
  });

  it.each([
    ['row 1: a key the manifest schema does not declare', 0, 'env: { TOKEN: x }\n'],
    ['row 2: a private-key header', 1, `# ${FAKE_PEM_RSA_HEADER}\n`],
  ] as const)('%s → init exits 1 with the row\'s message, nothing written, no commit', (_label, row, extra) => {
    const message = exampleMessages()[row]!;
    const shipped = shippedClaudeCode();
    const content = shipped.content.endsWith('\n') ? `${shipped.content}${extra}` : `${shipped.content}\n${extra}`;
    const repo = makeTempGitRepo();
    try {
      const unchanged = snapshotPersistence(repo);
      const result = initWingfoilProject(repo, 'Scrum', undefined, [{ name: 'claude-code', content }]);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message.startsWith(message)).toBe(true);
      expect(exitCodeForResult(result)).toBe(1);
      expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
      assertPersistenceUnchanged(repo, unchanged);
    } finally {
      removeTempDir(repo);
    }
  });
});
