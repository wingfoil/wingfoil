/**
 * The comment-preserving structural edit (`src/dna/edit.ts`, task-093) — the sequence-aware sibling of
 * `setDnaValueInText` (`task-063`, `bug-004-dna-set-strips-yaml-comments`).
 *
 * `setDnaValueInText` rewrites or inserts exactly one **mapping** line and deliberately skips every
 * sequence branch, so it can express none of the shapes `dl-081`'s verbs write. Its fallback — a
 * whole-file `dump()` — is correct but strips every comment, including the inline `[SPEC]`/`[AUTHORING]`
 * field-provenance annotations `bug-004` exists to protect. That fallback is rare for `dna set` and
 * would be the NORM for `dna add`, so the structural edit is part of the mutation surface rather than a
 * follow-up to it.
 *
 * Same safety contract as `setDnaValueInText`: every candidate edit is verified by re-parsing it and
 * comparing the WHOLE document against the intended object, and anything it cannot do provably-minimally
 * returns `undefined` for the caller to fall back on.
 */
import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { applyDnaEditInText, type DnaTextEdit } from '../../src/dna/edit';
import { applyDnaMutation, type DnaMutationRequest } from '../../src/dna/mutate';

/**
 * Run a mutation through the text editor, returning the edited text (or `undefined` for "no minimal
 * edit"). `schema` defaults to `DnaYaml`; the YAML-style cases below pass a small schema of their own,
 * because what is under test there is how the EDITOR meets a written style, not which fields
 * `spec-002` declares.
 */
function edit(text: string, request: DnaMutationRequest, schema?: z.ZodType): string | undefined {
  const document = load(text) as Record<string, unknown>;
  const applied = applyDnaMutation(document, request, schema);
  if (!applied.ok) throw new Error(`fixture bug: the mutation was refused — ${applied.message}`);
  return applyDnaEditInText(text, applied.edit, applied.dna);
}

/** Run a mutation through the editor and fail loudly if it declined to produce a minimal edit. */
function edited(text: string, request: DnaMutationRequest, schema?: z.ZodType): string {
  const result = edit(text, request, schema);
  if (result === undefined) throw new Error('expected a minimal in-place edit, got undefined (the dump() fallback)');
  return result;
}

const BLOCK = `# top comment
version: 1                       # [AUTHORING] format version

# Modules — the parts of the system   [SPEC: P2.4]
modules:
  - name: core
    description: Shared domain logic.
    path: src/core
  - name: dna
    path: src/dna

team:
  members:
    - name: roberto
      email: r@example.it
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer

# Resource paths
paths:
  sources:
    - src/
  tests: []
`;

describe('append to a sequence — the flow `dna add` runs on every fresh project', () => {
  it('appends an object entry to a block sequence, leaving every comment byte-for-byte', () => {
    const result = edited(BLOCK, { verb: 'add', field: 'modules', value: 'cli', fields: { path: 'src/cli' } });
    expect(result).toContain('# Modules — the parts of the system   [SPEC: P2.4]');
    expect(result).toContain('# [AUTHORING] format version');
    expect(result).toContain('  - name: cli\n    path: src/cli\n');
    expect((load(result) as { modules: unknown[] }).modules).toHaveLength(3);
  });

  it('appends a value to a FLOW sequence of strings, in place on its own line', () => {
    const result = edited(BLOCK, { verb: 'add', field: 'team.members.roberto.roles', value: 'qa' });
    expect(result).toContain('roles: [ approver, developer, qa ]');
  });

  it('appends a value to a BLOCK sequence of strings, at the items\' own indentation', () => {
    const result = edited(BLOCK, { verb: 'add', field: 'paths.sources', value: 'lib/' });
    expect(result).toContain('  sources:\n    - src/\n    - lib/\n');
  });

  it('turns an empty `[]` into a block sequence when the first item is added', () => {
    const result = edited(BLOCK, { verb: 'add', field: 'paths.tests', value: 'test/' });
    expect(result).toContain('  tests:\n    - test/\n');
    expect((load(result) as { paths: { tests: string[] } }).paths.tests).toEqual(['test/']);
  });
});

