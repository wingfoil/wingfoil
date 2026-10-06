/**
 * task-029-implement-wingfoil-init (P5.1.1, spec-011-storage-layout, spec-005-cli-command-contract §1)
 * — `initWingfoilProject`, the CoreResult flow `wingfoil init` drives on both surfaces (REQ-SYS-05).
 * Covers the P5.1.1 BDD contract at the domain layer:
 *   (a) a chosen template creates the COMPLETE `.wingfoil/` layout in exactly one commit, exit 0;
 *   (c) an already-initialized project overwrites NOTHING and fails with the exact message, exit 1.
 * The not-a-git-repo and git-identity guards are inherited from task-018's write path.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exitCodeForResult } from '../../src/core';
import type { BuiltinTemplateSource } from '../../src/core/builtin-integrity';
import {
  WINGFOIL_ALREADY_INITIALIZED,
  initWingfoilProject,
} from '../../src/core/init';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const NOT_A_GIT_REPO = "not a git repository: run 'git init' first";

function headSha(root: string): string {
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

describe('initWingfoilProject — success (P5.1.1 AC (a))', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('creates the complete .wingfoil/ layout and returns ok with one commit, exit 0', () => {
    repo = makeTempGitRepo();
    const result = initWingfoilProject(repo, 'Scrum');

    expect(result.ok).toBe(true);
    expect(exitCodeForResult(result)).toBe(0);
    if (result.ok) {
      expect(result.value.template).toBe('Scrum');
      expect(result.commit?.sha).toMatch(/^[0-9a-f]{40}$/);
    }
    // All four pillars materialized on disk.
    expect(existsSync(join(repo, '.wingfoil', 'dna.yaml'))).toBe(true);
    expect(existsSync(join(repo, '.wingfoil', 'memory.yaml'))).toBe(true);
    expect(existsSync(join(repo, '.wingfoil', 'roles.yaml'))).toBe(true);
    expect(existsSync(join(repo, '.wingfoil', 'workflows.yaml'))).toBe(true);
    expect(existsSync(join(repo, '.wingfoil', 'directives', 'custom'))).toBe(true);
    expect(existsSync(join(repo, '.wingfoil', 'memory', 'templates', 'task.md'))).toBe(true);
    expect(existsSync(join(repo, '.wingfoil', 'workflows', 'custom', 'sw-life-cycle.yaml'))).toBe(true);
  });

  it('records the whole layout in a SINGLE commit (spec-011 / P1.1 git-backed storage)', () => {
    repo = makeTempGitRepo(); // fresh repo: no commits yet, so the init commit is the only one
    initWingfoilProject(repo, 'Kanban');
    const count = execFileSync('git', ['-C', repo, 'rev-list', '--count', 'HEAD'], {
      encoding: 'utf-8',
    }).trim();
    expect(count).toBe('1');
  });
});

describe('initWingfoilProject — already initialized (P5.1.1 AC (c))', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('overwrites nothing and fails with the exact message, exit 1', () => {
    repo = makeTempGitRepo();
    initWingfoilProject(repo, 'Scrum');

    const dnaPath = join(repo, '.wingfoil', 'dna.yaml');
    const dnaBefore = readFileSync(dnaPath, 'utf-8');
    const shaBefore = headSha(repo);

    const unchanged = snapshotPersistence(repo);
    const result = initWingfoilProject(repo, 'Kanban');

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: WINGFOIL_ALREADY_INITIALIZED },
    });
    // task-119 AC 3 (bug-129): the hint names what exists — hand edits under .wingfoil/ (committed
    // by the user) or the `dna` / `directive` commands (which commit themselves) — and no
    // "migration command", which WingFoil has never had.
    expect(WINGFOIL_ALREADY_INITIALIZED).toBe(
      'WingFoil already initialized (to change its configuration, edit the files under .wingfoil/ and commit them, or use the wingfoil dna and wingfoil directive commands)',
    );
    expect(WINGFOIL_ALREADY_INITIALIZED).not.toMatch(/migration/);
    expect(exitCodeForResult(result)).toBe(1);
    // Nothing overwritten: the Scrum dna.yaml and HEAD are untouched.
    expect(readFileSync(dnaPath, 'utf-8')).toBe(dnaBefore);
    expect(headSha(repo)).toBe(shaBefore);
    assertPersistenceUnchanged(repo, unchanged);
  });
});

describe('initWingfoilProject — guards inherited from the write path', () => {
  it('returns the exact not-a-git-repo VALIDATION error and creates no .wingfoil/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-init-nogit-'));
    try {
      const result = initWingfoilProject(dir, 'Scrum');
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: NOT_A_GIT_REPO } });
      expect(existsSync(join(dir, '.wingfoil'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown template (defense-in-depth VALIDATION) and writes nothing', () => {
    const repo = makeTempGitRepo();
    try {
      const unchanged = snapshotPersistence(repo);
      const result = initWingfoilProject(repo, 'NopeTemplate');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
      expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
      assertPersistenceUnchanged(repo, unchanged);
    } finally {
      removeTempDir(repo);
    }
  });
});

/**
 * task-044-builtin-template-integrity (REQ-SEC-10) — guard 5. In production the checked sources are
 * DERIVED from this run's `templateScaffold(template)` output (`builtinTemplateSources`,
 * src/storage/templates.ts), so the checked set cannot drift from the written set; the optional 3rd
 * `builtinTemplates` param is the TEST-ONLY override that exercises the abort path without real
 * corrupted content on disk (the real derived set — the six P3.8 built-in directives since task-057 —
 * is valid). A corrupted/schema-invalid source must abort `init` before ANY
 * file is written, exit 1, naming the failing template — BDD P3.8 "Error - a built-in template fails
 * its integrity check" / P4.17 "Error - a built-in workflow template is structurally invalid".
 */
