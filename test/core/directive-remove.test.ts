/**
 * P3.3 (US-6-07) — `wingfoil directive remove` core-op fit criteria, per
 * `docs/02_requirements/02_bdd/features/p3-directives/P3.3-directive-remove.feature` (all three
 * scenarios), `REQ-SEC-07` (both clauses: built-in immutability via task-042's `requireCustomAsset`,
 * and the still-referenced refusal this task owns per `dl-030-req-sec-07-referenced-asset-ownership`),
 * `spec-006-core-domain-api` §3 (`directiveRemove`, module `directive`, `mutates: true`, CLI
 * `wingfoil directive remove`, Tool `directive.remove` — `dl-041` B), `spec-008-cli-grammar` §4/§5
 * (exit codes), `spec-012-context-loader-relevance-filtering` §5/§5.1 + `dl-037` (custom wins over
 * built-in; the shadow warning), REQ-SEC-01 (identity pre-flight) — task-052-directive-remove.
 *
 * Exercises the REAL registered `CORE_MODULES` operation against THROWAWAY temp git repos carrying
 * the real `wingfoil init` scaffold — which, since `task-057-builtin-directive-templates` merged,
 * installs six REAL built-in directives under `.wingfoil/directives/built-in/` (`code-quality`,
 * `testing`, `code-review`, `architecture`, `security`, `documentation`). P3.3 Scenario 3 is
 * therefore exercised against a genuine shipped built-in, not a hand-made fixture.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject, loadDirectiveListing } from '../../src/core';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { deriveVerb, enumerateOperations } from '../../src/core/registry';
import { UsageError } from '../../src/core/usage-error';
import { renderCustomDirective } from '../../src/directives/create';
import { deriveMcpToolName } from '../../src/mcp/registrar';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const ROLES = '.wingfoil/roles.yaml';
const CUSTOM_DIR = '.wingfoil/directives/custom';
const BUILTIN_DIR = '.wingfoil/directives/built-in';

/** The real, registered `directive.directiveRemove` `CoreFn` — fails loudly if it is ever un-registered. */
function directiveRemoveFn(): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveRemove;
  if (!operation) throw new Error('fixture bug: "directiveRemove" operation not registered on the directive module');
  return operation.fn;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

function head(repo: string): string {
  return gitOut(repo, ['rev-parse', 'HEAD']);
}

/** A temp git repo with the REAL `wingfoil init` Scrum scaffold (6 built-ins, 4 custom, roles.yaml). */
function makeInitializedRepo(): string {
  const repo = makeTempGitRepo();
  const init = initWingfoilProject(repo, 'Scrum');
  if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  return repo;
}

/** Add a committed custom directive `name` (real `directive create` rendering), bound to nothing. */
function addCustomDirective(repo: string, name: string): void {
  writeFixtureFile(repo, `${CUSTOM_DIR}/${name}.md`, renderCustomDirective(name));
  commitAll(repo, `fixture: add custom directive ${name}`);
}

/** Bind `id` to `role` in the scaffold's `roles.yaml` (a fixture edit, not the assign command). */
function bind(repo: string, role: string, id: string): void {
  const file = join(repo, ROLES);
  const text = readFileSync(file, 'utf-8');
  const anchor = `  ${role}:\n`;
  if (!text.includes(anchor)) throw new Error(`fixture bug: no '${role}:' block in the scaffold roles.yaml`);
  writeFileSync(file, text.replace(anchor, `${anchor}    - ${id}\n`), 'utf-8');
  commitAll(repo, `fixture: bind ${id} to ${role}`);
}

/**
 * Drop `id` from the scaffold's `roles.yaml` `global:` block (a fixture edit), so nothing binds it.
 * Only the lines after `global:` are searched: the same `  - <id>` shape can appear in an
 * `assignments` list, and that one must stay.
 */
function unbindGlobal(repo: string, id: string): void {
  const file = join(repo, ROLES);
  const lines = readFileSync(file, 'utf-8').split('\n');
  const header = lines.indexOf('global:');
  if (header === -1) throw new Error('fixture bug: no top-level global: block in the scaffold roles.yaml');
  let end = lines.findIndex((l, i) => i > header && /^\S/.test(l));
  if (end === -1) end = lines.length;
  const at = lines.findIndex((l, i) => i > header && i < end && l === `  - ${id}`);
  if (at === -1) throw new Error(`fixture bug: '${id}' is not in the scaffold's global block`);
  lines.splice(at, 1);
  writeFileSync(file, lines.join('\n'), 'utf-8');
  commitAll(repo, `fixture: unbind global ${id}`);
}

