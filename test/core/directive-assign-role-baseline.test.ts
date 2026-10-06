/**
 * task-091-reads-resolve-at-head / `bug-082-directive-assign-validates-role-against-worktree` —
 * **`directive assign` validates `--role` against the COMMITTED `.wingfoil/dna.yaml` role
 * catalogue** (REQ-SYS-08, P3.2/P3.7, `dl-080-which-baseline-each-command-reads` option (B)).
 *
 * The defect this pins: `checkAssignable` was handed a `DnaYaml` its caller had loaded from disk, so
 * an uncommitted role in `team.roles` was accepted and `roles.yaml` was committed carrying a binding
 * to a role **no commit of the repository defines** — REQ-SYS-08's referential integrity broken by
 * construction, since any other clone sees the binding and not the role.
 *
 * The cost of this baseline is known and was accepted at `dl-080`'s ratification: extending the role
 * catalogue becomes *edit, commit, then assign*. Two cases below are that flow, pinned as the
 * ordinary path it now is — not as a workaround. (`dl-081` / `task-093` are building the `dna` verbs
 * that will make the first two steps one command; nothing here waits on them.)
 *
 * Exercises the REAL, registered `CORE_MODULES` `directive.directiveAssign` operation in THROWAWAY
 * temp git repositories. Determinism (REQ-SYS-07): fixed fixture texts, fixed step order.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import * as loaders from '../../src/core/loaders';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const DNA_PATH = '.wingfoil/dna.yaml';
const ROLES_PATH = '.wingfoil/roles.yaml';

const DNA_YAML = `version: 1.1
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
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

/** The same catalogue with one more role — the edit an author makes while assigning to it. */
const DNA_WITH_EXTRA_ROLE = DNA_YAML.replace('    - name: approver\n', '    - name: approver\n    - name: FABRICATED-ROLE\n');

const ROLES_YAML = `version: 1
assignments:
  developer:
    - testing
global:
  - documentation
`;

const DIRECTIVE = `---
id: testing
name: "Testing"
type: directive
kind: custom
title: "Testing"
---

# Testing
`;

interface AssignValue {
  readonly directives: readonly string[];
  readonly role: string;
  readonly assignments: readonly string[];
}

/** The real, registered `directive.directiveAssign` `CoreFn`. */
function directiveAssignFn(): CoreFn<unknown, AssignValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveAssign;
  if (!operation) throw new Error('fixture bug: "directiveAssign" operation not registered on the directive module');
  return operation.fn as CoreFn<unknown, AssignValue>;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

/** A repo whose COMMITTED state is `dna` + the bindings + one directive file, working tree clean. */
function seedRepo(dna: string = DNA_YAML): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, DNA_PATH, dna);
  writeFixtureFile(repo, ROLES_PATH, ROLES_YAML);
  writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', DIRECTIVE);
  commitAll(repo, 'seed');
  return repo;
}

const assign = async (repo: string, role: string): Promise<ReturnType<CoreFn<unknown, AssignValue>>> =>
  directiveAssignFn()({ root: repo, options: { directive: 'testing', role } });

