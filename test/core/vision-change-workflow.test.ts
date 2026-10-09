/**
 * task-212-add-change-proposal-memory-type-startable-vision-change (`dl-132` Action 3, `dl-109`) — the
 * startable `vision-change` workflow: capture → impact analysis (approval gate) → update the vision →
 * scoped downcast (the existing `user-story-mapping`, `specification-by-examples`, `volere-requirements`,
 * each optional: only the layers the analysis names run, Q2 (ii)) → schedule.
 *
 * Reads the workflow registry **as committed at `HEAD`** (`loadWorkflowRegistryAtHead`, the loader plus the
 * core checks) and `workflow show` at `HEAD` (`workflowShowAtHead`), as the CLI does.
 *
 * - **AC 2 (red-first).** `vision-change` loads with zero errors, is startable, its capture phase is
 *   self-creating (`memory.add(type: change-proposal)`, no declared `element`), and `workflow show
 *   vision-change` nests the three included subs under their phases.
 * - **AC 4 (characterization).** The three downcast subs, already included by `specification-downcast`,
 *   accept a second includer: they are `kind: sub`, declare no `element`, and the loader reports no
 *   diagnostic on either includer other than the unbound check tokens.
 *
 * Deterministic: the registry is read in manifest order; fixed expectations.
 */
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import { tokenName } from '../../src/workflow/bindings';

const ROOT = join(__dirname, '..', '..');
const SUBS = ['user-story-mapping', 'specification-by-examples', 'volere-requirements'];

describe('AC 2 — the startable, self-creating `vision-change` workflow', () => {
  const loaded = loadWorkflowRegistryAtHead(ROOT);
  const visionChange = loaded.workflows.find((workflow) => workflow.name === 'vision-change');

  it('is included by workflows.yaml, loads with zero errors and is startable', () => {
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(visionChange).toBeDefined();
    expect(visionChange?.kind).toBe('main');
  });

  it('declares the phases of dl-132 in order, the downcast phases optional', () => {
    expect(visionChange?.phases.map((phase) => [phase.name, phase.include ?? null, phase.optional === true])).toEqual([
      ['capture', null, false],
      ['impact-analysis', null, false],
      ['update-vision', null, false],
      ['downcast-stories', 'user-story-mapping', true],
      ['downcast-scenarios', 'specification-by-examples', true],
      ['downcast-requirements', 'volere-requirements', true],
      ['schedule', null, false],
    ]);
  });

  it('capture is self-creating: no declared element, its first action adds a change-proposal', () => {
    expect(visionChange?.element).toBeUndefined();
    const capture = visionChange?.phases[0];
    expect(capture?.actions).toEqual(['memory.add(type: change-proposal)', 'memory.submit']);
    expect(capture?.checks?.post).toEqual(['frontmatter.required: [title, kind]']);
  });

  it('impact-analysis is the approval gate (reject back to capture); schedule moves the element to `scheduled`', () => {
    const byName = new Map(visionChange?.phases.map((phase) => [phase.name, phase]));
    expect(byName.get('impact-analysis')).toMatchObject({
      role: 'architect',
      approval: { by_role: 'approver' },
      fallback: { step: 'capture' },
    });
    expect(byName.get('impact-analysis')?.actions?.map(tokenName)).toEqual(['agent.execute', 'memory.approve']);
    expect(byName.get('schedule')?.actions).toEqual(['element.set_release("{change-proposal.target_release}")', 'element.set_state(scheduled)']);
    expect(byName.get('update-vision')?.checks?.post).toEqual(['vision-index.current']);
    expect(byName.get('schedule')?.checks?.post).toEqual(['vision-index.current']);
  });

  it('`vision-index.current` is bound to the vision index test (bug-270)', () => {
    expect(loaded.bindings?.checks?.['vision-index.current']?.run).toEqual(['npm', 'test', '--', 'test/docs/vision-index.test.ts']);
  });

  it('`workflow show vision-change` nests the three included subs under their phases', () => {
    const shown = workflowShowAtHead(ROOT, 'vision-change');
    expect(shown.ok ? null : shown.error.message).toBeNull();
    if (!shown.ok) return;
    const { workflow } = shown.value;
    expect(workflow).toMatchObject({ name: 'vision-change', startable: true, includable: false, element: null });
    const nested = workflow.phases.filter((phase) => phase.sub !== null).map((phase) => [phase.name, phase.sub?.name, phase.sub?.phases.length]);
    expect(nested).toEqual([
      ['downcast-stories', 'user-story-mapping', 3],
      ['downcast-scenarios', 'specification-by-examples', 2],
      ['downcast-requirements', 'volere-requirements', 3],
    ]);
  });
});

describe('AC 4 — the downcast subs accept a second includer (characterization)', () => {
  const loaded = loadWorkflowRegistryAtHead(ROOT);

  it.each(SUBS)('%s is kind: sub, declares no element, and is included by specification-downcast and vision-change', (name) => {
    const sub = loaded.workflows.find((workflow) => workflow.name === name);
    expect(sub).toMatchObject({ kind: 'sub' });
    expect(sub?.element).toBeUndefined();
    const includers = loaded.workflows.filter((workflow) => workflow.phases.some((phase) => phase.include === name)).map((workflow) => workflow.name);
    expect(includers).toEqual(['vision-change', 'specification-downcast']); // manifest order: the startable mains come first
  });

  it('the loader reports nothing on vision-change but its unbound prose check', () => {
    const own = loaded.diagnostics
      .filter((d) => d.file === 'workflows/custom/vision-change.yaml')
      .map((d) => [d.code, d.path]);
    expect(own).toEqual([['W_WORKFLOW_UNBOUND_TOKEN', 'phases[0].checks.post[0]']]);
  });
});
