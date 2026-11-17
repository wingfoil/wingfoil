/**
 * `memory` history primitive (task-008-dna-memory-query-latency, REQ-PERF-02) — the git-log walk
 * `wingfoil memory history` (a later, not-yet-scheduled P1.10 feature task) will render. Per
 * ADR-007 (stateless state derivation), git history is the sole audit trail for transitions, so this
 * walks `git log` directly rather than any secondary index. Returning structured commit records
 * (author, ISO-8601 date, subject, body) is this task's foundation scope — deriving a human-facing
 * "state change" narrative from the commit body's `Approver:`/`Reason:` lines (CLAUDE.md §5.1) is
 * left to the feature task that renders `wingfoil memory history`'s output.
 */
import { getMemoryHistory } from '../../src/memory/history';
import {
  commitAll,
  makeBoundedOutsideDir,
  makeTempGitRepo,
  removeTempDir,
  withGitCeiling,
  writeFixtureFile,
} from '../storage/helpers/git-fixture';

const DOC_PATH = 'docs/04_memory/v0.1/task-900-doc.md';

function writeDoc(repo: string, status: string): void {
  writeFixtureFile(
    repo,
    DOC_PATH,
    ['---', 'id: task-900-doc', `status: ${status}`, '---', '', 'Body.', ''].join('\n'),
  );
}

describe('getMemoryHistory — git-log walk over one Memory document', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('returns every commit touching the file, oldest first, with author/date/subject/body', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(task): add task-900-doc');
    writeDoc(repo, 'pending');
    commitAll(repo, 'wf(task): submit task-900-doc');
    writeDoc(repo, 'backlog');
    commitAll(
      repo,
      'wf(task): approve task-900-doc [pending → backlog]\n\nApprover: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: looks good',
    );

    const history = getMemoryHistory(repo, DOC_PATH);

    expect(history).toHaveLength(3);
    expect(history.map((e) => e.subject)).toEqual([
      'wf(task): add task-900-doc',
      'wf(task): submit task-900-doc',
      'wf(task): approve task-900-doc [pending → backlog]',
    ]);
    for (const entry of history) {
      expect(entry.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(entry.authorName).toBe('WingFoil Test');
      expect(entry.authorEmail).toBe('wf-test@example.invalid');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
    expect(history[2]?.body).toContain('Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)');
    expect(history[2]?.body).toContain('Reason: looks good');
  });

  it('returns exactly 1 entry for a document created and never touched again', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(task): add task-900-doc');

    expect(getMemoryHistory(repo, DOC_PATH)).toHaveLength(1);
  });

  it('returns an empty array for a path with no git history (not-found is the caller\'s concern)', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(task): add task-900-doc');

    expect(getMemoryHistory(repo, 'docs/04_memory/v0.1/does-not-exist.md')).toEqual([]);
  });

  it('throws E_GIT_READ_FAILED, rather than answering "no history", when `root` is not a git repository (task-142, bug-072)', () => {
    // task-350 AC 3 (bug-453): a directory outside any repository below a ceiling that is one.
    const { dir, ceiling } = makeBoundedOutsideDir();
    repo = ceiling;
    writeDoc(dir, 'draft'); // plain file write, no `git init`
    expect(() => withGitCeiling(ceiling, () => getMemoryHistory(dir, DOC_PATH))).toThrow(/E_GIT_READ_FAILED: .*not a git repository/s);
  });

  it('is deterministic — repeated calls over unchanged state produce the exact same result', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(task): add task-900-doc');
    writeDoc(repo, 'pending');
    commitAll(repo, 'wf(task): submit task-900-doc');

    const first = getMemoryHistory(repo, DOC_PATH);
    const second = getMemoryHistory(repo, DOC_PATH);
    expect(second).toEqual(first);
  });
});
