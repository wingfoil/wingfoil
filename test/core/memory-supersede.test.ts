/**
 * task-162 — the `supersedes:` engine trigger (`dl-065` Q1.1, `spec-001` § `StateMachine`, `spec-010`
 * § Field-write ownership, `spec-008` §2's `finalize` row). Approving an element whose committed
 * `supersedes:` names another element of its type moves that element along its `waiting` edge into
 * `superseded`, in a commit of its own: `wf({type}): finalize {A} [{t} → superseded]`, whose `Reason:`
 * cites the approve commit. Every refusal of either half runs before the first write (exit `1`).
 *
 * Exercises the REAL, registered `memory.memoryApprove` `CoreFn` in a THROWAWAY temp git repo whose
 * `adr` and `tech-spec` types carry the real machines from `.wingfoil/memory.yaml`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult } from '../../src/core/exit-code';
import { verifyTransitionConsistency } from '../../src/memory/audit';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1
types:
  adr:
    path: "docs/adrs/{id}.md"
    states:
      sequence: [draft, pending, accepted, superseded]
      gates:
        pending: { reject: draft }
      waiting: [accepted]
  tech-spec:
    path: "docs/specs/{id}.md"
    states:
      sequence: [draft, pending, approved, superseded]
      gates:
        pending: { reject: draft }
      waiting: [approved]
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [draft, pending, backlog, done]
      gates:
        pending: { reject: draft }
      waiting: [backlog]
`;

const TEST_EMAIL = 'wf-test@example.invalid';
const TEST_NAME = 'WingFoil Test';

const APPROVER_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${TEST_NAME}
      email: ${TEST_EMAIL}
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

interface ApproveValue {
  readonly id: string;
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly superseded?: { readonly id: string; readonly path: string; readonly from: string; readonly to: string };
}

interface HistoryEntry {
  readonly operation: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly approver: string | null;
  readonly reason: string | null;
}

function operation<T>(name: string): CoreFn<unknown, T> {
  const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!op) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return op.fn as CoreFn<unknown, T>;
}
const approve = operation<ApproveValue>('memoryApprove');
const history = operation<{ entries: HistoryEntry[] }>('memoryHistory');

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

function doc(fields: { id: string; type: string; status: string; supersedes?: string }): string {
  const supersedes = fields.supersedes === undefined ? '' : `supersedes: ${fields.supersedes}\n`;
  return `---
id: "${fields.id}"
type: ${fields.type}
title: "${fields.id}"
status: ${fields.status}          # auto-set by wingfoil
${supersedes}tmpl_version: 260703
---

## Body

Real content.
`;
}

const ADR_A = 'docs/adrs/adr-1-old.md';
const ADR_B = 'docs/adrs/adr-2-new.md';

describe('memory approve — the `supersedes:` trigger (task-162, dl-065 Q1.1)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, ADR_A, doc({ id: 'adr-1-old', type: 'adr', status: 'accepted', supersedes: '""' }));
    writeFixtureFile(repo, ADR_B, doc({ id: 'adr-2-new', type: 'adr', status: 'pending', supersedes: '"adr-1-old"' }));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  /** Seed `B` again with another `supersedes:` value, committed. */
  function reseedB(supersedes: string): void {
    writeFixtureFile(repo, ADR_B, doc({ id: 'adr-2-new', type: 'adr', status: 'pending', supersedes }));
    commitAll(repo, 'reseed adr-2');
  }

  it('AC1: approving adr-B moves adr-A accepted → superseded — one approve commit, then one finalize commit citing it', async () => {
    const before = head(repo);
    const result = await approve({ root: repo, positional: 'adr-2-new', options: { reason: 'replaces adr-1' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value).toEqual({
      id: 'adr-2-new',
      path: ADR_B,
      from: 'pending',
      to: 'accepted',
      superseded: { id: 'adr-1-old', path: ADR_A, from: 'accepted', to: 'superseded' },
    });

    // Two commits, each scoped to its own document, oldest first.
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('2');
    const approveSha = gitOut(repo, ['rev-parse', 'HEAD~1']);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD~1'])).toBe(ADR_B);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ADR_A);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');

    expect(gitOut(repo, ['log', '-1', '--format=%B', 'HEAD~1'])).toBe(
      `wf(adr): approve adr-2-new [pending → accepted]\n\nApprover: ${TEST_NAME} <${TEST_EMAIL}> (approver)\nReason: replaces adr-1`,
    );
    const finalize = gitOut(repo, ['log', '-1', '--format=%B', 'HEAD']);
    expect(finalize).toBe(
      `wf(adr): finalize adr-1-old [accepted → superseded]\n\nReason: superseded by adr-2-new (its supersedes: field), approved in ${approveSha}.`,
    );
    // The finalize commit is derived: no `Approver:` line of its own (dl-061 B.1's reasoning).
    expect(finalize).not.toMatch(/^Approver:/m);
    expect(result.commit).toEqual({ sha: approveSha, message: gitOut(repo, ['log', '-1', '--format=%B', 'HEAD~1']) });

    // Only `status` moved on each document.
    expect(readFileSync(join(repo, ADR_A), 'utf-8')).toBe(doc({ id: 'adr-1-old', type: 'adr', status: 'superseded', supersedes: '""' }));
    expect(readFileSync(join(repo, ADR_B), 'utf-8')).toBe(
      doc({ id: 'adr-2-new', type: 'adr', status: 'accepted', supersedes: '"adr-1-old"' }),
    );
  });

  it('AC1: `memory history` reads the finalize entry, and the consistency check finds nothing on either document', async () => {
    const result = await approve({ root: repo, positional: 'adr-2-new', options: { reason: 'replaces adr-1' } });
    expect(result.ok).toBe(true);
    const approveSha = gitOut(repo, ['rev-parse', 'HEAD~1']);

    const read = await history({ root: repo, positional: 'adr-1-old' });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const last = read.value.entries[read.value.entries.length - 1];
    expect(last).toMatchObject({
      operation: 'finalize',
      from: 'accepted',
      to: 'superseded',
      approver: null,
      reason: `superseded by adr-2-new (its supersedes: field), approved in ${approveSha}.`,
    });

    expect(verifyTransitionConsistency(repo, ADR_A)).toEqual([]);
    expect(verifyTransitionConsistency(repo, ADR_B)).toEqual([]);
  });

  it('AC1: a tech-spec supersedes along its own waiting edge, approved → superseded', async () => {
    writeFixtureFile(repo, 'docs/specs/spec-1-old.md', doc({ id: 'spec-1-old', type: 'tech-spec', status: 'approved' }));
    writeFixtureFile(
      repo,
      'docs/specs/spec-2-new.md',
      doc({ id: 'spec-2-new', type: 'tech-spec', status: 'pending', supersedes: 'spec-1-old' }),
    );
    commitAll(repo, 'seed specs');
    const result = await approve({ root: repo, positional: 'spec-2-new', options: { reason: 'ok' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.superseded).toEqual({ id: 'spec-1-old', path: 'docs/specs/spec-1-old.md', from: 'approved', to: 'superseded' });
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(tech-spec): finalize spec-1-old [approved → superseded]');
  });

  describe('AC2: a supersedes: that cannot fire is refused before any write, exit 1', () => {
    async function expectRefused(pattern: RegExp, code?: string): Promise<void> {
      const before = head(repo);
      const a = readFileSync(join(repo, ADR_A), 'utf-8');
      const b = readFileSync(join(repo, ADR_B), 'utf-8');
      const result = await approve({ root: repo, positional: 'adr-2-new', options: { reason: 'ok' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toMatch(/^cannot approve adr-2-new: its supersedes: field names /);
      expect(result.error.message).toMatch(pattern);
      if (code !== undefined) expect(result.error.code).toBe(code);
      expect(head(repo)).toBe(before);
      expect(readFileSync(join(repo, ADR_A), 'utf-8')).toBe(a);
      expect(readFileSync(join(repo, ADR_B), 'utf-8')).toBe(b);
    }

    it('a missing id', async () => {
      reseedB('"adr-9-nowhere"');
      await expectRefused(/adr-9-nowhere.*document not found: adr-9-nowhere/, 'NOT_FOUND');
    });

    it('an element of another type', async () => {
      writeFixtureFile(repo, 'docs/specs/spec-1-old.md', doc({ id: 'spec-1-old', type: 'tech-spec', status: 'approved' }));
      commitAll(repo, 'seed spec');
      reseedB('"spec-1-old"');
      await expectRefused(/spec-1-old, which is a 'tech-spec', not an 'adr'/, 'VALIDATION');
    });

    it.each(['draft', 'pending', 'superseded', 'deprecated'])('an element in %s, not accepted', async (status) => {
      writeFixtureFile(repo, ADR_A, doc({ id: 'adr-1-old', type: 'adr', status, supersedes: '""' }));
      commitAll(repo, `adr-1 ${status}`);
      await expectRefused(new RegExp(`illegal transition ${status} -> superseded for type 'adr'`), 'INVALID_TRANSITION');
    });

    it('itself', async () => {
      reseedB('"adr-2-new"');
      await expectRefused(/illegal transition pending -> superseded for type 'adr'/, 'INVALID_TRANSITION');
    });

    it('a value that is not a single id', async () => {
      reseedB('[ "adr-1-old" ]');
      await expectRefused(/must be a single element id/, 'VALIDATION');
    });

    it('an element with an uncommitted edit (it could not be committed as a status change)', async () => {
      writeFileSync(join(repo, ADR_A), `${readFileSync(join(repo, ADR_A), 'utf-8')}\nan uncommitted paragraph\n`);
      await expectRefused(/refusing to commit/);
    });

    it('an element deleted in the working tree', async () => {
      rmSync(join(repo, ADR_A));
      await expectRefused(/held by HEAD but deleted in the working tree/, 'VALIDATION');
    });

    it('an element the commit does not hold (only the working tree has it)', async () => {
      rmSync(join(repo, ADR_A));
      commitAll(repo, 'drop adr-1');
      writeFixtureFile(repo, ADR_A, doc({ id: 'adr-1-old', type: 'adr', status: 'accepted', supersedes: '""' }));
      await expectRefused(/document not found: adr-1-old/, 'NOT_FOUND');
    });
  });

  describe('AC2b (characterization): the trigger does not widen', () => {
    it('an empty supersedes: approves with one commit, as before', async () => {
      reseedB('""');
      const before = head(repo);
      const result = await approve({ root: repo, positional: 'adr-2-new', options: { reason: 'ok' } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.superseded).toBeUndefined();
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
      expect(readFileSync(join(repo, ADR_A), 'utf-8')).toMatch(/^status: accepted/m);
    });

    it('an absent supersedes: approves with one commit, as before', async () => {
      writeFixtureFile(repo, ADR_B, doc({ id: 'adr-2-new', type: 'adr', status: 'pending' }));
      commitAll(repo, 'no supersedes');
      const before = head(repo);
      const result = await approve({ root: repo, positional: 'adr-2-new', options: { reason: 'ok' } });
      expect(result.ok).toBe(true);
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    });

    it('a type with no superseded edge does not read supersedes:', async () => {
      writeFixtureFile(repo, 'docs/tasks/task-1.md', doc({ id: 'task-1', type: 'task', status: 'backlog' }));
      writeFixtureFile(repo, 'docs/tasks/task-2.md', doc({ id: 'task-2', type: 'task', status: 'pending', supersedes: 'task-1' }));
      commitAll(repo, 'tasks');
      const before = head(repo);
      const result = await approve({ root: repo, positional: 'task-2', options: { reason: 'ok' } });
      expect(result.ok).toBe(true);
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
      expect(readFileSync(join(repo, 'docs/tasks/task-1.md'), 'utf-8')).toMatch(/^status: backlog/m);
    });
  });

  it('decides from HEAD: an uncommitted supersedes: on B is neither read nor committed', async () => {
    reseedB('""');
    // The working tree names adr-1 but HEAD does not: approve refuses the edit as it always has, and
    // never fires the trigger from the working tree's value.
    writeFixtureFile(repo, ADR_B, doc({ id: 'adr-2-new', type: 'adr', status: 'pending', supersedes: '"adr-1-old"' }));
    const before = head(repo);
    const result = await approve({ root: repo, positional: 'adr-2-new', options: { reason: 'ok' } });
    expect(result.ok).toBe(false);
    expect(head(repo)).toBe(before);
    expect(readFileSync(join(repo, ADR_A), 'utf-8')).toMatch(/^status: accepted/m);
  });
});
