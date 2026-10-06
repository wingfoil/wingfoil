/**
 * task-029-implement-wingfoil-init (P5.1.1, spec-011-storage-layout) — methodology templates that
 * produce the COMPLETE `.wingfoil/` layout `wingfoil init` commits. task-018 delivered only a minimal
 * skeleton and deferred the full spec-011 layout (roles.yaml, the `built-in`/`custom` splits,
 * `memory/templates/`) here; these tests pin that full layout + its determinism (REQ-SYS-07).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { load as loadYaml } from 'js-yaml';

import {
  DEFAULT_TEMPLATE,
  TEMPLATES,
  TEMPLATE_NAMES,
  initProjectCommitMessage,
  resolveTemplate,
  templateScaffold,
  type TemplateDefinition,
} from '../../src/storage/templates';
import type { ScaffoldFile } from '../../src/storage/layout';
import { extractFrontmatter } from '../../src/storage/frontmatter';
import { DirectiveFrontmatter } from '../../src/directives/schema';
import { DnaYaml } from '../../src/dna/schema';
import { loadDnaYaml } from '../../src/core/loaders';
import { MemoryYaml } from '../../src/memory/schema';
import { DEPRECATED_STATE, resolveStateMachine, resolveTypeTransition } from '../../src/memory/state-machine';

function pathsOf(files: readonly ScaffoldFile[]): string[] {
  return files.map((f) => f.path);
}

/** Every scaffolded Directives-pillar document (`.md` under `.wingfoil/directives/`; never a placeholder). */
function directiveFilesOf(def: TemplateDefinition): ScaffoldFile[] {
  return templateScaffold(def).filter(
    (f) => f.path.startsWith('.wingfoil/directives/') && f.path.endsWith('.md'),
  );
}

/** The filename stem of a scaffold path — `architecture` for `.wingfoil/directives/custom/architecture.md`. */
function stemOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base.slice(0, base.lastIndexOf('.'));
}

describe('templates registry (P5.1.1)', () => {
  it('includes the BDD-named Scrum and Kanban templates', () => {
    expect(TEMPLATE_NAMES).toEqual(expect.arrayContaining(['Scrum', 'Kanban']));
  });

  it('resolves a template name case-insensitively to its canonical definition', () => {
    expect(resolveTemplate('scrum')?.name).toBe('Scrum');
    expect(resolveTemplate('KANBAN')?.name).toBe('Kanban');
  });

  it('returns null for an unknown template name', () => {
    expect(resolveTemplate('Waterfallish')).toBeNull();
  });

  it('exposes a DEFAULT_TEMPLATE that is itself a known template', () => {
    expect(resolveTemplate(DEFAULT_TEMPLATE)).not.toBeNull();
  });
});

describe('templateScaffold — complete spec-011 layout (P5.1.1 AC (a))', () => {
  const scrum = resolveTemplate('Scrum') as TemplateDefinition;

  it('creates all four top-level pillar config files', () => {
    const paths = pathsOf(templateScaffold(scrum));
    expect(paths).toEqual(
      expect.arrayContaining([
        '.wingfoil/dna.yaml',
        '.wingfoil/memory.yaml',
        '.wingfoil/roles.yaml',
        '.wingfoil/workflows.yaml',
      ]),
    );
  });

  it('creates the directives built-in/custom split (spec-011)', () => {
    const paths = pathsOf(templateScaffold(scrum));
    // task-057: built-in/ holds the six P3.8 templates, so it needs no `.gitkeep` placeholder any more.
    expect(paths.filter((p) => p.startsWith('.wingfoil/directives/built-in/'))).toEqual([
      '.wingfoil/directives/built-in/architecture.md',
      '.wingfoil/directives/built-in/code-quality.md',
      '.wingfoil/directives/built-in/code-review.md',
      '.wingfoil/directives/built-in/documentation.md',
      '.wingfoil/directives/built-in/security.md',
      '.wingfoil/directives/built-in/testing.md',
    ]);
    expect(paths.some((p) => p.startsWith('.wingfoil/directives/custom/') && p.endsWith('.md'))).toBe(true);
  });

  it('creates one memory template scaffold per Memory element type (spec-011)', () => {
    const paths = pathsOf(templateScaffold(scrum));
    for (const type of ['adr', 'bug', 'decision-log', 'release', 'release-line', 'task', 'tech-spec']) {
      expect(paths).toContain(`.wingfoil/memory/templates/${type}.md`);
    }
  });

  it('creates the workflows built-in/custom split with a startable main (spec-011)', () => {
    const paths = pathsOf(templateScaffold(scrum));
    expect(paths).toContain('.wingfoil/workflows/built-in/.gitkeep');
    expect(paths).toContain('.wingfoil/workflows/custom/sw-life-cycle.yaml');
  });

  it('produces no path outside `.wingfoil/` (init never touches the rest of the tree)', () => {
    for (const p of pathsOf(templateScaffold(scrum))) {
      expect(p.startsWith('.wingfoil/')).toBe(true);
    }
  });

  it('every file carries non-empty content except the .gitkeep placeholders', () => {
    for (const f of templateScaffold(scrum)) {
      if (f.path.endsWith('.gitkeep')) expect(f.content).toBe('');
      else expect(f.content.length).toBeGreaterThan(0);
    }
  });
});

