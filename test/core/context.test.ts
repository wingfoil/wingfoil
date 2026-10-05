/**
 * `assembleExecutionContext` / `resolveRoleDirectives` (task-037-role-task-scoped-context,
 * REQ-STATE-05) — the Fit Criterion under test, verbatim: "The assembled context object exposes
 * separate `dna`, `memory`, `directives` sections; it contains 100% of the role's assigned directives
 * and 0 directives of other roles." (`docs/02_requirements/03_sard/03_state-context.md`).
 *
 * Second pass (review-gate reject) adds three contracts:
 * - the **prototype-key** defect: a role named `toString`/`constructor`/`valueOf`/`hasOwnProperty`
 *   must resolve to the globals like any other unbound role, never throw;
 * - **`dl-029-role-with-no-directive-assignments`** option (c): a role contributing no assignments of
 *   its own resolves to the globals **and** emits `no directives assigned to role '<role>'`
 *   (`p3-directives/P3.6-auto-load-by-role.feature`, edge scenario, as amended by dl-029);
 * - **spec-012 §5 "deduplicate by directive id"**, which the first pass claimed but never performed.
 *
 * `task-069-fix-archived-excluded-from-agent-context` adds REQ-STATE-06's archived-exclusion contract
 * (`dl-028-archived-states-excluded-from-context`, `bug-010-deprecated-reaches-agent-context`) — the
 * gap this module's own header used to document as deliberately unfixed.
 *
 * `task-055-auto-load-directives-by-role` adds `dl-037` (custom/ wins over built-in/, shadow reported),
 * `dl-042` D's dangling-binding warning, and the P3.6 BDD scenarios transcribed one-to-one.
 */
import { existsSync } from 'fs';
import { join } from 'path';

import { assembleExecutionContext, resolveRoleDirectives, selectDirectivesById } from '../../src/core/context';
import { loadDirectives, loadDnaYaml, loadMemoryYaml, loadRolesYaml, type DirectiveFile } from '../../src/core/loaders';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
      waiting: [ backlog, approved ]
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
    id_pattern: "adr-{n}-{slug}"
    states:
      sequence: [ draft, pending, accepted, superseded ]
      gates:
        pending: { reject: draft }
`;

const DNA_YAML = `
version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
    - name: reviewer
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = `
version: 1.0
assignments:
  developer:
    - code-quality
    - testing
  reviewer:
    - code-review
global:
  - doc-versioning
`;

/** Same config, but `intern` is bound to an explicitly empty directive list (dl-029: "contributes no
 * assignments of its own" covers an empty list exactly as it covers an absent key). */
const ROLES_YAML_WITH_EMPTY_INTERN = `
version: 1.0
assignments:
  developer:
    - code-quality
    - testing
  reviewer:
    - code-review
  intern: []
global:
  - doc-versioning
`;

function directiveMd(id: string, name: string): string {
  return `---
id: ${id}
name: "${name}"
type: directive
kind: custom
title: "${name}"
tags: [ custom ]
ref: []
---

# Directive — ${name}
`;
}

function writeFixtureConfig(root: string): void {
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/code-quality.md', directiveMd('code-quality', 'Code Quality'));
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', directiveMd('testing', 'Testing'));
  writeFixtureFile(root, '.wingfoil/directives/custom/code-review.md', directiveMd('code-review', 'Code Review'));
  writeFixtureFile(root, '.wingfoil/directives/custom/doc-versioning.md', directiveMd('doc-versioning', 'Doc Versioning'));
}

function writeTask(root: string, id: string, title: string, status = 'in-progress'): void {
  writeFixtureFile(
    root,
    `docs/04_memory/v0.1/${id}.md`,
    `---\nid: "${id}"\ntype: task\ntitle: "${title}"\nstatus: ${status}\n---\n\n# ${title}\n`,
  );
}

/** Load all four pillars from `repo` and assemble a context for one element — the wiring every
 * `assembleExecutionContext` test needs, so each describe supplies only what it varies. */
