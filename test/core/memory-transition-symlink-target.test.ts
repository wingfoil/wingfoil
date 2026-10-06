/**
 * `bug-120-a-symlinked-document-leaf-is-followed-by-the-write` D2 / `task-106` — the four Memory
 * transition verbs refuse a document whose **own name** is a symbolic link, before the write.
 *
 * `task-105` gave `commitMemoryTransition` the confinement pre-flight (`requireConfinedTarget`,
 * REQ-SEC-06), which real-resolves the document's *parent* and leaves the leaf alone. That is right
 * for `directive remove`, whose syscall is `unlinkSync` and therefore acts on the link (`bug-044`'s
 * benign case, still pinned in `test/storage/confinement.test.ts` and
 * `test/core/directive-remove-confinement.test.ts`). These verbs write, `writeFileSync` follows the
 * link, and D2 measured the consequence on the fixed build: a committed symlinked document is found
 * by id, **rewritten in place outside the project root** (`status: draft` → `pending`), and the
 * operator gets raw `git commit` text. `dl-086`'s asymmetry is therefore verb-dependent, and this
 * suite pins the write half of it.
 *
 * Symlinking one document into a shared folder needs nothing contrived, which is why the fixture
 * plants the link inside a **real** in-project directory: the directory half is `task-105`'s and is
 * pinned next door in `test/core/memory-transition-confinement.test.ts`.
 *
 * **This fixture writes through a symlink.** The "outside" directory is a SECOND `mkdtemp`, and the
 * load-bearing assertions are the planted file's bytes and `git log` — never an error string, which
 * passes just as happily once the outside document has been rewritten.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const TYPE_DIR = 'docs/memory/note';
const DOC_PATH = `${TYPE_DIR}/note-001-planted.md`;

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  note:
    path: "${TYPE_DIR}/{id}.md"
`;

/** `dna.yaml` in which the fixture's own git identity holds `approver` (REQ-SEC-03 happy path). */
const APPROVER_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

/** A planted document in a given state — each verb needs one its own machine will accept. */
function noteDoc(status: string): string {
  return `---
id: "note-001-planted"
type: note
title: "A planted note"
status: ${status}
---

## Body

Real content.
`;
}

/** A registered `memory` `CoreFn` by operation name — fails loudly if it is un-registered. */
function memoryFn(operationName: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[operationName];
  if (!operation) throw new Error(`fixture bug: "${operationName}" operation not registered on the memory module`);
  return operation.fn;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

describe('memory transition verbs — a symlinked document is refused before the write (bug-120 D2, task-106)', () => {
  let repo: string;
  let outside: string;
  let plantedFile: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
    plantedFile = join(outside, 'leafy.md');
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, `${TYPE_DIR}/.gitkeep`, '');
    commitAll(repo, 'seed memory.yaml + dna.yaml + a real note store');
  });

  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  /**
   * Driven as a table for `task-105`'s reason: the four verbs share one write, and a verb that
   * later stops routing through it must show up as a missing row rather than as nothing at all.
   */
  const verbs: readonly { operation: string; from: string; params: Record<string, unknown> }[] = [
    { operation: 'memorySubmit', from: 'draft', params: {} },
    { operation: 'memoryApprove', from: 'pending', params: { options: { reason: 'probe' } } },
    { operation: 'memoryReject', from: 'pending', params: { options: { reason: 'probe' } } },
    { operation: 'memoryDeprecate', from: 'draft', params: { options: { reason: 'probe' } } },
    // task-127: `amend` writes the same file through the same `commitMemoryTransition`, and asks the
    // confinement question before its own content checks.
    { operation: 'memoryAmend', from: 'approved', params: { options: { reason: 'probe' } } },
  ];

  describe.each(verbs)('$operation', ({ operation, from, params }) => {
    let planted: string;

    // The document starts in a state this verb's machine accepts, so what is measured is the
    // symlink refusal and not an illegal-transition refusal that would never reach the write. The
    // link is COMMITTED (git stores it as a mode-120000 blob), which is D2's own setup.
    beforeEach(() => {
      planted = noteDoc(from);
      writeFileSync(plantedFile, planted, 'utf-8');
      symlinkSync(plantedFile, join(repo, DOC_PATH));
      commitAll(repo, 'fixture: link one note at a document outside the project');
      expect(git(repo, ['ls-files', '-s', DOC_PATH])).toContain('120000');
    });

    async function call(): Promise<CoreResult<unknown>> {
      return (await memoryFn(operation)({
        root: repo,
        positional: 'note-001-planted',
        ...params,
      })) as CoreResult<unknown>;
    }

    async function callIgnoringThrow(): Promise<void> {
      await call().then(
        () => undefined,
        () => undefined,
      );
    }

    /** The assertion that carries the criterion: the refusal precedes the write. */
    it('leaves the linked document outside the project root byte-identical', async () => {
      await callIgnoringThrow();
      expect(readFileSync(plantedFile, 'utf-8')).toBe(planted);
    });

    /** AC4: and no history is written either — pinned on `git log`, not on the exit code. */
    it('creates no commit', async () => {
      const before = head(repo);
      const unchanged = snapshotPersistence(repo);
      await callIgnoringThrow();
      expect(head(repo)).toBe(before);
      assertPersistenceUnchanged(repo, unchanged);
    });

    it('refuses with a mapped CoreError at exit 1 naming the path and the symlink', async () => {
      const result = await call();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain(DOC_PATH);
      expect(result.error.message).toContain('symbolic link');
      expect(result.error.message).not.toContain('Command failed');
    });
  });

  /**
   * AC7 (characterization): an ordinary in-project document, no link anywhere, still transitions,
   * commits and exits 0. The symlinked *directory* case is `task-105`'s and stays pinned in
   * `test/core/memory-transition-confinement.test.ts`.
   */
  it('still submits an ordinary in-project document, committing once at exit 0', async () => {
    writeFixtureFile(repo, DOC_PATH, noteDoc('draft'));
    commitAll(repo, 'fixture: an ordinary in-project note');
    const before = head(repo);

    const result = (await memoryFn('memorySubmit')({ root: repo, positional: 'note-001-planted' })) as CoreResult<{
      to: string;
    }>;

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value.to).toBe('pending');
    expect(head(repo)).not.toBe(before);
    expect(readFileSync(join(repo, DOC_PATH), 'utf-8')).toContain('status: pending');
  });
});
