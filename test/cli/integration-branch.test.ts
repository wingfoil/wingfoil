/**
 * task-288 AC 4 (`dl-159` point 4, A1.8; `git-conventions` §1/§3; approver rulings D1, D4) —
 * `scripts/integration-branch.cjs`, the one declaration of a release's integration branch: `release/X.Y` for a
 * `patch` of `vX.Y.Z` (Z ≥ 1), `main` for a `minor` or a release with no `kind` (`dl-092`; the template's
 * `exempt`). Bound as `release-publishing`'s `tag` pre-check `on-integration-branch` (`--check-head`).
 *
 * - `integrationBranch` and `checkHead` are pure: pinned in-process, exact messages (B7 lesson: the child-process
 *   cases below do not count toward coverage);
 * - `readHeadBranch` reads `git symbolic-ref` on a fixture repository, in-process;
 * - the CLI (print mode and `--check-head`) runs in a child process, exit codes 0 / 1 / 2.
 *
 * task-319 (`bug-386`, `bug-387`; design gate approved by the approver on 2026-10-30: D1 (a), D2 yes, D3 yes) rewrites
 * four of those pins in red and adds its own:
 * - AC1 (red-first): a HEAD git cannot read (not a repository, or git cannot run) exits 2, a wrong branch or a
 *   detached HEAD still exits 1; the script's header says so;
 * - AC2 (red-first): a minor's version, and that of a release with no `kind`, must be `vX.Y` (no leading zeros,
 *   no `.Z`); a malformed one is refused with one message, in-process and from the CLI (exit 2).
 *
 * Deterministic: fixture repositories under the OS temp dir (`fixtureDirPrefix`), never this one; the commit
 * identity is passed per command (`git-conventions` §5, `commitAllAs`), no `git config user.*`; no clock, no
 * network.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkHead, integrationBranch, readHeadBranch } from '../../scripts/integration-branch.cjs';
import { commitAllAs, fixtureDirPrefix, git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'integration-branch.cjs');
const IDENTITY = { name: 'WingFoil Test', email: 'wf-test@example.invalid' };

const patchMessage = (version: string): string => `a patch's version must be vX.Y.Z with Z ≥ 1, got "${version}" (dl-092, dl-159)`;
const kindMessage = (kind: string): string => `release kind "${kind}" is neither minor nor patch (dl-092)`;
/** task-319 AC2 (D2): one message for a minor and for a release with no kind. */
const minorMessage = (version: string): string => `a minor's version must be vX.Y, got "${version}" (dl-092, dl-159)`;

/** A fixture repository on `main` with one commit; no identity in its config (git-conventions §5). */
function makeRepo(): string {
  const repo = mkdtempSync(fixtureDirPrefix());
  git(repo, ['init', '--quiet', '--initial-branch=main']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  writeFixtureFile(repo, 'README.md', 'fixture\n');
  commitAllAs(repo, 'initial', IDENTITY);
  return repo;
}

/** Run the script in `cwd`; `env` replaces the child's environment when given (task-319: a PATH with no git). */
function run(cwd: string, args: string[], env?: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf-8', ...(env === undefined ? {} : { env }) });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('task-288 AC 4 — integrationBranch (pure): the derivation', () => {
  it.each([
    ['patch', 'v0.3.1', 'release/0.3'],
    ['patch', 'v1.0.2', 'release/1.0'],
    ['patch', 'v10.20.3', 'release/10.20'],
    ['minor', 'v0.4', 'main'],
    ['minor', 'v10.20', 'main'],
  ])('kind %p, version %p → %p', (kind, version, branch) => {
    expect(integrationBranch({ kind, version })).toEqual({ ok: true, branch });
  });

  // task-319 AC2 replaces task-288's "a minor ignores the version" and the `{}` → main pin: the version is read.
  it.each([
    ['a minor', { kind: 'minor' }],
    ['no kind', {}],
  ])('task-319 AC2 — %s with no version is refused with `got ""`', (_case, release) => {
    expect(integrationBranch(release)).toEqual({ ok: false, message: minorMessage('') });
  });

  it.each([
    ['undefined', { kind: undefined, version: 'v0.3' }],
    ['empty', { kind: '', version: 'v0.3' }],
  ])('no kind (%s; a pre-dl-092 release) → main', (_case, release) => {
    expect(integrationBranch(release)).toEqual({ ok: true, branch: 'main' });
  });

  it.each([['v0.3'], ['0.3.1'], ['v01.3.1'], ['v0.3.1-rc.1'], ['v0.3.0']])('a patch of version %p is refused, naming it', (version) => {
    expect(integrationBranch({ kind: 'patch', version })).toEqual({ ok: false, message: patchMessage(version) });
  });

  it('a patch with no version is refused with `got ""`', () => {
    expect(integrationBranch({ kind: 'patch' })).toEqual({ ok: false, message: patchMessage('') });
  });

  it.each([['major'], ['Patch'], ['fix']])('kind %p is refused', (kind) => {
    expect(integrationBranch({ kind, version: 'v0.3.1' })).toEqual({ ok: false, message: kindMessage(kind) });
  });

  const malformedMinorVersions = ['v0.4.0', 'v0.3.1', 'garbage', 'v01.3', '0.4', 'v0.4-rc.1'];
  const minorKinds: ReadonlyArray<string | undefined> = ['minor', '', undefined];
  it.each(minorKinds.flatMap((kind) => malformedMinorVersions.map((version): [string | undefined, string] => [kind, version])))(
    'task-319 AC2 — kind %p, version %p is refused with the minor message',
    (kind, version) => {
      expect(integrationBranch({ kind, version })).toEqual({ ok: false, message: minorMessage(version) });
    },
  );

  it('task-319 AC2 — an unknown kind with a malformed version still gets the kind message (the kind is checked first)', () => {
    expect(integrationBranch({ kind: 'major', version: 'garbage' })).toEqual({ ok: false, message: kindMessage('major') });
  });
});

