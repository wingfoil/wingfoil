/**
 * P1.3 (US-4-01) — `wingfoil memory add` core-op fit criteria, per
 * `docs/02_requirements/02_bdd/features/p1-memory/P1.3-memory-add.feature`,
 * `spec-006-core-domain-api.md` (`memoryAdd` is `mutates: true`; requireGitIdentity pre-flight),
 * `spec-001-memory-yaml-schema.md` (type registry: `path`, `id_pattern`, `template`),
 * `spec-010-memory-frontmatter-schema.md` (base fields; `add` sets `id`/`status: draft`/`title`),
 * `spec-005-cli-command-contract.md` / `spec-008-cli-grammar.md` (exit codes: unknown type -> 1,
 * missing required arg -> 2), task-020-implement-memory-add.
 *
 * Exercises the REAL, registered `CORE_MODULES` `memory.memoryAdd` operation — the first Memory
 * document mutation, the exact same `CoreFn` both `src/cli`'s `memory add` command and the MCP
 * `memory.add` Tool call. Every write lands in a THROWAWAY temp git repo (never this repo's own
 * `docs/04_memory/`).
 *
 * The `--type decision` fixture type below matches the BDD Background's placeholder type verbatim
 * (the BDD declares a type literally named `decision`); `memory add` resolves `--type` against
 * whatever `memory.yaml` declares, so it is type-agnostic (no hardcoded `decision`->`decision-log`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult } from '../../src/core/exit-code';
import { UsageError } from '../../src/core/usage-error';
import { makeTempGitRepo, removeTempDir, writeFixtureFile, commitAll } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const MEMORY_YAML = `version: 1
types:
  decision:
    path: "docs/memory/decision/{id}.md"
    id_pattern: "decision-{n}-{slug}"
    template:
      file: "memory/templates/decision.md"
      frontmatter:
        required: [id, type, title, status]
  note:
    path: "docs/memory/note/{id}.md"
    id_pattern: "note-{slug}"
    template:
      file: "memory/templates/note.md"
      frontmatter:
        required: [id, type, title, status]
  needs-version:
    path: "docs/memory/nv/{id}.md"
    id_pattern: "nv-{version}"
    template:
      file: "memory/templates/note.md"
      frontmatter:
        required: [id, type, title, status]
  unresolved-path:
    path: "docs/memory/{release}/{id}.md"
    id_pattern: "up-{slug}"
    template:
      file: "memory/templates/note.md"
      frontmatter:
        required: [id, type, title, status]
  bare:
    path: "docs/memory/bare/{id}.md"
`;

const DECISION_TEMPLATE = `---
id: ""
type: decision
title: ""
status: draft
tmpl_version: 260101
tags: []
---

<!-- decision body. \`wingfoil memory add\` copies this scaffold verbatim. -->
`;

const NOTE_TEMPLATE = `---
id: ""
type: note
title: ""
status: draft
---

<!-- note body -->
`;

/** The real, registered `memory.memoryAdd` `CoreFn` — fails loudly if a future change un-registers it. */
function memoryAddFn(): CoreFn<unknown, { id: string; path: string }> {
  const memoryModule = CORE_MODULES.find((module) => module.name === 'memory');
  const operation = memoryModule?.operations.memoryAdd;
  if (!operation) throw new Error('fixture bug: "memoryAdd" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, { id: string; path: string }>;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}
function changedFiles(repo: string): string {
  return execFileSync('git', ['-C', repo, 'show', '--name-only', '--format=', 'HEAD'], { encoding: 'utf-8' }).trim();
}
function subject(repo: string): string {
  return execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim();
}

describe('CORE_MODULES memory.memoryAdd — P1.3 fit criteria (repo with a configured identity)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/decision.md', DECISION_TEMPLATE);
    writeFixtureFile(repo, '.wingfoil/memory/templates/note.md', NOTE_TEMPLATE);
    commitAll(repo, 'seed memory.yaml + templates');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('AC(a): creates a draft file under the type path with a generated id, one scoped commit, exit 0, returns the id', async () => {
    const before = head(repo);
    const result = await memoryAddFn()({ root: repo, options: { type: 'decision', title: 'Use PostgreSQL' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Prints/returns the new id (spec-008 §5) — deterministic from the title slug (REQ-SYS-07).
    expect(result.value.id).toBe('decision-001-use-postgresql');
    expect(result.value.path).toBe('docs/memory/decision/decision-001-use-postgresql.md');
    expect(exitCodeForResult(result)).toBe(0);

    // File created under the type's path, in draft state, with the generated id.
    const filePath = join(repo, 'docs/memory/decision/decision-001-use-postgresql.md');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('id: decision-001-use-postgresql');
    expect(content).toContain('status: draft');
    expect(content).toContain('title: "Use PostgreSQL"');
    // tmpl_version copied from the scaffold verbatim (spec-010: not touched by add).
    expect(content).toContain('tmpl_version: 260101');
    // Body placeholder copied verbatim (P1.3 memory.add).
    expect(content).toContain('<!-- decision body.');

    // Exactly one commit, scoped to the one new file, subject `wf(<type>): add <id>` (memory-op commit convention, P1.7).
    expect(result.commit?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.commit?.sha).toBe(head(repo));
    expect(head(repo)).not.toBe(before);
    expect(result.commit?.message).toBe('wf(decision): add decision-001-use-postgresql');
    expect(subject(repo)).toBe('wf(decision): add decision-001-use-postgresql');
    expect(changedFiles(repo)).toBe('docs/memory/decision/decision-001-use-postgresql.md');
  });

  it('generates a unique id per add: a numeric-token type increments its counter deterministically', async () => {
    const first = await memoryAddFn()({ root: repo, options: { type: 'decision', title: 'Use PostgreSQL' } });
    const second = await memoryAddFn()({ root: repo, options: { type: 'decision', title: 'Use Redis' } });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.id).toBe('decision-001-use-postgresql');
    expect(second.value.id).toBe('decision-002-use-redis');
    // Two distinct files, two distinct commits.
    expect(readdirSync(join(repo, 'docs/memory/decision')).sort()).toEqual([
      'decision-001-use-postgresql.md',
      'decision-002-use-redis.md',
    ]);
  });

  it('a slug-only id_pattern (no numeric token) needs no counter and derives the id from the title alone', async () => {
    const result = await memoryAddFn()({ root: repo, options: { type: 'note', title: 'Keep It Simple' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('note-keep-it-simple');
    expect(existsSync(join(repo, 'docs/memory/note/note-keep-it-simple.md'))).toBe(true);
  });

  it('--tags "a,b" is written as a YAML flow sequence in the created frontmatter', async () => {
    const result = await memoryAddFn()({
      root: repo,
      options: { type: 'decision', title: 'Tagged', tags: 'infra,db' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const content = readFileSync(join(repo, 'docs/memory/decision', `${result.value.id}.md`), 'utf-8');
    expect(content).toContain('tags: ["infra","db"]');
  });

  it('AC(b): an undefined type writes no file, exits 1, with the exact BDD message', async () => {
    const before = head(repo);
    const result = await memoryAddFn()({ root: repo, options: { type: 'unicorn', title: 'X' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe("unknown memory type 'unicorn' (not defined in memory.yaml)");
    expect(exitCodeForResult(result)).toBe(1);
    // Nothing written, no commit.
    expect(head(repo)).toBe(before);
    expect(existsSync(join(repo, 'docs/memory/unicorn'))).toBe(false);
  });

  it('AC(c): a missing --title throws a UsageError (exit 2), writing no file and making no commit', async () => {
    const before = head(repo);
    await expect(memoryAddFn()({ root: repo, options: { type: 'decision' } })).rejects.toBeInstanceOf(UsageError);
    try {
      await memoryAddFn()({ root: repo, options: { type: 'decision' } });
      throw new Error('expected a UsageError');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).message).toBe('missing required argument: --title');
      expect((error as UsageError).exitCode).toBe(2);
    }
    expect(head(repo)).toBe(before);
    expect(existsSync(join(repo, 'docs/memory/decision'))).toBe(false);
  });

  it('an id_pattern the title cannot satisfy is a logic error (ValidationError -> VALIDATION, exit 1), not a crash', async () => {
    // `nv-{version}` needs a `{version}` value `memory add` does not supply from a title — `generateId`
    // throws a ValidationError, which the op maps to a CoreResult.error (exit 1), never an escaped throw.
    const before = head(repo);
    const result = await memoryAddFn()({ root: repo, options: { type: 'needs-version', title: 'X' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
  });

  it('an unresolved path placeholder (a workflow-seeded type) is a StorageError -> IO (exit 1), writing nothing', async () => {
    // `docs/memory/{release}/{id}.md` needs a `{release}` the bare CLI add cannot supply — the confined
    // path resolver throws a StorageError, mapped to a CoreResult.error (exit 1), before any write.
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);
    const result = await memoryAddFn()({ root: repo, options: { type: 'unresolved-path', title: 'X' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('IO');
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('a type declared without an id_pattern/template is a config VALIDATION error (exit 1), not a crash', async () => {
    const result = await memoryAddFn()({ root: repo, options: { type: 'bare', title: 'X' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('a missing --type is likewise a usage error (exit 2), before any registry lookup', async () => {
    await expect(memoryAddFn()({ root: repo, options: { title: 'X' } })).rejects.toBeInstanceOf(UsageError);
    try {
      await memoryAddFn()({ root: repo, options: { title: 'X' } });
      throw new Error('expected a UsageError');
    } catch (error) {
      expect((error as UsageError).message).toBe('missing required argument: --type');
      expect((error as UsageError).exitCode).toBe(2);
    }
  });
});

describe('CORE_MODULES memory.memoryAdd — REQ-SEC-01 git-identity pre-flight (no configured identity)', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  let repo: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-memadd-noid-'));
    execFileSync('git', ['-C', repo, 'init', '-q', '--initial-branch=main'], { encoding: 'utf-8' });
    const emptyConfig = join(repo, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/decision.md', DECISION_TEMPLATE);
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it('refuses with the exact REQ-SEC-01 message (CoreResult.error VALIDATION -> exit 1), writing nothing', async () => {
    const unchanged = snapshotPersistence(repo);
    const result = await memoryAddFn()({ root: repo, options: { type: 'decision', title: 'Use PostgreSQL' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toBe('git identity not configured (user.name/user.email)');
    expect(exitCodeForResult(result)).toBe(1);
    expect(existsSync(join(repo, 'docs/memory/decision'))).toBe(false);
    assertPersistenceUnchanged(repo, unchanged);
  });
});
