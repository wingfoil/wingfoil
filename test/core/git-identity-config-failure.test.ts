/**
 * task-324 (bug-379, REQ-SEC-01): a `git` that runs but cannot READ its configuration is reported as
 * such, not as an unset identity.
 *
 * `readIdentityConfig` read git's exit `128` like exit `1`, so a `.git/config` git could not parse
 * (`fatal: bad config line 9 in file .git/config`) was reported as `git identity not configured
 * (user.name/user.email)` about an identity that was right. The design (task-324, approver gate of
 * 2026-10-31: D1-D4) gives every outcome of the one `git config` run other than `0` and `1` its own
 * refusal: `could not read git configuration: <git's message>`, `CoreError.code` `IO` (exit `1`), where
 * `<git's message>` is stderr trimmed per line, empty lines dropped, a leading `fatal: ` removed and
 * the lines joined with `; `; with nothing on stderr it is `git config exited <status>`.
 *
 * Every repository here HAS a configured local identity (except row (v)), with global/system config
 * isolated to an empty file and the `GIT_AUTHOR_*` / `GIT_COMMITTER_*` variables removed, so the only
 * fault is the configuration git cannot read. The `<n>` of `bad config line <n>` is read from a real
 * `git config` run in the test (the same command the check runs), never hard-coded.
 *
 * Rows (i)-(iii) and (vii) are red-first (they receive REQ-SEC-01's message today); rows (iv)-(vi) are
 * characterization (they pass before the fix): `readGitIdentity` keeps returning an empty identity (D4),
 * exit `1` (no key) keeps REQ-SEC-01's message, and the control passes. Row (vii)'s `git` is a stand-in
 * script that exits `128` with no output, not a copied fixture: no real git run is silent on exit `128`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import { readGitIdentity, requireGitIdentity } from '../../src/core/git-identity';
import type { CoreResult } from '../../src/core/types';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const IDENTITY_ERROR = 'git identity not configured (user.name/user.email)';
const PREFIX = 'could not read git configuration: ';

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

/**
 * The `<n>` of git's `bad config line <n> in file <file>`, read from a real run of the command the
 * identity check runs, against the current environment. Fails the test (not the check) when git does
 * not print that line.
 */
function badConfigLine(repo: string): number {
  const run = spawnSync('git', ['-C', repo, 'config', '-z', '--get-regexp', '^(author|committer|user)\\.(name|email)$'], {
    encoding: 'utf-8',
    env: process.env,
  });
  const match = /bad config line (\d+) in file /.exec(run.stderr);
  if (run.status !== 128 || !match) {
    throw new Error(`fixture bug: expected git to exit 128 on "bad config line", got ${String(run.status)}: ${run.stderr}`);
  }
  return Number(match[1]);
}

describe('task-324 — a git that cannot read its configuration is refused as "could not read git configuration", not as an unset identity', () => {
  let repo: string;
  let extraDir: string | undefined;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
    repo = mkdtempSync(join(tmpdir(), 'wf-identity-config-'));
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
    // A configured identity: the only fault in the red rows is the configuration git cannot read.
    execFileSync('git', ['-C', repo, 'config', 'user.name', 'Test Dev'], { encoding: 'utf-8' });
    execFileSync('git', ['-C', repo, 'config', 'user.email', 'dev@example.com'], { encoding: 'utf-8' });
    extraDir = undefined;
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    removeTempDir(repo);
    if (extraDir !== undefined) removeTempDir(extraDir);
  });

  it('control (vi): without the broken line the configured identity passes the check', () => {
    expect(requireGitIdentity(repo)).toEqual({ ok: true, value: { name: 'Test Dev', email: 'dev@example.com' } });
  });

  it('AC 1 (red-first, i): requireGitIdentity with an unparseable .git/config refuses with IO "could not read git configuration: bad config line <n> in file .git/config", exit 1', () => {
    appendFileSync(join(repo, '.git', 'config'), '[user\n');
    const n = badConfigLine(repo);

    const result = requireGitIdentity(repo);

    expect(result).toEqual({ ok: false, error: { code: 'IO', message: `${PREFIX}bad config line ${n} in file .git/config` } });
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('AC 1 (red-first, ii): memory add with an unparseable .git/config returns the same refusal and writes nothing', async () => {
    const unchanged = snapshotPersistence(repo);
    const configPath = join(repo, '.git', 'config');
    const original = readFileSync(configPath, 'utf-8');
    appendFileSync(configPath, '[user\n');
    const n = badConfigLine(repo);

    const result = await memoryAdd()({ root: repo, options: { type: 'note', title: 'x' } });
    // The snapshot's own git calls need a readable configuration.
    writeFileSync(configPath, original);

    expect(result).toEqual({ ok: false, error: { code: 'IO', message: `${PREFIX}bad config line ${n} in file .git/config` } });
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC 1 (red-first, iii): an unparseable GLOBAL file refuses with IO, naming that file', () => {
    extraDir = mkdtempSync(join(tmpdir(), 'wf-broken-global-'));
    const broken = join(extraDir, 'broken.gitconfig');
    writeFileSync(broken, '[user\n');
    process.env.GIT_CONFIG_GLOBAL = broken;
    const n = badConfigLine(repo);

    const result = requireGitIdentity(repo);

    expect(result).toEqual({ ok: false, error: { code: 'IO', message: `${PREFIX}bad config line ${n} in file ${broken}` } });
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('AC 1 (characterization, iv, D4): readGitIdentity with an unparseable .git/config still returns an empty identity', () => {
    appendFileSync(join(repo, '.git', 'config'), '[user\n');

    expect(readGitIdentity(repo)).toEqual({ name: '', email: '' });
  });

  it('AC 1 (characterization, v): git exit 1 (no identity key anywhere, a global config that is a directory) keeps REQ-SEC-01\'s message', () => {
    execFileSync('git', ['-C', repo, 'config', '--unset', 'user.name'], { encoding: 'utf-8' });
    execFileSync('git', ['-C', repo, 'config', '--unset', 'user.email'], { encoding: 'utf-8' });
    // git warns on stderr ("unable to access ...: Is a directory") and still exits 1: stderr is not empty on every exit 1.
    extraDir = mkdtempSync(join(tmpdir(), 'wf-global-is-dir-'));
    process.env.GIT_CONFIG_GLOBAL = extraDir;

    const result = requireGitIdentity(repo);

    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: IDENTITY_ERROR } });
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('AC 1 (red-first, vii, D3): a git that exits 128 with nothing on stderr is refused as "git config exited 128"', () => {
    // A stand-in `git`, not a copied fixture: it exits 128 and prints nothing.
    extraDir = mkdtempSync(join(tmpdir(), 'wf-silent-git-'));
    const fake = join(extraDir, 'git');
    writeFileSync(fake, '#!/bin/sh\nexit 128\n');
    chmodSync(fake, 0o755);
    process.env.PATH = `${extraDir}:${saved.PATH ?? ''}`;

    const result = requireGitIdentity(repo);
    process.env.PATH = saved.PATH;

    expect(result).toEqual({ ok: false, error: { code: 'IO', message: `${PREFIX}git config exited 128` } });
    expect(exitCodeForResult(result)).toBe(1);
  });
});
