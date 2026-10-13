/**
 * MemoryYaml schema (spec-001-memory-yaml-schema) — independent per-pillar schema, no dependency on
 * dna.yaml or workflows.yaml's schemas (REQ-SYS-02, task-004-decoupled-pillars).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { MemoryYaml } from '../../src/memory/schema';

const MINIMAL_VALID = {
  version: 1.1,
  defaults: {
    states: { sequence: ['draft', 'pending', 'approved'], gates: { pending: { reject: 'draft' } } },
  },
  types: {
    task: {
      path: 'docs/04_memory/{release}/{id}.md',
      id_pattern: 'task-{n}-{slug}',
      states: {
        sequence: ['draft', 'pending', 'backlog', 'in-progress', 'in-review', 'approved', 'done'],
        gates: { pending: { reject: 'draft' }, 'in-review': { reject: 'in-progress' } },
        waiting: ['backlog', 'approved'],
      },
    },
  },
};

describe('MemoryYaml — structural shape (spec-001)', () => {
  it('accepts a minimal valid document', () => {
    const result = MemoryYaml.safeParse(MINIMAL_VALID);
    expect(result.success).toBe(true);
  });

  it('accepts `version: 1.0` — a float, not an int', () => {
    const result = MemoryYaml.safeParse({ ...MINIMAL_VALID, version: 1.0 });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive version', () => {
    const result = MemoryYaml.safeParse({ ...MINIMAL_VALID, version: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a document with no `types` key', () => {
    const rest: Record<string, unknown> = { ...MINIMAL_VALID };
    delete rest.types;
    const result = MemoryYaml.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('preserves unknown fields (`.passthrough()`, spec-009)', () => {
    const result = MemoryYaml.safeParse({ ...MINIMAL_VALID, mysteryField: 'x' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).mysteryField).toBe('x');
    }
  });
});

describe('MemoryYaml — StateMachine semantic checks (spec-001 "Semantic validation (post-parse)")', () => {
  function withTaskStates(states: Record<string, unknown>) {
    return {
      version: 1.1,
      types: {
        task: {
          path: 'docs/04_memory/{release}/{id}.md',
          states,
        },
      },
    };
  }

  it('rejects a `gates` key that is not a member of `sequence`', () => {
    const result = MemoryYaml.safeParse(
      withTaskStates({ sequence: ['draft', 'pending'], gates: { nonexistent: { reject: 'draft' } } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a `waiting` entry that is not a member of `sequence`', () => {
    const result = MemoryYaml.safeParse(
      withTaskStates({ sequence: ['draft', 'pending'], waiting: ['nonexistent'] }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a `gates.<state>.reject` target that is off-chain (not a member of `sequence`)', () => {
    // spec-001: "A gates.<state>.reject target need not be a member of sequence: ... may name an
    // off-chain decline state reached by no forward edge (e.g. bug's open: { reject: closed })."
    const result = MemoryYaml.safeParse(
      withTaskStates({ sequence: ['draft', 'open', 'triaged'], gates: { open: { reject: 'closed' } } }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects "deprecated" declared explicitly in `sequence`', () => {
    const result = MemoryYaml.safeParse(withTaskStates({ sequence: ['draft', 'deprecated'] }));
    expect(result.success).toBe(false);
  });

  it('rejects "deprecated" declared explicitly as a `gates` key', () => {
    const result = MemoryYaml.safeParse(
      withTaskStates({ sequence: ['draft', 'pending'], gates: { deprecated: { reject: 'draft' } } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects "deprecated" declared explicitly as a `gates.<state>.reject` target', () => {
    const result = MemoryYaml.safeParse(
      withTaskStates({ sequence: ['draft', 'pending'], gates: { pending: { reject: 'deprecated' } } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects "deprecated" declared explicitly in `waiting`', () => {
    const result = MemoryYaml.safeParse(
      withTaskStates({ sequence: ['draft', 'pending'], waiting: ['deprecated'] }),
    );
    expect(result.success).toBe(false);
  });

  it('applies the same checks to `defaults.states`', () => {
    const result = MemoryYaml.safeParse({
      version: 1.1,
      defaults: { states: { sequence: ['draft'], waiting: ['nonexistent'] } },
      types: { task: { path: 'docs/04_memory/{release}/{id}.md' } },
    });
    expect(result.success).toBe(false);
  });

  it('allows a state to be both in `waiting` and a `gates` key', () => {
    const result = MemoryYaml.safeParse(
      withTaskStates({
        sequence: ['draft', 'ready', 'done'],
        gates: { ready: { reject: 'draft' } },
        waiting: ['ready'],
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe('MemoryYaml — template.frontmatter.not_applicable_allowed (dl-124 Q2 (a), task-168)', () => {
  const withTemplate = (frontmatter: Record<string, unknown>): unknown => ({
    ...MINIMAL_VALID,
    types: { task: { ...MINIMAL_VALID.types.task, template: { file: 'memory/templates/task.md', frontmatter } } },
  });

  it('accepts a list of required fields', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title', 'release', 'pillar'], not_applicable_allowed: ['pillar'] }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.types.task?.template?.frontmatter.not_applicable_allowed).toEqual(['pillar']);
  });

  it('rejects an entry that is not in `required`, naming it', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title', 'release'], not_applicable_allowed: ['pillar'] }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      "not_applicable_allowed entry 'pillar' is not in template.frontmatter.required",
    );
  });

  it('rejects `title`, which spec-010 requires of every type', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title'], not_applicable_allowed: ['title'] }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      "not_applicable_allowed may not list 'title': spec-010 requires it of every type",
    );
  });

  it('rejects a non-list value', () => {
    expect(MemoryYaml.safeParse(withTemplate({ required: ['title'], not_applicable_allowed: 'pillar' })).success).toBe(false);
  });
});

describe('MemoryYaml — template.frontmatter.lists (task-168 re-review ruling 1)', () => {
  const withTemplate = (frontmatter: Record<string, unknown>): unknown => ({
    ...MINIMAL_VALID,
    types: { task: { ...MINIMAL_VALID.types.task, template: { file: 'memory/templates/task.md', frontmatter } } },
  });

  it('accepts a list of required fields', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title', 'features'], lists: ['features'] }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.types.task?.template?.frontmatter.lists).toEqual(['features']);
  });

  it('rejects an entry that is not in `required`, naming it', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title'], lists: ['features'] }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toContain("lists entry 'features' is not in template.frontmatter.required");
  });

  it('rejects `title`', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title'], lists: ['title'] }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toContain("lists may not list 'title': spec-010 requires it of every type");
  });

  it('rejects a non-list value', () => {
    expect(MemoryYaml.safeParse(withTemplate({ required: ['title'], lists: 'features' })).success).toBe(false);
  });
});

describe('MemoryYaml — template.frontmatter.exempt (bug-342, task-279)', () => {
  const withTemplate = (frontmatter: Record<string, unknown>): unknown => ({
    ...MINIMAL_VALID,
    types: { task: { ...MINIMAL_VALID.types.task, template: { file: 'memory/templates/task.md', frontmatter } } },
  });

  it('accepts a mapping of required fields to id lists, and returns it parsed', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title', 'kind'], exempt: { kind: ['minor-v0.1'] } }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect((result.data.types.task?.template?.frontmatter as Record<string, unknown>)['exempt']).toEqual({ kind: ['minor-v0.1'] });
  });

  it('rejects a key that is not in `required`, naming it', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title'], exempt: { kind: ['minor-v0.1'] } }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toContain("exempt entry 'kind' is not in template.frontmatter.required");
  });

  it('rejects `title` as a key, which spec-010 requires of every type', () => {
    const result = MemoryYaml.safeParse(withTemplate({ required: ['title', 'kind'], exempt: { title: ['minor-v0.1'] } }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toContain("exempt may not list 'title': spec-010 requires it of every type");
  });

  it('rejects a non-mapping value', () => {
    expect(MemoryYaml.safeParse(withTemplate({ required: ['title', 'kind'], exempt: ['kind'] })).success).toBe(false);
  });

  it('rejects a non-list id value', () => {
    expect(MemoryYaml.safeParse(withTemplate({ required: ['title', 'kind'], exempt: { kind: 'minor-v0.1' } })).success).toBe(false);
  });
});

describe('MemoryYaml — validates the real, live .wingfoil/memory.yaml', () => {
  it('parses with zero structural or semantic errors', () => {
    const raw = readFileSync(
      join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'),
      'utf-8',
    );
    const data = load(raw);
    const result = MemoryYaml.safeParse(data);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error(result.error.issues);
    }
  });

  it('task-168 (dl-124 Action 4, approver ruling Q-B): `release` declares pillar and requirements not-applicable, not features', () => {
    const data = MemoryYaml.parse(load(readFileSync(join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'), 'utf-8')));
    expect(data.types.release?.template?.frontmatter.not_applicable_allowed).toEqual(['pillar', 'requirements']);
    expect(data.types.task?.template?.frontmatter.not_applicable_allowed).toBeUndefined();
  });

  it('task-168 (re-review ruling 1): `release` declares `features` a list field; `task` declares none', () => {
    const data = MemoryYaml.parse(load(readFileSync(join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'), 'utf-8')));
    expect(data.types.release?.template?.frontmatter.lists).toEqual(['features']);
    expect(data.types.task?.template?.frontmatter.lists).toBeUndefined();
  });

  it('task-279 (bug-342, D1 (a)): `release` declares the pre-dl-092 minors exempt from `kind`; `task` declares none', () => {
    const data = MemoryYaml.parse(load(readFileSync(join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'), 'utf-8')));
    const exemptOf = (type: string): unknown => (data.types[type]?.template?.frontmatter as Record<string, unknown> | undefined)?.['exempt'];
    expect(exemptOf('release')).toEqual({ kind: ['minor-v0.1', 'minor-v0.2', 'minor-v0.3', 'minor-v0.4', 'minor-v1.0'] });
    expect(exemptOf('task')).toBeUndefined();
  });
});