describe('determinism (REQ-SYS-07)', () => {
  it('two scaffolds for the same template are byte-identical (no wall-clock/random)', () => {
    const scrum = resolveTemplate('Scrum') as TemplateDefinition;
    expect(JSON.stringify(templateScaffold(scrum))).toBe(JSON.stringify(templateScaffold(scrum)));
  });

  it('returns files in a stable lexical order', () => {
    const scrum = resolveTemplate('Scrum') as TemplateDefinition;
    const paths = pathsOf(templateScaffold(scrum));
    expect(paths).toEqual([...paths].sort());
  });
});

describe('template selection differentiates generated content (P5.1.1 AC (a)/(b))', () => {
  it('the chosen methodology is reflected in the generated dna.yaml', () => {
    const scrumDna = templateScaffold(resolveTemplate('Scrum') as TemplateDefinition).find(
      (f) => f.path === '.wingfoil/dna.yaml',
    )!.content;
    const kanbanDna = templateScaffold(resolveTemplate('Kanban') as TemplateDefinition).find(
      (f) => f.path === '.wingfoil/dna.yaml',
    )!.content;
    expect(scrumDna).toContain('Scrum');
    expect(kanbanDna).toContain('Kanban');
    expect(scrumDna).not.toBe(kanbanDna);
  });

  it('the commit message names the selected template', () => {
    expect(initProjectCommitMessage(resolveTemplate('Kanban') as TemplateDefinition)).toContain('Kanban');
  });

  it('every registered template scaffolds a complete four-pillar layout', () => {
    for (const def of TEMPLATES) {
      const paths = pathsOf(templateScaffold(def));
      expect(paths).toEqual(
        expect.arrayContaining([
          '.wingfoil/dna.yaml',
          '.wingfoil/memory.yaml',
          '.wingfoil/roles.yaml',
          '.wingfoil/workflows.yaml',
        ]),
      );
    }
  });
});

/**
 * bug-005-init-scaffold-fails-schema-validation: `templateScaffold`'s generated `dna.yaml`/
 * `memory.yaml` must actually satisfy the schemas/consumers `dna show`/`dna set`/`paths`/
 * `memory add` enforce on them — task-018/task-029 never asserted this, only that the files were
 * non-empty and template-differentiated (the tests above). Discovered via task-032's manual CLI
 * walkthrough: a freshly-`init`'d project errored on every one of those four commands.
 */
describe('templateScaffold output satisfies its consumers’ real schemas (bug-005)', () => {
  for (const def of TEMPLATES) {
    it(`${def.name}: generated dna.yaml round-trips through the real DnaYaml schema`, () => {
      const dnaYamlText = templateScaffold(def).find((f) => f.path === '.wingfoil/dna.yaml')!.content;
      const parsed = loadYaml(dnaYamlText);
      const result = DnaYaml.safeParse(parsed);
      expect(result.success).toBe(true);
    });

    it(`${def.name}: every scaffolded memory.yaml type declares an id_pattern (memoryAdd requires one)`, () => {
      const memoryYamlText = templateScaffold(def).find((f) => f.path === '.wingfoil/memory.yaml')!.content;
      const parsed = loadYaml(memoryYamlText) as { types: Record<string, { id_pattern?: string; template?: unknown }> };
      for (const [type, entry] of Object.entries(parsed.types)) {
        expect([type, entry.id_pattern]).toEqual([type, expect.any(String)]);
        expect([type, entry.template]).toEqual([type, expect.anything()]);
      }
    });
  }
});

