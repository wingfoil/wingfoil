/**
 * task-124-the-service-memory-type (`dl-088`, ratified state machine (a)) — the `service` Memory
 * type: one unit of state outside the git repository that the project owns, depends on, or presents
 * itself through, recorded in the repository without ever holding a secret value.
 *
 * Everything here reads **this repository's own configuration** — the `.wingfoil/` the CLI resolves
 * when it runs at the repository root. `memory.yaml` and the scaffold are read **as committed at
 * `HEAD`** (`loadMemoryYamlAtHead`, `resolveAddType`), the baseline `memory add`
 * itself reads; the Workflow pillar is read through `loadWorkflowsYaml`, the loader `workflow list`
 * uses. Nothing here is a hand-written copy of the configuration, and no history is read.
 *
 * - **AC 2 (red-first).** The scaffold carries `dl-088`'s frontmatter table (required and optional
 *   fields), its four body sections, and the security rule; it passes the `spec-007` scan clean.
 * - **AC 3 (red-first).** A `service-ingest` main is loaded: `capture` (`memory.add` +
 *   `memory.submit`, the P4.12 required-field check and the `spec-007` scan among `checks.post`),
 *   then `approve` by the `approver`.
 * - **task-170 (red-first, `bug-166`).** The release a service was set up in is `set_up_in`, not
 *   `release`: `release` has one meaning on every element that carries it (the `traceability`
 *   directive — the release the element's implementation is assigned to, stamped by `build-backlog`),
 *   and a service is never stamped.
 * - **AC 4 (red-first).** `service` resolves its scaffold, and its machine is
 *   `draft → pending → active`: `reject` from `pending` lands on `draft`, `approve` from `active` is
 *   illegal, `deprecate` is legal everywhere.
 *
 * Determinism (REQ-SYS-07): fixed expectations; the edge table is iterated in `sequence` order.
 */
import { join } from 'node:path';

import { load } from 'js-yaml';

import { loadMemoryYamlAtHead, loadWorkflowsYaml } from '../../src/core/loaders';
import { resolveAddType } from '../../src/core/memory-add-type';
import { resolveStateMachine, resolveTypeTransition, type TransitionOp } from '../../src/memory/state-machine';
import { splitFrontmatter } from '../../src/storage';
import { scanText } from '../../src/validation/secret-scan';
import { ValidationError } from '../../src/validation';

/** This repository's root: its `.wingfoil/` is the configuration WingFoil develops itself with. */
const REPO_ROOT = join(__dirname, '..', '..');

const REQUIRED = ['title', 'provider', 'kind', 'owner_role', 'verify'];
const OPTIONAL = ['url', 'account', 'renews', 'repo_refs', 'decision', 'set_up_in'];
const SECTIONS = ['Purpose', 'Configuration', 'Verification', 'Management'];

function committedMemoryYaml(): NonNullable<ReturnType<typeof loadMemoryYamlAtHead>> {
  const memoryYaml = loadMemoryYamlAtHead(REPO_ROOT);
  if (memoryYaml === null) throw new Error(`fixture bug: no memory.yaml committed at HEAD in ${REPO_ROOT}`);
  return memoryYaml;
}

