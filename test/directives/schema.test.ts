/**
 * DirectiveFrontmatter schema (task-004-decoupled-pillars, REQ-SYS-02) — the fourth pillar named by
 * the task's Acceptance Criteria ("directives/*.yaml ... validate against their own Zod schema
 * independently"). The shape is specified by the approved `spec-013-directive-frontmatter-schema`
 * (written as task-004's fast-follow); `name` is required per
 * `p3-directives/P3.5-project-directives.feature`'s "missing required header fields" scenario.
 * `task-144` declares the optional `scope` and `version` keys (bug-113, bug-148; approver ruling
 * 2026-10-01).
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { loadDirectiveInventory, loadDirectives } from '../../src/core/loaders';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DirectiveFrontmatter, RolesYaml } from '../../src/directives/schema';
import { extractFrontmatter } from '../../src/storage/frontmatter';
import { emitUnknownFieldWarning } from '../../src/validation/warning';

describe('DirectiveFrontmatter — structural shape', () => {
  it('accepts the shape common to every current directive file', () => {
    const result = DirectiveFrontmatter.safeParse({
      id: 'code-quality',
      name: 'Code Quality',
      type: 'directive',
      kind: 'custom',
      title: 'Code Quality',
      tags: ['custom', 'code-quality', 'typescript'],
      ref: ['P3.8'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a document missing `id`', () => {
    const result = DirectiveFrontmatter.safeParse({ type: 'directive', kind: 'custom', title: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a document whose `type` is not "directive"', () => {
    const result = DirectiveFrontmatter.safeParse({
      id: 'x',
      name: 'X',
      type: 'task',
      kind: 'custom',
      title: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a document missing `name` (BDD p3-directives/P3.5, "missing required header fields")', () => {
    const result = DirectiveFrontmatter.safeParse({ id: 'x', type: 'directive', kind: 'custom', title: 'x' });
    expect(result.success).toBe(false);
  });

  it('preserves unknown fields (`.passthrough()`), e.g. `owner`', () => {
    const result = DirectiveFrontmatter.safeParse({
      id: 'doc-versioning',
      name: 'Documentation versioning',
      type: 'directive',
      kind: 'custom',
      title: 'Documentation versioning',
      owner: 'docs-team',
      ref: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).owner).toBe('docs-team');
    }
  });
});

/**
 * task-144 (bug-113, bug-148; approver ruling 2026-10-01) — `scope` and `version` are DECLARED optional
 * keys of the directive frontmatter (spec-013's field table), so a directive carrying either one no
 * longer trips spec-009's unknown-field warning. RED-FIRST: before this task both rode `.passthrough()`.
 */
describe('DirectiveFrontmatter — declared optional `scope` and `version` (task-144)', () => {
  const base = { id: 'doc-versioning', name: 'Doc versioning', type: 'directive', kind: 'custom', title: 'Doc versioning' };

  function stderrOf(fn: () => void): string {
    const writes: string[] = [];
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
    return writes.join('');
  }

  it('declares both keys in the schema shape', () => {
    expect(Object.keys(DirectiveFrontmatter.shape)).toEqual(expect.arrayContaining(['scope', 'version']));
  });

  it('`scope: global` and `version: "1.2"` produce no unknown-field warning', () => {
    const raw = { ...base, scope: 'global', version: '1.2' };
    expect(DirectiveFrontmatter.safeParse(raw).success).toBe(true);
    expect(stderrOf(() => emitUnknownFieldWarning(raw, DirectiveFrontmatter, 'x.md'))).toBe('');
  });

  it('both keys stay optional', () => {
    expect(DirectiveFrontmatter.safeParse(base).success).toBe(true);
  });

  // Approver ruling R2 (2026-10-02): spec-013's forward-compatibility rule — a `scope` other than
  // `global` is reported by `directives list`, never a validation failure of the whole pillar.
  it('`scope` accepts any string — an undefined value is a listing warning, not a validation error', () => {
    expect(DirectiveFrontmatter.safeParse({ ...base, scope: 'global' }).success).toBe(true);
    expect(DirectiveFrontmatter.safeParse({ ...base, scope: 'team' }).success).toBe(true);
  });

  // Approver ruling R1 (2026-10-02): `version` accepts a number or a string, like memory.yaml and
  // roles.yaml; an unquoted `version: 1.2` must not fail the Directives pillar.
  it('`version` accepts a string or a number', () => {
    expect(DirectiveFrontmatter.safeParse({ ...base, version: '1.10' }).success).toBe(true);
    expect(DirectiveFrontmatter.safeParse({ ...base, version: 1.2 }).success).toBe(true);
  });

  it('loading the live directives prints no unknown-field warning (bug-113 reproduced on this repository)', () => {
    const liveRoot = join(__dirname, '..', '..');
    expect(stderrOf(() => loadDirectives(liveRoot))).not.toMatch(/unknown field/);
  });

  it('command-baseline carries its version as the frontmatter key, not a body line, bumped to 1.4 (approver rulings 2026-10-01, R4 2026-10-02; task-247)', () => {
    const raw = readFileSync(join(__dirname, '..', '..', '.wingfoil', 'directives', 'custom', 'command-baseline.md'), 'utf-8');
    const fm = load(extractFrontmatter(raw) as string) as Record<string, unknown>;
    expect(fm.version).toBe('1.4');
    expect(raw).not.toMatch(/^\*\*Version:\*\*/m);
  });
});

