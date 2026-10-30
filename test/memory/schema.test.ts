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

/**
 * task-313 AC 1 (`bug-360`, REQ-SEC-06; approver design gate 2026-10-30, D1 (a), D2 (a), D3 (a)) — a type's `path`
 * is refused at load when it is absolute or holds a `.`/`..` segment: one issue per `path`, at
 * `types.<type>.path`, the absolute check first. An empty segment is not refused (D2 (a)), and a segment that only
 * contains dots beside a token or text is not a dot segment.
 */
describe('MemoryYaml — a type `path` is one relative path with no `.`/`..` segment (task-313 AC 1, bug-360)', () => {
  const withPath = (path: string): unknown => ({ ...MINIMAL_VALID, types: { task: { ...MINIMAL_VALID.types.task, path } } });
  const issuesOf = (input: unknown): Array<{ path: readonly PropertyKey[]; message: string }> => {
    const result = MemoryYaml.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  };

  it.each([
    ['docs/04_memory/../../outside/{id}.md'],
    ['docs/04_memory/./{id}.md'],
    ['../escaped/{id}.md'],
  ])('red-first: refuses %s, naming the pattern: "holds a \'.\' or \'..\' segment"', (path) => {
    expect(MemoryYaml.safeParse(withPath(path)).success).toBe(false);
    expect(issuesOf(withPath(path))).toEqual([{ path: ['types', 'task', 'path'], message: `path "${path}" holds a '.' or '..' segment` }]);
  });

  it.each([
    ['/tmp/abs/{id}.md'],
    ['\\\\server\\{id}.md'],
    ['C:/x/{id}.md'],
  ])('red-first: refuses the absolute %s, naming the pattern: "must be a relative path"', (path) => {
    expect(MemoryYaml.safeParse(withPath(path)).success).toBe(false);
    expect(issuesOf(withPath(path))).toEqual([{ path: ['types', 'task', 'path'], message: `path "${path}" must be a relative path` }]);
  });

  it.each([
    ['docs/04_memory/planning/rl-{release-line}/{id}.md'],
    ['docs/05_plans/{scope}/{id}.md'],
    ['docs/v0.1/{id}.md'],
    ['docs/..x/{id}.md'],
    ['docs//x/{id}.md'],
  ])('characterization: accepts %s (dots inside a segment, an empty segment — D2 (a))', (path) => {
    expect(issuesOf(withPath(path))).toEqual([]);
    expect(MemoryYaml.safeParse(withPath(path)).success).toBe(true);
  });
});

/**
 * task-313 AC 2 (`bug-216`, spec-009 Pass 2; approver design gate 2026-10-30, D1 (a), D3 (a)) — a type's
 * `id_pattern` is checked at load by `idPatternIssues`, as a workflow action's override is
 * (`test/workflow/schema.test.ts`): one issue per problem, at `types.<type>.id_pattern`, message
 * `id_pattern "<pattern>": <issue>`.
 */
describe('MemoryYaml — a type `id_pattern` is checked by idPatternIssues at load (task-313 AC 2, bug-216)', () => {
  const withIdPattern = (idPattern: string): unknown => ({
    ...MINIMAL_VALID,
    types: { task: { ...MINIMAL_VALID.types.task, id_pattern: idPattern } },
  });
  const issuesOf = (input: unknown): Array<{ path: readonly PropertyKey[]; message: string }> => {
    const result = MemoryYaml.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  };

  it.each([
    ['task-{n:0}-{slug}', 'malformed token {n:0}'],
    ['task-{counter:3}-{slug}', 'malformed token {counter:3}'],
    ['TASK_{n}', 'pattern contains character(s) outside [a-z0-9-.]: T, A, S, K, _'],
    ['retro-{release.version}', 'dotted token {release.version} is not defined until dl-090'],
    ['', 'pattern is empty'],
  ])('red-first: refuses %j with one issue: %s', (idPattern, issue) => {
    expect(MemoryYaml.safeParse(withIdPattern(idPattern)).success).toBe(false);
    expect(issuesOf(withIdPattern(idPattern))).toEqual([{ path: ['types', 'task', 'id_pattern'], message: `id_pattern "${idPattern}": ${issue}` }]);
  });

  it('red-first: a pattern with two problems gets two issues, in idPatternIssues order', () => {
    expect(issuesOf(withIdPattern('TASK_{Slug}'))).toEqual([
      { path: ['types', 'task', 'id_pattern'], message: 'id_pattern "TASK_{Slug}": pattern contains character(s) outside [a-z0-9-.]: T, A, S, K, _' },
      { path: ['types', 'task', 'id_pattern'], message: 'id_pattern "TASK_{Slug}": malformed token {Slug}' },
    ]);
  });

  it.each([['p-{n:2}-{slug}'], ['t-{nnn}'], ['r-{date}-{author}-{kind}-{n}']])('characterization: accepts %s', (idPattern) => {
    expect(issuesOf(withIdPattern(idPattern))).toEqual([]);
  });

  it('characterization: accepts every `id_pattern` of the live .wingfoil/memory.yaml, each on its own', () => {
    const live = load(readFileSync(join(__dirname, '..', '..', '.wingfoil', 'memory.yaml'), 'utf-8')) as {
      types: Record<string, { id_pattern?: string }>;
    };
    const patterns = Object.values(live.types).flatMap((type) => (type.id_pattern === undefined ? [] : [type.id_pattern]));
    expect(patterns.length).toBeGreaterThan(0);
    for (const idPattern of patterns) {
      expect({ idPattern, issues: issuesOf(withIdPattern(idPattern)) }).toEqual({ idPattern, issues: [] });
    }
  });
});