describe('task-288 AC 4 — checkHead (pure): the verdict', () => {
  it('passes when HEAD is on the expected branch', () => {
    expect(checkHead('release/0.3', 'v0.3.1', 'release/0.3')).toEqual({
      ok: true,
      message: 'HEAD is on release/0.3, the integration branch of v0.3.1 (dl-159)',
    });
  });

  it('refuses another branch, naming both', () => {
    expect(checkHead('release/0.3', 'v0.3.1', 'main')).toEqual({
      ok: false,
      message: 'HEAD is on main, not on release/0.3, the integration branch of v0.3.1 (dl-159)',
    });
  });

  it('refuses a detached HEAD', () => {
    expect(checkHead('main', 'v0.4', null)).toEqual({
      ok: false,
      message: 'HEAD is detached, not on main, the integration branch of v0.4 (dl-159)',
    });
  });
});

describe('task-288 AC 4 — readHeadBranch and the CLI, on a fixture repository', () => {
  let repo: string;
  let outside: string;

  beforeAll(() => {
    repo = makeRepo();
    outside = mkdtempSync(fixtureDirPrefix());
  });
  afterAll(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  it('readHeadBranch: the branch HEAD is on, null when detached, a refusal outside a repository', () => {
    git(repo, ['checkout', '--quiet', 'main']);
    expect(readHeadBranch(repo)).toEqual({ ok: true, branch: 'main' });
    git(repo, ['checkout', '--quiet', '--detach']);
    try {
      expect(readHeadBranch(repo)).toEqual({ ok: true, branch: null });
    } finally {
      git(repo, ['checkout', '--quiet', 'main']);
    }
    const refused = readHeadBranch(outside);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.message).toMatch(/^could not read HEAD: /);
  });

  describe('print mode', () => {
    it('a patch prints release/X.Y, exit 0', () => {
      expect(run(repo, ['--kind', 'patch', '--version', 'v0.3.1'])).toEqual({ status: 0, stdout: 'release/0.3\n', stderr: '' });
    });

    it.each([
      ['a minor', ['--kind', 'minor', '--version', 'v0.4']],
      ['no --kind', ['--version', 'v0.3']],
      ['an empty --kind', ['--kind', '', '--version', 'v0.3']],
    ])('%s prints main, exit 0', (_case, args) => {
      expect(run(repo, args)).toEqual({ status: 0, stdout: 'main\n', stderr: '' });
    });

    it('a patch whose version is not vX.Y.Z: exit 2, the message on stderr', () => {
      const result = run(repo, ['--kind', 'patch', '--version', 'v0.3']);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe(patchMessage('v0.3'));
    });

    it.each([
      ['a minor of version garbage', ['--kind', 'minor', '--version', 'garbage'], 'garbage'],
      ['no --kind, version v0.3.1', ['--version', 'v0.3.1'], 'v0.3.1'],
    ])('task-319 AC2 — %s: exit 2, nothing on stdout, the minor message on stderr', (_case, args, version) => {
      expect(run(repo, args)).toEqual({ status: 2, stdout: '', stderr: `${minorMessage(version)}\n` });
    });

    it.each([
      ['no --version', ['--kind', 'minor']],
      ['an unknown option', ['--kind', 'minor', '--version', 'v0.4', '--bogus']],
      ['a value-less flag', ['--kind', 'minor', '--version']],
    ])('%s: exit 2, usage on stderr', (_case, args) => {
      const result = run(repo, args);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/^usage:/);
    });
  });

  describe('--check-head', () => {
    afterEach(() => {
      git(repo, ['checkout', '--quiet', 'main']);
    });

    it('a minor on main passes: exit 0, the pass line on stdout', () => {
      const result = run(repo, ['--check-head', '--kind', 'minor', '--version', 'v0.4']);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('HEAD is on main, the integration branch of v0.4 (dl-159)');
    });

    it('a patch on release/X.Y passes: exit 0', () => {
      git(repo, ['checkout', '--quiet', '-B', 'release/0.3']);
      const result = run(repo, ['--check-head', '--kind', 'patch', '--version', 'v0.3.1']);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('HEAD is on release/0.3, the integration branch of v0.3.1 (dl-159)');
    });

    it('a patch on main is refused: exit 1, naming both branches', () => {
      const result = run(repo, ['--check-head', '--kind', 'patch', '--version', 'v0.3.1']);
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe('HEAD is on main, not on release/0.3, the integration branch of v0.3.1 (dl-159)');
    });

    it('a detached HEAD is refused: exit 1', () => {
      git(repo, ['checkout', '--quiet', '--detach']);
      const result = run(repo, ['--check-head', '--kind', 'minor', '--version', 'v0.4']);
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe('HEAD is detached, not on main, the integration branch of v0.4 (dl-159)');
    });

    // task-319 AC1 rewrites task-288's "outside any repository: exit 1": a HEAD git cannot read is exit 2 (D1 (a)).
    it('task-319 AC1 — outside any repository: exit 2, could not read HEAD, nothing on stdout', () => {
      const result = run(outside, ['--check-head', '--kind', 'minor', '--version', 'v0.4']);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/^could not read HEAD: /);
      expect(result.stdout).toBe('');
    });

    it('task-319 AC1 — git cannot run (no git on PATH): exit 2, could not read HEAD: spawnSync git ENOENT', () => {
      // An empty directory as the whole PATH: node starts (process.execPath is absolute), `git` is not found.
      const noGit = mkdtempSync(fixtureDirPrefix());
      try {
        const result = run(repo, ['--check-head', '--kind', 'minor', '--version', 'v0.4'], { ...process.env, PATH: noGit });
        expect(result).toEqual({ status: 2, stdout: '', stderr: 'could not read HEAD: spawnSync git ENOENT\n' });
      } finally {
        removeTempDir(noGit);
      }
    });

    it('task-319 AC2 — a minor of version v0.4.0 on main is refused before HEAD is read: exit 2', () => {
      expect(run(repo, ['--check-head', '--kind', 'minor', '--version', 'v0.4.0'])).toEqual({
        status: 2,
        stdout: '',
        stderr: `${minorMessage('v0.4.0')}\n`,
      });
    });

    it('a derivation refusal is a misconfiguration: exit 2', () => {
      const result = run(repo, ['--check-head', '--kind', 'major', '--version', 'v0.4']);
      expect(result.status).toBe(2);
      expect(result.stderr.trim()).toBe(kindMessage('major'));
    });
  });
});

describe("task-319 AC1 — the script's header states the exit codes of --check-head", () => {
  /** The docblock before `'use strict'`, `*` markers removed, whitespace-flattened (task-276). */
  const header = (() => {
    const raw = readFileSync(SCRIPT, 'utf-8');
    const end = raw.indexOf("'use strict'");
    const block = raw.slice(0, end < 0 ? undefined : end);
    return block
      .replace(/^#!.*$/m, '')
      .replace(/^\s*\/?\*+\/?\s?/gm, '')
      .replace(/\s+/g, ' ');
  })();

  it('exit 1 is a refusal (another branch, or detached); exit 2 also covers a HEAD git cannot read', () => {
    expect(header).toContain('--check-head');
    expect(header).toContain('1 refusal (another branch, or detached)');
    expect(header).toContain('2 refused release / usage error / HEAD unreadable (git cannot run, or not a repository)');
  });
});