async function thrownBy(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

describe('CORE_MODULES directive.directiveRemove — registration (spec-006 §3, dl-041 B)', () => {
  it('is registered on the SINGULAR `directive` module as a `mutates: true` operation', () => {
    const entry = enumerateOperations(CORE_MODULES).find(
      ({ module, operation }) => module.name === 'directive' && operation.name === 'directiveRemove',
    );
    expect(entry).toBeDefined();
    expect(entry?.operation.mutates).toBe(true);
    const plural = CORE_MODULES.find((module) => module.name === 'directives');
    expect(plural?.operations.directiveRemove).toBeUndefined();
  });

  it('derives the CLI command `directive remove` and the MCP Tool `directive.remove`', () => {
    const verb = deriveVerb('directive', 'directiveRemove');
    expect(verb).toBe('remove');
    expect(deriveMcpToolName('directive', verb)).toBe('directive.remove');
  });

  it('declares no flags and no value-bearing options — the name rides the bare positional (spec-008 §7)', () => {
    const operation = CORE_MODULES.find((m) => m.name === 'directive')?.operations.directiveRemove;
    expect(operation?.options).toBeUndefined();
    expect(operation?.flags).toBeUndefined();
  });
});

describe('CORE_MODULES directive.directiveRemove — P3.3 scenarios (initialized project)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeInitializedRepo();
  });

  afterEach(() => removeTempDir(repo));

  // BDD Scenario 1: "Remove an unreferenced custom directive".
  it('Sc.1: removes an unreferenced custom directive — file deleted, one scoped commit, exit 0', async () => {
    addCustomDirective(repo, 'legacy-rule');
    const file = join(repo, CUSTOM_DIR, 'legacy-rule.md');
    expect(existsSync(file)).toBe(true);
    const before = head(repo);

    const result = await directiveRemoveFn()({ root: repo, positional: 'legacy-rule' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value).toEqual({ name: 'legacy-rule', path: `${CUSTOM_DIR}/legacy-rule.md` });
    // "the directive file is deleted"
    expect(existsSync(file)).toBe(false);
    // "the removal is committed to git" — exactly one new commit, staging exactly that one path.
    expect(head(repo)).not.toBe(before);
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(result.commit?.sha).toBe(head(repo));
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(directive): remove legacy-rule');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean)).toEqual([
      `${CUSTOM_DIR}/legacy-rule.md`,
    ]);
    // The deletion is recorded as a deletion, not as an empty file.
    expect(gitOut(repo, ['show', '--name-status', '--format=', 'HEAD'])).toBe(`D\t${CUSTOM_DIR}/legacy-rule.md`);
    // Nothing else moved: the working tree is clean after the commit.
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // BDD Scenario 2: "Error - removing a directive still referenced" (REQ-SEC-07 clause (b), dl-030).
  it('Sc.2: refuses a directive still assigned to a role — exact P3.3 message, nothing removed, exit 1', async () => {
    addCustomDirective(repo, 'legacy-rule');
    bind(repo, 'developer', 'legacy-rule');
    const file = join(repo, CUSTOM_DIR, 'legacy-rule.md');
    const before = head(repo);

    const result = await directiveRemoveFn()({ root: repo, positional: 'legacy-rule' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // CONFLICT, not VALIDATION: the request is well-formed and the STATE refuses it — the same
    // distinction `directiveCreate` draws for `directive already exists: <name>`.
    expect(result.error).toEqual({
      code: 'CONFLICT',
      message: "cannot remove 'legacy-rule': still assigned to role 'developer'",
    });
    expect(exitCodeForResult(result)).toBe(1);
    // "the directive is not removed"
    expect(existsSync(file)).toBe(true);
    expect(head(repo)).toBe(before);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // BDD Scenario 3: "Error - removing a built-in directive" (REQ-SEC-07 clause (a), task-042).
  it('Sc.3: refuses a built-in directive by NAME — REQ-SEC-07\'s exact message, exit 1', async () => {
    const file = join(repo, BUILTIN_DIR, 'testing.md');
    // Guard the premise: task-057 really does ship this built-in into a fresh project.
    expect(existsSync(file)).toBe(true);
    const before = head(repo);
    const bytes = readFileSync(file, 'utf-8');

    const result = await directiveRemoveFn()({ root: repo, positional: 'testing' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // NOT the generic `cannot remove 'testing': not a directive under 'directives/custom/'` that
    // `requireCustomAsset('directive', 'testing')` returns for a bare NAME — task-042's reviewer
    // recorded that gap, and closing it is this task's hand-off.
    // task-042's `requireCustomAsset` returns `VALIDATION` for a failed structural pre-condition.
    expect(result.error).toEqual({ code: 'VALIDATION', message: 'built-in directives cannot be removed' });
    expect(exitCodeForResult(result)).toBe(1);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe(bytes);
    expect(head(repo)).toBe(before);
  });

  it('refuses every one of the six shipped built-ins by name (task-057)', async () => {
    for (const name of ['code-quality', 'testing', 'code-review', 'architecture', 'security', 'documentation']) {
      const result = await directiveRemoveFn()({ root: repo, positional: name });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('built-in directives cannot be removed');
      expect(existsSync(join(repo, BUILTIN_DIR, `${name}.md`))).toBe(true);
    }
  });

  it('an unknown directive name is NOT_FOUND — exit 1, nothing touched', async () => {
    const before = head(repo);
    const result = await directiveRemoveFn()({ root: repo, positional: 'ghost' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'unknown directive: ghost' });
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
  });

  // task-143 review finding 3: the loader's skipped-entry warnings ride the refusal's `details` (the
  // channel both surfaces render, task-130) instead of a core stderr write — the entry the user asked
  // to remove may be the one that was skipped. Nothing is printed by core.
  it('an unknown name with a skipped directive entry carries the skip warning in details, printing nothing', async () => {
    symlinkSync(join(repo, 'gone.md'), join(repo, '.wingfoil/directives/custom/ghost.md'));
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = await directiveRemoveFn()({ root: repo, positional: 'ghost' });
      if (result.ok) throw new Error('expected a refusal');
      expect(result.error).toEqual({
        code: 'NOT_FOUND',
        message: 'unknown directive: ghost',
        details: {
          issues: [
            {
              detail:
                "directive entry '.wingfoil/directives/custom/ghost.md' skipped: it is a symbolic link whose target does not exist",
            },
          ],
        },
      });
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
    }
  });

  it('a traversal-shaped name resolves to no directive — refused before any path is built', async () => {
    const before = head(repo);
    for (const name of ['../../etc/passwd', 'custom/legacy-rule', '..', 'built-in/testing']) {
      const result = await directiveRemoveFn()({ root: repo, positional: name });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({ code: 'NOT_FOUND', message: `unknown directive: ${name}` });
      expect(exitCodeForResult(result)).toBe(1);
    }
    expect(head(repo)).toBe(before);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  it.each([['an omitted', undefined], ['a blank', '   ']])(
    '%s <name> is a usage error — exit 2, spec-008 §5 wording',
    async (_label, positional) => {
      const thrown = await thrownBy(directiveRemoveFn()({ root: repo, positional }));
      expect(thrown).toBeInstanceOf(UsageError);
      expect((thrown as UsageError).message).toBe('missing required argument: <name>');
      expect(exitCodeForThrow(thrown).exitCode).toBe(2);
    },
  );
});

describe('CORE_MODULES directive.directiveRemove — REQ-SEC-07 clause (b): every referrer refuses', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeInitializedRepo();
  });

  afterEach(() => removeTempDir(repo));

  it('names the alphabetically FIRST role when several bind the id (REQ-SYS-07 — never YAML order)', async () => {
    // Scaffold: `traceability` is bound to reviewer, architect and product-owner, declared in that
    // order in roles.yaml; the message must be a pure function of content, so `architect` wins.
    const result = await directiveRemoveFn()({ root: repo, positional: 'traceability' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: 'CONFLICT',
      message: "cannot remove 'traceability': still assigned to role 'architect'",
    });
    expect(existsSync(join(repo, CUSTOM_DIR, 'traceability.md'))).toBe(true);
  });

  it('refuses a directive carried by `roles.yaml` `global` — it binds EVERY role', async () => {
    // Scaffold: `doc-versioning` is a custom directive in the `global:` list and in no `assignments`
    // entry. [AUTHORING] wording — P3.3 pins only the per-role form (see the task Execution Notes).
    const result = await directiveRemoveFn()({ root: repo, positional: 'doc-versioning' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: 'CONFLICT',
      message: "cannot remove 'doc-versioning': still assigned to every role via roles.yaml 'global'",
    });
    expect(exitCodeForResult(result)).toBe(1);
    expect(existsSync(join(repo, CUSTOM_DIR, 'doc-versioning.md'))).toBe(true);
  });

  it('a project with no roles.yaml has no bindings — removal proceeds (task-051/053 reading)', async () => {
    addCustomDirective(repo, 'legacy-rule');
    rmSync(join(repo, ROLES));
    commitAll(repo, 'fixture: drop roles.yaml');

    const result = await directiveRemoveFn()({ root: repo, positional: 'legacy-rule' });
    expect(result.ok).toBe(true);
    expect(existsSync(join(repo, CUSTOM_DIR, 'legacy-rule.md'))).toBe(false);
  });

  it('a directive bound by NO role and not global is removable even though other ids are bound', async () => {
    // The scaffold binds six ids across six roles plus four globals; none of them is `legacy-rule`,
    // so the referrer check must not refuse on the mere presence of other bindings.
    addCustomDirective(repo, 'legacy-rule');
    const result = await directiveRemoveFn()({ root: repo, positional: 'legacy-rule' });
    expect(result.ok).toBe(true);
    expect(existsSync(join(repo, CUSTOM_DIR, 'legacy-rule.md'))).toBe(false);
    // The binding file itself is never written by a removal.
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean)).toEqual([
      `${CUSTOM_DIR}/legacy-rule.md`,
    ]);
  });
});

describe('CORE_MODULES directive.directiveRemove — dl-037 / spec-012 §5.1: removing a custom shadow', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeInitializedRepo();
    // The scaffold binds every shipped built-in, `security` through `global` (task-133, dl-059), and a
    // bound id is refused for removal. Unbinding `security` first makes its custom shadow genuinely
    // removable, which is the case this suite is about.
    unbindGlobal(repo, 'security');
    addCustomDirective(repo, 'security');
  });

  afterEach(() => removeTempDir(repo));

  it('removing a custom directive that shadows a built-in leaves the built-in, which then wins', async () => {
    const custom = join(repo, CUSTOM_DIR, 'security.md');
    const builtin = join(repo, BUILTIN_DIR, 'security.md');
    const builtinBytes = readFileSync(builtin, 'utf-8');

    // Before: both files exist, spec-012 §5.1 kind-3 warning names the custom file as the winner.
    const before = loadDirectiveListing(repo);
    expect(before.warnings).toContain(
      `directive 'security' defined in directives/built-in/security.md, directives/custom/security.md; using directives/custom/security.md`,
    );

    // The CUSTOM file is what `directive remove security` targets (dl-037: custom wins), so the
    // removal is allowed even though the SAME id also names an immutable built-in.
    const result = await directiveRemoveFn()({ root: repo, positional: 'security' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ name: 'security', path: `${CUSTOM_DIR}/security.md` });
    expect(existsSync(custom)).toBe(false);
    // REQ-SEC-07: the built-in is untouched, byte for byte, and absent from the commit.
    expect(readFileSync(builtin, 'utf-8')).toBe(builtinBytes);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean)).toEqual([
      `${CUSTOM_DIR}/security.md`,
    ]);

    // After: the shadow is gone and the built-in is the only definition of the id.
    const after = loadDirectiveListing(repo);
    expect(after.warnings.filter((w) => w.includes("directive 'security' defined in"))).toEqual([]);
    expect(after.entries.filter((e) => e.frontmatter.id === 'security').map((e) => e.path)).toEqual([
      'directives/built-in/security.md',
    ]);
  });
  it('characterization: in the default scaffold a custom shadow of the now-global security is refused', async () => {
    // A separate repo: this suite's beforeEach unbinds `security` first. Here the scaffold is left as
    // `init` wrote it, so `security` is global (task-133, dl-059) and the referrer check refuses the
    // removal of its custom shadow, although the binding would still resolve to the built-in after it
    // (dl-037). Pins today's behaviour; whether that refusal is wanted is a policy question for the
    // coordinator, not settled here.
    const fresh = makeInitializedRepo();
    try {
      addCustomDirective(fresh, 'security');
      const before = head(fresh);
      const result = await directiveRemoveFn()({ root: fresh, positional: 'security' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({
        code: 'CONFLICT',
        message: "cannot remove 'security': still assigned to every role via roles.yaml 'global'",
      });
      expect(existsSync(join(fresh, CUSTOM_DIR, 'security.md'))).toBe(true);
      expect(head(fresh)).toBe(before);
    } finally {
      removeTempDir(fresh);
    }
  });
});

describe('CORE_MODULES directive.directiveRemove — REQ-SEC-01 git-identity pre-flight (no configured identity)', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  let repo: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-dirremove-noid-'));
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

  it('refuses before any deletion when the git identity is unset (REQ-SEC-01)', async () => {
    writeFixtureFile(repo, `${CUSTOM_DIR}/legacy-rule.md`, renderCustomDirective('legacy-rule'));
    const result = await directiveRemoveFn()({ root: repo, positional: 'legacy-rule' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: 'VALIDATION',
      message: 'git identity not configured (user.name/user.email)',
    });
    expect(exitCodeForResult(result)).toBe(1);
    expect(existsSync(join(repo, CUSTOM_DIR, 'legacy-rule.md'))).toBe(true);
  });
});
