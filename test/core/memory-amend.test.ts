/**
 * task-127-add-memory-amend-id-reason-approver-gated-verb — `wingfoil memory amend <id> --reason`,
 * the approver-gated verb that records a content correction without a state change (`dl-108` A1 (a),
 * A2 (i), A3; `spec-008-cli-grammar` §2's `amend` row, `[s → s]`; `spec-010` § Field-write ownership;
 * `spec-001`'s per-type `amendable` key).
 *
 * Exercises the REAL, registered `CORE_MODULES` `memory.memoryAmend` operation — the exact `CoreFn`
 * the CLI command and the MCP Tool dispatch to. Every write lands in a THROWAWAY temp git repo.
 *
 * The fixture's `tech-spec`, `adr` and `release` carry this repository's own machines
 * (`.wingfoil/memory.yaml`): `tech-spec` and `adr` declare `amendable: true` (an `adr` takes dated
 * correction and Revision notes; a changed decision is still a new ADR, `dl-108` A3 — approver ruling
 * at `task-158`, 2026-10-02), `release` declares `amendable: false`, and `note` declares nothing —
 * absent means not amendable.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import { requireAmendableEdit } from '../../src/core/memory-amend';
import * as transition from '../../src/core/memory-transition';
import { coreErr } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1
types:
  tech-spec:
    path: "docs/memory/specs/{id}.md"
    amendable: true
    template:
      file: "memory/templates/tech-spec.md"
      frontmatter:
        required: [title, scope]
        not_applicable_allowed: [scope]
    states:
      sequence: [draft, pending, approved, superseded]
      gates:
        pending: { reject: draft }
      waiting: [approved]
  adr:
    path: "docs/memory/adrs/{id}.md"
    amendable: true
    states:
      sequence: [draft, pending, accepted, superseded]
      gates:
        pending: { reject: draft }
      waiting: [accepted]
  release:
    path: "docs/memory/planning/{id}.md"
    amendable: false
    states:
      sequence: [draft, planning, in-development, releasing, released]
  note:
    path: "docs/memory/note/{id}.md"
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
    - name: reviewer
paths:
  sources: [ src/ ]
`;

const REVIEWER_ONLY_DNA = APPROVER_DNA.replace('roles: [ approver, developer ]', 'roles: [ reviewer, developer ]');

const SPEC = 'docs/memory/specs/spec-001.md';
const ADR = 'docs/memory/adrs/adr-001.md';
const NOTE = 'docs/memory/note/note-1.md';
const RELEASE = 'docs/memory/planning/minor-v0.1.md';

function doc(fields: { id: string; type: string; status: string; title?: string; scope?: string | null }, body = 'Original body.\n'): string {
  const scope = fields.scope === null ? '' : `scope: "${fields.scope ?? 'src/x'}"\n`;
  return `---
id: "${fields.id}"
type: ${fields.type}
title: "${fields.title ?? 'A title'}"
status: ${fields.status}          # auto-set by wingfoil
${scope}tmpl_version: 260703
---

## Specification

${body}`;
}

interface AmendValue {
  readonly id: string;
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

interface HistoryEntry {
  readonly operation: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly approver: string | null;
  readonly reason: string | null;
  readonly subject: string;
}

function operationFn<T>(name: string): CoreFn<unknown, T> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`"${name}" is not registered on the memory module`);
  return operation.fn as CoreFn<unknown, T>;
}
const amend = (): CoreFn<unknown, AmendValue> => operationFn<AmendValue>('memoryAmend');
const history = (): CoreFn<unknown, { entries: readonly HistoryEntry[] }> =>
  operationFn<{ entries: readonly HistoryEntry[] }>('memoryHistory');

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);
const read = (repo: string, path: string): string => readFileSync(join(repo, path), 'utf-8');

describe('CORE_MODULES memory.memoryAmend — task-127 (dl-108)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, SPEC, doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }));
    writeFixtureFile(repo, ADR, doc({ id: 'adr-001', type: 'adr', status: 'accepted' }));
    writeFixtureFile(repo, NOTE, doc({ id: 'note-1', type: 'note', status: 'approved' }));
    writeFixtureFile(repo, RELEASE, doc({ id: 'minor-v0.1', type: 'release', status: 'released' }));
    writeFixtureFile(repo, 'src/other.ts', 'export const a = 1;\n');
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  /** Refusals must leave HEAD where it was and the author's working-tree edit untouched. */
  function expectNothingWritten(before: string, path: string, edited: string): void {
    expect(head(repo)).toBe(before);
    expect(read(repo, path)).toBe(edited);
  }

  describe('AC1 — an uncommitted edit on an approved tech-spec becomes one amend commit', () => {
    it('exits 0 and writes exactly one commit touching only that file, with the declared subject and body', async () => {
      const edited = doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }, 'Corrected body.\n');
      writeFixtureFile(repo, SPEC, edited);
      const before = head(repo);

      const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(exitCodeForResult(result)).toBe(0);
      expect(result.value).toEqual({ id: 'spec-001', path: SPEC, from: 'approved', to: 'approved' });
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
      expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(SPEC);
      const message = gitOut(repo, ['log', '-1', '--format=%B']);
      expect(message).toBe(
        `wf(tech-spec): amend spec-001 [approved → approved]\n\nApprover: ${TEST_NAME} <${TEST_EMAIL}> (approver)\nReason: r`,
      );
      expect(result.commit).toEqual({ sha: head(repo), message });
      // The commit carries the author's bytes verbatim, and nothing is left behind for that file.
      expect(gitOut(repo, ['show', `HEAD:${SPEC}`]) + '\n').toBe(edited);
      expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
    });

    it('task-158: an accepted adr takes a dated correction note as one amend commit, `[accepted → accepted]`', async () => {
      const edited = doc({ id: 'adr-001', type: 'adr', status: 'accepted' }, 'Original body.\n\n> **Correction (2026-10-02) — a fact.**\n');
      writeFixtureFile(repo, ADR, edited);
      const before = head(repo);

      const result = await amend()({ root: repo, positional: 'adr-001', options: { reason: 'a correction note' } });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ id: 'adr-001', path: ADR, from: 'accepted', to: 'accepted' });
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
      expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ADR);
      expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(adr): amend adr-001 [accepted → accepted]');
      expect(gitOut(repo, ['show', `HEAD:${ADR}`]) + '\n').toBe(edited);
    });

    it('may change a frontmatter field other than status (spec-010: amend owns the body and the non-status fields)', async () => {
      writeFixtureFile(repo, SPEC, doc({ id: 'spec-001', type: 'tech-spec', status: 'approved', title: 'Better title' }));
      const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'fix the title' } });
      expect(result.ok).toBe(true);
      expect(gitOut(repo, ['show', `HEAD:${SPEC}`])).toContain('title: "Better title"');
    });

    it('bug-076: an unrelated modified file and an unrelated staged file are left out of the commit, and stay as they were', async () => {
      writeFixtureFile(repo, SPEC, doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }, 'Corrected body.\n'));
      writeFixtureFile(repo, 'src/other.ts', 'export const a = 2;\n');
      writeFixtureFile(repo, 'src/staged.ts', 'export const b = 1;\n');
      gitOut(repo, ['add', 'src/staged.ts']);

      const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });

      expect(result.ok).toBe(true);
      expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(SPEC);
      // Read untrimmed: the leading column of `git status --porcelain` is the index state.
      const status = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf-8' });
      expect(status.split('\n').filter(Boolean).sort()).toEqual([' M src/other.ts', 'A  src/staged.ts']);
    });
  });

  describe('AC2 — refusals, each before anything is written', () => {
    it('no content change → exit 1', async () => {
      const before = head(repo);
      const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toBe(`nothing to amend: ${SPEC} carries no uncommitted change`);
      expect(head(repo)).toBe(before);
    });

    it('a working-tree edit that changes `status` → exit 1 naming the field', async () => {
      const edited = doc({ id: 'spec-001', type: 'tech-spec', status: 'superseded' }, 'Corrected body.\n');
      writeFixtureFile(repo, SPEC, edited);
      const before = head(repo);
      const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain("frontmatter field 'status'");
      expectNothingWritten(before, SPEC, edited);
    });

    it('a working-tree edit that changes `id` → exit 1 naming the field (the element is renamed, not amended)', async () => {
      const edited = doc({ id: 'spec-002', type: 'tech-spec', status: 'approved' }, 'Corrected body.\n');
      writeFixtureFile(repo, SPEC, edited);
      const before = head(repo);
      const result = await amend()({ root: repo, positional: 'spec-002', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain("frontmatter field 'id'");
      expectNothingWritten(before, SPEC, edited);
    });

    it('a working-tree edit that changes `type` → exit 1 naming the field (a new type is a new element)', async () => {
      const edited = doc({ id: 'note-1', type: 'tech-spec', status: 'approved' }, 'Corrected body.\n');
      writeFixtureFile(repo, NOTE, edited);
      const before = head(repo);
      const result = await amend()({ root: repo, positional: 'note-1', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain("frontmatter field 'type'");
      expectNothingWritten(before, NOTE, edited);
    });

    it.each([
      ['a required field removed', { scope: null }, 'scope'],
      ['the title blanked', { title: '' }, 'title'],
      ['a required field blanked', { scope: '  ' }, 'scope'],
    ])(
      'review F1 — spec-010 validation rules: %s on a non-draft document → exit 1 naming the field',
      async (_label, change, field) => {
        const edited = doc({ id: 'spec-001', type: 'tech-spec', status: 'approved', ...change });
        writeFixtureFile(repo, SPEC, edited);
        const before = head(repo);
        const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(exitCodeForResult(result)).toBe(1);
        expect(result.error.message).toBe(`missing required field on amend: ${field}`);
        expectNothingWritten(before, SPEC, edited);
      },
    );

    it('task-168 — a declared field amended to "n/a — <reason>" is kept (the same rule as submit)', async () => {
      writeFixtureFile(repo, SPEC, doc({ id: 'spec-001', type: 'tech-spec', status: 'approved', scope: 'n/a — process-only spec' }));
      const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
      expect(result.ok).toBe(true);
    });

    it.each([
      ['bare `n/a` in a declared field', { scope: 'n/a' }, 'not-applicable value on amend: scope needs a reason, written "n/a — <reason>"'],
      [
        'a not-applicable title',
        { title: 'n/a — none' },
        "not-applicable value on amend: title does not accept one (type 'tech-spec' does not list it in template.frontmatter.not_applicable_allowed)",
      ],
    ])('task-168 — %s on a non-draft document → exit 1 naming the field', async (_label, change, message) => {
      const edited = doc({ id: 'spec-001', type: 'tech-spec', status: 'approved', ...change });
      writeFixtureFile(repo, SPEC, edited);
      const before = head(repo);
      const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toBe(message);
      expectNothingWritten(before, SPEC, edited);
    });

    it('review F1 — a document still in its initial state (draft) may leave a required field empty, as submit allows', async () => {
      writeFixtureFile(repo, 'docs/memory/specs/spec-002.md', doc({ id: 'spec-002', type: 'tech-spec', status: 'draft' }));
      commitAll(repo, 'seed a draft spec');
      writeFixtureFile(repo, 'docs/memory/specs/spec-002.md', doc({ id: 'spec-002', type: 'tech-spec', status: 'draft', scope: null }));
      const result = await amend()({ root: repo, positional: 'spec-002', options: { reason: 'r' } });
      expect(result.ok).toBe(true);
    });

    it.each([
      ['release', 'release: "v0.2"', 'release: "v0.3"', 'owned by assign'],
      ['rejection_reason', '', 'rejection_reason: "a reason"', 'owned by reject'],
      ['supersedes', 'supersedes: ""', 'supersedes: "spec-000"', 'a future engine trigger'],
    ])(
      'approver ruling (b): a working-tree edit that changes `%s` → exit 1 naming the field',
      async (field, committedLine, editedLine) => {
        const withLine = (line: string): string =>
          doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }).replace('tmpl_version:', `${line ? `${line}\n` : ''}tmpl_version:`);
        if (committedLine) {
          writeFixtureFile(repo, SPEC, withLine(committedLine));
          commitAll(repo, 'seed the field');
        }
        const edited = withLine(editedLine);
        writeFixtureFile(repo, SPEC, edited);
        const before = head(repo);
        const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(exitCodeForResult(result)).toBe(1);
        expect(result.error.message).toContain(`frontmatter field '${field}'`);
        expectNothingWritten(before, SPEC, edited);
      },
    );

    it('a caller without approval authority → the same refusal `approve` gives (REQ-SEC-03)', async () => {
      writeFixtureFile(repo, '.wingfoil/dna.yaml', REVIEWER_ONLY_DNA);
      commitAll(repo, 'reviewer-only dna');
      const edited = doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }, 'Corrected body.\n');
      writeFixtureFile(repo, SPEC, edited);
      const before = head(repo);
      const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toBe("user not authorized to approve type 'tech-spec'");
      expectNothingWritten(before, SPEC, edited);
    });

    it.each([
      ['release', 'minor-v0.1', RELEASE, 'declares amendable: false'],
      ['note', 'note-1', NOTE, 'does not declare amendable: true'],
    ])('a type whose memory.yaml entry does not declare itself amendable (%s) → exit 1', async (type, id, path, why) => {
      const status = type === 'release' ? 'released' : 'approved';
      const edited = doc({ id, type, status }, 'Corrected body.\n');
      writeFixtureFile(repo, path, edited);
      const before = head(repo);
      const result = await amend()({ root: repo, positional: id, options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toBe(`type '${type}' is not amendable: its memory.yaml entry ${why}`);
      expectNothingWritten(before, path, edited);
    });

    it('amendability is read from the committed memory.yaml, not the working tree (command-baseline)', async () => {
      writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML.replace('amendable: false', 'amendable: true'));
      const edited = doc({ id: 'minor-v0.1', type: 'release', status: 'released' }, 'Corrected body.\n');
      writeFixtureFile(repo, RELEASE, edited);
      const before = head(repo);
      const result = await amend()({ root: repo, positional: 'minor-v0.1', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      expectNothingWritten(before, RELEASE, edited);
    });

    it.each([
      [undefined, 'missing required argument: --reason'],
      [{}, 'missing required argument: --reason'],
      [{ reason: '   ' }, 'invalid flag value: --reason must not be blank'],
    ])('missing or blank `--reason` → exit 2 (dl-067), before anything is read', async (options, message) => {
      const edited = doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }, 'Corrected body.\n');
      writeFixtureFile(repo, SPEC, edited);
      const before = head(repo);
      let thrown: unknown;
      try {
        await amend()({ root: repo, positional: 'spec-001', options });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(UsageError);
      expect(exitCodeForThrow(thrown)).toEqual({ reason: message, exitCode: 2 });
      expectNothingWritten(before, SPEC, edited);
    });

    it('a missing `<id>` → exit 2', async () => {
      await expect(amend()({ root: repo, options: { reason: 'r' } })).rejects.toBeInstanceOf(UsageError);
    });

    it('a failed commit post-condition is returned as the error, never reported as success', async () => {
      writeFixtureFile(repo, SPEC, doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }, 'Corrected body.\n'));
      const failure = coreErr({ code: 'VALIDATION', message: 'commit abc carries more than the change it declares: probe' });
      const spy = jest.spyOn(transition, 'commitMemoryTransition').mockReturnValue(failure);
      try {
        const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
        expect(result).toBe(failure);
        expect(spy).toHaveBeenCalledWith(repo, expect.objectContaining({ id: 'spec-001' }), expect.any(String), expect.any(String), {}, 'carries-content');
      } finally {
        spy.mockRestore();
      }
    });

    it('a document no file carries → exit 1 with `document not found`', async () => {
      const result = await amend()({ root: repo, positional: 'spec-404', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toBe('document not found: spec-404');
    });

    it('a document no commit contains → exit 1 (a new document is recorded by add and submit)', async () => {
      const path = 'docs/memory/specs/spec-009.md';
      const fresh = doc({ id: 'spec-009', type: 'tech-spec', status: 'approved' });
      writeFixtureFile(repo, path, fresh);
      const before = head(repo);
      const result = await amend()({ root: repo, positional: 'spec-009', options: { reason: 'r' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain(`${path} is not committed at HEAD`);
      expect(result.error.message).toContain('memory add');
      expectNothingWritten(before, path, fresh);
    });

    // task-247: the HEAD preamble now refuses such a document before amend's own check runs, so the
    // check is pinned directly, as the defence it still is.
    it('requireAmendableEdit refuses a path no commit holds, before comparing anything', () => {
      const path = 'docs/memory/specs/spec-009.md';
      const result = requireAmendableEdit(repo, 'spec-009', path, doc({ id: 'spec-009', type: 'tech-spec', status: 'approved' }), []);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain(`nothing to amend: ${path} is not committed at HEAD`);
    });
  });

  it('AC3 — `memory history` lists the amendment with operation "amend", its approver and its reason (P1.10)', async () => {
    writeFixtureFile(repo, SPEC, doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }, 'Corrected body.\n'));
    const amended = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'later evidence corrected §2' } });
    expect(amended.ok).toBe(true);

    const result = await history()({ root: repo, positional: 'spec-001' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.value.entries.find((candidate) => candidate.operation === 'amend');
    expect(entry).toMatchObject({
      operation: 'amend',
      from: 'approved',
      to: 'approved',
      approver: `${TEST_NAME} <${TEST_EMAIL}> (approver)`,
      reason: 'later evidence corrected §2',
      subject: 'wf(tech-spec): amend spec-001 [approved → approved]',
    });
  });
});

