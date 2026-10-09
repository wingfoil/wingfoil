/**
 * task-268 (`bug-291`) — the `src/core` consumers of WingFoil's `git log` readers, on signed commits,
 * with `log.showSignature` off and on.
 *
 * - AC 1: `memory.memoryHistory` (the operation `memory history` dispatches to) returns the same
 *   entries, at exit 0, whichever way the option is set.
 * - AC 2: the workflow deduction (`deduceWorkflowStateAtHead`, `spec-017` §4.8) finds the same phase
 *   records — before the fix the signature text was read into the record's commit name, the record
 *   fell outside its instance's walk and the checkpoint stayed open, with no diagnostic. And when git
 *   prints a name that is not a full sha anyway (a `git` that ignores `--no-show-signature`), both
 *   refuse it as `IO` / `E_GIT_READ_FAILED` rather than using it.
 *
 * The git configuration is isolated (`isolateGitConfig`): no global or system configuration of the
 * developer is read or written.
 */
import { CORE_MODULES, deduceWorkflowStateAtHead, type InstanceDeduction } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { E_GIT_READ_FAILED, StorageError } from '../../src/storage';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { commitSigned, installSignatureForcingGit, isolateGitConfig, makeSignedRepo, setShowSignature } from '../storage/helpers/signed-commits';

const MEMORY_YAML = `version: 1.0
types:
  bug:
    path: "docs/bugs/{id}.md"
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members: []
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

/** A main whose two phases have no evidence but a record: each completes only by its own record. */
const FLOW = `name: flow
kind: main
phases:
  - name: first
  - name: second
`;

function doc(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** The fixture project: configuration, one bug with two transitions, an open plan and one phase record. */
function seed(repo: string): void {
  commitSigned(repo, 'fixture configuration', {
    '.wingfoil/memory.yaml': MEMORY_YAML,
    '.wingfoil/dna.yaml': DNA_YAML,
    '.wingfoil/workflows.yaml': 'version: 1.0\ninclude:\n  - workflows/custom/flow.yaml\n',
    '.wingfoil/workflows/custom/flow.yaml': FLOW,
  });
  commitSigned(repo, 'wf(bug): add bug-1', { 'docs/bugs/bug-1.md': doc('bug', 'bug-1', 'draft') });
  commitSigned(repo, 'wf(bug): submit bug-1', { 'docs/bugs/bug-1.md': doc('bug', 'bug-1', 'open') });
  commitSigned(repo, 'start plan-a', { 'docs/plans/plan-a.md': doc('plan', 'plan-a', 'active', 'workflow: "flow"\nphase: "first"\nelement: ""\n') });
  commitSigned(repo, 'workflow: finalize\n\nWingFoil-Phase: flow.first completed\nWingFoil-Instance: plan-a');
}

function memoryHistoryFn(): CoreFn<unknown, { entries: readonly { sha: string; operation: string | null }[] }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryHistory;
  if (!operation) throw new Error('fixture bug: "memoryHistory" operation not registered');
  return operation.fn as CoreFn<unknown, { entries: readonly { sha: string; operation: string | null }[] }>;
}

function planA(repo: string): InstanceDeduction {
  const found = deduceWorkflowStateAtHead(repo).instances.find((entry) => entry.instance.id === 'plan-a');
  if (!found) throw new Error('fixture bug: plan-a is not an open instance');
  return found;
}

describe('task-268 — src/core git log consumers on signed commits (bug-291)', () => {
  let restore: () => void = () => undefined;
  let repo = '';

  beforeAll(() => {
    restore = isolateGitConfig();
    repo = makeSignedRepo();
    seed(repo);
  });

  afterAll(() => {
    removeTempDir(repo);
    restore();
  });

  it('AC 1: memory history returns the same entries at exit 0 with log.showSignature on and off', async () => {
    setShowSignature(repo, false);
    const off = await memoryHistoryFn()({ root: repo, positional: 'bug-1' });
    setShowSignature(repo, true);
    const on = await memoryHistoryFn()({ root: repo, positional: 'bug-1' });
    expect(off.ok).toBe(true);
    expect(exitCodeForResult(on)).toBe(0);
    expect(on).toEqual(off);
    if (!on.ok) return;
    expect(on.value.entries.map((entry) => entry.operation)).toEqual(['add', 'submit']);
  });

  it('AC 2: the deduction finds the phase record with log.showSignature on, as with it off', () => {
    setShowSignature(repo, false);
    const off = deduceWorkflowStateAtHead(repo);
    expect(planA(repo).frontier.map((step) => step.key)).toEqual(['flow.second']);
    setShowSignature(repo, true);
    expect(deduceWorkflowStateAtHead(repo)).toEqual(off);
  });

  describe('a git that prints signature text despite --no-show-signature', () => {
    let uninstall: () => void = () => undefined;
    beforeAll(() => {
      setShowSignature(repo, true);
      uninstall = installSignatureForcingGit();
    });
    afterAll(() => uninstall());

    it('AC 2: memory history refuses the name as IO (exit 1) rather than using it', async () => {
      const result = await memoryHistoryFn()({ root: repo, positional: 'bug-1' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('IO');
      expect(result.error.message).toMatch(/printed "No signature.*" where a commit name was expected/);
      expect(exitCodeForResult(result)).toBe(1);
    });

    it('AC 2: the deduction refuses it with E_GIT_READ_FAILED rather than dropping the record', () => {
      let thrown: unknown;
      try {
        deduceWorkflowStateAtHead(repo);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(StorageError);
      expect((thrown as StorageError).code).toBe(E_GIT_READ_FAILED);
      expect((thrown as StorageError).message).toMatch(/where a commit name was expected/);
    });
  });
});
