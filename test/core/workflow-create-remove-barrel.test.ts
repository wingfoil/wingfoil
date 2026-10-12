/**
 * task-211 — W3 B6 gate: the `workflow create` / `workflow remove` values re-exported through the
 * `src/core` barrel are the module's own (the barrel's getters were never read through `src/core`).
 */
import * as core from '../../src/core';
import * as createRemove from '../../src/core/workflow-create-remove';

describe('src/core re-exports of workflow-create-remove (task-211)', () => {
  it('serves the module values', () => {
    expect(core.KIND_CONFLICT_MESSAGE).toBe(createRemove.KIND_CONFLICT_MESSAGE);
    expect(core.NO_DECLARATION_MESSAGE).toBe(createRemove.NO_DECLARATION_MESSAGE);
    expect(core.WORKFLOWS_MANIFEST_PATH).toBe('.wingfoil/workflows.yaml');
    expect(core.workflowExistsMessage('flow')).toBe('workflow already exists: flow');
  });
});
