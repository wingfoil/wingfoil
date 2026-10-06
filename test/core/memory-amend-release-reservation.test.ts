/**
 * task-170 (`bug-166`, approver ruling 2026-10-01, option (A)) — `memory amend` reserves `release`
 * only on a type that carries the assign-owned `release` field.
 *
 * `task-127`'s ruling (b) reserved `release` for `assign` on every type. But `assign`
 * (`element.set_release`, `build-backlog`) only owns `release` on the types whose documents carry it
 * with the `traceability` directive's uniform meaning. After `task-170` a `service` no longer has a
 * `release` field: its set-up release is `set_up_in`. A `release` key still on an old service document
 * is a leftover with no owner, and an amendment may remove it.
 *
 * The keying: `release` is reserved exactly when the type's scaffold **as committed at `HEAD`**
 * (`template.file` of the `memory.yaml` committed at `HEAD`, `command-baseline`) declares a `release`
 * frontmatter field. A type with no readable committed scaffold keeps `release` reserved (fail safe:
 * nothing shows the field is unowned). The other reserved fields are unconditional.
 *
 * Exercises the REAL registered `memory.memoryAmend` in throwaway git repos, plus the exported
 * `amendReservedFields` against this repository's own committed configuration.
 *
 * Determinism (REQ-SYS-07): fixed fixtures and expectations; `it.each` rows in a fixed order.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import { amendReservedFields } from '../../src/core/memory-amend';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult } from '../../src/core/exit-code';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const TEST_EMAIL = 'wf-test@example.invalid';
const TEST_NAME = 'WingFoil Test';

const DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${TEST_NAME}
      email: ${TEST_EMAIL}
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

/** The types `build-backlog` stamps carry `release` in their scaffold; `service` does not; `orphan` has no committed scaffold. */
const STAMPED = ['task', 'bug', 'tech-spec', 'decision-log'] as const;

function typeEntry(type: string, template: string | null): string {
  return `  ${type}:
    path: "docs/memory/${type}/{id}.md"
    amendable: true
${template === null ? '' : `    template:\n      file: "${template}"\n      frontmatter:\n        required: [title]\n`}    states:
      sequence: [draft, pending, approved]
      gates:
        pending: { reject: draft }
`;
}

const MEMORY_YAML = `version: 1
types:
${[...STAMPED].map((type) => typeEntry(type, `memory/templates/${type}.md`)).join('')}${typeEntry('service', 'memory/templates/service.md')}${typeEntry('orphan', 'memory/templates/orphan.md')}`;

const scaffold = (type: string, releaseLine: string | null): string => `---
id: "{auto}"
type: ${type}
title: ""
status: draft
${releaseLine === null ? '' : `${releaseLine}\n`}tmpl_version: 261001
---

## Body
`;

const SERVICE_SCAFFOLD = scaffold('service', 'set_up_in: ""          # optional — the release in which it was set up');

function doc(id: string, type: string, releaseLine: string): string {
  return `---
id: "${id}"
type: ${type}
title: "A title"
status: approved
${releaseLine}
tmpl_version: 260929
---

## Body

Original body.
`;
}

const pathOf = (type: string, id: string): string => `docs/memory/${type}/${id}.md`;

function amend(): CoreFn<unknown, { id: string; from: string; to: string }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAmend;
  if (!operation) throw new Error('"memoryAmend" is not registered on the memory module');
  return operation.fn as CoreFn<unknown, { id: string; from: string; to: string }>;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

