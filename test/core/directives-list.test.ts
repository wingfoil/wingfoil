/**
 * `wingfoil directives list` — P3.4 (US-4-04), ground-truth BDD
 * `docs/02_requirements/02_bdd/features/p3-directives/P3.4-directives-list.feature`
 * (task-053-directives-list).
 *
 * Driven through the REGISTERED `directives.directivesList` operation in the production
 * `CORE_MODULES` array (`src/core/index.ts`), not through an internal helper: spec-006-core-domain-api
 * §3 makes that operation the contract both surfaces derive from, so asserting on it is asserting on
 * what `wingfoil directives list` and the `wingfoil://directives/list` Resource actually return.
 *
 * T1 classification (dl-014, recorded in the task's Execution Notes): the *enumeration* half of
 * Scenario 1 and the whole of Scenario 3 are **characterization** — `loadDirectives`
 * (`src/core/loaders.ts`) already walked `.wingfoil/directives/**` and returned `{path, frontmatter}`
 * per file before this task, and those cases were already green here. The **role-assignment** half of
 * Scenario 1 and all of Scenario 2 (`--role`) are **red-first**: nothing in the payload read
 * `roles.yaml`, and the operation declared no `--role` option at all. Each case below is labelled.
 *
 * Role binding is read off `spec-012-context-loader-relevance-filtering` §5 — a role's own
 * `roles.yaml` `assignments` entries PLUS the unconditional `global` list — and binds on
 * `frontmatter.id`, never `name` (`src/directives/schema.ts`'s `RolesYaml` doc: assignment values and
 * `global` entries are directive ids).
 *
 * `task-055-auto-load-directives-by-role` adds `dl-042-directives-list-output-contract` (A + D): the
 * payload becomes `{ entries, warnings }`. `warnings` reports every shadowed id (dl-037's rule, decided
 * once in `selectDirectivesById`, `src/core/context.ts`) and, under `--role`, is exactly the
 * `resolveRoleDirectives` warnings — the dl-029 no-assignments warning and the dangling-binding
 * warning. `entries` is unchanged: this listing still does not deduplicate — see the `shadowed id` cases.
 */
import { cpSync, symlinkSync } from 'fs';
import { join } from 'path';

import { buildDirectiveListing, CORE_MODULES, WINGFOIL_NOT_INITIALIZED } from '../../src/core';
import { resolveRoleDirectives } from '../../src/core/context';
import { loadDirectives, loadRolesYaml } from '../../src/core/loaders';
import type { CoreOperation } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { exitCodeForResult } from '../../src/core/exit-code';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/**
 * The contract shape one listed directive is expected to carry, declared structurally here rather
 * than imported, so this suite states the expectation independently of the implementation's own
 * exported type.
 */
interface ListedDirective {
  readonly path: string;
  readonly frontmatter: { readonly id: string; readonly name: string };
  readonly roles: readonly string[];
  readonly global: boolean;
  readonly assignment: string;
}

function findDirectivesList(): CoreOperation {
  const module = CORE_MODULES.find((entry) => entry.name === 'directives');
  if (!module) throw new Error('no `directives` module registered in CORE_MODULES');
  const operation = module.operations['directivesList'];
  if (!operation) throw new Error('no `directivesList` operation registered in the `directives` module');
  return operation;
}

/** Run the registered operation the way the CLI adapter does: `{ root, options }` (spec-006 §2). */
async function runList(root: string, options?: Record<string, string>): Promise<CoreResult<unknown>> {
  return findDirectivesList().fn({ root, options });
}

/** The listing payload (dl-042): the inventory entries plus the operator warnings channel. */
interface Listing {
  readonly entries: readonly ListedDirective[];
  readonly warnings: readonly string[];
}

/** Unwrap a successful listing payload, failing the test loudly (never silently) if the call errored. */
async function listingOk(root: string, options?: Record<string, string>): Promise<Listing> {
  const result = await runList(root, options);
  if (!result.ok) throw new Error(`expected coreOk, got ${result.error.code}: ${result.error.message}`);
  return result.value as Listing;
}

