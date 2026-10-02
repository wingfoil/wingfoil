/**
 * task-020-implement-memory-add — the pure/domain helpers behind `wingfoil memory add` (P1.3),
 * factored into `src/memory/add.ts` so the `CoreResult`-wrapped orchestration in `src/core` stays
 * thin (mirroring `dna set`'s split: pure `setDnaValue` in `src/dna`, the `CoreFn` in `src/core`).
 *
 * These functions are deterministic (REQ-SYS-07): a slug is a pure function of the title, the
 * document render a pure function of (scaffold, id, title, tags) — no wall-clock, no randomness. The
 * sequence counter has its own suite since task-128: `test/memory/add-sequence.test.ts`.
 */
import { hasNumericToken, parseTags, renderAddDocument, slugifyTitle, writtenFields } from '../../src/memory/add';

describe('slugifyTitle — deterministic, valid ID piece from a human title', () => {
  it('lowercases, collapses non-alphanumerics to single hyphens, and trims edges', () => {
    expect(slugifyTitle('Use PostgreSQL')).toBe('use-postgresql');
    expect(slugifyTitle('  Keep   It Simple!  ')).toBe('keep-it-simple');
    expect(slugifyTitle('CLI: exit-code contract (v2)')).toBe('cli-exit-code-contract-v2');
  });

  it('never emits leading/trailing/doubled hyphens (a valid single ID piece)', () => {
    expect(slugifyTitle('--Hello--World--')).toBe('hello-world');
    expect(slugifyTitle('a & b')).toBe('a-b');
  });

  // task-110 AC 1 — dl-107 S1 (a), spec-001 `{slug}` row: a `.` between two alphanumerics is kept,
  // so the slugifier and the id validator (`[a-z0-9.]+(?:-[a-z0-9.]+)*`) share one character rule.
  it('keeps a dot that sits between two alphanumerics (version-shaped titles)', () => {
    expect(slugifyTitle('v0.2')).toBe('v0.2');
    expect(slugifyTitle('Retrospective v0.2')).toBe('retrospective-v0.2');
    expect(slugifyTitle('WingFoil v0.2.3 — patch')).toBe('wingfoil-v0.2.3-patch');
    expect(slugifyTitle('Node.js 22.12+')).toBe('node.js-22.12');
  });

  it('collapses a dot that does not sit between two alphanumerics like any other separator', () => {
    expect(slugifyTitle('a . b')).toBe('a-b');
    expect(slugifyTitle('end.')).toBe('end');
    expect(slugifyTitle('.start')).toBe('start');
    expect(slugifyTitle('a..b')).toBe('a-b');
    expect(slugifyTitle('a.-b')).toBe('a-b');
    expect(slugifyTitle('x. y')).toBe('x-y');
  });
});

