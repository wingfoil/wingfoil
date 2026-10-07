/**
 * Test-only helpers for `log.showSignature` (task-268, `bug-291`): a fixture repository whose commits
 * are signed with a throwaway SSH key, a git configuration isolated from the developer's own, and a
 * `git` wrapper that ignores `--no-show-signature` so a reader's refusal of signature text can be
 * exercised against a real git.
 *
 * Nothing here reads or writes the developer's global or system git configuration:
 * {@link isolateGitConfig} points `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` at an empty scratch file
 * and sets `GIT_CONFIG_NOSYSTEM`, and every signing key lives inside the fixture's own `.git`.
 */
import { execFileSync } from 'child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { delimiter, join } from 'path';

import { fixtureDirPrefix, git } from './git-fixture';

const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;

/**
 * Point git's global and system configuration at an empty scratch file for the rest of the test,
 * and return the function that restores the environment (and removes the scratch file).
 */
export function isolateGitConfig(): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
  const dir = mkdtempSync(`${fixtureDirPrefix()}gitconfig-`);
  const empty = join(dir, 'empty.gitconfig');
  writeFileSync(empty, '');
  process.env.GIT_CONFIG_GLOBAL = empty;
  process.env.GIT_CONFIG_SYSTEM = empty;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  return () => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(dir, { recursive: true, force: true });
  };
}

/**
 * Make every later commit in `repo` signed with a fresh ed25519 key kept in `repo/.git` (local
 * configuration only). No `gpg.ssh.allowedSignersFile` is set, so git verifies nothing and prints
 * `No signature` for each commit — signature text all the same, which is what the readers must ignore.
 */
export function enableSigning(repo: string): void {
  const key = join(repo, '.git', 'test-signing-key');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  git(repo, ['config', 'gpg.format', 'ssh']);
  git(repo, ['config', 'user.signingkey', key]);
  git(repo, ['config', 'commit.gpgsign', 'true']);
}

/** Set `log.showSignature` in `repo`'s local configuration. */
export function setShowSignature(repo: string, value: boolean): void {
  git(repo, ['config', 'log.showSignature', String(value)]);
}

/**
 * Put a `git` first on `PATH` that rewrites `--no-show-signature` into `--show-signature` and
 * otherwise runs the real git — a git that does not honour the flag, so that the signature text
 * reaches the reader and its refusal can be observed. Returns the function that puts `PATH` back and
 * removes the wrapper.
 */
export function installSignatureForcingGit(): () => void {
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
  const dir = mkdtempSync(`${fixtureDirPrefix()}gitwrap-`);
  const script = [
    '#!/bin/sh',
    'for arg; do',
    '  shift',
    '  if [ "$arg" = "--no-show-signature" ]; then arg=--show-signature; fi',
    '  set -- "$@" "$arg"',
    'done',
    `exec '${real}' "$@"`,
    '',
  ].join('\n');
  const wrapper = join(dir, 'git');
  writeFileSync(wrapper, script);
  chmodSync(wrapper, 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved ?? ''}`;
  return () => {
    if (saved === undefined) delete process.env.PATH;
    else process.env.PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  };
}
