/**
 * P1.13 scenarios 5–9 (task-205, `bug-250` handover) — the user-visible contract of a machine's declared
 * `returns` edge (`memory park`) and per-state `limits` (`dl-110` P1 (a), P3 (a), delivered by task-180),
 * as `docs/02_requirements/02_bdd/features/p1-memory/P1.13-memory-element-schema.feature` words it.
 *
 * Scenario 9 drives the WIP check through the `supersedes:` trigger (`memory-supersede.ts`, which
 * prepares the superseded element with op `supersede`): before this file no test reached that entry
 * path of `requireWipSlot`. The outcome pinned is the one the code gives today — the approve that
 * would fire the trigger is refused at exit 1, before either commit is written.
 *
 * Not here: a `reject` into a full state and holders on other branches. `dl-156` ruled them (Q2 (i)
 * exempt, Q1 (a) count across refs) and they are not implemented yet; their scenarios belong to the
 * task that implements the ruling.
 *
 * Exercises the REAL, registered `CORE_MODULES` operations, each in a throwaway repository.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

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
  card:
    path: "docs/memory/cards/{id}.md"
    states:
      sequence: [draft, in-progress, done]
      limits: { in-progress: 1 }
  adr:
    path: "docs/memory/adrs/{id}.md"
    states:
      sequence: [draft, pending, accepted, superseded]
      gates:
        pending: { reject: draft }
      waiting: [accepted]
      limits: { superseded: 1 }
`;

const DNA_YAML = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

function doc(id: string, type: string, status: string, supersedes?: string): string {
  const extra = supersedes === undefined ? '' : `supersedes: "${supersedes}"\n`;
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "A ${type}"\nstatus: ${status}\n${extra}---\n\n## Body\n\nReal content.\n`;
}

function operation(name: string): CoreFn<unknown, unknown> {
  const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!op) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return op.fn as CoreFn<unknown, unknown>;
}

const run = (name: string, root: string, id: string, options?: Record<string, string>): Promise<CoreResult<unknown>> =>
  operation(name)({ root, positional: id, positionals: [id], ...(options ? { options } : {}) });

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

const status = (repo: string, path: string): string => /^status: (\S+)/m.exec(readFileSync(join(repo, path), 'utf-8'))![1]!;

describe('P1.13 scenarios 5–9 — returns edges, memory park and WIP limits (dl-110, bug-250)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, 'docs/memory/tasks/task-001.md', doc('task-001', 'task', 'in-progress'));
    writeFixtureFile(repo, 'docs/memory/tasks/task-002.md', doc('task-002', 'task', 'in-review'));
    writeFixtureFile(repo, 'docs/memory/cards/card-001.md', doc('card-001', 'card', 'in-progress'));
    writeFixtureFile(repo, 'docs/memory/cards/card-002.md', doc('card-002', 'card', 'draft'));
    writeFixtureFile(repo, 'docs/memory/adrs/adr-0.md', doc('adr-0', 'adr', 'superseded'));
    writeFixtureFile(repo, 'docs/memory/adrs/adr-1.md', doc('adr-1', 'adr', 'accepted'));
    writeFixtureFile(repo, 'docs/memory/adrs/adr-2.md', doc('adr-2', 'adr', 'pending', 'adr-1'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('scenario 5: a declared returns edge is taken by memory park — one commit, its subject and Reason:', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await run('memoryPark', repo, 'task-001', { reason: 'blocked on a review' });
    expect(exitCodeForResult(result)).toBe(0);
    expect(status(repo, 'docs/memory/tasks/task-001.md')).toBe('backlog');
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(task): park task-001 [in-progress → backlog]');
    expect(gitOut(repo, ['log', '-1', '--format=%B']).split('\n')).toContain('Reason: blocked on a review');
  });

  it('scenario 6: Error - park from a state with no returns edge exits 1 with the illegal-transition message, nothing written', async () => {
    const unchanged = snapshotPersistence(repo);
    const result = await run('memoryPark', repo, 'task-002', { reason: 'not now' });
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("illegal transition in-review -> (none) for type 'task'");
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('scenario 7: Error - park without a reason exits 2, nothing written', async () => {
    const unchanged = snapshotPersistence(repo);
    let thrown: unknown;
    try {
      await run('memoryPark', repo, 'task-001');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(exitCodeForThrow(thrown).exitCode).toBe(2);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('scenario 8: Error - a transition into a state at its WIP limit exits 1 and names the holders, nothing written', async () => {
    const unchanged = snapshotPersistence(repo);
    const result = await run('memorySubmit', repo, 'card-002');
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(
      "WIP limit reached for 'in-progress' on type 'card' (limit 1): held by card-001. Move one of them out of 'in-progress', then retry.",
    );
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('scenario 9: Error - the supersedes trigger into a state at its limit refuses the approve before either commit', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);
    const result = await run('memoryApprove', repo, 'adr-2', { reason: 'replaces adr-1' });
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toContain("WIP limit reached for 'superseded' on type 'adr' (limit 1): held by adr-0.");
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(status(repo, 'docs/memory/adrs/adr-2.md')).toBe('pending');
    expect(status(repo, 'docs/memory/adrs/adr-1.md')).toBe('accepted');
    assertPersistenceUnchanged(repo, unchanged);
  });
});
