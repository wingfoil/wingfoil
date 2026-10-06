/**
 * Schema-driven DNA path resolution (`src/dna/path.ts`, task-093-dna-mutation-surface-add-remove-update)
 * — the single traversal `dna set|add|remove|update` share.
 *
 * Two acceptance contracts meet here:
 *
 * - `bug-084-dna-key-alias-writes-unschemad-keys` (AC1): a path that does not resolve against the
 *   schema is **refused, never created**. `setDnaValue` used to create an object for any segment it
 *   could not descend into, which is how `dna set tech_stack.cli.framework Commander` wrote
 *   `stacks.cli.framework` — a key in no schema — and committed it at exit 0.
 * - `dl-081-dna-mutation-surface-shape` (AC3/AC5, ratified option (E)): the verb's `<path>` argument
 *   holds the FULL path,
 *   entries inside a collection are addressed **by `name`** rather than by index, and all four path
 *   shapes resolve — a string array at depth 2, an object array at depth 1, an object array at depth 2,
 *   and a string array nested inside an object array.
 *
 * The resolver reads `DnaYaml` (`src/dna/schema.ts`) itself rather than a hand-written field table, so
 * the write surface cannot drift from the schema it writes.
 */
import { z } from 'zod';

import { resolveDnaPath } from '../../src/dna/path';
import { DnaYaml } from '../../src/dna/schema';

/** A schema-valid document exercising every one of `dl-081`'s four path shapes. */
function dna(): Record<string, unknown> {
  return {
    version: 1.1,
    project: { name: 'WingFoil', license: 'MIT' },
    modules: [
      { name: 'core', path: 'src/core' },
      { name: 'dna', path: 'src/dna' },
    ],
    stacks: {
      technologies: [{ name: 'TypeScript', category: 'language' }],
      methodologies: [{ name: 'TDD', phase: 'delivery' }],
    },
    team: {
      members: [{ name: 'roberto', email: 'r@example.it', roles: ['approver', 'developer'] }],
      agents: [{ name: 'claude', executes_as: ['developer'] }],
      roles: [{ name: 'approver' }, { name: 'developer' }],
    },
    paths: { sources: ['src/'], tests: ['test/'] },
  };
}

/** The resolved target, or a thrown assertion failure naming the refusal (keeps each test one-liner-ish). */
function target(path: string, document: Record<string, unknown> = dna()) {
  const resolved = resolveDnaPath(document, path);
  if (!resolved.ok) throw new Error(`expected '${path}' to resolve, got refusal: ${resolved.message}`);
  return resolved.target;
}

/** The refusal message, or a thrown assertion failure (the path was expected NOT to resolve). */
function refusal(path: string, document: Record<string, unknown> = dna()): string {
  const resolved = resolveDnaPath(document, path);
  if (resolved.ok) throw new Error(`expected '${path}' to be refused, but it resolved as ${resolved.target.kind}`);
  return resolved.message;
}