/**
 * Approver ruling R1 (2026-10-02) — a `version` is never a whole-pillar failure. An unquoted YAML number
 * that does not read back as written (`1.10` → `1.1`, `1.0` → `1`) loads, with a warning telling the
 * author to quote it; a value that is neither a string nor a number loads without it, with a warning.
 * RED-FIRST against task-144's first pass, which declared `version` as a string only. Since task-143,
 * `src/core` prints nothing: the warning rides `loadDirectiveInventory`'s `warnings` (the list
 * `directives list` puts in its payload) and stderr stays empty (spec-005 §3.2 under `--format json`).
 */
describe('loadDirectives — `version` never fails the pillar (task-144 review, R1)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  function seed(versionLine: string): void {
    writeFixtureFile(
      repo,
      '.wingfoil/directives/custom/x.md',
      `---\nid: x\nname: x\ntype: directive\nkind: custom\ntitle: x\n${versionLine}\n---\n\n# x\n`,
    );
  }

  function load2(): { stderr: string; warnings: string; version: unknown } {
    const writes: string[] = [];
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      const { files, warnings } = loadDirectiveInventory(repo);
      return { stderr: writes.join(''), warnings: warnings.join('\n'), version: files[0]?.frontmatter.version };
    } finally {
      spy.mockRestore();
    }
  }

  it('an unquoted number that reads back as written loads silently', () => {
    seed('version: 1.2');
    expect(load2()).toEqual({ stderr: '', warnings: '', version: 1.2 });
  });

  it('a quoted string loads silently', () => {
    seed('version: "1.10"');
    expect(load2()).toEqual({ stderr: '', warnings: '', version: '1.10' });
  });

  it('an unquoted `1.10` loads as 1.1 and warns the author to quote it', () => {
    seed('version: 1.10');
    const { stderr, warnings, version } = load2();
    expect(version).toBe(1.1);
    expect(stderr).toBe('');
    expect(warnings).toBe(
      "directive '.wingfoil/directives/custom/x.md': version: 1.10 reads as the number 1.1; quote it (version: \"1.10\") to keep it as written",
    );
  });

  it('an unquoted `1.0` warns too — it reads back as 1', () => {
    seed('version: 1.0');
    const { stderr, warnings } = load2();
    expect(stderr).toBe('');
    expect(warnings).toContain('version: 1.0 reads as the number 1; quote it');
  });

  it('a version that is neither a string nor a number is dropped with a warning, not a validation error', () => {
    seed('version: [1, 2]');
    const { stderr, warnings, version } = load2();
    expect(version).toBeUndefined();
    expect(stderr).toBe('');
    expect(warnings).toContain('version must be a string or a number; ignored');
  });
});

describe('DirectiveFrontmatter — validates every real, live .wingfoil/directives/custom/*.md file', () => {
  it('parses each file’s frontmatter with zero structural errors', () => {
    const dir = join(__dirname, '..', '..', '.wingfoil', 'directives', 'custom');
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const fm = extractFrontmatter(raw);
      expect(fm).not.toBeNull();
      const data = load(fm as string);
      const result = DirectiveFrontmatter.safeParse(data);
      if (!result.success) {
        console.error(file, result.error.issues);
      }
      expect(result.success).toBe(true);
    }
  });
});

