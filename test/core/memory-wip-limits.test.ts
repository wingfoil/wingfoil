/**
 * task-180 (`dl-110` P3 (a); `spec-001` `limits`) — an optional per-state WIP limit, enforced by the
 * verb that enters the state (AC2). Whichever verb moves an element into a limited state — `submit`,
 * `reject`, `park`, `add` for the initial state, or a later workflow `start` emitter — goes through one
 * shared check in the transition primitive, which refuses at exit 1 and names the elements holding the
 * slots, before anything is written.
 *
 * The holders are counted in the commit the transition is decided at (`HEAD`, `dl-080`), by the
 * documents' own `type` and `status`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult } from '../../src/core/exit-code';
import { prepareMemoryTransition } from '../../src/core/memory-transition';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

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
    const result = await verb('memorySubmit', repo, 'card-002');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toBe(
      "WIP limit reached for 'in-progress' on type 'card' (limit 1): held by card-001. " +
        "Move one of them out of 'in-progress', then retry.",
    );
    expectUnchanged(before, 'docs/memory/cards/card-002.md', doc('card-002', 'card', 'draft'));
  });

  it('`reject` into a full state is refused the same way', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await verb('memoryReject', repo, 'card-003', { reason: 'tests missing' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toContain('held by card-001');
    expectUnchanged(before, 'docs/memory/cards/card-003.md', doc('card-003', 'card', 'in-review'));
  });

  it('`park` into a full state is refused the same way', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await verb('memoryPark', repo, 'task-002', { reason: 'not now' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toBe(
      "WIP limit reached for 'backlog' on type 'task' (limit 1): held by task-001. Move one of them out of 'backlog', then retry.",
    );
    expectUnchanged(before);
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
    const result = await operation('memoryAdd')({ root: repo, options: { type: 'slot', title: 'Second slot' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toBe(
      "WIP limit reached for 'open' on type 'slot' (limit 1): held by slot-001. Move one of them out of 'open', then retry.",
    );
    expectUnchanged(before);
    expect(existsSync(join(repo, 'docs/memory/slots/slot-002.md'))).toBe(false);
  });
});
