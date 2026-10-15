/**
 * task-284 (bug-377, REQ-SEC-01): a `git` that cannot be spawned is reported as such, not as an unset
 * identity.
 *
 * `readIdentityConfig` used to catch every failure of its one `git config` spawn and return an empty
 * map, so a git that never ran (`ENOENT`, `EACCES`, `EPERM` — bug-377 saw `EPERM` under a sandbox)
 * read as "no identity" and the user was told `git identity not configured (user.name/user.email)`
 * about a configuration that was right. The design (task-284, D1) gives the spawn failure its own
 * refusal, `could not run git: <cause>` with `CoreError.code` `IO` (exit `1`), where `<cause>` is the
 * spawn error's message (`spawnSync git ENOENT`).
 *
 * Every repository here HAS a configured local identity, with global/system config isolated to an
 * empty file and the `GIT_AUTHOR_*` / `GIT_COMMITTER_*` variables removed, so the only fault in rows
 * (i)-(iii) is the spawn. The unrunnable git is made by pointing `process.env.PATH` (which
 * `readIdentityConfig` passes to its child explicitly, task-014) at an empty directory (ENOENT) or at
 * a directory holding a mode-0644 file named `git` (EACCES). `PATH` is restored before any fixture git
 * call, and in `afterEach`.
 *
 * Rows (iv) and (v) are characterization (they pass before the fix): the read-only `readGitIdentity`
 * keeps returning an empty identity on a spawn failure (D3), and a git that RUNS and exits `128` keeps
 * REQ-SEC-01's message (D2).
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import { readGitIdentity, requireGitIdentity } from '../../src/core/git-identity';
import type { CoreResult } from '../../src/core/types';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const IDENTITY_ERROR = 'git identity not configured (user.name/user.email)';

const KEYS = [
  'PATH',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
] as const;

function memoryAdd(): (params: Record<string, unknown>) => Promise<CoreResult<unknown>> {
  const op = CORE_MODULES.find((candidate) => candidate.name === 'memory')?.operations.memoryAdd;
  if (!op) throw new Error('fixture bug: "memory.memoryAdd" is not registered');
  return op.fn as (params: Record<string, unknown>) => Promise<CoreResult<unknown>>;
}

/** An empty directory: with it as `PATH`, `git` cannot be found (ENOENT). */
function emptyBinDir(): string {
  return mkdtempSync(join(tmpdir(), 'wf-nogit-'));
}

/** A directory whose only entry is a non-executable file named `git`: spawning it fails with EACCES. */
function nonExecutableGitDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-noexec-git-'));
  const fake = join(dir, 'git');
  writeFileSync(fake, '#!/bin/sh\nexit 0\n');
  chmodSync(fake, 0o644);
  return dir;
}

const UNRUNNABLE: readonly (readonly [string, () => string, string])[] = [
  ['an empty directory as PATH (ENOENT)', emptyBinDir, 'could not run git: spawnSync git ENOENT'],
  ['a non-executable git first on PATH (EACCES)', nonExecutableGitDir, 'could not run git: spawnSync git EACCES'],
];

describe('task-284 — a git that cannot be spawned is refused as "could not run git", not as an unset identity', () => {
  let repo: string;
  let binDir: string | undefined;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
    repo = mkdtempSync(join(tmpdir(), 'wf-identity-spawn-'));
    execFileSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf-8' });
    // Inside `.git`, so it never shows in `git status`.
    const empty = join(repo, '.git', 'empty.gitconfig');
    writeFileSync(empty, '');
    process.env.GIT_CONFIG_GLOBAL = empty;
    process.env.GIT_CONFIG_SYSTEM = empty;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;
    delete process.env.GIT_COMMITTER_NAME;
    delete process.env.GIT_COMMITTER_EMAIL;
    // A configured identity: the only fault in the red rows is the spawn itself.
    execFileSync('git', ['-C', repo, 'config', 'user.name', 'Test Dev'], { encoding: 'utf-8' });
    execFileSync('git', ['-C', repo, 'config', 'user.email', 'dev@example.com'], { encoding: 'utf-8' });
    binDir = undefined;
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    removeTempDir(repo);
    if (binDir !== undefined) removeTempDir(binDir);
  });

  it('control: with git on PATH the configured identity passes the check', () => {
    expect(requireGitIdentity(repo)).toEqual({ ok: true, value: { name: 'Test Dev', email: 'dev@example.com' } });
  });

  it.each(UNRUNNABLE)('AC 1 (red-first): requireGitIdentity with %s refuses with IO "could not run git: <cause>", exit 1', (_label, makeBin, message) => {
    binDir = makeBin();
    process.env.PATH = binDir;
    const result = requireGitIdentity(repo);
    process.env.PATH = saved.PATH;

    expect(result).toEqual({ ok: false, error: { code: 'IO', message } });
    expect(exitCodeForResult(result)).toBe(1);
  });

  it.each(UNRUNNABLE)('AC 1 (red-first): memory add with %s returns the same refusal and writes nothing', async (_label, makeBin, message) => {
    const unchanged = snapshotPersistence(repo);
    binDir = makeBin();
    process.env.PATH = binDir;
    const result = await memoryAdd()({ root: repo, options: { type: 'note', title: 'x' } });
    process.env.PATH = saved.PATH;

    expect(result).toEqual({ ok: false, error: { code: 'IO', message } });
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC 1 (characterization, D3): readGitIdentity with an unrunnable git still returns an empty identity', () => {
    binDir = emptyBinDir();
    process.env.PATH = binDir;
    const identity = readGitIdentity(repo);
    process.env.PATH = saved.PATH;

    expect(identity).toEqual({ name: '', email: '' });
  });

  it('AC 1 (characterization, D2): a git that runs and exits 128 (a root it cannot enter) keeps REQ-SEC-01\'s message', () => {
    // A fresh temp directory's child that is never created: git's `-C` cannot enter it (exit 128).
    binDir = mkdtempSync(join(tmpdir(), 'wf-missing-root-'));
    const result = requireGitIdentity(join(binDir, 'nonexistent'));

    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: IDENTITY_ERROR } });
    expect(exitCodeForResult(result)).toBe(1);
  });
});
