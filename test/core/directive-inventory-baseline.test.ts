/**
 * task-096-directive-inventory-resolves-at-head / `bug-086-directive-inventory-read-from-the-worktree`
 * — **the directive inventory and its references resolve at `HEAD`**
 * (`dl-080-which-baseline-each-command-reads` option (B), P3.2/P3.3/P3.7, REQ-SEC-07 clause (b),
 * REQ-SYS-08).
 *
 * One read seen from two sides, which is why one suite pins both:
 *
 * - **`directive assign`** validated `--directive` against the directive files **on disk**, so an
 *   untracked file could be bound and the committed `roles.yaml` then named a directive present in no
 *   commit — a dangling reference by construction, exactly as `bug-082` produced one for `--role`.
 * - **`directive remove`** answered REQ-SEC-07 clause (b) — *may this asset be deleted?* — from the
 *   **working tree's** `roles.yaml`, so an uncommitted deletion of the reference was enough to destroy
 *   a file the committed `roles.yaml` still bound. It is the only verb in the system that deletes an
 *   artefact, which is why `bug-086` grades this half above the other.
 *
 * `task-091` moved `--role` to `HEAD` and scoped both of these out for one reason only — reading the
 * inventory at a revision needs a *directory listing at a revision*, which `src/storage` did not have.
 * It has one now (`listPathsAtRev`, `test/storage/list-paths-at-rev.test.ts`), so the cost argument is
 * spent and the boundary goes.
 *
 * Both fixes follow `task-090`/`task-091`'s shape: the **parameter is removed**, so no call path can
 * reach either decision with a working-tree document. What a test can observe is the consequence, and
 * that is what is below; the unreachability itself is pinned by the type checker.
 *
 * Exercises the REAL, registered `CORE_MODULES` `directive.directiveAssign` / `directive.directiveRemove`
 * operations in THROWAWAY temp git repositories (`bug-075`: never this repository's own `.wingfoil/`).
 * Determinism (REQ-SYS-07): fixed fixture texts, fixed step order, no clock.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, loadDirectiveListing, loadDirectives, loadRolesYaml } from '../../src/core';
import { checkAssignable, checkUnreferenced } from '../../src/core/directive-assign';
import { exitCodeForResult } from '../../src/core/exit-code';
import * as loaders from '../../src/core/loaders';
import { loadDirectivesAtHead, loadRolesYamlAtHead } from '../../src/core/loaders';
import type { CoreFn } from '../../src/core/registry';
import * as storage from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const DNA_PATH = '.wingfoil/dna.yaml';
const ROLES_PATH = '.wingfoil/roles.yaml';
const TESTING_PATH = '.wingfoil/directives/custom/testing.md';
const SPARE_PATH = '.wingfoil/directives/custom/spare.md';
const KEEPER_PATH = '.wingfoil/directives/custom/keeper.md';
const GLOBAL_RULE_PATH = '.wingfoil/directives/custom/global-rule.md';
const BUILTIN_PATH = '.wingfoil/directives/built-in/documentation.md';

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
    - name: architect
    - name: approver
paths:
  sources: [ src/ ]
`;

/**
 * `testing` + `keeper` bound to `developer`; `documentation` + `global-rule` bound globally.
 *
 * Every list carries **two** entries on purpose: the tests below withdraw one binding at a time, and
 * a list emptied to `[]` renders as `global:` with no items, which YAML reads back as `null` and the
 * `RolesYaml` schema then rejects — a fixture failure that looks exactly like a real refusal.
 */
const ROLES_YAML = `version: 1
assignments:
  developer:
    - testing
    - keeper
global:
  - documentation
  - global-rule
`;

/** The same bindings with `testing` withdrawn — the edit an author makes before removing it. */
const ROLES_WITHOUT_TESTING = ROLES_YAML.replace('    - testing\n', '');
/** The same bindings with the globally-bound custom directive withdrawn. */
const ROLES_WITHOUT_GLOBAL_RULE = ROLES_YAML.replace('  - global-rule\n', '');
/** The same bindings with `spare` — which the committed file binds nowhere — added to `developer`. */
const ROLES_WITH_SPARE = ROLES_YAML.replace('    - keeper\n', '    - keeper\n    - spare\n');