/** The entries of a successful listing. */
async function listOk(root: string, options?: Record<string, string>): Promise<readonly ListedDirective[]> {
  return (await listingOk(root, options)).entries;
}

function directiveDoc(id: string, name: string, scope?: string): string {
  const scopeLine = scope === undefined ? [] : [`scope: ${scope}`];
  return [`---`, `id: ${id}`, `name: "${name}"`, `type: directive`, `kind: custom`, `title: "${name}"`, ...scopeLine, `---`, ``, `# ${name}`, ``].join('\n');
}

/**
 * The BDD Background, transcribed: built-in directives plus one custom directive
 * `no-direct-db-access`. `roles.yaml` binds `testing` to `developer` (Scenario 2's `Given`),
 * `code-review` to `reviewer` only, and makes `security-secrets` global; `architecture` is present
 * on disk but named by nobody, which is the `unassigned` case.
 */
const ROLES_YAML = `version: 1.0
assignments:
  developer:
    - testing
    - no-direct-db-access
  reviewer:
    - code-review
  qa:
    - testing
global:
  - security-secrets
`;

/** The six P3.8 built-in ids (`dl-037` names them): the scenario's "6 built-in directives". */
const BUILT_IN_IDS = ['architecture', 'code-quality', 'code-review', 'documentation', 'security', 'testing'] as const;

function seedBuiltIns(root: string): void {
  for (const id of BUILT_IN_IDS) {
    writeFixtureFile(root, `.wingfoil/directives/built-in/${id}.md`, directiveDoc(id, id));
  }
}

describe('directivesList — P3.4 Scenario 1: list all directives with assignments', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    seedBuiltIns(repo);
    writeFixtureFile(repo, '.wingfoil/directives/custom/no-direct-db-access.md', directiveDoc('no-direct-db-access', 'No direct DB access'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Security & secrets', 'global'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
  });

  afterEach(() => removeTempDir(repo));

  // T1: CHARACTERIZATION — `loadDirectives` already enumerated both trees before this task.
  it('the output includes the 6 built-in directives and "no-direct-db-access"', async () => {
    const entries = await listOk(repo);
    const ids = entries.map((entry) => entry.frontmatter.id).sort();
    expect(ids).toEqual([...BUILT_IN_IDS, 'no-direct-db-access', 'security-secrets'].sort());
  });

  // T1: RED-FIRST — no role information existed in the payload.
  it('each directive shows its assigned roles', async () => {
    const entries = await listOk(repo);
    const byId = new Map(entries.map((entry) => [entry.frontmatter.id, entry]));
    expect(byId.get('testing')?.roles).toEqual(['developer', 'qa']);
    expect(byId.get('code-review')?.roles).toEqual(['reviewer']);
    expect(byId.get('no-direct-db-access')?.roles).toEqual(['developer']);
  });

  // T1: RED-FIRST — the BDD's literal alternative wording, asserted character-exact.
  it('a directive no role names shows the exact string "unassigned"', async () => {
    const entries = await listOk(repo);
    const architecture = entries.find((entry) => entry.frontmatter.id === 'architecture');
    expect(architecture).toBeDefined();
    expect(architecture?.roles).toEqual([]);
    expect(architecture?.global).toBe(false);
    expect(architecture?.assignment).toBe('unassigned');
  });

  // T1: RED-FIRST — an assigned directive must NOT read as "unassigned"; the roles are rendered.
  it('an assigned directive renders its roles, never "unassigned"', async () => {
    const entries = await listOk(repo);
    const testing = entries.find((entry) => entry.frontmatter.id === 'testing');
    expect(testing?.assignment).toBe('developer, qa');
    expect(entries.filter((entry) => entry.assignment === 'unassigned').map((entry) => entry.frontmatter.id)).toEqual([
      'architecture',
      'code-quality',
      'documentation',
      'security',
    ]);
  });

  // T1: RED-FIRST — `global` directives apply to every role (spec-012 §5), so they are neither
  // role-listed nor "unassigned".
  it('a `global` directive is flagged global and is not reported as unassigned (spec-012 §5)', async () => {
    const entries = await listOk(repo);
    const secrets = entries.find((entry) => entry.frontmatter.id === 'security-secrets');
    expect(secrets?.global).toBe(true);
    expect(secrets?.roles).toEqual([]);
    expect(secrets?.assignment).toBe('global (all roles)');
  });

  // T1: CHARACTERIZATION — the pre-existing `{path, frontmatter}` pair is preserved verbatim, so
  // this task's change is purely additive for every existing consumer.
  it('keeps the pre-existing `path` + `frontmatter` fields on every entry', async () => {
    const entries = await listOk(repo);
    const testing = entries.find((entry) => entry.frontmatter.id === 'testing');
    expect(testing?.path).toBe('directives/built-in/testing.md');
    expect(testing?.frontmatter.name).toBe('testing');
  });

  // REQ-SYS-07: the listing is a pure function of what is on disk — same inputs, deep-equal output.
  it('is deterministic — two calls return a deep-equal listing in the same order', async () => {
    expect(await listOk(repo)).toEqual(await listOk(repo));
  });
});

