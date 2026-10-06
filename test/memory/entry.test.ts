/**
 * task-022-implement-memory-entries (P1.11, REQ-SYS-01, REQ-SYS-03, REQ-SEC-06) — the git-backed
 * Memory-entry store primitive, exercised against the BDD acceptance contract in
 * `docs/02_requirements/02_bdd/features/p1-memory/P1.11-memory-entries.feature`.
 *
 * `writeMemoryEntry` is a thin, reusable **library** composition of three already-existing
 * primitives — never re-implemented here:
 *   - `resolveConfinedMemoryPath` (task-017-storage-confinement, `src/storage/memory-path.ts`) —
 *     renders a type's `path` pattern and refuses any resolution that escapes the project root
 *     (REQ-SEC-06), throwing `StorageError` `E_PATH_ESCAPES_ROOT` BEFORE anything is written.
 *   - `writeDocument` (`src/storage/document.ts`) — bytes-only write, mkdir-p.
 *   - `commitPaths` (task-018, `src/storage/commit.ts`) — the one scoped, single-commit primitive.
 *
 * It throws (does not return a `CoreResult`) — same style as the storage primitives it composes;
 * mapping a thrown `StorageError` to a `CoreError` for the CLI/MCP surface is task-020's
 * (`wingfoil memory add`) concern, not this library primitive's (see the task's Execution Notes for
 * the scoping decision).
 */
import { existsSync } from 'fs';
import { join, relative } from 'path';

import { StorageError, initStorage } from '../../src/storage';
import { writeMemoryEntry } from '../../src/memory';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

// A `decision-log`-shaped path pattern, matching the BDD scenario's "decision-1" document — the
// exact per-type pattern value (from `memory.yaml`) is not this test's concern (see
// `test/storage/memory-path.test.ts`, which already exercises every real per-type pattern).
const DECISION_LOG_PATTERN = 'docs/04_memory/design/dls/{id}.md';

describe('P1.11 scenario 1 — Memory store is ready after initialization', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('.wingfoil/memory/ exists and is tracked by git right after init', () => {
    repo = makeTempGitRepo();
    initStorage(repo);

    // Already guaranteed by task-018's initStorage/scaffoldFiles (test/storage/git-backed-storage.test.ts
    // proves the full skeleton); this is the thin P1.11-scoped assertion over the same contract, not a
    // duplicate of that suite.
    expect(existsSync(join(repo, '.wingfoil', 'memory'))).toBe(true);
    const tracked = git(repo, ['ls-files', '.wingfoil/memory']).trim();
    expect(tracked.length).toBeGreaterThan(0);
  });
});

describe('P1.11 scenario 2 — Each Memory entry is individually versioned', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('modifying and saving a document produces a distinct git commit, with prior versions retrievable', () => {
    repo = makeTempGitRepo();
    initStorage(repo);

    const values = { id: 'decision-1' };

    const first = writeMemoryEntry(
      repo,
      DECISION_LOG_PATTERN,
      values,
      'v1 content\n',
      'wf(decision-log): add decision-1',
    );
    const second = writeMemoryEntry(
      repo,
      DECISION_LOG_PATTERN,
      values,
      'v2 content\n',
      'wf(decision-log): submit decision-1',
    );

    // Same target file both times.
    expect(second.path).toBe(first.path);
    // Two DISTINCT commits (never the same sha).
    expect(first.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(second.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(second.sha).not.toBe(first.sha);

    const relPath = relative(repo, first.path);
    // The file's own commit history has exactly these two commits, in order — a distinct commit
    // per modification, not folded into a repo-wide commit count.
    const fileHistory = git(repo, ['log', '--format=%H', '--', relPath]).trim().split('\n').reverse();
    expect(fileHistory).toEqual([first.sha, second.sha]);

    // Prior version remains retrievable from git history (not just the latest working-tree copy).
    expect(git(repo, ['show', `${first.sha}:${relPath}`])).toBe('v1 content\n');
    expect(git(repo, ['show', `${second.sha}:${relPath}`])).toBe('v2 content\n');
  });
});

describe('P1.11 scenario 3 — Error: writing a Memory entry to a path outside the project root', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('refuses the write with the exact confinement message and commits/writes nothing', () => {
    repo = makeTempGitRepo();
    initStorage(repo);
    const before = git(repo, ['rev-list', '--all', '--count']).trim();

    let thrown: unknown;
    try {
      writeMemoryEntry(
        repo,
        'docs/04_memory/{id}.md',
        { id: '../../../../../tmp/decision-x' },
        'malicious content\n',
        'wf(decision-log): add decision-x',
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StorageError);
    expect((thrown as StorageError).code).toBe('E_PATH_ESCAPES_ROOT');
    expect((thrown as StorageError).message).toContain('Memory entries must reside within the project root');

    // Nothing committed...
    expect(git(repo, ['rev-list', '--all', '--count']).trim()).toBe(before);
    // ...and nothing written to the working tree either (writeDocument never ran).
    expect(git(repo, ['status', '--porcelain', '--untracked-files=all']).trim()).toBe('');
  });
});
