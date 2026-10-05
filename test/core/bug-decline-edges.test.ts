/**
 * task-114-bug-decline-edges-from-triaged-and-planned (`dl-123`, ratified (A)(i)) — the bug machine
 * this repository runs gives a bug ruled not-to-be-fixed after triage an approver-gated exit:
 * `reject` from `triaged` and from `planned` lands on `closed`, as `open`'s wontfix edge already did.
 *
 * Everything here reads **this repository's own `.wingfoil/memory.yaml`, as committed at `HEAD`** —
 * the configuration the CLI resolves when it is run at the repository root — never a hand-written
 * copy of the machine, so the test follows whatever `memory.yaml` is committed. It reads no history.
 *
 * - **AC 2 (red-first).** Through the real `CORE_MODULES` `memoryReject` operation, in a throwaway
 *   git repository whose `.wingfoil/memory.yaml` is the committed file byte for byte: a `triaged`
 *   and a `planned` bug go to `closed`, with `rejection_reason` set and the bracketed subject. The
 *   real `memoryApprove` still refuses both, and the engine says why: they are `waiting` as well as
 *   gated, so their forward edge has no verb (`spec-001-memory-yaml-schema`, *Which verb drives
 *   each forward edge*).
 * - **AC 3 (characterization).** Every other cell of the bug machine's edge table is unchanged.
 *
 * Determinism (REQ-SYS-07): fixed fixture identity and ids; the edge table is iterated in `sequence`
 * order.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import { resolveStateMachine, resolveTypeTransition, type TransitionOp } from '../../src/memory/state-machine';
import { splitFrontmatter } from '../../src/storage';
import { readPathAtRev } from '../../src/storage/commit';
import { ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

/** This repository's root: its `.wingfoil/` is the configuration WingFoil develops itself with. */
const REPO_ROOT = join(__dirname, '..', '..');
const MEMORY_YAML_PATH = '.wingfoil/memory.yaml';

/** The committed `memory.yaml`, raw — copied verbatim into the throwaway repositories below. */
function committedMemoryYamlText(): string {
  const raw = readPathAtRev(REPO_ROOT, 'HEAD', MEMORY_YAML_PATH);
  if (raw === null) throw new Error(`fixture bug: no ${MEMORY_YAML_PATH} committed at HEAD in ${REPO_ROOT}`);
  return raw;
}

/** `makeTempGitRepo`'s local identity holds the `approver` role, so authority never decides the outcome. */
const DNA_YAML = `version: 1.1
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
      roles: [ approver ]
  roles:
    - name: approver
paths:
  sources: [ src/ ]
`;

interface TransitionValue {
  readonly id: string;
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

function memoryOperation(name: 'memoryReject' | 'memoryApprove'): CoreFn<unknown, TransitionValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return operation.fn as CoreFn<unknown, TransitionValue>;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

function bugDoc(id: string, status: string): string {
  return `---
id: "${id}"
type: bug
title: "A bug ruled not-to-be-fixed"
status: ${status}
severity: "low"
release: ""
tmpl_version: 260703
---

## Summary

Ruled a design, not a defect.
`;
}

const bugPath = (id: string): string => `docs/04_memory/bugs/${id}.md`;

function frontmatter(repo: string, relativePath: string): Record<string, unknown> {
  const content = readFileSync(join(repo, relativePath), 'utf-8');
  return load(splitFrontmatter(content).frontmatter ?? '') as Record<string, unknown>;
}

const DECLINE_CASES = [
  { state: 'triaged', id: 'bug-901-ruled-after-triage' },
  { state: 'planned', id: 'bug-902-ruled-before-the-fix-starts' },
] as const;

describe('dl-123 (A) — the committed bug machine declines a triaged or planned bug to `closed` (AC 2)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, MEMORY_YAML_PATH, committedMemoryYamlText());
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    for (const { state, id } of DECLINE_CASES) writeFixtureFile(repo, bugPath(id), bugDoc(id, state));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it.each(DECLINE_CASES)('`memory reject` from `$state` lands on `closed`, sets `rejection_reason`, one bracketed commit', async ({ state, id }) => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const result = await memoryOperation('memoryReject')({
      root: repo,
      positional: id,
      positionals: [id],
      options: { reason: 'ruled a design, not a defect' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ id, path: bugPath(id), from: state, to: 'closed' });
    expect(frontmatter(repo, bugPath(id))).toMatchObject({
      status: 'closed',
      rejection_reason: 'ruled a design, not a defect',
    });
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).toBe(
      `wf(bug): reject ${id} [${state} → closed]\n\n` +
        'Approver: WingFoil Test <wf-test@example.invalid> (approver)\n' +
        `Reason: ruled a design, not a defect${STAMP_TRAILER}`,
    );
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(bugPath(id));
  });

  it.each(DECLINE_CASES)('`memory approve` from `$state` is still refused, because the state is `waiting` as well as gated', async ({ state, id }) => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const original = readFileSync(join(repo, bugPath(id)), 'utf-8');
    const result = await memoryOperation('memoryApprove')({
      root: repo,
      positional: id,
      positionals: [id],
      options: { reason: 'probe' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_TRANSITION');
    expect((result.error.details as { issues: { detail?: string }[] }).issues[0]?.detail).toContain(
      `illegal \`approve\` from "${state}": both a \`gates\` and \`waiting\` state`,
    );
    expect(readFileSync(join(repo, bugPath(id)), 'utf-8')).toBe(original);
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
  });
});

describe('the committed bug machine — every edge, `sequence` order (AC 2 + AC 3)', () => {
  const memoryYaml = loadMemoryYamlAtHead(REPO_ROOT);
  if (memoryYaml === null) throw new Error(`fixture bug: no ${MEMORY_YAML_PATH} committed at HEAD in ${REPO_ROOT}`);

  /** The legal target of each verb from each state; `null` = illegal. `deprecate` is legal everywhere. */
  const EDGES: Record<string, Record<Exclude<TransitionOp, 'deprecate'>, string | null>> = {
    draft: { submit: 'open', approve: null, reject: null, park: null },
    open: { submit: null, approve: 'triaged', reject: 'closed', park: null },
    triaged: { submit: null, approve: null, reject: 'closed', park: null }, // dl-123 (A)
    planned: { submit: null, approve: null, reject: 'closed', park: null }, // dl-123 (A)
    'in-progress': { submit: 'in-review', approve: null, reject: null, park: null },
    'in-review': { submit: null, approve: 'resolved', reject: 'in-progress', park: null },
    resolved: { submit: null, approve: 'closed', reject: 'in-progress', park: null },
    closed: { submit: null, approve: null, reject: null, park: null },
  };

  function target(state: string, op: TransitionOp): string | null {
    try {
      return resolveTypeTransition(memoryYaml!, 'bug', state, op);
    } catch (error) {
      if (error instanceof ValidationError) return null;
      throw error;
    }
  }

  it('declares the states the table covers, and keeps `triaged`/`planned` as its `waiting` states', () => {
    const machine = resolveStateMachine(memoryYaml, 'bug');
    expect(machine.sequence).toEqual(Object.keys(EDGES));
    expect(machine.waiting).toEqual(['triaged', 'planned']);
  });

  it.each(Object.keys(EDGES))('from `%s`, submit / approve / reject / park / deprecate reach exactly the declared targets', (state) => {
    expect({
      submit: target(state, 'submit'),
      approve: target(state, 'approve'),
      reject: target(state, 'reject'),
      park: target(state, 'park'),
    }).toEqual(EDGES[state]);
    expect(target(state, 'deprecate')).toBe('deprecated');
  });
});
