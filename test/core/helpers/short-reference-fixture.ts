/**
 * task-332 — the fixtures of the short-element-reference suites (`test/memory/reference.test.ts`,
 * `test/core/memory-short-reference.test.ts`, `test/core/element-short-reference.test.ts`).
 *
 * - {@link KANBAN_MEMORY_YAML} is the `memory.yaml` a real `wingfoil init --template kanban` writes (copied byte
 *   for byte to `../fixtures/kanban-memory.yaml`, from the code build of this worktree), with the one change
 *   `test/cli/dry-run.integration.test.ts` also makes: the scaffolded `bug` machine example is uncommented, so
 *   `bug` has a `returns` edge for `memory park` (`in-progress → open`).
 * - {@link REPO_RELEASE_MEMORY_YAML} is this repository's `release` type (`.wingfoil/memory.yaml`: its
 *   `id_pattern` `{kind}-{version}` and its machine), with a flat path: the id family has no `{n}` token, so only
 *   the exact and prefix rules can name a release.
 * - {@link kanbanDocument} writes a document with the frontmatter `memory add` scaffolds (`id`, `type`, `title`,
 *   `status`) and a body with no placeholder comment, at the path the kanban `memory.yaml` gives its type.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MemoryYaml } from '../../../src/memory';
import type { MemoryDocumentSummary } from '../../../src/memory';
import { parseYaml } from '../../../src/validation';
import { commitAll, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';

const SCAFFOLDED_BUG_MACHINE = [
  '    # states:',
  '    #   sequence: [ draft, open, in-progress, resolved, closed ]',
  '    #   gates:',
  '    #     open: { reject: closed }',
  '    #     resolved: { reject: in-progress }',
  '    #   returns: { in-progress: open }    # memory park: back to open, with a reason',
  '    #   limits: { in-progress: 3 }        # at most 3 bugs in progress at once',
].join('\n');

const UNCOMMENTED_BUG_MACHINE = [
  '    states:',
  '      sequence: [ draft, open, in-progress, resolved, closed ]',
  '      gates:',
  '        open: { reject: closed }',
  '        resolved: { reject: in-progress }',
  '      returns: { in-progress: open }',
].join('\n');

const KANBAN_SCAFFOLD = readFileSync(join(__dirname, '..', 'fixtures', 'kanban-memory.yaml'), 'utf-8');
if (!KANBAN_SCAFFOLD.includes(SCAFFOLDED_BUG_MACHINE)) throw new Error('fixture bug: the scaffolded bug machine example moved');

/** The kanban scaffold's `memory.yaml`, `bug` given the `returns` edge `memory park` needs. */
export const KANBAN_MEMORY_YAML = KANBAN_SCAFFOLD.replace(SCAFFOLDED_BUG_MACHINE, UNCOMMENTED_BUG_MACHINE);

/** This repository's `release` type: the id family `{kind}-{version}` (`patch-v0.3.1`, `minor-v0.3`). */
export const REPO_RELEASE_MEMORY_YAML = `version: 1
types:
  release:
    path: "docs/memory/release/{id}.md"
    id_pattern: "{kind}-{version}"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
`;

/** `dna.yaml` in which the fixture repository's git identity holds `approver` (`approve`, `reject`, `amend`). */
export const APPROVER_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

/** The committed fixture identity, as `Approver:` renders it. */
export const APPROVER_LINE = 'Approver: WingFoil Test <wf-test@example.invalid> (approver)';

/** The parsed kanban `memory.yaml`, or any other fixture text. */
export function parseMemoryYaml(text: string = KANBAN_MEMORY_YAML): MemoryYaml {
  return MemoryYaml.parse(parseYaml(text, 'memory.yaml'));
}

/** The path the kanban `memory.yaml` gives a document: `docs/memory/<type>/<id>.md`. */
export function kanbanPath(type: string, id: string): string {
  return `docs/memory/${type}/${id}.md`;
}

/** A document as the scanners summarise it, for the pure resolver. */
export function summary(type: string, id: string, status = 'draft'): MemoryDocumentSummary {
  return { path: kanbanPath(type, id), frontmatter: { id, type, title: id, status }, body: 'Body.\n' };
}

/** A document file: the scaffolded keys and a body with no placeholder comment. */
export function kanbanDocument(type: string, id: string, status: string, body = 'Real content.\n'): string {
  return ['---', `id: ${id}`, `type: ${type}`, `title: "${id}"`, `status: ${status}`, '---', '', body].join('\n');
}

/** One fixture document: its type, full id and committed status. */
export type FixtureDocument = readonly [type: string, id: string, status: string];

/** A temp git repository carrying the kanban `memory.yaml`, the approver `dna.yaml` and `documents`, one commit. */
export function buildKanbanRepo(documents: readonly FixtureDocument[], memoryYaml: string = KANBAN_MEMORY_YAML): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, '.wingfoil/memory.yaml', memoryYaml);
  writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
  for (const [type, id, status] of documents) writeFixtureFile(repo, kanbanPath(type, id), kanbanDocument(type, id, status));
  commitAll(repo, 'seed');
  return repo;
}
