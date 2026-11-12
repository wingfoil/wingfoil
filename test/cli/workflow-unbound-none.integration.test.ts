/**
 * task-358 AC 1 (e) (red-first, `bug-469` Expected; `spec-003-workflows-yaml-schema` Layer 3) — on this repository,
 * `workflow next` and `workflow status` print no `W_WORKFLOW_UNBOUND_TOKEN`, in either output form: every token is bound
 * `run` or `manual: true` in `.wingfoil/workflows/bindings.yaml`.
 *
 * The compiled CLI (`dist/cli.js`, rebuilt by the jest global setup) is spawned through the shared helper with this
 * repository as its working directory, as an operator runs it. The count before (68 on the task's base) is in the
 * task's Execution Notes. `W_INSTANCE_PRE_MARKER` (spec-017 §3.2) is expected on `workflow status` while open instances
 * predate the start marker, and is not asserted here. The registry half (no diagnostic at all at `HEAD`) is
 * `test/core/workflow-bindings-complete.test.ts`.
 */
import { join } from 'node:path';

import { runCliEntry } from './helpers/spawn-cli';

const ROOT = join(__dirname, '..', '..');
const UNBOUND = 'W_WORKFLOW_UNBOUND_TOKEN';

interface Diag {
  readonly code: string;
}

function unboundIn(stdout: string): Diag[] {
  const payload = JSON.parse(stdout) as { diagnostics: readonly Diag[] };
  return payload.diagnostics.filter((d) => d.code === UNBOUND);
}

describe('task-358 AC 1 (e) — workflow next and workflow status report no unbound token on this repository', () => {
  it('workflow next --format json: exit 0, no W_WORKFLOW_UNBOUND_TOKEN among its diagnostics', () => {
    const run = runCliEntry(ROOT, ['workflow', 'next', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(unboundIn(run.stdout)).toEqual([]);
  });

  it('workflow status --format json: exit 0, no W_WORKFLOW_UNBOUND_TOKEN among its diagnostics', () => {
    const run = runCliEntry(ROOT, ['workflow', 'status', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(unboundIn(run.stdout)).toEqual([]);
  });

  it('workflow next (console): exit 0, no unbound token on either stream and no "N diagnostic(s)" line', () => {
    const run = runCliEntry(ROOT, ['workflow', 'next']);
    expect(run.status).toBe(0);
    expect(`${run.stdout}${run.stderr}`).not.toContain(UNBOUND);
    expect(run.stdout).not.toMatch(/^\d+ diagnostic\(s\)/m);
  });

  it('workflow status (console): exit 0, no unbound token on either stream', () => {
    const run = runCliEntry(ROOT, ['workflow', 'status']);
    expect(run.status).toBe(0);
    expect(`${run.stdout}${run.stderr}`).not.toContain(UNBOUND);
  });
});
