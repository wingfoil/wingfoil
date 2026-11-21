/**
 * task-367 AC 8 (`bug-538`; `spec-018` §2.5, §2.6; approver rulings D9, D11: characterization) — the refusal of the
 * attribution half (`spec-018` §2.5), reached IN PROCESS through every registered operation that resolves an agent
 * context, so coverage instruments the `if (!agent.ok) return agent;` branch each call site of
 * `resolveOperationAgentContext(` carries. The spawned suites (`test/cli/agent-attribution.integration.test.ts`) prove
 * the same refusal through `dist/cli.js`, which coverage does not measure.
 *
 * Each case calls the operation's `fn` as the CLI registrar does: its arguments mapped by `toolArgumentsToParams`, the
 * params built by `buildCoreParams`, the call run inside `withAgentInvocation({ env: {}, coAuthor: 'Nobody' })` —
 * `--co-author Nobody`, a name no `team.agents` entry holds. Expected: `ok: false`, `unknown team.agents entry 'Nobody'
 * (from --co-author): the committed dna.yaml declares Claude, Other` (`spec-018` §2.5), `HEAD`, index and tree
 * unchanged. The fixture is `buildAttributionRepo` (`test/core/helpers/attribution-fixture.ts`), on which every
 * invocation below succeeds with no marker (`test/cli/agent-attribution.integration.test.ts` AC 1).
 *
 * **One case per operation, not per call site.** The design asked for one case per call site, the case list held equal
 * to the `grep` of the call sites; naming the operation each site serves would mean reading `src/`, which `red` does
 * not do (`testing` T3). So the cases are every registered operation that takes the agent attribution — the rule of
 * `spec-018` §2.1 that `test/cli/agent-attribution.integration.test.ts` holds equal to the registry — which together
 * reach every ungated call site, and the parity cases hold:
 *
 * - the case list equal to the registry's attributed operations (a new attributed operation without a case fails);
 * - the number of lines holding `resolveOperationAgentContext(` in each file of `src/` (its own module excepted) equal
 *   to the count the design recorded (`grep -rn "resolveOperationAgentContext(" src | grep -v
 *   src/core/agent-context.ts`, 12 lines in six files), so a new call site fails until a case is added for it and the
 *   table is updated; and every such file named by at least as many cases as it holds sites. The file each case names
 *   is where the design's grep puts its operation's site, inferred from the file names (`memory-transition.ts`,
 *   `workflow-*.ts`) and, for `memory add`, the DNA and the directive verbs, by elimination (`src/core/index.ts`); no
 *   assertion executes that attribution.
 *
 * Passes on first run (characterization, D11). `src/cli.ts`'s blank `--project` check is the other class `bug-538`
 * names: `test/cli/entrypoint.test.ts`. The gated class is the in-process MCP refusal of
 * `test/mcp/mcp-memory-tools.test.ts` AC 2. Deterministic: fixed fixture, fixed identity, no environment read.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { withAgentInvocation } from '../../src/core/agent-context';
import { buildCoreParams, enumerateOperations, toolArgumentsToParams, type CoreOperation } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { buildAttributionRepo } from './helpers/attribution-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const REFUSAL = "unknown team.agents entry 'Nobody' (from --co-author): the committed dna.yaml declares Claude, Other";

const INDEX = 'src/core/index.ts';
const TRANSITION = 'src/core/memory-transition.ts';
const ADOPT = 'src/core/workflow-adopt.ts';
const CREATE_REMOVE = 'src/core/workflow-create-remove.ts';
const FINALIZE = 'src/core/workflow-finalize.ts';
const START_END = 'src/core/workflow-start-end.ts';

/** The call sites the design's `grep` listed, per file (`src/core/index.ts` 629, 987, 2095, 2199, 2401; …). */
const RECORDED_SITES: Readonly<Record<string, number>> = {
  [INDEX]: 5,
  [TRANSITION]: 1,
  [ADOPT]: 1,
  [CREATE_REMOVE]: 2,
  [FINALIZE]: 1,
  [START_END]: 2,
};

/** One attributed operation: its module and name, its arguments as a Tool call names them, and the site's file. */
interface PropagationCase {
  readonly module: string;
  readonly operation: string;
  /** The value of the operation's declared positional, when it takes one. */
  readonly positional?: string;
  readonly options?: Readonly<Record<string, unknown>>;
  /** An operation run first, with no marker, when the target must exist. */
  readonly prepare?: PropagationCase;
  readonly site: string;
}

