/**
 * task-180 (`dl-110` P3 (a); `spec-001` `limits`) — an optional per-state WIP limit, enforced by the
 * verb that enters the state (AC2). Whichever verb moves an element into a limited state — `submit`,
 * `approve`, `add` for the initial state, the `supersedes:` trigger, or a later workflow `start` emitter
 * — goes through one shared check in the transition primitive, which refuses at exit 1 and names the
 * elements holding the slots, before anything is written.
 *
 * task-274 (`dl-156`, ratified Q1 (a), Q2 (i)):
 * - the holders are counted at the commit the transition is decided at (`HEAD`, `dl-080`) **and** on
 *   every local and remote-tracking branch — the refs `memory add`'s id counter reads (`dl-101`) — a
 *   ref's copy counting only when that ref changed the element's status since its merge-base with the
 *   decided commit (approver ruling 2026-10-11 at the review, option (a)); the refusal says the count
 *   depends on which refs were fetched;
 * - a `reject` along a gate's reject edge and a `park` along a `returns` edge take no slot check: a
 *   reject or returns edge is exempt.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult } from '../../src/core/exit-code';
import { isMoreAdvancedState, prepareMemoryTransition } from '../../src/core/memory-transition';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const MEMORY_YAML = `version: 1
types:
  card:
    path: "docs/memory/cards/{id}.md"
    states:
      sequence: [draft, in-progress, in-review, done]
      gates:
        in-review: { reject: in-progress }
      returns: { in-progress: draft }
      limits: { in-progress: 1 }
  wide:
    path: "docs/memory/wide/{id}.md"
    states:
      sequence: [draft, in-progress, done]
      limits: { in-progress: 2 }
  task:
    path: "docs/memory/tasks/{id}.md"
    states:
      sequence: [draft, backlog, in-progress, done]
      waiting: [backlog]
      returns: { in-progress: backlog }
      limits: { backlog: 1 }
  gated:
    path: "docs/memory/gated/{id}.md"
    states:
      sequence: [draft, pending, active]
      gates:
        pending: { reject: draft }
      limits: { active: 1 }
  slot:
    path: "docs/memory/slots/{id}.md"
    id_pattern: "slot-{n}"
    template:
      file: "memory/templates/slot.md"
      frontmatter:
        required: [title]
    states:
      sequence: [open, closed]
      limits: { open: 1 }
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

const SLOT_TEMPLATE = `---
id: ""
type: slot
title: ""
status: open
---

<!-- slot body -->
`;

function doc(id: string, type: string, status: string): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "A ${type}"\nstatus: ${status}\n---\n\nBody.\n`;
}

function operation<T = unknown>(name: string): CoreFn<unknown, T> {
  const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!op) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return op.fn as CoreFn<unknown, T>;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

/** The sentence every WIP refusal ends with since task-274 (`dl-156` Q1 (a)). */
const REFS_SENTENCE =
  'The holders are counted at HEAD and on every local and remote-tracking branch that changed them since it forked from HEAD, ' +
  'so the count depends on which refs were last fetched; a holder another branch records is moved out on that branch.';

const verb = (name: string, repo: string, id: string, options?: Record<string, string>) =>
  operation(name)({ root: repo, positional: id, positionals: [id], ...(options ? { options } : {}) });

