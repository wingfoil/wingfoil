/**
 * P3.2 (US-4-05) — `wingfoil directive assign` core-op fit criteria, per
 * `docs/02_requirements/02_bdd/features/p3-directives/P3.2-directive-assign.feature` (all three
 * scenarios), `spec-006-core-domain-api` §3 (`directiveAssign`, module `directive`, `mutates: true`,
 * CLI `wingfoil directive assign`, Tool `directive.assign` — dl-041 B), `spec-008-cli-grammar` §4/§5
 * (exit codes), REQ-SYS-08 (the role must be defined in `dna.yaml`), REQ-SEC-01 (identity pre-flight)
 * — task-051-directive-assign.
 *
 * task-056-role-based-directive-assignment extends the SAME operation with P3.7 (US-4-06,
 * `p3-directives/P3.7-role-based-assignment.feature`, all three scenarios): `--directive` takes a
 * comma-separated list. P3.7 registers no operation of its own, so the registration block below is
 * unchanged — which the P3.7 describe relies on rather than restating.
 *
 * task-169 (`dl-062` Q1 option 3) adds `--force`: a file the in-place editor cannot edit is `CONFLICT`
 * whether or not it has a comment, unless `force` authorizes the whole-file rewrite, whose success
 * carries a warning. P3.2's two scenarios for it run end to end in
 * `test/cli/directive-assign-force.integration.test.ts`.
 *
 * Exercises the REAL registered `CORE_MODULES` operation against THROWAWAY temp git repos carrying the
 * real `wingfoil init` scaffold, never this repository's own `.wingfoil/`.
 *
 * bug-027 (fixed in task-045, on `main` since this branch merged it): `commitPaths` now commits only
 * the paths it is handed, so the assign commit is scoped even when unrelated work is staged — pinned
 * at this call path by the "a change someone else staged" case below.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject, loadDirectiveListing, loadRolesYaml } from '../../src/core';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { deriveVerb, enumerateOperations } from '../../src/core/registry';
import { UsageError } from '../../src/core/usage-error';
import { deriveMcpToolName } from '../../src/mcp/registrar';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const ROLES = '.wingfoil/roles.yaml';

/** A success's `warnings` (task-169); `undefined` for a failure or a success without any. */
const warningsOf = (result: CoreResult<unknown>): readonly string[] | undefined => (result.ok ? result.warnings : undefined);

/** The CONFLICT reason pinned in spec-008 §6 (task-169, dl-062 Q1 option 3). */
const rewriteConflict = (role: string): string =>
  `roles.yaml cannot be updated in place; edit assignments.${role} by hand, or pass --force to rewrite the whole file`;

/** The warning pinned in spec-008 §6 for a `--force` whole-file rewrite (task-169, dl-062 Q1 option 3). */
const FORCE_REWRITE_WARNING =
  'roles.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, ' +
  'blank lines, line endings or number formatting (1.0 becomes 1)';

/** The real, registered `directive.directiveAssign` `CoreFn` — fails loudly if it is ever un-registered. */
function directiveAssignFn(): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveAssign;
  if (!operation) throw new Error('fixture bug: "directiveAssign" operation not registered on the directive module');
  return operation.fn;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

function head(repo: string): string {
  return gitOut(repo, ['rev-parse', 'HEAD']);
}

function readRoles(repo: string): string {
  return readFileSync(join(repo, ROLES), 'utf-8');
}

/** A temp git repo with the REAL `wingfoil init` Scrum scaffold (dna.yaml roles, roles.yaml, 10 directives). */
function makeInitializedRepo(): string {
  const repo = makeTempGitRepo();
  const init = initWingfoilProject(repo, 'Scrum');
  if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  return repo;
}

/** The scaffold with `testing` NOT yet bound to `developer`, committed — the P3.2 Sc.1 precondition. */
function makeRepoWithoutDeveloperTesting(): string {
  const repo = makeInitializedRepo();
  const scaffold = readRoles(repo);
  const edited = scaffold.replace('  developer:\n    - code-quality\n    - testing\n', '  developer:\n    - code-quality\n');
  if (edited === scaffold) throw new Error('fixture bug: scaffold roles.yaml shape changed');
  writeFixtureFile(repo, ROLES, edited);
  commitAll(repo, 'fixture: unbind testing from developer');
  return repo;
}

