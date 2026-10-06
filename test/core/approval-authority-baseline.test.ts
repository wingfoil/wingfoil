/**
 * task-090-fix-approval-authority-baseline / `bug-079-uncommitted-dna-yaml-grants-approval-authority`
 * — **approval authority is resolved from the COMMITTED `.wingfoil/dna.yaml`, never from the working
 * tree** (REQ-SEC-03, `adr-006-git-identity-role-based-authz`, P1.7).
 *
 * The defect this pins: `requireApprovalAuthority` read the `dna.yaml` on disk, so an uncommitted
 * edit granting the live git identity the `approver` role was enough for `memory approve` to proceed
 * and write `Approver: <name> <email> (approver)` into a permanent commit — while `git show
 * <that-sha>:.wingfoil/dna.yaml`, the repository's own record at that very commit, still said the
 * identity held no such role. `task-088`'s guard does not reach it, by design: that guard is
 * per-path and refuses a modified **element**, and `dna.yaml` is a different path (its review summary
 * says so in as many words).
 *
 * Exercises the REAL, registered `CORE_MODULES` memory operations — the exact `CoreFn`s the CLI
 * command and the MCP Tool dispatch to — in THROWAWAY temp git repositories. The sibling suite
 * `test/cli/approval-authority-baseline.integration.test.ts` pins the same behaviour through the
 * compiled `dist/cli.js`, where the exit code and the stderr text are observable.
 *
 * Determinism (REQ-SYS-07): fixed fixture texts, fixed identity, fixed step order; nothing asserted
 * depends on a clock, on randomness, or on the temp directory name.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

/** The git identity `makeTempGitRepo` configures — the principal every case below runs as. */
const TEST_EMAIL = 'wf-test@example.invalid';
const TEST_NAME = 'WingFoil Test';

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  adr:
    path: "docs/memory/adr/{id}.md"
`;

/** `.wingfoil/dna.yaml` as \`wingfoil init\` scaffolds its team: nobody is an approver. */
const NO_MEMBERS_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members: []
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

/** The same file with the fixture's git identity seeded as an approver — the bootstrap edit (AC4). */
const APPROVER_DNA = NO_MEMBERS_DNA.replace(
  '  members: []',
  `  members:\n    - name: ${TEST_NAME}\n      email: ${TEST_EMAIL}\n      roles: [ developer, approver ]`,
);

/** The same seeded member, with the `approver` role withdrawn. */
const DEVELOPER_ONLY_DNA = APPROVER_DNA.replace('roles: [ developer, approver ]', 'roles: [ developer ]');

const DNA_PATH = '.wingfoil/dna.yaml';
const DOC_PATH = 'docs/memory/adr/adr-001.md';

interface TransitionValue {
  readonly id: string;
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

/** The real, registered memory `CoreFn` — fails loudly if a future change un-registers it. */
function memoryFn(name: 'memoryApprove' | 'memoryReject' | 'memorySubmit' | 'memoryDeprecate'): CoreFn<unknown, TransitionValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return operation.fn as CoreFn<unknown, TransitionValue>;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

function adrDoc(status: string): string {
  return `---
id: "adr-001"
type: adr
title: "An ADR"
status: ${status}
---

## Context

