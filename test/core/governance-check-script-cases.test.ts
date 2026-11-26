/**
 * task-366 AC 3 (characterization; `spec-020` §4.1, §6.1, AC-9; design D1 (a) as ruled at the design gate) — the two
 * cases of the script's suites that asserted the script's own reading of `memory.yaml` at the judged commit, which
 * `spec-020` §4.1 replaces with the first parent's, move here and drive `governanceCheck` (the rule module the script
 * now runs through `wingfoil verify`):
 *
 * - (i) from `test/cli/check-governance.test.ts` › "configuration a gated commit cannot be checked without" › "keeps
 *   history lenient": the commit that removes `memory.yaml` and approves `t-1` in the same commit is judged against its
 *   parent's machine — no finding and no `stateUnchecked` entry for it;
 * - (ii) from `test/cli/check-governance-provenance.test.ts`: a root commit carrying `memory.yaml` with
 *   `wf(task): add t-1` has no first parent, so no machine: a gated `state` finding with no introduction.
 *
 * Both pass on first run: `governanceCheck` ships with `task-365`. Fixtures: throwaway repositories
 * (`test/storage/helpers/git-fixture.ts`), fixed commit dates, identities per commit, the `MEMORY_YAML` / `DNA` /
 * `taskDoc` of `./helpers/in-memory-history-reader`.
 */
import { execFileSync } from 'node:child_process';

import { governanceCheck } from '../../src/core/governance-check';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { APPROVER, DEVELOPER, DNA, MEMORY_YAML, TASK, approvalBody, taskDoc, type Person } from './helpers/in-memory-history-reader';

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

/** A throwaway repository; `commit` writes (text) or deletes (`null`) files, commits everything and returns the sha. */
function repository(): { root: string; commit(message: string, files?: Record<string, string | null>, author?: Person): string } {
  const root = makeTempGitRepo();
  roots.push(root);
  let minute = 0;
  const commit = (message: string, files: Record<string, string | null> = {}, author: Person = DEVELOPER): string => {
    for (const [path, content] of Object.entries(files)) {
      if (content === null) git(root, ['rm', '--quiet', path]);
      else writeFixtureFile(root, path, content);
    }
    git(root, ['add', '-A']);
    const date = `2026-01-01T11:${String(minute).padStart(2, '0')}:00Z`;
    minute += 1;
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', message], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  return { root, commit };
}

describe('task-366 AC 3 (i) — moved from check-governance.test.ts: a commit is judged against its parent\'s memory.yaml (spec-020 §4.1)', () => {
  const repo = repository();
  repo.commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA });
  repo.commit('wf(task): add t-1', { [TASK('t-1')]: taskDoc('draft') });
  repo.commit('wf(task): submit t-1', { [TASK('t-1')]: taskDoc('pending') });
  const removesAndApproves = repo.commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody()}`, { '.wingfoil/memory.yaml': null, [TASK('t-1')]: taskDoc('backlog') }, APPROVER);
  const introduction = repo.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
  const report = governanceCheck(repo.root, { introducedAt: introduction });

  it('history: the commit that removes memory.yaml and approves t-1 has no finding and no stateUnchecked entry', () => {
    expect(report.findings.filter((finding) => finding.sha === removesAndApproves)).toEqual([]);
    expect(report.stateUnchecked.filter((entry) => entry.sha === removesAndApproves)).toEqual([]);
  });
});

describe('task-366 AC 3 (ii) — moved from check-governance-provenance.test.ts: a root commit carrying memory.yaml has no machine (spec-020 §4.1)', () => {
  const repo = repository();
  const root = repo.commit('wf(task): add t-1', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA, [TASK('t-1')]: taskDoc('draft') });
  const report = governanceCheck(repo.root, {});

  it('with no introduction, the root wf(task): add is one gated state finding: no memory.yaml is committed at this commit', () => {
    expect(report.introducedAt).toBeNull();
    expect(report.findings.filter((finding) => finding.sha === root).map(({ rule, check, message, gated }) => ({ rule, check, message, gated }))).toEqual([
      { rule: 'state', check: 'state', message: 'no .wingfoil/memory.yaml is committed at this commit: its state cannot be checked', gated: true },
    ]);
  });
});