describe('CORE_MODULES memory.memoryAmend — REQ-SEC-01 git-identity pre-flight (no configured identity)', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  const saved: Record<string, string | undefined> = {};
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-memamend-noid-'));
    execFileSync('git', ['-C', repo, 'init', '-q', '--initial-branch=main'], { encoding: 'utf-8' });
    const emptyConfig = join(repo, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, SPEC, doc({ id: 'spec-001', type: 'tech-spec', status: 'approved' }));
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it('refuses with the exact REQ-SEC-01 message (exit 1), after the usage checks and before any read', async () => {
    const result = await amend()({ root: repo, positional: 'spec-001', options: { reason: 'r' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('git identity not configured (user.name/user.email)');
    expect(exitCodeForResult(result)).toBe(1);
  });
});

describe('AC4 — `wingfoil memory --help` lists amend', () => {
  it('the memory command has an `amend` subcommand taking <id> and --reason', async () => {
    const program = await buildProgram(CORE_MODULES, { resolveRoot: () => '/unused', buildParams: () => ({}) });
    const memory = program.commands.find((command) => command.name() === 'memory');
    expect(memory?.helpInformation()).toMatch(/^\s+amend\b/m);
    const amendCommand = memory?.commands.find((command) => command.name() === 'amend');
    expect(amendCommand?.helpInformation()).toContain('<id>');
    expect(amendCommand?.helpInformation()).toContain('--reason <text>');
  });
});
