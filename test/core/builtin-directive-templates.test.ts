/**
 * task-057-builtin-directive-templates (P3.8, US-0A-09) — built-in directive templates installed by
 * `wingfoil init`, asserted end to end over a real temp git repo through the production entry points.
 *
 * BDD: `docs/02_requirements/02_bdd/features/p3-directives/P3.8-builtin-directive-templates.feature`
 *
 *   Scenario: Built-in templates are installed during init
 *     Then ".wingfoil/directives/built-in/" contains exactly 6 templates
 *     And the set is: code-quality, testing, code-review, architecture, security, documentation
 *     And ".wingfoil/roles.yaml" binds "security" under "global", so every role loads it  (task-133)
 *   Scenario: Built-in templates are selected by methodology
 *     Then the 6 built-in templates are installed and available for assignment
 *   Scenario: Error - a built-in template fails its integrity check
 *     Then init aborts before writing partial directives
 *     And the message is "built-in directive template integrity check failed: <name>"
 *
 * Plus the obligations the templates inherit from ratified rules:
 *  - REQ-SEC-08 Fit Criterion clause (a): "After `init`, the built-in `security` directive is present".
 *  - dl-037 (implemented by task-055, `selectDirectivesById`): `custom/` wins over `built-in/` for the
 *    same id and the shadow is reported. A FRESH project defines no id twice, so it reports nothing and
 *    every role binding resolves to the built-in; a project that customizes an id keeps its custom
 *    file and gets exactly one shadow warning, on the listing and in the execution context alike.
 *  - REQ-SEC-07 (task-042): the installed built-in files are non-removable.
 *  - spec-015 §1: `files` stays `["dist", "README.md"]`, so the templates ship as compiled module
 *    content — the carrying module must be in the packed tarball.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { exitCodeForResult } from '../../src/core';
import type { BuiltinTemplateSource } from '../../src/core/builtin-integrity';
import { requireCustomAsset } from '../../src/core/builtin-asset';
import { assembleExecutionContext, resolveRoleDirectives } from '../../src/core/context';
import { loadDirectiveListing } from '../../src/core/directives-list';
import { initWingfoilProject } from '../../src/core/init';
import { loadDirectives, loadDnaYaml, loadRolesYaml } from '../../src/core/loaders';
import { TEMPLATE_NAMES } from '../../src/storage';
import { scanProjectSurface } from '../../src/validation';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** The P3.8 set, sorted — the order a directory listing yields. */
const P38_IDS_SORTED = ['architecture', 'code-quality', 'code-review', 'documentation', 'security', 'testing'];

const BUILTIN_DIR = ['.wingfoil', 'directives', 'built-in'] as const;

/** Every entry (dotfiles included) physically present in `.wingfoil/directives/built-in/`. */
function builtinDirEntries(repo: string): string[] {
  return readdirSync(join(repo, ...BUILTIN_DIR)).sort();
}

function initOk(repo: string, template: string): void {
  const result = initWingfoilProject(repo, template);
  if (!result.ok) throw new Error(`init failed: ${result.error.message}`);
}

describe('P3.8 Scenario 1 — built-in templates are installed during init', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    initOk(repo, 'Scrum');
  });
  afterAll(() => removeTempDir(repo));

  it('.wingfoil/directives/built-in/ contains exactly the 6 templates (nothing else)', () => {
    expect(builtinDirEntries(repo)).toEqual(P38_IDS_SORTED.map((id) => `${id}.md`));
  });

  it('all 6 are tracked by git and the tree is clean after init', () => {
    const tracked = git(repo, ['ls-files', '.wingfoil/directives/built-in']).trim().split('\n');
    expect(tracked).toEqual(P38_IDS_SORTED.map((id) => `.wingfoil/directives/built-in/${id}.md`));
    expect(git(repo, ['status', '--porcelain', '--untracked-files=all'])).toBe('');
  });

  it('every installed file loads through the real loadDirectives as kind built-in, id = stem', () => {
    const builtins = loadDirectives(repo).filter((d) => d.path.includes('built-in'));
    expect(builtins.map((d) => d.frontmatter.id).sort()).toEqual(P38_IDS_SORTED);
    for (const d of builtins) {
      expect(d.frontmatter.kind).toBe('built-in');
      expect(d.path.replace(/\\/g, '/')).toBe(`directives/built-in/${d.frontmatter.id}.md`);
    }
  });

  it('REQ-SEC-08 (a): the built-in security directive is present after init', () => {
    const security = loadDirectives(repo).find((d) => d.frontmatter.id === 'security');
    expect(security?.path.replace(/\\/g, '/')).toBe('directives/built-in/security.md');
  });

  it('REQ-SEC-08 (b) holds on the freshly initialized committed surface (0 findings, non-vacuous)', () => {
    const result = scanProjectSurface(repo);
    expect(result.filesScanned).toBeGreaterThanOrEqual(6);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('REQ-SEC-07: every installed built-in directive is refused for removal', () => {
    for (const id of P38_IDS_SORTED) {
      expect(requireCustomAsset('directive', `directives/built-in/${id}.md`)).toMatchObject({ ok: false });
    }
  });
});