describe('directivesList — P3.4 Scenario 2: filter the listing by role', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    seedBuiltIns(repo);
    writeFixtureFile(repo, '.wingfoil/directives/custom/no-direct-db-access.md', directiveDoc('no-direct-db-access', 'No direct DB access'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Security & secrets', 'global'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
  });

  afterEach(() => removeTempDir(repo));

  // T1: RED-FIRST — the operation declared no `--role` option; the filter did not exist.
  it('only directives assigned to "developer" are listed, including "testing"', async () => {
    const entries = await listOk(repo, { role: 'developer' });
    const ids = entries.map((entry) => entry.frontmatter.id);
    expect(ids).toContain('testing');
    expect(ids).toContain('no-direct-db-access');
    expect(ids).not.toContain('code-review');
    expect(ids).not.toContain('architecture');
  });

  // T1: RED-FIRST — globals are unconditional (spec-012 §5), so they belong to `developer` too.
  it('includes the `global` directives, which are assigned to every role (spec-012 §5)', async () => {
    const ids = (await listOk(repo, { role: 'developer' })).map((entry) => entry.frontmatter.id);
    expect(ids).toContain('security-secrets');
    expect(ids.slice().sort()).toEqual(['no-direct-db-access', 'security-secrets', 'testing']);
  });

  // T1: RED-FIRST — dl-029: a role with no bindings of its own is never an error; it still gets globals.
  it('a role with no assignments of its own lists exactly the globals, exit-0 (dl-029)', async () => {
    const result = await runList(repo, { role: 'architect' });
    expect(result.ok).toBe(true);
    const ids = ((result as { value: Listing }).value).entries.map((entry) => entry.frontmatter.id);
    expect(ids).toEqual(['security-secrets']);
  });

  // `roles.yaml` hygiene: a role listing the same directive id twice is a config typo, not a reason
  // to report that role twice on the entry.
  it('a role listing the same directive id twice reports that role once', async () => {
    writeFixtureFile(
      repo,
      '.wingfoil/roles.yaml',
      'version: 1.0\nassignments:\n  developer:\n    - testing\n    - testing\nglobal: []\n',
    );
    const entries = await listOk(repo);
    const testing = entries.find((entry) => entry.frontmatter.id === 'testing');
    expect(testing?.roles).toEqual(['developer']);
    expect(testing?.assignment).toBe('developer');
  });

  // A directive id that collides with an `Object.prototype` member must not resolve through the
  // prototype chain (same hazard `ownAssignments` guards in `src/core/context.ts`).
  it('a directive id shadowing an Object.prototype member is unassigned, not a prototype member', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/constructor.md', directiveDoc('constructor', 'Constructor'));
    const entries = await listOk(repo);
    const entry = entries.find((item) => item.frontmatter.id === 'constructor');
    expect(entry?.roles).toEqual([]);
    expect(entry?.assignment).toBe('unassigned');
  });
});

