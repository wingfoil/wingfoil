/**
 * task-278 (`bug-308`) — the parent read follows the same unreadable-revision rule as the commit's own
 * (task-171, `bug-188`): tolerant, the transition's `fromState` is `null`; strict, the parse error is
 * thrown, whichever of the two reads met it.
 */
import { execFileSync } from 'child_process';

import { reconstructMemoryTransitions } from '../../src/memory/audit';
import { ValidationError } from '../../src/validation';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DOC = 'docs/04_memory/v0.1/task-1.md';

function commitAt(repo: string, time: string, message: string): string {
  const date = `2026-01-01T${time}:00Z`;
  git(repo, ['add', '-A']);
  execFileSync('git', ['commit', '--quiet', '-m', message], {
    cwd: repo,
    encoding: 'utf-8',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

const repos: string[] = [];
afterAll(() => repos.forEach(removeTempDir));

/** A revision whose frontmatter does not parse, then its fix. */
function brokenThenFixed(fixTime: string): { root: string; broken: string; fixed: string } {
  const root = makeTempGitRepo();
  repos.push(root);
  writeFixtureFile(root, DOC, '---\nid: task-1\nstatus: [unclosed\n---\n\nBody.\n');
  const broken = commitAt(root, '10:00', 'wf(task): add task-1');
  writeFixtureFile(root, DOC, '---\nid: task-1\nstatus: draft\n---\n\nBody.\n');
  const fixed = commitAt(root, fixTime, 'wf(task): submit task-1');
  return { root, broken, fixed };
}

describe('an unreadable revision in the parent', () => {
  it('tolerant: the next commit reads fromState null, the broken one carries `unreadable`', () => {
    const { root, broken, fixed } = brokenThenFixed('11:00');
    const transitions = reconstructMemoryTransitions(root, DOC);
    expect(transitions.map((t) => [t.sha, t.fromState, t.toState, t.unreadable !== undefined])).toEqual([
      [broken, null, null, true],
      [fixed, null, 'draft', false],
    ]);
  });

  it('strict: throws on the parent read when the unreadable revision was written by a merge the walk does not list', () => {
    // A merge's own revision is never read (`git log --follow` lists no merge), so the only read that
    // meets its broken frontmatter is the next commit's parent read, at `<sha>^1`.
    const root = makeTempGitRepo();
    repos.push(root);
    const doc = (status: string, extra = ''): string => `---\nid: task-1\nstatus: ${status}\n---\n\nBody.\n${extra}`;
    writeFixtureFile(root, DOC, doc('backlog'));
    commitAt(root, '10:00', 'wf(task): add task-1');
    git(root, ['checkout', '--quiet', '-b', 'task/task-1']);
    writeFixtureFile(root, DOC, doc('in-progress'));
    commitAt(root, '11:00', 'wf(task): start task-1 [backlog → in-progress]');
    git(root, ['checkout', '--quiet', 'main']);
    writeFixtureFile(root, DOC, doc('backlog', 'Amended.\n'));
    commitAt(root, '12:00', 'wf(task): amend task-1 [backlog → backlog]');
    git(root, ['merge', '--quiet', '--no-ff', '--no-commit', 'task/task-1']);
    writeFixtureFile(root, DOC, '---\nid: task-1\nstatus: [unclosed\n---\n\nBody.\n');
    commitAt(root, '13:00', "Merge branch 'task/task-1'");
    writeFixtureFile(root, DOC, doc('in-progress', 'Amended.\n'));
    const fixed = commitAt(root, '14:00', 'wf(task): amend task-1 [in-progress → in-progress]');

    expect(reconstructMemoryTransitions(root, DOC).map((t) => t.sha)).not.toContain(git(root, ['rev-parse', `${fixed}^1`]).trim());
    expect(() => reconstructMemoryTransitions(root, DOC, { strict: true })).toThrow(ValidationError);
    // The error names the revision read: the fix's first parent, so the parent read is what threw.
    expect(() => reconstructMemoryTransitions(root, DOC, { strict: true })).toThrow(`${DOC}@${fixed}^1`);
  });
});
