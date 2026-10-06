/**
 * task-180 (`dl-110` P1 (a)) — `wingfoil memory park <id> --reason <text>`: a started element goes back
 * along its type's declared `returns` edge, as one recorded, reasoned operation (AC1).
 *
 * - The commit is `wf(<type>): park <id> [<from> → <to>]` with a `Reason:` block (`spec-008` §2,
 *   `dl-067`), and no `Approver:` line: a park is a scheduling decision, not an approval.
 * - `status` is the only field written (`spec-010` field-write ownership).
 * - A state with no `returns` edge refuses at exit 1 (`dl-032` contract message); a missing or blank
 *   `--reason` is a usage error at exit 2, before anything is read.
 * - `memory history` reads the commit back as `park` (`task-126`).
 *
 * Exercises the REAL, registered `CORE_MODULES` `memory.memoryPark` operation, in a throwaway repo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/tasks/{id}.md"
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
      waiting: [backlog, approved]
      returns: { in-progress: backlog }
  note:
    path: "docs/memory/notes/{id}.md"
`;

interface ParkValue {
  readonly id: string;
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

function operation<T>(name: string): CoreFn<unknown, T> {
  const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!op) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return op.fn as CoreFn<unknown, T>;
}

const park = (root: string, positional: string | undefined, options?: Record<string, string>) =>
  operation<ParkValue>('memoryPark')({ root, positional, ...(positional === undefined ? {} : { positionals: [positional] }), options });

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

function doc(id: string, type: string, status: string): string {
  return `---
id: "${id}"
type: ${type}
title: "A ${type}"   # REQUIRED
status: ${status}          # auto-set by wingfoil
release: "v0.3"
---

## Body

Real content.
`;
}

describe('CORE_MODULES memory.memoryPark (task-180, dl-110 P1 (a))', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, 'docs/memory/tasks/task-001.md', doc('task-001', 'task', 'in-progress'));
    writeFixtureFile(repo, 'docs/memory/tasks/task-002.md', doc('task-002', 'task', 'in-review'));
    writeFixtureFile(repo, 'docs/memory/notes/note-001.md', doc('note-001', 'note', 'draft'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('is registered as a mutating `memory` operation with a required --reason', () => {
    const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations['memoryPark'];
    expect(op?.mutates).toBe(true);
    expect(op?.options?.find((option) => option.name === 'reason')?.required).toBe(true);
  });

  it('parks an in-progress task: one commit, `[in-progress → backlog]`, a Reason: and no Approver:', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await park(repo, 'task-001', { reason: 'blocked on the dev-loop rewrite' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value).toEqual({
      id: 'task-001',
      path: 'docs/memory/tasks/task-001.md',
      from: 'in-progress',
      to: 'backlog',
      reason: 'blocked on the dev-loop rewrite',
    });

    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).toBe(
      `wf(task): park task-001 [in-progress → backlog]\n\nReason: blocked on the dev-loop rewrite${STAMP_TRAILER}`,
    );
    expect(result.commit?.sha).toBe(gitOut(repo, ['rev-parse', 'HEAD']));
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe('docs/memory/tasks/task-001.md');
    // `status` and nothing else: the inline comment and every other byte survive.
    expect(readFileSync(join(repo, 'docs/memory/tasks/task-001.md'), 'utf-8')).toBe(
      doc('task-001', 'task', 'in-progress').replace('status: in-progress', 'status: backlog'),
    );
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('`memory history` reads the commit back as a `park` with its reason', async () => {
    await park(repo, 'task-001', { reason: 'not now' });
    const history = await operation<{ entries: { operation: string | null; reason: string | null; from: string | null; to: string | null; approver: string | null }[] }>(
      'memoryHistory',
    )({ root: repo, positional: 'task-001', positionals: ['task-001'] });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    const parks = history.value.entries.filter((entry) => entry.operation === 'park');
    expect(parks.map(({ from, to, reason, approver }) => ({ from, to, reason, approver }))).toEqual([
      { from: 'in-progress', to: 'backlog', reason: 'not now', approver: null },
    ]);
  });

  it.each([
    ['task-002', 'in-review', 'task'],
    ['note-001', 'draft', 'note'],
  ])('%s, in %s, has no `returns` edge: exit 1, nothing written', async (id, state, type) => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await park(repo, id, { reason: 'try' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_TRANSITION');
    // The `<to>` is not pinned (task-181, bug-165): the refusal names the state and the type, and why.
    expect(result.error.message).toMatch(new RegExp(`^illegal transition ${state} -> \\S+ for type '${type}'$`));
    expect(JSON.stringify(result.error.details)).toContain('not a `returns` state');
    expect(exitCodeForResult(result)).toBe(1);
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it.each([[undefined], [{}], [{ reason: '' }], [{ reason: '   ' }]])(
    'a missing or blank --reason (%p) is a usage error, exit 2, nothing written',
    async (options) => {
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      let thrown: unknown;
      try {
        await park(repo, 'task-001', options as Record<string, string> | undefined);
      } catch (error) {
        thrown = error;
      }
      expect(exitCodeForThrow(thrown).exitCode).toBe(2);
      expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
      expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
    },
  );

  it('an uncommitted edit of the document is refused, not swept into the park commit (bug-076 guard)', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const path = join(repo, 'docs/memory/tasks/task-001.md');
    const edited = readFileSync(path, 'utf-8') + '\nAn unrelated paragraph.\n';
    writeFileSync(path, edited);
    const result = await park(repo, 'task-001', { reason: 'not now' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(path, 'utf-8')).toBe(edited);
  });

  it('a missing <id> is a usage error, exit 2', async () => {
    let thrown: unknown;
    try {
      await park(repo, undefined, { reason: 'r' });
    } catch (error) {
      thrown = error;
    }
    expect(exitCodeForThrow(thrown)).toEqual({ reason: 'missing required argument: <id>', exitCode: 2 });
  });
});