function assembleFrom(repo: string, role: string, type: string, elementId: string) {
  return assembleExecutionContext({
    root: repo,
    dna: loadDnaYaml(repo),
    memoryYaml: loadMemoryYaml(repo),
    directiveFiles: loadDirectives(repo),
    rolesYaml: loadRolesYaml(repo),
    role,
    element: { type, id: elementId },
  });
}

function writeAdr(root: string, id: string, title: string, status: string): void {
  writeFixtureFile(
    root,
    `docs/04_memory/design/adrs/${id}.md`,
    `---\nid: "${id}"\ntype: adr\ntitle: "${title}"\nstatus: ${status}\n---\n\n# ${title}\n`,
  );
}

describe('resolveRoleDirectives — role-scoped directive resolution (REQ-STATE-05)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureConfig(repo);
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  function resolveIds(role: string, files = loadDirectives(repo)): string[] {
    return resolveRoleDirectives(files, loadRolesYaml(repo), role).directives.map((d) => d.frontmatter.id);
  }

  it('includes 100% of the role\'s assigned directives plus global', () => {
    expect(resolveIds('developer')).toEqual(['code-quality', 'doc-versioning', 'testing']);
  });

  it('includes 0 directives of other roles', () => {
    expect(resolveIds('developer')).not.toContain('code-review');
  });

  it('a role with no assignments resolves to only the global directives', () => {
    expect(resolveIds('intern')).toEqual(['doc-versioning']);
  });

  it('is deterministic: sorted ascending by directive id, independent of file-system enumeration order', () => {
    const directives = loadDirectives(repo);
    const first = resolveIds('developer', directives);
    const second = resolveIds('developer', [...directives].reverse());
    expect(first).toEqual(second);
    expect(first).toEqual([...first].sort());
  });

  describe('Object.prototype role names (rejection_reason — inherited-property defect)', () => {
    // `assignments` is a plain object, so `assignments['toString']` reaches `Object.prototype` and
    // yields a *function*; spreading it threw `TypeError: ... is not iterable` in the first pass.
    it.each(['toString', 'constructor', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__proto__'])(
      'role %p resolves to the globals instead of throwing',
      (role) => {
        expect(() => resolveIds(role)).not.toThrow();
        expect(resolveIds(role)).toEqual(['doc-versioning']);
      },
    );

    it('a prototype-named role also carries the dl-029 no-assignments warning', () => {
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'toString');
      expect(resolution.warnings).toEqual(["no directives assigned to role 'toString'"]);
    });

    it('a role literally named `global` does not borrow the global list as its assignments', () => {
      // Guards the mirror-image mistake: `global` IS an own key of `RolesYaml`, but not of
      // `assignments`, so it must still be treated as an unbound role.
      expect(resolveIds('global')).toEqual(['doc-versioning']);
    });
  });

  describe('dl-029 option (c) — globals always, plus the operator warning (P3.6 edge scenario)', () => {
    it('emits no warning for a role that has its own assignments', () => {
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'developer');
      expect(resolution.warnings).toEqual([]);
    });

    it('emits the P3.6 warning verbatim for a role absent from `assignments`', () => {
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'intern');
      expect(resolution.warnings).toEqual(["no directives assigned to role 'intern'"]);
      expect(resolution.directives.map((d) => d.frontmatter.id)).toEqual(['doc-versioning']);
    });

    it('emits the same warning for a role bound to an explicitly empty list', () => {
      writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML_WITH_EMPTY_INTERN);
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'intern');
      expect(resolution.warnings).toEqual(["no directives assigned to role 'intern'"]);
      expect(resolution.directives.map((d) => d.frontmatter.id)).toEqual(['doc-versioning']);
    });
  });

  describe('spec-012 §5 — deduplicate by directive id', () => {
    beforeEach(() => {
      // Same id shipped twice (the built-in/custom stand-in overlap CLAUDE.md §3 anticipates).
      writeFixtureFile(repo, '.wingfoil/directives/built-in/testing.md', directiveMd('testing', 'Testing (built-in)'));
    });

    it('includes a duplicated directive id exactly once', () => {
      expect(resolveIds('developer')).toEqual(['code-quality', 'doc-versioning', 'testing']);
    });

    // task-055 — T1 AC-4, RED-FIRST: dl-037 A.1 flipped the accidental "smallest path wins" rule
    // (which picked `built-in/` because 'b' < 'c'); this assertion used to pin `built-in`.
    it('picks the same duplicate regardless of input order, and `custom/` wins (dl-037 A.1)', () => {
      const directives = loadDirectives(repo);
      const roles = loadRolesYaml(repo);
      const forward = resolveRoleDirectives(directives, roles, 'developer').directives;
      const reversed = resolveRoleDirectives([...directives].reverse(), roles, 'developer').directives;
      expect(reversed.map((d) => d.path)).toEqual(forward.map((d) => d.path));
      const testing = forward.find((d) => d.frontmatter.id === 'testing');
      expect(testing?.path).toBe(join('directives', 'custom', 'testing.md'));
      expect(testing?.frontmatter.name).toBe('Testing');
    });
  });

  // task-055-auto-load-directives-by-role — dl-037 (A.1 + B.1), spec-012 §5 as amended.
  describe('dl-037 — custom/ wins over built-in/, and the shadowed file is reported', () => {
    function file(path: string, id: string, name: string): DirectiveFile {
      return { path, frontmatter: { id, name, type: 'directive', kind: 'custom', title: name } as DirectiveFile['frontmatter'] };
    }

    beforeEach(() => {
      writeFixtureFile(repo, '.wingfoil/directives/built-in/testing.md', directiveMd('testing', 'Testing (built-in)'));
    });

    // T1 AC-5, RED-FIRST: the loser used to be dropped in silence.
    it('reports the shadowed directive through `warnings`, naming the id, both files and the winner', () => {
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'developer');
      const builtIn = join('directives', 'built-in', 'testing.md');
      const custom = join('directives', 'custom', 'testing.md');
      expect(resolution.warnings).toEqual([`directive 'testing' defined in ${builtIn}, ${custom}; using ${custom}`]);
    });

    it('does not report a shadowed id the role is not bound to', () => {
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'reviewer');
      expect(resolution.warnings).toEqual([]);
    });

    it('custom/ wins even when the built-in arrives with Windows separators (REQ-SEC-07 discriminator)', () => {
      const files = [
        file('directives\\built-in\\testing.md', 'testing', 'Built-in'),
        file('directives\\custom\\testing.md', 'testing', 'Custom'),
      ];
      const { directives } = resolveRoleDirectives(files, loadRolesYaml(repo), 'developer');
      expect(directives.find((d) => d.frontmatter.id === 'testing')?.frontmatter.name).toBe('Custom');
    });

    it('two files in the same tier break the tie on the smallest path, input-order independent', () => {
      const files = [
        file('directives/custom/z/testing.md', 'testing', 'Z'),
        file('directives/custom/a/testing.md', 'testing', 'A'),
      ];
      const roles = loadRolesYaml(repo);
      expect(resolveRoleDirectives(files, roles, 'developer').directives[0]?.frontmatter.name).toBe('A');
      expect(resolveRoleDirectives([...files].reverse(), roles, 'developer').directives[0]?.frontmatter.name).toBe('A');
    });

    it('the same file handed in twice still resolves to one directive (comparator tie is stable)', () => {
      const same = file('directives/custom/testing.md', 'testing', 'Only');
      const { byId } = selectDirectivesById([same, same]);
      expect([...byId.values()]).toEqual([same]);
    });

    // Second pass (rejection_reason): the shadow warning's path list is ascending regardless of input
    // order — fed in reverse, the warning string must be byte-identical (REQ-SYS-07).
    it('names the shadowing files in ascending path order even when the input arrives reversed', () => {
      const files = [
        file('directives/custom/testing.md', 'testing', 'Custom'),
        file('directives/built-in/testing.md', 'testing', 'Built-in'),
      ];
      const expected = [
        "directive 'testing' defined in directives/built-in/testing.md, directives/custom/testing.md; using directives/custom/testing.md",
      ];
      expect(selectDirectivesById(files).warnings).toEqual(expected);
      expect(selectDirectivesById([...files].reverse()).warnings).toEqual(expected);
    });

    it('selectDirectivesById is the shared rule: every shadowed id, sorted, without a role filter', () => {
      writeFixtureFile(repo, '.wingfoil/directives/built-in/code-review.md', directiveMd('code-review', 'Code Review (built-in)'));
      const { byId, warnings } = selectDirectivesById(loadDirectives(repo));
      expect([...byId.keys()]).toEqual(['code-quality', 'code-review', 'doc-versioning', 'testing']);
      expect(byId.get('code-review')?.path).toBe(join('directives', 'custom', 'code-review.md'));
      expect(warnings.map((w) => w.split(' defined')[0])).toEqual(["directive 'code-review'", "directive 'testing'"]);
    });
  });

  // task-055 — T1 AC-8, RED-FIRST: dl-042 D's "dangling binding" — a role bound to an id with no file.
  describe('dl-042 D — a dangling binding is reported, never silently skipped', () => {
    it('warns for a role-assigned id with no directive file', () => {
      writeFixtureFile(repo, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer:\n    - testing\n    - ghost-rule\nglobal:\n  - doc-versioning\n');
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'developer');
      expect(resolution.directives.map((d) => d.frontmatter.id)).toEqual(['doc-versioning', 'testing']);
      expect(resolution.warnings).toEqual(["directive 'ghost-rule' bound to role 'developer' has no directive file"]);
    });

    // Second pass (rejection_reason): dangling ids are reported ascending, never in roles.yaml order.
    it('reports several dangling ids in ascending id order, not roles.yaml listing order', () => {
      writeFixtureFile(repo, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer:\n    - zeta-rule\n    - alpha-rule\n    - testing\nglobal: []\n');
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'developer');
      expect(resolution.warnings).toEqual([
        "directive 'alpha-rule' bound to role 'developer' has no directive file",
        "directive 'zeta-rule' bound to role 'developer' has no directive file",
      ]);
    });

    it('warns for a dangling global too, after the no-assignments warning (fixed order)', () => {
      writeFixtureFile(repo, '.wingfoil/roles.yaml', 'version: 1.0\nassignments: {}\nglobal:\n  - security-secrets\n  - doc-versioning\n');
      const resolution = resolveRoleDirectives(loadDirectives(repo), loadRolesYaml(repo), 'intern');
      expect(resolution.warnings).toEqual([
        "no directives assigned to role 'intern'",
        "directive 'security-secrets' bound to role 'intern' has no directive file",
      ]);
    });
  });

  // task-055 — P3.6 BDD acceptance, transcribed scenario by scenario
  // (`docs/02_requirements/02_bdd/features/p3-directives/P3.6-auto-load-by-role.feature`).
  // T1 AC-1..AC-3: CHARACTERIZATION — task-037 already built this; pinned here with the feature's own
  // Background (developer → testing + code-quality; reviewer → code-review; intern unbound).
  describe('P3.6 — auto-load directives by role (BDD acceptance)', () => {
    function executeUnder(role: string) {
      writeTask(repo, 'task-101-alpha', 'Alpha task');
      return assembleFrom(repo, role, 'task', 'task-101-alpha');
    }

    it('Scenario: Directives auto-load at task execution — testing + code-quality, 100% of the role\'s set', () => {
      const context = executeUnder('developer');
      const ids = context.directives.map((d) => d.frontmatter.id);
      expect(ids).toEqual(expect.arrayContaining(['testing', 'code-quality']));
      const assigned = loadRolesYaml(repo).assignments['developer'] ?? [];
      expect(assigned.every((id) => ids.includes(id))).toBe(true);
    });

    it('Scenario: Only the executing role\'s directives are loaded — code-review is NOT loaded', () => {
      expect(executeUnder('developer').directives.map((d) => d.frontmatter.id)).not.toContain('code-review');
    });

    it("Scenario: Edge - a role with no assigned directives — only globals, plus the warning", () => {
      const context = executeUnder('intern');
      expect(context.directives.map((d) => d.frontmatter.id)).toEqual(loadRolesYaml(repo).global);
      expect(context.warnings).toContain("no directives assigned to role 'intern'");
    });
  });
});

