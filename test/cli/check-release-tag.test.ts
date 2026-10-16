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
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

import {
  checkAnnotatedTag,
  checkReleaseTag,
  checkTagOnLine,
  probeReleaseLines,
  releaseLineRefs,
  tagObjectType,
} from '../../scripts/check-release-tag.cjs';
import {
  cloneTempRepo,
  commitAll,
  commitAllAs,
  fixtureDirPrefix,
  git,
  makeTempGitRepo,
  removeTempDir,
  writeFixtureFile,
} from '../storage/helpers/git-fixture';

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

/**
 * task-265 (`dl-159` Decision 4, Action A1.1; `dl-024` decision 2, `adr-009` clause 1 kept) — the gate accepts a
 * release tag `vX.Y.Z` whose commit is on `origin/main` OR on `origin/release/X.Y`, `X.Y` being the tag's own
 * major.minor, as those branches are on `origin` at run time; it refuses everything else. One rule for every
 * `vX.Y.Z`, `vX.Y.0` included (approver ruling D4 (a), 2026-10-16).
 *
 * AC 1 pins the pure functions (`releaseLineRefs`, `checkTagOnLine`); AC 2 runs the gate's own command,
 * `node scripts/check-release-tag.cjs --on-line <tag> <commit>`, in a checkout of a fixture repository with a
 * bare `origin`, and pins `probeReleaseLines` in-process on the same fixture (a child process does not count
 * toward Jest coverage). Messages are the exact strings of the task-265 design.
 */
