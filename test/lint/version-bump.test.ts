/**
 * Version-bump gate for the four versioned config files
 * (task-183-gate-four-versioned-config-files-version-bump-pending, `bug-143`, `dl-047` option 1).
 *
 * `.wingfoil/dna.yaml`, `memory.yaml`, `workflows.yaml` and `roles.yaml` each declare a top-level
 * `version:`, so the `doc-versioning` directive's bump rule applies to them. Nine v0.2-era commits
 * changed them without moving it, and nothing checked. This suite fails when the PENDING change — the
 * working tree, staged or not, against `HEAD` — changes one of the four files without changing its
 * `version:`. History is not re-judged: a clean committed tree passes, whatever its commits did.
 *
 * - Any byte change is a content change, comments included: their `[SPEC]`/`[AUTHORING]` provenance
 *   annotations are part of the file's content (field-provenance convention).
 * - Versions are compared as YAML reads them, so `1.10` after `1.1` is no bump (memory.yaml's own note).
 * - The bump baseline is `main` (doc-versioning, approver ruling 2026-10-01): a branch bumps a file once,
 *   and further edits on it do not bump again. So an edit that leaves `version:` as at `HEAD` passes when
 *   `HEAD` already carries a version different from the one at its fork point from `main`
 *   (`git-conventions` §2 names `main` as the trunk every task branch is cut from).
 * - A file absent at `HEAD` (new) or from the working tree (deleted) has no pending edit to judge.
 *
 * Deterministic: a fixed, ordered file list; the verdict is a pure function of git objects and bytes.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import {
  TRUNK_BRANCH,
  VERSIONED_CONFIG_FILES,
  checkPendingVersionBumps,
  formatVersionBumpFindings,
} from './helpers/version-bump';

const REPO_ROOT = join(__dirname, '..', '..');

const DNA = '.wingfoil/dna.yaml';
const ROLES = '.wingfoil/roles.yaml';

function config(version: string, body: string, comment = '# header'): string {
  return `${comment}\nversion: ${version}   # [AUTHORING] content revision\nproject:\n  name: ${body}\n`;
}

describe('version bump of the four versioned config files (bug-143, task-183)', () => {
  it('passes on this repository\'s pending change', () => {
    const findings = checkPendingVersionBumps(REPO_ROOT);
    if (findings.length > 0) throw new Error(`version-bump gate failed:\n${formatVersionBumpFindings(findings)}`);
    expect(findings).toEqual([]);
  });

  it('judges exactly the four versioned config files, against the trunk main', () => {
    expect(VERSIONED_CONFIG_FILES).toEqual([
      '.wingfoil/dna.yaml',
      '.wingfoil/memory.yaml',
      '.wingfoil/workflows.yaml',
      '.wingfoil/roles.yaml',
    ]);
    expect(TRUNK_BRANCH).toBe('main');
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
      writeFixtureFile(repo, DNA, config('1.0', 'b'));
      expect(checkPendingVersionBumps(repo).map((finding) => finding.path)).toEqual([DNA]);
      writeFixtureFile(repo, DNA, config('1.1', 'b'));
      expect(checkPendingVersionBumps(repo)).toEqual([]);
    });
  });
});
