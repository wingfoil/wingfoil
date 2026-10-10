/**
 * task-278-take-the-governance-state-rule-s-from-state-from-the-commit-s-parent (`bug-308`), AC2 — the
 * `git log --follow` walk carries, on each entry, the path the document occupied in that commit's
 * FIRST PARENT (`MemoryHistoryEntry.parentPath`), read off the commit's own name-status line: the
 * source of a rename, the same path for a modification, `null` for a creation (`A`, or `C` from the
 * type's template). `reconstructMemoryTransitions` reads `fromState` there, at `<sha>^1`.
 *
 * Throwaway repositories with fixed commit dates.
 */
import { execFileSync } from 'child_process';

import { reconstructMemoryTransitions } from '../../src/memory/audit';
import { attachParentPaths, getMemoryHistory, parseParentPaths, type MemoryHistoryEntry } from '../../src/memory/history';
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

describe('AC2 — the walk carries the path each commit\'s first parent used (parentPath)', () => {
  it('is null for the creation, and the document\'s own path for a modification', () => {
    const root = repo();
    const shas = interleavedHistory(root);
    const parentPaths = new Map(getMemoryHistory(root, DOC).map((entry) => [entry.sha, entry.parentPath]));
    expect(parentPaths.get(shas.add)).toBeNull();
    expect(parentPaths.get(shas.start)).toBe(DOC);
    expect(parentPaths.get(shas.amend)).toBe(DOC);
  });

  it('is the source of a rename, and the status is read there: a rename that also moves the status', () => {
    const root = repo();
    const oldPath = 'docs/04_memory/v1/task-1.md';
    writeFixtureFile(root, oldPath, taskDoc('backlog'));
    const add = commitAt(root, '10:00', 'wf(task): add task-1');
    git(root, ['mv', oldPath, DOC]);
    writeFixtureFile(root, DOC, taskDoc('in-progress'));
    const moved = commitAt(root, '11:00', 'wf(task): start task-1 [backlog → in-progress]');

    const history = getMemoryHistory(root, DOC);
    expect(history.map((entry) => [entry.sha, entry.path, entry.parentPath])).toEqual([
      [add, oldPath, null],
      [moved, DOC, oldPath],
    ]);
    expect(statesBySha(root, DOC).get(moved)).toEqual(['backlog', 'in-progress']);
  });

  it('is null for an element created as a copy of its template: the parent holds the template, not the element', () => {
    const root = repo();
    const template = '.wingfoil/memory/templates/task.md';
    const scaffold = taskDoc('draft', '<!-- A long enough placeholder for git to see the copy of the template. -->');
    writeFixtureFile(root, template, scaffold);
    commitAt(root, '09:00', 'chore: install templates');
    writeFixtureFile(root, DOC, scaffold);
    const add = commitAt(root, '10:00', 'wf(task): add task-1');

    const history = getMemoryHistory(root, DOC);
    expect(history.map((entry) => [entry.sha, entry.parentPath])).toEqual([[add, null]]);
    expect(statesBySha(root, DOC).get(add)).toEqual([null, 'draft']);
  });
});

describe('AC2 — parseParentPaths / attachParentPaths, the pure half (no repository)', () => {
  const sha = (digit: string): string => digit.repeat(40);

  it('reads the parent\'s path off each commit\'s name-status line', () => {
    const stdout = [
      sha('1'), '', 'A\tdocs/a.md',
      sha('2'), '', 'M\tdocs/a.md',
      sha('3'), '', 'R087\tdocs/a.md\tdocs/b.md',
      sha('4'), '', 'C075\t.wingfoil/memory/templates/task.md\tdocs/b.md',
      sha('5'), '', 'D\tdocs/b.md',
      sha('6'), '', 'T\tdocs/b.md',
      '',
    ].join('\n');
    expect([...parseParentPaths(stdout)]).toEqual([
      [sha('1'), null],
      [sha('2'), 'docs/a.md'],
      [sha('3'), 'docs/a.md'],
      [sha('4'), null],
      [sha('5'), 'docs/b.md'],
      [sha('6'), 'docs/b.md'],
    ]);
  });

  it('judges a commit git printed no diff for (a merge) against the path it holds itself, in its first parent', () => {
    const entry = (digit: string): MemoryHistoryEntry => ({
      sha: sha(digit),
      authorName: 'A',
      authorEmail: 'a@e.test',
      date: '2026-01-01T00:00:00+00:00',
      subject: digit,
      body: '',
      path: 'docs/b.md',
    });
    const attached = attachParentPaths([entry('1'), entry('2')], new Map([[sha('1'), null]]));
    expect(attached.map((e) => e.parentPath)).toEqual([null, 'docs/b.md']);
  });
});