describe('assembleExecutionContext — distinct addressable dna/memory/directives sections (REQ-STATE-05)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureConfig(repo);
    writeTask(repo, 'task-101-alpha', 'Alpha task');
    writeTask(repo, 'task-102-beta', 'Beta task');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  function assemble(role: string, elementId: string) {
    return assembleFrom(repo, role, 'task', elementId);
  }

  it('exposes distinct, individually addressable `dna`, `memory`, and `directives` sections', () => {
    const context = assemble('developer', 'task-101-alpha');
    expect(context.dna).toBeDefined();
    expect(context.memory).toBeDefined();
    expect(context.directives).toBeDefined();
    expect(context.dna.modules[0]?.name).toBe('core');
  });

  it('directives: 100% of the role\'s assigned directives, 0% of other roles\' (Fit Criterion, verbatim)', () => {
    const developerContext = assemble('developer', 'task-101-alpha');
    const developerIds = developerContext.directives.map((d) => d.frontmatter.id);
    expect(developerIds).toEqual(['code-quality', 'doc-versioning', 'testing']);
    expect(developerIds).not.toContain('code-review');

    const reviewerContext = assemble('reviewer', 'task-101-alpha');
    const reviewerIds = reviewerContext.directives.map((d) => d.frontmatter.id);
    expect(reviewerIds).toEqual(['code-review', 'doc-versioning']);
    expect(reviewerIds).not.toContain('code-quality');
    expect(reviewerIds).not.toContain('testing');
  });

  it('memory: scoped to the active task — the named element is present', () => {
    const context = assemble('developer', 'task-101-alpha');
    expect(context.memory).toHaveLength(1);
    expect(context.memory[0]?.frontmatter.id).toBe('task-101-alpha');
  });

  it('memory: an unrelated task is NOT present in the assembled context', () => {
    const context = assemble('developer', 'task-101-alpha');
    const ids = context.memory.map((doc) => doc.frontmatter.id);
    expect(ids).not.toContain('task-102-beta');
  });

  it('memory: an unresolvable element yields an empty (not thrown) memory section', () => {
    const context = assemble('developer', 'task-999-missing');
    expect(context.memory).toEqual([]);
  });

  it('is deterministic for unchanged inputs: assembling twice yields deep-equal output', () => {
    const first = assemble('developer', 'task-101-alpha');
    const second = assemble('developer', 'task-101-alpha');
    expect(second).toEqual(first);
  });

  it('surfaces the dl-029 warning on the assembled context, not only on the resolver', () => {
    expect(assemble('developer', 'task-101-alpha').warnings).toEqual([]);
    const intern = assemble('intern', 'task-101-alpha');
    expect(intern.warnings).toEqual(["no directives assigned to role 'intern'"]);
    expect(intern.directives.map((d) => d.frontmatter.id)).toEqual(['doc-versioning']);
  });

  it('assembles for a prototype-named role instead of throwing (rejection_reason)', () => {
    expect(() => assemble('constructor', 'task-101-alpha')).not.toThrow();
    const context = assemble('constructor', 'task-101-alpha');
    expect(context.directives.map((d) => d.frontmatter.id)).toEqual(['doc-versioning']);
    expect(context.memory[0]?.frontmatter.id).toBe('task-101-alpha');
  });

  it('a Memory document with unparseable frontmatter no longer aborts assembly (task-171, bug-031)', () => {
    // Until task-171 the element lookup threw on a malformed sibling visited *before* the target
    // (`task-100-*` sorts ahead of `task-101-alpha`). The scan is now tolerant: the sibling is skipped,
    // and the element still resolves.
    writeFixtureFile(repo, 'docs/04_memory/v0.1/task-100-broken.md', '---\nid: "task-100-broken\n---\n\nbody\n');
    expect(assemble('developer', 'task-101-alpha').memory.map((d) => d.frontmatter.id)).toEqual(['task-101-alpha']);
  });
});

