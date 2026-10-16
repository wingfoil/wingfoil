/**
 * Version-bump gate for the four versioned config files
 * (task-183-gate-four-versioned-config-files-version-bump-pending, `bug-143`, `dl-047` option 1;
 * the integration-branch baseline: task-287, `dl-159` A1 item 7).
 *
 * `.wingfoil/dna.yaml`, `memory.yaml`, `workflows.yaml` and `roles.yaml` each declare a top-level
 * `version:`, so the `doc-versioning` directive's bump rule applies to them. Nine v0.2-era commits
 * changed them without moving it, and nothing checked. This suite fails when the PENDING change — the
 * working tree, staged or not, against `HEAD` — changes one of the four files without changing its
 * `version:`. History is not re-judged: a clean committed tree passes, whatever its commits did.
 *
 * - Any byte change is a content change, comments included: their `[SPEC]`/`[AUTHORING]` provenance
 *   annotations are part of the file's content (field-provenance convention).
 * - Versions are compared as YAML reads them, so `1.10` after `1.1` is no bump (memory.yaml's own note),
 *   and a bump is a numeric increase: a downgrade or a re-quoting is none (task-208, `bug-249`).
 * - The bump baseline is the branch's integration branch, `main` or `release/<major>.<minor>`
 *   (doc-versioning, `git-conventions` §1, `dl-159`): a branch bumps a file once, and further edits on
 *   it do not bump again. So an edit that leaves `version:` as at `HEAD` passes when `HEAD` already
 *   carries a version greater than the one at its fork point from that integration branch.
 *   The integration branch is chosen among the LOCAL `main` and every local `release/<major>.<minor>`
 *   (`release/foo` or `release/0.3.1` is no candidate): the one whose fork point with `HEAD` descends
 *   from every other's, i.e. the line `HEAD` left most recently; `main` on a tie; on a line itself,
 *   that line, so the check there is strict. With no candidate, or with fork points that do not order,
 *   the judgement is strict, against `HEAD` alone. A stale local branch can over-credit a bump.
 * - "Differs" is git's own verdict (`git diff HEAD`), so a clean `core.autocrlf` checkout is no change.
 * - A file absent at `HEAD` (new) or from the working tree (deleted) has no pending edit to judge.
 *
 * Deterministic: a fixed, ordered file list and candidates read in a sorted order (`main`, then the
 * release lines by major and minor, numerically); the verdict depends only on git objects, file bytes,
 * the repository's eol settings and where the local candidate branches point — no clock, no randomness.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import {
  RELEASE_LINE_PATTERN,
  TRUNK_BRANCH,
  VERSIONED_CONFIG_FILES,
  checkPendingVersionBumps,
  formatVersionBumpFindings,
  integrationBranchOf,
} from './helpers/version-bump';
import type { IntegrationBranch } from './helpers/version-bump';

const REPO_ROOT = join(__dirname, '..', '..');

const DNA = '.wingfoil/dna.yaml';
const ROLES = '.wingfoil/roles.yaml';

function config(version: string, body: string, comment = '# header'): string {
  return `${comment}\nversion: ${version}   # [AUTHORING] content revision\nproject:\n  name: ${body}\n`;
}

/** The full sha `rev` names in `repo`. */
function sha(repo: string, rev: string): string {
  return git(repo, ['rev-parse', rev]).trim();
}

/** The integration branch expected in `repo`: `name`, forking at the commit `rev` names. */
function line(repo: string, name: string, rev: string): IntegrationBranch {
  return { name, forkPoint: sha(repo, rev) };
}

const STILL_1_1 = { path: DNA, reason: 'content differs from HEAD but version: is still 1.1' };

