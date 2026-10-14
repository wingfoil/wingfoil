/**
 * task-044-builtin-template-integrity, second pass (review-gate `red` fallback) — REQ-SEC-10's
 * registry/scaffold COUPLING.
 *
 * The first pass shipped a hand-maintained `BUILTIN_TEMPLATE_SOURCES` constant that no code path tied
 * to `templateScaffold`. That is fail-open by omission: a later task (e.g. `task-057`, P3.8, or a
 * P4.17 workflow-template task) can add a real asset under `.wingfoil/directives/built-in/` or
 * `.wingfoil/workflows/built-in/` and `wingfoil init` will happily write it WITHOUT ever
 * integrity-checking it — with every existing test still green. These tests pin the replacement:
 * `builtinTemplateSources(files)` DERIVES the checked set from the very `ScaffoldFile[]` that
 * `initStorage` writes, so "installed but unchecked" is unrepresentable rather than merely untested.
 *
 * BDD: `p3-directives/P3.8-builtin-directive-templates.feature` "Error - a built-in template fails its
 * integrity check"; `p4-workflow/P4.17-builtin-workflow-templates.feature` "Error - a built-in
 * workflow template is structurally invalid".
 */
import { scaffoldFiles, type ScaffoldFile } from '../../src/storage/layout';
import {
  BUILTIN_ADAPTERS_DIR,
  BUILTIN_DIRECTIVES_DIR,
  BUILTIN_WORKFLOWS_DIR,
  TEMPLATES,
  builtinTemplateSources,
  templateScaffold,
} from '../../src/storage/templates';

/**
 * Every scaffold path that lives under one of the three built-in asset directories (task-236: the
 * adapters' joined the directives' and the workflows' when the first real built-in adapter shipped).
 */
function builtinPathsOf(files: readonly ScaffoldFile[]): string[] {
  return files
    .map((f) => f.path)
    .filter((p) => [BUILTIN_DIRECTIVES_DIR, BUILTIN_WORKFLOWS_DIR, BUILTIN_ADAPTERS_DIR].some((dir) => p.startsWith(`${dir}/`)));
}

/** `true` for a placeholder like `.gitkeep` — the only thing the derivation is allowed to skip. */
function isDotfile(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base.startsWith('.');
}

describe('builtinTemplateSources — derives the checked set from the scaffold (REQ-SEC-10)', () => {
  it('derives a directive source for a `.md` asset under directives/built-in/', () => {
    const files: ScaffoldFile[] = [
      { path: `${BUILTIN_DIRECTIVES_DIR}/security.md`, content: '---\nid: "x"\n---\n\nbody\n' },
    ];
    expect(builtinTemplateSources(files)).toEqual([
      { name: 'security', kind: 'directive', content: '---\nid: "x"\n---\n\nbody\n' },
    ]);
  });

  it('derives a workflow source for a `.yaml` asset under workflows/built-in/', () => {
    const files: ScaffoldFile[] = [{ path: `${BUILTIN_WORKFLOWS_DIR}/task.yaml`, content: 'name: task\n' }];
    expect(builtinTemplateSources(files)).toEqual([{ name: 'task', kind: 'workflow', content: 'name: task\n' }]);
  });

  it('carries the scaffolded content through byte-for-byte (the checked bytes are the written bytes)', () => {
    const content = '---\nid: "security"\n---\n\n# Security\n\ntrailing spaces   \n\n';
    const derived = builtinTemplateSources([{ path: `${BUILTIN_DIRECTIVES_DIR}/security.md`, content }]);
    expect(derived[0]?.content).toBe(content);
  });

  it('skips dotfile placeholders such as .gitkeep', () => {
    const files: ScaffoldFile[] = [
      { path: `${BUILTIN_DIRECTIVES_DIR}/.gitkeep`, content: '' },
      { path: `${BUILTIN_WORKFLOWS_DIR}/.gitkeep`, content: '' },
    ];
    expect(builtinTemplateSources(files)).toEqual([]);
  });

  it('ignores every scaffold path outside the two built-in directories', () => {
    const files: ScaffoldFile[] = [
      { path: '.wingfoil/dna.yaml', content: 'version: 1\n' },
      { path: '.wingfoil/directives/custom/testing.md', content: '---\nname: testing\n---\n' },
      { path: '.wingfoil/workflows/custom/sw-life-cycle.yaml', content: 'name: sw-life-cycle\n' },
      { path: '.wingfoil/memory/templates/task.md', content: '---\ntype: task\n---\n' },
    ];
    expect(builtinTemplateSources(files)).toEqual([]);
  });

  it('classifies a non-dotfile built-in asset by its DIRECTORY, not by its extension (fail-closed)', () => {
    const files: ScaffoldFile[] = [
      { path: `${BUILTIN_DIRECTIVES_DIR}/notes`, content: 'no extension\n' },
      { path: `${BUILTIN_WORKFLOWS_DIR}/release-cycle.yml`, content: 'name: release-cycle\n' },
    ];
    expect(builtinTemplateSources(files).map((s) => [s.name, s.kind])).toEqual([
      ['notes', 'directive'],
      ['release-cycle', 'workflow'],
    ]);
  });

  it('is a pure, order-preserving function of its input (REQ-SYS-07)', () => {
    const files: ScaffoldFile[] = [
      { path: `${BUILTIN_DIRECTIVES_DIR}/a.md`, content: 'a\n' },
      { path: `${BUILTIN_WORKFLOWS_DIR}/b.yaml`, content: 'b\n' },
      { path: `${BUILTIN_DIRECTIVES_DIR}/c.md`, content: 'c\n' },
    ];
    expect(builtinTemplateSources(files).map((s) => s.name)).toEqual(['a', 'b', 'c']);
    expect(builtinTemplateSources(files)).toEqual(builtinTemplateSources(files));
  });
});

