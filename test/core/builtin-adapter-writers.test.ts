/**
 * task-196 review F3 — the evidence for `REQ-SEC-07`'s adapter clause: "No command removes or rewrites
 * a built-in agent adapter: 0 operations in the command surface do."
 *
 * There is no `adapter remove` (`spec-016` §2.1), so there is no refusal to test. What can be held is
 * that nothing but `init` CAN reach `.wingfoil/agents/`:
 *
 * 1. **Registry.** The `agent` module of `CORE_MODULES` carries no mutating operation that has not been
 *    reviewed against `REQ-SEC-07` ({@link REVIEWED_AGENT_WRITERS}, empty today). The task that adds
 *    `agentExecute` (or any other mutating `agent` operation) fails here until it lists the operation
 *    and states, in its own test, that the operation writes nothing under `agents/built-in/`.
 * 2. **Code paths.** The adapter directory is spelled, in code (comments excluded), only by the init
 *    scaffold (`src/storage/templates.ts`) and the read-only discovery (`src/agent/discovery.ts`), and its
 *    constants are used only by those, the read-only integrity check and the barrels. A new writer would
 *    have to spell the path or import a constant, and fails here.
 *
 * Limit, stated rather than hidden: a path the USER configures (a `memory.yaml` type `path` pattern
 * under `.wingfoil/agents/`) is project configuration, not code, and is outside what this test sees.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { enumerateOperations } from '../../src/core/registry';

const SRC = join(__dirname, '..', '..', 'src');

/**
 * Mutating `agent` operations reviewed against REQ-SEC-07's adapter clause.
 * - `agentExecute` (task-218): reads the adapter at `HEAD` through the discovery and writes nothing under
 *   `.wingfoil/agents/`: before the spawn it writes only its temporary files, in the OS temporary
 *   directory, and its one commit (task-228) holds the element's run-log file alone (`spec-016` §3.6).
 *   `test/cli/agent-execute.integration.test.ts` holds every pre-launch path to writing nothing at all.
 */
const REVIEWED_AGENT_WRITERS: readonly string[] = ['agentExecute'];

/** Every `.ts` file under `src/`, repository-relative with `/`, in byte order (REQ-SYS-07). */
function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts')) out.push(relative(join(SRC, '..'), full).split('\\').join('/'));
  }
  return out;
}

/** The file's code with comment lines and trailing `//` comments removed. */
function codeOf(file: string): string {
  return readFileSync(join(SRC, '..', file), 'utf-8')
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
    .map((line) => line.replace(/\s\/\/\s.*$/, ''))
    .join('\n');
}

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles().filter((file) => pattern.test(codeOf(file)));
}

describe('REQ-SEC-07 — no operation but init writes a built-in agent adapter (task-196)', () => {
  it('the agent module registers no unreviewed mutating operation', () => {
    const agentWriters = enumerateOperations(CORE_MODULES)
      .filter(({ module, operation }) => module.name === 'agent' && operation.mutates)
      .map(({ operation }) => operation.name);
    expect(agentWriters).toEqual(REVIEWED_AGENT_WRITERS);
  });

  it('only the init scaffold and the read-only discovery spell the adapter directory in code', () => {
    expect(filesMatching(/\.wingfoil\/agents|agents\/(built-in|custom)/)).toEqual([
      'src/agent/discovery.ts',
      'src/storage/templates.ts',
    ]);
  });

  it('the adapter directory constants are used only by init, the integrity check, discovery and the barrels', () => {
    expect(filesMatching(/\b(BUILTIN_ADAPTERS_DIR|CUSTOM_ADAPTERS_DIR|ADAPTERS_DIR_PATH)\b/)).toEqual([
      'src/agent/discovery.ts',
      'src/agent/index.ts',
      'src/core/builtin-integrity.ts',
      'src/storage/index.ts',
      'src/storage/templates.ts',
    ]);
  });
});
