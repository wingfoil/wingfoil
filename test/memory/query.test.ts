/**
 * `memory` query primitives (task-008-dna-memory-query-latency, REQ-PERF-02). These are the
 * performance-bearing foundation `wingfoil memory search` (task-021, P1.5) will build its CLI/MCP
 * surface on top of: a deterministic, git-tracked-tree scan derived from `memory.yaml`'s per-type
 * `path` patterns (spec-011-storage-layout), plus keyword/frontmatter relevance filtering
 * (spec-012-context-loader-relevance-filtering's discipline — no full-text/semantic index).
 */
import { existsSync } from 'fs';
import { join } from 'path';

import {
  computeMemoryContentRoots,
  findMemoryDocumentById,
  listMemoryDocumentPaths,
  listMemoryDocumentsByType,
  loadMemoryDocumentSummary,
  searchMemoryDocuments,
  validateSearchQuery,
} from '../../src/memory/query';
import type { MemoryYaml } from '../../src/memory/schema';
import { EXIT_INTEGRITY, ValidationError } from '../../src/validation';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML: MemoryYaml = {
  version: 1.1,
  types: {
    'release-line': { path: 'docs/04_memory/planning/{id}.md' },
    release: { path: 'docs/04_memory/planning/{release-line}/{id}.md' },
    task: { path: 'docs/04_memory/{release}/{id}.md' },
    adr: { path: 'docs/04_memory/design/adrs/{id}.md' },
    'decision-log': { path: 'docs/04_memory/design/dls/{id}.md' },
    'tech-spec': { path: 'docs/04_memory/design/specs/{id}.md' },
    bug: { path: 'docs/04_memory/bugs/{id}.md' },
  },
};

describe('computeMemoryContentRoots — derived from memory.yaml path patterns (spec-011)', () => {
  it('collapses to a single "docs/04_memory" root for the real 7-type registry (task\'s pattern is the broadest)', () => {
    expect(computeMemoryContentRoots(MEMORY_YAML)).toEqual(['docs/04_memory']);
  });

  it('does not include a root nested under another already-included root', () => {
    const yaml: MemoryYaml = {
      version: 1.1,
      types: {
        adr: { path: 'docs/04_memory/design/adrs/{id}.md' },
        bug: { path: 'docs/04_memory/bugs/{id}.md' },
      },
    };
    // Neither pattern's static dir is a prefix of the other's, so both survive.
    expect(computeMemoryContentRoots(yaml).sort()).toEqual(['docs/04_memory/bugs', 'docs/04_memory/design/adrs']);
  });

  it('is empty for a registry with no types', () => {
    expect(computeMemoryContentRoots({ version: 1.1, types: {} })).toEqual([]);
  });

  it('handles a placeholder-free path pattern (no `{...}` token at all)', () => {
    const yaml: MemoryYaml = { version: 1.1, types: { singleton: { path: 'docs/04_memory/singleton.md' } } };
    expect(computeMemoryContentRoots(yaml)).toEqual(['docs/04_memory']);
  });

  it('drops a type whose pattern has no directory portion at all (a bare `{id}.md`-style pattern)', () => {
    const yaml: MemoryYaml = { version: 1.1, types: { root: { path: '{id}.md' } } };
    expect(computeMemoryContentRoots(yaml)).toEqual([]);
  });
});

function seedRepo(): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(
    repo,
    'docs/04_memory/v0.1/task-001-doc.md',
    [
      '---',
      'id: task-001-doc',
      'type: task',
      'title: "API design"',
      'tags: [ architecture ]',
      'status: draft',
      '---',
      '',
      'Body text with no special keyword.',
      '',
    ].join('\n'),
  );
  writeFixtureFile(
    repo,
    'docs/04_memory/v0.1/task-002-doc.md',
    [
      '---',
      'id: task-002-doc',
      'type: task',
      'title: "Unrelated task"',
      'tags: [ infra ]',
      'status: draft',
      '---',
      '',
      'This body mentions the api in passing, but only in the body.',
      '',
    ].join('\n'),
  );
  writeFixtureFile(
    repo,
    'docs/04_memory/design/adrs/adr-001-doc.md',
    ['---', 'id: adr-001-doc', 'type: adr', 'title: "Storage layout"', 'tags: [ storage ]', 'status: draft', '---', '', 'Nothing relevant here.', ''].join(
      '\n',
    ),
  );
  return repo;
}