/**
 * `task-069` / `bug-010-deprecated-reaches-agent-context` — REQ-STATE-06 as amended by
 * `dl-028-archived-states-excluded-from-context`: "A `deprecated` or `superseded` document never
 * appears in an assembled agent context nor in default `memory search` results, while remaining
 * present on disk and in git history." BDD `p1-memory/P1.9-memory-deprecate.feature`, Scenario
 * "Deprecated documents are excluded from default agent context".
 *
 * The exclusion here is the **archived set only**. `src/core/relevance.ts` additionally excludes
 * `draft` because spec-012 §6 filters *candidate* documents for relevance; this function resolves the
 * **subject** element the context is assembled for (spec-012 §3's `resolve-element` stage), so
 * excluding `draft` here would blank the context for the very element being worked on. dl-028 did not
 * widen the archived set to include `draft`, and these tests pin that boundary from both sides.
 */
describe('assembleExecutionContext — archived elements never reach the context (REQ-STATE-06, dl-028)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureConfig(repo);
    writeTask(repo, 'task-101-alpha', 'Alpha task');
    writeTask(repo, 'task-105-gone', 'Deprecated task', 'deprecated');
    writeTask(repo, 'task-106-early', 'Draft task', 'draft');
    writeAdr(repo, 'adr-001-live', 'Accepted decision', 'accepted');
    writeAdr(repo, 'adr-002-old', 'Superseded decision', 'superseded');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  function assemble(role: string, type: string, elementId: string) {
    return assembleFrom(repo, role, type, elementId);
  }

  it('AC1 — a `deprecated` element yields an empty `memory` section', () => {
    expect(assemble('developer', 'task', 'task-105-gone').memory).toEqual([]);
  });

  it('AC2 — a `superseded` element yields an empty `memory` section too, not only `deprecated`', () => {
    expect(assemble('developer', 'adr', 'adr-002-old').memory).toEqual([]);
  });

  it('AC2 — a non-archived element of the same type is unaffected', () => {
    const context = assemble('developer', 'adr', 'adr-001-live');
    expect(context.memory.map((doc) => doc.frontmatter.id)).toEqual(['adr-001-live']);
  });

  it('AC3 — a `draft` subject element still assembles: `draft` is not archived (dl-028)', () => {
    const context = assemble('developer', 'task', 'task-106-early');
    expect(context.memory.map((doc) => doc.frontmatter.id)).toEqual(['task-106-early']);
  });

  it('only `memory` is affected — `dna`, `directives` and `warnings` are identical to a live element', () => {
    const archived = assemble('developer', 'task', 'task-105-gone');
    const live = assemble('developer', 'task', 'task-101-alpha');
    expect(archived.directives).toEqual(live.directives);
    expect(archived.warnings).toEqual([]);
    expect(archived.dna).toEqual(live.dna);
  });

  it('the archived element remains on disk — excluded from the context, never deleted', () => {
    expect(existsSync(join(repo, 'docs/04_memory/v0.1/task-105-gone.md'))).toBe(true);
    expect(existsSync(join(repo, 'docs/04_memory/design/adrs/adr-002-old.md'))).toBe(true);
  });

  it('is deterministic: assembling an archived element twice yields deep-equal output (REQ-SYS-07)', () => {
    expect(assemble('developer', 'task', 'task-105-gone')).toEqual(assemble('developer', 'task', 'task-105-gone'));
  });
});
