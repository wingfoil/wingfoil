/**
 * task-281 AC 4 (`bug-326`) — one refusal for a `<ref>` that selects no open instance (`spec-017` §10, §3.1):
 * `workflow is not open: <ref>` when `<ref>` names a loaded workflow **or an instance plan at `HEAD`** (type
 * `plan`, no `parent`, any status), else `unknown workflow: <ref>`; both `NOT_FOUND`, `details: { ref }`.
 * Approver ruling D4 (2026-10-12): a phase plan's id (`parent` set) is not an instance, so it answers
 * `unknown workflow`.
 *
 * Through the registered `CORE_MODULES` operations `workflowNext`, `workflowStatus`, `workflowFinalize`,
 * `workflowEnd` and `memoryAdd --workflow`, on a fixture with no open instance, a `done` instance plan
 * `old-1-plan` and an active phase plan `phase-1-plan`.
 *
 * - red-first: `next`, `status`, `finalize`, `memory add --workflow` on `old-1-plan`; `end` on `phase-1-plan` (D4).
 * - characterization: `end` on `old-1-plan` (task-217 D5); every operation on `ghost`; the four others on
 *   `phase-1-plan`.
 *
 * The CLI half is `test/cli/workflow-ref-not-open.integration.test.ts`.
 */
import { CORE_MODULES, enumerateOperations } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { writeRefProject } from './helpers/ref-not-open-fixture';

type RefOp = 'workflowNext' | 'workflowStatus' | 'workflowFinalize' | 'workflowEnd' | 'memoryAdd';

function operation(module: string, name: string): CoreFn<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === module && entry.operation.name === name);
  if (found === undefined) throw new Error(`${module}.${name} is not registered`);
  return found.operation.fn;
}

/** Call `name` with `ref` as its `<ref>`: the positional of the four workflow verbs, `--workflow` of `memory add`. */
function call(root: string, name: RefOp, ref: string): Promise<CoreResult<unknown>> {
  if (name === 'memoryAdd') return operation('memory', name)({ root, options: { type: 'bug', title: 'b', workflow: ref } }) as Promise<CoreResult<unknown>>;
  return operation('workflow', name)({ root, positional: ref }) as Promise<CoreResult<unknown>>;
}

const notOpen = (ref: string): unknown => ({ ok: false, error: expect.objectContaining({ code: 'NOT_FOUND', message: `workflow is not open: ${ref}`, details: { ref } }) });
const unknown = (ref: string): unknown => ({ ok: false, error: expect.objectContaining({ code: 'NOT_FOUND', message: `unknown workflow: ${ref}`, details: { ref } }) });

describe('task-281 AC 4 (bug-326) — a <ref> that selects no open instance (spec-017 §10)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeRefProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it.each<RefOp>(['workflowNext', 'workflowStatus', 'workflowFinalize', 'memoryAdd'])(
    'red-first: %s on a `done` instance plan answers "workflow is not open: old-1-plan", nothing written',
    async (name) => {
      const unchanged = snapshotPersistence(repo);
      expect(await call(repo, name, 'old-1-plan')).toEqual(notOpen('old-1-plan'));
      assertPersistenceUnchanged(repo, unchanged);
    },
  );

  it('characterization: workflowEnd on the `done` instance plan already answers "workflow is not open" (task-217 D5)', async () => {
    const unchanged = snapshotPersistence(repo);
    expect(await call(repo, 'workflowEnd', 'old-1-plan')).toEqual(notOpen('old-1-plan'));
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('red-first (ruling D4): workflowEnd on a phase plan\'s id answers "unknown workflow: phase-1-plan"', async () => {
    const unchanged = snapshotPersistence(repo);
    expect(await call(repo, 'workflowEnd', 'phase-1-plan')).toEqual(unknown('phase-1-plan'));
    assertPersistenceUnchanged(repo, unchanged);
  });

  it.each<RefOp>(['workflowNext', 'workflowStatus', 'workflowFinalize', 'memoryAdd'])(
    'characterization (ruling D4): %s on a phase plan\'s id answers "unknown workflow: phase-1-plan"',
    async (name) => {
      expect(await call(repo, name, 'phase-1-plan')).toEqual(unknown('phase-1-plan'));
    },
  );

  it.each<RefOp>(['workflowNext', 'workflowStatus', 'workflowFinalize', 'workflowEnd', 'memoryAdd'])(
    'characterization: %s on a <ref> naming neither a workflow nor a plan answers "unknown workflow: ghost"',
    async (name) => {
      expect(await call(repo, name, 'ghost')).toEqual(unknown('ghost'));
    },
  );
});