const directiveMd = (id: string, kind: 'custom' | 'built-in'): string =>
  `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: ${kind}\ntitle: "${id}"\n---\n\n# ${id}\n`;

interface AssignValue {
  readonly directives: readonly string[];
  readonly role: string;
  readonly assignments: readonly string[];
}

interface RemoveValue {
  readonly name: string;
  readonly path: string;
}

function operation<T>(name: 'directiveAssign' | 'directiveRemove'): CoreFn<unknown, T> {
  const found = CORE_MODULES.find((module) => module.name === 'directive')?.operations[name];
  if (!found) throw new Error(`fixture bug: "${name}" operation not registered on the directive module`);
  return found.fn as CoreFn<unknown, T>;
}

const gitOut = (repo: string, args: readonly string[]): string =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

/**
 * A repo whose COMMITTED state is the DNA catalogue, the bindings, four custom directives (`testing`
 * and `keeper` bound to `developer`, `global-rule` bound globally, `spare` bound nowhere) and one
 * built-in bound globally. Working tree clean.
 */
function seedRepo(overrides: Readonly<Record<string, string>> = {}): string {
  const repo = makeTempGitRepo();
  const files: Record<string, string> = {
    [DNA_PATH]: DNA_YAML,
    [ROLES_PATH]: ROLES_YAML,
    [TESTING_PATH]: directiveMd('testing', 'custom'),
    [SPARE_PATH]: directiveMd('spare', 'custom'),
    [KEEPER_PATH]: directiveMd('keeper', 'custom'),
    [GLOBAL_RULE_PATH]: directiveMd('global-rule', 'custom'),
    [BUILTIN_PATH]: directiveMd('documentation', 'built-in'),
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) writeFixtureFile(repo, path, content);
  commitAll(repo, 'seed');
  return repo;
}

const assign = async (repo: string, directive: string, role = 'developer') =>
  operation<AssignValue>('directiveAssign')({ root: repo, options: { directive, role } });

const remove = async (repo: string, name: string) =>
  operation<RemoveValue>('directiveRemove')({ root: repo, positional: name });

// ---------------------------------------------------------------------------------------------
// `directive assign` — which directives exist is the COMMITTED inventory's answer
// ---------------------------------------------------------------------------------------------

