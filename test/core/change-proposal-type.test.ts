/**
 * task-212-add-change-proposal-memory-type-startable-vision-change (`dl-132` Q1 (a), Q2 (ii), Q3 (x),
 * Action 2) — the `change-proposal` Memory type: a change to the vision, of which a feature request is a
 * case (`kind: feature | vision`), recorded as an element with its own machine
 * `draft → in-analysis (→ draft) → accepted → scheduled`, plus `deprecated` as for every type.
 *
 * Everything reads **this repository's own configuration as committed at `HEAD`** — `memory.yaml` and the
 * scaffold `memory add` resolves (`resolveAddType`) — never a hand-written copy of it.
 *
 * - **AC 1 (red-first, REQ-SYS-04 fit criterion).** In a throwaway git repository seeded with the committed
 *   `memory.yaml` and `change-proposal` scaffold byte for byte, the REAL registered `CORE_MODULES`
 *   operations walk the declared machine: `memoryAdd` → `memorySubmit` (draft → in-analysis) →
 *   `memoryReject` (→ draft) → `memorySubmit` → `memoryApprove` (→ accepted); `approve` from `accepted`
 *   is refused (a `waiting` edge, no verb). No source file names the type: the walk is configuration only.
 * - **AC 5 (red-first; characterization in the task, corrected at design).** The type declares its path
 *   and `id_pattern`; the scaffold carries the change, the per-layer impact analysis (P / US / BDD / REQ /
 *   tasks, each allowing an explicit "no impact", Q2 (ii)) and the target release (proposal D13).
 *
 * Determinism (REQ-SYS-07): fixed fixture identity, title and expectations; edges iterated in `sequence` order.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import { resolveAddType } from '../../src/core/memory-add-type';
import { resolveStateMachine, resolveTypeTransition, type TransitionOp } from '../../src/memory/state-machine';
import { splitFrontmatter } from '../../src/storage';
import { readPathAtRev } from '../../src/storage/commit';
import { ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** This repository's root: its `.wingfoil/` is the configuration WingFoil develops itself with. */
const REPO_ROOT = join(__dirname, '..', '..');
const MEMORY_YAML_PATH = '.wingfoil/memory.yaml';
const TEMPLATE_PATH = '.wingfoil/memory/templates/change-proposal.md';
const TYPE = 'change-proposal';

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

function committed(path: string): string {
  const raw = readPathAtRev(REPO_ROOT, 'HEAD', path);
  if (raw === null) throw new Error(`${path} is not committed at HEAD in ${REPO_ROOT}`);
  return raw;
}

function memoryOperation<T>(name: string): CoreFn<unknown, T> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return operation.fn as CoreFn<unknown, T>;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

function frontmatter(repo: string, relativePath: string): Record<string, unknown> {
  const content = readFileSync(join(repo, relativePath), 'utf-8');
  return load(splitFrontmatter(content).frontmatter ?? '') as Record<string, unknown>;
}

describe('AC 1 — REQ-SYS-04: the committed `change-proposal` type walks its machine with no source change', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, MEMORY_YAML_PATH, committed(MEMORY_YAML_PATH));
    writeFixtureFile(repo, TEMPLATE_PATH, committed(TEMPLATE_PATH));
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    commitAll(repo, 'seed: this repository\'s memory.yaml and change-proposal scaffold');
  });

  afterEach(() => removeTempDir(repo));

  it('add → submit → reject → submit → approve, one bracketed commit each; approve from `accepted` is refused', async () => {
    const added = await memoryOperation<{ id: string; path: string }>('memoryAdd')({
      root: repo,
      options: { type: TYPE, title: 'A feature request for a vision change' },
    });
    expect(added.ok ? null : added.error.message).toBeNull();
    if (!added.ok) return;
    const { id, path } = added.value;
    expect(id).toBe('cp-001-a-feature-request-for-a-vision-change');
    expect(path).toBe(`docs/04_memory/change-proposals/${id}.md`);
    expect(frontmatter(repo, path)).toMatchObject({ type: TYPE, status: 'draft' });
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(`wf(${TYPE}): add ${id}`);

    // The author fills the required `kind` (the title was set by add) before submitting.
    const absolute = join(repo, path);
    writeFileSync(absolute, readFileSync(absolute, 'utf-8').replace(/^kind: "".*$/m, 'kind: "feature"'), 'utf-8');

    const transition = memoryOperation<{ from: string; to: string }>;
    const walk: [string, Record<string, unknown>, string, string][] = [
      ['memorySubmit', {}, 'draft', 'in-analysis'],
      ['memoryReject', { reason: 'the impact analysis names no BDD layer' }, 'in-analysis', 'draft'],
      ['memorySubmit', {}, 'draft', 'in-analysis'],
      ['memoryApprove', { reason: 'the analysis covers every layer' }, 'in-analysis', 'accepted'],
    ];
    for (const [operation, options, from, to] of walk) {
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      const result = await transition(operation)({ root: repo, positional: id, positionals: [id], options });
      expect(result.ok ? null : result.error.message).toBeNull();
      if (!result.ok) return;
      expect(result.value).toMatchObject({ from, to });
      expect(frontmatter(repo, path).status).toBe(to);
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
      expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(path);
    }
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(`wf(${TYPE}): approve ${id} [in-analysis → accepted]`);

    const refused = await transition('memoryApprove')({ root: repo, positional: id, positionals: [id], options: { reason: 'probe' } });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe('INVALID_TRANSITION');
    expect(frontmatter(repo, path).status).toBe('accepted');
  });
});