describe('remove from a sequence', () => {
  it('removes an object entry and only its own lines', () => {
    const result = edited(BLOCK, { verb: 'remove', field: 'modules', value: 'core' });
    expect(result).toContain('# Modules — the parts of the system   [SPEC: P2.4]');
    expect(result).not.toContain('Shared domain logic');
    expect(result).toContain('  - name: dna\n    path: src/dna\n');
  });

  it('removes a value from a flow sequence', () => {
    const result = edited(BLOCK, { verb: 'remove', field: 'team.members.roberto.roles', value: 'developer' });
    expect(result).toContain('roles: [ approver ]');
  });

  it('removes several values from a block sequence in one edit, highest index first', () => {
    const text = 'paths:\n  sources:\n    - src/\n    - lib/\n    - vendor/\n';
    const result = edited(text, { verb: 'remove', field: 'paths.sources', value: 'src/,vendor/' }, z.object({ paths: z.object({ sources: z.array(z.string()) }) }));
    expect(result).toBe('paths:\n  sources:\n    - lib/\n');
  });

  it('removes a value from a block sequence', () => {
    const result = edited(BLOCK, { verb: 'remove', field: 'paths.sources', value: 'src/' });
    expect((load(result) as { paths: { sources: unknown[] } }).paths.sources).toEqual([]);
  });
});

describe('update and delete a scalar, including inside a sequence entry', () => {
  it("rewrites a scalar inside an entry addressed by the entry's name", () => {
    const result = edited(BLOCK, { verb: 'update', field: 'modules.core.path', value: 'source/core' });
    expect(result).toContain('    path: source/core\n');
    expect(result).toContain('    description: Shared domain logic.\n');
  });

  it('adds a scalar an entry did not carry, inside that entry', () => {
    const result = edited(BLOCK, { verb: 'update', field: 'modules.dna', fields: { description: 'DNA pillar.' } });
    expect((load(result) as { modules: Array<Record<string, unknown>> }).modules[1]).toEqual({
      name: 'dna',
      path: 'src/dna',
      description: 'DNA pillar.',
    });
  });

  it('deletes an optional scalar from inside an entry', () => {
    const result = edited(BLOCK, { verb: 'remove', field: 'team.members.roberto.email' });
    expect(result).not.toContain('r@example.it');
    expect(result).toContain('    - name: roberto\n');
  });

  it('replaces a whole flow list', () => {
    const result = edited(BLOCK, { verb: 'update', field: 'team.members.roberto.roles', value: 'qa,reviewer' });
    expect((load(result) as { team: { members: Array<{ roles: string[] }> } }).team.members[0]!.roles).toEqual([
      'qa',
      'reviewer',
    ]);
  });
});

describe("WingFoil's own dna.yaml survives a round trip with its provenance annotations intact", () => {
  const path = join(__dirname, '..', '..', '.wingfoil', 'dna.yaml');
  const text = readFileSync(path, 'utf-8');

  /** Every comment line in a document, trimmed — the thing `bug-004` exists to keep. */
  function comments(source: string): string[] {
    return source.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('#'));
  }

  it.each<[string, DnaMutationRequest]>([
    ['add a module', { verb: 'add', field: 'modules', value: 'scratch', fields: { path: 'src/scratch' } }],
    ['add a role to the catalogue', { verb: 'add', field: 'team.roles', value: 'scribe' }],
    ['add a path', { verb: 'add', field: 'paths.sources', value: 'lib/' }],
    ['add a role to a member', { verb: 'add', field: 'team.members.Roberto Pompermaier.roles', value: 'scribe' }],
    ['update a technology', { verb: 'update', field: 'stacks.technologies.TypeScript', fields: { version: '5.9' } }],
    ['remove a module', { verb: 'remove', field: 'modules', value: 'validation' }],
  ])('%s — every comment line is still present', (_name, request) => {
    const result = edited(text, request);
    expect(comments(result)).toEqual(comments(text));
  });
});