describe('resolveDnaPath — the four path shapes dl-081 enumerates (AC3, AC5)', () => {
  it('shape 1: an array of strings at depth 2 (paths.sources)', () => {
    const resolved = target('paths.sources');
    expect(resolved.kind).toBe('string-list');
    expect(resolved.value).toEqual(['src/']);
    expect(resolved.exists).toBe(true);
  });

  it('shape 2: an array of objects at depth 1 (modules) and one entry of it, addressed by name', () => {
    expect(target('modules').kind).toBe('collection');

    const entry = target('modules.dna');
    expect(entry.kind).toBe('entry');
    expect(entry.entryIndex).toBe(1);
    expect(entry.value).toEqual({ name: 'dna', path: 'src/dna' });
  });

  it('shape 3: an array of objects at depth 2 (team.members, stacks.technologies)', () => {
    expect(target('team.members').kind).toBe('collection');
    expect(target('stacks.technologies').kind).toBe('collection');
    expect(target('team.members.roberto').entryIndex).toBe(0);
    expect(target('stacks.technologies.TypeScript.category').value).toBe('language');
  });

  it('shape 4: a string array nested inside an object array (team.members.<name>.roles)', () => {
    const resolved = target('team.members.roberto.roles');
    expect(resolved.kind).toBe('string-list');
    expect(resolved.value).toEqual(['approver', 'developer']);
  });

  it('`team.roles` and `team.members.<name>.roles` are different fields and both resolve (the one name collision dl-081 measured)', () => {
    expect(target('team.roles').kind).toBe('collection');
    expect(target('team.members.roberto.roles').kind).toBe('string-list');
  });

  it('a scalar leaf resolves as a scalar, and reports whether the schema requires it', () => {
    expect(target('project.license')).toMatchObject({ kind: 'scalar', value: 'MIT', required: false });
    expect(target('version')).toMatchObject({ kind: 'scalar', value: 1.1, required: true });
    expect(target('modules.core.path')).toMatchObject({ kind: 'scalar', value: 'src/core', required: false });
    expect(target('modules.core.name')).toMatchObject({ kind: 'scalar', required: true });
  });

  it('an object node resolves as a section (not a writable target for any verb)', () => {
    expect(target('project').kind).toBe('section');
    expect(target('team').kind).toBe('section');
    expect(target('paths').kind).toBe('section');
  });

  it('a declared-but-absent node resolves with exists=false, so an optional section can still be filled', () => {
    const empty = { version: 1, modules: [], stacks: {}, team: { members: [], roles: [] }, paths: {} };
    const resolved = target('project.name', empty as unknown as Record<string, unknown>);
    expect(resolved.kind).toBe('scalar');
    expect(resolved.exists).toBe(false);
    expect(resolved.value).toBeUndefined();
  });

  it('a collection reports its entry fields, in schema order, with their kinds and requiredness', () => {
    expect(target('team.members').entryFields).toEqual([
      { name: 'name', kind: 'string', required: true },
      { name: 'email', kind: 'string', required: false },
      { name: 'roles', kind: 'string-list', required: true },
    ]);
    expect(target('team.agents').entryFields).toEqual([
      { name: 'name', kind: 'string', required: true },
      { name: 'email', kind: 'string', required: false }, // task-256, bug-240
      { name: 'executes_as', kind: 'string-list', required: true },
      { name: 'approval_authority', kind: 'boolean', required: false },
      { name: 'adapter', kind: 'string', required: false },
    ]);
  });

  it('paths.runs is a declared list of values (task-138, spec-016 §4.1), not an unknown field', () => {
    const empty = { version: 1, modules: [], stacks: {}, team: { members: [], roles: [] }, paths: {} };
    const resolved = target('paths.runs', empty as unknown as Record<string, unknown>);
    expect(resolved.kind).toBe('string-list');
    expect(resolved.exists).toBe(false);
    expect(resolved.required).toBe(false);
  });
});

describe('resolveDnaPath — bug-084: a path the schema does not declare is refused, never created (AC1)', () => {
  it("refuses the alias path that used to be written and committed ('tech_stack.cli.framework')", () => {
    const message = refusal('tech_stack.cli.framework');
    expect(message).toContain("'tech_stack.cli.framework'");
    expect(message).toContain('tech_stack');
  });

  it('refuses an unknown key at the root, naming the full path and the offending segment', () => {
    const message = refusal('nonsense.at.any.depth');
    expect(message).toContain("'nonsense.at.any.depth'");
    expect(message).toContain('nonsense');
  });

  it("refuses an unknown key under a declared section ('stacks.cli')", () => {
    expect(refusal('stacks.cli')).toContain('stacks');
  });

  it('refuses a path that tries to descend through a scalar', () => {
    expect(refusal('project.license.deeper')).toContain('project.license');
  });

  it('refuses a path that tries to descend through a list of values', () => {
    expect(refusal('paths.sources.0')).toContain('paths.sources');
  });

  it('refuses an INDEX where an entry name is expected — indices are not the addressing form (dl-081)', () => {
    expect(refusal('modules.0')).toContain('modules');
    expect(refusal('team.members.0.roles')).toContain('team.members');
  });

  it('refuses an entry path against a document where the collection itself is absent', () => {
    const bare = { version: 1, modules: [], stacks: {}, team: { members: [], roles: [] }, paths: {} };
    expect(refusal('team.agents.claude', bare as unknown as Record<string, unknown>)).toContain('claude');
  });

  it('refuses an entry name that is not present in the collection', () => {
    const message = refusal('team.members.nobody.roles');
    expect(message).toContain('nobody');
    expect(message).toContain('team.members');
  });

  it('refuses a malformed path (empty segment) rather than resolving it', () => {
    expect(refusal('..language')).toContain('..language');
    expect(refusal('')).toBeTruthy();
  });

  it('refuses a duplicate entry name as ambiguous rather than picking one (the addressing prerequisite, AC4)', () => {
    const duplicated = dna();
    (duplicated.modules as Array<Record<string, unknown>>).push({ name: 'core', path: 'elsewhere' });
    const message = refusal('modules.core', duplicated);
    expect(message).toContain('core');
    expect(message).toContain('modules');
  });
});