describe('release lines (task-265) — dl-159', () => {
  const NOT_VXYZ = (tag: string): string => `tag ${tag} is not of the form vX.Y.Z (spec-015 §4)`;

  describe('releaseLineRefs — the remote refs a release tag may sit on (AC 1)', () => {
    it.each([
      ['v0.3.1', ['origin/main', 'origin/release/0.3']],
      ['v0.3.0', ['origin/main', 'origin/release/0.3']],
      ['v1.0.0', ['origin/main', 'origin/release/1.0']],
      ['v10.20.3', ['origin/main', 'origin/release/10.20']],
    ])('maps %s to origin/main then the release line of its own major.minor', (tag, refs) => {
      expect(releaseLineRefs(tag)).toMatchObject({ ok: true, refs });
    });

    it.each(['v0.3', '0.3.1', 'v0.3.1-rc.1', 'v01.3.1', 'v0.3.1;echo x'])(
      'refuses %p with the existing vX.Y.Z message and no refs',
      (tag) => {
        expect(releaseLineRefs(tag)).toEqual({ ok: false, message: NOT_VXYZ(tag), refs: [] });
      },
    );

    it.each([[''], [undefined]])('refuses %p as no release tag given, with no refs', (tag) => {
      expect(releaseLineRefs(tag)).toEqual({ ok: false, message: 'no release tag given', refs: [] });
    });
  });

  describe('checkTagOnLine — the verdict over the probed refs, order kept (AC 1)', () => {
    const SHA = 'a'.repeat(40);

    it('passes on the first ref the commit is an ancestor of, and names every ref it checked', () => {
      const result = checkTagOnLine('v0.3.1', SHA, [
        { ref: 'origin/main', onRemote: true, ancestor: false },
        { ref: 'origin/release/0.3', onRemote: true, ancestor: true },
      ]);
      expect(result).toEqual({
        ok: true,
        message:
          `commit ${SHA} of tag v0.3.1 is on origin/release/0.3; ` +
          'checked origin/main (not an ancestor), origin/release/0.3 (ancestor) (dl-024, dl-159)',
      });
    });

    it('refuses a commit that is on neither line, naming both states', () => {
      const result = checkTagOnLine('v0.3.1', SHA, [
        { ref: 'origin/main', onRemote: true, ancestor: false },
        { ref: 'origin/release/0.3', onRemote: true, ancestor: false },
      ]);
      expect(result).toEqual({
        ok: false,
        message:
          `commit ${SHA} of tag v0.3.1 is on none of the lines it may be released from; ` +
          'checked origin/main (not an ancestor), origin/release/0.3 (not an ancestor) (dl-024, dl-159)',
      });
    });

    it('reports a release line absent from origin as `no such branch on origin`', () => {
      const result = checkTagOnLine('v0.4.1', SHA, [
        { ref: 'origin/main', onRemote: true, ancestor: false },
        { ref: 'origin/release/0.4', onRemote: false, ancestor: false },
      ]);
      expect(result).toEqual({
        ok: false,
        message:
          `commit ${SHA} of tag v0.4.1 is on none of the lines it may be released from; ` +
          'checked origin/main (not an ancestor), origin/release/0.4 (no such branch on origin) (dl-024, dl-159)',
      });
    });
  });

  /**
   * AC 2 — a throw-away repository with a bare `origin`; identity passed per command (`commitAllAs`,
   * git-conventions §5), never written into a fixture's config. W is the working clone that pushes; G is the
   * "gate checkout", cloned after the first pushes, like `actions/checkout` on the runner.
   */
  describe('the gate command on a fixture repository with a bare origin (AC 2)', () => {
    const SCRIPT_ARGS = (tag: string, commit: string): string[] => [SCRIPT, '--on-line', tag, commit];
    const AUTHOR = { name: 'WingFoil Test', email: 'wf-test@example.invalid' };
    const dirs: string[] = [];

    /** A bare repository under the run-tagged fixture prefix, so `test/global-teardown.cjs` counts it. */
    function bareOrigin(): string {
      const dir = mkdtempSync(fixtureDirPrefix());
      dirs.push(dir);
      git(dir, ['init', '--bare', '--quiet', '--initial-branch=main']);
      return dir;
    }

    function clone(origin: string): string {
      const dir = cloneTempRepo(origin);
      dirs.push(dir);
      git(dir, ['config', 'commit.gpgsign', 'false']);
      return dir;
    }

    /** Commit one file on the current branch of `repo` (identity for this command only) and return its sha. */
    function commit(repo: string, file: string): string {
      writeFixtureFile(repo, file, `${file}\n`);
      commitAllAs(repo, `add ${file}`, AUTHOR);
      return git(repo, ['rev-parse', 'HEAD']).trim();
    }

    function gate(cwd: string, tag: string, sha: string): ReturnType<typeof spawnSync> {
      return spawnSync(process.execPath, SCRIPT_ARGS(tag, sha), { cwd, encoding: 'utf-8' });
    }

    const pass = (sha: string, tag: string, on: string, checked: string): string =>
      `commit ${sha} of tag ${tag} is on ${on}; checked ${checked} (dl-024, dl-159)\n`;
    const refuse = (sha: string, tag: string, checked: string): string =>
      `commit ${sha} of tag ${tag} is on none of the lines it may be released from; checked ${checked} (dl-024, dl-159)\n`;

    // Origin 1: main (A, then D pushed after G was cloned), release/0.3 (A + B), design/x (A + C).
    let gateCheckout: string;
    let shaA: string;
    let shaB: string;
    let shaC: string;
    let shaD: string;
    // Origin 2: main (M) only, and design/y (M + X); no release/0.3 at all.
    let gateCheckout2: string;
    let staleCheckout2: string;
    let shaM: string;
    let shaX: string;

    beforeAll(() => {
      const origin = bareOrigin();
      const work = clone(origin);
      git(work, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
      shaA = commit(work, 'a.txt');
      git(work, ['push', '--quiet', 'origin', 'main']);
      git(work, ['checkout', '--quiet', '-b', 'release/0.3']);
      shaB = commit(work, 'b.txt');
      git(work, ['push', '--quiet', 'origin', 'release/0.3']);
      git(work, ['checkout', '--quiet', '-b', 'design/x', shaA]);
      shaC = commit(work, 'c.txt');
      git(work, ['push', '--quiet', 'origin', 'design/x']);
      gateCheckout = clone(origin);
      // After G was cloned: D on main and a tag on D, both pushed — G's tracking ref and tags are stale.
      git(work, ['checkout', '--quiet', 'main']);
      shaD = commit(work, 'd.txt');
      git(work, ['push', '--quiet', 'origin', 'main']);
      git(work, ['tag', 'v9.9.9', shaD]);
      git(work, ['push', '--quiet', 'origin', 'v9.9.9']);

      const origin2 = bareOrigin();
      const work2 = clone(origin2);
      git(work2, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
      shaM = commit(work2, 'm.txt');
      git(work2, ['push', '--quiet', 'origin', 'main']);
      git(work2, ['checkout', '--quiet', '-b', 'design/y']);
      shaX = commit(work2, 'x.txt');
      git(work2, ['push', '--quiet', 'origin', 'design/y']);
      gateCheckout2 = clone(origin2);
      staleCheckout2 = clone(origin2);
      // A local tracking ref the remote does not have: the check must read origin, not this ref.
      git(staleCheckout2, ['update-ref', 'refs/remotes/origin/release/0.3', shaX]);
    });

    afterAll(() => dirs.forEach(removeTempDir));

    it('(a) passes a tag on a commit of origin/main', () => {
      const run = gate(gateCheckout, 'v0.3.1', shaA);
      expect(run.stdout).toBe(
        pass(shaA, 'v0.3.1', 'origin/main', 'origin/main (ancestor), origin/release/0.3 (ancestor)'),
      );
      expect(run.status).toBe(0);
    });

    it('(b) passes v0.3.1 on a commit only on origin/release/0.3', () => {
      const run = gate(gateCheckout, 'v0.3.1', shaB);
      expect(run.stdout).toBe(
        pass(shaB, 'v0.3.1', 'origin/release/0.3', 'origin/main (not an ancestor), origin/release/0.3 (ancestor)'),
      );
      expect(run.status).toBe(0);
    });

    it('(c) refuses v0.4.1 on that same commit (major.minor mismatch), naming every ref it checked', () => {
      const run = gate(gateCheckout, 'v0.4.1', shaB);
      expect(run.stderr).toBe(
        refuse(shaB, 'v0.4.1', 'origin/main (not an ancestor), origin/release/0.4 (no such branch on origin)'),
      );
      expect(run.status).toBe(1);
    });

    it('(d) refuses a commit only on a design/* branch, naming every ref it checked', () => {
      const run = gate(gateCheckout, 'v0.3.1', shaC);
      expect(run.stderr).toBe(
        refuse(shaC, 'v0.3.1', 'origin/main (not an ancestor), origin/release/0.3 (not an ancestor)'),
      );
      expect(run.status).toBe(1);
    });

    it('(e) with no origin/release/0.3 at all, stands on origin/main alone: passes on it, refuses off it', () => {
      const onMain = gate(gateCheckout2, 'v0.3.1', shaM);
      expect(onMain.stdout).toBe(
        pass(shaM, 'v0.3.1', 'origin/main', 'origin/main (ancestor), origin/release/0.3 (no such branch on origin)'),
      );
      expect(onMain.status).toBe(0);
      const offMain = gate(gateCheckout2, 'v0.3.1', shaX);
      expect(offMain.stderr).toBe(
        refuse(shaX, 'v0.3.1', 'origin/main (not an ancestor), origin/release/0.3 (no such branch on origin)'),
      );
      expect(offMain.status).toBe(1);
    });

    it('(f) fetches: passes a commit pushed to origin main after the checkout was cloned', () => {
      const run = gate(gateCheckout, 'v0.3.1', shaD);
      expect(run.stdout).toBe(
        pass(shaD, 'v0.3.1', 'origin/main', 'origin/main (ancestor), origin/release/0.3 (not an ancestor)'),
      );
      expect(run.status).toBe(0);
    });

    it('(g) reads the branches from origin, not from a stale local tracking ref', () => {
      const run = gate(staleCheckout2, 'v0.3.1', shaX);
      expect(run.stderr).toBe(
        refuse(shaX, 'v0.3.1', 'origin/main (not an ancestor), origin/release/0.3 (no such branch on origin)'),
      );
      expect(run.status).toBe(1);
    });

    it('(h) fetches with --no-tags: a tag pushed after the checkout was cloned is still absent after a passing run', () => {
      const run = gate(gateCheckout, 'v0.3.1', shaD);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain(`of tag v0.3.1 is on origin/main`);
      expect(git(gateCheckout, ['tag', '-l', 'v9.9.9'])).toBe('');
    });

    it('(i) refuses a commit argument that is not a full commit id, before any git call', () => {
      const run = gate(gateCheckout, 'v0.3.1', 'HEAD');
      expect(run.stderr).toBe('HEAD is not a full commit id\n');
      expect(run.status).toBe(1);
      const none = spawnSync(process.execPath, [SCRIPT, '--on-line', 'v0.3.1'], { cwd: gateCheckout, encoding: 'utf-8' });
      expect(none.stderr).toBe('no commit given\n');
      expect(none.status).toBe(1);
    });

    it('(i) refuses a full commit id the checkout does not have, as a git failure on the first ref', () => {
      const run = gate(gateCheckout, 'v0.3.1', 'deadbeef'.repeat(5));
      expect(run.stderr).toMatch(/^could not test origin\/main: \S/);
      expect(run.status).toBe(1);
    });

    it('refuses a tag that is not vX.Y.Z with the existing message', () => {
      const run = gate(gateCheckout, 'v0.3', shaA);
      expect(run.stderr).toBe(`${NOT_VXYZ('v0.3')}\n`);
      expect(run.status).toBe(1);
    });

    describe('probeReleaseLines in-process (coverage of the I/O half)', () => {
      it('probes every listed ref in order, from origin', () => {
        expect(probeReleaseLines(gateCheckout, shaB, ['origin/main', 'origin/release/0.3'])).toEqual({
          ok: true,
          probes: [
            { ref: 'origin/main', onRemote: true, ancestor: false },
            { ref: 'origin/release/0.3', onRemote: true, ancestor: true },
          ],
        });
      });

      it('probes a release line origin does not have as onRemote: false', () => {
        const result = probeReleaseLines(staleCheckout2, shaX, ['origin/main', 'origin/release/0.3']);
        expect(result.ok).toBe(true);
        const probes = result.ok ? result.probes : [];
        expect(probes).toHaveLength(2);
        expect(probes[0]).toEqual({ ref: 'origin/main', onRemote: true, ancestor: false });
        expect(probes[1]).toMatchObject({ ref: 'origin/release/0.3', onRemote: false });
      });

      it('fails closed when git cannot test a ref', () => {
        const result = probeReleaseLines(gateCheckout, 'deadbeef'.repeat(5), ['origin/main', 'origin/release/0.3']);
        expect(result.ok).toBe(false);
        expect(result.ok ? '' : result.message).toMatch(/^could not test origin\/main: \S/);
      });

      it('fails closed when origin cannot be read', () => {
        const noOrigin = makeTempGitRepo();
        dirs.push(noOrigin);
        const result = probeReleaseLines(noOrigin, shaA, ['origin/main', 'origin/release/0.3']);
        expect(result.ok).toBe(false);
        expect(result.ok ? '' : result.message).toMatch(/^could not read the release lines from origin: \S/);
      });
    });
  });
});
