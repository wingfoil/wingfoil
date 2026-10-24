/**
 * task-208 (`dl-103` §1 (B)) — a tracked hook directory, `.githooks/`, opted into per clone with
 * `git config core.hooksPath .githooks` (documented in `git-conventions`), runs the same governance
 * check before a push. A local convenience: `--no-verify` skips it, CI (`governance.yml`) is binding.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  cloneTempRepo,
  commitAllAs,
  fixtureDirPrefix,
  git,
  removeTempDir,
  writeFixtureFile,
} from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const HOOK = '.githooks/pre-push';

describe('tracked git hooks (task-208, dl-103 §1 (B))', () => {
  it('tracks .githooks/pre-push as an executable file', () => {
    const entry = execFileSync('git', ['ls-files', '--stage', '--', HOOK], { cwd: REPO_ROOT, encoding: 'utf-8' });
    expect(entry).toMatch(/^100755 /);
  });

  it('runs the same script the CI runs, against the remote commit being replaced', () => {
    const text = readFileSync(join(REPO_ROOT, HOOK), 'utf-8');
    expect(text).toContain('scripts/check-governance.cjs');
    expect(text).toContain('--base');
  });

  it('is valid POSIX sh', () => {
    expect(spawnSync('sh', ['-n', join(REPO_ROOT, HOOK)]).status).toBe(0);
  });

  it('passes a push that adds no commit (remote already at HEAD), running the check', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    const run = spawnSync('sh', [join(REPO_ROOT, HOOK), 'origin', 'https://example.invalid/repo.git'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      input: `refs/heads/x ${head} refs/heads/x ${head}\n`,
    });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(run.stdout).toMatch(/governance check: 0 wf\(\) commits/);
  });

  it('is documented in git-conventions, with the opt-in command', () => {
    const directive = readFileSync(join(REPO_ROOT, '.wingfoil', 'directives', 'custom', 'git-conventions.md'), 'utf-8');
    expect(directive).toContain('git config core.hooksPath .githooks');
  });
});

/**
 * task-291 (`dl-185` C3 (i); design D1, approver rulings 2026-10-22 D1, D-A) — for a new remote ref the hook takes
 * its base from the line the branch was cut from: `origin/main` for a branch of `main`, `origin/release/X.Y` for a
 * branch of a patch line, `origin/main` for a new `release/X.Y` itself.
 *
 * Black box: a scratch repository with a bare `origin` (identity per command, `commitAllAs`, git-conventions §5), an
 * untracked stub `scripts/check-governance.cjs` in the clone that prints its argv as JSON, and an empty
 * `dist/memory/index.js` (the hook's build guard). The test runs this repository's `.githooks/pre-push` with the
 * clone as cwd and reads the `--base` the hook passed to the stub; the expected sha is computed by the test with
 * `git merge-base`, never read from the hook. Cases 1 and 3 (and 2b, the tie after a merge forward) are the
 * behaviour kept, characterization; case 2 is the new behaviour (red-first).
 */
