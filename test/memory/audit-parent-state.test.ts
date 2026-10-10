/**
 * task-278-take-the-governance-state-rule-s-from-state-from-the-commit-s-parent (`bug-308`) — a
 * transition's `fromState` is the document's `status` in the commit's FIRST PARENT, read at the path
 * that parent used, not the `toState` of the previous entry of the `git log --follow` walk.
 *
 * The walk is ordered by commit date, not by ancestry: an `amend` on `main` made while the same task
 * is started on its branch is walked AFTER the branch's `start`, although its parent is the `main`
 * commit before both. Taking `fromState` from the previous entry derived `in-progress -> backlog` for
 * an amend whose parent and own revision both hold `status: backlog` (`bug-308` Steps to Reproduce).
 *
 * Throwaway repositories with fixed commit dates, so the walk's order is the one the bug describes on
 * every machine.
 */
import { execFileSync } from 'child_process';

import { reconstructMemoryTransitions } from '../../src/memory/audit';
import { getMemoryHistory } from '../../src/memory/history';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DOC = 'docs/04_memory/v0.1/task-1.md';

function taskDoc(status: string, extra = ''): string {
  return ['---', 'id: task-1', 'type: task', `status: ${status}`, '---', '', 'Body.', ...(extra ? [extra] : []), ''].join('\n');
}

/** The environment of a commit made at `hh:mm` on a fixed day, so `git log`'s date order is fixed. */
function at(time: string): NodeJS.ProcessEnv {
  const date = `2026-01-01T${time}:00Z`;
  return { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
}

function commitAt(repo: string, time: string, message: string): string {
  git(repo, ['add', '-A']);
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: repo, encoding: 'utf-8', env: at(time) });
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

function mergeAt(repo: string, time: string, branch: string): string {
  execFileSync('git', ['merge', '--quiet', '--no-ff', '-m', `Merge branch '${branch}'`, branch], { cwd: repo, encoding: 'utf-8', env: at(time) });
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

/** `bug-308`'s Steps to Reproduce 2–4: add on `main`; start on `task/task-1`; amend on `main`; merge. */
function interleavedHistory(repo: string): { add: string; start: string; amend: string; merge: string } {
  writeFixtureFile(repo, DOC, taskDoc('backlog'));
  const add = commitAt(repo, '10:00', 'wf(task): add task-1');
  git(repo, ['checkout', '--quiet', '-b', 'task/task-1']);
  writeFixtureFile(repo, DOC, taskDoc('in-progress'));
  const start = commitAt(repo, '11:00', 'wf(task): start task-1 [backlog → in-progress]');
  git(repo, ['checkout', '--quiet', 'main']);
  writeFixtureFile(repo, DOC, taskDoc('backlog', 'An amended line.'));
  const amend = commitAt(repo, '12:00', 'wf(task): amend task-1 [backlog → backlog]');
  const merge = mergeAt(repo, '13:00', 'task/task-1');
  return { add, start, amend, merge };
}

const repos: string[] = [];
afterAll(() => repos.forEach(removeTempDir));
function repo(): string {
  const dir = makeTempGitRepo();
  repos.push(dir);
  return dir;
}

function statesBySha(root: string, path: string): Map<string, [string | null, string | null]> {
  return new Map(reconstructMemoryTransitions(root, path).map((t) => [t.sha, [t.fromState, t.toState]]));
}

describe('AC1 — an amend on main while the task is started on its branch (bug-308)', () => {
  const root = repo();
  const shas = interleavedHistory(root);

  it('reproduces the shape: the walk lists the amend after the start, so its order says nothing about ancestry', () => {
    // Precondition of the fixture, not the fix: this is the order that made the previous entry wrong.
    expect(getMemoryHistory(root, DOC).map((entry) => entry.sha)).toEqual([shas.add, shas.start, shas.amend]);
    expect(git(root, ['rev-parse', `${shas.amend}^1`]).trim()).toBe(shas.add);
  });

  it('derives the amend as backlog -> backlog: its parent and its own revision both hold backlog', () => {
    expect(statesBySha(root, DOC).get(shas.amend)).toEqual(['backlog', 'backlog']);
  });

  it('derives the start as backlog -> in-progress, and the add as a creation (null -> backlog)', () => {
    const states = statesBySha(root, DOC);
    expect(states.get(shas.start)).toEqual(['backlog', 'in-progress']);
    expect(states.get(shas.add)).toEqual([null, 'backlog']);
  });

  it('reads strictly the same way (the reading the governance check and the consistency check use)', () => {
    const strict = reconstructMemoryTransitions(root, DOC, { strict: true }).map((t) => [t.sha, t.fromState, t.toState]);
    expect(strict).toEqual([
      [shas.add, null, 'backlog'],
      [shas.start, 'backlog', 'in-progress'],
      [shas.amend, 'backlog', 'backlog'],
    ]);
  });
});

describe('AC1 — a commit after the merge is judged against the merge, its first parent', () => {
  const root = repo();
  const shas = interleavedHistory(root);
  // The merge brought `in-progress` onto main; this commit moves it back to backlog against that parent.
  writeFixtureFile(root, DOC, taskDoc('backlog', 'An amended line.'));
  const after = commitAt(root, '14:00', 'wf(task): amend task-1 [backlog → backlog]');

  it('derives in-progress -> backlog, which the previous walk entry (the 12:00 amend, backlog) hid', () => {
    expect(git(root, ['rev-parse', `${after}^1`]).trim()).toBe(shas.merge);
    expect(statesBySha(root, DOC).get(after)).toEqual(['in-progress', 'backlog']);
  });
});
