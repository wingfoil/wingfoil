/**
 * task-314 (`bug-283`), the same class in `src/memory/query.ts`: `loadTypeDocumentCopiesAtRevs`, the read
 * of one type behind the WIP-limit count (`requireWipSlot`, `src/core/memory-transition.ts`), lists the
 * type's static directory, which `release` shares with `release-line` (`docs/04_memory/planning/`). It
 * reports an unreadable file only when the type's `path` pattern can produce its path, and a
 * newer-format document only when its `type:` is the type read, as every typed read does. The patterns
 * are this repository's own (`.wingfoil/memory.yaml`).
 */
import { symlinkSync } from 'fs';
import { join } from 'path';

import { loadMemoryYaml } from '../../src/core/loaders';
import { loadTypeDocumentCopiesAtRevs } from '../../src/memory/query';
import type { Diagnostic } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `
version: 1
types:
  release-line:
    path: "docs/04_memory/planning/{id}.md"
  release:
    path: "docs/04_memory/planning/rl-{release-line}/{id}.md"
`;

const BROKEN_LINE = 'docs/04_memory/planning/rl-v9-broken.md';
const FUTURE_LINE = 'docs/04_memory/planning/rl-v8-future.md';
const LINK_LINE = 'docs/04_memory/planning/rl-v7-link.md';
const BROKEN_RELEASE = 'docs/04_memory/planning/rl-v1/minor-v0.9-broken.md';
const FUTURE_RELEASE = 'docs/04_memory/planning/rl-v1/minor-v0.8-future.md';

function broken(id: string, type: string): string {
  return ['---', `id: ${id}`, `type: ${type}`, 'title: [unclosed', '---', '', 'Broken.', ''].join('\n');
}

function future(id: string, type: string): string {
  return ['---', `id: ${id}`, `type: ${type}`, `title: "${id}"`, 'status: draft', 'format: 99', '---', '', 'Future.', ''].join('\n');
}

let root: string;

beforeAll(() => {
  root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, 'docs/04_memory/planning/rl-v1/minor-v0.1.md', ['---', 'id: minor-v0.1', 'type: release', 'title: "v0.1"', 'status: planning', '---', '', 'Body.', ''].join('\n'));
  writeFixtureFile(root, BROKEN_LINE, broken('rl-v9-broken', 'release-line'));
  writeFixtureFile(root, FUTURE_LINE, future('rl-v8-future', 'release-line'));
  writeFixtureFile(root, BROKEN_RELEASE, broken('minor-v0.9-broken', 'release'));
  writeFixtureFile(root, FUTURE_RELEASE, future('minor-v0.8-future', 'release'));
  symlinkSync('rl-v9-broken.md', join(root, LINK_LINE));
  commitAll(root, 'seed task-314 type-document-copies fixture');
});
afterAll(() => removeTempDir(root));

function reportedFiles(type: string): { readonly ids: string[]; readonly files: string[] } {
  const files: string[] = [];
  const copies = loadTypeDocumentCopiesAtRevs(root, ['HEAD'], loadMemoryYaml(root), type, {
    onDiagnostic: (diagnostic: Diagnostic) => files.push(diagnostic.file),
  });
  return { ids: copies[0]!.map((copy) => String(copy.frontmatter.id)), files: [...files].sort() };
}

describe('loadTypeDocumentCopiesAtRevs reports only the files its type can hold (task-314, bug-283)', () => {
  it('a release read reports its own unparsable and newer-format files, none of the release-line ones in the shared directory', () => {
    const { ids, files } = reportedFiles('release');
    expect(ids).toEqual(['minor-v0.1']);
    expect(files).toEqual([FUTURE_RELEASE, BROKEN_RELEASE].sort());
  });

  it('a release-line read reports the release-line files, the link included, and none of the release ones', () => {
    const { ids, files } = reportedFiles('release-line');
    expect(ids).toEqual([]);
    expect(files).toEqual([BROKEN_LINE, FUTURE_LINE, LINK_LINE].sort());
  });
});
