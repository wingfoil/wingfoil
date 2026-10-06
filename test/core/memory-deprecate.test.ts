/**
 * P1.9 (US-5-04) — `wingfoil memory deprecate` core-op fit criteria, per
 * `docs/02_requirements/02_bdd/features/p1-memory/P1.9-memory-deprecate.feature`.
 *
 * The governing artefacts, and what each pins here:
 *
 * - `spec-001-memory-yaml-schema` ("`deprecated` is implicit") — `deprecate` is a **built-in wildcard
 *   edge from any state to a reserved `deprecated` state, always legal**, never declared in
 *   `sequence`/`gates`/`waiting`. The target is therefore taken from the engine
 *   (`resolveTypeTransition`), never written as a literal by the verb; the per-type table below proves
 *   it lands on `deprecated` from a `waiting` state, a terminal state, an `adr`'s `accepted`, an
 *   `adr`'s `superseded`, and a type that falls back to `defaults.states` (REQ-STATE-08).
 * - `spec-010-memory-frontmatter-schema` (field-write ownership) — `status` is the **only** field this
 *   verb writes; `rejection_reason` and every other byte survive untouched.
 * - `spec-004-mcp-surface-contract` §4.3 + `dl-054-submit-commit-subject-bracket` (option 2) — the
 *   subject carries the `[from → to]` bracket.
 * - `dl-027-req-sec-04-deprecate-reason-scope` (option (a), already applied to REQ-SEC-04) —
 *   `--reason` is **optional** on `deprecate`: omitting it exits `0`. And `deprecate` is not an
 *   approval gate, so the commit carries **no `Approver:` line** and no REQ-SEC-03 authority check.
 * - REQ-STATE-06 (`dl-028`) + `spec-012-context-loader-relevance-filtering` §6 — the deprecated
 *   document is then actually absent from an assembled agent context and from a default
 *   `memory search`. Proven by running the real filter after the real verb, not asserted.
 * - REQ-SEC-01 (git identity), `spec-008-cli-grammar` §5/§7 (exit codes, bare `<id>` positional).
 *
 * Exercises the REAL, registered `CORE_MODULES` `memory.memoryDeprecate` operation — the exact
 * `CoreFn` the CLI command and the MCP Tool dispatch to. Every write lands in a THROWAWAY temp git
 * repo.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import { filterRelevantMemoryDocuments } from '../../src/core/relevance';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import { UsageError } from '../../src/core/usage-error';
import { loadMemoryYaml } from '../../src/core/loaders';
import { splitFrontmatter } from '../../src/storage';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

/**
 * Five machines on purpose: the real `task` machine (gates + `waiting` states), the real `adr` machine
 * (whose `superseded` is a `waiting` edge driven by another element's `supersedes:`, NOT by this
 * verb), the real `decision-log` machine (terminal `ready`), and `decision` — declared with no
 * `states:` at all, so it falls back to `defaults.states` (REQ-STATE-08) and can hold the BDD's
 * literal `status: approved`.
 */
const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  task:
    path: "docs/memory/{release}/{id}.md"
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
      waiting: [backlog, approved]
  adr:
    path: "docs/memory/adrs/{id}.md"
    states:
      sequence: [draft, pending, accepted, superseded]
      gates:
        pending: { reject: draft }
      waiting: [accepted]
  decision-log:
    path: "docs/memory/dls/{id}.md"
    states:
      sequence: [draft, in-discussion, ready]
      gates:
        in-discussion: { reject: draft }
  decision:
    path: "docs/memory/decisions/{id}.md"
`;

interface DeprecateValue {
  readonly id: string;
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly reason?: string;
}

/** The real, registered `memory.memoryDeprecate` `CoreFn` — fails loudly if it is ever un-registered. */
function memoryDeprecateFn(): CoreFn<unknown, DeprecateValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryDeprecate;
  if (!operation) throw new Error('fixture bug: "memoryDeprecate" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, DeprecateValue>;
}

function memorySearchFn(): CoreFn<unknown, { matches: { id?: string }[] }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memorySearch;
  if (!operation) throw new Error('fixture bug: "memorySearch" operation not registered');
  return operation.fn as CoreFn<unknown, { matches: { id?: string }[] }>;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

/** The document's frontmatter as every reader of Memory documents parses it. */
function frontmatter(repo: string, relativePath: string): Record<string, unknown> {
  const content = readFileSync(join(repo, relativePath), 'utf-8');
  return load(splitFrontmatter(content).frontmatter ?? '') as Record<string, unknown>;
}

/** A `decision` document — the BDD's own shape: type with the default machine, `status: approved`. */
function decisionDoc(id: string, status: string, extra = ''): string {
  return `---
