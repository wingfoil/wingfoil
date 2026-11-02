/**
 * task-314 (`bug-283`): the type-scoped Memory primitives report a file they cannot read only when the
 * type's `path` pattern can produce its path (`spec-017` §1.4's token rule), and a newer-format document
 * only when its readable `type:` is the type read (design gate D2 (a)); an undeclared type produces no
 * path, so it is told about no file (D3 (a)). Pinned at the primitives behind every typed reader the
 * design gate scoped (D1 (c)): `listMemoryDocumentsByType` (`wingfoil://memory/{type}`),
 * `findMemoryDocumentByTypeAndId` (`wingfoil://memory/{type}/{id}`) and
 * `findMemoryDocumentByTypeAndIdAtRev` (the at-commit lookup of `agent execute`'s `requireElement`).
 *
 * Two layouts, both real: this repository's `docs/04_memory/` patterns, and the flat
 * `docs/memory/<type>/{id}.md` layout `wingfoil init --template Scrum` writes, where `adr` sorts
 * before `bug`, so a bug lookup passes the adr files on its way to its match.
 */
import { symlinkSync } from 'fs';
import { join } from 'path';

import { loadMemoryYaml } from '../../src/core/loaders';
import {
  findMemoryDocumentByTypeAndId,
  findMemoryDocumentByTypeAndIdAtRev,
  listMemoryDocumentsByType,
} from '../../src/memory/query';
import type { Diagnostic } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

function broken(id: string, type: string): string {
  return ['---', `id: ${id}`, `type: ${type}`, 'title: [unclosed', '---', '', 'Broken.', ''].join('\n');
}

function collector(): { readonly files: string[]; readonly onDiagnostic: (diagnostic: Diagnostic) => void } {
  const files: string[] = [];
  return { files, onDiagnostic: (diagnostic) => files.push(diagnostic.file) };
}

// This repository's own `.wingfoil/memory.yaml` patterns for the five types the fixture uses.
const REPO_LAYOUT_YAML = `
version: 1
types:
  release-line:
    path: "docs/04_memory/planning/{id}.md"
  release:
    path: "docs/04_memory/planning/rl-{release-line}/{id}.md"
  task:
    path: "docs/04_memory/{release}/{id}.md"
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
  bug:
    path: "docs/04_memory/bugs/{id}.md"
`;

const REPO_BROKEN_BUG = 'docs/04_memory/bugs/bug-002-broken.md';

describe('listMemoryDocumentsByType over this repository layout (task-314 AC1)', () => {
  let root: string;

  beforeAll(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/memory.yaml', REPO_LAYOUT_YAML);
    writeFixtureFile(root, 'docs/04_memory/bugs/bug-001-valid.md', ['---', 'id: bug-001-valid', 'type: bug', 'title: "bug-001-valid"', 'status: open', '---', '', 'Body.', ''].join('\n'));
    writeFixtureFile(root, REPO_BROKEN_BUG, broken('bug-002-broken', 'bug'));
    writeFixtureFile(root, 'docs/04_memory/design/adrs/adr-001-broken.md', broken('adr-001-broken', 'adr'));
    writeFixtureFile(root, 'docs/04_memory/design/adrs/adr-002-future.md', ['---', 'id: adr-002-future', 'type: adr', 'title: "adr-002-future"', 'status: accepted', 'format: 99', '---', '', 'Future.', ''].join('\n'));
    writeFixtureFile(root, 'docs/04_memory/planning/rl-v9-broken.md', broken('rl-v9-broken', 'release-line'));
    commitAll(root, 'seed task-314 repository-layout fixture');
  });
  afterAll(() => removeTempDir(root));

  it('(red-first) a bug listing reports only the unreadable file on a bug path', () => {
    const seen = collector();
    const listed = listMemoryDocumentsByType(root, loadMemoryYaml(root), 'bug', { onDiagnostic: seen.onDiagnostic });
    expect(listed.map((doc) => doc.id)).toEqual(['bug-001-valid']);
    expect(seen.files).toEqual([REPO_BROKEN_BUG]);
  });

  it('(red-first) an undeclared type reports no file (design gate D3 (a))', () => {
    const seen = collector();
    expect(listMemoryDocumentsByType(root, loadMemoryYaml(root), 'nosuch', { onDiagnostic: seen.onDiagnostic })).toEqual([]);
    expect(seen.files).toEqual([]);
  });
});