describe('directive assign resolves the directive inventory at HEAD (bug-086, dl-080 (B))', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  // bug-086's `assign` reproduction, as a test. Red before the fix: exit 0, and `roles.yaml` is
  // committed binding a directive `git cat-file -e HEAD:<path>` cannot find.
  it('AC3/AC6: an UNTRACKED directive file cannot be bound — exit 1, roles.yaml untouched, nothing committed', async () => {
    repo = seedRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/ghost.md', directiveMd('ghost', 'custom'));
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await assign(repo, 'ghost');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('unknown directive: ghost');
    expect(head(repo)).toBe(before);
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).not.toContain('ghost');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC3/AC6: a directive whose id exists only in the WORKING TREE copy of a committed file is refused', async () => {
    // The file is committed and tracked; only its `id:` was edited on disk. The inventory must come
    // from the committed bytes, so the working-tree id is unknown and the committed one still works.
    repo = seedRepo();
    writeFileSync(join(repo, TESTING_PATH), directiveMd('renamed', 'custom'), 'utf-8');

    const refused = await assign(repo, 'renamed', 'architect');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toBe('unknown directive: renamed');

    const accepted = await assign(repo, 'testing', 'architect');
    expect(accepted.ok).toBe(true);
  });

  it('AC3: a directive committed at HEAD but DELETED in the working tree is still assignable', async () => {
    // The mirror case, and the direction in which the new baseline PERMITS where the old refused: a
    // working tree that withdraws what HEAD records no longer decides (task-091's M2, same shape).
    repo = seedRepo();
    git(repo, ['rm', '--quiet', SPARE_PATH]);

    const result = await assign(repo, 'spare', 'architect');

    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).toContain('spare');
  });

  it('AC3: a COMMITTED directive file that does not validate is refused, naming the committed baseline', async () => {
    repo = seedRepo({ [SPARE_PATH]: '---\nid: spare\ntype: not-a-directive\n---\n' });
    // The working-tree copy is repaired; only the committed one is broken. Fail-closed: a read that
    // cannot answer must not fall back to the file on disk, which is the defect itself.
    writeFileSync(join(repo, SPARE_PATH), directiveMd('spare', 'custom'), 'utf-8');
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await assign(repo, 'testing', 'architect');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('HEAD');
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC5: assigning a COMMITTED directive to a COMMITTED role still works, in one scoped commit', async () => {
    repo = seedRepo();

    const result = await assign(repo, 'spare');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assignments).toEqual(['testing', 'keeper', 'spare']);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES_PATH);
  });

  it('AC5: the write → commit → assign sequence is the ordinary path for a new directive', async () => {
    repo = seedRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/fresh.md', directiveMd('fresh', 'custom'));

    const beforeCommit = await assign(repo, 'fresh');
    expect(beforeCommit.ok).toBe(false);

    commitAll(repo, 'chore: add a directive');
    const afterCommit = await assign(repo, 'fresh');

    expect(afterCommit.ok).toBe(true);
    // The binding and the file it names are now both in the committed record — which is the whole point.
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).toContain('fresh');
    expect(gitOut(repo, ['cat-file', '-t', 'HEAD:.wingfoil/directives/custom/fresh.md'])).toBe('blob');
  });

  it("AC5: task-091's `--role` check is unchanged — an uncommitted role is still refused, same wording", async () => {
    repo = seedRepo();
    writeFileSync(join(repo, DNA_PATH), DNA_YAML.replace('    - name: approver\n', '    - name: approver\n    - name: qa\n'), 'utf-8');

    const unchanged = snapshotPersistence(repo);
    const result = await assign(repo, 'testing', 'qa');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message.startsWith("unknown role 'qa' (not defined in dna.yaml)")).toBe(true);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC5: an unknown directive id is still reported with P3.2 Sc.3 wording, verbatim', async () => {
    repo = seedRepo();

    const result = await assign(repo, 'nope');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('unknown directive: nope');
  });
});

// ---------------------------------------------------------------------------------------------
// `directive remove` — REQ-SEC-07 (b) is answered by the COMMITTED roles.yaml
// ---------------------------------------------------------------------------------------------

