/**
 * task-019-implement-versioning-audit-trail (P1.2, REQ-SYS-01) — the P1.2 BDD feature file
 * (`docs/02_requirements/02_bdd/features/p1-memory/P1.2-versioning-audit-trail.feature`) exercised
 * end-to-end against the three primitives Wave-3 already built: `commitPaths` (task-018, the "one
 * state change = one attributable commit" mechanism), `requireGitIdentity` (task-014, the write-time
 * precondition), and `auditAttribution`/`reconstructMemoryTransitions` (task-015, the read-time audit).
 *
 * This suite adds NO new production code (see the task's Execution Notes) — P1.2's contract is
 * already fully realized by composing those three existing pieces at a call site; this is the
 * verification that the composition actually satisfies each BDD scenario's fit criterion, using real
 * temp git repos and real commits (never mocked git).
 *
 * ADR-007 note (see `src/memory/audit.ts`'s module doc): a commit's "reference" to the new state is
 * NOT the commit-message subject text for `add`/`submit` (the memory-operation commit-format
 * convention puts an `[old → new]` bracket only on `approve`/`reject`/`deprecate` subjects, per
 * P1.7 / ADR-007) — state lives in the committed frontmatter
 * content itself, derived by `reconstructMemoryTransitions`. The scenario below verifies both halves:
 * the doc id in the subject text, and the new state via the frontmatter actually committed.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { exitCodeForResult } from '../../src/core';
import { requireGitIdentity } from '../../src/core/git-identity';
import { commitPaths } from '../../src/storage';
import { auditAttribution, reconstructMemoryTransitions } from '../../src/memory';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const DOC_PATH = 'docs/04_memory/v0.1/task-101-doc.md';

function writeDoc(repo: string, status: string): void {
  writeFixtureFile(
    repo,
    DOC_PATH,
    ['---', 'id: task-101', `status: ${status}`, '---', '', 'Body.', ''].join('\n'),
  );
}

/**
 * A fixture repository whose author is not a placeholder: `makeTempGitRepo` configures an
 * `example.invalid` address, an RFC 2606 reserved domain the audit counts as unattributed since
 * task-132 (`bug-153`), and the scenarios below are about attribution being complete.
 */
function makeAttributedRepo(): string {
  const dir = makeTempGitRepo();
  git(dir, ['config', 'user.email', 'wf-test@example.org']);
  return dir;
}

describe('P1.2 — Every state change records author and timestamp (BDD scenario 1)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('a draft -> pending change committed via commitPaths is fully attributable and references the doc id + new state', () => {
    repo = makeAttributedRepo();

    writeDoc(repo, 'draft');
    commitPaths(repo, [DOC_PATH], 'wf(task): add task-101');

    writeDoc(repo, 'pending');
    commitPaths(repo, [DOC_PATH], 'wf(task): submit task-101');

    // The commit records author identity + an ISO-8601 timestamp (both sourced from git itself, per
    // `commitPaths`'s doc comment) — audited with 0 "unknown author". The timestamp's zone must be
    // explicit, but either legal spelling of it counts: git >= 2.55 renders a zero offset as `Z`
    // where 2.43 wrote `+00:00`, so demanding `[+-]HH:MM` fails on any UTC runner (bug-057).
    const entries = auditAttribution(repo, [DOC_PATH]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.valid)).toBe(true);
    for (const entry of entries) {
      expect(entry.authorName).toBe('WingFoil Test');
      expect(entry.authorEmail).toBe('wf-test@example.org');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
    }

    // The commit message references the document id; the new state is derived from the frontmatter
    // actually committed (ADR-007) rather than restated in the subject text for a plain submit.
    const transitions = reconstructMemoryTransitions(repo, DOC_PATH);
    expect(transitions).toHaveLength(2);
    expect(transitions[1]).toMatchObject({ operation: 'submit', fromState: 'draft', toState: 'pending' });
    expect(transitions[1]?.subject).toContain('task-101');
  });
});

describe('P1.2 — Audit trail completeness across pillars (BDD scenario 2)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('changes to a DNA, a directive, and a workflow file are all 100% attributable — no "unknown author"', () => {
    repo = makeAttributedRepo();

    const dnaPath = '.wingfoil/dna.yaml';
    const directivePath = '.wingfoil/directives/custom/determinism.md';
    const workflowPath = '.wingfoil/workflows/custom/dev-loop.yaml';

    writeFixtureFile(repo, dnaPath, 'modules: [core]\n');
    commitPaths(repo, [dnaPath], 'feat(dna): task-101 — set modules');

    writeFixtureFile(repo, directivePath, '# determinism\n');
    commitPaths(repo, [directivePath], 'feat(directives): task-101 — add determinism directive');

    writeFixtureFile(repo, workflowPath, 'kind: sub\n');
    commitPaths(repo, [workflowPath], 'feat(workflow): task-101 — add dev-loop workflow');

    const entries = auditAttribution(repo, [dnaPath, directivePath, workflowPath]);

    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.valid)).toBe(true);
    expect(entries.filter((e) => !e.valid)).toHaveLength(0);
  });
});

describe('P1.2 — Error: no configured git identity (BDD scenario 3)', () => {
  const IDENTITY_ERROR = 'git identity not configured (user.name/user.email)';
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  let dir: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wf-versioning-'));
    git(dir, ['init', '--quiet']);
    const emptyConfig = join(dir, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses the state change with exit 1 and the exact message, and commits nothing', () => {
    // Production call order (task-019's whole point): every mutation gates on requireGitIdentity
    // BEFORE ever calling commitPaths — so with no identity configured, commitPaths is never invoked.
    // task-316 (bug-271): the full writes-nothing snapshot, on this unborn branch (`head` and
    // `symbolicHead` read back `''`; the untracked `empty.gitconfig` is in `status` before and after).
    const snapshot = snapshotPersistence(dir);
    const result = requireGitIdentity(dir);

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: IDENTITY_ERROR } });
    expect(exitCodeForResult(result)).toBe(1);

    // Nothing was committed — no HEAD exists at all in this fresh repo.
    expect(() => git(dir, ['rev-parse', 'HEAD'])).toThrow();
    // ...and no file, ref or branch changed anywhere (test/storage/helpers/persistence-snapshot.ts).
    assertPersistenceUnchanged(dir, snapshot);
  });

  it('defense-in-depth: even if a caller ignored the guard, git itself refuses to commit with no identity', () => {
    writeFixtureFile(dir, DOC_PATH, ['---', 'id: task-101', 'status: draft', '---', ''].join('\n'));

    expect(() => commitPaths(dir, [DOC_PATH], 'wf(task): add task-101')).toThrow();
    expect(() => git(dir, ['rev-parse', 'HEAD'])).toThrow();
  });
});