describe('directive assign validates `--role` at HEAD (bug-082, dl-080 (B))', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  // AC1's reproduction, as a test (AC3/AC6). Red today: exit 0, and roles.yaml is committed.
  it('AC3/AC6: an UNCOMMITTED role is refused at exit 1 — `roles.yaml` untouched, nothing committed', async () => {
    repo = seedRepo();
    writeFileSync(join(repo, DNA_PATH), DNA_WITH_EXTRA_ROLE, 'utf-8');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe(`M ${DNA_PATH}`);
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);
    const rolesBefore = readFileSync(join(repo, ROLES_PATH), 'utf-8');

    const result = await assign(repo, 'FABRICATED-ROLE');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    // P3.2's fit criterion stays the verbatim first sentence; D5's diagnostic is appended.
    expect(result.error.message).toMatch(/^unknown role 'FABRICATED-ROLE' \(not defined in dna\.yaml\)/);
    expect(result.error.message).toContain(DNA_PATH);
    expect(head(repo)).toBe(before);
    expect(readFileSync(join(repo, ROLES_PATH), 'utf-8')).toBe(rolesBefore);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // AC4 — the ordinary flow under (B), and the one `dl-080` knowingly costs a step: commit, then assign.
  it('AC4: adding the role AND committing it is what makes the assignment legal — the same call then succeeds', async () => {
    repo = seedRepo();
    writeFileSync(join(repo, DNA_PATH), DNA_WITH_EXTRA_ROLE, 'utf-8');
    git(repo, ['add', '--', DNA_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'chore: extend the role catalogue']);

    const result = await assign(repo, 'FABRICATED-ROLE');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assignments).toEqual(['testing']);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(directive): assign testing to FABRICATED-ROLE');
    // The binding and the role that supports it are both in the committed record (REQ-SYS-08).
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).toContain('FABRICATED-ROLE');
    expect(gitOut(repo, ['show', `HEAD:${DNA_PATH}`])).toContain('FABRICATED-ROLE');
  });

  // AC4, characterization: a role the committed catalogue already defines assigns exactly as before.
  it('AC4: an already-committed role assigns normally, one scoped commit', async () => {
    repo = seedRepo();

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'approver' } });

    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES_PATH);
  });

  // The mirror image — the case a "refuse while dna.yaml is dirty" guard would get wrong: a role the
  // repository RECORDS stays assignable while the working tree withdraws it.
  it('AC2: a role committed at HEAD is assignable even though the working tree no longer lists it', async () => {
    repo = seedRepo(DNA_WITH_EXTRA_ROLE);
    writeFileSync(join(repo, DNA_PATH), DNA_YAML, 'utf-8');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe(`M ${DNA_PATH}`);

    const result = await assign(repo, 'FABRICATED-ROLE');

    expect(result.ok).toBe(true);
  });

  // AC4 — fail-closed, on the same three refusals task-090 established for the authority read.
  it('AC4: no committed `dna.yaml` at all — refused at exit 1, nothing committed', async () => {
    repo = seedRepo();
    git(repo, ['rm', '--cached', '--quiet', '--', DNA_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'untrack the DNA, keep it on disk']);
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await assign(repo, 'developer');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain(DNA_PATH);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC4: a committed `dna.yaml` that does not validate is refused even though the working-tree copy is fine', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, DNA_PATH, 'version: 1.1\nmodules: "not a list"\n');
    writeFixtureFile(repo, ROLES_PATH, ROLES_YAML);
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', DIRECTIVE);
    commitAll(repo, 'seed an invalid DNA');
    writeFileSync(join(repo, DNA_PATH), DNA_YAML, 'utf-8');

    const result = await assign(repo, 'developer');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('HEAD');
  });

  // The diagnostic can never decide: an unreadable WORKING-TREE dna.yaml leaves the refusal exactly
  // as P3.2 words it, rather than turning a read failure into an answer (task-090's rule, reused).
  it.each([
    ['unreadable', 'version: 1.1\nmodules: "not a list"\n'],
    ['unparseable', 'version: 1.1\n\tmodules:\n'],
  ])('D5: a %s working-tree `dna.yaml` adds no note and changes no outcome', async (_label, broken) => {
    repo = seedRepo();
    writeFileSync(join(repo, DNA_PATH), broken, 'utf-8');

    const result = await assign(repo, 'FABRICATED-ROLE');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("unknown role 'FABRICATED-ROLE' (not defined in dna.yaml)");
    expect(exitCodeForResult(result)).toBe(1);
  });

  // Same propagation rule as on the Memory side: a defect in the committed read is not an answer
  // about the catalogue, so it must not be reported as an unknown role.
  it('a non-ValidationError from the committed read propagates instead of becoming a refusal', async () => {
    repo = seedRepo();
    const spy = jest.spyOn(loaders, 'loadDnaYamlAtHead').mockImplementation(() => {
      throw new TypeError('a defect in the read path');
    });
    try {
      await expect(assign(repo, 'developer')).rejects.toThrow(TypeError);
    } finally {
      spy.mockRestore();
    }
  });

  // The role is checked before the ids, and an unknown directive still reports its own message. The
  // directive inventory's own baseline was a separate finding when this suite was written (task-091
  // design § AC5 S2); task-096 closed it, and `test/core/directive-inventory-baseline.test.ts` owns
  // that half. `seedRepo` commits the directive file, so this case is unaffected either way.
  it('an unknown directive id is still reported as such, with the role valid at HEAD', async () => {
    repo = seedRepo();

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'nope', role: 'developer' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('unknown directive: nope');
  });
});
