/**
 * task-278-take-the-governance-state-rule-s-from-state-from-the-commit-s-parent (`bug-308`) — the
 * governance check's state rule judges each commit against its first parent, so an `amend` on `main`
 * made while the same task is started on its branch, then merged, raises no finding; and a commit that
 * really does move the status against its parent still does.
 *
 * Before the fix the from-state was the previous entry of the path's `git log --follow` walk, which is
 * ordered by date: the amend read `in-progress → backlog` (a false positive, `d818c0dd` on `main`), and
 * a later commit that moved the merged `in-progress` back to `backlog` read `backlog → backlog` (a
 * false negative).
 *
 * Throwaway fixture repositories; fixed commit dates; identities per command (`dl-094` (ii)).
 */
import { execFileSync } from 'node:child_process';

import { checkGovernance } from '../../scripts/check-governance.cjs';
import type { GovernanceReport } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
`;

const APPROVER = { name: 'Ada Approver', email: 'approver@example.invalid' };
const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };

const DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${APPROVER.name}
      email: ${APPROVER.email}
      roles: [ approver, developer ]
    - name: ${DEVELOPER.name}
      email: ${DEVELOPER.email}
      roles: [ developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

const DOC = 'docs/memory/task/t-1.md';

function approval(reason: string): string {
  return `\n\nApprover: ${APPROVER.name} <${APPROVER.email}> (approver)\nReason: ${reason}`;
}

function taskDoc(status: string, extra = ''): string {
  return ['---', 'id: "t-1"', 'type: task', 'title: "Task t-1"', `status: ${status}`, '---', '', 'Body.', ...(extra ? [extra] : []), ''].join('\n');
}

function env(time: string, author: { name: string; email: string }): NodeJS.ProcessEnv {
  const date = `2026-01-01T${time}:00Z`;
  return {
    ...process.env,
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  };
}

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

/** `bug-308`'s shape on a governed repository: approved to backlog; start on a branch; amend on main; merge. */
function interleaved(): { root: string; start: string; amend: string; merge: string } {
  const root = makeTempGitRepo();
  roots.push(root);
  const commit = (time: string, message: string, files: Record<string, string>, author = DEVELOPER): string => {
    for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: root, encoding: 'utf-8', env: env(time, author) });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  commit('08:00', 'chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA });
  commit('09:00', 'wf(task): add t-1', { [DOC]: taskDoc('draft') });
  commit('09:10', 'wf(task): submit t-1', { [DOC]: taskDoc('pending') });
  commit('09:20', 'wf(task): approve t-1 [pending → backlog]' + approval('Ready.'), { [DOC]: taskDoc('backlog') }, APPROVER);
  git(root, ['checkout', '--quiet', '-b', 'task/t-1']);
  const start = commit('11:00', 'wf(task): start t-1 [backlog → in-progress]', { [DOC]: taskDoc('in-progress') });
  git(root, ['checkout', '--quiet', 'main']);
  const amend = commit('12:00', 'wf(task): amend t-1 [backlog → backlog]' + approval('A clarified line.'), { [DOC]: taskDoc('backlog', 'A clarified line.') }, APPROVER);
  execFileSync('git', ['merge', '--quiet', '--no-ff', '-m', "Merge branch 'task/t-1'", 'task/t-1'], { cwd: root, encoding: 'utf-8', env: env('13:00', DEVELOPER) });
  const merge = git(root, ['rev-parse', 'HEAD']).trim();
  return { root, start, amend, merge };
}

function findingsOf(report: GovernanceReport, sha: string): string[] {
  return report.findings.filter((finding) => finding.sha === sha).map((finding) => `${finding.rule}: ${finding.message}`);
}

describe('the state rule takes the from-state from the commit\'s parent (bug-308)', () => {
  it('reports no finding for an amend on main made while the task was started on its branch', () => {
    const { root, amend, start } = interleaved();
    const report = checkGovernance(root);
    expect(findingsOf(report, amend)).toEqual([]);
    expect(findingsOf(report, start)).toEqual([]);
    expect(report.findings).toEqual([]);
  });

  it('still reports a commit that does move in-progress → backlog against its parent (the merge)', () => {
    const { root, merge } = interleaved();
    writeFixtureFile(root, DOC, taskDoc('backlog', 'A clarified line.'));
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '-m', 'wf(task): amend t-1 [backlog → backlog]' + approval('Back to backlog.')], {
      cwd: root,
      encoding: 'utf-8',
      env: env('14:00', APPROVER),
    });
    const moved = git(root, ['rev-parse', 'HEAD']).trim();
    expect(git(root, ['rev-parse', `${moved}^1`]).trim()).toBe(merge);

    const report = checkGovernance(root);
    expect(findingsOf(report, moved)).toEqual([
      expect.stringMatching(/^state: .*t-1\.md.*backlog → backlog.*in-progress → backlog/),
    ]);
  });
});
