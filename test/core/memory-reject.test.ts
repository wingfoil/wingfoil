/**
 * P1.8 (US-4-11) — `wingfoil memory reject` core-op fit criteria, per
 * `docs/02_requirements/02_bdd/features/p1-memory/P1.8-memory-reject.feature`,
 * `spec-001-memory-yaml-schema` (a `reject` target is the type's `gates.<state>.reject`, taken
 * verbatim), `spec-010-memory-frontmatter-schema` (reject is the ONE verb that writes a second field:
 * `status` **and** `rejection_reason`, set to the exact `--reason` text; the next `memory.submit`
 * clears it), `spec-004-mcp-surface-contract` §4.3 + `dl-054-submit-commit-subject-bracket` (an
 * approver-gated verb's subject carries `[from → to]`, and its body the mandatory `Approver:` /
 * `Reason:` lines — CLAUDE.md §5.1, P1.7/P1.8), `spec-008-cli-grammar` §2/§5/§7, REQ-SEC-01
 * (git identity), REQ-SEC-03 (`user not authorized to approve type '<type>'`), REQ-SEC-04
 * (`--reason` mandatory) and `dl-032`/`dl-053` (the illegal-transition contract message, exit `1`).
 *
 * Exercises the REAL, registered `CORE_MODULES` `memory.memoryReject` operation — the exact `CoreFn`
 * the CLI command and the MCP Tool dispatch to. Every write lands in a THROWAWAY temp git repo.
 *
 * The `task` fixture type carries the REAL `task` state machine from `.wingfoil/memory.yaml`
 * (two gates, `pending -> draft` and `in-review -> in-progress`), so both reject edges this project
 * actually runs are exercised, not just the default machine's single one.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import { UsageError } from '../../src/core/usage-error';
import { parseCommitReason } from '../../src/memory/audit';
import { normalizeReason } from '../../src/memory/commit-message';
import { splitFrontmatter } from '../../src/storage';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  task:
    path: "docs/memory/{release}/{id}.md"
    template:
      file: "memory/templates/task.md"
      frontmatter:
        required: [title, release]
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
      waiting: [backlog, approved]
  note:
    path: "docs/memory/note/{id}.md"
`;

/** `makeTempGitRepo`'s local identity holds the `approver` role; a second member deliberately does not. */
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
    - name: Reviewer Ray
      email: ray@example.invalid
      roles: [ reviewer ]
  roles:
    - name: approver
    - name: developer
    - name: reviewer
paths:
  sources: [ src/ ]
`;

interface RejectValue {
  readonly id: string;
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

/** The real, registered `memory.memoryReject` `CoreFn` — fails loudly if a future change un-registers it. */
function memoryRejectFn(): CoreFn<unknown, RejectValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryReject;
  if (!operation) throw new Error('fixture bug: "memoryReject" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, RejectValue>;
}

function memorySubmitFn(): CoreFn<unknown, { to: string }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memorySubmit;
  if (!operation) throw new Error('fixture bug: "memorySubmit" operation not registered');
  return operation.fn as CoreFn<unknown, { to: string }>;
}

function memoryHistoryFn(): CoreFn<
  unknown,
  { entries: { operation: string | null; from: string | null; to: string | null; reason: string | null }[] }
> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryHistory;
  if (!operation) throw new Error('fixture bug: "memoryHistory" operation not registered');
  return operation.fn as CoreFn<
    unknown,
    { entries: { operation: string | null; from: string | null; to: string | null; reason: string | null }[] }
  >;
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

function taskDoc(fields: { id: string; status: string; title?: string; release?: string; extra?: string }): string {
  return `---
id: "${fields.id}"          # auto-generated by wingfoil
type: task
title: "${fields.title ?? 'A task'}"   # REQUIRED
status: ${fields.status}          # auto-set by wingfoil
release: "${fields.release ?? 'v0.2'}"   # REQUIRED
${fields.extra ?? ''}tmpl_version: 260703
---

## Description

