/**
 * task-332 — a short element reference in the Memory verbs that take an element id: `history`, `submit`, `approve`,
 * `reject`, `amend`, `deprecate`, `park` (design D1 (b), approved 2026-11-01; `spec-008-cli-grammar` §7; BDD
 * `P1.10-memory-history.feature`, `P1.7-memory-approve.feature`).
 *
 * Drives the REAL registered `CORE_MODULES` operations in a throwaway git repository carrying the `memory.yaml` a
 * real `wingfoil init --template kanban` writes (`./fixtures/kanban-memory.yaml`, through
 * `./helpers/short-reference-fixture.ts`):
 *
 * - AC 1 — `<type prefix>-<n>` (`dl-001`, `dl-1`, `task-5`) names the element holding that number (D4: by value; D2:
 *   never a prefix when it has no such number);
 * - AC 2 — a unique prefix of the full id (`dl-001-pick`) names it;
 * - AC 3 — a reference matching several is `CONFLICT`, exit 1, `ambiguous reference: <ref> matches <N> elements`,
 *   the hint, every candidate in id order (D7); nothing is written;
 * - AC 4 — the result, the commit subject and the commit body carry the full id, never the short reference (D10);
 * - AC 5 — every verb above;
 * - D5 archived elements are candidates, D6 each verb keeps its baseline, D8 the not-found messages are unchanged,
 *   D9 `supersedes:` stays exact.
 *
 * Red-first: today every verb matches the frontmatter `id` exactly, so each short reference below is
 * `document not found`. D8 and D9 are characterization (they pass at red and must stay green).
 */
import { execFileSync } from 'node:child_process';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import {
  APPROVER_DNA,
  APPROVER_LINE,
  buildKanbanRepo,
  kanbanDocument,
  kanbanPath,
  REPO_RELEASE_MEMORY_YAML,
  type FixtureDocument,
} from './helpers/short-reference-fixture';

type Verb = 'memoryHistory' | 'memorySubmit' | 'memoryApprove' | 'memoryReject' | 'memoryDeprecate' | 'memoryAmend' | 'memoryPark';

interface Value {
  readonly id: string;
  readonly path: string;
  readonly from?: string;
  readonly to?: string;
  readonly entries?: readonly { readonly subject: string }[];
}

function operation(verb: Verb): CoreFn<unknown, Value> {
  const found = CORE_MODULES.find((module) => module.name === 'memory')?.operations[verb];
  if (!found) throw new Error(`fixture bug: "${verb}" is not registered on the memory module`);
  return found.fn as CoreFn<unknown, Value>;
}

function run(root: string, verb: Verb, reference: string, options: Record<string, string> = {}): Promise<CoreResult<Value>> {
  return Promise.resolve(operation(verb)({ root, positional: reference, positionals: [reference], options })) as Promise<CoreResult<Value>>;
}

