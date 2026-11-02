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

/**
 * task-313 AC 3 (`bug-262`; approver design gate 2026-10-30, D4 (a)) — a past revision written in a newer `format`
 * than this WingFoil reads is unreadable, as one whose frontmatter does not parse: tolerant, its transition has no
 * `toState` and an `unreadable` naming `E_INVALID_FORMAT` (the current-document scan's wording), and the next one no
 * `fromState`; strict, the read throws. Only a newer integer format is checked (spec-001), so `format: 1`, an absent
 * `format` and `format: 1.5` read the status as before.
 */
describe('a past revision written in a newer format (task-313 AC 3, bug-262)', () => {
  const NEWER = 'E_INVALID_FORMAT: this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil';

  /** add (format 1, draft) → submit (`middleFormat`, pending) → reject (format 1, draft). */
  function threeRevisions(middleFormat: string | null): { root: string; shas: string[] } {
    const root = makeTempGitRepo();
    repos.push(root);
    const doc = (status: string, format: string | null): string =>
      ['---', 'id: task-1', 'type: task', `status: ${status}`, ...(format === null ? [] : [`format: ${format}`]), '---', '', 'Body.', ''].join('\n');
    writeFixtureFile(root, DOC, doc('draft', '1'));
    const add = commitAt(root, '10:00', 'wf(task): add task-1');
    writeFixtureFile(root, DOC, doc('pending', middleFormat));
    const submit = commitAt(root, '11:00', 'wf(task): submit task-1');
    writeFixtureFile(root, DOC, doc('draft', '1'));
    const reject = commitAt(root, '12:00', 'wf(task): reject task-1 [pending → draft]');
    return { root, shas: [add, submit, reject] };
  }

  it('red-first: tolerant — the format-2 revision reads no status and carries the E_INVALID_FORMAT reason; the next reads fromState null', () => {
    const { root, shas } = threeRevisions('2');
    const transitions = reconstructMemoryTransitions(root, DOC);
    expect(transitions.map((t) => [t.sha, t.fromState, t.toState, t.unreadable ?? null])).toEqual([
      [shas[0], null, 'draft', null],
      [shas[1], 'draft', null, NEWER],
      [shas[2], null, 'draft', null],
    ]);
    expect('unreadable' in transitions[2]!).toBe(false);
  });

  it('red-first: strict — the read throws a ValidationError whose first issue is E_INVALID_FORMAT', () => {
    const { root } = threeRevisions('2');
    let thrown: unknown;
    try {
      reconstructMemoryTransitions(root, DOC, { strict: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).issues[0]?.code).toBe('E_INVALID_FORMAT');
  });

  it.each([
    ['format: 1', '1'],
    ['an absent format', null],
    ['format: 1.5 (read loosely, spec-001)', '1.5'],
  ])('characterization: %s reads the status as before, tolerant and strict', (_label, format) => {
    const { root, shas } = threeRevisions(format);
    const expected = [
      [shas[0], null, 'draft', null],
      [shas[1], 'draft', 'pending', null],
      [shas[2], 'pending', 'draft', null],
    ];
    expect(reconstructMemoryTransitions(root, DOC).map((t) => [t.sha, t.fromState, t.toState, t.unreadable ?? null])).toEqual(expected);
    expect(reconstructMemoryTransitions(root, DOC, { strict: true }).map((t) => [t.sha, t.fromState, t.toState, t.unreadable ?? null])).toEqual(expected);
  });
});