describe('per-state WIP limits (task-180, dl-110 P3 (a))', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/slot.md', SLOT_TEMPLATE);
    writeFixtureFile(repo, 'docs/memory/cards/card-001.md', doc('card-001', 'card', 'in-progress'));
    writeFixtureFile(repo, 'docs/memory/cards/card-002.md', doc('card-002', 'card', 'draft'));
    writeFixtureFile(repo, 'docs/memory/cards/card-003.md', doc('card-003', 'card', 'in-review'));
    writeFixtureFile(repo, 'docs/memory/wide/wide-001.md', doc('wide-001', 'wide', 'in-progress'));
    writeFixtureFile(repo, 'docs/memory/wide/wide-002.md', doc('wide-002', 'wide', 'draft'));
    writeFixtureFile(repo, 'docs/memory/wide/wide-003.md', doc('wide-003', 'wide', 'draft'));
    writeFixtureFile(repo, 'docs/memory/gated/gated-001.md', doc('gated-001', 'gated', 'active'));
    writeFixtureFile(repo, 'docs/memory/gated/gated-002.md', doc('gated-002', 'gated', 'pending'));
    writeFixtureFile(repo, 'docs/memory/tasks/task-001.md', doc('task-001', 'task', 'backlog'));
    writeFixtureFile(repo, 'docs/memory/tasks/task-002.md', doc('task-002', 'task', 'in-progress'));
    writeFixtureFile(repo, 'docs/memory/slots/slot-001.md', doc('slot-001', 'slot', 'open'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  /** The refusal leaves the repository exactly as it was. */
  function expectUnchanged(before: string, path?: string, content?: string): void {
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
    if (path !== undefined) expect(readFileSync(join(repo, path), 'utf-8')).toBe(content);
  }

  it('`submit` into a full state exits 1 and names the holder', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);
    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toBe(
      "WIP limit reached for 'in-progress' on type 'card' (limit 1): held by card-001. " +
        `Move one of them out of 'in-progress', then retry. ${REFS_SENTENCE}`,
    );
    expectUnchanged(before, 'docs/memory/cards/card-002.md', doc('card-002', 'card', 'draft'));
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('`approve` into a full state is refused the same way (characterization: the check stays on approve)', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);
    const result = await verb('memoryApprove', repo, 'gated-002', { reason: 'looks right' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toBe(
      `WIP limit reached for 'active' on type 'gated' (limit 1): held by gated-001. Move one of them out of 'active', then retry. ${REFS_SENTENCE}`,
    );
    expectUnchanged(before, 'docs/memory/gated/gated-002.md', doc('gated-002', 'gated', 'pending'));
    assertPersistenceUnchanged(repo, unchanged);
  });

  // task-274 (dl-156 Q2 (i)): this test pinned a refusal until task-274; its outcome is now the reverse.
  it('`reject` into a full state is not refused: exit 0, one commit, the holders now exceed the limit', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await verb('memoryReject', repo, 'card-003', { reason: 'tests missing' });
    expect(result.ok).toBe(true);
    expect(exitCodeForResult(result)).toBe(0);
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(card): reject card-003 [in-review → in-progress]');
    expect(readFileSync(join(repo, 'docs/memory/cards/card-003.md'), 'utf-8')).toMatch(/^status: in-progress$/m);
    // Two holders of a state limited to one: any other entry is still refused, naming both.
    const next = await verb('memorySubmit', repo, 'card-002');
    expect(next.ok).toBe(false);
    if (next.ok) return;
    expect(next.error.message).toContain('(limit 1): held by card-001, card-003.');
  });

  it('`park` into a full state is not refused: exit 0, one commit', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await verb('memoryPark', repo, 'task-002', { reason: 'not now' });
    expect(result.ok).toBe(true);
    expect(exitCodeForResult(result)).toBe(0);
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(task): park task-002 [in-progress → backlog]');
  });

  it('every holder is named, in path order, when more than the limit already hold the state', async () => {
    writeFixtureFile(repo, 'docs/memory/cards/card-004.md', doc('card-004', 'card', 'in-progress'));
    commitAll(repo, 'a hand-made second holder');
    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('(limit 1): held by card-001, card-004.');
  });

  it('a holder whose frontmatter carries no id is named by its path', async () => {
    writeFixtureFile(repo, 'docs/memory/cards/card-001.md', doc('card-001', 'card', 'in-progress').replace('id: "card-001"\n', ''));
    commitAll(repo, 'a holder without an id');
    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('held by docs/memory/cards/card-001.md.');
  });

  // Review F4: a committed document the scan cannot read might be a holder. It is not counted (the
  // tolerant scan, task-171), so the success says so as a W_MEMORY_UNREADABLE warning naming it.
  const UNREADABLE = '---\nid: [unclosed\n---\n\nBody.\n';

  it('a transition checked against a limit names an unreadable document of the scan as a warning', async () => {
    writeFixtureFile(repo, 'docs/memory/wide/wide-zzz.md', UNREADABLE);
    commitAll(repo, 'an unreadable document');
    const result = await verb('memorySubmit', repo, 'wide-002');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings?.join('\n')).toMatch(/W_MEMORY_UNREADABLE[\s\S]*docs\/memory\/wide\/wide-zzz\.md/);
  });

  it('an unreadable document the id lookup already named is warned about once', async () => {
    writeFixtureFile(repo, 'docs/memory/wide/wide-000.md', UNREADABLE);
    commitAll(repo, 'an unreadable document before the moving one');
    const result = await verb('memorySubmit', repo, 'wide-002');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings?.filter((line) => line.includes('docs/memory/wide/wide-000.md'))).toHaveLength(1);
  });

  it('a refusal carries the unreadable documents in its details, since the count may be short', async () => {
    writeFixtureFile(repo, 'docs/memory/cards/card-zzz.md', UNREADABLE);
    commitAll(repo, 'an unreadable card');
    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(JSON.stringify(result.error.details)).toContain('docs/memory/cards/card-zzz.md');
  });

  it('`memory add` checked against a limit names an unreadable document as a warning too', async () => {
    writeFixtureFile(repo, 'docs/memory/slots/slot-001.md', doc('slot-001', 'slot', 'closed'));
    writeFixtureFile(repo, 'docs/memory/slots/slot-zzz.md', UNREADABLE);
    commitAll(repo, 'slot-001 closed; an unreadable document');
    const result = await operation('memoryAdd')({ root: repo, options: { type: 'slot', title: 'Second slot' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings?.join('\n')).toMatch(/W_MEMORY_UNREADABLE[\s\S]*docs\/memory\/slots\/slot-zzz\.md/);
  });

  it('below the limit the transition goes through', async () => {
    const result = await verb('memorySubmit', repo, 'wide-002');
    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(wide): submit wide-002');
  });

  it('parking the holder frees the slot, after which the next element may enter', async () => {
    const parked = await verb('memoryPark', repo, 'card-001', { reason: 'blocked' });
    expect(parked.ok).toBe(true);
    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(true);
  });

  it('the check lives in the shared transition primitive, not in each verb', () => {
    const prepared = prepareMemoryTransition(repo, 'card-002', 'submit');
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.error.code).toBe('CONFLICT');
    expect(prepared.error.message).toContain('held by card-001');
  });

  it('`memory add` into a full initial state is refused: no commit, no file', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);
    const result = await operation('memoryAdd')({ root: repo, options: { type: 'slot', title: 'Second slot' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toBe(
      `WIP limit reached for 'open' on type 'slot' (limit 1): held by slot-001. Move one of them out of 'open', then retry. ${REFS_SENTENCE}`,
    );
    expectUnchanged(before);
    expect(existsSync(join(repo, 'docs/memory/slots/slot-002.md'))).toBe(false);
    assertPersistenceUnchanged(repo, unchanged);
  });
  // ---- task-274 (dl-156 Q1 (a)): holders are counted across every ref ---------------------------------

  /** The branch the fixture was seeded on. */
  const trunk = (): string => gitOut(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);

  /** A hand commit setting `status` of one document, on the branch checked out. */
  function commitStatus(path: string, id: string, type: string, status: string): void {
    writeFixtureFile(repo, path, doc(id, type, status));
    commitAll(repo, `hand: ${id} ${status}`);
  }

  it('two task branches cut from the same commit cannot both take the last slot', async () => {
    git(repo, ['branch', 'task/a']);
    git(repo, ['branch', 'task/b']);
    git(repo, ['checkout', '--quiet', 'task/a']);
    const first = await verb('memorySubmit', repo, 'wide-002');
    expect(first.ok).toBe(true);

    git(repo, ['checkout', '--quiet', 'task/b']);
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);
    const second = await verb('memorySubmit', repo, 'wide-003');
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('CONFLICT');
    expect(exitCodeForResult(second)).toBe(1);
    expect(second.error.message).toBe(
      `WIP limit reached for 'in-progress' on type 'wide' (limit 2): held by wide-001, wide-002. Move one of them out of 'in-progress', then retry. ${REFS_SENTENCE}`,
    );
    expectUnchanged(before, 'docs/memory/wide/wide-003.md', doc('wide-003', 'wide', 'draft'));
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('a holder only a remote-tracking ref records counts', async () => {
    const main = trunk();
    git(repo, ['checkout', '--quiet', '-b', 'side']);
    commitStatus('docs/memory/wide/wide-002.md', 'wide-002', 'wide', 'in-progress');
    git(repo, ['update-ref', 'refs/remotes/origin/side', 'HEAD']);
    git(repo, ['checkout', '--quiet', main]);
    git(repo, ['branch', '--quiet', '-D', 'side']);

    const result = await verb('memorySubmit', repo, 'wide-003');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("(limit 2): held by wide-001, wide-002. Move one of them out of 'in-progress'");
  });

  it('a branch that changed a holder since the fork counts with its copy: one it finished frees its slot', async () => {
    const main = trunk();
    git(repo, ['checkout', '--quiet', '-b', 'task/card-001']);
    commitStatus('docs/memory/cards/card-001.md', 'card-001', 'card', 'done');
    git(repo, ['checkout', '--quiet', main]);

    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(card): submit card-002');
  });

  // Review F1 (approver ruling 2026-10-11, option (a)): a ref's copy counts only when that ref changed
  // the element since its merge-base with the decided commit; otherwise the decided commit's copy wins.
  it('a stale branch does not keep a parked holder counted: park on the trunk, then submit succeeds', async () => {
    git(repo, ['branch', 'stale-feature']);
    const parked = await verb('memoryPark', repo, 'card-001', { reason: 'blocked' });
    expect(parked.ok).toBe(true);
    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(card): submit card-002');
  });

  it('after a reject on the task branch, the trunk\'s older in-review copy does not hide the holder', async () => {
    git(repo, ['checkout', '--quiet', '-b', 'task/card-003']);
    expect((await verb('memoryReject', repo, 'card-003', { reason: 'tests missing' })).ok).toBe(true);
    expect((await verb('memoryPark', repo, 'card-001', { reason: 'make room' })).ok).toBe(true);
    // On this branch card-003 is in-progress (its reject) and card-001 draft (its park); the trunk still
    // records card-003 in-review and card-001 in-progress, both unchanged since the fork, so neither counts.
    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("(limit 1): held by card-003. Move one of them out of 'in-progress'");
  });

  it('when several refs changed an element, the most advanced of their changed copies wins over the decided one', async () => {
    const main = trunk();
    git(repo, ['branch', 'task/x']);
    commitStatus('docs/memory/wide/wide-003.md', 'wide-003', 'wide', 'done');
    git(repo, ['checkout', '--quiet', '-b', 'task/y', 'task/x']);
    commitStatus('docs/memory/wide/wide-003.md', 'wide-003', 'wide', 'in-progress');
    git(repo, ['checkout', '--quiet', 'task/x']);
    commitStatus('docs/memory/wide/wide-002.md', 'wide-002', 'wide', 'in-progress');
    // At task/x: wide-001 and wide-002 in-progress, wide-003 draft. task/y changed wide-003 to
    // in-progress and the trunk changed it to done: the most advanced changed copy, done, wins.
    git(repo, ['checkout', '--quiet', main]);
    git(repo, ['checkout', '--quiet', 'task/x']);
    writeFixtureFile(repo, 'docs/memory/wide/wide-005.md', doc('wide-005', 'wide', 'draft'));
    commitAll(repo, 'wide-005 draft');
    const result = await verb('memorySubmit', repo, 'wide-005');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('(limit 2): held by wide-001, wide-002.');
  });

  it('an element two refs record in the same state is one holder, not two (characterization)', async () => {
    const main = trunk();
    git(repo, ['checkout', '--quiet', '-b', 'other']);
    writeFixtureFile(repo, 'notes.txt', 'unrelated\n');
    commitAll(repo, 'an unrelated commit: other differs from the trunk, wide-001 is in-progress on both');
    git(repo, ['checkout', '--quiet', main]);

    const result = await verb('memorySubmit', repo, 'wide-002');
    expect(result.ok).toBe(true);
  });

  it('`memory add` counts a holder of the initial state another branch records', async () => {
    const main = trunk();
    commitStatus('docs/memory/slots/slot-001.md', 'slot-001', 'slot', 'closed');
    git(repo, ['checkout', '--quiet', '-b', 'task/slot']);
    writeFixtureFile(repo, 'docs/memory/slots/slot-002.md', doc('slot-002', 'slot', 'open'));
    commitAll(repo, 'slot-002 open, on a branch only');
    git(repo, ['checkout', '--quiet', main]);

    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await operation('memoryAdd')({ root: repo, options: { type: 'slot', title: 'Third slot' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toBe(
      `WIP limit reached for 'open' on type 'slot' (limit 1): held by slot-002. Move one of them out of 'open', then retry. ${REFS_SENTENCE}`,
    );
    expectUnchanged(before);
  });
});

describe('isMoreAdvancedState — the state an element counts in when refs disagree (task-274, dl-156 Q1 (a))', () => {
  const machine = { sequence: ['draft', 'pending', 'active'], gates: { pending: { reject: 'declined' } } };

  it('a later sequence state is more advanced than an earlier one, never the reverse', () => {
    expect(isMoreAdvancedState(machine, 'active', 'pending')).toBe(true);
    expect(isMoreAdvancedState(machine, 'pending', 'active')).toBe(false);
  });

  it('a state off the sequence ranks after every sequence state, and deprecated after all of them', () => {
    expect(isMoreAdvancedState(machine, 'declined', 'active')).toBe(true);
    expect(isMoreAdvancedState(machine, 'deprecated', 'declined')).toBe(true);
    expect(isMoreAdvancedState(machine, 'declined', 'deprecated')).toBe(false);
  });

  it('equal ranks are ordered by name, so the answer does not depend on the order the refs were read in', () => {
    expect(isMoreAdvancedState(machine, 'zz-unknown', 'declined')).toBe(true);
    expect(isMoreAdvancedState(machine, 'declined', 'zz-unknown')).toBe(false);
    expect(isMoreAdvancedState(machine, 'active', 'active')).toBe(false);
  });
});

describe('one listing of every ref (task-274): the id counter and the WIP count read the same refs', () => {
  it('`for-each-ref` is run in exactly one place in src/, the shared `refBaselineCommits`', () => {
    const hits = execFileSync('git', ['grep', '-l', "'for-each-ref'", '--', 'src/'], { encoding: 'utf-8', cwd: join(__dirname, '../..') })
      .trim()
      .split('\n');
    expect(hits).toEqual(['src/memory/add.ts']);
    const source = readFileSync(join(__dirname, '../../src/memory/add.ts'), 'utf-8');
    expect(source.match(/'for-each-ref'/g)).toHaveLength(1);
    expect(readFileSync(join(__dirname, '../../src/core/memory-transition.ts'), 'utf-8')).toContain('refBaselineCommits(root)');
    expect(source).toMatch(/listPathsAtRevs\(root, refBaselineCommits\(root\), prefix\)/);
  });
});

describe('the across-refs count, edge cases (task-274)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, 'docs/memory/wide/wide-001.md', doc('wide-001', 'wide', 'in-progress'));
    writeFixtureFile(repo, 'docs/memory/wide/wide-002.md', doc('wide-002', 'wide', 'draft'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('an unreadable document two refs hold is warned about once', async () => {
    writeFixtureFile(repo, 'docs/memory/wide/wide-zzz.md', '---\nid: [unclosed\n---\n\nBody.\n');
    commitAll(repo, 'an unreadable document');
    const trunk = gitOut(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    git(repo, ['checkout', '--quiet', '-b', 'other']);
    writeFixtureFile(repo, 'notes.txt', 'unrelated\n');
    commitAll(repo, 'other differs from the trunk; the unreadable file is on both');
    git(repo, ['checkout', '--quiet', trunk]);

    const result = await verb('memorySubmit', repo, 'wide-002');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings?.filter((line) => line.includes('docs/memory/wide/wide-zzz.md'))).toHaveLength(1);
  });

  it('a symbolic link and a newer-format document in the type\'s directory are warned about, not counted', async () => {
    symlinkSync('wide-001.md', join(repo, 'docs/memory/wide/wide-link.md'));
    writeFixtureFile(repo, 'docs/memory/wide/wide-new.md', doc('wide-new', 'wide', 'in-progress').replace('---\n', '---\nformat: 99\n'));
    commitAll(repo, 'a link and a newer-format document');
    const result = await verb('memorySubmit', repo, 'wide-002');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const warnings = result.warnings?.join('\n') ?? '';
    expect(warnings).toMatch(/W_MEMORY_UNREADABLE[\s\S]*docs\/memory\/wide\/wide-link\.md/);
    expect(warnings).toMatch(/W_MEMORY_UNREADABLE[\s\S]*docs\/memory\/wide\/wide-new\.md/);
  });

  it('a copy with no status on another ref neither holds the state nor hides the holder', async () => {
    const trunk = gitOut(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    git(repo, ['checkout', '--quiet', '-b', 'other']);
    writeFixtureFile(repo, 'docs/memory/wide/wide-001.md', doc('wide-001', 'wide', 'in-progress').replace(/^status: .*\n/m, ''));
    writeFixtureFile(repo, 'docs/memory/wide/wide-003.md', doc('wide-003', 'wide', 'in-progress'));
    commitAll(repo, 'wide-001 without a status, wide-003 in-progress, on other only');
    git(repo, ['checkout', '--quiet', trunk]);

    const result = await verb('memorySubmit', repo, 'wide-002');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('(limit 2): held by wide-001, wide-003.');
  });
});