describe('several fields at once, and a block list replaced wholesale', () => {
  it('applies a batch — one entry update changing two fields is two line rewrites, verified once', () => {
    const result = edited(BLOCK, {
      verb: 'update',
      field: 'modules.core',
      fields: { path: 'source/core', description: 'Shared domain logic, moved.' },
    });
    expect((load(result) as { modules: Array<Record<string, unknown>> }).modules[0]).toEqual({
      name: 'core',
      description: 'Shared domain logic, moved.',
      path: 'source/core',
    });
    expect(result).toContain('# Modules — the parts of the system   [SPEC: P2.4]');
  });

  it('replaces a BLOCK sequence of strings in place, at the items\' own indentation', () => {
    const result = edited(BLOCK, { verb: 'update', field: 'paths.sources', value: 'lib/,vendor/' });
    expect(result).toContain('  sources:\n    - lib/\n    - vendor/\n');
    expect(result).toContain('# Resource paths');
  });

  it('verifies a document carrying a YAML timestamp by value, not by object identity', () => {
    // js-yaml's default schema parses `2020-01-01` into a Date; two different Dates are two different
    // objects, so a verification that compared them structurally as empty objects would wave through
    // an edit that changed one. dna.yaml declares no date field today — this pins the comparison
    // rather than the schema.
    const text = 'released: 2020-01-01\nitems:\n  - a\n';
    const intended = { released: new Date('2020-01-01T00:00:00.000Z'), items: ['a', 'b'] };
    const edit = { kind: 'append-items' as const, path: [{ key: 'items' }], items: ['b'] };
    expect(applyDnaEditInText(text, edit, intended)).toBe('released: 2020-01-01\nitems:\n  - a\n  - b\n');

    const wrongDate = { released: new Date('2021-06-06T00:00:00.000Z'), items: ['a', 'b'] };
    expect(applyDnaEditInText(text, edit, wrongDate)).toBeUndefined();
  });
});

describe('YAML styles the editor has to meet in a hand-written file', () => {
  const MEMBERS = z.object({ members: z.array(z.object({ name: z.string(), roles: z.array(z.string()) })) });
  const MODULES = z.object({ modules: z.array(z.object({ name: z.string(), path: z.string().optional() })) });
  const SOURCES = z.object({ sources: z.array(z.string()) });

  it('empties a flow list to `[]` rather than leaving dangling brackets', () => {
    const text = 'members:\n  - name: a\n    roles: [ x, y ]\n';
    const first = edited(text, { verb: 'remove', field: 'members.a.roles', value: 'x' }, MEMBERS);
    const second = edited(first, { verb: 'remove', field: 'members.a.roles', value: 'y' }, MEMBERS);
    expect(second).toContain('roles: []');
    expect((load(second) as { members: Array<{ roles: string[] }> }).members[0]!.roles).toEqual([]);
  });

  it('keeps a flow list written WITHOUT inner spaces in that style', () => {
    const text = 'members:\n  - name: a\n    roles: [dev, qa]\n';
    expect(edited(text, { verb: 'add', field: 'members.a.roles', value: 'lead' }, MEMBERS)).toContain('roles: [dev, qa, lead]');
  });

  it("renders each value as js-yaml itself would, quoting what would otherwise read back as something else", () => {
    // `y` is a YAML 1.1 boolean spelling, so js-yaml quotes it on the way out; the renderer emits the
    // same token a whole-file `dump()` would, which is what keeps the two write paths interchangeable.
    const text = 'members:\n  - name: a\n    roles: [ dev ]\n';
    const result = edited(text, { verb: 'add', field: 'members.a.roles', value: 'y' }, MEMBERS);
    expect(result).toContain("roles: [ dev, 'y' ]");
    expect((load(result) as { members: Array<{ roles: string[] }> }).members[0]!.roles).toEqual(['dev', 'y']);
  });

  it('reads a sequence written at its key\'s own indentation (YAML permits it; hand-written files use it)', () => {
    const text = 'sources:\n- src/\n- lib/\n';
    const result = edited(text, { verb: 'add', field: 'sources', value: 'vendor/' }, SOURCES);
    expect(result).toBe('sources:\n- src/\n- lib/\n- vendor/\n');
  });

  it('rewrites a field that sits on the `- ` line itself, keeping the dash and the item intact', () => {
    const text = 'modules:\n  - path: src/core\n    name: core\n';
    const result = edited(text, { verb: 'update', field: 'modules.core.path', value: 'source/core' }, MODULES);
    expect(result).toBe('modules:\n  - path: source/core\n    name: core\n');
  });

  it('falls back to a single separating space when a new value overruns its comment column, inside an entry', () => {
    const text = 'modules:\n  - name: core\n    path: a      # where it lives\n';
    const result = edited(text, { verb: 'update', field: 'modules.core.path', value: 'a-much-longer-path/inside/the/tree' }, MODULES);
    expect(result).toContain('    path: a-much-longer-path/inside/the/tree # where it lives\n');
  });

  it('declines a removal whose target key holds a mapping rather than a sequence', () => {
    expect(
      applyDnaEditInText('project:\n  name: a\n', { kind: 'remove-items', path: [{ key: 'project' }], indexes: [0] }, { unreachable: true }),
    ).toBeUndefined();
  });
});