describe('listMemoryDocumentPaths — sorted, deterministic scan over the derived content roots', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('finds every .md document under the derived roots, sorted lexicographically', () => {
    repo = seedRepo();
    expect(listMemoryDocumentPaths(repo, MEMORY_YAML)).toEqual([
      'docs/04_memory/design/adrs/adr-001-doc.md',
      'docs/04_memory/v0.1/task-001-doc.md',
      'docs/04_memory/v0.1/task-002-doc.md',
    ]);
  });

  it('is stable across repeated calls (no cache, no ordering drift)', () => {
    repo = seedRepo();
    const first = listMemoryDocumentPaths(repo, MEMORY_YAML);
    const second = listMemoryDocumentPaths(repo, MEMORY_YAML);
    expect(second).toEqual(first);
  });

  it('ignores non-.md files under a content root', () => {
    repo = seedRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/notes.txt', 'not a memory document');
    expect(listMemoryDocumentPaths(repo, MEMORY_YAML)).not.toContain('docs/04_memory/v0.1/notes.txt');
  });

  it('returns [] for a derived content root that does not exist on disk (no types registered yet)', () => {
    repo = makeTempGitRepo();
    expect(listMemoryDocumentPaths(repo, MEMORY_YAML)).toEqual([]);
  });
});

describe('loadMemoryDocumentSummary', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('parses frontmatter into a plain object and returns the body separately', () => {
    repo = seedRepo();
    const summary = loadMemoryDocumentSummary(repo, 'docs/04_memory/v0.1/task-001-doc.md');
    expect(summary.frontmatter.id).toBe('task-001-doc');
    expect(summary.frontmatter.title).toBe('API design');
    expect(summary.frontmatter.tags).toEqual(['architecture']);
    expect(summary.body).toContain('Body text with no special keyword.');
  });

  it('degrades to an empty frontmatter object (never throws) when the frontmatter block does not parse to an object', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/scalar.md', '---\njust a scalar string, not a mapping\n---\nBody\n');
    const summary = loadMemoryDocumentSummary(repo, 'docs/04_memory/v0.1/scalar.md');
    expect(summary.frontmatter).toEqual({});
    expect(summary.body).toBe('Body\n');
  });

  it('degrades to an empty frontmatter object for a document with no frontmatter block at all', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/no-frontmatter.md', '# Just a heading\n');
    const summary = loadMemoryDocumentSummary(repo, 'docs/04_memory/v0.1/no-frontmatter.md');
    expect(summary.frontmatter).toEqual({});
    expect(summary.body).toBe('# Just a heading\n');
  });
});

