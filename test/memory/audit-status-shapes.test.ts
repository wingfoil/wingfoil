/**
 * task-280 (`bug-343`) — the frontmatter shapes `parseStatus` reads as "no state" without a parse error:
 * a block that parses to something other than a mapping (P1, `parseStatus`'s non-mapping `if` in
 * `src/memory/audit.ts`), and a mapping or sequence whose `status` is not a string (P2, `parseStatus`'s `: null`
 * arm for a non-string `status`). Both are a revision that WAS read: the transition carries no `unreadable`
 * key, and strict mode does not throw (it refuses only a parse error, `ReconstructOptions.strict`).
 * Characterization: pins existing behaviour.
 */
import { execFileSync } from 'child_process';

import { reconstructMemoryTransitions } from '../../src/memory/audit';
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

/** A first revision with the shape under test, then a readable `status: draft`. */
function shapeThenDraft(firstRevision: string): { root: string; first: string; second: string } {
  const root = makeTempGitRepo();
  repos.push(root);
  writeFixtureFile(root, DOC, firstRevision);
  const first = commitAt(root, '10:00', 'wf(task): add task-1');
  writeFixtureFile(root, DOC, '---\nid: task-1\nstatus: draft\n---\n\nBody.\n');
  const second = commitAt(root, '11:00', 'wf(task): submit task-1');
  return { root, first, second };
}

function expectNoStateThenDraft(firstRevision: string): void {
  const { root, first, second } = shapeThenDraft(firstRevision);

  const transitions = reconstructMemoryTransitions(root, DOC);
  expect(transitions.map((t) => [t.sha, t.fromState, t.toState, 'unreadable' in t])).toEqual([
    [first, null, null, false],
    [second, null, 'draft', false],
  ]);

  const strict = reconstructMemoryTransitions(root, DOC, { strict: true });
  expect(strict.map((t) => [t.sha, t.fromState, t.toState])).toEqual([
    [first, null, null],
    [second, null, 'draft'],
  ]);
}

describe('P1 (parseStatus, the non-mapping `if`) — a frontmatter that parses to something other than a mapping', () => {
  it.each([
    ['a scalar', '---\njust text\n---\n\nBody.\n'],
    ['YAML null', '---\n~\n---\n\nBody.\n'],
    ['a comment-only block', '---\n# nothing\n---\n\nBody.\n'],
  ])('%s reads as no state, not as unreadable, tolerant and strict', (_shape, firstRevision) => {
    expectNoStateThenDraft(firstRevision);
  });
});

describe('P2 (parseStatus, the `: null` arm for a non-string status) — a `status` that is not a string', () => {
  it.each([
    ['a number', '---\nid: task-1\nstatus: 3\n---\n\nBody.\n'],
    ['a sequence', '---\nid: task-1\nstatus: [draft]\n---\n\nBody.\n'],
    ['absent from the mapping', '---\nid: task-1\n---\n\nBody.\n'],
    ['read from a top-level sequence', '---\n- id: task-1\n---\n\nBody.\n'],
  ])('%s reads as no state, not as unreadable, tolerant and strict', (_shape, firstRevision) => {
    expectNoStateThenDraft(firstRevision);
  });
});
