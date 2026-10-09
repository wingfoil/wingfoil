/**
 * task-268 (`bug-291`) AC 1 and AC 3 — `wingfoil memory history` on a project whose commits are
 * signed, end to end through the compiled `dist/cli.js`, with `log.showSignature` off and on.
 *
 * With `log.showSignature=true` git prints the signature status ("No signature", or "Good … signature
 * for …") on stdout among a `git log`'s formatted lines. The history readers parsed those lines as
 * commit names, and `memory history` exited 1 ("creation commit No signature is not present in the
 * history walk it was derived from"). Every reader now passes `--no-show-signature`, so the setting
 * changes nothing: the output with the option on is byte-identical to the output with it off (AC 3,
 * characterization of the `false` side: the existing history suites pin it unchanged).
 *
 * The git configuration is isolated (`isolateGitConfig`): no global or system configuration of the
 * developer is read or written; the signing key and every option live in the fixture's own `.git`.
 * `dist/` is built once by jest's `globalSetup` (bug-003) — never here.
 */
import { existsSync } from 'fs';

import { removeTempDir } from '../storage/helpers/git-fixture';
import { isolatedGit, isolateGitConfig, makeSignedRepo, setShowSignature } from '../storage/helpers/signed-commits';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

/** The compiled CLI in `cwd`, with the test's `process.env` (the isolated git configuration) handed on. */
function runCliEntry(cwd: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: process.env });
}

describe('task-268 — `memory history` is independent of log.showSignature (bug-291)', () => {
  let restore: () => void = () => undefined;
  let repo = '';
  let id = '';

  beforeAll(() => {
    expect(existsSync(CLI_ENTRY)).toBe(true);
    restore = isolateGitConfig();
    repo = makeSignedRepo();
    setShowSignature(repo, false);
    const init = runCliEntry(repo, ['init', '--template', 'scrum']);
    expect([init.status, init.stderr]).toEqual([0, '']);
    const added = runCliEntry(repo, ['memory', 'add', '--type', 'bug', '--title', 'Scratch bug', '--format', 'json']);
    expect([added.status, added.stderr]).toEqual([0, '']);
    id = (JSON.parse(added.stdout) as { id: string }).id;
  });

  afterAll(() => {
    if (repo) removeTempDir(repo);
    restore();
  });

  /** `memory history <id>` with `log.showSignature` set to `value` in the repository's own config. */
  function historyWith(value: boolean, format: string): SpawnedRun {
    setShowSignature(repo, value);
    return runCliEntry(repo, ['memory', 'history', id, '--format', format]);
  }

  it('the fixture commits are signed: git reports signature text for them when log.showSignature is on', () => {
    // The signature text the readers must not parse — the reproduction's precondition, not the fix.
    setShowSignature(repo, true);
    expect(isolatedGit(repo, ['log', '-1', '--format=%H'])).toMatch(/signature/i);
  });

  it.each(['json', 'yaml', 'console'])('AC 1/AC 3: exits 0 and prints byte-identical %s output with log.showSignature on and off', (format) => {
    const off = historyWith(false, format);
    expect([off.status, off.stderr]).toEqual([0, '']);
    const on = historyWith(true, format);
    expect({ status: on.status, stderr: on.stderr, stdout: on.stdout }).toEqual({ status: 0, stderr: '', stdout: off.stdout });
  });

  it('AC 1: the element reports its one creation entry, `operation: add`', () => {
    const run = historyWith(true, 'json');
    const entries = (JSON.parse(run.stdout) as { entries: { operation: string | null; sha: string }[] }).entries;
    expect(entries.map((entry) => entry.operation)).toEqual(['add']);
    expect(entries[0]!.sha).toMatch(/^[0-9a-f]{40}([0-9a-f]{24})?$/);
  });
});