async function thrownBy(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

describe('CORE_MODULES directive.directiveAssign — registration (spec-006 §3, dl-041 B)', () => {
  it('is registered on the SINGULAR `directive` module as a `mutates: true` operation', () => {
    const entry = enumerateOperations(CORE_MODULES).find(
      ({ module, operation }) => module.name === 'directive' && operation.name === 'directiveAssign',
    );
    expect(entry).toBeDefined();
    expect(entry?.operation.mutates).toBe(true);
    const plural = CORE_MODULES.find((module) => module.name === 'directives');
    expect(plural?.operations.directiveAssign).toBeUndefined();
  });

  it('derives the CLI command `directive assign` and the MCP Tool `directive.assign`', () => {
    const verb = deriveVerb('directive', 'directiveAssign');
    expect(verb).toBe('assign');
    expect(deriveMcpToolName('directive', verb)).toBe('directive.assign');
  });

  it('declares `--directive` and `--role` as required value-bearing options', () => {
    const operation = CORE_MODULES.find((m) => m.name === 'directive')?.operations.directiveAssign;
    // The `--help` text each option also declares (task-120) is `test/cli/help-describes-every-command.test.ts`'s.
    expect(operation?.options).toEqual([
      expect.objectContaining({ name: 'directive', required: true }),
      expect.objectContaining({ name: 'role', required: true }),
    ]);
  });

  it('declares the boolean `--force` flag that authorizes the whole-file rewrite (dl-062 Q1 option 3)', () => {
    const operation = CORE_MODULES.find((m) => m.name === 'directive')?.operations.directiveAssign;
    expect(operation?.flags).toEqual([expect.objectContaining({ name: 'force' })]);
  });
});

describe('CORE_MODULES directive.directiveAssign — P3.2 scenarios (initialized project)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepoWithoutDeveloperTesting();
  });

  afterEach(() => removeTempDir(repo));

  // BDD Scenario 1: "Assign a directive to a role".
  it('Sc.1: assigns testing to developer — the role lists it, one commit touching only roles.yaml, exit 0', async () => {
    const before = head(repo);
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    // task-056 (P3.7) widened the payload's `directive: string` to `directives: readonly string[]`
    // (D4) — a single-id request is simply a one-element list.
    expect(result.value).toEqual({
      directives: ['testing'],
      role: 'developer',
      assignments: ['code-quality', 'determinism', 'testing'],
    });

    // "the role 'developer' lists 'testing' among its assigned directives" — read back through the real loader.
    expect(loadRolesYaml(repo).assignments.developer).toContain('testing');

    const message = 'wf(directive): assign testing to developer';
    expect(result.commit).toEqual({ sha: head(repo), message });
    expect(head(repo)).not.toBe(before);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(message);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // bug-027 at this call path: assign must not sweep in whatever the caller has staged.
  it('a change someone else staged is NOT swept into the `wf(directive): assign` commit, and stays staged', async () => {
    writeFixtureFile(repo, 'other.txt', 'staged by someone else');
    execFileSync('git', ['-C', repo, 'add', 'other.txt'], { encoding: 'utf-8' });

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(result.ok).toBe(true);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES);
    expect(gitOut(repo, ['diff', '--cached', '--name-only'])).toBe('other.txt');
  });

  // AC4 — comment/format preservation: exactly one added line, every other byte intact.
  it('AC4: preserves every comment and line of roles.yaml — the diff is exactly one added item line', async () => {
    const before = readRoles(repo);
    await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(readRoles(repo)).toBe(before.replace('    - determinism\n', '    - determinism\n    - testing\n'));
    expect(gitOut(repo, ['diff', '--numstat', 'HEAD~1', 'HEAD'])).toBe(`1\t0\t${ROLES}`);
  });

  // BDD Scenario 2: "Error - assigning to a role not defined in DNA".
  it('Sc.2: an undefined role exits 1 with the exact message and makes no assignment', async () => {
    const before = readRoles(repo);
    const sha = head(repo);
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'wizard' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: 'NOT_FOUND', message: "unknown role 'wizard' (not defined in dna.yaml)" });
    expect(exitCodeForResult(result)).toBe(1);
    expect(readRoles(repo)).toBe(before);
    expect(head(repo)).toBe(sha);
  });

  // BDD Scenario 3: "Error - assigning a non-existent directive".
  it('Sc.3: a non-existent directive exits 1 with the exact message and makes no assignment', async () => {
    const before = readRoles(repo);
    const sha = head(repo);
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'ghost', role: 'developer' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'unknown directive: ghost' });
    expect(exitCodeForResult(result)).toBe(1);
    expect(readRoles(repo)).toBe(before);
    expect(head(repo)).toBe(sha);
  });

  it('checks the role before the directive when both are unknown (deterministic first failure)', async () => {
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'ghost', role: 'wizard' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("unknown role 'wizard' (not defined in dna.yaml)");
  });

  // AC5 — idempotence (P3.7 Sc.2 "Binding is idempotent").
  it('AC5: re-assigning an already-assigned directive exits 0, leaves the file byte-identical and commits nothing', async () => {
    const first = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(first.ok).toBe(true);
    const bytes = readRoles(repo);
    const sha = head(repo);

    const again = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(exitCodeForResult(again)).toBe(0);
    expect(again.commit).toBeUndefined();
    expect(again.value).toEqual({
      directives: ['testing'],
      role: 'developer',
      assignments: ['code-quality', 'determinism', 'testing'],
    });
    expect(readRoles(repo)).toBe(bytes);
    expect(head(repo)).toBe(sha);
    expect((loadRolesYaml(repo).assignments.developer ?? []).filter((id) => id === 'testing')).toHaveLength(1);
  });

  // AC7 — dl-029: a role defined in DNA with no `assignments` entry yet.
  it('AC7: assigns to a DNA role absent from roles.yaml by inserting its key before the trailing comment', async () => {
    const before = readRoles(repo);
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'security', role: 'approver' } });
    expect(result.ok).toBe(true);
    expect(readRoles(repo)).toBe(
      before.replace('    - code-review\n\n# Global', '    - code-review\n  approver:\n    - security\n\n# Global'),
    );
    expect(loadRolesYaml(repo).assignments.approver).toEqual(['security']);
  });

  // AC9 — spec-008 §4 missing-required-argument wording.
  it.each([
    [{ role: 'developer' }, 'missing required argument: --directive'],
    [{ directive: 'testing' }, 'missing required argument: --role'],
    [{}, 'missing required argument: --directive'],
  ])('AC9: options %p is a usage error (exit 2) and writes nothing', async (options, reason) => {
    const before = readRoles(repo);
    const thrown = await thrownBy(directiveAssignFn()({ root: repo, options }));
    expect(thrown).toBeInstanceOf(UsageError);
    expect(exitCodeForThrow(thrown)).toEqual({ reason, exitCode: 2 });
    expect(readRoles(repo)).toBe(before);
  });

  it('a roles.yaml that is not valid YAML is a VALIDATION error (exit 1), nothing written', async () => {
    writeFixtureFile(repo, ROLES, 'assignments:\n  developer: [unclosed\n');
    commitAll(repo, 'fixture: unparseable roles.yaml');
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(exitCodeForResult(result)).toBe(1);
    expect(readRoles(repo)).toBe('assignments:\n  developer: [unclosed\n');
  });

  it('a schema-invalid roles.yaml is a VALIDATION error (exit 1), nothing written or committed', async () => {
    writeFixtureFile(repo, ROLES, 'assignments:\n  developer: not-a-list\n');
    commitAll(repo, 'fixture: break roles.yaml');
    const sha = head(repo);
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(readRoles(repo)).toBe('assignments:\n  developer: not-a-list\n');
    expect(head(repo)).toBe(sha);
  });

  // task-179 (bug-245 class, independent review F5): the refusal names roles.yaml from the project root,
  // never by the host's absolute path — in the reason and in every issue's `file`.
  it.each([
    ['not valid YAML', 'assignments:\n  developer: [unclosed\n'],
    ['schema-invalid', 'assignments:\n  developer: not-a-list\n'],
  ])('a %s roles.yaml is named `.wingfoil/roles.yaml`, never by its absolute path', async (_kind, text) => {
    writeFixtureFile(repo, ROLES, text);
    commitAll(repo, 'fixture: break roles.yaml');
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const shown = JSON.stringify(result.error);
    expect(shown).toContain('.wingfoil/roles.yaml');
    expect(shown).not.toContain(repo);
    expect(shown).not.toContain(realpathSync(repo));
  });
});

