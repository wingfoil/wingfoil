/**
 * task-281 AC 5 (`bug-313`, approver ruling D6 2026-10-12) — `dev-loop.yaml` v2.0: `done` declares the order the
 * practice follows — `memory.approve`, `element.set_state(done)` and the linked bugs' `bug.sync_state` on the
 * task branch, then `git.merge(to: main, ff: false)`, then `git.remove_worktree` — with one numeric version bump
 * and a history entry.
 *
 * The workflow is read **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`), like `test/core/dev-loop-v1-6.test.ts`
 * (task-221). The `git-conventions` §1 half is `test/directives/dev-loop-done-order.test.ts`.
 *
 * - red-first: `done`'s actions and order; the version and its history entry;
 * - characterization: `workflow show dev-loop` at `HEAD` reports no error (the conformance tests stay green).
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';

const ROOT = join(__dirname, '..', '..');
const DEV_LOOP_FILE = '.wingfoil/workflows/custom/dev-loop.yaml';

/** The file as `HEAD` holds it. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

describe('task-281 AC 5 (bug-313) — dev-loop.yaml `done` declares the practice order (ruling D6)', () => {
  it('red-first: `done`\'s actions are approve, set_state(done), the bugs\' sync, then the merge, then the worktree removal', () => {
    const workflow = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'dev-loop');
    expect(workflow).toBeDefined();
    const done = workflow!.phases.find((phase) => phase.name === 'done');
    expect(done).toBeDefined();
    expect(done!.actions).toEqual([
      'memory.approve',
      'element.set_state(done)',
      'bug.sync_state(for_each: task.bug)',
      'git.merge(to: main, ff: false)',
      'git.remove_worktree',
    ]);
  });

  it('red-first: `version:` is 2.0 or later and its comment names task-281 and bug-313, keeping `prev 1.9`', () => {
    const line = /^version: (\S+)(.*)$/m.exec(atHead(DEV_LOOP_FILE));
    expect(line).not.toBeNull();
    expect(Number(line![1])).toBeGreaterThanOrEqual(2.0);
    expect(line![2]).toContain('task-281');
    expect(line![2]).toContain('bug-313');
    expect(line![2]).toContain('prev 1.9');
  });

  it('characterization: `workflow show dev-loop` at HEAD reports no diagnostic of severity error', () => {
    const shown = workflowShowAtHead(ROOT, 'dev-loop');
    if (!shown.ok) throw new Error(`workflow show dev-loop failed: ${shown.error.message}`);
    expect(shown.value.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