describe('directivesList — P3.4 Scenario 3 (edge): only built-ins exist', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    seedBuiltIns(repo);
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
  });

  afterEach(() => removeTempDir(repo));

  // T1: CHARACTERIZATION — an empty `custom/` tree simply contributes no entries.
  it('exactly the 6 built-in directives are listed', async () => {
    const entries = await listOk(repo);
    expect(entries.map((entry) => entry.frontmatter.id)).toEqual([...BUILT_IN_IDS]);
  });
});

describe('directivesList — roles.yaml availability', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing'));
  });

  afterEach(() => removeTempDir(repo));

  // T1: RED-FIRST — a project may hold directives before anyone binds them (REQ-SYS-02 pillar
  // isolation). A missing `roles.yaml` means "no bindings", not a failed command.
  it('a missing roles.yaml lists every directive as "unassigned" and still succeeds', async () => {
    const entries = await listOk(repo);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.roles).toEqual([]);
    expect(entries[0]?.global).toBe(false);
    expect(entries[0]?.assignment).toBe('unassigned');
  });

  // A roles.yaml that EXISTS but does not validate is a real failure — only ENOENT is tolerated.
  it('a schema-invalid roles.yaml surfaces as a VALIDATION error, not as "unassigned"', async () => {
    writeFixtureFile(repo, '.wingfoil/roles.yaml', 'version: 1.0\nassignments: "not-a-record"\n');
    const result = await runList(repo);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  // T1: CHARACTERIZATION — an invalid directive file already failed the whole load (task-004).
  it('a schema-invalid directive file still surfaces as a VALIDATION error', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/broken.md', '---\nid: broken\ntype: not-a-directive\nkind: custom\ntitle: Broken\n---\n');
    const result = await runList(repo);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});

describe('directivesList — a shadowed id is listed, never hidden (dl-037 / spec-012 §5)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/directives/built-in/testing.md', directiveDoc('testing', 'Testing (built-in)'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing (custom)'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
  });

  afterEach(() => removeTempDir(repo));

  /**
   * This listing is an INVENTORY of the directive files installed, not the resolved per-role set
   * `resolveRoleDirectives` produces. It therefore does not deduplicate by id: when a built-in and a
   * custom file share an id, BOTH are listed, each with its own `path`. Hiding one would be the same
   * defect `dl-037` was raised about ("a shadowed directive is reported, never silently dropped",
   * spec-012 §5) reproduced in the one command whose purpose is directive visibility. Choosing the
   * winner, and warning about the loser, stays `task-055-auto-load-directives-by-role`'s job.
   */
  it('lists both files sharing an id, each with its own path', async () => {
    const entries = (await listOk(repo)).filter((entry) => entry.frontmatter.id === 'testing');
    expect(entries.map((entry) => entry.path)).toEqual(['directives/built-in/testing.md', 'directives/custom/testing.md']);
    expect(entries.map((entry) => entry.frontmatter.name)).toEqual(['Testing (built-in)', 'Testing (custom)']);
  });

  it('keeps both under a `--role` filter too — the shadowed file is never silently dropped', async () => {
    const entries = (await listOk(repo, { role: 'developer' })).filter((entry) => entry.frontmatter.id === 'testing');
    expect(entries).toHaveLength(2);
    entries.forEach((entry) => expect(entry.roles).toEqual(['developer', 'qa']));
  });
});