// The flat layout `wingfoil init --template Scrum` writes (its `adr` and `bug` entries, verbatim paths).
const SCRUM_LAYOUT_YAML = `
version: 1
format: 1
types:
  adr:
    path: docs/memory/adr/{id}.md
  bug:
    path: docs/memory/bug/{id}.md
`;

const SCRUM_BROKEN_ADR = 'docs/memory/adr/adr-001-x.md';
const SCRUM_FUTURE_ADR = 'docs/memory/adr/adr-002-future.md';
const SCRUM_LINK_ADR = 'docs/memory/adr/adr-003-link.md';
const SCRUM_ADR_FILES = [SCRUM_BROKEN_ADR, SCRUM_FUTURE_ADR, SCRUM_LINK_ADR];

describe('the type-scoped lookups over the Scrum layout, where adr sorts before bug (task-314 AC1, design gate D1 (c))', () => {
  let root: string;

  beforeAll(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/memory.yaml', SCRUM_LAYOUT_YAML);
    writeFixtureFile(root, 'docs/memory/bug/bug-001-a-bug.md', ['---', 'id: bug-001-a-bug', 'type: bug', 'title: "a bug"', 'status: draft', 'format: 1', '---', '', 'Body.', ''].join('\n'));
    writeFixtureFile(root, SCRUM_BROKEN_ADR, broken('adr-001-x', 'adr'));
    writeFixtureFile(root, SCRUM_FUTURE_ADR, ['---', 'id: adr-002-future', 'type: adr', 'title: "future"', 'status: draft', 'format: 99', '---', '', 'Future.', ''].join('\n'));
    symlinkSync('adr-001-x.md', join(root, SCRUM_LINK_ADR));
    commitAll(root, 'seed task-314 Scrum-layout fixture');
  });
  afterAll(() => removeTempDir(root));

  it('(red-first) findMemoryDocumentByTypeAndId resolves the bug and reports none of the adr files it passed', () => {
    const seen = collector();
    const found = findMemoryDocumentByTypeAndId(root, loadMemoryYaml(root), 'bug', 'bug-001-a-bug', { onDiagnostic: seen.onDiagnostic });
    expect(found?.path).toBe('docs/memory/bug/bug-001-a-bug.md');
    expect(seen.files).toEqual([]);
  });

  it('(red-first) findMemoryDocumentByTypeAndIdAtRev at HEAD resolves the bug and reports none of the adr files it passed', () => {
    const seen = collector();
    const found = findMemoryDocumentByTypeAndIdAtRev(root, 'HEAD', loadMemoryYaml(root), 'bug', 'bug-001-a-bug', { onDiagnostic: seen.onDiagnostic });
    expect(found?.path).toBe('docs/memory/bug/bug-001-a-bug.md');
    expect(seen.files).toEqual([]);
  });

  it('(characterization) an adr lookup that finds nothing reports every unreadable adr file, the link included, in path order', () => {
    const seen = collector();
    expect(findMemoryDocumentByTypeAndId(root, loadMemoryYaml(root), 'adr', 'adr-404', { onDiagnostic: seen.onDiagnostic })).toBeUndefined();
    expect(seen.files).toEqual(SCRUM_ADR_FILES);
  });

  it('(characterization) the same adr lookup at HEAD reports every unreadable adr file, the link included', () => {
    const seen = collector();
    expect(findMemoryDocumentByTypeAndIdAtRev(root, 'HEAD', loadMemoryYaml(root), 'adr', 'adr-404', { onDiagnostic: seen.onDiagnostic })).toBeUndefined();
    expect(seen.files).toEqual(SCRUM_ADR_FILES);
  });

  it('(red-first) the symbolic link on an adr path is reported to an adr listing, not to a bug listing', () => {
    const toAdr = collector();
    listMemoryDocumentsByType(root, loadMemoryYaml(root), 'adr', { onDiagnostic: toAdr.onDiagnostic });
    expect(toAdr.files).toContain(SCRUM_LINK_ADR);
    const toBug = collector();
    listMemoryDocumentsByType(root, loadMemoryYaml(root), 'bug', { onDiagnostic: toBug.onDiagnostic });
    expect(toBug.files).toEqual([]);
  });
});