/**
 * The coupling property itself: NOTHING the scaffold installs under a built-in directory may be
 * invisible to `verifyBuiltinTemplates`. Non-vacuous since `task-057` installed the six P3.8 built-in
 * directives, and asserted as a PROPERTY rather than a fixed list so it keeps biting when a P4.17 task
 * adds workflow content, and fails immediately
 * if anyone widens the derivation's skip rule beyond dotfiles.
 */
describe('builtinTemplateSources — total coverage of the real scaffold', () => {
  it.each(TEMPLATES.map((t) => [t.name, t] as const))(
    'covers every non-dotfile built-in asset the %s scaffold writes',
    (_name, def) => {
      const files = templateScaffold(def);
      const expected = builtinPathsOf(files).filter((p) => !isDotfile(p));
      const derived = builtinTemplateSources(files);
      expect(derived).toHaveLength(expected.length);
      for (const path of expected) {
        const base = path.slice(path.lastIndexOf('/') + 1);
        const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
        expect(derived.map((s) => s.name)).toContain(stem);
      }
    },
  );

  it('skips ONLY dotfiles — every other built-in scaffold path is accounted for', () => {
    for (const def of TEMPLATES) {
      const files = templateScaffold(def);
      const skipped = builtinPathsOf(files).length - builtinTemplateSources(files).length;
      const dotfiles = builtinPathsOf(files).filter(isDotfile).length;
      expect(skipped).toBe(dotfiles);
    }
  });

  /**
   * task-054-project-directives: the same property over the OTHER scaffold. `scaffoldFiles()` — the
   * P1.1 minimal skeleton `initWingfoilStorage` writes — now reserves `.wingfoil/directives/built-in/`
   * too (P3.5), so it has a built-in-directory path of its own for the derivation to account for. This
   * is the structural half of `bug-018`; `test/core/project-directives.test.ts` asserts the behavioural
   * half (that `initWingfoilStorage` actually runs the guard over this derived list before writing).
   */
  it('accounts for every non-dotfile built-in path in the minimal skeleton too (scaffoldFiles)', () => {
    const files = scaffoldFiles();
    // The skeleton must reserve a built-in directory, or the property below is vacuous.
    expect(builtinPathsOf(files).length).toBeGreaterThan(0);
    const skipped = builtinPathsOf(files).length - builtinTemplateSources(files).length;
    expect(skipped).toBe(builtinPathsOf(files).filter(isDotfile).length);
  });
});
