/**
 * task-284 AC 3 (bug-377, REQ-SEC-01): the compiled CLI, run with a `git` that cannot be spawned,
 * refuses a mutating command with `could not run git: <cause>`, exit `1`, and writes nothing; with git
 * on `PATH` and an identity configured, the same command passes the check and commits.
 *
 * The repository has a configured local identity (`makeTempGitRepo`) and a minimal committed config
 * (a `note` type, shaped as `test/core/identity-preflight-committer.test.ts`'s fixture), so the only
 * fault in the refused rows is the spawn. The child's `PATH` is an empty directory (ENOENT) or a
 * directory holding a mode-0644 file named `git` (EACCES); node itself is run by `process.execPath`,
 * since it cannot be looked up on that `PATH`.
 *
 * A child process does not count toward coverage: the in-process rows of
 * `test/core/git-identity-spawn-failure.test.ts` carry the new branch (task-237 lesson).
 */
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { CLI_ENTRY, spawnCapture } from './helpers/spawn-cli';

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  note:
    path: "docs/memory/note/{id}.md"
    id_pattern: "note-{slug}"
    template:
      file: "memory/templates/note.md"
      frontmatter:
        required: [id, type, title, status]
`;

const NOTE_TEMPLATE = `---
id: ""
type: note
title: ""
status: draft
---

<!-- note body -->
`;

const ARGS = ['memory', 'add', '--type', 'note', '--title', 'x'] as const;

function emptyBinDir(): string {
  return mkdtempSync(join(tmpdir(), 'wf-cli-nogit-'));
}

function nonExecutableGitDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-cli-noexec-git-'));
  const fake = join(dir, 'git');
  writeFileSync(fake, '#!/bin/sh\nexit 0\n');
  chmodSync(fake, 0o644);
  return dir;
}

const UNRUNNABLE: readonly (readonly [string, () => string, string])[] = [
  ['an empty directory as PATH (ENOENT)', emptyBinDir, 'error: could not run git: spawnSync git ENOENT'],
  ['a non-executable git first on PATH (EACCES)', nonExecutableGitDir, 'error: could not run git: spawnSync git EACCES'],
];

describe('task-284 AC 3 — `memory add` with an unrunnable git exits 1 with "could not run git", writing nothing', () => {
  let repo: string;
  let binDir: string | undefined;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/note.md', NOTE_TEMPLATE);
    commitAll(repo, 'fixture');
    binDir = undefined;
  });

  afterEach(() => {
    removeTempDir(repo);
    if (binDir !== undefined) removeTempDir(binDir);
  });

  it.each(UNRUNNABLE)('AC 3 (red-first): with %s it exits 1, prints the new refusal and leaves the repository unchanged', (_label, makeBin, errorLine) => {
    binDir = makeBin();
    const unchanged = snapshotPersistence(repo);

    const run = spawnCapture(process.execPath, [CLI_ENTRY, ...ARGS], { cwd: repo, env: { ...process.env, PATH: binDir } });

    expect(run.stderr.split('\n')).toContain(errorLine);
    expect(run.status).toBe(1);
    assertPersistenceUnchanged(repo, unchanged);
    expect(git(repo, ['status', '--porcelain'])).toBe('');
  });

  it('AC 3 (positive): with git on PATH and an identity configured, the same command passes the check and commits', () => {
    const run = spawnCapture(process.execPath, [CLI_ENTRY, ...ARGS], { cwd: repo, env: { ...process.env } });

    expect(run.status).toBe(0);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toMatch(/^wf\(note\): add note-/);
  });
});
