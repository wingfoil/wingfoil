/**
 * task-373 (review fix) — `nextWorkflow`'s `--assigned-to` resolution with no dna.yaml (`spec-017` §7.3): no
 * `team.members[]` and no `team.roles`, so the word is kept as a role name and the warning saying it names nobody is
 * written on stderr. The warning is captured and asserted here, never left on the suite's stderr (bug-476).
 * Characterization: the behaviour exists. No git, no filesystem.
 */
import type { Deduction, DeducedStep, InstanceDeduction } from '../../src/workflow/deduce';
import { nextWorkflow, type NextInputs } from '../../src/core/workflow-next';

/** Copied from a real run: `node dist/cli.js workflow next --assigned-to developer` on a project whose dna declares no `developer`. */
const NO_ASSIGNEE_WARNING = "warning: --assigned-to 'developer' names no team.members[] entry (name or email) and no team.roles role in dna.yaml\n";

/** Run `fn` with `process.stderr.write` captured (and silenced); answer its value and every chunk written. */
function captureStderr<T>(fn: () => T): { value: T; chunks: string[] } {
  const chunks: string[] = [];
  const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  });
  try {
    return { value: fn(), chunks };
  } finally {
    spy.mockRestore();
  }
}

describe('task-373 — --assigned-to with no dna.yaml (spec-017 §7.3)', () => {
  const INPUTS: NextInputs = { workflows: [], memoryYaml: null, dnaYaml: null, bindings: null, rolesYaml: null, directiveFiles: [] };
  const instance = (frontier: DeducedStep[]): InstanceDeduction => ({
    instance: { id: 'rc-1', workflow: 'cycle', element: null, context: null, created: [], planStatus: 'active', startCommit: 'abc', active: true, abandoned: false },
    complete: false,
    phases: [],
    frontier,
    late: [],
  });
  const step = { role: null } as unknown as DeducedStep;
  const deduction: Deduction = { baseline: { rev: 'HEAD', commit: 'abc' }, active: 'rc-1', instances: [instance([step])], diagnostics: [], gated: [] };

  it('no team.roles: the word names nobody, the warning says so on stderr, and the role-less step is still dropped', () => {
    const { value: result, chunks } = captureStderr(() => nextWorkflow(INPUTS, deduction, { assignedTo: 'developer' }));
    expect(chunks).toEqual([NO_ASSIGNEE_WARNING]);
    expect(result.ok && result.value).toMatchObject({ next: null, message: "no next step of workflow 'cycle' is assigned to 'developer'" });
  });
});