describe('the safety contract: verified, or `undefined` for the caller to fall back on', () => {
  // task-193 (`bug-126`): an absent target key is now inserted under its parent (see the task-193 block
  // below); what is still declined is a parent written as a non-empty FLOW mapping, under which no
  // block line can be added.
  it('declines (returns undefined) when the absent target key\'s parent is a non-empty flow mapping', () => {
    const text = 'version: 1\nmodules: []\nstacks: {}\nteam:\n  members: []\n  roles: []\npaths: { tests: [] }\n';
    expect(edit(text, { verb: 'add', field: 'paths.sources', value: 'src/' })).toBeUndefined();
  });

  // Each case below is one entry of the refusal list in this module's doc comment. They are driven
  // through `applyDnaEditInText` directly, with a hand-made edit, because most of them describe YAML
  // the mutation verbs cannot produce a request for — the point is that the EDITOR declines rather
  // than writing something subtly wrong, whatever it is handed.
  //
  // `intended` is the document the text ALREADY holds, which is the strict sentinel here: an editor
  // that quietly returned the text unchanged would pass its own read-back check and hand that text
  // back, so these assertions would fail. Only a genuine decline satisfies them.
  describe.each<[string, string, DnaTextEdit]>([
    [
      'the target key opens a nested block, so rewriting its line would orphan what follows',
      'project:\n  name: a\n',
      { kind: 'set-scalar', path: [{ key: 'project' }], value: 'plain' },
    ],
    [
      'the path ends at a sequence index where a mapping key is required',
      'items:\n  - name: a\n',
      { kind: 'set-scalar', path: [{ key: 'items' }, { index: 0 }], value: 'x' },
    ],
    [
      'a delete targets something that is not a mapping key',
      'items:\n  - name: a\n',
      { kind: 'delete-key', path: [{ key: 'items' }, { index: 0 }] },
    ],
    [
      'an append targets a key that holds a plain scalar rather than a sequence',
      'items: nonsense\n',
      { kind: 'append-items', path: [{ key: 'items' }], items: ['a'] },
    ],
    [
      'an appended item needs more than one line of its own',
      'items: []\n',
      { kind: 'append-items', path: [{ key: 'items' }], items: [{ nested: { deeper: true } }] },
    ],
    [
      'an appended item is an empty mapping, which has no `- key: value` form',
      'items: []\n',
      { kind: 'append-items', path: [{ key: 'items' }], items: [{}] },
    ],
    [
      'a removal names an index the sequence does not have',
      'items:\n  - a\n',
      { kind: 'remove-items', path: [{ key: 'items' }], indexes: [7] },
    ],
    [
      'a removal targets a key with no sequence under it',
      'items:\n',
      { kind: 'remove-items', path: [{ key: 'items' }], indexes: [0] },
    ],
    [
      'a list replacement targets a key with no sequence under it',
      'items:\n',
      { kind: 'replace-list', path: [{ key: 'items' }], items: ['a'] },
    ],
    [
      'one edit of a batch cannot be applied, so the batch as a whole is declined',
      'items:\n  - a\nname: x\n',
      {
        kind: 'batch',
        edits: [
          { kind: 'set-scalar', path: [{ key: 'name' }], value: 'y' },
          { kind: 'set-scalar', path: [{ key: 'absent' }, { key: 'deeper' }], value: 'z' },
        ],
      },
    ],
    // task-193: the absent-key insertion (`insertMissingPath`) declines what it cannot open.
    [
      'an absent key sits below a sequence index the sequence does not have (no entry to descend into)',
      'items:\n  - name: a\n',
      { kind: 'set-scalar', path: [{ key: 'items' }, { index: 2 }, { key: 'name' }], value: 'x' },
    ],
    [
      'an append names an absent sequence index rather than an absent key',
      'items:\n  - a\n',
      { kind: 'append-items', path: [{ key: 'items' }, { index: 3 }], items: ['b'] },
    ],
    [
      'an append targets an existing sequence item rather than a key',
      'items:\n  - a\n',
      { kind: 'append-items', path: [{ key: 'items' }, { index: 0 }], items: ['b'] },
    ],
    [
      'an absent sequence would open with an empty-mapping item, which has no `- key: value` form',
      'team:\n  roles: []\n',
      { kind: 'append-items', path: [{ key: 'team' }, { key: 'agents' }], items: [{}] },
    ],
    [
      'an absent key\'s parent holds a plain scalar, under which no block line can be added',
      'project: none\n',
      { kind: 'set-scalar', path: [{ key: 'project' }, { key: 'name' }], value: 'x' },
    ],
  ])('declines: %s', (_case, text, pending) => {
    it('returns undefined instead of an edit', () => {
      expect(applyDnaEditInText(text, pending, load(text))).toBeUndefined();
    });
  });

  it('declines when its own candidate does not parse — the last line of the safety contract', () => {
    // The one route that reaches the re-parse `catch`: a key inserted under a parent that already
    // holds a scalar produces `a: 1` followed by an indented `b: x`, which is not a YAML document at
    // all. Nothing the mutation verbs can request lands here — `resolveDnaPath` refuses a path that
    // descends through a value — but the editor is handed edits by a caller, and this is what it does
    // when the bytes it just built cannot be read back.
    const text = 'a: 1\n';
    const edit = { kind: 'set-scalar' as const, path: [{ key: 'a' }, { key: 'b' }], value: 'x' };
    expect(() => load('a: 1\n  b: x\n')).toThrow();
    expect(applyDnaEditInText(text, edit, { a: { b: 'x' } })).toBeUndefined();
  });

  it('declines when the edited text would not read back as the intended document', () => {
    // The last line of defence, and the one that makes a mis-located edit cost the comments rather
    // than the content: the candidate is correct YAML and the edit applied cleanly, but the caller's
    // intended document says something else.
    const text = 'items:\n  - a\n';
    const edit = { kind: 'append-items' as const, path: [{ key: 'items' }], items: ['b'] };
    expect(applyDnaEditInText(text, edit, { items: ['a', 'b'] })).toBe('items:\n  - a\n  - b\n');
    expect(applyDnaEditInText(text, edit, { items: ['a', 'b'], extra: 1 })).toBeUndefined();
    expect(applyDnaEditInText(text, edit, { items: 'not a list' })).toBeUndefined();
    expect(applyDnaEditInText(text, edit, ['a', 'b'])).toBeUndefined();
    expect(applyDnaEditInText(text, edit, null)).toBeUndefined();
  });

  it('declines an index step that the sequence does not have, at any depth of the path', () => {
    const text = 'items:\n  - name: a\n';
    expect(
      applyDnaEditInText(text, { kind: 'set-scalar', path: [{ key: 'items' }, { index: 4 }, { key: 'name' }], value: 'x' }, load(text)),
    ).toBeUndefined();
  });

  it('declines a path step that descends into something that is not a mapping', () => {
    const text = 'items:\n  - a\n';
    expect(
      applyDnaEditInText(text, { kind: 'append-items', path: [{ key: 'items' }, { index: 0 }, { key: 'deeper' }], items: ['x'] }, load(text)),
    ).toBeUndefined();
  });

  it('reads past blank lines and comments inside a block when locating a key or an item', () => {
    const text = 'items:\n\n  # the first one\n  - name: a\n\n  # the second one\n  - name: b\n\nother: x\n';
    const result = applyDnaEditInText(
      text,
      { kind: 'set-scalar', path: [{ key: 'items' }, { index: 1 }, { key: 'name' }], value: 'renamed' },
      { items: [{ name: 'a' }, { name: 'renamed' }], other: 'x' },
    );
    expect(result).toContain('# the second one\n  - name: renamed\n');
    expect(result).toContain('# the first one\n  - name: a\n');
  });

  it('appends to a key that opens no block at all, at a derived indentation', () => {
    const text = 'items:\nother: x\n';
    const result = applyDnaEditInText(
      text,
      { kind: 'append-items', path: [{ key: 'items' }], items: ['a'] },
      { items: ['a'], other: 'x' },
    );
    expect(result).toBe('items:\n  - a\nother: x\n');
  });

  it('declines rather than guessing when the document does not parse as a single YAML document', () => {
    const document = load(BLOCK) as Record<string, unknown>;
    const applied = applyDnaMutation(document, { verb: 'add', field: 'paths.sources', value: 'lib/' });
    if (!applied.ok) throw new Error('fixture bug');
    expect(applyDnaEditInText('{{ not yaml', applied.edit, applied.dna)).toBeUndefined();
  });

  it('never returns text that parses to anything but the intended document', () => {
    const document = load(BLOCK) as Record<string, unknown>;
    const applied = applyDnaMutation(document, { verb: 'add', field: 'modules', value: 'cli', fields: { path: 'src/cli' } });
    if (!applied.ok) throw new Error('fixture bug');
    const result = applyDnaEditInText(BLOCK, applied.edit, applied.dna);
    expect(result).toBeDefined();
    expect(load(result!)).toEqual(applied.dna);
  });

  it('is a pure function of its inputs — same answer, and the input text is never mutated (REQ-SYS-07)', () => {
    const first = edited(BLOCK, { verb: 'add', field: 'modules', value: 'cli', fields: { path: 'src/cli' } });
    const second = edited(BLOCK, { verb: 'add', field: 'modules', value: 'cli', fields: { path: 'src/cli' } });
    expect(first).toBe(second);
  });
});

