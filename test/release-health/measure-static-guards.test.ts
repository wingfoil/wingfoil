/**
 * task-233, independent review F1, F2, F6 — the static half gives no reading where it has nothing to read, never a zero:
 * a measurement point with no configuration (before task-111 moved `.wingfoil/` to the root, e.g. `v0.2.1`), and an
 * install size after a failed build; and it records the versions of the modules it ran.
 *
 * Deterministic: fixed dates, identities per command, no network; the toolchain is a stub runner.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { measureRelease } from '../../scripts/release-health/measure.cjs';
import type { MetricEntry, Report, ToolCall, ToolResult, ToolRunner } from '../../scripts/release-health/measure.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

// Each measure loads ESLint and TypeScript once per file and lints the fixture (about 4 s on the first).
jest.setTimeout(60_000);

const REPO_ROOT = join(__dirname, '..', '..');
const CATALOGUE = readFileSync(join(REPO_ROOT, 'docs', '08_health', 'metrics.yaml'), 'utf-8');
const ADA = { name: 'Ada Approver', email: 'ada@wingfoil.dev' };
const day = (n: number): string => `2026-09-${String(n).padStart(2, '0')}T10:00:00+00:00`;
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const MEMORY_YAML = 'version: 1\ntypes:\n  release:\n    path: "docs/memory/release/{id}.md"\n    states:\n      sequence: [draft, planning, in-development, releasing, released]\n';
const DNA_YAML = `version: 1.1\nteam:\n  members:\n    - name: ${ADA.name}\n      email: ${ADA.email}\n      roles: [ approver ]\n  agents: []\npaths:\n  sources: [ src/ ]\n  tests: [ test/ ]\n  health: [ docs/08_health/ ]\n`;
const RELEASE = '---\nid: "minor-v0.3"\ntype: release\ntitle: "v0.3"\nstatus: in-development\nversion: "v0.3"\n---\n\nScope.\n';
const PACKAGE = { name: 'wingfoil', version: '0.3.0', dependencies: { 'js-yaml': '^4.1.0' } };
const SOURCES = { 'src/index.ts': "import yaml from 'js-yaml';\n// Loads.\nexport const load = (text: string): unknown => yaml.load(text);\n", 'test/index.test.ts': "it('loads', () => undefined);\n" };

const repos: string[] = [];
afterAll(() => repos.forEach(removeTempDir));

function commit(root: string, subject: string, date: string, files: Readonly<Record<string, string>>): string {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, ['add', '-A']);
  execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', subject], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_NAME: ADA.name, GIT_AUTHOR_EMAIL: ADA.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_NAME: ADA.name, GIT_COMMITTER_EMAIL: ADA.email, GIT_COMMITTER_DATE: date },
  });
  return git(root, ['rev-parse', 'HEAD']).trim();
}

function entry(report: Report, id: string): MetricEntry {
  const found = report.metrics.find((m) => m.id === id);
  if (!found) throw new Error(`no ${id} in the report`);
  return found;
}

const BASE = { 'package.json': json(PACKAGE), 'package-lock.json': json({ name: 'wingfoil', lockfileVersion: 3, packages: {} }), ...SOURCES };
const CONFIG = { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA_YAML, 'docs/08_health/metrics.yaml': CATALOGUE, 'docs/memory/release/minor-v0.3.md': RELEASE };

describe('a measurement point with no configuration (F1)', () => {
  it('leaves Q05, Q07, Q08, Q09, Q10 and Q16 not-measurable with the reason, never a zero or a false breach', async () => {
    const root = makeTempGitRepo();
    repos.push(root);
    // The point: sources and a package with a used dependency, but no .wingfoil/ yet (like v0.2.1, before task-111).
    const point = commit(root, 'feat(core): task-001 — sources before the configuration', day(1), BASE);
    commit(root, 'chore: configure wingfoil', day(2), CONFIG);
    const report = await measureRelease(root, { release: 'v0.3', at: point, offline: true, toolchain: false });
    for (const id of ['Q05', 'Q07', 'Q08', 'Q09', 'Q10', 'Q16']) {
      const m = entry(report, id);
      expect([id, m.status]).toEqual([id, 'not-measurable']);
      expect(m).not.toHaveProperty('value');
      expect(m.reason).toContain('--at');
    }
  });
});

describe('Q08 after a failed build (F2)', () => {
  it('records no install size, with the reason, and does not pack', async () => {
    const root = makeTempGitRepo();
    repos.push(root);
    const scripts = { build: 'tsc', typecheck: 'tsc --noEmit', lint: 'eslint .', test: 'jest', 'test:coverage': 'jest --coverage', 'test:latency': 'jest' };
    const base = commit(root, 'chore: configure wingfoil', day(1), {
      ...BASE,
      ...CONFIG,
      'package.json': json({ ...PACKAGE, scripts }),
      '.github/workflows/publish.yml': `name: publish\nenv:\n  NODE_VERSION: '${process.version.slice(1)}'\njobs: {}\n`,
    });
    const point = commit(root, 'docs: note', day(2), { 'docs/note.md': 'Note.\n' });
    const calls: ToolCall[] = [];
    const tools: ToolRunner = (call): ToolResult => {
      calls.push(call);
      return { status: call.step === 'build' ? 2 : 0, signal: null };
    };
    const report = await measureRelease(root, { release: 'v0.3', at: point, previous: base, offline: true, tools });
    const q08 = entry(report, 'Q08');
    expect(q08).toMatchObject({ status: 'measured', value: { unused_runtime_dependencies: 0, install_size_bytes: null } });
    expect(String(q08.raw?.['install_size'])).toContain('npm run build did not succeed');
    expect(calls.map((c) => c.step)).not.toContain('footprint-pack');
    expect(calls.map((c) => c.step)).not.toContain('footprint-ls');
  });
});

describe('the module versions the static half ran (F6)', () => {
  it('Q05 records ESLint\'s and typescript-eslint\'s; Q07, Q09 and Q16 TypeScript\'s', async () => {
    const root = makeTempGitRepo();
    repos.push(root);
    const base = commit(root, 'chore: configure wingfoil', day(1), { ...BASE, ...CONFIG });
    const point = commit(root, 'docs: note', day(2), { 'docs/note.md': 'Note.\n' });
    const report = await measureRelease(root, { release: 'v0.3', at: point, previous: base, offline: true, toolchain: false });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const versions = {
      eslint: (require('eslint') as { Linter: { version: string } }).Linter.version,
      tseslint: (require('typescript-eslint/package.json') as { version: string }).version,
      ts: (require('typescript') as { version: string }).version,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(entry(report, 'Q05').raw).toMatchObject({ 'eslint version': versions.eslint, 'typescript-eslint version': versions.tseslint });
    for (const id of ['Q07', 'Q09', 'Q16']) expect([id, entry(report, id).raw?.['typescript version']]).toEqual([id, versions.ts]);
  });
});