describe('task-291 — the base of a new remote ref (dl-185 C3 (i))', () => {
  const AUTHOR = { name: 'WingFoil Test', email: 'wf-test@example.invalid' };
  const ZERO = '0000000000000000000000000000000000000000';
  const STUB = "process.stdout.write(JSON.stringify(process.argv.slice(2)) + '\\n');\n";
  const dirs: string[] = [];

  /** The process environment without inherited `GIT_*` variables, so the hook's git reads only the clone. */
  function cleanEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('GIT_')) env[key] = value;
    return env;
  }

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
    git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    return dir;
  }

  /** Commit one file on the current branch (identity for this command only) and return its sha. */
  function commit(repo: string, file: string): string {
    writeFixtureFile(repo, file, `${file}\n`);
    commitAllAs(repo, `add ${file}`, AUTHOR);
    return git(repo, ['rev-parse', 'HEAD']).trim();
  }

  /** The untracked stub and build guard, written after every commit so `git add -A` never takes them. */
  function plantStub(repo: string): void {
    writeFixtureFile(repo, 'scripts/check-governance.cjs', STUB);
    writeFixtureFile(repo, 'dist/memory/index.js', '');
  }

  /** Check out `branch`, run the hook for a push creating `refs/heads/<branch>`, return its exit and the stub's --base. */
  function pushNew(repo: string, branch: string): { status: number | null; base: string | undefined; stdout: string; stderr: string } {
    git(repo, ['checkout', '--quiet', branch]);
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    const run = spawnSync('sh', [join(REPO_ROOT, HOOK), 'origin', 'https://example.invalid/r.git'], {
      cwd: repo,
      encoding: 'utf-8',
      env: cleanEnv(),
      input: `refs/heads/${branch} ${head} refs/heads/${branch} ${ZERO}\n`,
    });
    const argvLine = run.stdout.split('\n').find((line) => line.startsWith('['));
    const argv = argvLine === undefined ? [] : (JSON.parse(argvLine) as string[]);
    const at = argv.indexOf('--base');
    return { status: run.status, base: at < 0 ? undefined : argv[at + 1], stdout: run.stdout, stderr: run.stderr };
  }

  /** `git merge-base HEAD <ref>` with HEAD on `branch` — computed by the test, independently of the hook. */
  function mergeBase(repo: string, branch: string, ref: string): string {
    git(repo, ['checkout', '--quiet', branch]);
    return git(repo, ['merge-base', 'HEAD', ref]).trim();
  }

  afterAll(() => dirs.forEach(removeTempDir));

  describe('main (A, M1) and release/0.3 (A + R1) on origin; three unpushed branches', () => {
    let work: string;
    let shaA: string;
    let shaR1: string;
    let shaM1: string;

    beforeAll(() => {
      work = clone(bareOrigin());
      shaA = commit(work, 'a.txt');
      git(work, ['push', '--quiet', 'origin', 'main']);
      git(work, ['checkout', '--quiet', '-b', 'release/0.3', shaA]);
      shaR1 = commit(work, 'r1.txt');
      git(work, ['push', '--quiet', 'origin', 'release/0.3']);
      git(work, ['checkout', '--quiet', 'main']);
      shaM1 = commit(work, 'm1.txt');
      git(work, ['push', '--quiet', 'origin', 'main']);
      git(work, ['checkout', '--quiet', '-b', 'task/main-x', shaM1]);
      commit(work, 't1.txt');
      git(work, ['checkout', '--quiet', '-b', 'task/patch-x', shaR1]);
      commit(work, 't2.txt');
      git(work, ['checkout', '--quiet', '-b', 'release/0.4', shaM1]);
      commit(work, 'r04.txt');
      plantStub(work);
    });

    it('case 1 (characterization): a branch of `main` takes origin/main', () => {
      const expected = mergeBase(work, 'task/main-x', 'origin/main');
      expect(expected).toBe(shaM1);
      const run = pushNew(work, 'task/main-x');
      expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
    });

    it('case 2 (red-first): a branch of a patch line takes origin/release/X.Y', () => {
      const expected = mergeBase(work, 'task/patch-x', 'origin/release/0.3');
      expect(expected).toBe(shaR1);
      const run = pushNew(work, 'task/patch-x');
      expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
    });

    it('case 3 (characterization): a new `release/X.Y` itself takes origin/main', () => {
      const expected = mergeBase(work, 'release/0.4', 'origin/main');
      expect(expected).toBe(shaM1);
      const run = pushNew(work, 'release/0.4');
      expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
    });

    it('case 3b (characterization, D1 step 1): a stale tracking ref of the pushed release line is skipped', () => {
      // The stale ref points at release/0.4's own HEAD — off origin/main's line, and the nearest possible merge-base,
      // so a rule that did not skip the pushed ref's own candidate would take it. Removed again in `finally`, so the
      // other cases of this fixture never see it.
      const ownHead = git(work, ['rev-parse', 'release/0.4']).trim();
      git(work, ['update-ref', 'refs/remotes/origin/release/0.4', ownHead]);
      try {
        const expected = mergeBase(work, 'release/0.4', 'origin/main');
        expect(expected).toBe(shaM1);
        expect(expected).not.toBe(ownHead);
        const run = pushNew(work, 'release/0.4');
        expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
      } finally {
        git(work, ['update-ref', '-d', 'refs/remotes/origin/release/0.4']);
      }
    });
  });

  describe('after `main` merges release/0.3 forward (--no-ff, pushed)', () => {
    let work: string;
    let shaR1: string;

    beforeAll(() => {
      work = clone(bareOrigin());
      const shaA = commit(work, 'a.txt');
      git(work, ['push', '--quiet', 'origin', 'main']);
      git(work, ['checkout', '--quiet', '-b', 'release/0.3', shaA]);
      shaR1 = commit(work, 'r1.txt');
      git(work, ['push', '--quiet', 'origin', 'release/0.3']);
      git(work, ['checkout', '--quiet', 'main']);
      commit(work, 'm1.txt');
      execFileSync('git', ['merge', '--quiet', '--no-ff', '--no-edit', 'release/0.3'], {
        cwd: work,
        encoding: 'utf-8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: AUTHOR.name,
          GIT_AUTHOR_EMAIL: AUTHOR.email,
          GIT_COMMITTER_NAME: AUTHOR.name,
          GIT_COMMITTER_EMAIL: AUTHOR.email,
        },
      });
      git(work, ['push', '--quiet', 'origin', 'main']);
      git(work, ['checkout', '--quiet', '-b', 'task/patch-y', shaR1]);
      commit(work, 't3.txt');
      plantStub(work);
    });

    it('case 2b (characterization): the tie — both lines give the same merge-base — takes that commit', () => {
      const expected = mergeBase(work, 'task/patch-y', 'origin/release/0.3');
      expect(expected).toBe(shaR1);
      expect(mergeBase(work, 'task/patch-y', 'origin/main')).toBe(expected);
      const run = pushNew(work, 'task/patch-y');
      expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
    });
  });

  /**
   * Review findings F12, F13 (approver ruling: fixed in the task). One origin with several lines: main (A, M1),
   * release/0.3 (A + R1), release/0.4 (M1 + R4), and two lines whose names are not `<n>.<n>` — release/0.3.1 and
   * release/foo, each M1 + a commit of its own — all pushed. One unpushed branch cut from each line's tip.
   * Expected bases are `git merge-base` against full tracking refnames (`refs/remotes/origin/…`), so the F12
   * ambiguity cannot reach the test's own computation.
   */
  describe('several release lines on origin, and two badly named ones (review F12, F13)', () => {
    let work: string;
    let shaR1: string;
    let shaR4: string;
    let shaM1: string;

    beforeAll(() => {
      work = clone(bareOrigin());
      const shaA = commit(work, 'a.txt');
      git(work, ['push', '--quiet', 'origin', 'main']);
      git(work, ['checkout', '--quiet', '-b', 'release/0.3', shaA]);
      shaR1 = commit(work, 'r1.txt');
      git(work, ['push', '--quiet', 'origin', 'release/0.3']);
      git(work, ['checkout', '--quiet', 'main']);
      shaM1 = commit(work, 'm1.txt');
      git(work, ['push', '--quiet', 'origin', 'main']);
      git(work, ['checkout', '--quiet', '-b', 'release/0.4', shaM1]);
      shaR4 = commit(work, 'r4.txt');
      git(work, ['push', '--quiet', 'origin', 'release/0.4']);
      git(work, ['checkout', '--quiet', '-b', 'release/0.3.1', shaM1]);
      const shaP1 = commit(work, 'p1.txt');
      git(work, ['push', '--quiet', 'origin', 'release/0.3.1']);
      git(work, ['checkout', '--quiet', '-b', 'release/foo', shaM1]);
      const shaF1 = commit(work, 'f1.txt');
      git(work, ['push', '--quiet', 'origin', 'release/foo']);
      git(work, ['checkout', '--quiet', '-b', 'task/on-0.4', shaR4]);
      commit(work, 't4.txt');
      git(work, ['checkout', '--quiet', '-b', 'task/on-0.3', shaR1]);
      commit(work, 't5.txt');
      git(work, ['checkout', '--quiet', '-b', 'task/on-0.3.1', shaP1]);
      commit(work, 't6.txt');
      git(work, ['checkout', '--quiet', '-b', 'task/on-foo', shaF1]);
      commit(work, 't7.txt');
      plantStub(work);
    });

    it('F13a (characterization): a branch of release/0.4 takes origin/release/0.4 while release/0.3 also exists', () => {
      const expected = mergeBase(work, 'task/on-0.4', 'refs/remotes/origin/release/0.4');
      expect(expected).toBe(shaR4);
      const run = pushNew(work, 'task/on-0.4');
      expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
    });

    it('F13a (characterization): a branch of release/0.3 takes origin/release/0.3 while release/0.4 also exists', () => {
      const expected = mergeBase(work, 'task/on-0.3', 'refs/remotes/origin/release/0.3');
      expect(expected).toBe(shaR1);
      const run = pushNew(work, 'task/on-0.3');
      expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
    });

    it.each([['release/0.3.1', 'task/on-0.3.1'], ['release/foo', 'task/on-foo']])(
      'F13b (characterization): %s is not a `<n>.<n>` line — a branch cut from it takes origin/main',
      (_line, branch) => {
        const expected = mergeBase(work, branch, 'refs/remotes/origin/main');
        expect(expected).toBe(shaM1);
        const run = pushNew(work, branch);
        expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
      },
    );

    it('F12 (red-first): a local branch named `origin/release/0.3` does not hide the release/0.3 line', () => {
      // `%(refname:short)` of refs/remotes/origin/release/0.3 becomes `remotes/origin/release/0.3` once a local
      // branch takes the short name; the line must still be a candidate. Removed again in `finally`.
      git(work, ['branch', '--quiet', 'origin/release/0.3', shaM1]);
      try {
        const short = git(work, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/release/0.3']).trim();
        expect(short).toBe('remotes/origin/release/0.3');
        const expected = mergeBase(work, 'task/on-0.3', 'refs/remotes/origin/release/0.3');
        expect(expected).toBe(shaR1);
        const run = pushNew(work, 'task/on-0.3');
        expect({ status: run.status, base: run.base }).toEqual({ status: 0, base: expected });
      } finally {
        git(work, ['branch', '--quiet', '-D', 'origin/release/0.3']);
      }
    });
  });

  it("D-A: governance.yml's header no longer states the old base and names the line the branch was cut from", () => {
    const raw = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'governance.yml'), 'utf-8');
    const end = raw.search(/^[^#\s]/m);
    const headerText = raw
      .slice(0, end < 0 ? undefined : end)
      .replace(/^#\s?/gm, '')
      .replace(/\s+/g, ' ');
    expect(headerText).toContain('the line the branch was cut from');
    expect(headerText).not.toContain('merge-base HEAD origin/main');
  });
});
