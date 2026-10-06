/**
 * `bug-120-a-symlinked-document-leaf-is-followed-by-the-write` D1 / `task-106` — `memory add`
 * refuses a target whose **own name** is a symbolic link, before anything is written and before
 * anything is committed.
 *
 * `task-105` closed the symlinked store **directory** (`bug-117`): `resolveConfinedMemoryPath` now
 * real-resolves the target's *parent* and refuses a resolution that leaves the project. The leaf is
 * deliberately left unresolved, because `unlinkSync` acts on a link — the case `bug-044` verified
 * safe for `directive remove`. `writeFileSync` **follows** one, so on a write that asymmetry is a
 * hole, and `dl-086`'s shape is therefore verb-dependent: resolve the parent for a delete, refuse a
 * symlinked leaf for a write.
 *
 * **The fact this suite exists to pin is the commit.** Through a *dangling* link the shipped code
 * writes the element outside the project root **and commits** `wf(note): add …` for an element the
 * repository does not contain: `requireAbsentTarget` asks `existsSync`, which is false for a
 * dangling link, so the path reads as free; `git add` stages the link itself; and
 * `committedScopeError` notices the mismatch only once the commit exists. A refusal that writes
 * outside the root is bad; one that also records a success in the log `memory history` reads back is
 * worse — so `git log` is the load-bearing assertion here, not the exit code and not the message.
 *
 * **This fixture writes through a symlink.** The "outside" directory is a SECOND `mkdtemp`, never a
 * path of this machine that matters, and the assertions are on what appears in it and on what
 * `git log` says — an error-string assertion alone passes just as happily after the bytes have
 * landed outside and the commit has been made, which is precisely the shipped behaviour.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
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

/**
 * The id `memory add` will generate for the title below. The type's `id_pattern` is slug-only, so the
 * id is the title's slug and the planted link sits exactly where the write aims. `bug-120` D1 was
 * measured with a `{n}` pattern, planting the link at the number *after* the directory's file count;
 * since task-128 the counter takes the highest number any baseline holds (the untracked link
 * included), so a `{n}` id can no longer be aimed at a planted file **that git does not ignore**.
 * A git-ignored file is in no baseline the counter reads, so a `{n}` id can still land on one. The
 * guard therefore keeps a real job, refusing rather than overwriting. The slug-only pattern is just
 * the simplest way to aim the write at the link.
 */
const TARGET_ID = 'note-escape-probe';
const TARGET_PATH = `${TYPE_DIR}/${TARGET_ID}.md`;

/** The real, registered `memory.memoryAdd` `CoreFn` — fails loudly if it is un-registered. */
function memoryAddFn(): CoreFn<unknown, { id: string; path: string }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAdd;
  if (!operation) throw new Error('fixture bug: "memoryAdd" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, { id: string; path: string }>;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function log(repo: string): string {
  return execFileSync('git', ['-C', repo, 'log', '--oneline'], { encoding: 'utf-8' });
}

async function add(repo: string): Promise<CoreResult<{ id: string; path: string }>> {
  return memoryAddFn()({ root: repo, options: { type: 'note', title: 'escape probe' } });
}

/**
 * The same call with a rejection absorbed, so a filesystem or history assertion after it still runs.
 * Nothing about the outcome is asserted here — that is the message case's job.
 */
async function addIgnoringThrow(repo: string): Promise<void> {
  await add(repo).then(
    () => undefined,
    () => undefined,
  );
}

