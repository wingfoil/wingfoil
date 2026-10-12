/**
 * task-060-publish-pipeline — `scripts/check-release-tag.cjs`, the `spec-015` §4 assertion the publish
 * workflow's gate job runs before anything is built: the pushed tag is `vX.Y.Z` and equals
 * `v` + `package.json` `version`, so a hand-bumped version (or a mistyped tag) can never promote.
 *
 * task-115 added the `server.json` versions to the same check; those cases live in
 * `publish-metadata.test.ts` (`spec-015` §4). Here the `server.json` is always in sync, so the tag is
 * the only thing under test.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { checkAnnotatedTag, checkReleaseTag, tagObjectType } from '../../scripts/check-release-tag.cjs';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'check-release-tag.cjs');

/** A `server.json` whose versions all agree with `version` — the tag is the only variable here. */
function syncedServer(version: string): { version: string; packages: { version: string }[] } {
  return { version, packages: [{ version }] };
}

describe('tag scheme (task-060) — spec-015 §4', () => {
  it('accepts a `vX.Y.Z` tag equal to the package.json version', () => {
    expect(checkReleaseTag('v0.2.0', '0.2.0', syncedServer('0.2.0')).ok).toBe(true);
  });

  it.each([
    ['v0.2.1', '0.2.0'],
    ['0.2.0', '0.2.0'],
    ['v0.2', '0.2.0'],
    ['v0.2.0-rc.1', '0.2.0-rc.1'],
    ['', '0.2.0'],
    [undefined, '0.2.0'],
  ])('rejects tag %p for version %p', (tag, version) => {
    const result = checkReleaseTag(tag, version, syncedServer(version));
    expect(result.ok).toBe(false);
    expect(result.message).not.toBe('');
  });
});

/**
 * task-238 (`dl-057` (d), option 1; spec-015 §4: "an annotated git tag") — the gate refuses a lightweight tag.
 * The check is meaningful in CI: the v0.2.2 gate log shows `actions/checkout` fetching
 * `+refs/tags/*:refs/tags/*`, so `refs/tags/<tag>` on the runner is the pushed ref itself, and its object type
 * is the pushed tag's (task-238 Execution Notes, D6). The refusal is its own exported function, and its own
 * CLI mode (`--annotated`), separate from the version check and from "Tag commit is on main" (task-265).
 */
describe('annotated release tag (task-238) — dl-057 (d)', () => {
  it('accepts a tag whose object is a tag object', () => {
    const result = checkAnnotatedTag('v0.3.0', 'tag');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('annotated');
  });

  it.each([
    ['a lightweight tag (names a commit)', 'v0.3.0', 'commit', 'lightweight'],
    ['a tag that does not exist', 'v0.3.0', undefined, 'not found'],
    ['no tag at all', undefined, 'tag', 'no release tag given'],
  ])('refuses %s', (_case, tag, objectType, needle) => {
    const result = checkAnnotatedTag(tag, objectType);
    expect(result.ok).toBe(false);
    expect(result.message).toContain(needle);
  });

  describe('on a fixture repository holding one lightweight and one annotated tag', () => {
    let repo: string;

    beforeAll(() => {
      repo = makeTempGitRepo();
      git(repo, ['config', 'tag.gpgSign', 'false']);
      writeFixtureFile(repo, 'README.md', 'fixture\n');
      commitAll(repo, 'initial');
      git(repo, ['tag', 'v0.0.1']);
      git(repo, ['tag', '-a', 'v0.0.2', '-m', 'release v0.0.2']);
    });

    afterAll(() => removeTempDir(repo));

    it('reads each tag ref’s object type with git', () => {
      expect(tagObjectType(repo, 'v0.0.1')).toBe('commit');
      expect(tagObjectType(repo, 'v0.0.2')).toBe('tag');
      expect(tagObjectType(repo, 'v9.9.9')).toBeUndefined();
    });

    it.each([
      ['v0.0.2', 0, 'annotated'],
      ['v0.0.1', 1, 'lightweight'],
      ['v9.9.9', 1, 'not found'],
    ])('the `--annotated` CLI, run in the checkout as the gate step is, answers %s with exit %d', (tag, status, needle) => {
      const run = spawnSync(process.execPath, [SCRIPT, '--annotated', tag], { cwd: repo, encoding: 'utf-8' });
      expect(run.status).toBe(status);
      expect(status === 0 ? run.stdout : run.stderr).toContain(needle);
    });
  });
});