describe('P3.8 Scenario 2 — installed independently of the selected methodology', () => {
  const installed = new Map<string, Map<string, string>>();

  beforeAll(() => {
    for (const name of TEMPLATE_NAMES) {
      const repo = makeTempGitRepo();
      try {
        initOk(repo, name);
        installed.set(
          name,
          new Map(builtinDirEntries(repo).map((f) => [f, readFileSync(join(repo, ...BUILTIN_DIR, f), 'utf-8')])),
        );
      } finally {
        removeTempDir(repo);
      }
    }
  });

  it.each(TEMPLATE_NAMES.map((n) => [n]))('%s installs the same 6 templates', (name) => {
    expect([...(installed.get(name)?.keys() ?? [])]).toEqual(P38_IDS_SORTED.map((id) => `${id}.md`));
  });

  it('the installed bytes are identical across every registered methodology template', () => {
    const [first, ...rest] = TEMPLATE_NAMES.map((n) => installed.get(n));
    expect(rest.length).toBeGreaterThan(0);
    for (const other of rest) expect(other).toEqual(first);
  });

  it.each(TEMPLATE_NAMES.map((n) => [n]))(
    '%s: available for assignment — every built-in id bound in the scaffolded roles.yaml resolves to the built-in file',
    (name) => {
      const repo = makeTempGitRepo();
      try {
        initOk(repo, name);
        const files = loadDirectives(repo);
        const roles = loadRolesYaml(repo);
        const boundBuiltins = new Set<string>();
        for (const role of Object.keys(roles.assignments)) {
          const resolution = resolveRoleDirectives(files, roles, role);
          expect(resolution.warnings).toEqual([]);
          for (const d of resolution.directives) {
            if (P38_IDS_SORTED.includes(d.frontmatter.id)) {
              expect(d.path.replace(/\\/g, '/')).toBe(`directives/built-in/${d.frontmatter.id}.md`);
              boundBuiltins.add(d.frontmatter.id);
            }
          }
        }
        expect(boundBuiltins.size).toBeGreaterThan(0);
      } finally {
        removeTempDir(repo);
      }
    },
  );
});

/**
 * task-133 (dl-059 option 1, REQ-SEC-08) — the built-in `security` directive is not only PRESENT after
 * `init` (Scenario 1, REQ-SEC-08 clause (a)) but BOUND: the scaffolded `roles.yaml` lists it under
 * `global:`, so every role's resolution loads it — REQ-SEC-08's Description ("handled per the built-in
 * Security directive"). Asserted over a real `init` for every registered methodology (Scrum, Kanban),
 * through the production `loadRolesYaml` + `resolveRoleDirectives`, for every role of the scaffolded
 * catalogue plus a role the project never declared (globals are unconditional, spec-012 §5).
 */
