/**
 * task-210 / `bug-217-memory-add-leaves-its-new-document-staged-when-its-commit-fails` — a write whose
 * commit git refuses leaves the repository as it found it, and says so in WingFoil's words.
 *
 * Driven through the REAL compiled `dist/cli.js` with a refusing `pre-commit` hook, the trigger
 * `bug-217`'s reproduction uses. Before the fix, `memory add` left its new document written and
 * **staged**, the retry skipped its number, and stderr carried git's raw
 * `error: Command failed: git -C <absolute path> commit --only …` (the `bug-251` class: an absolute path
 * on stderr). The commit primitive (`writeAndCommit`, `src/storage/commit.ts`) now restores the working
 * tree and the index of every path it wrote, for every mutating verb, so the transition verbs and
 * `directive remove` are pinned here too.
 *
 * `dist/` is built once by jest's `globalSetup` (`bug-003`). Deterministic: fixed steps and fixture text.
 */
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

function wingfoil(cwd: string, ...args: string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

const itOnPosix = process.platform === 'win32' ? it.skip : it;

describe('a commit git refuses leaves nothing behind (bug-217)', () => {
  let repo: string;
  let hook: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const init = wingfoil(repo, 'init', '--template', 'Kanban');
    if (init.status !== 0) throw new Error(`fixture bug: init failed: ${init.stderr}`);
    hook = join(repo, '.git', 'hooks', 'pre-commit');
  });
  afterEach(() => removeTempDir(repo));

  function refuseCommits(): void {
    writeFileSync(hook, '#!/bin/sh\necho "hook: refused" >&2\nexit 1\n', 'utf-8');
    chmodSync(hook, 0o755);
  }

  itOnPosix('memory add: nothing written or staged, a WingFoil error without the absolute path, and the retry keeps the number', () => {
    refuseCommits();
    const before = snapshotPersistence(repo, ['docs/memory/bug/bug-001-hooked.md']);

    const refused = wingfoil(repo, 'memory', 'add', '--type', 'bug', '--title', 'Hooked');

    expect(refused.status).toBe(1);
    assertPersistenceUnchanged(repo, before, 'refused memory add');
    expect(refused.stderr).not.toContain(repo);
    expect(refused.stderr).not.toContain('Command failed');
    expect(refused.stderr).toContain('E_COMMIT_FAILED');
    expect(refused.stderr).toContain('docs/memory/bug/bug-001-hooked.md');
    expect(refused.stderr).toContain('hook: refused');
    expect(refused.stderr).toContain('nothing was committed');

    rmSync(hook);
    const retried = wingfoil(repo, 'memory', 'add', '--type', 'bug', '--title', 'Hooked', '--format', 'json');
    expect(retried.status).toBe(0);
    expect(JSON.parse(retried.stdout)).toEqual({ id: 'bug-001-hooked', path: 'docs/memory/bug/bug-001-hooked.md' });
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  itOnPosix('memory submit: the document keeps its bytes — the uncommitted content it carries included — and nothing is staged', () => {
    expect(wingfoil(repo, 'memory', 'add', '--type', 'task', '--title', 'Carry').status).toBe(0);
    const doc = 'docs/memory/task/task-001-carry.md';
    writeFileSync(join(repo, doc), `${readFileSync(join(repo, doc), 'utf-8')}\nUncommitted scope line.\n`);
    refuseCommits();
    const before = snapshotPersistence(repo, [doc]);
    const staged = gitOut(repo, ['ls-files', '-s', '--', doc]);

    const refused = wingfoil(repo, 'memory', 'submit', 'task-001-carry');

    expect(refused.status).toBe(1);
    assertPersistenceUnchanged(repo, before, 'refused memory submit');
    expect(gitOut(repo, ['ls-files', '-s', '--', doc])).toBe(staged);
    expect(refused.stderr).toContain('E_COMMIT_FAILED');
    expect(refused.stderr).not.toContain(repo);
  });

  itOnPosix('directive remove: the deleted file is back, and nothing is staged', () => {
    expect(wingfoil(repo, 'directive', 'create', '--name', 'keep-me').status).toBe(0);
    refuseCommits();
    const before = snapshotPersistence(repo, ['.wingfoil/directives/custom/keep-me.md']);

    const refused = wingfoil(repo, 'directive', 'remove', 'keep-me');

    expect(refused.status).toBe(1);
    assertPersistenceUnchanged(repo, before, 'refused directive remove');
    expect(refused.stderr).not.toContain(repo);
  });
});