Real content.
`;
}

describe('CORE_MODULES memory.memoryReject — P1.8 fit criteria', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, 'docs/memory/v0.2/task-101.md', taskDoc({ id: 'task-101', status: 'pending' }));
    writeFixtureFile(repo, 'docs/memory/v0.2/task-200.md', taskDoc({ id: 'task-200', status: 'draft' }));
    writeFixtureFile(repo, 'docs/memory/v0.2/task-300.md', taskDoc({ id: 'task-300', status: 'in-review' }));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('P1.8 sc.1: `--reason` sends a pending document back to draft, records the reason in frontmatter AND in one scoped commit, exit 0', async () => {
    const before = head(repo);
    const result = await memoryRejectFn()({
      root: repo,
      positional: 'task-101',
      positionals: ['task-101'],
      options: { reason: 'tests missing' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value).toEqual({
      id: 'task-101',
      path: 'docs/memory/v0.2/task-101.md',
      from: 'pending',
      to: 'draft',
      reason: 'tests missing',
    });

    // spec-010 field-write ownership: `status` AND `rejection_reason`, nothing else; the inline
    // comments and every other byte survive (the edit is line-based, never a re-serialization).
    const content = readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8');
    expect(content).toBe(
      taskDoc({ id: 'task-101', status: 'pending' })
        .replace('status: pending', 'status: draft')
        .replace('tmpl_version: 260703', 'tmpl_version: 260703\nrejection_reason: "tests missing"'),
    );

    // dl-054 + CLAUDE.md §5.1: bracketed subject, mandatory `Approver:` and `Reason:` body lines.
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).toBe(
      `wf(task): reject task-101 [pending → draft]\n\nApprover: WingFoil Test <wf-test@example.invalid> (approver)\nReason: tests missing${STAMP_TRAILER}`,
    );
    expect(result.commit?.sha).toBe(head(repo));
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe('docs/memory/v0.2/task-101.md');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('bug-027: an unrelated STAGED change is not swept into the `wf(task): reject` commit', async () => {
    writeFixtureFile(repo, 'other.txt', 'unrelated work');
    gitOut(repo, ['add', 'other.txt']);
    const result = await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'x' } });
    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe('docs/memory/v0.2/task-101.md');
    expect(gitOut(repo, ['diff', '--cached', '--name-only'])).toBe('other.txt');
  });

  it('spec-001: the target is the gate\'s `reject` value verbatim — `in-review -> in-progress`, not back to draft', async () => {
    const result = await memoryRejectFn()({ root: repo, positional: 'task-300', options: { reason: 'coverage dropped' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ from: 'in-review', to: 'in-progress' });
    expect(frontmatter(repo, 'docs/memory/v0.2/task-300.md')).toMatchObject({
      status: 'in-progress',
      rejection_reason: 'coverage dropped',
    });
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(task): reject task-300 [in-review → in-progress]');
  });

  it('a type without its own machine falls back to `defaults.states` (REQ-STATE-08): pending -> draft', async () => {
    writeFixtureFile(repo, 'docs/memory/note/note-1.md', '---\nid: note-1\ntype: note\ntitle: "N"\nstatus: pending\n---\nbody\n');
    commitAll(repo, 'seed note');
    const result = await memoryRejectFn()({ root: repo, positional: 'note-1', options: { reason: 'nope' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ from: 'pending', to: 'draft' });
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(note): reject note-1 [pending → draft]');
  });

  it('P1.8 sc.2: rejecting a document that is not in a gate state leaves it unchanged and exits 1', async () => {
    const before = head(repo);
    const original = readFileSync(join(repo, 'docs/memory/v0.2/task-200.md'), 'utf-8');
    const result = await memoryRejectFn()({ root: repo, positional: 'task-200', options: { reason: 'x' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_TRANSITION');
    expect(exitCodeForResult(result)).toBe(1);
    // The message is the REQ-STATE-01 / dl-032 contract string, NOT P1.8 sc.2's machine-specific
    // wording (see this task's design notes, "SPEC CONFLICT"). `<to>` is `(none)`: `reject` has no
    // edge from `draft` (task-181, bug-165).
    expect(result.error.message).toBe("illegal transition draft -> (none) for type 'task'");
    // The engine's explanation still rides as the issue detail (dl-032 option c).
    expect((result.error.details as { issues: { detail?: string }[] }).issues[0]?.detail).toContain('`reject` is only legal from a gate');
    expect(readFileSync(join(repo, 'docs/memory/v0.2/task-200.md'), 'utf-8')).toBe(original);
    expect(head(repo)).toBe(before);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it('P1.8 sc.3: omitting `--reason` is a usage error (exit 2, REQ-SEC-04) and the state is unchanged', async () => {
    const before = head(repo);
    const original = readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8');
    for (const options of [undefined, {}, { tag: 'x' }]) {
      await expect(memoryRejectFn()({ root: repo, positional: 'task-101', options })).rejects.toBeInstanceOf(UsageError);
      try {
        await memoryRejectFn()({ root: repo, positional: 'task-101', options });
      } catch (error) {
        expect(exitCodeForThrow(error)).toEqual({ reason: 'missing required argument: --reason', exitCode: 2 });
      }
    }
    expect(readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8')).toBe(original);
    expect(head(repo)).toBe(before);
  });

  it('a missing or blank `<id>` is a usage error (exit 2) — spec-008 §5/§7', async () => {
    for (const positional of [undefined, '  ']) {
      await expect(memoryRejectFn()({ root: repo, positional, options: { reason: 'x' } })).rejects.toBeInstanceOf(UsageError);
      try {
        await memoryRejectFn()({ root: repo, positional, options: { reason: 'x' } });
      } catch (error) {
        expect(exitCodeForThrow(error)).toEqual({ reason: 'missing required argument: <id>', exitCode: 2 });
      }
    }
  });

  it('a non-existent document exits 1 with `document not found: task-999`', async () => {
    const before = head(repo);
    const result = await memoryRejectFn()({ root: repo, positional: 'task-999', options: { reason: 'x' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe('document not found: task-999');
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
  });

  it('REQ-SEC-03: a principal holding no `approver` role is refused (exit 1) and nothing is written', async () => {
    gitOut(repo, ['config', 'user.email', 'ray@example.invalid']);
    gitOut(repo, ['config', 'user.name', 'Reviewer Ray']);
    const before = head(repo);
    const original = readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8');
    const result = await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'x' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toBe("user not authorized to approve type 'task'");
    expect(exitCodeForResult(result)).toBe(1);
    expect(readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8')).toBe(original);
    expect(head(repo)).toBe(before);
  });

  it('REQ-SEC-03: an email matching no `team.members` entry at all is refused the same way', async () => {
    gitOut(repo, ['config', 'user.email', 'stranger@example.invalid']);
    const result = await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'x' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("user not authorized to approve type 'task'");
  });

  /**
   * Amended by `task-072-fix-reason-trailer-contract` (`dl-067-reason-trailer-contract` clause 3,
   * ratified). This case used to assert that `rejection_reason` kept the text "byte-for-byte as the
   * user typed it" while the commit body got it `.trimEnd()`-ed — and in doing so it PINNED the
   * divergence between this verb's two sinks: git's `cleanup=whitespace` strips the trailing spaces
   * on the way into the commit, nothing stripped them on the way into the frontmatter, so the
   * authoritative audit record and its frontmatter mirror disagreed about what the reason was.
   *
   * dl-067 replaces spec-008 §2's "Recorded verbatim" with a DECLARED normal form, applied once at
   * the boundary (`requireReason`), so both sinks now carry the same bytes. The YAML-safety property
   * this case exists for — quotes, colons, `#`, newlines, a leading `-` and unicode all surviving
   * `setFrontmatterField` — is unchanged and still asserted.
   */
  it('spec-008 §2 + dl-067 clause 3: an arbitrary reason round-trips YAML-safely, and both sinks carry the SAME declared normal form', async () => {
    const reason = '- "quoted": yes # not a comment\nline two: \\ ünïcode  ';
    const recorded = normalizeReason(reason);
    expect(recorded).toBe('- "quoted": yes # not a comment\nline two: \\ ünïcode');

    const result = await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason } });
    expect(result.ok).toBe(true);
    // Parsed back through the project's own YAML reader: every awkward character survives.
    expect(frontmatter(repo, 'docs/memory/v0.2/task-101.md').rejection_reason).toBe(recorded);
    // And the commit body records exactly the same text — no `trimEnd()` gap between the two.
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).toContain(`Reason: ${recorded}`);
    expect(parseCommitReason(gitOut(repo, ['log', '-1', '--format=%b']))).toBe(recorded);
  });

  it('a reason that looks like a YAML-typed word or a number stays a string', async () => {
    const result = await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'no' } });
    expect(result.ok).toBe(true);
    expect(frontmatter(repo, 'docs/memory/v0.2/task-101.md').rejection_reason).toBe('no');
  });

  it('bug-041 G1: writing over an EMPTY, commented `rejection_reason:` keeps a space before the comment', async () => {
    writeFixtureFile(
      repo,
      'docs/memory/v0.2/task-400.md',
      taskDoc({ id: 'task-400', status: 'pending', extra: 'rejection_reason:   # set by memory.reject\n' }),
    );
    commitAll(repo, 'seed 400');
    const result = await memoryRejectFn()({ root: repo, positional: 'task-400', options: { reason: 'needs tests' } });
    expect(result.ok).toBe(true);
    const content = readFileSync(join(repo, 'docs/memory/v0.2/task-400.md'), 'utf-8');
    // The byte that matters: a `#` must be separated from the value by whitespace, or a conforming
    // YAML parser stricter than js-yaml rejects the document WingFoil just committed.
    expect(content).toContain('rejection_reason: "needs tests" # set by memory.reject\n');
    expect(content).not.toContain('"# set by memory.reject');
    expect(frontmatter(repo, 'docs/memory/v0.2/task-400.md').rejection_reason).toBe('needs tests');
  });

  it('a second reject overwrites the previous `rejection_reason` rather than appending a second key', async () => {
    await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'first' } });
    await memorySubmitFn()({ root: repo, positional: 'task-101' });
    const second = await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'second' } });
    expect(second.ok).toBe(true);
    const content = readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8');
    expect(content.match(/^rejection_reason:/gm)).toHaveLength(1);
    expect(frontmatter(repo, 'docs/memory/v0.2/task-101.md').rejection_reason).toBe('second');
  });

  it('spec-010 round-trip: the next `memory.submit` clears `rejection_reason` and restores the byte-identical document', async () => {
    const original = readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8');
    expect((await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'tests missing' } })).ok).toBe(true);
    expect((await memorySubmitFn()({ root: repo, positional: 'task-101' })).ok).toBe(true);
    expect(readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8')).toBe(original);
  });

  it('`memory history` reads the reject back as operation `reject`, pending -> draft, with its reason (P1.10 round-trip)', async () => {
    await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'tests missing' } });
    const history = await memoryHistoryFn()({ root: repo, positional: 'task-101' });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    const last = history.value.entries[history.value.entries.length - 1];
    expect(last).toMatchObject({ operation: 'reject', from: 'pending', to: 'draft', reason: 'tests missing' });
  });
});

describe('CORE_MODULES memory.memoryReject — REQ-SEC-01 git-identity pre-flight (no configured identity)', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  const saved: Record<string, string | undefined> = {};
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-memreject-noid-'));
    execFileSync('git', ['-C', repo, 'init', '-q', '--initial-branch=main'], { encoding: 'utf-8' });
    const emptyConfig = join(repo, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, 'docs/memory/v0.2/task-101.md', taskDoc({ id: 'task-101', status: 'pending' }));
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it('refuses with the exact REQ-SEC-01 message (exit 1) before any authority check, writing nothing', async () => {
    const result = await memoryRejectFn()({ root: repo, positional: 'task-101', options: { reason: 'x' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('git identity not configured (user.name/user.email)');
    expect(exitCodeForResult(result)).toBe(1);
    expect(readFileSync(join(repo, 'docs/memory/v0.2/task-101.md'), 'utf-8')).toContain('status: pending');
  });
});