describe('searchMemoryDocuments — deterministic keyword/frontmatter relevance (spec-012 discipline)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('finds a document by a title keyword, case-insensitively', () => {
    repo = seedRepo();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, 'API');
    const paths = matches.map((m) => m.path);
    expect(paths).toContain('docs/04_memory/v0.1/task-001-doc.md');
  });

  it('ranks a metadata (title/tag/id) match above a body-only match', () => {
    repo = seedRepo();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, 'api');
    // task-001-doc matches on title ("API design") -> metadata match; task-002-doc only matches in body.
    const byPath = new Map(matches.map((m) => [m.path, m]));
    expect(byPath.get('docs/04_memory/v0.1/task-001-doc.md')?.metadataMatch).toBe(true);
    expect(byPath.get('docs/04_memory/v0.1/task-002-doc.md')?.bodyMatch).toBe(true);
    expect(matches[0]?.path).toBe('docs/04_memory/v0.1/task-001-doc.md');
  });

  it('filters by tag when `tag` option is given', () => {
    repo = seedRepo();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, '', { tag: 'architecture' });
    expect(matches.map((m) => m.path)).toEqual(['docs/04_memory/v0.1/task-001-doc.md']);
  });

  it('returns zero results (not an error) for a keyword nothing matches', () => {
    repo = seedRepo();
    expect(searchMemoryDocuments(repo, MEMORY_YAML, 'nonexistentkeyword')).toEqual([]);
  });

  it('is deterministic — repeated calls over unchanged state produce the exact same ordered result', () => {
    repo = seedRepo();
    const first = searchMemoryDocuments(repo, MEMORY_YAML, 'a');
    const second = searchMemoryDocuments(repo, MEMORY_YAML, 'a');
    expect(second).toEqual(first);
  });

  it('matches on `id` (not just title/tags), and combines a keyword with a `tag` filter', () => {
    repo = seedRepo();
    writeFixtureFile(
      repo,
      'docs/04_memory/v0.1/uniquetoken-doc.md',
      ['---', 'id: uniquetoken-doc', 'type: task', 'title: "Untitled"', 'tags: [ infra ]', 'status: draft', '---', '', 'body', ''].join('\n'),
    );
    const byId = searchMemoryDocuments(repo, MEMORY_YAML, 'uniquetoken');
    expect(byId.map((m) => m.path)).toEqual(['docs/04_memory/v0.1/uniquetoken-doc.md']);

    // Combining a keyword with a tag filter that excludes the only match -> zero results.
    expect(searchMemoryDocuments(repo, MEMORY_YAML, 'uniquetoken', { tag: 'architecture' })).toEqual([]);
    expect(searchMemoryDocuments(repo, MEMORY_YAML, 'uniquetoken', { tag: 'infra' })).toHaveLength(1);
  });

  // task-171 (bug-164): a document with no `id` is not an element, so it is no longer a match at all.
  // This case used to pin the path tie-break such a document needed.
  it('(amended by task-171, bug-164) leaves out documents with no `id` frontmatter field', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/no-id-b.md', '---\ntype: task\ntitle: "shared"\n---\nshared\n');
    writeFixtureFile(repo, 'docs/04_memory/v0.1/no-id-a.md', '---\ntype: task\ntitle: "shared"\n---\nshared\n');
    expect(searchMemoryDocuments(repo, MEMORY_YAML, 'shared')).toEqual([]);
  });

  // task-021-implement-memory-search (P1.5): `type` is a spec-010-memory-frontmatter-schema base
  // field, projected onto `MemorySearchMatch` (alongside the pre-existing `status`) so `memorySearch`'s
  // `--type` filter can narrow the already-ranked result without a second file read per match.
  it('projects the document\'s frontmatter `type` onto the match (task-021\'s `--type` filter reads it)', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(
      repo,
      'docs/04_memory/v0.1/typed-doc.md',
      ['---', 'id: typed-doc', 'type: task', 'title: "API design"', 'status: draft', '---', '', 'body', ''].join('\n'),
    );
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, 'API');
    expect(matches.map((m) => m.type)).toEqual(['task']);
  });

  // task-171 (bug-164): a document with no `type` is not an element; it used to come back with
  // `type` undefined, which no consumer could place.
  it('(amended by task-171, bug-164) leaves out a document with no `type` frontmatter field', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/04_memory/v0.1/untyped.md', ['---', 'id: untyped', 'title: "API design"', '---', '', 'body', ''].join('\n'));
    expect(searchMemoryDocuments(repo, MEMORY_YAML, 'API')).toEqual([]);
  });
});