// task-055-auto-load-directives-by-role — dl-042 A + D (T1 AC-6..AC-9, RED-FIRST): the listing gains a
// `warnings` channel alongside `entries`, instead of leaving the winner and unbound roles to inference.
describe('directivesList — the warnings channel (dl-042 A + D)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/directives/built-in/testing.md', directiveDoc('testing', 'Testing (built-in)'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing (custom)'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Security & secrets', 'global'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/code-review.md', directiveDoc('code-review', 'Code review'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
  });

  afterEach(() => removeTempDir(repo));

  const SHADOW_WARNING =
    "directive 'testing' defined in directives/built-in/testing.md, directives/custom/testing.md; using directives/custom/testing.md";

  it('A — without --role, a shadowed id is reported, naming both files and the custom/ winner (dl-037)', async () => {
    const listing = await listingOk(repo);
    expect(listing.warnings).toEqual([SHADOW_WARNING]);
    // The inventory itself is unchanged: both files still listed.
    expect(listing.entries.filter((entry) => entry.frontmatter.id === 'testing')).toHaveLength(2);
  });

  it('A — no duplicate ids means an empty warnings array, not an absent one', async () => {
    removeTempDir(repo);
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
    expect((await listingOk(repo)).warnings).toEqual([]);
  });

  it('D — --role for a role with no assignments emits the dl-029 warning and still lists the globals', async () => {
    const listing = await listingOk(repo, { role: 'architect' });
    expect(listing.warnings).toEqual(["no directives assigned to role 'architect'"]);
    expect(listing.entries.map((entry) => entry.frontmatter.id)).toEqual(['security-secrets']);
  });

  it('D — --role with a dangling binding (id with no file) emits a warning naming the id and role', async () => {
    // ROLES_YAML binds `developer` to `no-direct-db-access`, which this fixture does not install.
    const listing = await listingOk(repo, { role: 'developer' });
    expect(listing.warnings).toEqual([
      "directive 'no-direct-db-access' bound to role 'developer' has no directive file",
      SHADOW_WARNING,
    ]);
  });

  it('D — --role with no roles.yaml at all is an unbound role: warning, exit 0', async () => {
    removeTempDir(repo);
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing'));
    const listing = await listingOk(repo, { role: 'developer' });
    expect(listing.entries).toEqual([]);
    expect(listing.warnings).toEqual(["no directives assigned to role 'developer'"]);
  });

  it('a bound role with nothing dangling and nothing shadowed yields no warnings', async () => {
    expect((await listingOk(repo, { role: 'reviewer' })).warnings).toEqual([]);
  });

  it('one rule: under --role the listing warnings are exactly resolveRoleDirectives\' warnings', async () => {
    for (const role of ['developer', 'reviewer', 'architect', 'qa']) {
      const expected = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), role).warnings;
      expect((await listingOk(repo, { role })).warnings).toEqual(expected);
    }
  });
});

// task-143 (bug-125), RED-FIRST: a dangling symlink no longer takes the whole listing down — it is
// skipped and named on the listing's own warnings channel (dl-042), ahead of the shadow warnings.
// Transcribes the P3.4 feature's "Edge - a directive entry that cannot be read" scenario.
describe('directivesList — a dangling symlink is skipped and reported (task-143, bug-125)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing'));
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
    symlinkSync(join(repo, 'gone.md'), join(repo, '.wingfoil/directives/custom/dangling.md'));
  });

  afterEach(() => removeTempDir(repo));

  const WARNING =
    "directive entry '.wingfoil/directives/custom/dangling.md' skipped: it is a symbolic link whose target does not exist";

  it('lists the other directives, exit 0, with a warning naming the link', async () => {
    const result = await runList(repo);
    expect(exitCodeForResult(result)).toBe(0);
    const listing = await listingOk(repo);
    expect(listing.entries.map((entry) => entry.frontmatter.id)).toEqual(['testing']);
    expect(listing.warnings).toEqual([WARNING]);
  });

  it('buildDirectiveListing called without skipped warnings adds none (the parameter is optional)', () => {
    expect(buildDirectiveListing([], undefined).warnings).toEqual([]);
    expect(buildDirectiveListing([], undefined, undefined, ['w']).warnings).toEqual(['w']);
  });

  it('under --role the skipped entry comes first, before the role warnings', async () => {
    const listing = await listingOk(repo, { role: 'developer' });
    expect(listing.entries.map((entry) => entry.frontmatter.id)).toEqual(['testing']);
    expect(listing.warnings).toEqual([
      WARNING,
      "directive 'no-direct-db-access' bound to role 'developer' has no directive file",
      "directive 'security-secrets' bound to role 'developer' has no directive file",
    ]);
  });
});