// task-056-role-based-directive-assignment (P3.7, US-4-06) — multi-directive assignment, per
// `docs/02_requirements/02_bdd/features/p3-directives/P3.7-role-based-assignment.feature` (all three
// scenarios). P3.7 registers NO new operation (`spec-006-core-domain-api` §3 has three `directive`
// rows and none for P3.7): it widens `directive assign`'s `--directive` to a comma-separated list.
describe('CORE_MODULES directive.directiveAssign — P3.7 scenarios (multi-directive assignment)', () => {
  let repo: string;

  /**
   * The scaffold with `developer` REMOVED from `assignments` altogether — the precondition P3.7 Sc.1's
   * "lists exactly those 3" requires (the scaffold binds developer to three directives already), and
   * simultaneously the dl-029 "role defined in DNA, absent from roles.yaml" insert path with a LIST.
   */
  function makeRepoWithoutDeveloper(): string {
    const created = makeInitializedRepo();
    const scaffold = readRoles(created);
    const edited = scaffold.replace('  developer:\n    - code-quality\n    - testing\n    - determinism\n', '');
    if (edited === scaffold) throw new Error('fixture bug: scaffold roles.yaml shape changed');
    writeFixtureFile(created, ROLES, edited);
    commitAll(created, 'fixture: developer has no assignments entry');
    return created;
  }

  beforeEach(() => {
    repo = makeRepoWithoutDeveloper();
  });

  afterEach(() => removeTempDir(repo));

  // BDD Scenario 1: "Bind multiple directives to one role".
  it('Sc.1: assigns testing, code-quality and security to developer in ONE invocation — the role lists exactly those 3', async () => {
    const before = head(repo);
    const result = await directiveAssignFn()({
      root: repo,
      options: { directive: 'testing,code-quality,security', role: 'developer' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value).toEqual({
      directives: ['testing', 'code-quality', 'security'],
      role: 'developer',
      assignments: ['testing', 'code-quality', 'security'],
    });

    // "role 'developer' lists exactly those 3 directives" — read back through the real loader.
    expect(loadRolesYaml(repo).assignments.developer).toEqual(['testing', 'code-quality', 'security']);

    // D5 — one commit, subject naming every id in argument order, staging only roles.yaml.
    const message = 'wf(directive): assign testing, code-quality, security to developer';
    expect(result.commit).toEqual({ sha: head(repo), message });
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(message);
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // BDD Scenario 2: "Binding is idempotent" — the LIST form (the single-id form is task-051's AC5).
  it('Sc.2: re-assigning the same list exits 0, leaves the file byte-identical and commits nothing', async () => {
    const first = await directiveAssignFn()({
      root: repo,
      options: { directive: 'testing,code-quality', role: 'developer' },
    });
    expect(first.ok).toBe(true);
    const bytes = readRoles(repo);
    const sha = head(repo);

    const again = await directiveAssignFn()({
      root: repo,
      options: { directive: 'testing,code-quality', role: 'developer' },
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(exitCodeForResult(again)).toBe(0);
    expect(again.commit).toBeUndefined();
    expect(readRoles(repo)).toBe(bytes);
    expect(head(repo)).toBe(sha);
    const listed = loadRolesYaml(repo).assignments.developer ?? [];
    expect(listed.filter((id) => id === 'testing')).toHaveLength(1);
    expect(listed.filter((id) => id === 'code-quality')).toHaveLength(1);
  });

  it('Sc.2: a PARTIALLY overlapping list appends only the ids not already bound, leaving the existing ones in place', async () => {
    const seed = await directiveAssignFn()({ root: repo, options: { directive: 'determinism', role: 'developer' } });
    expect(seed.ok).toBe(true);
    const before = readRoles(repo);

    const result = await directiveAssignFn()({
      root: repo,
      options: { directive: 'code-quality,determinism,security', role: 'developer' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `determinism` keeps its position and is NOT re-appended; the two new ids arrive in argument order.
    expect(loadRolesYaml(repo).assignments.developer).toEqual(['determinism', 'code-quality', 'security']);
    expect(result.value).toEqual({
      directives: ['code-quality', 'determinism', 'security'],
      role: 'developer',
      assignments: ['determinism', 'code-quality', 'security'],
    });
    // Exactly two added lines, nothing removed or moved.
    expect(gitOut(repo, ['diff', '--numstat', 'HEAD~1', 'HEAD'])).toBe(`2\t0\t${ROLES}`);
    // Anchored on the `developer:` key — `- determinism` also occurs under `architect:`.
    expect(readRoles(repo)).toBe(
      before.replace(
        '  developer:\n    - determinism\n',
        '  developer:\n    - determinism\n    - code-quality\n    - security\n',
      ),
    );
  });

  it('assigns a duplicated id once, and names it once in the commit subject', async () => {
    const result = await directiveAssignFn()({
      root: repo,
      options: { directive: 'testing,testing,security,testing', role: 'developer' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      directives: ['testing', 'security'],
      role: 'developer',
      assignments: ['testing', 'security'],
    });
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(directive): assign testing, security to developer');
  });

  it('trims whitespace around the ids of the list', async () => {
    const result = await directiveAssignFn()({
      root: repo,
      options: { directive: ' testing , security ', role: 'developer' },
    });
    expect(result.ok).toBe(true);
    expect(loadRolesYaml(repo).assignments.developer).toEqual(['testing', 'security']);
  });

  // BDD Scenario 3: "Error - the assignment set contains an unknown directive".
  it('Sc.3: one unknown id in the list persists NO partial assignment — exit 1, message names the unknown id', async () => {
    const before = readRoles(repo);
    const sha = head(repo);
    const result = await directiveAssignFn()({
      root: repo,
      options: { directive: 'testing,ghost', role: 'developer' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'unknown directive: ghost' });
    expect(exitCodeForResult(result)).toBe(1);
    // "no partial assignment is persisted": byte-identical file, no commit, and `testing` is still unbound.
    expect(readRoles(repo)).toBe(before);
    expect(head(repo)).toBe(sha);
    expect(loadRolesYaml(repo).assignments.developer).toBeUndefined();
  });

  it('Sc.3: names the FIRST unknown id in argument order when several are unknown (deterministic — REQ-SYS-07)', async () => {
    const first = await directiveAssignFn()({
      root: repo,
      options: { directive: 'ghost,phantom', role: 'developer' },
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error.message).toBe('unknown directive: ghost');

    const reversed = await directiveAssignFn()({
      root: repo,
      options: { directive: 'phantom,ghost', role: 'developer' },
    });
    expect(reversed.ok).toBe(false);
    if (reversed.ok) return;
    expect(reversed.error.message).toBe('unknown directive: phantom');
  });

  it('checks the role before any id of the list (REQ-SYS-08 first)', async () => {
    const result = await directiveAssignFn()({
      root: repo,
      options: { directive: 'testing,ghost', role: 'wizard' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("unknown role 'wizard' (not defined in dna.yaml)");
  });

  // D3 [AUTHORING] — a `--directive` value that contributes no ids is treated as an absent argument.
  // This CHANGES a task-051 behaviour: `--directive ""` used to reach `checkAssignable` and yield
  // exit 1 `unknown directive: ` (an empty id in the message). No test pinned that.
  it.each(['', '   ', ',', ' , , '])(
    'D3: `--directive %p` contributes no ids and is a usage error (exit 2), writing nothing',
    async (directive) => {
      const before = readRoles(repo);
      const sha = head(repo);
      const thrown = await thrownBy(directiveAssignFn()({ root: repo, options: { directive, role: 'developer' } }));
      expect(thrown).toBeInstanceOf(UsageError);
      expect(exitCodeForThrow(thrown)).toEqual({ reason: 'missing required argument: --directive', exitCode: 2 });
      expect(readRoles(repo)).toBe(before);
      expect(head(repo)).toBe(sha);
    },
  );

  // REQ-SYS-07 — the resulting order is a pure function of ARGUMENT order, never of the alphabet or
  // of `roles.yaml`'s mapping order. A stray `.sort()` anywhere on this path fails this case.
  it('orders the appended ids by argument order, not alphabetically', async () => {
    const other = makeRepoWithoutDeveloper();
    try {
      await directiveAssignFn()({ root: repo, options: { directive: 'security,code-quality', role: 'developer' } });
      await directiveAssignFn()({ root: other, options: { directive: 'code-quality,security', role: 'developer' } });
      expect(loadRolesYaml(repo).assignments.developer).toEqual(['security', 'code-quality']);
      expect(loadRolesYaml(other).assignments.developer).toEqual(['code-quality', 'security']);
      expect(readRoles(repo)).not.toBe(readRoles(other));
    } finally {
      removeTempDir(other);
    }
  });

  it('writes byte-identical roles.yaml for the same list in two independent repositories (REQ-SYS-07)', async () => {
    const other = makeRepoWithoutDeveloper();
    try {
      const options = { directive: 'testing,security', role: 'developer' };
      await directiveAssignFn()({ root: repo, options });
      await directiveAssignFn()({ root: other, options });
      expect(readRoles(repo)).toBe(readRoles(other));
    } finally {
      removeTempDir(other);
    }
  });

  // dl-051 / spec-012 §5.1 (task-055): `checkAssignable` requires every id to exist BEFORE the write,
  // so `directive assign` can never create a dangling binding — no matter how long the list. Since
  // task-096 (`bug-086`) that existence is checked against the tree committed at HEAD, which is what
  // makes the guarantee survive a clone; this fixture's directives are committed, so it still holds.
  it('creates no dangling-binding warning: every assigned id resolves to a directive file', async () => {
    await directiveAssignFn()({
      root: repo,
      options: { directive: 'testing,code-quality,security', role: 'developer' },
    });
    const listing = loadDirectiveListing(repo, 'developer');
    expect(listing.warnings.filter((warning) => warning.includes('has no directive file'))).toEqual([]);
    expect(listing.warnings.filter((warning) => warning.includes('no directives assigned to role'))).toEqual([]);
  });
});

describe('CORE_MODULES directive.directiveAssign — built-in assets, missing and hand-written roles.yaml', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeInitializedRepo();
  });

  afterEach(() => removeTempDir(repo));

  // AC6 — dl-030 / REQ-SEC-07: assigning a built-in is allowed and does not modify the asset.
  it('AC6: a directive that exists only under built-in/ is assignable; the asset file is untouched', async () => {
    const builtIn = '.wingfoil/directives/built-in/house-style.md';
    const content = '---\nid: house-style\nname: house-style\ntype: directive\nkind: built-in\ntitle: House style\n---\n\n# House style\n';
    writeFixtureFile(repo, builtIn, content);
    commitAll(repo, 'fixture: a built-in directive');

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'house-style', role: 'qa' } });
    expect(result.ok).toBe(true);
    expect(loadRolesYaml(repo).assignments.qa).toEqual(['testing', 'house-style']);
    expect(readFileSync(join(repo, builtIn), 'utf-8')).toBe(content);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES);
  });

  it('matches `--directive` against the directive id (roles.yaml binds by id), not a filename or title', async () => {
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'Testing', role: 'qa' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('unknown directive: Testing');
  });

  it('creates roles.yaml when the project has none yet (no bindings is legal), committing only that file', async () => {
    execFileSync('git', ['-C', repo, 'rm', '--quiet', ROLES]);
    execFileSync('git', ['-C', repo, 'commit', '--quiet', '-m', 'fixture: no roles.yaml']);

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(result.ok).toBe(true);
    expect(readRoles(repo)).toBe('version: 1\nassignments:\n  developer:\n    - testing\nglobal: []\n');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES);
    // task-169 AC3 / dl-062: "nothing to preserve", so no flag is needed and no warning is emitted.
    if (result.ok) expect(warningsOf(result)).toBeUndefined();
  });

  // task-169 / dl-062 Q1 option 3: `undefined` from the in-place editor is CONFLICT whether or not the
  // file has a `#` — the comment-free file used to be rewritten silently, at exit 0.
  it('fails closed (CONFLICT, exit 1, file and HEAD untouched) on a comment-free file the editor cannot edit', async () => {
    const text = 'version: 1.0\n\nassignments: {developer: [code-quality]}\nglobal: ["documentation"]\n';
    writeFixtureFile(repo, ROLES, text);
    commitAll(repo, 'fixture: flow-style roles.yaml without comments');
    const sha = head(repo);

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: 'CONFLICT', message: rewriteConflict('developer') });
    expect(exitCodeForResult(result)).toBe(1);
    expect(readRoles(repo)).toBe(text);
    expect(head(repo)).toBe(sha);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // D6 — bug-019's lesson: never a silent comment loss.
  it('fails closed (CONFLICT, exit 1, file untouched) when only a comment-discarding rewrite could apply it', async () => {
    const text = '# hand-written\nassignments:\n  developer: [code-quality]  # flow style\nglobal: []\n';
    writeFixtureFile(repo, ROLES, text);
    commitAll(repo, 'fixture: flow-style roles.yaml with comments');
    const sha = head(repo);

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: 'CONFLICT', message: rewriteConflict('developer') });
    expect(exitCodeForResult(result)).toBe(1);
    expect(readRoles(repo)).toBe(text);
    expect(head(repo)).toBe(sha);
  });

  // task-169 / dl-062 Q1 option 3: `--force` authorizes the whole-file rewrite, and the success
  // carries the warning that names what it normalizes.
  it('--force rewrites the whole file, commits only roles.yaml, and warns what the rewrite normalizes', async () => {
    writeFixtureFile(repo, ROLES, '# hand-written\nversion: 1.0\n\nassignments: {developer: [code-quality]}\nglobal: ["documentation"]\n');
    commitAll(repo, 'fixture: flow-style roles.yaml with a comment');
    const sha = head(repo);

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' }, force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ directives: ['testing'], role: 'developer', assignments: ['code-quality', 'testing'] });
    expect(warningsOf(result)).toEqual([FORCE_REWRITE_WARNING]);
    expect(readRoles(repo)).toBe('version: 1\nassignments:\n  developer:\n    - code-quality\n    - testing\nglobal:\n  - documentation\n');
    expect(gitOut(repo, ['rev-list', '--count', `${sha}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(directive): assign testing to developer');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(ROLES);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // task-169 review F3: the evidence for leaving "key order" out of the warning — the dump keeps it.
  it('characterization: --force keeps the top-level key order of the file it rewrites', async () => {
    writeFixtureFile(repo, ROLES, 'global: []\nassignments: {developer: [code-quality]}\nversion: 1\n');
    commitAll(repo, 'fixture: keys in an unusual order');

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' }, force: true });
    expect(result.ok).toBe(true);
    expect(readRoles(repo)).toBe('global: []\nassignments:\n  developer:\n    - code-quality\n    - testing\nversion: 1\n');
  });

  it('--force on a file the editor CAN edit keeps the in-place edit and emits no warning', async () => {
    const before = readRoles(repo);
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'security', role: 'developer' }, force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(warningsOf(result)).toBeUndefined();
    expect(readRoles(repo)).toBe(before.replace('    - determinism\n', '    - determinism\n    - security\n'));
  });

  it('--force with nothing to change writes nothing, commits nothing and emits no warning', async () => {
    const text = 'version: 1\nassignments: {developer: [code-quality]}\nglobal: []\n';
    writeFixtureFile(repo, ROLES, text);
    commitAll(repo, 'fixture: flow-style roles.yaml');
    const sha = head(repo);

    const result = await directiveAssignFn()({ root: repo, options: { directive: 'code-quality', role: 'developer' }, force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(warningsOf(result)).toBeUndefined();
    expect(result.commit).toBeUndefined();
    expect(readRoles(repo)).toBe(text);
    expect(head(repo)).toBe(sha);
  });

  // REQ-SYS-07: the written bytes are a pure function of (file, role, directive).
  it('writes byte-identical roles.yaml for the same assignment in two independent repositories', async () => {
    const other = makeInitializedRepo();
    try {
      await directiveAssignFn()({ root: repo, options: { directive: 'security', role: 'developer' } });
      await directiveAssignFn()({ root: other, options: { directive: 'security', role: 'developer' } });
      expect(readRoles(repo)).toBe(readRoles(other));
    } finally {
      removeTempDir(other);
    }
  });
});

describe('CORE_MODULES directive.directiveAssign — REQ-SEC-01 git-identity pre-flight (no configured identity)', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  let repo: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-dirassign-noid-'));
    execFileSync('git', ['-C', repo, 'init', '-q', '--initial-branch=main'], { encoding: 'utf-8' });
    const emptyConfig = join(repo, 'empty.gitconfig');
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
    rmSync(repo, { recursive: true, force: true });
  });

  it('refuses before reading anything (exit 1)', async () => {
    const result = await directiveAssignFn()({ root: repo, options: { directive: 'testing', role: 'developer' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: 'VALIDATION',
      message: 'git identity not configured (user.name/user.email)',
    });
    expect(exitCodeForResult(result)).toBe(1);
  });
});