/**
 * bug-030-init-memory-yaml-has-no-state-machine (task-071) — the gap bug-030's Notes name verbatim:
 * *"no test feeds the resolver the file `init` actually writes"* (`grep -rln
 * 'resolveStateMachine\|resolveTransitionTarget' test | xargs grep -ln 'templates\|scaffold\|runInit'`
 * → no output). `test/memory/state-machine.test.ts` resolves hand-built fixtures and
 * `test/memory/element-schema.test.ts` resolves this repository's own dogfooded `memory.yaml` (which
 * declares a machine for every type) — so the scaffolded file, the only `memory.yaml` a real user
 * starts from, was never handed to `resolveStateMachine` by anything.
 *
 * This suite closes that: it takes `templateScaffold`'s own `memory.yaml` bytes, parses them through
 * the real `MemoryYaml` schema (Pass 1, spec-009 §1), and drives the real REQ-STATE-08 resolver +
 * transition engine over EVERY type the file declares — the type list derived from the parsed file,
 * never hard-coded (bug-030 step 5's list is evidence, not a specification).
 */
describe('scaffolded memory.yaml resolves a state machine for every declared type (bug-030)', () => {
  const scaffoldedMemoryYaml = (def: TemplateDefinition): string =>
    templateScaffold(def).find((f) => f.path === '.wingfoil/memory.yaml')!.content;

  for (const def of TEMPLATES) {
    it(`${def.name}: the scaffolded memory.yaml parses through the real MemoryYaml schema`, () => {
      expect(MemoryYaml.safeParse(loadYaml(scaffoldedMemoryYaml(def))).success).toBe(true);
    });

    it(`${def.name}: the scaffold DECLARES its default machine, rather than leaning on the engine's built-in`, () => {
      // task-071's chosen placement: the machine that governs a fresh project is visible and editable
      // in the user's own file (spec-001's optional top-level `defaults:` key), so `wingfoil init`'s
      // header comment is true of the bytes it writes. The engine's built-in (bug-030's other half)
      // still covers hand-written files; this asserts the scaffold does not depend on it.
      const parsed = MemoryYaml.parse(loadYaml(scaffoldedMemoryYaml(def)));
      expect(parsed.defaults?.states).toBeDefined();
      expect(parsed.defaults!.states.sequence).toEqual(['draft', 'pending', 'approved']);
      expect(parsed.defaults!.states.gates).toEqual({ pending: { reject: 'draft' } });
    });

    it(`${def.name}: resolveStateMachine returns a machine for EVERY type the scaffold declares`, () => {
      const parsed = MemoryYaml.parse(loadYaml(scaffoldedMemoryYaml(def)));
      const declaredTypes = Object.keys(parsed.types).sort();
      expect(declaredTypes.length).toBeGreaterThan(0);
      for (const type of declaredTypes) {
        const machine = resolveStateMachine(parsed, type);
        expect([type, machine.sequence.length > 0]).toEqual([type, true]);
      }
    });

    it(`${def.name}: every scaffolded type can run all four transition verbs from its chain head`, () => {
      // AC1 at the library level (the CLI end-to-end run is test/cli/fresh-init-transitions.test.ts):
      // submit/approve/reject/deprecate each resolve a target for every scaffolded type, so no verb
      // can fail on state-machine resolution in a freshly-`init`-ed project.
      const parsed = MemoryYaml.parse(loadYaml(scaffoldedMemoryYaml(def)));
      for (const type of Object.keys(parsed.types).sort()) {
        const machine = resolveStateMachine(parsed, type);
        const head = machine.sequence[0]!;
        // `memory add` writes `status: draft`; the chain head must be that state for the verbs to apply.
        expect([type, head]).toEqual([type, 'draft']);
        const afterSubmit = resolveTypeTransition(parsed, type, head, 'submit');
        expect([type, afterSubmit]).toEqual([type, 'pending']);
        expect([type, resolveTypeTransition(parsed, type, afterSubmit, 'approve')]).toEqual([type, 'approved']);
        expect([type, resolveTypeTransition(parsed, type, afterSubmit, 'reject')]).toEqual([type, 'draft']);
        expect([type, resolveTypeTransition(parsed, type, head, 'deprecate')]).toEqual([type, DEPRECATED_STATE]);
      }
    });
  }
});