// task-143 (bug-154), RED-FIRST: with no `.wingfoil/` at the root the listing used to answer an empty
// inventory with exit 0 — and, under `--role`, a "no directives assigned" warning nothing was read to
// establish. It now refuses like its sibling reads, with the one shared not-initialized message.
describe('directivesList — a project with no configuration is refused (task-143, bug-154)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => removeTempDir(repo));

  it.each([
    ['without --role', undefined],
    ['with --role developer', { role: 'developer' }],
  ])('%s: exit 1 with the not-initialized message, naming no absolute path', async (_label, options) => {
    const result = await runList(repo, options);
    expect(exitCodeForResult(result)).toBe(1);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toBe(WINGFOIL_NOT_INITIALIZED);
    expect(result.error.message).not.toContain(repo);
  });

  it('a `.wingfoil` that is a file, not a directory, is refused the same way', async () => {
    writeFixtureFile(repo, '.wingfoil', 'not a directory\n');
    const result = await runList(repo);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error.message).toBe(WINGFOIL_NOT_INITIALIZED);
  });

  it('the message says the project is not initialized and how to fix it', () => {
    expect(WINGFOIL_NOT_INITIALIZED).toContain('not initialized');
    expect(WINGFOIL_NOT_INITIALIZED).toContain('wingfoil init');
  });

  it('an initialized project that declares no directives still lists nothing, exit 0 (characterization)', async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'version: 1.1\n');
    const result = await runList(repo);
    expect(exitCodeForResult(result)).toBe(0);
    expect(await listingOk(repo)).toEqual({ entries: [], warnings: [] });
  });
});

// task-144 (bug-148; RED-FIRST) — a directive's `scope: global` frontmatter and `roles.yaml`'s `global:`
// list declare the same fact twice. `roles.yaml` stays the authority (spec-013, Revision 2026-10-01): the
// entry's `global`/`assignment` follow it alone. When the two disagree, in either direction, the
// unfiltered listing names the disagreement in its own `warnings` array — not only on stderr. The first
// case transcribes P3.4's "Edge - a directive's scope disagrees with roles.yaml" scenario.
describe('directivesList — `scope` against roles.yaml `global:` (task-144, bug-148)', () => {
  let repo: string;

  const ROLES = `version: 1
assignments:
  developer:
    - testing
global:
  - security-secrets
`;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES);
  });

  afterEach(() => removeTempDir(repo));

  it('a directive declaring `scope: global` that roles.yaml `global:` omits is named in `warnings`', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing', 'global'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Secrets', 'global'));
    const listing = await listingOk(repo);
    expect(listing.warnings).toEqual([
      "directive 'testing' declares scope: global in directives/custom/testing.md, but roles.yaml 'global' does not list it; roles.yaml decides: not global",
    ]);
    // roles.yaml stays the authority: the entry is NOT global.
    const entry = listing.entries.find((e) => e.frontmatter.id === 'testing');
    expect(entry?.global).toBe(false);
    expect(entry?.assignment).toBe('developer');
  });

  // Approver ruling R3 (2026-10-02): an ABSENT scope is not a disagreement — only a declared one is.
  it('a directive roles.yaml `global:` lists that declares no `scope` is not a disagreement', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Secrets'));
    const listing = await listingOk(repo);
    expect(listing.warnings).toEqual([]);
    expect(listing.entries.find((e) => e.frontmatter.id === 'security-secrets')?.global).toBe(true);
  });

  it('a directive roles.yaml `global:` lists that declares another scope is named in `warnings` (the reverse)', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Secrets', 'team'));
    const listing = await listingOk(repo);
    expect(listing.warnings).toEqual([
      "directive 'security-secrets' declares scope: team in directives/custom/security-secrets.md, but roles.yaml 'global' lists it; roles.yaml decides: global",
    ]);
    expect(listing.entries.find((e) => e.frontmatter.id === 'security-secrets')?.global).toBe(true);
  });

  // Approver ruling R2 (2026-10-02): a value other than `global` is a listing warning, never a failure.
  it('a `scope` spec-013 does not define is named in `warnings`, and the listing still succeeds', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing', 'team'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Secrets'));
    expect((await listingOk(repo)).warnings).toEqual([
      "directive 'testing' declares scope: team in directives/custom/testing.md, which spec-013 does not define (only global); it has no effect",
    ]);
  });

  it('the two sites agreeing yields no scope warning', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Secrets', 'global'));
    expect((await listingOk(repo)).warnings).toEqual([]);
  });

  it('a global id with no directive file is not a scope disagreement (nothing declares anything)', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing'));
    expect((await listingOk(repo)).warnings).toEqual([]);
  });

  it('for a shadowed id only the file in force is compared, after the shadow warning', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/built-in/security-secrets.md', directiveDoc('security-secrets', 'Secrets (built-in)'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Secrets', 'global'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing', 'global'));
    expect((await listingOk(repo)).warnings).toEqual([
      "directive 'security-secrets' defined in directives/built-in/security-secrets.md, directives/custom/security-secrets.md; using directives/custom/security-secrets.md",
      "directive 'testing' declares scope: global in directives/custom/testing.md, but roles.yaml 'global' does not list it; roles.yaml decides: not global",
    ]);
  });

  it('with no roles.yaml, a `scope: global` declaration is still reported — nothing makes it global', async () => {
    removeTempDir(repo);
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing', 'global'));
    expect((await listingOk(repo)).warnings).toEqual([
      "directive 'testing' declares scope: global in directives/custom/testing.md, but roles.yaml 'global' does not list it; roles.yaml decides: not global",
    ]);
  });

  it('under --role the warnings stay exactly resolveRoleDirectives\' (dl-042 D): the role view is not the config audit', async () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/testing.md', directiveDoc('testing', 'Testing', 'global'));
    writeFixtureFile(repo, '.wingfoil/directives/custom/security-secrets.md', directiveDoc('security-secrets', 'Secrets', 'team'));
    const expected = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'developer').warnings;
    expect((await listingOk(repo, { role: 'developer' })).warnings).toEqual(expected);
  });
});