describe('REQ-STATE-06 — archived documents excluded from default search (task-038; set widened by dl-028)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  function seedRepoWithDeprecated(): string {
    const seeded = seedRepo();
    writeFixtureFile(
      seeded,
      'docs/04_memory/v0.1/task-003-deprecated-doc.md',
      [
        '---',
        'id: task-003-deprecated-doc',
        'type: task',
        'title: "API deprecated doc"',
        'tags: [ architecture ]',
        'status: deprecated',
        '---',
        '',
        'Deprecated body that also mentions the api keyword.',
        '',
      ].join('\n'),
    );
    return seeded;
  }

  it('AC1 (red-first) — a deprecated document is excluded from a default keyword search that would otherwise match it', () => {
    repo = seedRepoWithDeprecated();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, 'api');
    expect(matches.map((m) => m.path)).not.toContain('docs/04_memory/v0.1/task-003-deprecated-doc.md');
    // Non-deprecated matches are unaffected.
    expect(matches.map((m) => m.path)).toContain('docs/04_memory/v0.1/task-001-doc.md');
  });

  it('AC1 (red-first) — a deprecated document is excluded from a default no-keyword tag browse', () => {
    repo = seedRepoWithDeprecated();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, '', { tag: 'architecture' });
    expect(matches.map((m) => m.path)).not.toContain('docs/04_memory/v0.1/task-003-deprecated-doc.md');
    expect(matches.map((m) => m.path)).toContain('docs/04_memory/v0.1/task-001-doc.md');
  });

  it('AC1 (red-first) — `includeArchived: true` is an explicit opt-in that still finds it', () => {
    repo = seedRepoWithDeprecated();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, 'api', { includeArchived: true });
    expect(matches.map((m) => m.path)).toContain('docs/04_memory/v0.1/task-003-deprecated-doc.md');
  });

  it('AC1 — a non-deprecated document (e.g. `status: draft`) is never affected by the exclusion', () => {
    repo = seedRepoWithDeprecated();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, '');
    expect(matches.map((m) => m.path)).toContain('docs/04_memory/v0.1/task-001-doc.md');
    expect(matches.map((m) => m.path)).toContain('docs/04_memory/v0.1/task-002-doc.md');
  });

  it('AC2 (characterization) — an explicit id lookup still resolves a deprecated document', () => {
    repo = seedRepoWithDeprecated();
    const doc = findMemoryDocumentById(repo, MEMORY_YAML, 'task-003-deprecated-doc');
    expect(doc?.frontmatter.status).toBe('deprecated');
  });

  // Amended deliberately by task-171 (`dl-038` option 1). task-038 pinned this primitive as NOT the
  // policy layer, so a browse included a deprecated document. The primitive now fails closed: a
  // consumer that forgets to filter no longer reaches archived content, and one that must see it says
  // so with `includeArchived: true`.
  it('AC2 (amended by task-171, dl-038) — `listMemoryDocumentsByType` excludes a deprecated document unless `includeArchived: true`', () => {
    repo = seedRepoWithDeprecated();
    expect(listMemoryDocumentsByType(repo, MEMORY_YAML, 'task').map((t) => t.id)).not.toContain('task-003-deprecated-doc');
    const tasks = listMemoryDocumentsByType(repo, MEMORY_YAML, 'task', { includeArchived: true });
    expect(tasks.map((t) => t.id)).toContain('task-003-deprecated-doc');
  });

  it('AC2 (characterization) — the deprecated document remains present on disk, never deleted', () => {
    repo = seedRepoWithDeprecated();
    expect(existsSync(join(repo, 'docs/04_memory/v0.1/task-003-deprecated-doc.md'))).toBe(true);
  });

  // `isArchivedStatus` — the single shared predicate this scan now consumes (dl-028, superseding
  // task-038's `isDeprecatedStatus`) — is unit-tested at its home in `test/memory/state-machine.test.ts`.
  // What belongs here is the SEARCH-PATH behaviour that predicate drives.

  describe('dl-028 — the archived set is {deprecated, superseded}, and `draft` is NOT in it', () => {
    function seedRepoWithArchived(): string {
      // Builds on the deprecated fixture so one repo carries BOTH archived statuses at once.
      const seeded = seedRepoWithDeprecated();
      writeFixtureFile(
        seeded,
        'docs/04_memory/design/adrs/adr-002-superseded.md',
        [
          '---',
          'id: adr-002-superseded',
          'type: adr',
          'title: "API superseded decision"',
          'tags: [ architecture ]',
          'status: superseded',
          '---',
          '',
          'A superseded decision body that also mentions the api keyword.',
          '',
        ].join('\n'),
      );
      writeFixtureFile(
        seeded,
        'docs/04_memory/design/adrs/adr-003-accepted.md',
        [
          '---',
          'id: adr-003-accepted',
          'type: adr',
          'title: "API accepted decision"',
          'tags: [ architecture ]',
          'status: accepted',
          '---',
          '',
          'An accepted decision body that also mentions the api keyword.',
          '',
        ].join('\n'),
      );
      return seeded;
    }

    it('(red-first) a `superseded` document is excluded from a default keyword search', () => {
      repo = seedRepoWithArchived();
      const ids = searchMemoryDocuments(repo, MEMORY_YAML, 'api').map((m) => m.id);
      expect(ids).not.toContain('adr-002-superseded');
      expect(ids).toContain('adr-003-accepted');
    });

    it('(red-first) a `superseded` document is excluded from a default tag browse', () => {
      repo = seedRepoWithArchived();
      const ids = searchMemoryDocuments(repo, MEMORY_YAML, '', { tag: 'architecture' }).map((m) => m.id);
      expect(ids).not.toContain('adr-002-superseded');
      expect(ids).toContain('adr-003-accepted');
    });

    it('(red-first) `includeArchived: true` opts back into BOTH archived statuses at once', () => {
      repo = seedRepoWithArchived();
      const ids = searchMemoryDocuments(repo, MEMORY_YAML, 'api', { includeArchived: true }).map((m) => m.id);
      expect(ids).toContain('adr-002-superseded');
      expect(ids).toContain('task-003-deprecated-doc');
    });

    it('a `draft` document IS still returned by a default search — the search set and the context set differ on purpose', () => {
      // Deliberate asymmetry (task-038's Execution Notes, restated by dl-028): REQ-STATE-06 excludes
      // ARCHIVED content from default search; spec-012 §6 additionally excludes `draft` from an
      // assembled agent CONTEXT ("only stable, decided and still-current content"). Collapsing the
      // two sets would hide in-progress drafts from `memory search`, which nothing asks for.
      // Mirror assertion: `test/core/relevance.test.ts`'s dl-028 block.
      repo = seedRepoWithArchived();
      const drafts = searchMemoryDocuments(repo, MEMORY_YAML, '').filter((m) => m.status === 'draft');
      expect(drafts.length).toBeGreaterThan(0);
    });

    it('a document whose `status` is not a string is never treated as archived', () => {
      repo = seedRepo();
      writeFixtureFile(
        repo,
        'docs/04_memory/v0.1/task-004-numeric-status.md',
        ['---', 'id: task-004-numeric-status', 'type: task', 'title: "API numeric status"', 'status: 42', '---', '', 'api body', ''].join('\n'),
      );
      const ids = searchMemoryDocuments(repo, MEMORY_YAML, 'api').map((m) => m.id);
      expect(ids).toContain('task-004-numeric-status');
    });
  });
});