describe('memory amend — `release` is reserved only where the committed scaffold declares it (task-170, bug-166)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA);
    for (const type of STAMPED) {
      writeFixtureFile(repo, `.wingfoil/memory/templates/${type}.md`, scaffold(type, 'release: ""            # optional'));
      writeFixtureFile(repo, pathOf(type, `${type}-1`), doc(`${type}-1`, type, 'release: "v0.2"'));
    }
    writeFixtureFile(repo, '.wingfoil/memory/templates/service.md', SERVICE_SCAFFOLD);
    writeFixtureFile(repo, pathOf('service', 'svc-001'), doc('svc-001', 'service', 'release: "v0.2"'));
    writeFixtureFile(repo, pathOf('orphan', 'orphan-1'), doc('orphan-1', 'orphan', 'release: "v0.2"'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  function editLine(type: string, id: string, from: string, to: string): string {
    const path = pathOf(type, id);
    const edited = readFileSync(join(repo, path), 'utf-8').replace(from, to);
    writeFixtureFile(repo, path, edited);
    return edited;
  }

  it('a service may rename `release` to `set_up_in`: exit 0, one amend commit holding only that file', async () => {
    const edited = editLine('service', 'svc-001', 'release: "v0.2"', 'set_up_in: "v0.2"');
    const result = await amend()({ root: repo, positional: 'svc-001', options: { reason: 'Rename the set-up release field.' } });
    expect(result.ok ? null : result.error.message).toBeNull();
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(service): amend svc-001 [approved → approved]');
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(pathOf('service', 'svc-001'));
    expect(gitOut(repo, ['show', `HEAD:${pathOf('service', 'svc-001')}`])).toBe(edited.trim());
  });

  it.each(STAMPED)('a %s still refuses a change to `release` (exit 1, naming the field)', async (type) => {
    const edited = editLine(type, `${type}-1`, 'release: "v0.2"', 'release: "v0.3"');
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);
    const result = await amend()({ root: repo, positional: `${type}-1`, options: { reason: 'r' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain("frontmatter field 'release'");
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(join(repo, pathOf(type, `${type}-1`)), 'utf-8')).toBe(edited);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('a type whose scaffold is not committed keeps `release` reserved (fail safe)', async () => {
    editLine('orphan', 'orphan-1', 'release: "v0.2"', 'set_up_in: "v0.2"');
    const result = await amend()({ root: repo, positional: 'orphan-1', options: { reason: 'r' } });
    expect(result.ok ? null : result.error.message).toContain("frontmatter field 'release'");
  });

  it.each([
    ['declares no template at all', null],
    ['has a scaffold whose frontmatter is not valid YAML', '---\nrelease: [unclosed\n---\n'],
    ['has a scaffold with no frontmatter block', '## Body only\n'],
  ])('a type that %s keeps `release` reserved (fail safe)', (_label, scaffoldText) => {
    const serviceTemplate = '    template:\n      file: "memory/templates/service.md"\n      frontmatter:\n        required: [title]\n';
    const yaml = scaffoldText === null ? MEMORY_YAML.replace(serviceTemplate, '') : MEMORY_YAML;
    writeFixtureFile(repo, '.wingfoil/memory.yaml', yaml);
    if (scaffoldText !== null) writeFixtureFile(repo, '.wingfoil/memory/templates/service.md', scaffoldText);
    commitAll(repo, 'unreadable service scaffold');
    const memoryYaml = loadMemoryYamlAtHead(repo);
    if (memoryYaml === null) throw new Error('fixture bug: no memory.yaml at HEAD');
    expect(amendReservedFields(repo, memoryYaml, 'service')).toContain('release');
  });

  it('the committed scaffold decides, not the working tree (command-baseline)', async () => {
    writeFixtureFile(repo, '.wingfoil/memory/templates/service.md', scaffold('service', 'release: ""'));
    editLine('service', 'svc-001', 'release: "v0.2"', 'set_up_in: "v0.2"');
    const ok = await amend()({ root: repo, positional: 'svc-001', options: { reason: 'r' } });
    expect(ok.ok ? null : ok.error.message).toBeNull();
  });

  it('the other reserved fields stay reserved on a service (`status`, `id`, `type`, `rejection_reason`, `supersedes`)', () => {
    const memoryYaml = loadMemoryYamlAtHead(repo);
    if (memoryYaml === null) throw new Error('fixture bug: no memory.yaml at HEAD');
    expect(amendReservedFields(repo, memoryYaml, 'service')).toEqual(['id', 'rejection_reason', 'status', 'supersedes', 'type']);
    expect(amendReservedFields(repo, memoryYaml, 'task')).toEqual(['id', 'rejection_reason', 'release', 'status', 'supersedes', 'type']);
  });
});

describe('this repository\'s committed configuration (task-170)', () => {
  const REPO_ROOT = join(__dirname, '..', '..');

  it('reserves `release` on every type whose scaffold declares it, and not on `service`', () => {
    const memoryYaml = loadMemoryYamlAtHead(REPO_ROOT);
    if (memoryYaml === null) throw new Error(`no memory.yaml committed at HEAD in ${REPO_ROOT}`);
    const reservesRelease = (type: string): boolean => amendReservedFields(REPO_ROOT, memoryYaml, type).includes('release');
    for (const type of ['task', 'bug', 'tech-spec', 'decision-log', 'adr']) expect([type, reservesRelease(type)]).toEqual([type, true]);
    expect(reservesRelease('service')).toBe(false);
  });
});