describe('AC 1 — the committed machine, every edge in `sequence` order', () => {
  /** The legal target of each verb from each state; `null` = illegal. `deprecate` is legal everywhere. */
  const EDGES: Record<string, Record<Exclude<TransitionOp, 'deprecate'>, string | null>> = {
    draft: { submit: 'in-analysis', approve: null, reject: null, park: null },
    'in-analysis': { submit: null, approve: 'accepted', reject: 'draft', park: null },
    accepted: { submit: null, approve: null, reject: null, park: null }, // waiting: `vision-change`'s schedule step
    scheduled: { submit: null, approve: null, reject: null, park: null },
  };

  function memoryYaml(): NonNullable<ReturnType<typeof loadMemoryYamlAtHead>> {
    const loaded = loadMemoryYamlAtHead(REPO_ROOT);
    if (loaded === null) throw new Error(`no ${MEMORY_YAML_PATH} committed at HEAD`);
    return loaded;
  }

  function target(state: string, op: TransitionOp): string | null {
    try {
      return resolveTypeTransition(memoryYaml(), TYPE, state, op);
    } catch (error) {
      if (error instanceof ValidationError) return null;
      throw error;
    }
  }

  it('declares dl-132\'s machine: `in-analysis` is the only gate, `accepted` the only waiting state', () => {
    expect(Object.keys(memoryYaml().types)).toContain(TYPE);
    const machine = resolveStateMachine(memoryYaml(), TYPE);
    expect(machine.sequence).toEqual(Object.keys(EDGES));
    expect(machine.gates).toEqual({ 'in-analysis': { reject: 'draft' } });
    expect(machine.waiting).toEqual(['accepted']);
  });

  it.each(Object.keys(EDGES))('from `%s`, submit / approve / reject / park / deprecate reach exactly the declared targets', (state) => {
    expect(Object.keys(memoryYaml().types)).toContain(TYPE);
    expect({
      submit: target(state, 'submit'),
      approve: target(state, 'approve'),
      reject: target(state, 'reject'),
      park: target(state, 'park'),
    }).toEqual(EDGES[state]);
    expect(target(state, 'deprecate')).toBe('deprecated');
  });
});

describe('AC 5 — path, id pattern and scaffold (dl-132 Action 2, Q2 (ii), proposal D13)', () => {
  function resolved(): Extract<ReturnType<typeof resolveAddType>, { ok: true }>['value'] {
    const result = resolveAddType(REPO_ROOT, TYPE);
    if (!result.ok) throw new Error(`change-proposal does not resolve at HEAD: ${result.error.message}`);
    return result.value;
  }

  it('declares its path, id pattern, required fields and `kind` values, and is amendable', () => {
    expect(resolved()).toMatchObject({
      type: TYPE,
      pathPattern: 'docs/04_memory/change-proposals/{id}.md',
      idPattern: 'cp-{n}-{slug}',
      templatePath: TEMPLATE_PATH,
    });
    expect(resolved().template.frontmatter?.required).toEqual(['title', 'kind']);
    const entry = loadMemoryYamlAtHead(REPO_ROOT)?.types[TYPE] as Record<string, unknown> & { template: { frontmatter: Record<string, unknown> } };
    expect(entry.template.frontmatter.values).toEqual({ kind: ['feature', 'vision'] });
    expect(entry.amendable).toBe(true);
  });

  it('the scaffold has the change, the impact analysis per layer, the target release', () => {
    const lines = resolved().scaffold.split('\n');
    const h2 = lines.filter((line) => line.startsWith('## ')).map((line) => line.slice(3).trim());
    const h3 = lines.filter((line) => line.startsWith('### ')).map((line) => line.slice(4).trim());
    expect(h2).toEqual(['The change', 'Impact analysis', 'Target release', 'Notes']);
    expect(h3).toEqual([
      'Features (P*)',
      'User stories (US-*)',
      'BDD scenarios',
      'SARD requirements (REQ-*)',
      'Tasks, ADRs and tech-specs already delivered',
    ]);
    // Q2 (ii): a skipped layer is a decision, recorded as "no impact" — the scaffold says so.
    expect(resolved().scaffold).toMatch(/"no impact"/);
  });

  it('the frontmatter carries kind (REQUIRED), the target release and the stamped release', () => {
    const { frontmatter: raw } = splitFrontmatter(resolved().scaffold);
    const fields = load(raw ?? '') as Record<string, unknown>;
    expect(fields).toMatchObject({ type: TYPE, status: 'draft', kind: '', target_release: '', release: '' });
    const lines = (raw ?? '').split('\n');
    for (const field of ['title', 'kind']) expect(lines.find((line) => line.startsWith(`${field}:`))).toMatch(/# REQUIRED/);
  });
});
