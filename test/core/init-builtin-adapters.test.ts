/**
 * task-196 — `wingfoil init` installs the built-in adapter manifests (`spec-016` §2.1, `adr-012` point 2)
 * under `.wingfoil/agents/built-in/`, scaffolds an empty `agents/custom/`, and runs the same pre-write
 * integrity pass over the manifests that it runs over the P3.8 directive templates: the REQ-SEC-10 schema
 * check (task-177's manifest schema) and the spec-007 §4 step 5 secret scan.
 *
 * No real built-in adapter ships yet (the two of `spec-016` §2.8 are their own tasks), so the mechanism
 * is driven through the test-only `builtinAdapters` seam with a fixture manifest, as the AC asks. Every
 * "secret" below is an obviously fake value assembled at runtime (`security-secrets` S1, dl-122).
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

  it('by default installs exactly the shipped list, BUILTIN_ADAPTERS, and keeps the directory with a .gitkeep while it is empty', () => {
    const installed = templateScaffold(SCRUM)
      .filter((file) => file.path.startsWith(`${BUILTIN_ADAPTERS_DIR}/`))
      .map((file) => file.path);
    const expected = BUILTIN_ADAPTERS.map((adapter) => `${BUILTIN_ADAPTERS_DIR}/${adapter.name}.yaml`);
    expect(installed).toEqual(BUILTIN_ADAPTERS.length === 0 ? [`${BUILTIN_ADAPTERS_DIR}/.gitkeep`] : expected);
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
