/**
 * task-132 AC1 (`bug-149`, `dl-064` B.1, REQ-SEC-01/REQ-SEC-03, P1.7/P1.8): an approver-gated verb
 * uses ONE identity for the authority check, the `Approver:` line and the commit author — never two.
 *
 * Before task-132 the authority check and the `Approver:` line read `git config user.*`, while the
 * commit was authored by git's own precedence, which puts `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` first.
 * With the environment naming someone other than `user.email`, an approval could be authorized for
 * one principal and recorded under another.
 *
 * The rule (stated in `spec-006` §7): the identity is resolved once, the way `git commit` resolves
 * its author — `GIT_AUTHOR_*`, then `author.*`, then `user.*` — and that one value gates authority,
 * fills the `Approver:` line and is pinned as the commit's `--author`.
 *
 * Every case runs in a THROWAWAY temp git repo against the REAL registered `CORE_MODULES` operations.
 * `process.env` is set per case and restored afterwards, so the suite asserts the invariant on any
 * machine (testing directive T2), whatever identity the host itself carries.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  note:
    path: "docs/memory/note/{id}.md"
    amendable: true
`;

/** The identity `makeTempGitRepo` writes to the repository's own `user.*` config. */
const CONFIG = { name: 'WingFoil Test', email: 'wf-test@example.invalid' } as const;
/** The identity supplied through git's `GIT_AUTHOR_*` environment variables. */
const ENV = { name: 'Env Author', email: 'env-author@example.invalid' } as const;

function dna(approver: { name: string; email: string }, developer: { name: string; email: string }): string {
  return `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${approver.name}
      email: ${approver.email}
      roles: [ approver ]
    - name: ${developer.name}
      email: ${developer.email}
      roles: [ developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;
}

function note(id: string, status: string, body = 'Original body.\n'): string {
  return `---
id: "${id}"
type: note
title: "A note"
status: ${status}
tmpl_version: 260703
---

## Body

${body}`;
}

function operation(name: string): CoreFn<unknown, unknown> {
  const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!op) throw new Error(`fixture bug: "${name}" is not registered on the memory module`);
  return op.fn;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

const ENV_KEYS = ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL'] as const;

interface GatedCase {
  readonly verb: string;
  readonly op: string;
  readonly id: string;
  /** Prepare the working tree the verb needs beyond the committed fixture (amend's uncommitted edit). */
  readonly prepare?: (repo: string) => void;
}

const GATED: readonly GatedCase[] = [
  { verb: 'approve', op: 'memoryApprove', id: 'note-pending' },
  { verb: 'reject', op: 'memoryReject', id: 'note-pending' },
  {
    verb: 'amend',
    op: 'memoryAmend',
    id: 'note-approved',
    prepare: (repo) =>
      writeFileSync(join(repo, 'docs/memory/note/note-approved.md'), note('note-approved', 'approved', 'Amended body.\n')),
  },
];

/** The `Approver:` line's `Name <email>` as committed, or `null` when the commit carries none. */
function approverOf(repo: string): string | null {
  const line = gitOut(repo, ['log', '-1', '--format=%B']).split('\n').find((l) => l.startsWith('Approver: '));
  if (line === undefined) return null;
  return line.slice('Approver: '.length).replace(/ \(approver\)$/, '');
}

const authorOf = (repo: string): string => gitOut(repo, ['log', '-1', '--format=%an <%ae>']);

describe('task-132 AC1 — one identity for the authority check, the Approver: line and the author', () => {
  let repo: string;
  const saved: Record<string, string | undefined> = {};

  function setUp(dnaYaml: string): void {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml);
    writeFixtureFile(repo, 'docs/memory/note/note-pending.md', note('note-pending', 'pending'));
    writeFixtureFile(repo, 'docs/memory/note/note-approved.md', note('note-approved', 'approved'));
    writeFixtureFile(repo, 'docs/memory/note/note-draft.md', note('note-draft', 'draft'));
    commitAll(repo, 'fixture');
    // Only now: the fixture commit itself is authored by the configured identity.
    process.env.GIT_AUTHOR_NAME = ENV.name;
    process.env.GIT_AUTHOR_EMAIL = ENV.email;
  }

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    removeTempDir(repo);
  });

  describe.each(GATED)('memory $verb', ({ op, id, prepare }) => {
    it('never records an approval under an identity other than the one it authorized (generic AC1 form)', async () => {
      // The configured identity is the approver; the environment names a non-approver.
      setUp(dna(CONFIG, ENV));
      prepare?.(repo);
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      const unchanged = snapshotPersistence(repo);

      const result = (await operation(op)({ root: repo, positional: id, options: { reason: 'Looks right.' } })) as CoreResult<unknown>;

      if (result.ok) {
        expect(approverOf(repo)).toBe(authorOf(repo));
      } else {
        expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
      }
      assertPersistenceUnchanged(repo, unchanged);
    });

    it('checks authority against the GIT_AUTHOR_* identity git would author with, and refuses when it is not an approver', async () => {
      setUp(dna(CONFIG, ENV));
      prepare?.(repo);
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      const unchanged = snapshotPersistence(repo);

      const result = (await operation(op)({ root: repo, positional: id, options: { reason: 'Looks right.' } })) as CoreResult<unknown>;

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: expect.stringMatching(/^user not authorized to approve type 'note'/) } });
      expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
      assertPersistenceUnchanged(repo, unchanged);
    });

    it('authorizes, records and authors as the GIT_AUTHOR_* identity when that identity is the approver', async () => {
      // The environment names the approver; the configured identity is a mere developer.
      setUp(dna(ENV, CONFIG));
      prepare?.(repo);

      const result = (await operation(op)({ root: repo, positional: id, options: { reason: 'Looks right.' } })) as CoreResult<unknown>;

      expect(result.ok).toBe(true);
      expect(approverOf(repo)).toBe(`${ENV.name} <${ENV.email}>`);
      expect(authorOf(repo)).toBe(`${ENV.name} <${ENV.email}>`);
    });
  });

  it('pins the author of the non-gated transition verbs (submit, deprecate) to the same resolved identity', async () => {
    setUp(dna(CONFIG, ENV));

    expect(((await operation('memorySubmit')({ root: repo, positional: 'note-draft' })) as CoreResult<unknown>).ok).toBe(true);
    expect(authorOf(repo)).toBe(`${ENV.name} <${ENV.email}>`);

    expect(((await operation('memoryDeprecate')({ root: repo, positional: 'note-approved' })) as CoreResult<unknown>).ok).toBe(true);
    expect(authorOf(repo)).toBe(`${ENV.name} <${ENV.email}>`);
  });
});