describe('directive remove answers REQ-SEC-07 (b) from the committed roles.yaml (bug-086)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  /** Replace the WORKING TREE copy of roles.yaml, leaving the committed one alone. */
  const editRolesInWorkingTreeOnly = (root: string, yaml: string): void =>
    writeFileSync(join(root, ROLES_PATH), yaml, 'utf-8');

  // bug-086's `remove` reproduction, as a test — the half that DESTROYS a file. Red before the fix:
  // exit 0, the file deleted, and `git show HEAD:.wingfoil/roles.yaml` still binding it.
  it('AC3/AC6: an UNCOMMITTED unbinding does not permit removal — exit 1, the file survives, nothing committed', async () => {
    repo = seedRepo();
    editRolesInWorkingTreeOnly(repo, ROLES_WITHOUT_TESTING);
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await remove(repo, 'testing');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toBe("cannot remove 'testing': still assigned to role 'developer'");
    expect(existsSync(join(repo, TESTING_PATH))).toBe(true);
    expect(head(repo)).toBe(before);
    expect(gitOut(repo, ['show', `HEAD:${ROLES_PATH}`])).toContain('testing');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it("AC3/AC6: the same holds for a `global` binding withdrawn only in the working tree", async () => {
    // `global` binds the id to every role, so it is the strongest reference of all — and it was
    // walked past by the same uncommitted edit.
    repo = seedRepo();
    editRolesInWorkingTreeOnly(repo, ROLES_WITHOUT_GLOBAL_RULE);
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await remove(repo, 'global-rule');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toBe(
      "cannot remove 'global-rule': still assigned to every role via roles.yaml 'global'",
    );
    expect(existsSync(join(repo, GLOBAL_RULE_PATH))).toBe(true);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC5: removing a directive whose reference was removed AND COMMITTED still works, in one scoped commit', async () => {
    repo = seedRepo();
    editRolesInWorkingTreeOnly(repo, ROLES_WITHOUT_TESTING);
    commitAll(repo, 'chore: unbind testing from developer');

    const result = await remove(repo, 'testing');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ name: 'testing', path: TESTING_PATH });
    expect(existsSync(join(repo, TESTING_PATH))).toBe(false);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(TESTING_PATH);
  });

  it('AC3: a binding that exists ONLY in the working tree does not block removal', async () => {
    // The permissive mirror, as on the assign side: the committed record says nothing binds `spare`,
    // and the uncommitted edit that says otherwise is not the repository's answer.
    repo = seedRepo();
    editRolesInWorkingTreeOnly(repo, ROLES_WITH_SPARE);

    const result = await remove(repo, 'spare');

    expect(result.ok).toBe(true);
    expect(existsSync(join(repo, SPARE_PATH))).toBe(false);
  });

  it('AC3: a roles.yaml that is not committed at HEAD at all records no binding, so removal proceeds', async () => {
    // "Is anything referencing it" is a NEGATIVE fact: a record that does not exist answers it, and
    // answers it with "nothing". That is why this read is not fail-closed the way `assign`'s role
    // catalogue is — see the task's Execution Notes, design § D4.
    repo = seedRepo();
    git(repo, ['rm', '--quiet', '--cached', ROLES_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'chore: untrack roles.yaml']);

    const result = await remove(repo, 'spare');

    expect(result.ok).toBe(true);
    expect(existsSync(join(repo, SPARE_PATH))).toBe(false);
  });

  it('AC3: a COMMITTED roles.yaml that does not validate refuses the removal, naming the baseline', async () => {
    repo = seedRepo({ [ROLES_PATH]: 'version: 1\nassignments: "not a mapping"\n' });
    writeFileSync(join(repo, ROLES_PATH), ROLES_YAML, 'utf-8');
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await remove(repo, 'spare');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('HEAD');
    expect(existsSync(join(repo, SPARE_PATH))).toBe(true);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  // --- AC4: the directive file itself uncommitted ------------------------------------------------
  //
  // Characterization. `task-092`'s write rule already answers this and answers it correctly, and the
  // point of pinning it here is that the inventory change must NOT quietly replace that answer with
  // `unknown directive: <id>` — the refusal a user needs names the file and its `git status` code.

  it('AC4: an UNTRACKED directive file is not removable — the write guard refuses, and the file survives', async () => {
    repo = seedRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/ghost.md', directiveMd('ghost', 'custom'));
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);

    const result = await remove(repo, 'ghost');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('refusing to commit .wingfoil/directives/custom/ghost.md');
    expect(result.error.message).toContain("[git status '??']");
    expect(existsSync(join(repo, '.wingfoil/directives/custom/ghost.md'))).toBe(true);
    expect(head(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC4: a COMMITTED directive carrying an uncommitted edit is not removable either', async () => {
    repo = seedRepo();
    writeFileSync(join(repo, SPARE_PATH), `${directiveMd('spare', 'custom')}\nAN UNCOMMITTED PARAGRAPH.\n`, 'utf-8');

    const unchanged = snapshotPersistence(repo);
    const result = await remove(repo, 'spare');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain(`refusing to commit ${SPARE_PATH}`);
    expect(existsSync(join(repo, SPARE_PATH))).toBe(true);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('AC5: REQ-SEC-07 clause (a) still fires first for a built-in, before any reference check', async () => {
    repo = seedRepo();

    const result = await remove(repo, 'documentation');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('built-in directives cannot be removed');
  });

  it('AC5: an unknown name is still reported as `unknown directive: <name>`', async () => {
    repo = seedRepo();

    const result = await remove(repo, 'nope');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('unknown directive: nope');
  });
});

// ---------------------------------------------------------------------------------------------
// dl-042's warnings channel, after the inventory moved (the task's Implementation Notes)
// ---------------------------------------------------------------------------------------------

describe("dl-042's dangling-binding warning after the inventory resolves at HEAD", () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('is still reachable — `directives list` reports the working tree, which the verbs no longer decide from', async () => {
    // The warning's CAUSE narrows (assign can no longer manufacture one) but it is not dead code:
    // `directives list` is a read-only report of what the user has NOW, and a directive deleted in
    // the working tree while the committed roles.yaml binds it is exactly that state.
    repo = seedRepo();
    git(repo, ['rm', '--quiet', TESTING_PATH]);

    const listing = loadDirectiveListing(repo, 'developer');

    expect(listing.warnings).toContain("directive 'testing' bound to role 'developer' has no directive file");
  });

  it('is no longer reachable THROUGH `directive assign`, which is what bug-086 closes', async () => {
    repo = seedRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/ghost.md', directiveMd('ghost', 'custom'));

    expect((await assign(repo, 'ghost')).ok).toBe(false);
    expect(loadDirectiveListing(repo, 'developer').warnings.filter((w) => w.includes('ghost'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The two committed-baseline loaders, and the properties only a direct call can reach
// ---------------------------------------------------------------------------------------------

describe('loadDirectivesAtHead / loadRolesYamlAtHead (task-096)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('reads the committed tree, not the working tree, and ignores non-Markdown entries under it', () => {
    // `.gitkeep` is not a hypothetical: `wingfoil init` scaffolds one into `directives/built-in/`
    // (spec-011), so the listing must skip it rather than try to parse it as a directive.
    repo = seedRepo();
    writeFixtureFile(repo, '.wingfoil/directives/built-in/.gitkeep', '');
    commitAll(repo, 'fixture: a non-Markdown entry in the directives tree');
    writeFixtureFile(repo, '.wingfoil/directives/custom/ghost.md', directiveMd('ghost', 'custom'));

    const ids = loadDirectivesAtHead(repo).map((file) => file.frontmatter.id);

    expect(ids).toEqual(['documentation', 'global-rule', 'keeper', 'spare', 'testing']);
  });

  it('spells `DirectiveFile.path` exactly as the working-tree loader does, so downstream sees one shape', () => {
    repo = seedRepo();

    const fromHead = loadDirectivesAtHead(repo).map((file) => file.path);
    const fromDisk = loadDirectives(repo).map((file) => file.path);

    expect(fromHead).toEqual(fromDisk);
  });

  it('returns [] — not a throw — in a repository with no commits at all', () => {
    repo = makeTempGitRepo();

    expect(loadDirectivesAtHead(repo)).toEqual([]);
    expect(loadRolesYamlAtHead(repo)).toBeNull();
  });

  it('loadRolesYamlAtHead returns the COMMITTED bindings while the working tree says otherwise', () => {
    repo = seedRepo();
    writeFileSync(join(repo, ROLES_PATH), ROLES_WITHOUT_TESTING, 'utf-8');

    expect(loadRolesYamlAtHead(repo)?.assignments.developer).toEqual(['testing', 'keeper']);
    expect(loadRolesYaml(repo).assignments.developer).toEqual(['keeper']);
  });

  // Defensive branches nothing an argument can reach — the same property task-091 pinned on the
  // Memory and role reads, and the same technique: a defect in a committed read must never be
  // converted into a domain answer ("unknown directive", "nothing references it").
  it('a non-ValidationError from the committed inventory propagates rather than becoming `unknown directive`', () => {
    repo = seedRepo();
    const spy = jest.spyOn(loaders, 'loadDirectivesAtHead').mockImplementation(() => {
      throw new Error('disk on fire');
    });
    try {
      expect(() => checkAssignable(repo, 'developer', ['testing'])).toThrow('disk on fire');
    } finally {
      spy.mockRestore();
    }
  });

  it('a non-ValidationError from the committed bindings propagates rather than becoming "unreferenced"', () => {
    repo = seedRepo();
    const spy = jest.spyOn(loaders, 'loadRolesYamlAtHead').mockImplementation(() => {
      throw new Error('disk on fire');
    });
    try {
      expect(() => checkUnreferenced(repo, 'testing')).toThrow('disk on fire');
    } finally {
      spy.mockRestore();
    }
  });

  it('a listed blob that cannot be read back is skipped, not parsed as empty', () => {
    // Unreachable through any argument — git has just listed the blob — so it is reachable only by
    // making the second read fail, which is what a ref moving between the two calls would do.
    // Skipping is the fail-closed answer: a directive nobody can read is one that does not exist.
    repo = seedRepo();
    const spy = jest.spyOn(storage, 'readPathAtRev').mockReturnValue(null);
    try {
      expect(loadDirectivesAtHead(repo)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
