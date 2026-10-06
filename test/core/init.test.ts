/**
 * task-018-implement-git-backed-storage (P1.1, REQ-SYS-01) — `initWingfoilStorage`, the CoreResult
 * wrapper that surfaces `.wingfoil/` initialization as a domain operation behind both surfaces
 * (REQ-SYS-05). It wires the two guard rails the BDD acceptance contract requires as `CoreResult`
 * errors so they map to exit 1 (spec-005 §1, exitCodeForError):
 *   - "Error - target directory is not a git repository" → error message
 *     "not a git repository: run 'git init' first", and .wingfoil/ is NOT created.
 *   - the git-identity pre-flight (REQ-SEC-01, task-014) refuses an unattributable commit.
 * The user-facing `wingfoil init` CLI command/wizard is task-029's scope, not this task's.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exitCodeForResult, requireInitializedProject, WINGFOIL_NOT_INITIALIZED } from '../../src/core';
import { WINGFOIL_ALREADY_INITIALIZED, initWingfoilProject, initWingfoilStorage } from '../../src/core/init';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const NOT_A_GIT_REPO = "not a git repository: run 'git init' first";
const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;

describe('initWingfoilStorage (P1.1, REQ-SYS-01)', () => {
  describe('Error - target directory is not a git repository (scenario 3)', () => {
    let dir: string;
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('returns a VALIDATION error with the exact message and creates no .wingfoil/', () => {
      dir = mkdtempSync(join(tmpdir(), 'wf-not-a-repo-'));
      const result = initWingfoilStorage(dir);

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: NOT_A_GIT_REPO } });
      expect(existsSync(join(dir, '.wingfoil'))).toBe(false);
    });

    it('the not-a-git-repo error maps to exit code 1 (spec-005 §1)', () => {
      dir = mkdtempSync(join(tmpdir(), 'wf-not-a-repo-'));
      expect(exitCodeForResult(initWingfoilStorage(dir))).toBe(1);
    });
  });

  describe('git-identity pre-flight (REQ-SEC-01)', () => {
    let dir: string;
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'wf-init-noid-'));
      execFileSync('git', ['-C', dir, 'init', '-q'], { encoding: 'utf-8' });
      const emptyConfig = join(dir, 'empty.gitconfig');
      writeFileSync(emptyConfig, '');
      for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
      process.env.GIT_CONFIG_GLOBAL = emptyConfig;
      process.env.GIT_CONFIG_SYSTEM = emptyConfig;
      process.env.GIT_CONFIG_NOSYSTEM = '1';
    });

    afterEach(() => {
      for (const key of ISOLATION_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      rmSync(dir, { recursive: true, force: true });
    });

    it('refuses (VALIDATION, exit 1) when no git identity is configured', () => {
      const result = initWingfoilStorage(dir);
      expect(result.ok).toBe(false);
      expect(exitCodeForResult(result)).toBe(1);
    });
  });

  describe('success', () => {
    let repo: string;
    afterEach(() => removeTempDir(repo));

    it('initializes and returns ok with the produced commit {sha, message}', () => {
      repo = makeTempGitRepo();
      const result = initWingfoilStorage(repo);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.commit?.sha).toMatch(/^[0-9a-f]{40}$/);
        expect(result.commit?.message.length).toBeGreaterThan(0);
      }
      expect(existsSync(join(repo, '.wingfoil', 'dna.yaml'))).toBe(true);
      expect(exitCodeForResult(result)).toBe(0);
    });
  });

  /**
   * task-135 / `bug-088-init-storage-has-no-already-initialized-guard`: the two init entry points
   * agree that an initialized project is not re-initialized. `initWingfoilProject` refuses on
   * `detectInitState(root) === 'initialized'`; `initWingfoilStorage` used to overwrite a clean,
   * committed `dna.yaml` with the scaffold's and commit the diff under "initialize".
   */
  describe('Error - re-initializing an initialized project (bug-088)', () => {
    let repo: string;
    afterEach(() => removeTempDir(repo));

    const DNA = '.wingfoil/dna.yaml';
    const HAND_AUTHORED = '# a hand-authored dna.yaml, committed\nproject:\n  name: kept\n';
    const head = (): string => git(repo, ['rev-parse', 'HEAD']).trim();

    it('refuses like initWingfoilProject, exit 1, and leaves the committed dna.yaml unchanged', () => {
      repo = makeTempGitRepo();
      writeFixtureFile(repo, DNA, HAND_AUTHORED);
      commitAll(repo, 'seed: a committed, hand-authored dna.yaml');
      const before = head();

      const result = initWingfoilStorage(repo);

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: WINGFOIL_ALREADY_INITIALIZED } });
      expect(exitCodeForResult(result)).toBe(1);
      expect(readFileSync(join(repo, DNA), 'utf-8')).toBe(HAND_AUTHORED);
      expect(head()).toBe(before);
      expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
    });

    it('refuses a project initialized by its own earlier run — the second call commits nothing', () => {
      repo = makeTempGitRepo();
      expect(initWingfoilStorage(repo).ok).toBe(true);
      const before = head();

      const unchanged = snapshotPersistence(repo);
      const result = initWingfoilStorage(repo);

      expect(result).toMatchObject({ ok: false, error: { message: WINGFOIL_ALREADY_INITIALIZED } });
      expect(head()).toBe(before);
      assertPersistenceUnchanged(repo, unchanged);
    });

    it('gives the same answer as initWingfoilProject on the same initialized project', () => {
      repo = makeTempGitRepo();
      expect(initWingfoilProject(repo, 'Scrum').ok).toBe(true);

      const storage = initWingfoilStorage(repo);
      const project = initWingfoilProject(repo, 'Scrum');

      expect(storage.ok).toBe(false);
      expect(project.ok).toBe(false);
      expect(storage.ok ? '' : storage.error.message).toBe(project.ok ? '' : project.error.message);
    });

    it('still initializes an INCOMPLETE project (an empty .wingfoil/), as initWingfoilProject does', () => {
      repo = makeTempGitRepo();
      mkdirSync(join(repo, '.wingfoil'));

      expect(initWingfoilStorage(repo).ok).toBe(true);
      expect(existsSync(join(repo, DNA))).toBe(true);
    });
  });

  /**
   * task-135 review: a `.wingfoil` that exists but is a regular FILE. `detectInitState` calls
   * `readdirSync` on it and throws `ENOTDIR`; once the already-initialized guard joined
   * `initWingfoilStorage` that throw escaped it (before, `initStorage`'s own failure came back as an
   * `IO` result), and `initWingfoilProject` has thrown there since task-029. Both now refuse with a
   * result, exit 1, and leave the file alone.
   */
  describe.each([
    ['initWingfoilStorage', (root: string) => initWingfoilStorage(root)],
    ['initWingfoilProject', (root: string) => initWingfoilProject(root, 'Scrum')],
  ])('Error - .wingfoil is not a directory: %s', (_name, runInit) => {
    let repo: string;
    afterEach(() => removeTempDir(repo));

    it('returns a VALIDATION result (exit 1) instead of throwing, and writes nothing', () => {
      repo = makeTempGitRepo();
      writeFileSync(join(repo, '.wingfoil'), 'not a directory\n', 'utf-8');

      const unchanged = snapshotPersistence(repo);
      let result: ReturnType<typeof runInit> | undefined;
      expect(() => {
        result = runInit(repo);
      }).not.toThrow();

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
      expect(result && !result.ok ? result.error.message : '').toContain('.wingfoil');
      expect(exitCodeForResult(result!)).toBe(1);
      expect(readFileSync(join(repo, '.wingfoil'), 'utf-8')).toBe('not a directory\n');
      expect(git(repo, ['rev-list', '--all', '--count']).trim()).toBe('0');
      assertPersistenceUnchanged(repo, unchanged);
    });
  });
});

// task-143 (bug-154): the shared not-initialized refusal, through the `src/core` barrel the MCP
// pre-flight (task-174) will import it from. spec-011's `absent` state is refused; an `incomplete`
// (empty) `.wingfoil/` is a configured project that declares nothing yet, and passes.
describe('requireInitializedProject (task-143, spec-011 absent state)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => removeTempDir(repo));

  it('refuses a root with no .wingfoil/: VALIDATION, exit 1, the shared message', () => {
    const result = requireInitializedProject(repo);
    expect(exitCodeForResult(result)).toBe(1);
    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: WINGFOIL_NOT_INITIALIZED } });
  });

  it('passes an empty .wingfoil/ directory (spec-011 incomplete) and a populated one', () => {
    mkdirSync(join(repo, '.wingfoil'));
    expect(requireInitializedProject(repo).ok).toBe(true);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'version: 1.1\n');
    expect(requireInitializedProject(repo).ok).toBe(true);
  });
});