/** The value of a success; a refusal fails the test naming its code and message. */
function valueOf<T>(result: CoreResult<T>): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}: ${result.error.message}`);
  return result.value;
}

const gitOut = (repo: string, args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

const DL_1 = 'dl-001-pick-a-storage-layout-for-exports';
const DL_2 = 'dl-002-pick-a-storage-engine';
const DL_3 = 'dl-003-pick-a-storage-format';
const DL_4 = 'dl-004-pick-a-storage-medium';
const TASK_5 = 'task-005-amend-me';
const BUG_6 = 'bug-006-park-me';
const TASK_12 = 'task-012-cli-exit-code-contract';
const TASK_330 = 'task-330-another-task';
const DL_50_A = 'dl-050-same-number-a';
const DL_50_B = 'dl-050-same-number-b';
const DL_99 = 'dl-099-retired';

const DOCUMENTS: readonly FixtureDocument[] = [
  ['decision-log', DL_1, 'draft'],
  ['decision-log', DL_2, 'pending'],
  ['decision-log', DL_3, 'pending'],
  ['decision-log', DL_4, 'draft'],
  ['task', TASK_5, 'pending'],
  ['bug', BUG_6, 'in-progress'],
  ['task', TASK_12, 'draft'],
  ['task', TASK_330, 'draft'],
  ['decision-log', DL_50_A, 'draft'],
  ['decision-log', DL_50_B, 'draft'],
  ['decision-log', DL_99, 'deprecated'],
];

/** One verb with the element it acts on, what it needs, and the subject it commits (design table, AC 5). */
interface Row {
  readonly verb: Exclude<Verb, 'memoryHistory'>;
  readonly type: string;
  readonly id: string;
  readonly number: string;
  readonly prefix: string;
  readonly options: Record<string, string>;
  readonly subject: string;
  /** An uncommitted edit the verb records (`amend`). */
  readonly prepare?: (repo: string) => void;
}

const ROWS: readonly Row[] = [
  { verb: 'memorySubmit', type: 'decision-log', id: DL_1, number: 'dl-1', prefix: 'dl-001-pick', options: {}, subject: `wf(decision-log): submit ${DL_1}` },
  {
    verb: 'memoryApprove',
    type: 'decision-log',
    id: DL_2,
    number: 'dl-2',
    prefix: 'dl-002-pick',
    options: { reason: 'agreed' },
    subject: `wf(decision-log): approve ${DL_2} [pending → approved]`,
  },
  {
    verb: 'memoryReject',
    type: 'decision-log',
    id: DL_3,
    number: 'dl-003',
    prefix: 'dl-003-pick',
    options: { reason: 'needs work' },
    subject: `wf(decision-log): reject ${DL_3} [pending → draft]`,
  },
  {
    verb: 'memoryDeprecate',
    type: 'decision-log',
    id: DL_4,
    number: 'dl-4',
    prefix: 'dl-004-pick',
    options: { reason: 'not needed' },
    subject: `wf(decision-log): deprecate ${DL_4} [draft → deprecated]`,
  },
  {
    verb: 'memoryAmend',
    type: 'task',
    id: TASK_5,
    number: 'task-5',
    prefix: 'task-005-am',
    options: { reason: 'a correction' },
    subject: `wf(task): amend ${TASK_5} [pending → pending]`,
    prepare: (repo) => writeFixtureFile(repo, kanbanPath('task', TASK_5), kanbanDocument('task', TASK_5, 'pending', 'Corrected content.\n')),
  },
  {
    verb: 'memoryPark',
    type: 'bug',
    id: BUG_6,
    number: 'bug-6',
    prefix: 'bug-006-pa',
    options: { reason: 'stopped for now' },
    subject: `wf(bug): park ${BUG_6} [in-progress → open]`,
  },
];

describe('task-332 AC 1, 2 and 5 — memory history resolves a short reference (red-first)', () => {
  let repo: string;
  beforeEach(() => {
    repo = buildKanbanRepo(DOCUMENTS);
  });
  afterEach(() => removeTempDir(repo));

  it.each([
    ['dl-001', 'the number, as written'],
    ['dl-1', 'the number, unpadded'],
    ['dl-0001', 'the number, over-padded'],
    ['dl-001-pick', 'a unique prefix of the full id'],
    [DL_1, 'the full id (unchanged)'],
  ])('%s — %s — names the decision-log', async (reference) => {
    const value = valueOf(await run(repo, 'memoryHistory', reference));
    expect(value.id).toBe(DL_1);
    expect(value.path).toBe(kanbanPath('decision-log', DL_1));
  });

  it('task-12 names task-012-… (padding by value, D4) and not task-330-…', async () => {
    const result = await run(repo, 'memoryHistory', 'task-12');
    expect(result.ok ? result.value.id : result.error.message).toBe(TASK_12);
  });

  it('D5: a deprecated element is a candidate — dl-99 names dl-099-retired', async () => {
    const result = await run(repo, 'memoryHistory', 'dl-99');
    expect(result.ok ? result.value.id : result.error.message).toBe(DL_99);
  });

  it('D2: task-33 has no task with that number and is NOT task-330-… — document not found, exit 1', async () => {
    const result = await run(repo, 'memoryHistory', 'task-33');
    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'document not found: task-33' } });
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('D8: a number nobody has keeps the existing message — dl-3 is dl-003-…, dl-9 is not found', async () => {
    const result = await run(repo, 'memoryHistory', 'dl-9');
    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'document not found: dl-9' } });
  });
});

describe('task-332 AC 3 — an ambiguous reference is refused, every candidate listed (red-first)', () => {
  let repo: string;
  beforeEach(() => {
    repo = buildKanbanRepo(DOCUMENTS);
  });
  afterEach(() => removeTempDir(repo));

  const AMBIGUOUS = {
    code: 'CONFLICT',
    message: 'ambiguous reference: dl-50 matches 2 elements',
    hint: 'give the full id, or a longer prefix of it',
    details: { candidates: [DL_50_A, DL_50_B], issues: [{ detail: DL_50_A }, { detail: DL_50_B }] },
  };

  it('memory history dl-50: CONFLICT, exit 1, the message, the hint, both full ids in id order (D7)', async () => {
    const result = await run(repo, 'memoryHistory', 'dl-50');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual(AMBIGUOUS);
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('the same refusal for a prefix: dl-050-same is ambiguous by prefix', async () => {
    const result = await run(repo, 'memoryHistory', 'dl-050-same');
    expect(result.ok ? null : result.error).toEqual({ ...AMBIGUOUS, message: 'ambiguous reference: dl-050-same matches 2 elements' });
  });

  it.each(ROWS.map((row) => [row.verb] as const))('%s dl-50: refused, HEAD and the working tree untouched', async (verb) => {
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);
    const result = await run(repo, verb, 'dl-50', { reason: 'r' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual(AMBIGUOUS);
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('a prefix shared by this repository\'s releases is ambiguous too: patch-v0.3 against patch-v0.3.1 and patch-v0.3.2', async () => {
    const releases = buildKanbanRepo(
      [
        ['release', 'patch-v0.3.2', 'draft'],
        ['release', 'patch-v0.3.1', 'draft'],
        ['release', 'minor-v0.3', 'draft'],
      ],
      REPO_RELEASE_MEMORY_YAML,
    );
    try {
      const before = head(releases);
      const result = await run(releases, 'memoryDeprecate', 'patch-v0.3', { reason: 'r' });
      expect(result.ok ? null : result.error).toEqual({
        code: 'CONFLICT',
        message: 'ambiguous reference: patch-v0.3 matches 2 elements',
        hint: 'give the full id, or a longer prefix of it',
        details: { candidates: ['patch-v0.3.1', 'patch-v0.3.2'], issues: [{ detail: 'patch-v0.3.1' }, { detail: 'patch-v0.3.2' }] },
      });
      expect(head(releases)).toBe(before);
      // the exact id of the one that is also a prefix of nothing else still resolves exactly
      const exact = await run(releases, 'memoryHistory', 'minor-v0.3');
      expect(exact.ok ? exact.value.id : exact.error.message).toBe('minor-v0.3');
    } finally {
      removeTempDir(releases);
    }
  });
});

describe('task-332 AC 4 and 5 — every verb takes a short reference and writes the full id (red-first)', () => {
  let repo: string;
  beforeEach(() => {
    repo = buildKanbanRepo(DOCUMENTS);
  });
  afterEach(() => removeTempDir(repo));

  describe.each(ROWS)('$verb on $id', (row) => {
    it.each([
      ['a number', row.number],
      ['a unique prefix', row.prefix],
    ])('%s %s: one commit, the result, the subject and the body carry the full id only', async (_kind, reference) => {
      row.prepare?.(repo);
      const before = head(repo);

      const result = await run(repo, row.verb, reference, row.options);

      const value = valueOf(result);
      expect(exitCodeForResult(result)).toBe(0);
      expect(value.id).toBe(row.id);
      expect(value.path).toBe(kanbanPath(row.type, row.id));
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
      expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(kanbanPath(row.type, row.id));
      expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(row.subject);
      expect(result.ok && result.commit?.message.split('\n')[0]).toBe(row.subject);
      // nowhere in the commit — subject, Approver:, Reason: or trailers — does the short reference stand for the element
      const tokens = gitOut(repo, ['log', '-1', '--format=%B']).split(/\s+/);
      expect(tokens).not.toContain(reference);
      expect(tokens).toContain(row.id);
      expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
    });
  });

  it('approve records the approver and the reason in the body, under the full-id subject', async () => {
    valueOf(await run(repo, 'memoryApprove', 'dl-2', { reason: 'agreed' }));
    const body = gitOut(repo, ['log', '-1', '--format=%B']);
    expect(body.startsWith(`wf(decision-log): approve ${DL_2} [pending → approved]\n\n${APPROVER_LINE}\nReason: agreed`)).toBe(true);
  });

  it('D5: deprecate dl-99 reaches the archived element and is refused by name — document already deprecated: dl-099-retired', async () => {
    const before = head(repo);
    const result = await run(repo, 'memoryDeprecate', 'dl-99', { reason: 'r' });
    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: `document already deprecated: ${DL_99}` } });
    expect(head(repo)).toBe(before);
  });

  it('D6: a document only the working tree holds is not found by a number — HEAD decides', async () => {
    writeFixtureFile(repo, kanbanPath('decision-log', 'dl-007-only-here'), kanbanDocument('decision-log', 'dl-007-only-here', 'draft'));
    const before = head(repo);
    const result = await run(repo, 'memorySubmit', 'dl-7');
    expect(result.ok ? null : result.error).toEqual({ code: 'NOT_FOUND', message: 'document not found: dl-7' });
    expect(head(repo)).toBe(before);
  });
});

describe('task-332 D8 (characterization) — a reference nothing names keeps the existing message in every verb', () => {
  let repo: string;
  beforeEach(() => {
    repo = buildKanbanRepo(DOCUMENTS);
  });
  afterEach(() => removeTempDir(repo));

  it.each(ROWS.map((row) => [row.verb] as const))('%s dl-9 → NOT_FOUND "document not found: dl-9", exit 1, nothing written', async (verb) => {
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);
    const result = await run(repo, verb, 'dl-9', { reason: 'r' });
    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'document not found: dl-9' } });
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });
});

describe('task-332 D9 (characterization) — the supersedes: trigger stays exact', () => {
  const MEMORY_YAML = `version: 1
