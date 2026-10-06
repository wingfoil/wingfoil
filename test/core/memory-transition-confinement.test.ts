/**
 * The Memory **state-transition** verbs are confined to the project root too (`task-105` AC7,
 * REQ-SEC-06; the same crossing `bug-117` reports for `memory add`).
 *
 * `memory add` reaches its target through `resolveConfinedMemoryPath`, so repairing that primitive
 * repairs it. `submit`/`approve`/`reject`/`deprecate` do not: they find an existing document by id
 * (`findMemoryDocumentById`) and write it through `commitMemoryTransition`, which never asks the
 * resolver anything. Measured on the shipped code, both halves of that sentence hold — a document
 * planted in a directory the type's store is symlinked at is found, **rewritten in place outside the
 * project root**, and only then fails on `git add` with git's own text. So the guard belongs at the
 * one write these four verbs share, in the same shape and for the same reason as `task-102`'s
 * (`dl-086`: a read that predicts an imminent filesystem mutation resolves on the filesystem).
 *
 * **This fixture writes through a symlink.** The "outside" directory is a SECOND `mkdtemp`, and the
 * load-bearing assertion is that the planted file's **bytes are unchanged** — an error-string
 * assertion alone passes just as happily after the outside file has been rewritten, which is exactly
 * what the shipped code does.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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

describe('memory transition verbs — confinement to the project root (REQ-SEC-06, task-105 AC7)', () => {
  let repo: string;
  let outside: string;
  let plantedFile: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    outside = mkdtempSync(join(tmpdir(), 'wf-outside-'));
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    commitAll(repo, 'seed memory.yaml + dna.yaml');

    mkdirSync(join(repo, 'docs/memory'), { recursive: true });
    symlinkSync(outside, join(repo, TYPE_DIR));
    plantedFile = join(outside, 'note-001-planted.md');
    // Only the symlink is committed: git cannot stage anything beyond it, which is the whole
    // mechanism — the store's contents are invisible to the repository that is about to write them.
    commitAll(repo, 'fixture: alias the note store at a directory outside the project');
  });

  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  /**
   * The verbs share `commitMemoryTransition`, so they are driven as a table: one of them left
   * unguarded is the whole guarantee, and a table makes a later verb that forgets to route through
   * that function visible as a missing row rather than as nothing at all.
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

    // The document starts in a state this verb's own machine accepts, so the refusal under test is
    // the confinement one and not an illegal-transition refusal that would never reach the write.
    beforeEach(() => {
      planted = noteDoc(from);
      writeFileSync(plantedFile, planted, 'utf-8');
    });

    async function call(): Promise<CoreResult<unknown>> {
      return (await memoryFn(operation)({
        root: repo,
        positional: 'note-001-planted',
        ...params,
      })) as CoreResult<unknown>;
    }

    /** The assertion that carries the criterion: the refusal precedes the write. */
    it('leaves the document outside the project root byte-identical', async () => {
      await call().then(
        () => undefined,
        () => undefined,
      );
      expect(readFileSync(plantedFile, 'utf-8')).toBe(planted);
    });

    it('refuses with a mapped CoreError at exit 1 naming the path and the boundary', async () => {
      const result = await call();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain(`${TYPE_DIR}/note-001-planted.md`);
      expect(result.error.message).toContain('outside the project root');
      expect(result.error.message).not.toContain('Command failed');
      expect(result.error.message).not.toContain('beyond a symbolic link');
    });

    it('creates no commit', async () => {
      const sha = head(repo);
      const unchanged = snapshotPersistence(repo);
      await call().then(
        () => undefined,
        () => undefined,
      );
      expect(head(repo)).toBe(sha);
      assertPersistenceUnchanged(repo, unchanged);
    });
  });

  // Characterization: the ordinary in-project document still transitions, commits and exits 0.
  it('still submits an ordinary in-project document, committing once at exit 0', async () => {
    const plain = makeTempGitRepo();
    try {
      writeFixtureFile(plain, '.wingfoil/memory.yaml', MEMORY_YAML);
      writeFixtureFile(plain, '.wingfoil/dna.yaml', APPROVER_DNA);
      writeFixtureFile(plain, `${TYPE_DIR}/note-001-planted.md`, noteDoc('draft'));
      commitAll(plain, 'seed memory.yaml + an in-project note');
      const before = head(plain);

      const result = (await memoryFn('memorySubmit')({ root: plain, positional: 'note-001-planted' })) as CoreResult<{
        from: string;
        to: string;
      }>;

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(exitCodeForResult(result)).toBe(0);
      expect(result.value.to).toBe('pending');
      expect(head(plain)).not.toBe(before);
      expect(readFileSync(join(plain, TYPE_DIR, 'note-001-planted.md'), 'utf-8')).toContain('status: pending');
    } finally {
      removeTempDir(plain);
    }
  });
});
