/**
 * P1.10 (US-5-08) — `wingfoil memory history` core-op fit criteria, per
 * `docs/02_requirements/02_bdd/features/p1-memory/P1.10-memory-history.feature` (all three
 * scenarios), `spec-006-core-domain-api.md` §3 (`memoryHistory` is `mutates: false`),
 * `spec-008-cli-grammar.md` §7 (a command whose noun scopes the type takes the BARE `<id>`
 * positional) and §5 (document not found -> exit `1`; missing required argument -> exit `2`),
 * CLAUDE.md §5.1 (the `Approver:`/`Reason:` commit-body convention this feature reads back).
 *
 * Exercises the REAL, registered `CORE_MODULES` `memory.memoryHistory` operation — the exact same
 * `CoreFn` `src/cli`'s `memory history` command dispatches to. It wraps task-009's
 * `findMemoryDocumentById` and task-015's `reconstructMemoryTransitions`; no git walk, body parsing
 * or state derivation is reimplemented here. Every fixture lives in a THROWAWAY temp git repo (never
 * this repo's own `docs/04_memory/`).
 *
 * **No latency assertion lives in this file.** P1.10's "And the query returns in under 1 second"
 * clause is owned by `test/core/query-latency.test.ts`, in-process, at REQ-PERF-02's own measurement
 * conditions — see `bug-011-cli-latency-assertion-measures-spawn-contention` / `task-067` and the
 * structural guard in `test/core/latency-budget-placement.test.ts`.
 */
import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1
types:
  decision-log:
    path: "docs/04_memory/design/dls/{id}.md"
  task:
    path: "docs/04_memory/{release}/{id}.md"
