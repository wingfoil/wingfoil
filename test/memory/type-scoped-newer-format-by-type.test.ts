/**
 * task-314 (`bug-283`), design gate D2 (a), the other direction of red's pin: a document in a newer
 * `format:` has a readable frontmatter, so a typed read decides it by its own `type:`, not by its path. A
 * `type: bug` document lying in the `adr` folder is reported to a bug read, and not to the adr read whose
 * `path` pattern produces its path. The layout is the flat one `wingfoil init --template Scrum` writes.
 */
import { loadMemoryYaml } from '../../src/core/loaders';
import {
  findMemoryDocumentByTypeAndId,
  findMemoryDocumentByTypeAndIdAtRev,
  listMemoryDocumentsByType,
  loadTypeDocumentCopiesAtRevs,
  searchMemoryDocuments,
} from '../../src/memory/query';
import type { Diagnostic } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `
version: 1
format: 1
types:
  adr:
    path: docs/memory/adr/{id}.md
  bug:
    path: docs/memory/bug/{id}.md
`;

const ODD_BUG = 'docs/memory/adr/bug-009-odd.md';

let root: string;

beforeAll(() => {
  root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, 'docs/memory/bug/bug-001-a-bug.md', ['---', 'id: bug-001-a-bug', 'type: bug', 'title: "a bug"', 'status: draft', 'format: 1', '---', '', 'Body.', ''].join('\n'));
  writeFixtureFile(root, ODD_BUG, ['---', 'id: bug-009-odd', 'type: bug', 'title: "odd"', 'status: draft', 'format: 99', '---', '', 'Odd.', ''].join('\n'));
  commitAll(root, 'seed task-314 newer-format-by-type fixture');
});
afterAll(() => removeTempDir(root));

function collector(): { readonly files: string[]; readonly onDiagnostic: (diagnostic: Diagnostic) => void } {
  const files: string[] = [];
  return { files, onDiagnostic: (diagnostic) => files.push(diagnostic.file) };
}

describe('a newer-format document is reported to the type its type: names, not to the type whose path holds it (D2 (a))', () => {
  it.each(['bug', 'adr'])('listMemoryDocumentsByType(%s)', (type) => {
    const seen = collector();
    listMemoryDocumentsByType(root, loadMemoryYaml(root), type, { onDiagnostic: seen.onDiagnostic });
    expect(seen.files).toEqual(type === 'bug' ? [ODD_BUG] : []);
  });

  it.each(['bug', 'adr'])('findMemoryDocumentByTypeAndId(%s, not found) and its at-HEAD sibling', (type) => {
    const now = collector();
    expect(findMemoryDocumentByTypeAndId(root, loadMemoryYaml(root), type, `${type}-404`, { onDiagnostic: now.onDiagnostic })).toBeUndefined();
    expect(now.files).toEqual(type === 'bug' ? [ODD_BUG] : []);
    const atHead = collector();
    expect(findMemoryDocumentByTypeAndIdAtRev(root, 'HEAD', loadMemoryYaml(root), type, `${type}-404`, { onDiagnostic: atHead.onDiagnostic })).toBeUndefined();
    expect(atHead.files).toEqual(type === 'bug' ? [ODD_BUG] : []);
  });

  it.each(['bug', 'adr'])('searchMemoryDocuments with type %s', (type) => {
    const seen = collector();
    searchMemoryDocuments(root, loadMemoryYaml(root), '', { type, onDiagnostic: seen.onDiagnostic });
    expect(seen.files).toEqual(type === 'bug' ? [ODD_BUG] : []);
  });

  it('loadTypeDocumentCopiesAtRevs lists only its own static directory, so the adr read alone sees the file and does not report it', () => {
    const toAdr = collector();
    loadTypeDocumentCopiesAtRevs(root, ['HEAD'], loadMemoryYaml(root), 'adr', { onDiagnostic: toAdr.onDiagnostic });
    expect(toAdr.files).toEqual([]);
  });
});
