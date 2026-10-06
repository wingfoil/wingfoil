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
import { relative } from 'path';

import { initWingfoilProject } from '../../src/core/init';
import { loadMemoryYaml } from '../../src/core/loaders';
import { StorageError, initStorage } from '../../src/storage';
import { resolveConfinedMemoryPath } from '../../src/storage/memory-path';
import { writeMemoryEntry } from '../../src/memory';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

// A `decision-log`-shaped path pattern, matching the BDD scenario's "decision-1" document — the
// exact per-type pattern value (from `memory.yaml`) is not this test's concern (see
// `test/storage/memory-path.test.ts`, which already exercises every real per-type pattern).
const DECISION_LOG_PATTERN = 'docs/04_memory/design/dls/{id}.md';

describe('P1.11 scenario 1 — Memory store is ready after initialization', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  // task-259 (bug-256): the store is the set of paths `memory.yaml` declares, resolved against the
  // project root (task-017, task-172) — not a `.wingfoil/memory/` directory, which holds only the type
  // templates. "An initialized WingFoil project" is what `wingfoil init` builds (`initWingfoilProject`).
  it('memory.yaml declares a path inside the project root for every type, and the templates are tracked', () => {
    repo = makeTempGitRepo();
    const init = initWingfoilProject(repo, 'Scrum');
    expect(init.ok).toBe(true);

    const memoryYaml = loadMemoryYaml(repo);
    const types = Object.entries(memoryYaml.types).sort(([a], [b]) => a.localeCompare(b));
    expect(types.length).toBeGreaterThan(0);

    const templates: string[] = [];
    for (const [name, entry] of types) {
      // Every `{token}` of the pattern takes a probe value: resolving it must stay inside the root.
      const probe: Record<string, string> = {};
      for (const [, token] of entry.path.matchAll(/\{([^}]+)\}/g)) probe[token] = 'probe';
      const target = resolveConfinedMemoryPath(repo, entry.path, probe);
      expect(relative(repo, target).startsWith('..')).toBe(false);
      // No document is declared under the configuration folder.
      expect(`${name}: ${entry.path}`).not.toMatch(/: \.wingfoil\//);
      // `template.file` is relative to `.wingfoil/` (spec-001; `committedScaffoldFrontmatter` reads it so).
      if (entry.template) templates.push(`.wingfoil/${entry.template.file}`);
    }

    // Both are tracked by git: memory.yaml, and each declared template under .wingfoil/memory/templates/.
    expect(git(repo, ['ls-files', '.wingfoil/memory.yaml']).trim()).toBe('.wingfoil/memory.yaml');
    expect(templates.length).toBeGreaterThan(0);
    for (const file of templates) {
      expect(file.startsWith('.wingfoil/memory/templates/')).toBe(true);
      expect(git(repo, ['ls-files', file]).trim()).toBe(file);
    }
    // .wingfoil/memory/ holds the templates and nothing else.
    const underMemory = git(repo, ['ls-files', '.wingfoil/memory/']).trim().split('\n');
    expect(underMemory.every((path) => path.startsWith('.wingfoil/memory/templates/'))).toBe(true);
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