describe('version bump of the four versioned config files (bug-143, task-183)', () => {
  it('passes on this repository\'s pending change', () => {
    const findings = checkPendingVersionBumps(REPO_ROOT);
    if (findings.length > 0) throw new Error(`version-bump gate failed:\n${formatVersionBumpFindings(findings)}`);
    expect(findings).toEqual([]);
  });

  it('judges exactly the four versioned config files; the integration-branch candidates are main and release/<major>.<minor>', () => {
    expect(VERSIONED_CONFIG_FILES).toEqual([
      '.wingfoil/dna.yaml',
      '.wingfoil/memory.yaml',
      '.wingfoil/workflows.yaml',
      '.wingfoil/roles.yaml',
    ]);
    expect(TRUNK_BRANCH).toBe('main');
    for (const name of ['release/0.3', 'release/10.12']) expect([name, RELEASE_LINE_PATTERN.test(name)]).toEqual([name, true]);
    for (const name of ['release/foo', 'release/0.3.1', 'release/v0.3', 'release/0.03', 'release/0.3/x', 'main']) {
      expect([name, RELEASE_LINE_PATTERN.test(name)]).toEqual([name, false]);
    }
  });

  describe('on a fixture repository', () => {
    let repo: string;

    beforeEach(() => {
      repo = makeTempGitRepo();
      for (const path of VERSIONED_CONFIG_FILES) writeFixtureFile(repo, path, config('1.0', 'a'));
      commitAll(repo, 'seed');
    });

    afterEach(() => removeTempDir(repo));

    it('passes a clean committed tree', () => {
      expect(checkPendingVersionBumps(repo)).toEqual([]);
    });

    it('passes a clean checkout whose working tree has CRLF line ends from core.autocrlf', () => {
      git(repo, ['config', 'core.autocrlf', 'true']);
      for (const path of VERSIONED_CONFIG_FILES) rmSync(join(repo, path));
      git(repo, ['checkout', '--quiet', '--', '.']);
      expect(readFileSync(join(repo, DNA), 'utf-8')).toContain('\r\n');
      expect(checkPendingVersionBumps(repo)).toEqual([]);
      writeFixtureFile(repo, DNA, config('1.0', 'b').replace(/\n/g, '\r\n'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA]);
    });

    it('fails a content edit that leaves version: unchanged, naming the file and the version', () => {
      writeFixtureFile(repo, DNA, config('1.0', 'b'));
      const findings = checkPendingVersionBumps(repo);
      expect(findings).toEqual([
        { path: DNA, reason: 'content differs from HEAD but version: is still 1.0' },
      ]);
      expect(formatVersionBumpFindings(findings)).toBe(
        `${DNA}: content differs from HEAD but version: is still 1.0`,
      );
    });

    it('fails a staged edit the same way as an unstaged one', () => {
      writeFixtureFile(repo, ROLES, config('1.0', 'b'));
      git(repo, ['add', ROLES]);
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([ROLES]);
    });

    it('reports every offending file, in the declared order', () => {
      writeFixtureFile(repo, ROLES, config('1.0', 'b'));
      writeFixtureFile(repo, DNA, config('1.0', 'b'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA, ROLES]);
    });

    it('passes a content edit that bumps version:', () => {
      writeFixtureFile(repo, DNA, config('1.1', 'b'));
      expect(checkPendingVersionBumps(repo)).toEqual([]);
    });

    it('fails a comment-only edit that leaves version: unchanged', () => {
      writeFixtureFile(repo, DNA, config('1.0', 'a', '# header, reworded'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA]);
    });

    it('compares versions as YAML reads them: 1.10 after 1.1 is no bump', () => {
      writeFixtureFile(repo, DNA, config('1.1', 'a'));
      commitAll(repo, 'bump to 1.1');
      writeFixtureFile(repo, DNA, config('1.10', 'b'));
      expect(checkPendingVersionBumps(repo)).toEqual([
        { path: DNA, reason: "content differs from HEAD but version: 1.10 reads as 1.1 in YAML, the same as HEAD's 1.1" },
      ]);
    });

    it('fails a downgrade: a bump is a numeric increase, not any difference (bug-249)', () => {
      writeFixtureFile(repo, DNA, config('0.9', 'b'));
      expect(checkPendingVersionBumps(repo)).toEqual([
        { path: DNA, reason: "content differs from HEAD but version: 0.9 is not greater than HEAD's 1.0" },
      ]);
    });

    it('fails a re-quoting that reads as the same number (bug-249)', () => {
      writeFixtureFile(repo, DNA, config('"1.0"', 'b'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA]);
    });

    it('credits a branch bump only when it is an increase over the fork point (bug-249)', () => {
      git(repo, ['checkout', '--quiet', '-b', 'task/x']);
      writeFixtureFile(repo, DNA, config('0.9', 'b'));
      commitAll(repo, 'edit and downgrade');
      writeFixtureFile(repo, DNA, config('0.9', 'c'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA]);
    });

    it('fails an edit that removes version:', () => {
      writeFixtureFile(repo, DNA, '# header\nproject:\n  name: b\n');
      expect(checkPendingVersionBumps(repo)).toEqual([
        { path: DNA, reason: 'content differs from HEAD but declares no top-level version:' },
      ]);
    });

    it('fails an edit that leaves the file unparsable, instead of throwing', () => {
      writeFixtureFile(repo, DNA, 'version: 1.1\nproject: [unclosed\n');
      const findings = checkPendingVersionBumps(repo);
      expect(findings.map((finding) => finding.path)).toEqual([DNA]);
      expect(findings[0]?.reason).toMatch(/^content differs from HEAD but is not readable YAML: /);
    });

    it('does not judge a file deleted from the working tree', () => {
      rmSync(join(repo, DNA));
      expect(checkPendingVersionBumps(repo)).toEqual([]);
    });

    it('does not judge a file absent at HEAD, which has no committed version to bump from', () => {
      git(repo, ['rm', '--quiet', ROLES]);
      commitAll(repo, 'remove roles');
      writeFixtureFile(repo, ROLES, config('1.0', 'b'));
      expect(checkPendingVersionBumps(repo)).toEqual([]);
    });

    it('passes a further edit on a branch that already bumped the file since it left main', () => {
      git(repo, ['checkout', '--quiet', '-b', 'task/x']);
      writeFixtureFile(repo, DNA, config('1.1', 'b'));
      commitAll(repo, 'edit and bump');
      writeFixtureFile(repo, DNA, config('1.1', 'c'));
      expect(checkPendingVersionBumps(repo)).toEqual([]);
    });

    it('fails a further edit on a branch whose committed edit did not bump the file', () => {
      git(repo, ['checkout', '--quiet', '-b', 'task/x']);
      writeFixtureFile(repo, DNA, config('1.0', 'b'));
      commitAll(repo, 'edit without bump');
      writeFixtureFile(repo, DNA, config('1.0', 'c'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA]);
    });

    it('fails an unbumped edit on main itself, whatever an earlier commit did', () => {
      writeFixtureFile(repo, DNA, config('1.1', 'b'));
      commitAll(repo, 'bump on main');
      writeFixtureFile(repo, DNA, config('1.1', 'c'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA]);
    });

    it('judges against HEAD alone when no main branch exists', () => {
      git(repo, ['branch', '--quiet', '-m', 'main', 'trunk']);
      expect(integrationBranchOf(repo)).toBeNull();
      writeFixtureFile(repo, DNA, config('1.0', 'b'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA]);
      writeFixtureFile(repo, DNA, config('1.1', 'b'));
      expect(checkPendingVersionBumps(repo)).toEqual([]);
    });
    describe('the integration branch is the bump baseline: main or release/<major>.<minor> (task-287, dl-159)', () => {
      /** `release/0.3` cut from the seed, with the DNA bumped to 1.1 and committed there; back on `main`. */
      function releaseLineWithDnaBump(): void {
        git(repo, ['checkout', '--quiet', '-b', 'release/0.3']);
        writeFixtureFile(repo, DNA, config('1.1', 'b'));
        commitAll(repo, 'bump on release/0.3');
        git(repo, ['checkout', '--quiet', 'main']);
      }

      /** On `main`: the roles file bumped to 1.1 and committed. */
      function mainRolesBump(): void {
        writeFixtureFile(repo, ROLES, config('1.1', 'm'));
        commitAll(repo, 'bump on main');
      }

      it('(1) chooses main for a task branch cut from main when no release/* exists', () => {
        git(repo, ['checkout', '--quiet', '-b', 'task/x']);
        expect(integrationBranchOf(repo)).toEqual(line(repo, 'main', 'main'));
      });

      it('(2) chooses release/0.3 for a task branch cut from it, and fails a further unbumped edit there', () => {
        releaseLineWithDnaBump();
        git(repo, ['checkout', '--quiet', '-b', 'task/x', 'release/0.3']);
        writeFixtureFile(repo, DNA, config('1.1', 'c'));
        expect(integrationBranchOf(repo)).toEqual(line(repo, 'release/0.3', 'release/0.3'));
        expect(checkPendingVersionBumps(repo)).toEqual([STILL_1_1]);
      });

      it('(3) passes a further edit on a task branch from release/0.3 that bumped the file itself', () => {
        releaseLineWithDnaBump();
        git(repo, ['checkout', '--quiet', '-b', 'task/x', 'release/0.3']);
        writeFixtureFile(repo, DNA, config('1.2', 'c'));
        commitAll(repo, 'edit and bump on task/x');
        writeFixtureFile(repo, DNA, config('1.2', 'd'));
        expect(checkPendingVersionBumps(repo)).toEqual([]);
        expect(integrationBranchOf(repo)).toEqual(line(repo, 'release/0.3', 'release/0.3'));
      });

      it('(4) chooses main, not release/0.3, for a task branch cut from main after a merge forward', () => {
        releaseLineWithDnaBump();
        mainRolesBump();
        git(repo, ['merge', '--no-ff', '--quiet', '-m', 'merge forward', 'release/0.3']);
        git(repo, ['checkout', '--quiet', '-b', 'task/y']);
        expect(integrationBranchOf(repo)).toEqual(line(repo, 'main', 'main'));
        writeFixtureFile(repo, DNA, config('1.1', 'e'));
        expect(checkPendingVersionBumps(repo)).toEqual([STILL_1_1]);
      });

      it('(5) chooses main on a tie, right after release/0.3 is cut', () => {
        const seed = sha(repo, 'HEAD');
        git(repo, ['branch', 'release/0.3']);
        git(repo, ['checkout', '--quiet', '-b', 'task/x', 'main']);
        expect(integrationBranchOf(repo)).toEqual({ name: 'main', forkPoint: seed });
      });

      it('(6) does not take a release/ name that is not <major>.<minor> as a candidate', () => {
        const seed = sha(repo, 'HEAD');
        git(repo, ['checkout', '--quiet', '-b', 'release/foo']);
        writeFixtureFile(repo, DNA, config('1.1', 'b'));
        commitAll(repo, 'bump on release/foo');
        git(repo, ['branch', 'release/0.3.1', 'release/foo']);
        git(repo, ['checkout', '--quiet', '-b', 'task/x', 'release/foo']);
        expect(integrationBranchOf(repo)).toEqual({ name: 'main', forkPoint: seed });
        writeFixtureFile(repo, DNA, config('1.1', 'c'));
        expect(checkPendingVersionBumps(repo)).toEqual([]);
      });

      it('(7) chooses none and judges strictly against HEAD when the fork points do not order', () => {
        releaseLineWithDnaBump();
        mainRolesBump();
        git(repo, ['checkout', '--quiet', '-b', 'task/x']);
        git(repo, ['merge', '--no-ff', '--quiet', '-m', 'm', 'release/0.3']);
        expect(integrationBranchOf(repo)).toBeNull();
        writeFixtureFile(repo, DNA, config('1.1', 'z'));
        expect(checkPendingVersionBumps(repo)).toEqual([STILL_1_1]);
      });

      it('(8) chooses release/0.3 on release/0.3 itself, and fails an unbumped edit there', () => {
        releaseLineWithDnaBump();
        git(repo, ['checkout', '--quiet', 'release/0.3']);
        writeFixtureFile(repo, DNA, config('1.1', 'c'));
        expect(integrationBranchOf(repo)).toEqual(line(repo, 'release/0.3', 'HEAD'));
        expect(checkPendingVersionBumps(repo)).toEqual([STILL_1_1]);
      });

      it('(8) chooses main on main itself while a release/0.3 exists, and fails an unbumped edit there', () => {
        git(repo, ['branch', 'release/0.3']);
        writeFixtureFile(repo, DNA, config('1.1', 'b'));
        commitAll(repo, 'bump on main');
        writeFixtureFile(repo, DNA, config('1.1', 'c'));
        expect(integrationBranchOf(repo)).toEqual(line(repo, 'main', 'HEAD'));
        expect(checkPendingVersionBumps(repo)).toEqual([STILL_1_1]);
      });

      it('(10) orders release lines numerically: release/0.3 before release/0.10 at the same commit', () => {
        releaseLineWithDnaBump();
        git(repo, ['branch', 'release/0.10', 'release/0.3']);
        mainRolesBump();
        git(repo, ['checkout', '--quiet', '-b', 'task/x', 'release/0.3']);
        expect(integrationBranchOf(repo)).toEqual(line(repo, 'release/0.3', 'release/0.3'));
      });
    });
  });
});