describe('P1.12 acceptance criteria — keyword match/rank + empty-query validation', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  function seedCachingRepo(): string {
    const r = makeTempGitRepo();
    // Doc "A" (BDD Background): body mentions "caching", no tag/title match.
    writeFixtureFile(
      r,
      'docs/04_memory/v0.1/doc-a-body-only.md',
      ['---', 'id: doc-a-body-only', 'type: task', 'title: "Untitled"', 'status: draft', '---', '', 'This document discusses a caching strategy in depth.', ''].join(
        '\n',
      ),
    );
    // Doc "B" (BDD Background): tagged "caching", body has no mention of the term.
    writeFixtureFile(
      r,
      'docs/04_memory/v0.1/doc-b-tag-match.md',
      ['---', 'id: doc-b-tag-match', 'type: task', 'title: "Untitled"', 'tags: [ caching ]', 'status: draft', '---', '', 'No mention of the keyword here.', ''].join(
        '\n',
      ),
    );
    return r;
  }

  it('AC(a) — "caching" returns both A (body match) and B (tag match), with B ranked before A (P1.12 Scenario 1)', () => {
    repo = seedCachingRepo();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, 'caching');
    const paths = matches.map((m) => m.path);
    expect(paths).toEqual(
      expect.arrayContaining(['docs/04_memory/v0.1/doc-a-body-only.md', 'docs/04_memory/v0.1/doc-b-tag-match.md']),
    );
    expect(paths.indexOf('docs/04_memory/v0.1/doc-b-tag-match.md')).toBeLessThan(
      paths.indexOf('docs/04_memory/v0.1/doc-a-body-only.md'),
    );
  });

  it('AC(b) — "CACHING" (upper-case) still returns both A and B (P1.12 Scenario 2, case-insensitive)', () => {
    repo = seedCachingRepo();
    const matches = searchMemoryDocuments(repo, MEMORY_YAML, 'CACHING');
    expect(matches.map((m) => m.path).sort()).toEqual([
      'docs/04_memory/v0.1/doc-a-body-only.md',
      'docs/04_memory/v0.1/doc-b-tag-match.md',
    ]);
  });

  it('AC(c) — an empty query is rejected: ValidationError, exit code 2, message "empty search query" (P1.12 Scenario 3)', () => {
    expect(() => validateSearchQuery('')).toThrow(ValidationError);
    expect(() => validateSearchQuery('')).toThrow('empty search query');
  });

  it('AC(c) — a whitespace-only query is rejected the same as a fully empty one', () => {
    expect(() => validateSearchQuery('   ')).toThrow('empty search query');
  });

  it('AC(c) — the thrown error carries EXIT_INTEGRITY (exit code 2), matching the BDD "exit code 2" wording', () => {
    try {
      validateSearchQuery('');
      throw new Error('expected validateSearchQuery to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).exitCode).toBe(EXIT_INTEGRITY);
    }
  });

  it('does NOT reject a non-empty query, even a single character', () => {
    expect(() => validateSearchQuery('a')).not.toThrow();
  });
});

describe('findMemoryDocumentById — thin id -> document lookup (task-009-mcp-resource-fetch-latency, REQ-PERF-04)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('returns the document whose frontmatter `id` matches exactly', () => {
    repo = seedRepo();
    const doc = findMemoryDocumentById(repo, MEMORY_YAML, 'task-002-doc');
    expect(doc?.path).toBe('docs/04_memory/v0.1/task-002-doc.md');
    expect(doc?.frontmatter.title).toBe('Unrelated task');
  });

  it('returns undefined (never throws) when no document has a matching `id`', () => {
    repo = seedRepo();
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'no-such-id')).toBeUndefined();
  });

  it('does not partial-match — a substring of an id is not a match', () => {
    repo = seedRepo();
    expect(findMemoryDocumentById(repo, MEMORY_YAML, 'task-002')).toBeUndefined();
  });
});