/**
 * task-153 (`dl-072` (A) + S1) — the scaffold keeps the shared `defaults` machine and shows, commented
 * out on `bug`, how a type declares its own. The example has to be a working override, not prose: this
 * suite uncomments exactly those lines and feeds the result through the real `MemoryYaml` schema and
 * the REQ-STATE-08 resolver.
 */
describe('scaffolded memory.yaml carries a commented per-type `states:` example on `bug` (dl-072 S1)', () => {
  const scaffoldedMemoryYaml = (def: TemplateDefinition): string =>
    templateScaffold(def).find((f) => f.path === '.wingfoil/memory.yaml')!.content;

  /** The line index of the one commented `states:` key, and the commented lines nested under it. */
  function exampleLines(lines: readonly string[]): { start: number; end: number } {
    const starts = lines.flatMap((line, index) => (/^\s*# states:\s*$/.test(line) ? [index] : []));
    expect(starts).toHaveLength(1);
    const start = starts[0]!;
    const indent = lines[start]!.indexOf('#');
    let end = start + 1;
    while (end < lines.length && lines[end]!.startsWith(`${' '.repeat(indent)}#   `)) end += 1;
    return { start, end };
  }

  /** The scaffold with the example uncommented: `# ` removed from the `states:` line and its children. */
  function uncommented(text: string): string {
    const lines = text.split('\n');
    const { start, end } = exampleLines(lines);
    return lines.map((line, index) => (index >= start && index < end ? line.replace('# ', '') : line)).join('\n');
  }

  for (const def of TEMPLATES) {
    it(`${def.name}: the example sits under \`bug\` and, commented, changes nothing (bug runs on defaults)`, () => {
      const text = scaffoldedMemoryYaml(def);
      const lines = text.split('\n');
      const { start, end } = exampleLines(lines);
      expect(end - start).toBeGreaterThan(1);
      // The nearest type key above the example is `bug`.
      const owner = lines.slice(0, start).reverse().find((line) => /^ {2}\S[^:]*:\s*$/.test(line));
      expect(owner).toBe('  bug:');
      const parsed = MemoryYaml.parse(loadYaml(text));
      expect(parsed.types['bug']!.states).toBeUndefined();
      expect(resolveStateMachine(parsed, 'bug')).toBe(parsed.defaults!.states);
    });

    it(`${def.name}: uncommented, the example loads without error and gives \`bug\` its own machine`, () => {
      const result = MemoryYaml.safeParse(loadYaml(uncommented(scaffoldedMemoryYaml(def))));
      expect(result.success ? [] : result.error.issues).toEqual([]);
      const parsed = MemoryYaml.parse(loadYaml(uncommented(scaffoldedMemoryYaml(def))));
      const machine = resolveStateMachine(parsed, 'bug');
      expect(machine).toBe(parsed.types['bug']!.states);
      expect(machine.sequence[0]).toBe('draft');
      // Every forward edge of the example resolves through the real engine, and the other types keep
      // the shared default.
      let state = machine.sequence[0]!;
      for (const next of machine.sequence.slice(1)) {
        const op = machine.gates?.[state] ? 'approve' : 'submit';
        expect([state, resolveTypeTransition(parsed, 'bug', state, op)]).toEqual([state, next]);
        state = next;
      }
      for (const type of Object.keys(parsed.types).filter((t) => t !== 'bug')) {
        expect([type, resolveStateMachine(parsed, type)]).toEqual([type, parsed.defaults!.states]);
      }
    });

    it(`${def.name}: uncommented, the example also declares a \`returns\` edge and a WIP limit (task-180, dl-110)`, () => {
      const parsed = MemoryYaml.parse(loadYaml(uncommented(scaffoldedMemoryYaml(def))));
      const machine = resolveStateMachine(parsed, 'bug');
      expect(machine.returns).toEqual({ 'in-progress': 'open' });
      expect(machine.limits).toEqual({ 'in-progress': 3 });
      expect(resolveTypeTransition(parsed, 'bug', 'in-progress', 'park')).toBe('open');
    });
  }
});

/**
 * task-180 (`dl-110` Action 3) — the Kanban template promised "explicit WIP limits" that no schema could
 * declare. A WIP limit is now a `limits:` key of a type's machine; the scaffold's machine has no
 * in-progress state, so the sentence points at the mechanism instead of claiming a declared limit.
 */
describe('the Kanban template names the WIP-limit mechanism it relies on (task-180)', () => {
  const kanban = TEMPLATES.find((def) => def.name === 'Kanban')!;

  it('its description and cadence point at `limits:` in memory.yaml', () => {
    expect(kanban.description).toContain('`limits:`');
    expect(kanban.cadence).toContain('`limits:`');
    expect(kanban.cadence).not.toContain('under explicit WIP limits');
  });
});

/**
 * bug-006-init-directive-scaffold-schema-invalid (task-064) — the Directives half of the same defect
 * class as `bug-005` above, in the same generator: `templateScaffold`'s `directives/**\/*.md` output
 * must satisfy `DirectiveFrontmatter` (`src/directives/schema.ts`, the realization of the approved
 * `spec-013-directive-frontmatter-schema`), because that is the schema `loadDirectives`
 * (`src/core/loaders.ts`) runs every directive file through — so `wingfoil directives list` errored
 * `E_VALIDATION` on every freshly-`init`'d project while the generator emitted `name`/`kind`/`ref`
 * only.
 *
 * Asserted per FIELD, not just "safeParse succeeded": the three fields bug-006 names (`id`,
 * `type: directive`, `title`) are the regression surface, and `id` additionally has to equal the
 * filename stem (`spec-013`'s "Stable directive identifier … matches the filename stem") because
 * that is the key `resolveRoleDirectives` (`src/core/context.ts`, spec-012 §5) binds roles on — the
 * scaffolded `roles.yaml` lists exactly those stems.
 */
describe('templateScaffold directive output satisfies the real DirectiveFrontmatter schema (bug-006)', () => {
  for (const def of TEMPLATES) {
    it(`${def.name}: scaffolds at least one directive document to validate`, () => {
      expect(directiveFilesOf(def).length).toBeGreaterThan(0);
    });

    it(`${def.name}: every scaffolded directive frontmatter round-trips through DirectiveFrontmatter`, () => {
      for (const file of directiveFilesOf(def)) {
        const frontmatterText = extractFrontmatter(file.content);
        expect([file.path, frontmatterText]).toEqual([file.path, expect.any(String)]);
        const result = DirectiveFrontmatter.safeParse(loadYaml(frontmatterText as string));
        expect([file.path, result.success]).toEqual([file.path, true]);
      }
    });

    it(`${def.name}: every scaffolded directive carries id (= filename stem), type: directive and title`, () => {
      for (const file of directiveFilesOf(def)) {
        const parsed = loadYaml(extractFrontmatter(file.content) as string) as Record<string, unknown>;
        expect([file.path, parsed.id]).toEqual([file.path, stemOf(file.path)]);
        expect([file.path, parsed.type]).toEqual([file.path, 'directive']);
        expect([file.path, parsed.title]).toEqual([file.path, expect.any(String)]);
        expect([file.path, (parsed.title as string).length]).toEqual([file.path, expect.any(Number)]);
        expect((parsed.title as string).length).toBeGreaterThan(0);
      }
    });

    it(`${def.name}: every directive id the scaffolded roles.yaml binds is actually scaffolded`, () => {
      const rolesText = templateScaffold(def).find((f) => f.path === '.wingfoil/roles.yaml')!.content;
      const roles = loadYaml(rolesText) as { assignments: Record<string, string[]>; global: string[] };
      const scaffoldedIds = new Set(
        directiveFilesOf(def).map(
          (f) => (loadYaml(extractFrontmatter(f.content) as string) as { id?: string }).id,
        ),
      );
      const bound = [...Object.values(roles.assignments).flat(), ...roles.global];
      for (const id of bound) expect([id, scaffoldedIds.has(id)]).toEqual([id, true]);
    });
  }
});

/**
 * task-118-dna-scaffold-shows-the-technology-shape (bug-139-dna-scaffold-hides-required-category) —
 * the scaffolded `dna.yaml` wrote `stacks.technologies: []` with no hint that every entry is a
 * `{name, category}` object whose `category` is required, so the first hand edit (`- name: X`) failed
 * validation. The scaffold now shows the shape and a commented-out example block that, uncommented
 * and put in place of `technologies: []` (as the scaffold's own comment says), validates through the
 * same two-pass loader `dna show` uses (`loadDnaYaml`).
 */
describe('scaffolded dna.yaml shows the technology {name, category} shape (task-118, bug-139)', () => {
  const ACTIVE_LINE = '  technologies: []';
  const EXAMPLE_HEAD = '  # technologies:';

  function dnaTextOf(def: TemplateDefinition): string {
    return templateScaffold(def).find((f) => f.path === '.wingfoil/dna.yaml')!.content;
  }

  /** The `stacks:` block: from `stacks:` up to (exclusive) the next top-level line. */
  function stacksBlockOf(text: string): string[] {
    const lines = text.split('\n');
    const start = lines.indexOf('stacks:');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((l, i) => i > start && /^\S/.test(l));
    return lines.slice(start + 1, end === -1 ? undefined : end);
  }

  /** The commented-out example block: `  # technologies:` plus the deeper-indented comment lines after it. */
  function exampleBlockOf(text: string): string[] {
    const lines = text.split('\n');
    const head = lines.indexOf(EXAMPLE_HEAD);
    expect(head).toBeGreaterThanOrEqual(0);
    const rest = lines.slice(head + 1);
    const end = rest.findIndex((l) => !l.startsWith('  #   '));
    return [EXAMPLE_HEAD, ...(end === -1 ? rest : rest.slice(0, end))];
  }

  /** Writes `text` as `<tmp>/.wingfoil/dna.yaml` and loads it with the real loader. */
  function loadAsProject(text: string): ReturnType<typeof loadDnaYaml> {
    const root = mkdtempSync(join(tmpdir(), 'wf-task-118-'));
    try {
      mkdirSync(join(root, '.wingfoil'));
      writeFileSync(join(root, '.wingfoil', 'dna.yaml'), text);
      return loadDnaYaml(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  for (const def of TEMPLATES) {
    it(`${def.name}: the stacks block names the shape, with category required and visible (AC 1)`, () => {
      const stacks = stacksBlockOf(dnaTextOf(def));
      const comments = stacks.filter((l) => l.trimStart().startsWith('#'));
      expect(comments.some((l) => l.includes('{name, category}'))).toBe(true);
      expect(comments.some((l) => /`category` is required/.test(l))).toBe(true);
      expect(comments.some((l) => /^\s*#\s+category: \S/.test(l))).toBe(true);
      expect(stacks).toContain(ACTIVE_LINE);
    });

    it(`${def.name}: the example, uncommented in place of \`technologies: []\`, validates (AC 2)`, () => {
      const text = dnaTextOf(def);
      const example = exampleBlockOf(text).map((l) => l.replace(/^(\s*)# /, '$1'));
      const lines = text.split('\n');
      const at = lines.indexOf(ACTIVE_LINE);
      expect(at).toBeGreaterThanOrEqual(0);
      lines.splice(at, 1, ...example);

      const dna = loadAsProject(lines.join('\n'));
      expect(dna.stacks?.technologies).toEqual([{ name: 'TypeScript', category: 'language' }]);
    });

    it(`${def.name}: the unedited scaffold loads through the real two-pass loader (AC 3)`, () => {
      const dna = loadAsProject(dnaTextOf(def));
      expect(dna.stacks?.technologies).toEqual([]);
    });
  }
});

describe('scaffolded dna.yaml declares the run log, paths.runs (task-138, spec-016 §4.1)', () => {
  for (const def of TEMPLATES) {
    it(`${def.name}: paths.runs is [docs/runs/], and the scaffold still loads through the real loader`, () => {
      const text = templateScaffold(def).find((f) => f.path === '.wingfoil/dna.yaml')!.content;
      const root = mkdtempSync(join(tmpdir(), 'wf-task-138-'));
      try {
        mkdirSync(join(root, '.wingfoil'));
        writeFileSync(join(root, '.wingfoil', 'dna.yaml'), text);
        expect(loadDnaYaml(root).paths.runs).toEqual(['docs/runs/']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