/**
 * task-193 (`bug-019`, `bug-126`) — the shapes that used to fall back to the whole-file `dump()` and
 * strip every comment are now edited in place: the first entry of a collection the file does not
 * declare yet, a key whose parents are absent too, a key holding a block scalar, and a CRLF file.
 */
describe('task-193: the former dump() shapes are edited in place, comments intact', () => {
  /** Every comment line, trimmed, in order. */
  function comments(source: string): string[] {
    return source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('#'));
  }

  /** `after` must be `before` with exactly the lines `inserted` added at one place, and nothing else touched. */
  function expectPureInsertion(before: string, after: string, inserted: readonly string[]): void {
    const b = before.split('\n');
    const a = after.split('\n');
    let prefix = 0;
    while (prefix < b.length && b[prefix] === a[prefix]) prefix += 1;
    expect(a.slice(prefix, prefix + inserted.length)).toEqual(inserted);
    expect([...a.slice(0, prefix), ...a.slice(prefix + inserted.length)]).toEqual(b);
  }

  const NO_AGENTS = `# Team & roles
team:
  members:
    - name: roberto           # [SPEC] a member
      email: r@example.it
      roles: [ approver ]
  roles:
    - name: approver
    - name: developer
  # a trailing comment that introduces the next section

# Resource paths
paths:
  sources: [ src/ ]
`;
  const AGENTS_SCHEMA = z.object({
    team: z.object({
      members: z.array(z.object({ name: z.string(), email: z.string(), roles: z.array(z.string()) })),
      roles: z.array(z.object({ name: z.string() })),
      agents: z.array(z.object({ name: z.string(), executes_as: z.array(z.string()) })).optional(),
    }),
    paths: z.object({ sources: z.array(z.string()) }),
  });

  it('bug-126: the first `dna add team.agents` opens `agents:` under `team`, adding lines and touching none', () => {
    const result = edited(NO_AGENTS, { verb: 'add', field: 'team.agents', value: 'claude', fields: { executes_as: 'developer' } }, AGENTS_SCHEMA);
    expect(comments(result)).toEqual(comments(NO_AGENTS));
    expectPureInsertion(NO_AGENTS, result, ['  agents:', '    - name: claude', '      executes_as: [developer]']);
    expect(result).toContain('    - name: developer\n  agents:\n');
  });

  it('bug-126: a list of strings the file does not declare yet is opened the same way', () => {
    const text = 'stacks:\n  # the technologies\n  technologies: []\npaths: {}\n';
    const schema = z.object({ stacks: z.object({ technologies: z.array(z.string()), methodologies: z.array(z.string()).optional() }), paths: z.object({}).passthrough() });
    const result = edited(text, { verb: 'add', field: 'stacks.methodologies', value: 'TDD' }, schema);
    expect(result).toBe('stacks:\n  # the technologies\n  technologies: []\n  methodologies:\n    - TDD\npaths: {}\n');
  });

  // The inline comment keeps its column, as on every rewritten key line (`rewriteKeyLine`).
  it('a key whose parent is an empty flow mapping `{}` opens that mapping into a block', () => {
    const text = '# header\nversion: 1\nmodules: []\nstacks: {}\nteam:\n  members: []\n  roles: []\npaths: {}   # the paths\n';
    const result = edited(text, { verb: 'add', field: 'paths.sources', value: 'src/' });
    expect(result).toBe('# header\nversion: 1\nmodules: []\nstacks: {}\nteam:\n  members: []\n  roles: []\npaths:      # the paths\n  sources:\n    - src/\n');
  });

  it('a scalar whose PARENT is absent too is inserted with its parent, by every write shape (a batch included)', () => {
    const text = '# top\nname: x\n';
    const result = applyDnaEditInText(
      text,
      { kind: 'batch', edits: [{ kind: 'set-scalar', path: [{ key: 'project' }, { key: 'license' }], value: 'MIT' }] },
      { name: 'x', project: { license: 'MIT' } },
    );
    expect(result).toBe('# top\nname: x\nproject:\n  license: MIT\n');
  });

  it('bug-019: a key holding a folded block scalar is rewritten on one line, its old value\'s lines dropped', () => {
    const text = '# top\nproject:\n  north_star: >-   # [SPEC] P1\n    a long\n    folded text\n\n  # next field\n  name: wf\n';
    const result = applyDnaEditInText(
      text,
      { kind: 'set-scalar', path: [{ key: 'project' }, { key: 'north_star' }], value: 'short' },
      { project: { north_star: 'short', name: 'wf' } },
    );
    expect(result).toBe('# top\nproject:\n  north_star: short # [SPEC] P1\n\n  # next field\n  name: wf\n');
  });

  it('bug-019: a literal block scalar `|` likewise', () => {
    const text = 'note: |\n  line one\n  line two\nother: x\n';
    expect(applyDnaEditInText(text, { kind: 'set-scalar', path: [{ key: 'note' }], value: 'plain' }, { note: 'plain', other: 'x' })).toBe(
      'note: plain\nother: x\n',
    );
  });

  it("bug-019: a CRLF file is edited in place and keeps its CRLF line endings", () => {
    const text = '# top\r\nproject:\r\n  name: a   # the name\r\n';
    const result = applyDnaEditInText(text, { kind: 'set-scalar', path: [{ key: 'project' }, { key: 'name' }], value: 'b' }, { project: { name: 'b' } });
    expect(result).toBe('# top\r\nproject:\r\n  name: b   # the name\r\n');
  });

  it('(characterization) bug-019: a leading `---` document marker does not stop an in-place edit', () => {
    const text = '---\n# top\nproject:\n  name: a\n';
    expect(applyDnaEditInText(text, { kind: 'set-scalar', path: [{ key: 'project' }, { key: 'name' }], value: 'b' }, { project: { name: 'b' } })).toBe(
      '---\n# top\nproject:\n  name: b\n',
    );
  });

  it("bug-019: WingFoil's own dna.yaml takes `dna update project.north_star` and `project.description` in place", () => {
    const own = readFileSync(join(__dirname, '..', '..', '.wingfoil', 'dna.yaml'), 'utf-8');
    for (const field of ['project.north_star', 'project.description']) {
      const result = edited(own, { verb: 'update', field, value: 'short' });
      expect(comments(result)).toEqual(comments(own));
    }
  });
});