`;

const DECISION_12 = 'docs/04_memory/design/dls/decision-12.md';
const DECISION_30 = 'docs/04_memory/design/dls/decision-30.md';
const DEPRECATED_DOC = 'docs/04_memory/design/dls/decision-99.md';

const APPROVER_LINE = 'Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)';
const APPROVE_REASON = 'Ratified at the design review; no open objections.';

/** One projected audit-trail entry, as the operation returns it (the shape under test). */
interface HistoryEntry {
  readonly sha: string;
  readonly author: string;
  readonly timestamp: string;
  readonly operation: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly approver: string | null;
  readonly reason: string | null;
  readonly subject: string;
}

interface HistoryValue {
  readonly id: string;
  readonly path: string;
  readonly entries: readonly HistoryEntry[];
}

/** The real, registered `memory.memoryHistory` `CoreFn` — fails loudly if a future change un-registers it. */
function memoryHistoryFn(): CoreFn<unknown, HistoryValue> {
  const memoryModule = CORE_MODULES.find((module) => module.name === 'memory');
  const operation = memoryModule?.operations.memoryHistory;
  if (!operation) throw new Error('fixture bug: "memoryHistory" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, HistoryValue>;
}

/** A decision-log document at `status`, matching the `decision-log` machine's own states. */
function writeDecision(repo: string, path: string, id: string, status: string): void {
  writeFixtureFile(
    repo,
    path,
    ['---', `id: ${id}`, 'type: decision-log', `title: "Decision ${id}"`, `status: ${status}`, 'tags: [ design ]', '---', '', 'Body.', ''].join('\n'),
  );
}

/** `%aI` — strict ISO-8601 with a numeric UTC offset (or `Z`), sourced from git itself. */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * The BDD Background: "a Memory document `decision-12` has 3 recorded state transitions".
 * Scenario 3 establishes that the CREATION commit is itself one of the listed entries, so three
 * recorded transitions is three commits: `add` (draft) -> `submit` (in-discussion) -> `approve`
 * (ready). Per CLAUDE.md §5.1 only the `approve` commit carries an `Approver:`/`Reason:` body —
 * `add`/`submit` are subject-only — which is exactly the mixed case the projection must handle
 * without inventing values.
 */
function seedRepo(): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);

  writeDecision(repo, DECISION_12, 'decision-12', 'draft');
  commitAll(repo, 'wf(decision-log): add decision-12');

  writeDecision(repo, DECISION_12, 'decision-12', 'in-discussion');
  commitAll(repo, 'wf(decision-log): submit decision-12');

  writeDecision(repo, DECISION_12, 'decision-12', 'ready');
  commitAll(
    repo,
    `wf(decision-log): approve decision-12 [in-discussion → ready]\n\n${APPROVER_LINE}\nReason: ${APPROVE_REASON}`,
  );

  return repo;
}

describe('CORE_MODULES memory.memoryHistory — P1.10 Scenario "View the full audit trail of a document"', () => {
  let repo: string;

  beforeEach(() => {
    repo = seedRepo();
  });

  afterEach(() => removeTempDir(repo));

  it('"the output lists 3 entries in chronological order" — oldest first, matching the recorded state chain', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('decision-12');
    expect(result.value.path).toBe(DECISION_12);
    expect(result.value.entries).toHaveLength(3);

    // Chronological = oldest first. Asserted on the derived state chain (a total order fixed by the
    // fixture) rather than only on timestamps, which can tie when commits land within the same second.
    expect(result.value.entries.map((entry) => entry.to)).toEqual(['draft', 'in-discussion', 'ready']);
    expect(result.value.entries.map((entry) => entry.from)).toEqual([null, 'draft', 'in-discussion']);
    expect(result.value.entries.map((entry) => entry.operation)).toEqual(['add', 'submit', 'approve']);

    const timestamps = result.value.entries.map((entry) => entry.timestamp);
    expect([...timestamps].sort()).toEqual(timestamps); // non-decreasing, i.e. never newest-first
  });

  it('"each entry shows author, ISO-8601 timestamp, state change, and reason" — all four keys on every entry', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.entries.forEach((entry, index) => {
      // Author — git's own `%an <%ae>`, never a value read out of the document.
      expect(entry.author).toBe('WingFoil Test <wf-test@example.invalid>');
      // ISO-8601 timestamp — git's `%aI` (P1.2/P1.10: the commit supplies the date, not file content).
      expect(entry.timestamp).toMatch(ISO_8601);
      // State change — `to` is always derived; `from` is null only for the creation entry.
      expect(entry.to).not.toBeNull();
      expect(index === 0 ? entry.from : (entry.from as string)).toEqual(index === 0 ? null : expect.any(String));
      // Reason — the KEY is present on every entry (null where the commit records none, see below).
      expect(entry).toHaveProperty('reason');
      expect(entry).toHaveProperty('approver');
      expect(entry.sha).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  it('surfaces the approve commit\'s Approver:/Reason: body verbatim (CLAUDE.md §5.1; P1.7 exists so P1.10 can read it back)', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const approveEntry = result.value.entries[2];
    expect(approveEntry?.operation).toBe('approve');
    expect(approveEntry?.reason).toBe(APPROVE_REASON);
    expect(approveEntry?.approver).toBe('Roberto Pompermaier <robypomper@gmail.com> (approver)');
    expect(approveEntry?.subject).toBe('wf(decision-log): approve decision-12 [in-discussion → ready]');
  });

  it('leaves approver/reason null for commits that carry no Approver:/Reason: lines — never invented, never inferred from the subject', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `add`/`submit` are subject-only by convention (CLAUDE.md §5.1), so both fields stay null —
    // not an empty string, not the subject text, not carried over from a neighbouring commit.
    expect(result.value.entries.slice(0, 2).map((entry) => entry.reason)).toEqual([null, null]);
    expect(result.value.entries.slice(0, 2).map((entry) => entry.approver)).toEqual([null, null]);
  });

  it('is deterministic — two calls against unchanged state return an identical result (REQ-SYS-07)', async () => {
    const first = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });
    const second = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });
    expect(first).toEqual(second);
  });
});

describe('CORE_MODULES memory.memoryHistory — P1.10 Scenario "Error - history for a non-existent document"', () => {
  let repo: string;

  beforeEach(() => {
    repo = seedRepo();
  });

  afterEach(() => removeTempDir(repo));

  it('exits 1 with the exact message "document not found: decision-999" (a returned CoreError, never a throw)', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-999' });

    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'document not found: decision-999' },
    });
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('matches on the document\'s frontmatter id EXACTLY — a partial id is not found', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-1' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'document not found: decision-1' },
    });
  });

  it('an omitted <id> is a USAGE error (exit 2), not a "not found" (spec-008 §5)', async () => {
    await expect(memoryHistoryFn()({ root: repo })).rejects.toThrow('missing required argument: <id>');
    try {
      await memoryHistoryFn()({ root: repo });
    } catch (error) {
      expect(exitCodeForThrow(error).exitCode).toBe(2);
    }
  });

  it('a missing .wingfoil/memory.yaml is a NOT_FOUND from the pillar load, exit 1 — same as every other read op', async () => {
    const bare = makeTempGitRepo();
    // A `.wingfoil/` without memory.yaml; with no `.wingfoil/` at all the refusal is
    // `WINGFOIL_NOT_INITIALIZED` (task-179, `bug-198`).
    writeFixtureFile(bare, '.wingfoil/.gitkeep', '');
    try {
      const result = await memoryHistoryFn()({ root: bare, positional: 'decision-12' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
      if (!result.ok) expect(result.error.message).toMatch(/^\.wingfoil\/memory\.yaml is missing: /);
    } finally {
      removeTempDir(bare);
    }
  });
});

describe('CORE_MODULES memory.memoryHistory — P1.10 Scenario "Edge - document with a single creation event"', () => {
  let repo: string;

  beforeEach(() => {
    repo = seedRepo();
    writeDecision(repo, DECISION_30, 'decision-30', 'draft');
    commitAll(repo, 'wf(decision-log): add decision-30');
  });

  afterEach(() => removeTempDir(repo));

  it('"the output lists exactly 1 entry describing the creation"', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-30' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toHaveLength(1);
    const creation = result.value.entries[0];
    // "describing the creation": no prior state to name, the `add` verb, and the document's initial status.
    expect(creation?.from).toBeNull();
    expect(creation?.operation).toBe('add');
    expect(creation?.to).toBe('draft');
    expect(creation?.subject).toBe('wf(decision-log): add decision-30');
    expect(creation?.reason).toBeNull();
  });

  it('a second document\'s commits never leak into this one\'s trail (the walk is path-scoped)', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toHaveLength(3);
    expect(result.value.entries.every((entry) => entry.subject.includes('decision-12'))).toBe(true);
  });
});

describe('CORE_MODULES memory.memoryHistory — an archived document keeps its audit trail (REQ-STATE-06)', () => {
  let repo: string;

  beforeEach(() => {
    repo = seedRepo();
    writeDecision(repo, DEPRECATED_DOC, 'decision-99', 'draft');
    commitAll(repo, 'wf(decision-log): add decision-99');
    writeDecision(repo, DEPRECATED_DOC, 'decision-99', 'deprecated');
    commitAll(repo, 'wf(decision-log): deprecate decision-99 [draft → deprecated]\n\nReason: superseded by decision-12');
  });

  afterEach(() => removeTempDir(repo));

  it('REQ-STATE-06 excludes archived documents from default SEARCH results, not from their own history — it stays readable', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-99' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries.map((entry) => entry.to)).toEqual(['draft', 'deprecated']);
    expect(result.value.entries[1]?.operation).toBe('deprecate');
  });

  it('shows a `deprecate` commit\'s Reason: even though it carries no Approver: line (CLAUDE.md §5.1 — deprecate is not an approval gate)', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-99' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The two fields are read INDEPENDENTLY: `approver` is null (no `Approver:` line recorded) while
    // `reason` still carries the recorded text. Reading `reason` off `parseApprovalMetadata` — which is
    // all-or-nothing by design — would silently drop every deprecate reason from the audit trail.
    expect(result.value.entries[1]?.approver).toBeNull();
    expect(result.value.entries[1]?.reason).toBe('superseded by decision-12');
  });
});

/**
 * task-192 (`dl-111` Action 3, P1.10): an entry names the build that wrote its commit. The field is
 * read from the commit's trailing trailer paragraph — the one `commitPaths` appends — and is present
 * only when that paragraph carries `WingFoil-Version:`, so a hand-written commit stays distinguishable
 * from a tool-written one.
 */
describe('CORE_MODULES memory.memoryHistory — the `wingfoil` field (task-192, dl-111)', () => {
  const STAMP = '0.3.0 (0123456789abcdef0123456789abcdef01234567)';
  const MULTI_LINE_REASON = 'Ratified at the design review.\n\nThe second paragraph stays in the reason.';
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeDecision(repo, DECISION_12, 'decision-12', 'draft');
    commitAll(repo, 'wf(decision-log): add decision-12');
    writeDecision(repo, DECISION_12, 'decision-12', 'in-discussion');
    commitAll(repo, `wf(decision-log): submit decision-12\n\nWingFoil-Version: ${STAMP}`);
    writeDecision(repo, DECISION_12, 'decision-12', 'ready');
    commitAll(
      repo,
      `wf(decision-log): approve decision-12 [in-discussion → ready]\n\n${APPROVER_LINE}\nReason: ${MULTI_LINE_REASON}\n\nWingFoil-Version: ${STAMP}`,
    );
  });

  afterEach(() => removeTempDir(repo));

  // Approver ruling D5, 2026-10-05: always present, `null` without the trailer, like `approver`/`reason`.
  it('carries `wingfoil` on every entry: the trailer value, or `null` when the commit has none', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entries = result.value.entries as readonly (HistoryEntry & { wingfoil: string | null })[];
    expect(entries[0]?.wingfoil).toBeNull();
    expect(entries[1]?.wingfoil).toBe(STAMP);
    expect(entries[2]?.wingfoil).toBe(STAMP);
  });

  it('the trailer paragraph ends the Reason: block — a multi-line reason before it reads back whole', async () => {
    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries[2]?.reason).toBe(MULTI_LINE_REASON);
    expect(result.value.entries[2]?.approver).toBe('Roberto Pompermaier <robypomper@gmail.com> (approver)');
  });

  it('reads the key only from the trailing trailer paragraph, as git does — not from a line earlier in the body', async () => {
    writeDecision(repo, DECISION_12, 'decision-12', 'deprecated');
    commitAll(
      repo,
      'wf(decision-log): deprecate decision-12 [ready → deprecated]\n\nWingFoil-Version: 9.9.9 (forged)\nnot a trailer line\n\nCo-Authored-By: Someone <someone@example.invalid>',
    );

    const result = await memoryHistoryFn()({ root: repo, positional: 'decision-12' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value.entries[3] as HistoryEntry & { wingfoil: string | null }).wingfoil).toBeNull();
  });
});