describe('parseTags — comma-separated CLI value to a trimmed string array', () => {
  it('splits on commas and trims each tag', () => {
    expect(parseTags('infra,db')).toEqual(['infra', 'db']);
    expect(parseTags(' a , b ,c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns undefined for an absent value and drops empty entries', () => {
    expect(parseTags(undefined)).toBeUndefined();
    expect(parseTags('')).toBeUndefined();
    expect(parseTags('a,,b,')).toEqual(['a', 'b']);
  });
});

describe('hasNumericToken — whether an id_pattern needs a sequence counter', () => {
  it('detects a {n}-family numeric token', () => {
    expect(hasNumericToken('task-{n}-{slug}')).toBe(true);
    expect(hasNumericToken('bug-{nnn}-{slug}')).toBe(true);
  });

  it('is false for slug-only / version-only patterns', () => {
    expect(hasNumericToken('note-{slug}')).toBe(false);
    expect(hasNumericToken('rl-{version}')).toBe(false);
  });
});

describe('renderAddDocument — fill only the frontmatter skeleton, copy the scaffold verbatim otherwise', () => {
  const SCAFFOLD = `---
id: ""
type: decision
title: ""
status: draft
tmpl_version: 260101
tags: []
---

<!-- decision body -->
`;

  it('sets id (plain), title (quoted), status: draft, and leaves tmpl_version/body untouched', () => {
    const out = renderAddDocument(SCAFFOLD, { id: 'decision-001-use-postgresql', title: 'Use PostgreSQL' });
    expect(out).toContain('id: decision-001-use-postgresql');
    expect(out).toContain('title: "Use PostgreSQL"');
    expect(out).toContain('status: draft');
    expect(out).toContain('type: decision'); // untouched
    expect(out).toContain('tmpl_version: 260101'); // untouched (spec-010)
    expect(out).toContain('<!-- decision body -->'); // body copied verbatim
    // A single id/title/status line each — no duplicates appended.
    expect(out.match(/^id:/gm)).toHaveLength(1);
    expect(out.match(/^title:/gm)).toHaveLength(1);
    expect(out.match(/^status:/gm)).toHaveLength(1);
  });

  it('writes tags as a compact YAML flow sequence when provided', () => {
    const out = renderAddDocument(SCAFFOLD, {
      id: 'decision-001-x',
      title: 'X',
      tags: ['infra', 'db'],
    });
    expect(out).toContain('tags: ["infra","db"]');
    expect(out.match(/^tags:/gm)).toHaveLength(1);
  });

  it('appends a field the scaffold lacks rather than losing it', () => {
    const scaffoldNoTags = `---\nid: ""\ntype: note\ntitle: ""\nstatus: draft\n---\n\nbody\n`;
    const out = renderAddDocument(scaffoldNoTags, { id: 'note-x', title: 'X', tags: ['a'] });
    expect(out).toContain('tags: ["a"]');
  });

  it('throws when the scaffold has no frontmatter block', () => {
    expect(() => renderAddDocument('no frontmatter here', { id: 'x', title: 'Y' })).toThrow();
  });
});

// task-163 (`bug-033`): `renderAddDocument` edits through `src/memory/frontmatter-edit.ts`'s shared
// setter — top-level keys only, each edited line's inline comment kept.
describe('renderAddDocument — top-level keys only, inline comments kept (task-163, bug-033)', () => {
  it('fills the top-level title, not a nested one above it, and keeps every comment', () => {
    const scaffold =
      '---\nid: "{auto}"   # auto-generated\nmeta:\n  title: nested-keep-me\ntitle: ""   # REQUIRED\nstatus: draft  # auto-set\n---\n\nbody\n';
    const out = renderAddDocument(scaffold, { id: 'task-001-x', title: 'X' });
    expect(out).toBe(
      '---\nid: task-001-x   # auto-generated\nmeta:\n  title: nested-keep-me\ntitle: "X"   # REQUIRED\nstatus: draft  # auto-set\n---\n\nbody\n',
    );
  });

  it('keeps the comment on tags and on a --set field', () => {
    const scaffold = '---\nid: ""\ntitle: ""\nstatus: draft\ntags: []   # optional\nkind: ""   # REQUIRED — minor | patch\n---\n';
    const out = renderAddDocument(scaffold, { id: 'r-x', title: 'X', tags: ['a'], fields: [['kind', 'patch']] });
    expect(out).toContain('tags: ["a"]   # optional\n');
    expect(out).toContain('kind: "patch"   # REQUIRED — minor | patch\n');
  });
});

describe('writtenFields — a context token is written only where the scaffold declares a TOP-LEVEL field (task-163)', () => {
  it('does not count a nested key of the same name as a declaration', () => {
    const scaffold = '---\nid: ""\nmeta:\n  scope: nested\nworkflow: ""\n---\n';
    expect(writtenFields(scaffold, { scope: 'a/b', workflow: 'dev-loop', kind: 'x' })).toEqual([
      ['kind', 'x'],
      ['workflow', 'dev-loop'],
    ]);
  });
});

describe('hasNumericToken — {n:N} (task-163, bug-176)', () => {
  it('detects {n:N} as a counter token', () => {
    expect(hasNumericToken('u-{n:1}')).toBe(true);
  });
});
