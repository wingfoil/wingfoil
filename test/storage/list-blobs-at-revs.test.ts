/**
 * `listBlobsAtRevs`, `readBlobs`, `mergeBasesWith` (`src/storage/commit.ts`, task-274 review F2) — the
 * batched reads behind the WIP-limit count across refs. `listBlobsAtRevs` must answer, per revision,
 * what `git ls-tree -r` answers there (path, oid, link or not), in a number of git processes that does
 * not grow with the number of revisions; each case compares with `git ls-tree` on the same fixture.
 *
 * Throwaway temp git repositories. Deterministic (REQ-SYS-07).
 */
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { E_GIT_READ_FAILED, E_INVALID_REVISION, listBlobsAtRevs, mergeBasesWith, readBlobs } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';

/** `git ls-tree -r` at `rev` under `dir`: the reference answer. */
function lsTree(repo: string, rev: string, dir: string): { path: string; oid: string; symlink: boolean }[] {
  return git(repo, ['ls-tree', '-r', '-z', '--full-tree', rev, ...(dir === '' ? [] : ['--', dir])])
    .split('\0')
    .filter((record) => /^(100644|100755|120000) blob /.test(record))
    .map((record) => {
      const [meta, path] = record.split('\t') as [string, string];
      const [mode, , oid] = meta.split(' ') as [string, string, string];
      return { path, oid, symlink: mode === '120000' };
    })
    .sort((a, b) => Number(a.path > b.path) - Number(a.path < b.path));
}

describe('listBlobsAtRevs / readBlobs / mergeBasesWith (task-274)', () => {
  let repo = '';
  let first = '';
  let second = '';
  let side = '';

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/mem/a/one.md', 'one\n');
    writeFixtureFile(repo, 'docs/mem/b/same.md', 'one\n'); // an identical blob at a second path
    writeFixtureFile(repo, 'docs/other/x.md', 'x\n');
    symlinkSync('one.md', join(repo, 'docs/mem/a/link.md'));
    commitAll(repo, 'one');
    first = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, 'docs/mem/c/deep/er/two.md', 'two\n');
    // A gitlink: an entry of the tree, not a file; staged after `git add -A`, which would drop it.
    git(repo, ['add', '-A']);
    git(repo, ['update-index', '--add', '--cacheinfo', `160000,${first},docs/mem/submodule`]);
    git(repo, ['commit', '--quiet', '-m', 'two']);
    second = git(repo, ['rev-parse', 'HEAD']).trim();
    git(repo, ['checkout', '--quiet', '-b', 'side', first]);
    writeFixtureFile(repo, 'docs/mem/a/one.md', 'changed on side\n');
    commitAll(repo, 'side');
    side = git(repo, ['rev-parse', 'HEAD']).trim();
  });

  afterEach(() => removeTempDir(repo));

  it.each([['docs/mem'], ['docs'], ['']])('answers what git ls-tree answers at every revision, under %j', (dir) => {
    const revs = [second, first, side, second];
    expect(listBlobsAtRevs(repo, revs, dir)).toEqual(revs.map((rev) => lsTree(repo, rev, dir)));
  });

  it('drops the gitlink, which really is in the tree', () => {
    expect(git(repo, ['ls-tree', '-r', second, '--', 'docs/mem/submodule'])).toMatch(/^160000 commit /);
    expect(listBlobsAtRevs(repo, [second], 'docs/mem')[0]!.map((blob) => blob.path)).not.toContain('docs/mem/submodule');
  });

  it('a revision without the directory holds nothing there', () => {
    writeFixtureFile(repo, 'elsewhere.md', 'e\n');
    git(repo, ['rm', '-r', '--quiet', 'docs']);
    commitAll(repo, 'no docs');
    expect(listBlobsAtRevs(repo, [git(repo, ['rev-parse', 'HEAD']).trim(), first], 'docs/mem')[0]).toEqual([]);
  });

  it('refuses a revision that names no commit, and one that cannot travel on the batch protocol', () => {
    expect(() => listBlobsAtRevs(repo, ['0'.repeat(40)], 'docs')).toThrow(expect.objectContaining({ code: E_GIT_READ_FAILED }));
    expect(() => listBlobsAtRevs(repo, ['HEAD:docs'], 'docs')).toThrow(expect.objectContaining({ code: E_INVALID_REVISION }));
    expect(() => listBlobsAtRevs(repo, [first], 'do\ncs')).toThrow(expect.objectContaining({ code: E_INVALID_REVISION }));
  });

  it('no revision lists nothing', () => {
    expect(listBlobsAtRevs(repo, [], 'docs')).toEqual([]);
  });

  it('readBlobs reads each distinct oid once, and refuses one that names no blob', () => {
    const blobs = listBlobsAtRevs(repo, [first], 'docs/mem')[0]!;
    const oids = blobs.filter((blob) => !blob.symlink).map((blob) => blob.oid);
    const contents = readBlobs(repo, oids);
    expect(contents.size).toBe(1); // one.md and same.md share their bytes
    expect([...contents.values()]).toEqual(['one\n']);
    expect(() => readBlobs(repo, ['f'.repeat(40)])).toThrow(expect.objectContaining({ code: E_GIT_READ_FAILED }));
  });

  it('mergeBasesWith answers git merge-base per revision, and null for unrelated history', () => {
    git(repo, ['checkout', '--quiet', '--orphan', 'unrelated']);
    commitAll(repo, 'an unrelated root');
    const unrelated = git(repo, ['rev-parse', 'HEAD']).trim();
    expect(mergeBasesWith(repo, second, [side, first, second, unrelated])).toEqual([first, first, second, null]);
  });
});
