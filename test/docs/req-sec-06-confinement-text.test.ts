/**
 * REQ-SEC-06 and the P1.11 confinement scenario quote what the code prints (task-258, bug-244).
 *
 * The requirement and the BDD step kept `.wingfoil/memory/` as the write boundary, with the message
 * "Memory entries must reside under .wingfoil/memory/", for a full release after `task-017` moved the
 * boundary to the project root and `task-172` extended it to the configuration writers — latent,
 * because nothing executes `.feature` files (bug-106) and nothing read the SARD. This pins both
 * documents to the refusals the code builds, **derived from the code rather than restated here**, so
 * a later rewording fails this suite instead of leaving the acceptance contract silently stale:
 *
 * - the Memory writers' refusal (`resolveConfinedMemoryPath`, `E_PATH_ESCAPES_ROOT`);
 * - the configuration and transition writers' refusal (`requireConfinedTarget`, the first check of
 *   `requireConfinedWriteTarget`), which `directive remove` prints too with `remove` as its action
 *   (`task-102`, `bug-044`) — a delete, so the symlinked-target clause is not asked of it;
 * - the symlinked-target refusal every writer shares (`symlinkTargetRefusal`).
 *
 * Each is rendered with placeholder spellings (`<path>`, `<real path>`, `<action>`) and cut at the
 * clause that names the boundary, which is the part REQ-SEC-06's fit criterion quotes.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { requireConfinedTarget } from '../../src/core/confinement';
import { symlinkTargetRefusal } from '../../src/storage/confinement';
import { StorageError } from '../../src/storage/errors';
import { resolveConfinedMemoryPath } from '../../src/storage/memory-path';

const repoRoot = join(__dirname, '..', '..');
const sardPath = join(repoRoot, 'docs', '02_requirements', '03_sard', '05_security-compliance.md');
const sardIndexPath = join(repoRoot, 'docs', '02_requirements', '03_sard', '00_index.md');
const featurePath = join(
  repoRoot,
  'docs',
  '02_requirements',
  '02_bdd',
  'features',
  'p1-memory',
  'P1.11-memory-entries.feature',
);

const BOUNDARY_CLAUSE = 'outside the project root';

/** `message` up to and including its first {@link BOUNDARY_CLAUSE}. */
function throughBoundaryClause(message: string): string {
  const at = message.indexOf(BOUNDARY_CLAUSE);
  if (at < 0) throw new Error(`no "${BOUNDARY_CLAUSE}" in: ${message}`);
  return message.slice(0, at + BOUNDARY_CLAUSE.length);
}

/** The text of the `### <id> — …` section of `markdown`, up to the next `### ` heading. */
function section(markdown: string, id: string): string {
  const start = markdown.indexOf(`### ${id} `);
  if (start < 0) throw new Error(`no section ${id}`);
  const next = markdown.indexOf('\n### ', start + 1);
  return markdown.slice(start, next < 0 ? undefined : next);
}