// task-144 (bug-113, bug-148) — this repository's own configuration: every directive's `scope` agrees
// with `roles.yaml`, so `directives list` here reports no scope warning.
describe('directivesList — the live configuration declares `scope` consistently (task-144)', () => {
  it('reports no warning on this repository', async () => {
    const liveRoot = join(__dirname, '..', '..');
    expect((await listingOk(liveRoot)).warnings).toEqual([]);
  });

  // task-178 (dl-119 Q2 (b)): `git-conventions` binds every role, the approver included — the role
  // that writes the approve/reject commits its subject and attribution clauses govern.
  it('lists git-conventions as global under --role approver', async () => {
    const liveRoot = join(__dirname, '..', '..');
    const entries = await listOk(liveRoot, { role: 'approver' });
    const gitConventions = entries.filter((entry) => entry.frontmatter.id === 'git-conventions');
    expect(gitConventions.map((entry) => [entry.path, entry.global])).toEqual([
      ['directives/custom/git-conventions.md', true],
    ]);
  });
});

// Approver ruling R3 (2026-10-02): a project scaffolded by the released `wingfoil@0.2.2 init` — whose
// directives declare no `scope` — lists with 0 warnings. The fixture is that build's output, captured
// verbatim (`node node_modules/wingfoil-released/dist/cli.js init --template Scrum`, 0.2.2):
// `.wingfoil/roles.yaml` and `.wingfoil/directives/**`.
describe('directivesList — a project made by wingfoil@0.2.2 init (task-144 review, R3)', () => {
  it('reports no warning', async () => {
    const repo = makeTempGitRepo();
    try {
      const fixture = join(__dirname, 'fixtures', 'init-0.2.2');
      cpSync(join(fixture, '.wingfoil'), join(repo, '.wingfoil'), { recursive: true });
      const listing = await listingOk(repo);
      expect(listing.entries).toHaveLength(10);
      expect(listing.warnings).toEqual([]);
    } finally {
      removeTempDir(repo);
    }
  });
});