describe('REQ-SEC-08 — init binds the built-in security directive to every role (dl-059, task-133)', () => {
  it.each(TEMPLATE_NAMES.map((n) => [n]))('%s: roles.yaml lists `security` under global, once', (name) => {
    const repo = makeTempGitRepo();
    try {
      initOk(repo, name);
      const roles = loadRolesYaml(repo);
      expect(roles.global.filter((id) => id === 'security')).toEqual(['security']);
    } finally {
      removeTempDir(repo);
    }
  });

  it.each(TEMPLATE_NAMES.map((n) => [n]))('%s: every role resolves the built-in security directive exactly once', (name) => {
    const repo = makeTempGitRepo();
    try {
      initOk(repo, name);
      const files = loadDirectives(repo);
      const roles = loadRolesYaml(repo);
      const catalogue = loadDnaYaml(repo).team.roles.map((r) => r.name);
      expect(catalogue.length).toBeGreaterThan(0);
      for (const role of [...catalogue, 'role-never-declared']) {
        const resolution = resolveRoleDirectives(files, roles, role);
        const security = resolution.directives.filter((d) => d.frontmatter.id === 'security');
        expect([role, security.map((d) => d.path.replace(/\\/g, '/'))]).toEqual([
          role,
          ['directives/built-in/security.md'],
        ]);
      }
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('P3.8 Scenario 3 — a corrupted REAL built-in template aborts init before writing', () => {
  it('aborts with the exact message, exit 1, and writes nothing', () => {
    const repo = makeTempGitRepo();
    try {
      // A real shipped template, truncated mid-frontmatter — the "corrupted source" of the scenario.
      const valid = loadShippedSecurityTemplate();
      const corrupted: BuiltinTemplateSource[] = [
        { name: 'security', kind: 'directive', content: valid.slice(0, valid.indexOf('type:')) },
      ];
      const result = initWingfoilProject(repo, 'Scrum', corrupted);
      expect(result).toEqual({
        ok: false,
        error: { code: 'VALIDATION', message: 'built-in directive template integrity check failed: security' },
      });
      expect(exitCodeForResult(result)).toBe(1);
      expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
    } finally {
      removeTempDir(repo);
    }
  });
});

/** The shipped `security` template bytes, taken from a real init (not re-rendered by the test). */
function loadShippedSecurityTemplate(): string {
  const repo = makeTempGitRepo();
  try {
    initOk(repo, 'Scrum');
    return readFileSync(join(repo, ...BUILTIN_DIR, 'security.md'), 'utf-8');
  } finally {
    removeTempDir(repo);
  }
}

describe('dl-037 precedence over the real shipped built-ins (task-055 rule)', () => {
  it('a fresh project defines no id twice: directives list reports 0 warnings', () => {
    const repo = makeTempGitRepo();
    try {
      initOk(repo, 'Scrum');
      const listing = loadDirectiveListing(repo);
      expect(listing.warnings).toEqual([]);
      const ids = listing.entries.map((e) => e.frontmatter.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(existsSync(join(repo, '.wingfoil', 'directives', 'custom', 'testing.md'))).toBe(false);
    } finally {
      removeTempDir(repo);
    }
  });

  it('a project that customizes a built-in id keeps its custom file and gets one shadow warning', () => {
    const repo = makeTempGitRepo();
    try {
      initOk(repo, 'Scrum');
      writeFixtureFile(
        repo,
        '.wingfoil/directives/custom/testing.md',
        '---\nid: testing\nname: "Testing (team)"\ntype: directive\nkind: custom\ntitle: "Testing (team)"\n---\n\n- Team rule.\n',
      );
      commitAll(repo, 'customize testing');

      const expectedWarning =
        "directive 'testing' defined in directives/built-in/testing.md, directives/custom/testing.md; using directives/custom/testing.md";

      const listing = loadDirectiveListing(repo);
      expect(listing.warnings).toEqual([expectedWarning]);
      // The listing is an inventory: both files stay listed.
      expect(listing.entries.filter((e) => e.frontmatter.id === 'testing')).toHaveLength(2);

      const files = loadDirectives(repo);
      const roles = loadRolesYaml(repo);
      const developer = resolveRoleDirectives(files, roles, 'developer');
      expect(developer.directives.find((d) => d.frontmatter.id === 'testing')?.frontmatter.name).toBe('Testing (team)');
      expect(developer.warnings).toEqual([expectedWarning]);

      // task-176: the context is read at a `stateRef`, so the element must be committed there.
      writeFixtureFile(repo, 'docs/memory/task/task-1-none.md', '---\nid: task-1-none\ntype: task\nstatus: backlog\n---\n');
      commitAll(repo, 'add the element');
      const assembled = assembleExecutionContext(repo, {
        role: 'developer',
        element: { type: 'task', id: 'task-1-none' },
        stateRef: 'HEAD',
      });
      if (!assembled.ok) throw new Error(assembled.error.message);
      const { context } = assembled.value;
      expect(context.directives.find((d) => d.frontmatter.id === 'testing')?.frontmatter.name).toBe('Testing (team)');
      expect(context.warnings).toEqual([expectedWarning]);
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('spec-015 §1 — the templates ship inside the npm tarball (files unchanged)', () => {
  const REPO_ROOT = join(__dirname, '..', '..');

  it('the compiled module carrying the templates is packed and exports the six', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    const [result] = JSON.parse(raw) as Array<{ files: Array<{ path: string }> }>;
    const paths = (result?.files ?? []).map((f) => f.path);
    expect(paths).toContain('dist/storage/builtin-directives.js');

    // The dist/ that globalSetup built carries the template data, not just an empty module.
    const compiled = readFileSync(join(REPO_ROOT, 'dist', 'storage', 'builtin-directives.js'), 'utf-8');
    for (const id of P38_IDS_SORTED) expect(compiled).toContain(`id: '${id}'`);
  });
});