let sandbox: string;
let memoryRefusal: string;
let writerRefusal: string;
let removeRefusal: string;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'wf-req-sec-06-'));
  const root = join(sandbox, 'project');
  const outside = join(sandbox, 'outside');
  mkdirSync(root);
  mkdirSync(outside);

  // The Memory writers' refusal, through a textual traversal (`task-017`).
  try {
    resolveConfinedMemoryPath(root, '{id}.md', { id: '../escaped' });
    throw new Error('resolveConfinedMemoryPath accepted a path outside the root');
  } catch (error) {
    const storage = error as StorageError;
    expect(storage.code).toBe('E_PATH_ESCAPES_ROOT');
    memoryRefusal = throughBoundaryClause(
      storage.message
        .slice(`${storage.code}: `.length)
        .replace(`'../escaped.md'`, `'<path>'`)
        .replace(`'${resolve(root, '../escaped.md')}'`, `'<real path>'`),
    );
  }

  // The configuration and transition writers' refusal, through a symlinked directory (`task-172`).
  symlinkSync(outside, join(root, 'linked'), 'dir');
  const refused = requireConfinedTarget(root, 'linked/file.md', '<action>');
  if (refused.ok) throw new Error('requireConfinedTarget accepted a path through a link leaving the root');
  writerRefusal = throughBoundaryClause(
    refused.error.message
      .replace(`'linked/file.md'`, `'<path>'`)
      .replace(/it resolves to '[^']*'/, `it resolves to '<real path>'`),
  );

  // `directive remove`'s refusal: the same guard, asked with the `remove` action (src/core/index.ts).
  const removed = requireConfinedTarget(root, 'linked/file.md', 'remove');
  if (removed.ok) throw new Error('requireConfinedTarget accepted a removal through a link leaving the root');
  removeRefusal = throughBoundaryClause(
    removed.error.message
      .replace(`'linked/file.md'`, `'<path>'`)
      .replace(/it resolves to '[^']*'/, `it resolves to '<real path>'`),
  );
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('REQ-SEC-06 states the project-root boundary with the messages the code prints (bug-244)', () => {
  const requirement = (): string => section(readFileSync(sardPath, 'utf8'), 'REQ-SEC-06');

  it('derives the refusals it checks from the code', () => {
    expect(memoryRefusal).toBe(
      "Memory entries must reside within the project root: '<path>' resolves to '<real path>', outside the project root",
    );
    expect(writerRefusal).toBe("cannot <action> '<path>': it resolves to '<real path>', outside the project root");
  });

  it("quotes the Memory writers' refusal", () => {
    expect(requirement()).toContain(memoryRefusal);
  });

  it("quotes the configuration and transition writers' refusal", () => {
    expect(requirement()).toContain(writerRefusal);
  });

  it('covers directive remove with the same refusal and remove as its action, without the symlink clause', () => {
    expect(removeRefusal).toBe(writerRefusal.replace('<action>', 'remove'));
    expect(requirement()).toContain('`wingfoil directive remove`');
    expect(requirement()).toContain('`<action>` is `remove`');
    expect(requirement()).toContain('(not on `wingfoil directive remove`)');
    expect(requirement()).toContain('P3.3');
    expect(requirement()).toContain('`task-102`');
  });

  it('quotes the symlinked-target refusal', () => {
    const firstSentence = symlinkTargetRefusal('<action>', '<path>').split('. ')[0];
    expect(requirement()).toContain(`${firstSentence}.`);
  });

  it('no longer names .wingfoil/memory/ as the boundary', () => {
    expect(requirement()).not.toContain('.wingfoil/memory/');
    expect(readFileSync(sardPath, 'utf8')).not.toContain('must reside under');
  });

  it('traces to the tasks that set the boundary and its scope', () => {
    expect(requirement()).toContain('`task-017`');
    expect(requirement()).toContain('`task-172`');
  });

  it("summarises the boundary as the project root in the SARD index", () => {
    const row = readFileSync(sardIndexPath, 'utf8')
      .split('\n')
      .find((line) => line.startsWith('| REQ-SEC-06 '));
    expect(row).toBeDefined();
    expect(row).toContain('project root');
    expect(row).toContain('P3.3');
    expect(row).not.toContain('memory/');
  });
});

describe('P1.11 scenario 3 expects the message the code prints (bug-244)', () => {
  const feature = (): string => readFileSync(featurePath, 'utf8');

  it("quotes the Memory writers' refusal up to its first clause", () => {
    const quoted = feature()
      .split('\n')
      .map((line) => /returns message "([^"]*)"/.exec(line)?.[1])
      .filter((message): message is string => message !== undefined);
    expect(quoted).toEqual([memoryRefusal.split(':')[0]]);
  });

  it('no longer names .wingfoil/memory/ as the boundary in the refusal scenario', () => {
    expect(feature()).not.toContain('must reside under');
    expect(feature()).toMatch(/Scenario: Error - writing a Memory entry to a path outside the project root/);
  });
});
