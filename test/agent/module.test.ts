/**
 * The `agent` module exists (task-177, `spec-016` §1): `src/agent` is declared in `dna.yaml`
 * `modules` (held by `test/core/module-layout.test.ts`), and its `CoreModule` is registered in
 * `CORE_MODULES` under the name `agent`, with no operation yet — `agent execute`, `list` and `show`
 * are later tasks', so no command and no MCP Tool is derived from it today.
 */
import { MODULE_NAME } from '../../src/agent';
import { CORE_MODULES } from '../../src/core';
import { enumerateOperations } from '../../src/core/registry';
import { loadDnaYaml } from '../../src/core/loaders';
import { join } from 'path';

describe('the agent module', () => {
  it('is named `agent`', () => {
    expect(MODULE_NAME).toBe('agent');
  });

  it('is registered in CORE_MODULES with no operation yet', () => {
    const agent = CORE_MODULES.find((module) => module.name === 'agent');
    expect(agent).toBeDefined();
    expect(Object.keys(agent!.operations)).toEqual([]);
    expect(enumerateOperations(CORE_MODULES).filter(({ module }) => module.name === 'agent')).toEqual([]);
  });

  it('is declared in this repository’s dna.yaml modules at src/agent', () => {
    const dna = loadDnaYaml(join(__dirname, '..', '..'));
    expect(dna.modules.find((module) => module.name === 'agent')?.path).toBe('src/agent');
  });
});
