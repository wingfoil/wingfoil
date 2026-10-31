/**
 * task-324 (bug-379, REQ-SEC-01): the compiled CLI, run in a repository whose `.git/config` git cannot
 * parse, refuses a mutating command with `could not read git configuration: <git's message>`, exit
 * `1`, in both output formats, and writes nothing; with the configuration readable the same command
 * passes the check and commits.
 *
 * The repository has a configured local identity (`makeTempGitRepo`) and a minimal committed config
 * (a `note` type, shaped as `test/cli/git-unrunnable-refusal.integration.test.ts`), so the only fault
 * in the refused rows is the line `[user` appended to `.git/config` after the commit. The `<n>` of
 * `bad config line <n>` is read from a real `git config` run in the test, never hard-coded. The child
 * and that run read no global or system configuration.
 *
 * A child process does not count toward coverage: the in-process rows of
 * `test/core/git-identity-config-failure.test.ts` carry the new branch (task-237 lesson).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
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

/** The child's environment: no global or system git configuration and the C locale, so the repository's own is all it reads. */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_') && key !== 'LANGUAGE') env[key] = value;
  }
  // git's messages are localised and the rows parse them: pin the C locale.
  return { ...env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C' };
}

/** The `<n>` of git's `bad config line <n> in file .git/config`, from a real run of the check's command. */
function badConfigLine(repo: string): number {
  const run = spawnSync('git', ['-C', repo, 'config', '-z', '--get-regexp', '^(author|committer|user)\\.(name|email)$'], {
    encoding: 'utf-8',
    env: childEnv(),
  });
  const match = /bad config line (\d+) in file \.git\/config/.exec(run.stderr);
  if (run.status !== 128 || !match) {
    throw new Error(`fixture bug: expected git to exit 128 on "bad config line", got ${String(run.status)}: ${run.stderr}`);
  }
  return Number(match[1]);
}

describe('task-324 — `memory add` with an unparseable .git/config exits 1 with "could not read git configuration", writing nothing', () => {
  let repo: string;
  let configPath: string;
  let original: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/note.md', NOTE_TEMPLATE);
    commitAll(repo, 'fixture');
    configPath = join(repo, '.git', 'config');
    original = readFileSync(configPath, 'utf-8');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('AC 1 (red-first, console): it exits 1, prints the refusal with git\'s message and leaves the repository unchanged', () => {
    const unchanged = snapshotPersistence(repo);
    appendFileSync(configPath, '[user\n');
    const n = badConfigLine(repo);

    const run = spawnCapture(process.execPath, [CLI_ENTRY, ...ARGS], { cwd: repo, env: childEnv() });
    writeFileSync(configPath, original);

    expect(run.stderr.split('\n')).toContain(`error: could not read git configuration: bad config line ${n} in file .git/config`);
    expect(run.status).toBe(1);
    assertPersistenceUnchanged(repo, unchanged);
    expect(git(repo, ['status', '--porcelain'])).toBe('');
  });

  it('AC 1 (red-first, --format json): stderr carries the one error object and the repository is unchanged', () => {
    const unchanged = snapshotPersistence(repo);
    appendFileSync(configPath, '[user\n');
    const n = badConfigLine(repo);

    const run = spawnCapture(process.execPath, [CLI_ENTRY, ...ARGS, '--format', 'json'], { cwd: repo, env: childEnv() });
    writeFileSync(configPath, original);

    expect(run.stderr.split('\n')).toContain(
      JSON.stringify({ error: `could not read git configuration: bad config line ${n} in file .git/config` }),
    );
    expect(run.status).toBe(1);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC 1 (positive): with the configuration readable the same command passes the check and commits', () => {
    const run = spawnCapture(process.execPath, [CLI_ENTRY, ...ARGS], { cwd: repo, env: childEnv() });

    expect(run.status).toBe(0);
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toMatch(/^wf\(note\): add note-/);
  });
});
