/**
 * task-278 (`bug-308`) — the parent read follows the same unreadable-revision rule as the commit's own
 * (task-171, `bug-188`): tolerant, the transition's `fromState` is `null`; strict, the parse error is
 * thrown, whichever of the two reads met it first.
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

/** A revision whose frontmatter does not parse, then its fix — committed with `fixTime` as the fix's date. */
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

  it('strict: throws even when the walk reaches the child first (its parent read is the unreadable one)', () => {
    // The fix is dated BEFORE the broken commit, so the date-ordered walk lists it first.
    const { root } = brokenThenFixed('09:00');
    expect(() => reconstructMemoryTransitions(root, DOC, { strict: true })).toThrow(ValidationError);
  });
});