id: "${id}"          # auto-generated by wingfoil
type: decision
title: "A decision"   # REQUIRED
status: ${status}          # auto-set by wingfoil
${extra}tmpl_version: 260703
---

## Context

Real content.
`;
}

function typedDoc(fields: { id: string; type: string; status: string; extra?: string }): string {
  return `---
id: "${fields.id}"
type: ${fields.type}
title: "A ${fields.type}"
status: ${fields.status}
${fields.extra ?? ''}---

## Body

Real content.
`;
}

describe('CORE_MODULES memory.memoryDeprecate — P1.9 fit criteria', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, 'docs/memory/decisions/decision-12.md', decisionDoc('decision-12', 'approved'));
    writeFixtureFile(repo, 'docs/memory/decisions/decision-20.md', decisionDoc('decision-20', 'approved'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('P1.9 sc.1: `deprecate decision-12 --reason ...` sets `status: deprecated`, keeps the file, exit 0', async () => {
    const before = head(repo);
    const result = await memoryDeprecateFn()({
      root: repo,
      positional: 'decision-12',
      positionals: ['decision-12'],
      options: { reason: 'superseded by decision-20' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value).toEqual({
      id: 'decision-12',
      path: 'docs/memory/decisions/decision-12.md',
      from: 'approved',
      to: 'deprecated',
      reason: 'superseded by decision-20',
    });

    expect(frontmatter(repo, 'docs/memory/decisions/decision-12.md').status).toBe('deprecated');

    // "the file remains present in the repository" — on disk AND tracked at HEAD, not deleted.
    expect(existsSync(join(repo, 'docs/memory/decisions/decision-12.md'))).toBe(true);
    expect(gitOut(repo, ['ls-files', 'docs/memory/decisions/decision-12.md'])).toBe('docs/memory/decisions/decision-12.md');

    // spec-010 field-write ownership: `status` and nothing else — inline comments and body survive.
    expect(readFileSync(join(repo, 'docs/memory/decisions/decision-12.md'), 'utf-8')).toBe(
      decisionDoc('decision-12', 'approved').replace('status: approved', 'status: deprecated'),
    );

    // dl-054 / spec-004 §4.3: bracketed subject, `Reason:` body, and NO `Approver:` line (dl-027).
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).toBe(
      `wf(decision): deprecate decision-12 [approved → deprecated]\n\nReason: superseded by decision-20${STAMP_TRAILER}`,
    );
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).not.toContain('Approver:');
    expect(result.commit?.sha).toBe(head(repo));
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe('docs/memory/decisions/decision-12.md');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('dl-027 / spec-008 §2: `--reason` is OPTIONAL — omitting it exits 0 and commits a subject-only message', async () => {
    const result = await memoryDeprecateFn()({ root: repo, positional: 'decision-12' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value.reason).toBeUndefined();
    expect(frontmatter(repo, 'docs/memory/decisions/decision-12.md').status).toBe('deprecated');
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).toBe(`wf(decision): deprecate decision-12 [approved → deprecated]${STAMP_TRAILER}`);
  });

  it('P1.9 sc.3: deprecating an already-deprecated document exits 1, state unchanged, no new commit', async () => {
    const first = await memoryDeprecateFn()({ root: repo, positional: 'decision-12', options: { reason: 'first' } });
    expect(first.ok).toBe(true);
    const afterFirst = head(repo);
    const before = readFileSync(join(repo, 'docs/memory/decisions/decision-12.md'), 'utf-8');

    const result = await memoryDeprecateFn()({ root: repo, positional: 'decision-12', options: { reason: 'x' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('document already deprecated: decision-12');
    expect(exitCodeForResult(result)).toBe(1);
    expect(readFileSync(join(repo, 'docs/memory/decisions/decision-12.md'), 'utf-8')).toBe(before);
    expect(head(repo)).toBe(afterFirst);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('spec-010: `rejection_reason` (and every other field) is left untouched — `status` is the only write', async () => {
    writeFixtureFile(
      repo,
      'docs/memory/decisions/decision-33.md',
      decisionDoc('decision-33', 'draft', 'rejection_reason: "needs an owner"\n'),
    );
    commitAll(repo, 'seed rejected decision');

    const result = await memoryDeprecateFn()({ root: repo, positional: 'decision-33' });
    expect(result.ok).toBe(true);
    const parsed = frontmatter(repo, 'docs/memory/decisions/decision-33.md');
    expect(parsed.status).toBe('deprecated');
    expect(parsed.rejection_reason).toBe('needs an owner');
    expect(readFileSync(join(repo, 'docs/memory/decisions/decision-33.md'), 'utf-8')).toBe(
      decisionDoc('decision-33', 'draft', 'rejection_reason: "needs an owner"\n').replace(
        'status: draft',
        'status: deprecated',
      ),
    );
  });

  it('spec-008 §7: a missing `<id>` is a usage error (exit 2), nothing written', async () => {
    const before = head(repo);
    for (const positional of [undefined, '', '   ']) {
      await expect(memoryDeprecateFn()({ root: repo, positional })).rejects.toThrow(
        'missing required argument: <id>',
      );
    }
    try {
      await memoryDeprecateFn()({ root: repo });
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect(exitCodeForThrow(error)).toEqual({ reason: 'missing required argument: <id>', exitCode: 2 });
    }
    expect(head(repo)).toBe(before);
  });

  it('an unknown id exits 1 with `document not found` and writes nothing', async () => {
    const before = head(repo);
    const result = await memoryDeprecateFn()({ root: repo, positional: 'decision-999' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('document not found: decision-999');
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
  });

  it('bug-027: an unrelated STAGED change is not swept into the `wf(decision): deprecate` commit', async () => {
    writeFixtureFile(repo, 'other.txt', 'unrelated work');
    gitOut(repo, ['add', 'other.txt']);
    const result = await memoryDeprecateFn()({ root: repo, positional: 'decision-12' });
    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe('docs/memory/decisions/decision-12.md');
  });
});

/**
 * spec-001's wildcard edge, exercised across every machine shape this project runs. The point of the
 * table is that the target is `deprecated` in EVERY row — including the two `adr` rows, where
 * `superseded` exists in the machine but is a `waiting` edge no CLI verb drives (`spec-001` §`waiting`;
 * `SUPERSEDED_STATE`'s TSDoc in `src/memory/state-machine.ts`: "never by `memory deprecate`").
 */
describe('CORE_MODULES memory.memoryDeprecate — spec-001 wildcard edge from any state, on any type', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  const rows: { id: string; type: string; from: string; path: string; why: string }[] = [
    { id: 'task-101', type: 'task', from: 'backlog', path: 'docs/memory/v0.2/task-101.md', why: 'a `waiting` state — submit/approve are both illegal here' },
    { id: 'task-102', type: 'task', from: 'in-review', path: 'docs/memory/v0.2/task-102.md', why: 'a `gates` state' },
    { id: 'task-103', type: 'task', from: 'done', path: 'docs/memory/v0.2/task-103.md', why: 'the terminal `sequence` state' },
    { id: 'adr-501', type: 'adr', from: 'accepted', path: 'docs/memory/adrs/adr-501.md', why: 'an `adr` whose machine DOES declare `superseded` — the verb must still land on `deprecated`' },
    { id: 'adr-502', type: 'adr', from: 'superseded', path: 'docs/memory/adrs/adr-502.md', why: 'an already-archived `adr` — archived is not "already deprecated"' },
    { id: 'dl-701', type: 'decision-log', from: 'ready', path: 'docs/memory/dls/dl-701.md', why: 'a terminal state with no `waiting` entry at all' },
    { id: 'decision-12', type: 'decision', from: 'draft', path: 'docs/memory/decisions/decision-12.md', why: 'the REQ-STATE-08 `defaults.states` fallback' },
  ];

  it.each(rows)('$type in `$from` deprecates to `deprecated` ($why)', async ({ id, type, from, path }) => {
    writeFixtureFile(repo, path, typedDoc({ id, type, status: from }));
    commitAll(repo, `seed ${id}`);

    const result = await memoryDeprecateFn()({ root: repo, positional: id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.from).toBe(from);
    expect(result.value.to).toBe('deprecated');
    expect(frontmatter(repo, path).status).toBe('deprecated');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(`wf(${type}): deprecate ${id} [${from} → deprecated]`);
  });
});

/**
 * P1.9 sc.2 — "Deprecated documents are excluded from default agent context". Proven end to end: the
 * document is in the assembled context BEFORE the verb runs and absent AFTER it, using the real
 * spec-012 §6 relevance filter (`src/core/relevance.ts`, task-035) rather than an assertion about it.
 * The same round trip is run against default `memory search` (REQ-STATE-06, task-038).
 */
describe('CORE_MODULES memory.memoryDeprecate — REQ-STATE-06 / P1.9 sc.2 exclusion, proven after the verb', () => {
  let repo: string;
  const ELEMENT = {
    type: 'task',
    id: 'task-900',
    frontmatter: { id: 'task-900', type: 'task', title: 'Wire the loader', release: 'v0.2', depends_on: ['adr-501'] },
  };

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, 'docs/memory/adrs/adr-501.md', typedDoc({ id: 'adr-501', type: 'adr', status: 'accepted' }));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('an `accepted` adr is in the assembled context; after `memory deprecate` it is not', async () => {
    const memoryYaml = loadMemoryYaml(repo);

    const before = filterRelevantMemoryDocuments(repo, memoryYaml, ELEMENT);
    expect(before.documents.map((document) => document.id)).toContain('adr-501');

    const result = await memoryDeprecateFn()({ root: repo, positional: 'adr-501', options: { reason: 'obsolete' } });
    expect(result.ok).toBe(true);

    const after = filterRelevantMemoryDocuments(repo, loadMemoryYaml(repo), ELEMENT);
    expect(after.documents.map((document) => document.id)).not.toContain('adr-501');
    // The file is still there — it is filtered out of context, not removed (P1.9 sc.1, task-038 AC2).
    expect(existsSync(join(repo, 'docs/memory/adrs/adr-501.md'))).toBe(true);
  });

  it('after the verb the document also drops out of a DEFAULT `memory search`, but `--status deprecated` still finds it', async () => {
    const found = await memorySearchFn()({ root: repo, positional: 'adr' });
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.value.matches.map((match) => match.id)).toContain('adr-501');

    const result = await memoryDeprecateFn()({ root: repo, positional: 'adr-501' });
    expect(result.ok).toBe(true);

    const afterDefault = await memorySearchFn()({ root: repo, positional: 'adr' });
    expect(afterDefault.ok).toBe(true);
    if (afterDefault.ok) expect(afterDefault.value.matches.map((match) => match.id)).not.toContain('adr-501');

    const afterExplicit = await memorySearchFn()({ root: repo, positional: 'adr', options: { status: 'deprecated' } });
    expect(afterExplicit.ok).toBe(true);
    if (afterExplicit.ok) expect(afterExplicit.value.matches.map((match) => match.id)).toContain('adr-501');
  });
});

describe('CORE_MODULES memory.memoryDeprecate — REQ-SEC-01 git-identity pre-flight (no configured identity)', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  const saved: Record<string, string | undefined> = {};
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-memdeprecate-noid-'));
    execFileSync('git', ['-C', repo, 'init', '-q', '--initial-branch=main'], { encoding: 'utf-8' });
    const emptyConfig = join(repo, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, 'docs/memory/decisions/decision-12.md', decisionDoc('decision-12', 'approved'));
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it('refuses with the exact REQ-SEC-01 message (exit 1), writing nothing', async () => {
    const result = await memoryDeprecateFn()({ root: repo, positional: 'decision-12' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('git identity not configured (user.name/user.email)');
    expect(exitCodeForResult(result)).toBe(1);
    expect(frontmatter(repo, 'docs/memory/decisions/decision-12.md').status).toBe('approved');
  });
});