describe('the committed `service` type (task-124, dl-088)', () => {
  it('AC 4: `memory add` resolves the `service` scaffold at HEAD, with dl-088\'s path and id pattern', () => {
    const result = resolveAddType(REPO_ROOT, 'service');
    expect(result.ok ? null : result.error.message).toBeNull();
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      type: 'service',
      pathPattern: 'docs/04_memory/services/{id}.md',
      idPattern: 'svc-{n}-{slug}',
      templatePath: '.wingfoil/memory/templates/service.md',
    });
    expect(result.value.template.frontmatter?.required).toEqual(REQUIRED);
  });

  describe('AC 2: the scaffold', () => {
    function scaffold(): string {
      const result = resolveAddType(REPO_ROOT, 'service');
      if (!result.ok) throw new Error(`service scaffold does not resolve: ${result.error.message}`);
      return result.value.scaffold;
    }

    it('carries every field of dl-088\'s frontmatter table, the required ones marked REQUIRED', () => {
      const { frontmatter } = splitFrontmatter(scaffold());
      const fields = load(frontmatter ?? '') as Record<string, unknown>;
      expect(fields).toMatchObject({ type: 'service', status: 'draft' });
      for (const field of [...REQUIRED, ...OPTIONAL]) expect(Object.keys(fields)).toContain(field);
      const lines = (frontmatter ?? '').split('\n');
      for (const field of REQUIRED) {
        expect(lines.find((line) => line.startsWith(`${field}:`))).toMatch(/# REQUIRED/);
      }
      for (const field of OPTIONAL) {
        expect(lines.find((line) => line.startsWith(`${field}:`))).toMatch(/# optional/);
      }
    });

    it('names the set-up release `set_up_in` and carries no `release` field (task-170, bug-166)', () => {
      const { frontmatter } = splitFrontmatter(scaffold());
      const fields = load(frontmatter ?? '') as Record<string, unknown>;
      expect(Object.keys(fields)).not.toContain('release');
      const line = (frontmatter ?? '').split('\n').find((candidate) => candidate.startsWith('set_up_in:'));
      expect(line).toMatch(/the release in which it was set up/);
      expect(line).toMatch(/never stamped/);
    });

    it('has the four body sections, in dl-088\'s order', () => {
      const headings = scaffold()
        .split('\n')
        .filter((line) => line.startsWith('## '))
        .map((line) => line.slice(3).trim());
      expect(headings).toEqual(SECTIONS);
    });

    it('states the security rule: a service never holds a secret value', () => {
      expect(scaffold()).toMatch(/never (holds|contains) a secret value/i);
    });

    it('passes the spec-007 scan with no blocking finding and no warning', () => {
      const result = scanText(scaffold(), '.wingfoil/memory/templates/service.md');
      expect(result.blocking).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('AC 3: the `service-ingest` main', () => {
    const loadPillar = (): ReturnType<typeof loadWorkflowsYaml> => loadWorkflowsYaml(REPO_ROOT);

    it('is included by workflows.yaml and loads as `kind: main`', () => {
      const { manifest, workflows } = loadPillar();
      expect(manifest?.include).toContain('workflows/custom/service-ingest.yaml');
      expect(workflows.find((workflow) => workflow.name === 'service-ingest')).toMatchObject({ kind: 'main' });
    });

    it('captures (add + submit, required fields and the spec-007 scan checked), then the approver approves', () => {
      const workflow = loadPillar().workflows.find((candidate) => candidate.name === 'service-ingest');
      expect(workflow).toBeDefined();
      const [capture, approve] = workflow?.phases ?? [];
      expect(workflow?.phases.map((phase) => phase.name)).toEqual(['capture', 'approve']);
      expect(capture?.actions).toEqual(['memory.add(type: service)', 'memory.submit']);
      expect(capture?.produces).toEqual(['docs/04_memory/services/{id}.md']);
      expect(capture?.checks?.post).toContain(`frontmatter.required: [${REQUIRED.join(', ')}]`);
      expect(capture?.checks?.post?.some((check) => /spec-007/.test(check))).toBe(true);
      expect(approve).toMatchObject({
        role: 'approver',
        actions: ['memory.approve'],
        approval: { by_role: 'approver' },
        fallback: { step: 'capture' },
      });
    });
  });

  describe('AC 4: the machine, every edge in `sequence` order', () => {
    /** The legal target of each verb from each state; `null` = illegal. `deprecate` is legal everywhere. */
    const EDGES: Record<string, Record<Exclude<TransitionOp, 'deprecate'>, string | null>> = {
      draft: { submit: 'pending', approve: null, reject: null, park: null },
      pending: { submit: null, approve: 'active', reject: 'draft', park: null },
      active: { submit: null, approve: null, reject: null, park: null },
    };

    function target(state: string, op: TransitionOp): string | null {
      try {
        return resolveTypeTransition(committedMemoryYaml(), 'service', state, op);
      } catch (error) {
        if (error instanceof ValidationError) return null;
        throw error;
      }
    }

    it('declares `sequence: [draft, pending, active]`, `pending` as its only gate, and no `waiting` state', () => {
      const memoryYaml = committedMemoryYaml();
      expect(Object.keys(memoryYaml.types)).toContain('service');
      const machine = resolveStateMachine(memoryYaml, 'service');
      expect(machine.sequence).toEqual(Object.keys(EDGES));
      expect(Object.keys(machine.gates ?? {})).toEqual(['pending']);
      expect(machine.waiting ?? []).toEqual([]);
    });

    it.each(Object.keys(EDGES))('from `%s`, submit / approve / reject / park / deprecate reach exactly the declared targets', (state) => {
      expect(Object.keys(committedMemoryYaml().types)).toContain('service');
      expect({
        submit: target(state, 'submit'),
        approve: target(state, 'approve'),
        reject: target(state, 'reject'),
        park: target(state, 'park'),
      }).toEqual(EDGES[state]);
      expect(target(state, 'deprecate')).toBe('deprecated');
    });
  });
});