describe('initWingfoilProject — REQ-SEC-10 built-in template integrity', () => {
  it('aborts before writing anything when a built-in directive template is corrupted', () => {
    const repo = makeTempGitRepo();
    try {
      const corrupted: readonly BuiltinTemplateSource[] = [
        { name: 'security', kind: 'directive', content: 'not a frontmatter document\n' },
      ];
      const result = initWingfoilProject(repo, 'Scrum', corrupted);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'built-in directive template integrity check failed: security',
        },
      });
      expect(exitCodeForResult(result)).toBe(1);
      expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
    } finally {
      removeTempDir(repo);
    }
  });

  it('aborts before writing anything when a built-in workflow template is structurally invalid', () => {
    const repo = makeTempGitRepo();
    try {
      const invalid: readonly BuiltinTemplateSource[] = [
        { name: 'task', kind: 'workflow', content: 'name: task\nkind: sub\n' }, // missing `phases`
      ];
      const result = initWingfoilProject(repo, 'Scrum', invalid);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION', message: 'built-in workflow template invalid: task' },
      });
      expect(exitCodeForResult(result)).toBe(1);
      expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
    } finally {
      removeTempDir(repo);
    }
  });

  it('still succeeds with the default derived sources (the six shipped P3.8 built-in directives, task-057)', () => {
    const repo = makeTempGitRepo();
    try {
      const result = initWingfoilProject(repo, 'Scrum');
      expect(result.ok).toBe(true);
    } finally {
      removeTempDir(repo);
    }
  });
});

/**
 * Second pass (review-gate `red` fallback) — the guard-5 call sits OUTSIDE `initWingfoilProject`'s
 * `try`/`catch`, so anything `verifyBuiltinTemplates` throws escapes the CoreResult contract entirely
 * (uncaught exception, not exit 1). An unrecognized `kind` must therefore come back as a `VALIDATION`
 * CoreResult like every other integrity failure — and, like them, write nothing.
 */
describe('initWingfoilProject — REQ-SEC-10 unrecognized built-in kind fails closed', () => {
  it('returns a VALIDATION result (exit 1) instead of throwing, and writes nothing', () => {
    const repo = makeTempGitRepo();
    try {
      const alien = [
        { name: 'mystery', kind: 'plugin', content: 'anything\n' },
      ] as unknown as readonly BuiltinTemplateSource[];

      const unchanged = snapshotPersistence(repo);
      let result: ReturnType<typeof initWingfoilProject> | undefined;
      expect(() => {
        result = initWingfoilProject(repo, 'Scrum', alien);
      }).not.toThrow();

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
      expect(result && !result.ok ? result.error.message : '').toContain('mystery');
      expect(exitCodeForResult(result!)).toBe(1);
      expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
      assertPersistenceUnchanged(repo, unchanged);
    } finally {
      removeTempDir(repo);
    }
  });
});
