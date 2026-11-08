/**
 * task-335 AC 1 (red-first) — a phase's `launch:` key (`spec-003` Layer 2 phase table and § "Diagnostics",
 * `dl-183` Q1 (a); approver rulings D1 (a), D2 (a)):
 *
 * - (a) the schema: `launch: interactive | headless | any` is kept as declared (no default: an absent key stays
 *   absent, as `mode` does), `LAUNCH_KINDS` lists the three, and any other value fails at `phases[<i>].launch`;
 * - (b) the loader: an unknown value is the structural `E_VALIDATION` at `phases[<i>].launch` (the shape of
 *   `test/core/workflow-executor-cadence.test.ts`'s "a structurally invalid cadence …");
 * - (c) `E_PHASE_EXECUTOR_WITHOUT_ROLE` covers `launch` beside `mode` and `distinct_from`, one row per field, in
 *   that order;
 * - (d) `workflow next`'s `Step` and `workflow show`'s `PhaseView` carry `launch`: the declared value, `null` for a
 *   phase without the key (`spec-017` §6.3, §8), through the registered operations on the step fixture of
 *   `agent execute` with `launch:` on `loop.implement`.
 */
import { CORE_MODULES } from '../../src/core';
import { loadWorkflowsYaml } from '../../src/core/loaders';
import type { CoreResult } from '../../src/core/types';
import { ValidationError } from '../../src/validation';
import { LAUNCH_KINDS, Workflow } from '../../src/workflow/schema';
import { TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { seedLaunch } from '../agent/helpers/agent-execute-awaiting-fixture';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

const FILE = 'workflows/custom/main.yaml';

function writeMain(root: string, phases: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/main.yaml\n');
  writeFixtureFile(root, `.wingfoil/${FILE}`, `name: main\nkind: main\nphases:\n${phases}`);
}

function diagnosticsOf(root: string): Diag[] {
  try {
    loadWorkflowsYaml(root);
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    return (err as { diagnostics?: Diag[] }).diagnostics ?? [];
  }
  throw new Error('expected loadWorkflowsYaml to throw');
}

describe('task-335 AC 1 (a) — the schema keeps launch as declared (spec-003 Layer 2)', () => {
  it('LAUNCH_KINDS is interactive, headless, any', () => {
    expect(LAUNCH_KINDS).toEqual(['interactive', 'headless', 'any']);
  });

  it.each(['interactive', 'headless', 'any'])('launch: %s parses and keeps its value', (kind) => {
    const result = Workflow.safeParse({ name: 'dev-loop', kind: 'sub', phases: [{ name: 'green', role: 'developer', launch: kind }] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phases[0]!.launch).toBe(kind);
  });

  it('a phase without the key has launch undefined (no default)', () => {
    const result = Workflow.safeParse({ name: 'dev-loop', kind: 'sub', phases: [{ name: 'green', role: 'developer' }] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phases[0]!.launch).toBeUndefined();
  });

  it("launch: 'batch' fails at ['phases', 0, 'launch']", () => {
    const result = Workflow.safeParse({ name: 'dev-loop', kind: 'sub', phases: [{ name: 'green', role: 'developer', launch: 'batch' }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toEqual([['phases', 0, 'launch']]);
  });
});

describe('task-335 AC 1 (b), (c) — the loader diagnostics (spec-003 § "Diagnostics")', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('an unknown launch value is a structural E_VALIDATION at its path', () => {
    writeMain(repo, '  - name: green\n    role: developer\n    launch: batch\n');
    expect(diagnosticsOf(repo).map((d) => [d.code, d.path])).toEqual([['E_VALIDATION', 'phases[0].launch']]);
  });

  it('E_PHASE_EXECUTOR_WITHOUT_ROLE covers launch: mode, distinct_from and launch on a phase without role, one row each, in that order', () => {
    writeMain(repo, '  - name: compose\n    mode: fresh\n    distinct_from: [build]\n    launch: headless\n  - name: build\n    role: developer\n');
    expect(diagnosticsOf(repo)).toEqual([
      { code: 'E_PHASE_EXECUTOR_WITHOUT_ROLE', severity: 'error', file: FILE, path: 'phases[0].mode', message: "phase 'compose' declares mode but has no role (it has no executor)" },
      {
        code: 'E_PHASE_EXECUTOR_WITHOUT_ROLE',
        severity: 'error',
        file: FILE,
        path: 'phases[0].distinct_from',
        message: "phase 'compose' declares distinct_from but has no role (it has no executor)",
      },
      { code: 'E_PHASE_EXECUTOR_WITHOUT_ROLE', severity: 'error', file: FILE, path: 'phases[0].launch', message: "phase 'compose' declares launch but has no role (it has no executor)" },
    ]);
  });

  it('every declared kind on a phase with a role loads', () => {
    writeMain(repo, '  - name: design\n    role: architect\n    launch: interactive\n  - name: green\n    role: developer\n    launch: headless\n  - name: review\n    role: reviewer\n    launch: any\n');
    expect(() => loadWorkflowsYaml(repo)).not.toThrow();
  });
});

/** A registered operation of the workflow module, its result normalized to a `CoreResult` (as the CLI calls it). */
async function call(name: 'workflowNext' | 'workflowShow', root: string, positional?: string): Promise<Record<string, unknown>> {
  const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations[name];
  if (op === undefined) throw new Error(`no ${name} operation in CORE_MODULES`);
  const value = await op.fn({ root, ...(positional === undefined ? {} : { positional }) });
  const result = (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<unknown>;
  if (!result.ok) throw new Error(`${name} refused: ${result.error.message}`);
  // The JSON payload, as --format json prints it.
  return JSON.parse(JSON.stringify(result.value)) as Record<string, unknown>;
}

describe('task-335 AC 1 (d) — Step and PhaseView carry launch (spec-017 §6.3, §8)', () => {
  let headless: string;
  let none: string;
  beforeAll(() => {
    headless = seedLaunch('headless');
    none = seedLaunch(undefined);
  });
  afterAll(() => {
    removeTempDir(headless);
    removeTempDir(none);
  });

  it('workflow next: next.launch is the declared value; each further frontier step carries it too', async () => {
    const value = await call('workflowNext', headless);
    const next = value['next'] as Record<string, unknown>;
    expect(next['key']).toBe(`loop.implement@task:${TASK_ID}`);
    expect(next['launch']).toBe('headless');
    expect((value['more'] as Record<string, unknown>[]).map((step) => step['launch'])).toEqual(['headless']);
  }, 60000);

  it('workflow next: null for a phase without the key', async () => {
    const next = (await call('workflowNext', none))['next'] as Record<string, unknown>;
    expect(next).toHaveProperty('launch', null);
  }, 60000);

  it("workflow show: each phase's launch, null where absent", async () => {
    const shown = (await call('workflowShow', headless, 'loop')) as { workflow: { phases: Record<string, unknown>[] } };
    expect(shown.workflow.phases.map((phase) => [phase['name'], phase['launch']])).toEqual([
      ['implement', 'headless'],
      ['review', null],
    ]);
    const main = (await call('workflowShow', headless, 'delivery')) as { workflow: { phases: Record<string, unknown>[] } };
    expect(main.workflow.phases.map((phase) => [phase['name'], phase['launch']])).toEqual([['build', null]]);
  }, 60000);
});