describe('the DNA pillar accepts an unknown key when READING and refuses to write one (AC1, both halves)', () => {
  const withUnknownKeys = {
    version: 1,
    modules: [],
    stacks: { technologies: [], cli: { framework: 'Commander' } },
    team: { members: [], roles: [] },
    paths: {},
    future_section: { anything: true },
  };

  it('read: DnaYaml still parses a document carrying keys no schema declares (spec-002 .passthrough(), unchanged)', () => {
    const parsed = DnaYaml.safeParse(withUnknownKeys);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect((parsed.data.stacks as Record<string, unknown>).cli).toEqual({ framework: 'Commander' });
    expect((parsed.data as Record<string, unknown>).future_section).toEqual({ anything: true });
  });

  it('write: the same keys are refused by the resolver every write path goes through', () => {
    expect(refusal('stacks.cli.framework', withUnknownKeys)).toContain('stacks.cli.framework');
    expect(refusal('future_section.anything', withUnknownKeys)).toContain('future_section');
  });
});

describe('what counts as an addressable shape — pinned against schemas spec-002 does not declare today', () => {
  // `resolveDnaPath` takes the schema as a parameter precisely so these rules are exercised rather
  // than asserted: `DnaYaml` happens to contain only objects, scalars, string arrays and object
  // arrays, so every other shape would otherwise be an untested claim about what the traversal does.
  const exotic = z.object({
    matrix: z.array(z.array(z.string())),
    pairs: z.array(z.tuple([z.string(), z.number()])),
    when: z.date(),
    counts: z.array(z.number()),
    entries: z.array(z.object({ name: z.string(), size: z.number(), tags: z.array(z.string()), blob: z.date() })),
  });

  it('refuses a path that ends on a shape it cannot classify, rather than guessing a verb for it', () => {
    for (const field of ['matrix', 'pairs', 'when', 'counts']) {
      const resolved = resolveDnaPath({}, field, exotic);
      expect(resolved.ok).toBe(false);
      if (!resolved.ok) expect(resolved.message).toContain(field);
    }
  });

  it("classifies an entry field it cannot map to an option value as 'other', leaving it as given", () => {
    const resolved = resolveDnaPath({ entries: [] }, 'entries', exotic);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.target.entryFields).toEqual([
      { name: 'name', kind: 'string', required: true },
      { name: 'size', kind: 'number', required: true },
      { name: 'tags', kind: 'string-list', required: true },
      { name: 'blob', kind: 'other', required: true },
    ]);
  });
});

describe('resolveDnaPath is deterministic and non-mutating (REQ-SYS-07)', () => {
  it('leaves the document untouched, including on a refusal', () => {
    const document = dna();
    const before = JSON.stringify(document);
    resolveDnaPath(document, 'tech_stack.cli.framework');
    resolveDnaPath(document, 'team.members.roberto.roles');
    resolveDnaPath(document, 'project.name');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('returns the same answer for the same input, call after call', () => {
    const document = dna();
    const first = resolveDnaPath(document, 'team.members.roberto.roles');
    const second = resolveDnaPath(document, 'team.members.roberto.roles');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
