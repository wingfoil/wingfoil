/**
 * task-226 AC 5 (`dl-106`, `bug-051`) — `commitEmpty`, the commit primitive's form for a commit with no file
 * change (`workflow finalize`'s phase record, `spec-017` §7.9):
 *
 * - one commit, `--allow-empty`, recording no path, its message with the build signature;
 * - the trailer lines a caller hands in (`CommitOptions.trailers`) share the final paragraph with the
 *   `WingFoil-Version:` line, so git's `%(trailers)` reads them;
 * - `--cleanup=whitespace` pinned over the operator's `commit.cleanup` (a `#` line kept);
 * - a change the operator staged is neither committed nor unstaged (`--only`, `bug-027`);
 * - a dry run records the plan — subject, message, no paths, no diff — and writes nothing.
 */
import { captureDryRun, commitEmpty } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from './helpers/persistence-snapshot';
import { STAMP_TRAILER } from './helpers/stamp-trailer';

describe('task-226 AC 5 — commitEmpty', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, 'a.txt', 'a\n');
    commitAll(root, 'initial');
  });
  afterEach(() => removeTempDir(root));

  it('writes one commit with no file change; the trailers share the final paragraph with the signature', () => {
    const before = git(root, ['rev-parse', 'HEAD']).trim();
    const sha = commitEmpty(root, 'workflow: finalize p x.y\n\nReason: because.', { trailers: ['WingFoil-Phase: x.y completed', 'WingFoil-Instance: p'] });
    expect(sha).toBe(git(root, ['rev-parse', 'HEAD']).trim());
    expect(git(root, ['rev-parse', 'HEAD~1']).trim()).toBe(before);
    expect(git(root, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('');
    expect(git(root, ['log', '-1', '--format=%B']).trim()).toBe(
      `workflow: finalize p x.y\n\nReason: because.\n\nWingFoil-Phase: x.y completed\nWingFoil-Instance: p\n${STAMP_TRAILER.trim()}`,
    );
    expect(git(root, ['log', '-1', '--format=%(trailers:key=WingFoil-Instance,valueonly)']).trim()).toBe('p');
  });

  it('pins --cleanup=whitespace: a line opening with # survives commit.cleanup=strip', () => {
    git(root, ['config', 'commit.cleanup', 'strip']);
    commitEmpty(root, 'workflow: finalize p x.y\n\nReason: first\n# a hash line\n\n\n\nlast   ');
    expect(git(root, ['log', '-1', '--format=%B']).trim()).toBe(`workflow: finalize p x.y\n\nReason: first\n# a hash line\n\nlast${STAMP_TRAILER}`);
  });

  it('never sweeps a staged change into the commit, and leaves it staged', () => {
    writeFixtureFile(root, 'staged.txt', 's\n');
    git(root, ['add', 'staged.txt']);
    commitEmpty(root, 'workflow: finalize p x.y');
    expect(git(root, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('');
    expect(git(root, ['diff', '--cached', '--name-only']).trim()).toBe('staged.txt');
  });

  it('a dry run plans the commit with no paths and no diff, and writes nothing', async () => {
    const unchanged = snapshotPersistence(root);
    const outcome = await captureDryRun(async () => commitEmpty(root, 'workflow: finalize p x.y', { trailers: ['WingFoil-Phase: x.y completed'] }));
    expect(outcome.kind).toBe('planned');
    if (outcome.kind !== 'planned') return;
    expect(outcome.plan).toEqual({
      dryRun: true,
      subject: 'workflow: finalize p x.y',
      message: `workflow: finalize p x.y\n\nWingFoil-Phase: x.y completed\n${STAMP_TRAILER.trim()}`,
      paths: [],
      diff: '',
    });
    assertPersistenceUnchanged(root, unchanged);
  });
});
