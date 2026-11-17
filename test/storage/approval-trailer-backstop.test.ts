/**
 * task-333 AC 4 (a) (`spec-018` §3.3, §6 T-19; design "src/storage/commit.ts", D7) — the commit primitive refuses
 * an approval commit that would carry an agent trailer, for every writer, before anything is written or staged and
 * before a dry run's plan.
 *
 * An approval commit is one whose message has a line starting `Approver:` (any case, §0); an agent trailer is a line
 * matching `^(co-authored-by|ai-model):`, any case, anywhere in the stamped message (body, or a
 * `CommitOptions.trailers` line). The refusal is a thrown `StorageError` subclass with code
 * `E_AGENT_TRAILER_ON_APPROVAL` (D7), message pinned word for word.
 *
 * Red until the backstop exists: today each writer commits. The two control cases (a `Co-Authored-By:` without an
 * `Approver:` line commits; an approval without an agent trailer commits) pass today. Throwaway repositories.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { runAsDryRun } from '../../src/core/dry-run';
import { coreOk } from '../../src/core/types';
import { commitEmpty, commitPaths, StorageError, writeAndCommit } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from './helpers/persistence-snapshot';

const SUBJECT = 'wf(task): approve t [pending → backlog]';
const APPROVAL = `${SUBJECT}\n\nApprover: A <a@example.invalid> (approver)\nReason: r`;
const WITH_MODEL = `${APPROVAL}\n\nAI-Model: m-1`;

function refusalOf(key: string): string {
  return `E_AGENT_TRAILER_ON_APPROVAL: the commit '${SUBJECT}' records an approval and would carry an agent trailer (${key}:), which an approval never carries (dl-212, git-conventions §7); nothing was written`;
}

/** The error `run` throws; fails the test when it returns. */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the primitive to refuse, but it committed');
}

function expectBackstop(error: unknown, key: string): void {
  expect(error).toBeInstanceOf(StorageError);
  expect((error as StorageError).code).toBe('E_AGENT_TRAILER_ON_APPROVAL');
  expect((error as StorageError).message).toBe(refusalOf(key));
}

describe('task-333 AC 4 (a) — the commit primitive refuses an agent trailer on an approval commit (T-19)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/kept.md', 'one\n');
    commitAll(repo, 'seed');
  });
  afterEach(() => removeTempDir(repo));

  const head = (): string => git(repo, ['rev-parse', 'HEAD']).trim();
  const staged = (): string => git(repo, ['diff', '--cached', '--name-only']);

  it('writeAndCommit: refused with E_AGENT_TRAILER_ON_APPROVAL naming AI-Model:, the file not written, nothing staged, HEAD unchanged', () => {
    const before = head();
    const unchanged = snapshotPersistence(repo, ['docs/new.md']);

    expectBackstop(thrownBy(() => writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], WITH_MODEL)), 'AI-Model');

    expect(existsSync(join(repo, 'docs/new.md'))).toBe(false);
    expect(staged()).toBe('');
    expect(head()).toBe(before);
    assertPersistenceUnchanged(repo, unchanged, 'writeAndCommit');
  });

  it('commitEmpty: refused the same way, HEAD unchanged', () => {
    const before = head();
    expectBackstop(thrownBy(() => commitEmpty(repo, WITH_MODEL)), 'AI-Model');
    expect(head()).toBe(before);
  });

  it('commitPaths: refused before git add — the written file stays unstaged, HEAD unchanged', () => {
    writeFixtureFile(repo, 'docs/kept.md', 'two\n');
    const before = head();
    expectBackstop(thrownBy(() => commitPaths(repo, ['docs/kept.md'], WITH_MODEL)), 'AI-Model');
    expect(staged()).toBe('');
    expect(git(repo, ['status', '--porcelain'])).toBe(' M docs/kept.md\n');
    expect(head()).toBe(before);
  });

  it('a Co-Authored-By: line in any case, in the body, names Co-Authored-By:', () => {
    const before = head();
    const message = `${SUBJECT}\n\nApprover: A <a@example.invalid> (approver)\nReason: r\nco-authored-by: Claude <noreply@anthropic.com>`;
    const error = thrownBy(() => writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], message));
    expect((error as StorageError).code).toBe('E_AGENT_TRAILER_ON_APPROVAL');
    // The key as the line spells it or in its canonical case: §3.3 fixes only that the key is named.
    expect((error as StorageError).message).toMatch(/\((co-authored-by|Co-Authored-By):\)/);
    expect(head()).toBe(before);
  });

  it('an agent trailer handed through CommitOptions.trailers is refused too (it is in the stamped message)', () => {
    const before = head();
    expectBackstop(thrownBy(() => commitEmpty(repo, APPROVAL, { trailers: ['AI-Model: m-1'] })), 'AI-Model');
    expect(head()).toBe(before);
  });

  it('under runAsDryRun it throws before any plan is recorded: the error, not a planned result', async () => {
    const unchanged = snapshotPersistence(repo, ['docs/new.md']);
    let error: unknown;
    try {
      await runAsDryRun(async () => coreOk(writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], WITH_MODEL)));
    } catch (thrown) {
      error = thrown;
    }
    expectBackstop(error, 'AI-Model');
    assertPersistenceUnchanged(repo, unchanged, 'dry run');
  });

  it('control: a Co-Authored-By: line on a commit with no Approver: line commits normally', () => {
    const sha = writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], 'wf(task): submit t\n\nCo-Authored-By: Claude <noreply@anthropic.com>');
    expect(head()).toBe(sha);
  });

  it('control: an approval with no agent trailer commits normally', () => {
    const sha = commitEmpty(repo, APPROVAL);
    expect(head()).toBe(sha);
  });
});