const CASES: readonly PropagationCase[] = [
  { module: 'memory', operation: 'memoryAdd', options: { type: 'task', title: 'A probe' }, site: INDEX },
  { module: 'memory', operation: 'memorySubmit', positional: 'task-006-submit-me', site: TRANSITION },
  { module: 'memory', operation: 'memoryDeprecate', positional: 'task-004-deprecate-me', site: TRANSITION },
  { module: 'memory', operation: 'memoryPark', positional: 'task-005-park-me', options: { reason: 'r' }, site: TRANSITION },
  { module: 'dna', operation: 'dnaSet', positional: 'modules.core.path', options: { value: 'src/kernel' }, site: INDEX },
  { module: 'dna', operation: 'dnaAdd', positional: 'stacks.technologies', options: { value: 'Jest', 'entry-category': 'testing' }, site: INDEX },
  { module: 'dna', operation: 'dnaUpdate', positional: 'stacks.technologies.TypeScript', options: { 'entry-version': '5' }, site: INDEX },
  { module: 'dna', operation: 'dnaRemove', positional: 'stacks.technologies.TypeScript', site: INDEX },
  { module: 'directive', operation: 'directiveCreate', options: { name: 'lint-rules' }, site: INDEX },
  { module: 'directive', operation: 'directiveAssign', options: { directive: 'testing', role: 'approver' }, site: INDEX },
  {
    module: 'directive',
    operation: 'directiveRemove',
    positional: 'lint-rules',
    prepare: { module: 'directive', operation: 'directiveCreate', options: { name: 'lint-rules' }, site: INDEX },
    site: INDEX,
  },
  { module: 'workflow', operation: 'workflowStart', positional: 'report', site: START_END },
  { module: 'workflow', operation: 'workflowEnd', positional: 'report-1-plan', site: START_END },
  { module: 'workflow', operation: 'workflowCreate', positional: 'probe-flow', options: { kind: 'main' }, site: CREATE_REMOVE },
  {
    module: 'workflow',
    operation: 'workflowRemove',
    positional: 'probe-flow',
    prepare: { module: 'workflow', operation: 'workflowCreate', positional: 'probe-flow', options: { kind: 'main' }, site: CREATE_REMOVE },
    site: CREATE_REMOVE,
  },
  {
    module: 'workflow',
    operation: 'workflowAdopt',
    positional: 'adoptable-1-plan',
    options: { step: 'adoptable.seed', element: 'adr:adr-001-adopt-me', reason: 'r' },
    site: ADOPT,
  },
  { module: 'workflow', operation: 'workflowFinalize', positional: 'notes-1-plan', options: { reason: 'r' }, site: FINALIZE },
];

/** The four operations that are approver-gated in every form (`spec-018` §0, §3.1): no attribution half (§2.6). */
const ALWAYS_GATED = ['memoryApprove', 'memoryReject', 'memoryAmend', 'workflowRekey'];

/** Every registered `mutates: true` operation that takes the agent attribution, sorted (`spec-018` §2.1). */
function attributedOperations(): string[] {
  return enumerateOperations(CORE_MODULES)
    .map(({ operation }) => operation)
    .filter((operation) => operation.mutates && operation.agentAttribution !== false && !ALWAYS_GATED.includes(operation.name))
    .map((operation) => operation.name)
    .sort();
}

function operationOf(moduleName: string, operationName: string): CoreOperation {
  const found = enumerateOperations(CORE_MODULES).find(({ module, operation }) => module.name === moduleName && operation.name === operationName);
  if (found === undefined) throw new Error(`fixture bug: ${moduleName}.${operationName} is not in CORE_MODULES`);
  return found.operation;
}

/** Run one case's operation in process, inside `invocation`, as the CLI registrar would. */
async function call(root: string, propagation: PropagationCase, invocation: Record<string, unknown>): Promise<CoreResult<unknown>> {
  const operation = operationOf(propagation.module, propagation.operation);
  const args: Record<string, unknown> = { ...(propagation.options ?? {}) };
  if (propagation.positional !== undefined) {
    if (operation.positional === undefined) throw new Error(`fixture bug: ${operation.name} declares no positional`);
    args[operation.positional.name] = propagation.positional;
  }
  const mapped = toolArgumentsToParams(operation, args);
  if (!mapped.ok) throw new Error(`fixture bug: ${operation.name} arguments refused: ${mapped.reason}`);
  const params = buildCoreParams({ moduleName: propagation.module, operationName: propagation.operation, root, ...mapped.context });
  return (await withAgentInvocation(invocation as never, () => operation.fn(params))) as CoreResult<unknown>;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** The lines holding `resolveOperationAgentContext(` per file of `src/`, its own module excepted (the design's grep). */
function callSitesPerFile(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const path of sourceFiles(join(REPO_ROOT, 'src'))) {
    const file = relative(REPO_ROOT, path).split('\\').join('/');
    if (file === 'src/core/agent-context.ts') continue;
    const hits = readFileSync(path, 'utf-8')
      .split('\n')
      .filter((line) => line.includes('resolveOperationAgentContext(')).length;
    if (hits > 0) counts[file] = hits;
  }
  return counts;
}

describe('task-367 AC 8 — the parity of the propagation cases (bug-538, D9)', () => {
  it('the case list is the registry: every mutating operation but agentAttribution: false and the four always-gated', () => {
    expect(CASES.map((propagation) => propagation.operation).sort()).toEqual(attributedOperations());
  });

  it('the call sites of resolveOperationAgentContext( per file are the 12 the design recorded, in six files', () => {
    expect(callSitesPerFile()).toEqual(RECORDED_SITES);
  });

  it('every file holding a call site is named by at least as many cases as it holds sites', () => {
    for (const [file, sites] of Object.entries(callSitesPerFile())) {
      expect({ file, cases: CASES.filter((propagation) => propagation.site === file).length >= sites }).toEqual({ file, cases: true });
    }
  });
});

describe('task-367 AC 8 — each attributed operation, in process, refuses an unknown --co-author (spec-018 §2.5, bug-538)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  it.each(CASES.map((propagation) => [`${propagation.module}.${propagation.operation}`, propagation] as const))(
    '%s inside withAgentInvocation({ env: {}, coAuthor: Nobody }): ok false, the §2.5 message, nothing persisted',
    async (_label, propagation) => {
      const root = buildAttributionRepo();
      roots.push(root);
      if (propagation.prepare !== undefined) {
        const prepared = await call(root, propagation.prepare, { env: {} });
        expect(prepared.ok).toBe(true);
      }
      const unchanged = snapshotPersistence(root);

      const result = await call(root, propagation, { env: {}, coAuthor: 'Nobody' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe(REFUSAL);
      assertPersistenceUnchanged(root, unchanged, propagation.operation);
    },
    60_000,
  );
});