/**
 * RolesYaml schema (task-037-role-task-scoped-context, REQ-STATE-05) — the role → directive binding
 * config (`.wingfoil/roles.yaml`, P3.2/P3.7) `directive-loader` (spec-012 §5) resolves against. A
 * minimal [AUTHORING] shape grounded directly in the real `.wingfoil/roles.yaml` file's
 * fields (`version`, `assignments`, `global`): `spec-013` specifies the directive files only, and no
 * tech-spec covers `roles.yaml`'s own shape yet.
 */
describe('RolesYaml — structural shape', () => {
  it('accepts the real roles.yaml shape (assignments + global)', () => {
    const result = RolesYaml.safeParse({
      version: 1.0,
      assignments: {
        developer: ['code-quality', 'testing', 'determinism'],
        reviewer: ['code-review', 'traceability'],
      },
      global: ['doc-versioning', 'documentation', 'security-secrets'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a document missing `assignments`', () => {
    const result = RolesYaml.safeParse({ version: 1.0, global: [] });
    expect(result.success).toBe(false);
  });

  it('defaults `global` to an empty array when omitted', () => {
    const result = RolesYaml.safeParse({ version: 1.0, assignments: { developer: ['testing'] } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.global).toEqual([]);
    }
  });

  it('rejects an `assignments` entry whose value is not a string array', () => {
    const result = RolesYaml.safeParse({ version: 1.0, assignments: { developer: 'testing' } });
    expect(result.success).toBe(false);
  });
});

/**
 * The live `.wingfoil/roles.yaml` is configuration that is EXPECTED to change (`reconcile-governance`
 * edits it by design), so this suite asserts properties of it rather than its exact contents
 * (task-133, `bug-112`): the bindings that matter are present, no list repeats an id, and every bound
 * id names a directive file that exists. An exact-array `toEqual` made every legitimate new binding
 * fail here exactly like a regression; these properties still catch a dropped required binding, a
 * duplicated entry and a dangling id.
 */
describe('RolesYaml — validates the real, live .wingfoil/roles.yaml file', () => {
  const liveRoot = join(__dirname, '..', '..');

  function liveRoles(): RolesYaml {
    const raw = readFileSync(join(liveRoot, '.wingfoil', 'roles.yaml'), 'utf-8');
    const result = RolesYaml.safeParse(load(raw));
    if (!result.success) {
      console.error(result.error.issues);
    }
    expect(result.success).toBe(true);
    return (result as { data: RolesYaml }).data;
  }

  /** Directive ids declared by the live directive files, `built-in/` and `custom/` alike. */
  function liveDirectiveIds(): Set<string> {
    const ids = new Set<string>();
    for (const kind of ['built-in', 'custom']) {
      const dir = join(liveRoot, '.wingfoil', 'directives', kind);
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
        const fm = extractFrontmatter(readFileSync(join(dir, file), 'utf-8'));
        ids.add((load(fm as string) as { id: string }).id);
      }
    }
    return ids;
  }

  it('parses the live file with zero structural errors', () => {
    liveRoles();
  });

  it('keeps the bindings that matter (task-094: command-baseline, claim-evidence; task-133: security; task-178: git-conventions)', () => {
    const roles = liveRoles();
    expect(roles.assignments.developer).toEqual(
      expect.arrayContaining(['code-quality', 'testing', 'determinism', 'command-baseline']),
    );
    expect(roles.assignments.reviewer).toContain('command-baseline');
    expect(roles.assignments.architect).toContain('command-baseline');
    expect(roles.global).toEqual(
      expect.arrayContaining([
        'doc-versioning',
        'documentation',
        'security',
        'security-secrets',
        'claim-evidence',
        'git-conventions',
      ]),
    );
  });

  it('no list binds the same id twice', () => {
    const roles = liveRoles();
    for (const [name, ids] of [...Object.entries(roles.assignments), ['global', roles.global] as const]) {
      expect([name, ids.length]).toEqual([name, new Set(ids).size]);
    }
  });

  it('every bound id names a directive file that exists (no dangling binding)', () => {
    const roles = liveRoles();
    const known = liveDirectiveIds();
    const bound = [...Object.values(roles.assignments).flat(), ...roles.global];
    expect(bound.length).toBeGreaterThan(0);
    expect(bound.filter((id) => !known.has(id))).toEqual([]);
  });
});
