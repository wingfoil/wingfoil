/**
 * task-158-reconcile-adr-001-adr-010-node-22-floor — an `accepted` ADR takes a dated correction or
 * Revision note through `memory amend` (approver ruling 2026-10-02, option 1 of the task's design:
 * `dl-108` A3 counts "facts that later evidence corrected, and dated revision notes" as amendments;
 * only a change to the decision itself is a new ADR).
 *
 * Reads **this repository's own** `.wingfoil/memory.yaml` from the working tree and runs the REAL
 * registered `CORE_MODULES` `memory.memoryAmend` on a THROWAWAY temp git repo seeded with that same
 * file, so what is pinned is what the CLI enforces here, not a hand-written copy of it.
 *
 * - **red-first.** `adr` declares `amendable: true`, the other types keep task-127's values, and
 *   `memory.yaml` is version 2.2 or later (2.1 is task-153's).
 * - **red-first.** With that `memory.yaml`, amending an `accepted` adr writes one commit
 *   `wf(adr): amend <id> [accepted → accepted]`.
 *
 * Determinism (REQ-SYS-07): fixed inputs, fixed expectations.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { loadMemoryYaml } from '../../src/core/loaders';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** This repository's root: its `.wingfoil/` is the configuration WingFoil develops itself with. */
const REPO_ROOT = join(__dirname, '..', '..');

describe("this repository's memory.yaml declares `adr` amendable (task-158)", () => {
  const memoryYaml = loadMemoryYaml(REPO_ROOT);
  const amendableOf = (type: string): unknown => (memoryYaml.types[type] as { amendable?: unknown } | undefined)?.amendable;

  it('`adr` is `amendable: true`', () => {
    expect(amendableOf('adr')).toBe(true);
  });

  it('every other type keeps the value task-127 declared', () => {
    const others = ['task', 'decision-log', 'tech-spec', 'bug', 'plan', 'service', 'release', 'release-line'];
    expect(Object.fromEntries(others.map((type) => [type, amendableOf(type)]))).toEqual({
      task: true,
      'decision-log': true,
      'tech-spec': true,
      bug: true,
      plan: true,
      service: true,
      release: false,
      'release-line': false,
    });
  });

  it('memory.yaml is version 2.2 or later, compared as a number (2.1 is task-153)', () => {
    expect(memoryYaml.version).toBeGreaterThanOrEqual(2.2);
  });
});

describe("`memory amend` on an accepted adr with this repository's memory.yaml (task-158)", () => {
  const TEST_NAME = 'WingFoil Test';
  const TEST_EMAIL = 'wf-test@example.invalid';
  const APPROVER_DNA = `version: 1.1
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
  const ID = 'adr-901-sample';
  const PATH = `docs/04_memory/design/adrs/${ID}.md`;

  function adrDoc(body: string): string {
    return `---
id: "${ID}"
type: adr
title: "A decision"
status: accepted
sard_ref: "REQ-SYS-01"
tmpl_version: 260703
---

## Decision

${body}`;
  }

  const gitOut = (repo: string, args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', readFileSync(join(REPO_ROOT, '.wingfoil', 'memory.yaml'), 'utf-8'));
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, PATH, adrDoc('The decision.\n'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('commits the correction note as one `[accepted → accepted]` amend touching only the ADR', async () => {
    const edited = adrDoc('The decision.\n\n> **Correction (2026-10-02) — a fact later evidence corrected.**\n');
    writeFixtureFile(repo, PATH, edited);
    const before = gitOut(repo, ['rev-parse', 'HEAD']);

    const amend = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAmend?.fn as CoreFn<unknown, unknown>;
    const result = await amend({ root: repo, positional: ID, options: { reason: 'a correction note' } });

    expect(result.ok ? null : result.error.message).toBeNull();
    expect(result.ok && result.value).toEqual({ id: ID, path: PATH, from: 'accepted', to: 'accepted' });
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(`wf(adr): amend ${ID} [accepted → accepted]`);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(PATH);
    expect(gitOut(repo, ['show', `HEAD:${PATH}`]) + '\n').toBe(edited);
  });
});
