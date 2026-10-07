/**
 * task-138 — `dna.yaml` declares `team.agents[].adapter` and the `runs` paths category
 * (`spec-016-agent-execution` §2.1 and §4.1; `spec-002-dna-yaml-schema`).
 *
 * Until this task both were tolerated by `.passthrough()` but not declared, so the write verbs refused
 * them as unknown keys (`spec-002` "Unknown keys: accepted on read, refused on write") and a document
 * could carry any `adapter` value and any number of run-log directories. This file drives the real,
 * registered `CORE_MODULES` operations — the same `CoreFn`s the CLI commands and the MCP Tools call —
 * against a THROWAWAY git repo, plus the compiled CLI for the end-to-end `paths runs` case — the BDD
 * scenario "Query the run-log category of a freshly initialized project"
 * (`docs/02_requirements/02_bdd/features/p2-dna/P2.5-paths.feature`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, loadDnaYaml } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');

const DNA_FIXTURE = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: roberto
      roles: [ approver ]
  agents:
    - name: claude
      email: noreply@anthropic.com
      executes_as: [ developer ]
      approval_authority: false
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

function operation(moduleName: string, name: string): { fn: CoreFn<unknown, unknown>; positionalDescription?: string } {
  const found = CORE_MODULES.find((module) => module.name === moduleName)?.operations[name];
  if (!found) throw new Error(`fixture bug: ${moduleName}.${name} is not registered`);
  return { fn: found.fn, positionalDescription: found.positional?.description };
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function dnaText(repo: string): string {
  return readFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'utf-8');
}

describe('task-138 — the DNA declarations spec-016 needs', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE);
    commitAll(repo, 'seed dna.yaml');
  });

  afterEach(() => removeTempDir(repo));

  describe('team.agents[].adapter (AC1, spec-016 §2.1)', () => {
    it('`dna update team.agents.claude --entry-adapter claude-code` writes the field and commits', async () => {
      const result = await operation('dna', 'dnaUpdate').fn({
        root: repo,
        positionals: ['team.agents.claude'],
        options: { 'entry-adapter': 'claude-code' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(exitCodeForResult(result)).toBe(0);
      expect(result.commit?.sha).toBe(head(repo));
      expect(loadDnaYaml(repo).team.agents?.[0]?.adapter).toBe('claude-code');
    });

    it('an adapter name outside the id class is refused at exit 1, leaving the file and HEAD untouched', async () => {
      const before = head(repo);
      const unchanged = snapshotPersistence(repo);
      const text = dnaText(repo);
      const result = await operation('dna', 'dnaUpdate').fn({
        root: repo,
        positionals: ['team.agents.claude'],
        options: { 'entry-adapter': 'Claude Code' },
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain('team.agents.0.adapter');
      expect(head(repo)).toBe(before);
      expect(dnaText(repo)).toBe(text);
      assertPersistenceUnchanged(repo, unchanged);
    });

    it('a document carrying a non-string adapter does not load', () => {
      writeFixtureFile(
        repo,
        '.wingfoil/dna.yaml',
        DNA_FIXTURE.replace('      approval_authority: false\n', '      approval_authority: false\n      adapter: 42\n'),
      );
      expect(() => loadDnaYaml(repo)).toThrow(/team\.agents\.0\.adapter/);
    });
  });

  describe('paths.runs (AC2, AC3, spec-016 §4.1)', () => {
    it('`dna add paths.runs --value docs/runs/` is a declared path now, not an unknown key', async () => {
      const result = await operation('dna', 'dnaAdd').fn({
        root: repo,
        positionals: ['paths.runs'],
        options: { value: 'docs/runs/' },
      });
      expect(result.ok).toBe(true);
      expect(loadDnaYaml(repo).paths.runs).toEqual(['docs/runs/']);
    });

    it('a second run-log directory is refused at exit 1, naming paths.runs', async () => {
      const first = await operation('dna', 'dnaAdd').fn({ root: repo, positionals: ['paths.runs'], options: { value: 'docs/runs/' } });
      expect(first.ok).toBe(true);
      const before = head(repo);
      const unchanged = snapshotPersistence(repo);

      const second = await operation('dna', 'dnaAdd').fn({ root: repo, positionals: ['paths.runs'], options: { value: 'var/runs/' } });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(exitCodeForResult(second)).toBe(1);
      expect(second.error.message).toContain('paths.runs');
      expect(head(repo)).toBe(before);
      assertPersistenceUnchanged(repo, unchanged);
    });

    it('a document declaring two run-log directories does not load, and the error names paths.runs', () => {
      writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}  runs: [ docs/runs/, var/runs/ ]\n`);
      expect(() => loadDnaYaml(repo)).toThrow(/paths\.runs/);
    });

    it('`paths runs` returns the declared directory (the category lookup is by name)', async () => {
      writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}  runs: [ docs/runs/ ]\n`);
      const result = await operation('paths', 'paths').fn({ root: repo, positional: 'runs' });
      expect(result).toEqual({ ok: true, value: { category: 'runs', paths: ['docs/runs/'] } });
    });

    it('the `paths` positional description lists runs beside the five P2.5 categories', () => {
      const description = operation('paths', 'paths').positionalDescription ?? '';
      for (const category of ['sources', 'tests', 'docs', 'config', 'governance', 'runs']) {
        expect(description).toContain(category);
      }
    });
  });
});

describe('task-138 — end to end: a freshly initialized project answers `wingfoil paths runs` (AC3, AC4)', () => {
  let repo: string;

  function runCli(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf-8' });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }

  beforeEach(() => {
    repo = makeTempGitRepo();
    const init = runCli(['init', '--template', 'scrum']);
    if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
  });

  afterEach(() => removeTempDir(repo));

  it('prints docs/runs/ and exits 0', () => {
    const result = runCli(['paths', 'runs', '--format', 'json']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ category: 'runs', paths: ['docs/runs/'] });
  });
});
