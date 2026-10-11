/**
 * task-278 (`bug-308`) — `readRevisionPaths`: many `<rev>:<path>` reads, each at its own revision, in one
 * `git cat-file --batch`, answering what `readPathAtRev` answers for each.
 */
import { readPathAtRev, readRevisionPaths } from '../../src/storage';
import { E_INVALID_REVISION } from '../../src/storage/errors';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';

describe('readRevisionPaths', () => {
  const root = makeTempGitRepo();
  writeFixtureFile(root, 'docs/a.md', 'one\n');
  commitAll(root, 'first');
  const first = git(root, ['rev-parse', 'HEAD']).trim();
  writeFixtureFile(root, 'docs/a.md', 'two\n');
  writeFixtureFile(root, 'docs/new\nline.md', 'odd\n');
  commitAll(root, 'second');
  const second = git(root, ['rev-parse', 'HEAD']).trim();
  afterAll(() => removeTempDir(root));

  it('reads each request at its own revision, in input order', () => {
    expect(
      readRevisionPaths(root, [
        { rev: second, path: 'docs/a.md' },
        { rev: `${second}^1`, path: 'docs/a.md' },
        { rev: first, path: 'docs/a.md' },
      ]),
    ).toEqual(['two\n', 'one\n', 'one\n']);
  });

  it('answers null for an absent path, a directory, and the parent of a root commit', () => {
    expect(
      readRevisionPaths(root, [
        { rev: first, path: 'docs/missing.md' },
        { rev: second, path: 'docs' },
        { rev: `${first}^1`, path: 'docs/a.md' },
      ]),
    ).toEqual([null, null, null]);
  });

  it('reads a path holding a newline on its own, with the same answer as readPathAtRev', () => {
    const path = 'docs/new\nline.md';
    expect(readRevisionPaths(root, [{ rev: second, path }, { rev: first, path: 'docs/a.md' }])).toEqual([
      readPathAtRev(root, second, path),
      'one\n',
    ]);
  });

  it('answers [] for no request', () => {
    expect(readRevisionPaths(root, [])).toEqual([]);
  });

  it.each(['a\nb', 'a:b', 'a\rb', 'a\0b'])('refuses a revision that would change the request (%j)', (rev) => {
    expect(() => readRevisionPaths(root, [{ rev, path: 'docs/a.md' }])).toThrow(expect.objectContaining({ code: E_INVALID_REVISION }));
  });
});
