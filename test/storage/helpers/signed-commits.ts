/**
 * Test-only helpers for `log.showSignature` (task-268, `bug-291`): a fixture repository whose commits
 * are signed with a throwaway SSH key, a git configuration isolated from the developer's own, and a
 * `git` wrapper that ignores `--no-show-signature` so a reader's refusal of signature text can be
 * exercised against a real git.
 *
 * Nothing here reads or writes the developer's global or system git configuration:
 * {@link isolateGitConfig} points `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` at an empty scratch file
 * and sets `GIT_CONFIG_NOSYSTEM`, and every signing key lives inside the fixture's own `.git`.
 *
 * **Every child here is spawned with `env: process.env` explicitly.** jest gives each test file its own
 * copy of `process.env`; a child spawned without `env` gets node's real environment and would not see
 * the isolation (observed: a variable set in a test was empty in an `execFileSync` child). That is why
 * this module has its own {@link isolatedGit} rather than `./git-fixture`'s `git`, and why a spawned CLI
 * must be given `env: process.env` (`spawnCapture`'s option). `src/storage`'s `runGitRead` passes
 * `process.env` itself, so the readers under test see it.
 */
import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { delimiter, dirname, join } from 'path';

import { fixtureDirPrefix } from './git-fixture';

const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;

/** `git <args>` in `cwd`, with the test's own `process.env` (so {@link isolateGitConfig} applies). */
export function isolatedGit(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf-8', env: process.env });
}

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
 * A fresh fixture repository (removed by `removeTempDir`) whose commits are signed with an ed25519 key
 * kept in its `.git` — local configuration only, to be called under {@link isolateGitConfig}. No
 * `gpg.ssh.allowedSignersFile` is set, so git verifies nothing and prints `No signature` for each
 * commit: signature text all the same, which is what the readers must ignore.
 */
export function makeSignedRepo(): string {
  const repo = mkdtempSync(fixtureDirPrefix());
  isolatedGit(repo, ['init', '--quiet', '--initial-branch=main']);
  const key = join(repo, '.git', 'test-signing-key');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key], { env: process.env });
  const settings: readonly (readonly [string, string])[] = [
    ['user.name', 'WingFoil Test'],
    ['user.email', 'wf-test@example.invalid'],
    ['gc.auto', '0'],
    ['core.hooksPath', '.git/hooks'],
    ['gpg.format', 'ssh'],
    ['user.signingkey', key],
    ['commit.gpgsign', 'true'],
  ];
  for (const [name, value] of settings) isolatedGit(repo, ['config', name, value]);
  return repo;
}

/** Write `files` under `repo`, stage everything and commit it (signed) with `message`. */
export function commitSigned(repo: string, message: string, files: Readonly<Record<string, string>> = {}): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content, 'utf-8');
  }
  isolatedGit(repo, ['add', '-A']);
  isolatedGit(repo, ['commit', '--quiet', '--allow-empty', '-m', message]);
}

/** Set `log.showSignature` in `repo`'s local configuration. */
export function setShowSignature(repo: string, value: boolean): void {
  isolatedGit(repo, ['config', 'log.showSignature', String(value)]);
}

/**
 * Put a `git` first on `PATH` that rewrites `--no-show-signature` into `--show-signature` and
 * otherwise runs the real git — a git that does not honour the flag, so that the signature text
 * reaches the reader and its refusal can be observed. Returns the function that puts `PATH` back and
 * removes the wrapper. Like the isolation, it reaches a child only through `env: process.env`.
 */
export function installSignatureForcingGit(): () => void {
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8', env: process.env }).trim();
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