types:
  adr:
    path: "docs/adrs/{id}.md"
    id_pattern: "adr-{n}-{slug}"
    states:
      sequence: [draft, pending, accepted, superseded]
      gates:
        pending: { reject: draft }
      waiting: [accepted]
`;

  function adr(id: string, status: string, supersedes: string): string {
    return `---\nid: "${id}"\ntype: adr\ntitle: "${id}"\nstatus: ${status}\nsupersedes: ${supersedes}\n---\n\n## Body\n\nReal content.\n`;
  }

  it.each(['adr-1', 'adr-1-ol'])('an adr whose supersedes: is the short form %s of an existing adr is still refused — document not found', async (shortForm) => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
      writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
      writeFixtureFile(repo, 'docs/adrs/adr-1-old.md', adr('adr-1-old', 'accepted', '""'));
      writeFixtureFile(repo, 'docs/adrs/adr-2-new.md', adr('adr-2-new', 'pending', `"${shortForm}"`));
      commitAll(repo, 'seed');
      const before = head(repo);
      const unchanged = snapshotPersistence(repo);

      const result = await run(repo, 'memoryApprove', 'adr-2-new', { reason: 'ok' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toMatch(new RegExp(`^cannot approve adr-2-new: its supersedes: field names ${shortForm}.*document not found: ${shortForm}`));
      expect(head(repo)).toBe(before);
      assertPersistenceUnchanged(repo, unchanged);
    } finally {
      removeTempDir(repo);
    }
  });
});