describe('memory add — a symlinked target is refused before the write (bug-120 D1, task-106)', () => {
  let repo: string;
  let outside: string;
  let linkTarget: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    // The blast-radius bound: everything this suite risks writing lives in a temp dir of its own.
    outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
    linkTarget = join(outside, 'leaked-add.md');
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/note.md', NOTE_TEMPLATE);
    commitAll(repo, 'seed memory.yaml + note template');
    mkdirSync(join(repo, TYPE_DIR), { recursive: true });
  });

  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  describe('when the target path is a DANGLING symlink pointing outside the project root', () => {
    beforeEach(() => {
      // Dangling and untracked, exactly as `bug-120` D1 plants it: `existsSync` is false for this
      // path and `lstatSync` is not, which is why the absent-target guard reads it as free.
      symlinkSync(linkTarget, join(repo, TARGET_PATH));
      expect(existsSync(join(repo, TARGET_PATH))).toBe(false);
    });

    /**
     * AC4, and the assertion that carries the criterion: **no commit**. On the shipped code this
     * fails with `wf(note): add note-escape-probe` — a subject in the project's own history for
     * an element the project does not contain.
     */
    it('creates no commit', async () => {
      const before = head(repo);
      const unchanged = snapshotPersistence(repo);
      await addIgnoringThrow(repo);
      expect(head(repo)).toBe(before);
      expect(log(repo)).not.toContain(`add ${TARGET_ID}`);
      assertPersistenceUnchanged(repo, unchanged);
    });

    /** AC2/AC3: the refusal precedes the write, through a link `existsSync` cannot see. */
    it('writes nothing outside the project root', async () => {
      await addIgnoringThrow(repo);
      expect(readdirSync(outside)).toEqual([]);
      expect(existsSync(linkTarget)).toBe(false);
    });

    // AC5: a mapped `CoreError` at exit 1 naming the path and that it is a symlink — no git text.
    it('refuses with a mapped CoreError at exit 1 naming the path and the symlink', async () => {
      const result = await add(repo);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain(TARGET_PATH);
      expect(result.error.message).toContain('symbolic link');
      // Neither git's own text (`bug-071`/`bug-093`) nor the post-hoc scope alarm, which can only
      // speak once the commit this operation must never make already exists.
      expect(result.error.message).not.toContain('Command failed');
      expect(result.error.message).not.toContain('carries more than the change it declares');
    });
  });

  describe('when the target path is a symlink to an existing file outside the project root', () => {
    const planted = '# a file this project does not own\n';

    beforeEach(() => {
      writeFileSync(linkTarget, planted, 'utf-8');
      symlinkSync(linkTarget, join(repo, TARGET_PATH));
    });

    /**
     * Characterization: `requireAbsentTarget` already refuses this one — `existsSync` is true
     * through a *live* link — so the bytes outside survive on the shipped code too. It is kept
     * because it must go on holding, and because it is the standing demonstration that the dangling
     * case above is not a variant of this one.
     */
    it('leaves the linked file byte-identical and creates no commit', async () => {
      const before = head(repo);
      const unchanged = snapshotPersistence(repo);
      await addIgnoringThrow(repo);
      expect(readFileSync(linkTarget, 'utf-8')).toBe(planted);
      expect(head(repo)).toBe(before);
      assertPersistenceUnchanged(repo, unchanged);
    });

    /**
     * AC5/AC3: and it is refused *as a symlink*, by the guard that owns the question, rather than
     * incidentally by the absent-target guard — whose message ("something already exists there")
     * tells an operator to choose another title when what they must do is stop writing through a
     * link.
     */
    it('refuses with a mapped CoreError at exit 1 naming the symlink', async () => {
      const result = await add(repo);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain(TARGET_PATH);
      expect(result.error.message).toContain('symbolic link');
    });
  });

  /**
   * AC7 (characterization): an ordinary target — a real directory, no link anywhere on the way —
   * still writes, still commits, still exits 0. The symlinked *directory* case (`task-105`) and the
   * ordinary case are both pinned in `test/core/memory-add-confinement.test.ts`; this one is here so
   * the suite that adds the refusal also owns a green happy path.
   */
  it('still adds an element at an ordinary path, committing once at exit 0', async () => {
    const before = head(repo);

    const result = await add(repo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value.path).toBe(`${TYPE_DIR}/note-escape-probe.md`);
    expect(head(repo)).not.toBe(before);
    expect(result.commit?.message).toBe('wf(note): add note-escape-probe');
  });
});
