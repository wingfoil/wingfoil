/**
 * P5.4.1 (US-0A-13) — Agent Role Definition, the three scenarios of
 * `docs/02_requirements/02_bdd/features/p5-interaction/P5.4.1-agent-role-definition.feature`
 * (task-149-defining-role-dna-makes-usable-once-duplicate-role).
 *
 * "Define a role in DNA" is `wingfoil dna add team.roles --value <role>` — the grammar `spec-008` §9
 * gives for a new `team.roles` entry. "Usable at once" is read against the committed-baseline rule
 * (`spec-006` §6, `spec-008` §11, the `command-baseline` directive): `directive assign` validates the
 * role against the `dna.yaml` committed at `HEAD`, and `dna add` commits its own write
 * (`wf(dna): add team.roles <role>`), so the role is valid for the very next command with no further
 * step. A role added to the working tree by hand is NOT usable until committed — that refusal is pinned
 * by `test/core/directive-assign-role-baseline.test.ts` (bug-082) and is not repeated here.
 *
 * Exercises the REAL, registered `CORE_MODULES` operations in THROWAWAY temp git repositories.
 * Determinism (REQ-SYS-07): fixed fixture texts, fixed step order.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, loadDnaYaml } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { applyDnaMutation } from '../../src/dna/mutate';
import { assertRoleDefined } from '../../src/dna/roles';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
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
  members:
    - name: roberto
      email: r@example.it
      roles: [ approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

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

function op(moduleName: string, name: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === moduleName)?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${moduleName}.${name}" is not registered`);
  return operation.fn;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

function seedRepo(dna: string = DNA_YAML): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, DNA_PATH, dna);
  writeFixtureFile(repo, ROLES_PATH, ROLES_YAML);
  writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', DIRECTIVE);
  commitAll(repo, 'seed');
  return repo;
}

const defineRole = (repo: string, role: string): ReturnType<CoreFn<unknown, unknown>> =>
  op('dna', 'dnaAdd')({ root: repo, positionals: ['team.roles'], options: { value: role } });

const assignTo = (repo: string, role: string): ReturnType<CoreFn<unknown, unknown>> =>
  op('directive', 'directiveAssign')({ root: repo, options: { directive: 'testing', role } });

describe('P5.4.1 — Agent Role Definition', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  // Sc. 1 and 2 are characterization (task-149 AC1): `dna add` already commits, and `directive assign`
  // already reads the committed catalogue, so these pass on first run.
  it.each([
    ['Sc. 1: a built-in role', 'reviewer'],
    ['Sc. 2: a custom role', 'data-engineer'],
  ])('%s ("%s") is usable at once: committed by `dna add`, then valid for directive assign and assertRoleDefined', async (_label, role) => {
    repo = seedRepo();

    const defined = await defineRole(repo, role);

    expect(defined.ok).toBe(true);
    // "At once" = the dna verb's own commit: the role is in HEAD and the tree is clean.
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(`wf(dna): add team.roles ${role}`);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
    expect(gitOut(repo, ['show', `HEAD:${DNA_PATH}`])).toContain(`- name: ${role}`);
    expect(() => assertRoleDefined(loadDnaYaml(repo), role)).not.toThrow();

    const assigned = await assignTo(repo, role);

    expect(assigned.ok).toBe(true);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(`wf(directive): assign testing to ${role}`);
  });

  // Sc. 3 — red-first (task-149 AC2): `dna add` used to answer with the generic collection message.
  it('Sc. 3: a duplicate role is refused with "role already defined: <role>", exit 1, nothing written', async () => {
    repo = seedRepo(DNA_YAML.replace('    - name: approver\n', '    - name: approver\n    - name: reviewer\n'));
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const bytesBefore = readFileSync(join(repo, DNA_PATH), 'utf-8');

    const unchanged = snapshotPersistence(repo);
    const result = await defineRole(repo, 'reviewer');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('role already defined: reviewer');
    expect(exitCodeForResult(result)).toBe(1);
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(join(repo, DNA_PATH), 'utf-8')).toBe(bytesBefore);
    expect(loadDnaYaml(repo).team.roles.filter((entry) => entry.name === 'reviewer')).toHaveLength(1);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('Sc. 3 at the mutation layer: the refusal is the same text, and no other collection changes its message', () => {
    const dna = {
      modules: [{ name: 'core', path: 'src/core' }],
      team: { members: [], roles: [{ name: 'reviewer' }] },
    } as Record<string, unknown>;

    expect(applyDnaMutation(dna, { verb: 'add', field: 'team.roles', value: 'reviewer' })).toEqual({
      ok: false,
      message: 'role already defined: reviewer',
    });
    // A quoted spelling of the same path (dl-083) addresses the same collection, so it gets the same text.
    expect(applyDnaMutation(dna, { verb: 'add', field: 'team."roles"', value: 'reviewer' })).toEqual({
      ok: false,
      message: 'role already defined: reviewer',
    });
    // P5.4.1 pins the role message only; the other collections keep dl-081's generic refusal.
    const other = applyDnaMutation(dna, { verb: 'add', field: 'modules', value: 'core', fields: { path: 'src/x' } });
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.message).toBe("'modules' already carries an entry named 'core' — entry names are unique (dl-081); use `dna update` to change it");
  });
});
