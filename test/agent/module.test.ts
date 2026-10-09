/**
 * The `agent` module exists (task-177, `spec-016` §1): `src/agent` is declared in `dna.yaml`
 * `modules` (held by `test/core/module-layout.test.ts`), and its `CoreModule` is registered in
 * `CORE_MODULES` under the name `agent`. Its operations are `agentShow` (task-220, read-only) and
 * `agentExecute` (task-218, mutating: its one write is the run record); `agent list` is task-240's.
 */
import { MODULE_NAME, resolveRunLogPath } from '../../src/agent';
import { CORE_MODULES } from '../../src/core';
import { enumerateOperations } from '../../src/core/registry';
import { loadDnaYaml } from '../../src/core/loaders';
import { join } from 'path';

describe('the agent module', () => {
  it('is named `agent`', () => {
    expect(MODULE_NAME).toBe('agent');
  });

  it('is registered in CORE_MODULES with agentExecute (mutating, task-218) and agentShow (read-only, task-220)', () => {
    const agent = CORE_MODULES.find((module) => module.name === 'agent');
    expect(agent).toBeDefined();
    expect(Object.keys(agent!.operations).sort()).toEqual(['agentExecute', 'agentShow']);
    expect(
      enumerateOperations(CORE_MODULES)
        .filter(({ module }) => module.name === 'agent')
        .map(({ operation }) => [operation.name, operation.mutates]),
    ).toEqual([
      ['agentExecute', true],
      ['agentShow', false],
    ]);
  });

  it('is declared in this repository’s dna.yaml modules at src/agent', () => {
    const dna = loadDnaYaml(join(__dirname, '..', '..'));
    expect(dna.modules.find((module) => module.name === 'agent')?.path).toBe('src/agent');
  });
});

describe('this repository’s run log (task-206, spec-016 §4.1)', () => {
  it('declares paths.runs, exactly one directory, which resolves inside the repository', () => {
    const root = join(__dirname, '..', '..');
    const runs = (loadDnaYaml(root).paths as Record<string, string[] | undefined>).runs;
    expect(runs).toEqual(['docs/06_runs/']);
    expect(resolveRunLogPath(root, runs, 'task-206')).toEqual({ ok: true, value: 'docs/06_runs/task-206.jsonl' });
  });
});
