/**
 * `bug-117-memory-add-writes-outside-the-project-root-through-a-symlinked-store` / `task-105` —
 * `memory add` refuses, **before creating anything**, an element whose Memory directory resolves
 * outside the project root.
 *
 * REQ-SEC-06 places the confinement boundary at the project root, and `resolveConfinedMemoryPath`
 * (`src/storage/memory-path.ts`) has owned it since `task-017`. It compared **textually**:
 * `docs/memory/task/task-001-escape-probe.md` has no traversal in it and every segment is inside the
 * project — and when `docs/memory/task` is a symlink to a directory elsewhere, the file it names is
 * not in the project at all. That is `bug-044`'s crossing (`directive remove`, fixed by `task-102`)
 * in the store REQ-SEC-06 is actually about, reached by the first mutating command most users run.
 *
 * **This fixture writes files through a symlink.** If the boundary logic under test is wrong, the
 * write lands outside the repository — so the "outside" directory is a SECOND `mkdtemp`, never a
 * path of this machine that matters, and the load-bearing assertion is that **nothing appears in
 * it**. An error-string assertion alone would pass just as happily after the outside file had been
 * created, which is the precise shape of the defect: the shipped code already exits 1 with an error,
 * it exits 1 *after* writing (`bug-117`'s Actual Behavior, re-measured in this task's AC1).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const TYPE_DIR = 'docs/memory/note';

const MEMORY_YAML = `version: 1
types:
  note:
    path: "${TYPE_DIR}/{id}.md"
    id_pattern: "note-{n}-{slug}"
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

/** The real, registered `memory.memoryAdd` `CoreFn` — fails loudly if it is un-registered. */
function memoryAddFn(): CoreFn<unknown, { id: string; path: string }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAdd;
  if (!operation) throw new Error('fixture bug: "memoryAdd" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, { id: string; path: string }>;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

async function add(repo: string, title: string): Promise<CoreResult<{ id: string; path: string }>> {
  return memoryAddFn()({ root: repo, options: { type: 'note', title } });
}

/**
 * The same call, with a rejection absorbed so the assertion that follows it still runs. On the
 * shipped code this verb does not return a `CoreResult` at all for this input — `commitPaths`
 * throws git's own `Command failed: … beyond a symbolic link` and `memoryAddFn` rethrows anything
 * that is neither a `StorageError` nor a `ValidationError`. A test asserting on the filesystem must
 * not have its assertion pre-empted by that throw: what the outside directory holds is the finding,
 * and the throw is the surface AC3 measures separately.
 */
async function addIgnoringThrow(repo: string, title: string): Promise<void> {
  await add(repo, title).then(
    () => undefined,
    () => undefined,
  );
}

describe('memory add — confinement to the project root (REQ-SEC-06, bug-117)', () => {
  let repo: string;
  let outside: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    // The blast-radius bound: everything this suite risks writing lives in a temp dir of its own.
    outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/note.md', NOTE_TEMPLATE);
    commitAll(repo, 'seed memory.yaml + note template');
  });

  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  describe("when the type's directory is a symlink to a directory outside the project root", () => {
    beforeEach(() => {
      mkdirSync(join(repo, 'docs/memory'), { recursive: true });
      symlinkSync(outside, join(repo, TYPE_DIR));
      commitAll(repo, 'fixture: alias the note store at a directory outside the project');
    });

    /**
     * AC2, and the assertion that carries the acceptance criterion: the refusal must precede the
     * write. Moving the check after `writeMemoryEntry` leaves the message and the no-commit
     * assertions below passing while this one fails — that mutation is what `task-102`'s reviewer
     * ran, and it is why the criterion is pinned here rather than on the error text.
     */
    it('writes nothing outside the project root', async () => {
      await addIgnoringThrow(repo, 'escape probe');
      expect(readdirSync(outside)).toEqual([]);
    });

    // AC3: a mapped `CoreError` at exit 1 naming the path and the boundary — no raw git text.
    it('refuses with a mapped CoreError at exit 1 naming the path and the boundary', async () => {
      const result = await add(repo, 'escape probe');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain(`${TYPE_DIR}/note-001-escape-probe.md`);
      expect(result.error.message).toContain('outside the project root');
      // The operator gets a refusal, not a child-process message (`bug-071`/`bug-093` family).
      expect(result.error.message).not.toContain('Command failed');
      expect(result.error.message).not.toContain('beyond a symbolic link');
    });

    /**
     * A refusal writes no history either — the verb's contract is one commit or none. This is
     * **characterization**, deliberately: it already holds on the shipped code, which fails on
     * `git add` and commits nothing *after* having written outside the root. It is kept because it
     * must go on holding, and it is the standing demonstration that neither it nor the message
     * assertion above carries AC2 — only the outside directory does.
     */
    it('creates no commit', async () => {
      const sha = head(repo);
      const unchanged = snapshotPersistence(repo);
      await addIgnoringThrow(repo, 'escape probe');
      expect(head(repo)).toBe(sha);
      assertPersistenceUnchanged(repo, unchanged);
    });
  });

  // AC8 (characterization): a Memory directory genuinely inside the project is untouched by the check.
  it('still adds an element under an ordinary in-project type directory, committing once at exit 0', async () => {
    const before = head(repo);

    const result = await add(repo, 'ordinary note');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value.path).toBe(`${TYPE_DIR}/note-001-ordinary-note.md`);
    expect(existsSync(join(repo, result.value.path))).toBe(true);
    expect(head(repo)).not.toBe(before);
    expect(result.commit?.message).toBe('wf(note): add note-001-ordinary-note');
  });
});