Real content.
`;
}

/** A repo whose committed state holds `dna`, plus a `pending` ADR ready to be approved. */
function seedRepo(dna: string): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(repo, DNA_PATH, dna);
  writeFixtureFile(repo, DOC_PATH, adrDoc('pending'));
  commitAll(repo, 'seed');
  return repo;
}

/** Overwrite the working-tree `dna.yaml` WITHOUT committing it — the whole defect in one line. */
function writeUncommittedDna(repo: string, dna: string): void {
  writeFileSync(join(repo, DNA_PATH), dna, 'utf-8');
  expect(gitOut(repo, ['status', '--porcelain', '--', DNA_PATH])).not.toBe('');
}

describe('approval authority is resolved from the committed dna.yaml (bug-079, REQ-SEC-03)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  // AC6 + AC3 — red-first: today this approve exits 0 and writes the `Approver:` line.
  it('AC3/AC6: an UNCOMMITTED grant of `approver` does not authorize `approve` — exit 1, nothing written', async () => {
    repo = seedRepo(NO_MEMBERS_DNA);
    writeUncommittedDna(repo, APPROVER_DNA);
    const before = head(repo);

    const unchanged = snapshotPersistence(repo);
    const result = await memoryFn('memoryApprove')({
      root: repo,
      positional: 'adr-001',
      options: { reason: 'authority from an uncommitted file' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // spec-005 §1: a well-formed invocation failing a repository-state precondition — 1, never 2.
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.code).toBe('VALIDATION');
    // REQ-SEC-03's fit criterion stays the first sentence, verbatim…
    expect(result.error.message).toMatch(/^user not authorized to approve type 'adr'/);
    // …and the baseline is named, so the user is not left arguing with the file on their screen.
    expect(result.error.message).toContain(DNA_PATH);
    expect(result.error.message).toMatch(/not committed/);

    // State unchanged (P1.7 sc.3 / REQ-STATE-01): no commit, and the document still says `pending`.
    expect(head(repo)).toBe(before);
    expect(readFileSync(join(repo, DOC_PATH), 'utf-8')).toBe(adrDoc('pending'));
    assertPersistenceUnchanged(repo, unchanged);
  });

  // AC3 — red-first: the same refusal for `reject`, the other authority-gated verb.
  it('AC3: `reject` refuses on the same uncommitted grant, with the same code and exit', async () => {
    repo = seedRepo(NO_MEMBERS_DNA);
    writeUncommittedDna(repo, APPROVER_DNA);
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await memoryFn('memoryReject')({
      root: repo,
      positional: 'adr-001',
      options: { reason: 'not good enough' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toMatch(/^user not authorized to approve type 'adr'/);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // M1 (design §) — red-first: dna.yaml need not be modified; it need not be TRACKED.
  it('AC3/M1: a `dna.yaml` that exists in NO commit authorizes nothing — the refusal names the missing baseline', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, DOC_PATH, adrDoc('pending'));
    commitAll(repo, 'seed without a dna.yaml');
    writeFileSync(join(repo, DNA_PATH), APPROVER_DNA, 'utf-8');
    expect(gitOut(repo, ['status', '--porcelain', '--', DNA_PATH])).toBe(`?? ${DNA_PATH}`);
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await memoryFn('memoryApprove')({ root: repo, positional: 'adr-001', options: { reason: 'r' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('cannot resolve approval authority');
    expect(result.error.message).toContain(DNA_PATH);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // Red-first: a committed baseline that cannot be parsed fails CLOSED, even though the working
  // tree's copy is perfectly valid and grants the role.
  it('AC3: an INVALID committed `dna.yaml` refuses, even when the working-tree copy is valid and grants `approver`', async () => {
    repo = seedRepo('version: 1.1\nthis is: [not, a, dna file\n');
    writeUncommittedDna(repo, APPROVER_DNA);
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await memoryFn('memoryApprove')({ root: repo, positional: 'adr-001', options: { reason: 'r' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('cannot resolve approval authority');
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // M2 (design §) — red-first, and a deliberate BEHAVIOUR CHANGE: today the verb refuses here.
  it('AC2/M2: an uncommitted WITHDRAWAL of the role does not revoke it — authority is what the repository records', async () => {
    repo = seedRepo(APPROVER_DNA);
    writeUncommittedDna(repo, DEVELOPER_ONLY_DNA);

    const result = await memoryFn('memoryApprove')({
      root: repo,
      positional: 'adr-001',
      options: { reason: 'HEAD says I am an approver' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.to).toBe('approved');
    expect(result.commit?.message).toContain(`Approver: ${TEST_NAME} <${TEST_EMAIL}> (approver)`);
    // The working-tree edit is neither used nor swept into the commit (task-088's scope check).
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(DOC_PATH);
    expect(gitOut(repo, ['status', '--porcelain', '--', DNA_PATH])).not.toBe('');
  });

  // Characterization: this already holds on a clean tree; it is the property the whole task is for,
  // so it is pinned rather than assumed. task-088's `verifyCommittedScope` is what makes `HEAD` and
  // "the commit being produced" the same answer, so the evidence sits INSIDE the approval commit.
  it('AC2: a successful approval is corroborated by the `dna.yaml` committed AT that very commit', async () => {
    repo = seedRepo(APPROVER_DNA);

    const result = await memoryFn('memoryApprove')({ root: repo, positional: 'adr-001', options: { reason: 'ok' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sha = result.commit?.sha ?? '';

    const dnaAtApproval = gitOut(repo, ['show', `${sha}:${DNA_PATH}`]);
    expect(dnaAtApproval).toBe(APPROVER_DNA.trim());
    expect(dnaAtApproval).toBe(gitOut(repo, ['show', `${sha}^:${DNA_PATH}`]));
    expect(dnaAtApproval).toContain('roles: [ developer, approver ]');
    expect(result.commit?.message).toContain(`Approver: ${TEST_NAME} <${TEST_EMAIL}> (approver)`);
  });

  // AC4 — the bootstrap pair. A fresh project has `team.members: []`; seeding the first approver is
  // ungated (no verb requires approval authority to write `dna.yaml`), and the ONE extra requirement
  // this task adds is that the seed must be committed.
  it('AC4: the first approver is seeded by committing the `dna.yaml` edit — refused before the commit, accepted after it', async () => {
    repo = seedRepo(NO_MEMBERS_DNA);

    // Step 1 — the edit, not yet committed: refused (red-first half).
    writeUncommittedDna(repo, APPROVER_DNA);
    const uncommitted = await memoryFn('memoryApprove')({ root: repo, positional: 'adr-001', options: { reason: 'r' } });
    expect(uncommitted.ok).toBe(false);

    // Step 2 — the user commits their own dna.yaml edit. No approval authority is needed to do it.
    git(repo, ['add', '--', DNA_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'chore: seed the first approver']);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');

    // Step 3 — the same command now succeeds (characterization half: this is the flow that works today).
    const seeded = await memoryFn('memoryApprove')({ root: repo, positional: 'adr-001', options: { reason: 'r' } });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    expect(seeded.value).toMatchObject({ from: 'pending', to: 'approved' });
  });

  // Characterization — the fix must stay a BASELINE, not become task-088's guard: a dirty `dna.yaml`
  // is not itself a refusal. `submit` has no authority gate and must be unaffected by it entirely.
  it('AC2: a dirty `dna.yaml` does not by itself block a transition — `submit` is untouched by the authority read', async () => {
    repo = seedRepo(APPROVER_DNA);
    writeFixtureFile(repo, DOC_PATH, adrDoc('draft'));
    commitAll(repo, 'back to draft');
    writeUncommittedDna(repo, `${APPROVER_DNA}\n# an unrelated, uncommitted edit\n`);

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ from: 'draft', to: 'pending' });
  });

  // Characterization — `deprecate` is not an approval gate (REQ-SEC-04 as amended by `dl-027`), so
  // the committed baseline must not reach it: it keeps working with no committed approver at all.
  it('AC2: `deprecate` needs no approval authority and is unaffected by the committed baseline', async () => {
    repo = seedRepo(NO_MEMBERS_DNA);

    const result = await memoryFn('memoryDeprecate')({ root: repo, positional: 'adr-001', options: { reason: 'r' } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.to).toBe('deprecated');
  });
});
