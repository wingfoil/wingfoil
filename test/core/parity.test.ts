/**
 * THE REQ-SYS-05 parity test (task-006's Acceptance Criteria, verbatim fit criterion): "Every
 * state-mutating operation available in the CLI is reachable via an MCP tool and vice versa; an
 * automated parity test enumerates both surfaces and reports 0 unmatched operations."
 *
 * This builds the REAL `src/cli` Commander program and the REAL `src/mcp` McpServer from a
 * `CoreModule[]` registry via the actual registrar functions (not a hand-maintained duplicate
 * list), enumerates what each surface *actually* registered (Commander's own `.commands` tree; the
 * MCP SDK's own `tools/list` over a real connected `Client`), and diffs them. Per spec-006 §4.3,
 * this is a *regression guard* — parity holds structurally because both registrars iterate the same
 * `CoreModule[]` array (§4.1-4.2) — so this test's real job is catching a future registrar bypassing
 * that array, not manufacturing parity itself.
 *
 * Two registries are exercised:
 *  1. A fixture registry with a representative mix of mutating + read-only operations across two
 *     modules — meaningful coverage of the mechanism (a production registry with zero mutating ops,
 *     see below, would make this assertion vacuously true on its own).
 *  2. The real production `CORE_MODULES` (`src/core/index.ts`) — the actual regression guard that
 *     will start catching real drift once task-018+ registers real mutating operations; today it
 *     legitimately reports 0 mutating ops on both surfaces (see task-006 Execution Notes / scope).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { buildCliCommands, listRegisteredCliCommands } from '../../src/cli/registrar';
import { CORE_MODULES } from '../../src/core';
import { computeParityDiff, deriveVerb, type CoreModule } from '../../src/core/registry';
import { coreErr, coreOk } from '../../src/core/types';
import { registerCoreModules } from '../../src/mcp/registrar';

const FIXTURE_MODULES: CoreModule[] = [
  {
    name: 'dna',
    operations: {
      dnaShow: { name: 'dnaShow', mutates: false, fn: async () => coreOk(null) },
      dnaSet: { name: 'dnaSet', mutates: true, fn: async () => coreOk(null) },
    },
  },
  {
    name: 'memory',
    operations: {
      memorySearch: { name: 'memorySearch', mutates: false, fn: async () => coreOk(null) },
      memoryApprove: { name: 'memoryApprove', mutates: true, fn: async () => coreOk(null) },
      memoryReject: { name: 'memoryReject', mutates: true, fn: async () => coreErr({ code: 'IO', message: 'x' }) },
    },
  },
];

/** `"{noun} {verb}"` for every operation declared `mutates: true` in `modules` (ground truth, from the registry itself). */
function expectedMutatingCliKeys(modules: readonly CoreModule[]): string[] {
  const keys: string[] = [];
  for (const module of modules) {
    for (const operation of Object.values(module.operations)) {
      if (operation.mutates) keys.push(`${module.name} ${deriveVerb(module.name, operation.name)}`);
    }
  }
  return keys.sort();
}

/** Every mutating `wingfoil <noun> <verb>` command the REAL CLI adapter actually derived for `modules`. */
function actualMutatingCliCommands(modules: readonly CoreModule[]): string[] {
  const commands = buildCliCommands(modules as CoreModule[], {
    resolveRoot: () => '/fixture-root',
    buildParams: () => ({}),
  });
  const registered = new Set(listRegisteredCliCommands(commands));
  return expectedMutatingCliKeys(modules).filter((key) => registered.has(key));
}

/** Whether `modules` declares at least one `mutates: true` operation (ground truth, from the registry). */
function hasAnyMutatingOperation(modules: readonly CoreModule[]): boolean {
  return modules.some((module) => Object.values(module.operations).some((operation) => operation.mutates));
}

/**
 * The actual Tool names an MCP client sees for `modules`, converted to the CLI's `noun verb` form
 * (spec-004 §4.1: `.` <-> ` `). The MCP SDK only installs a `tools/list` request handler the first
 * time a Tool is registered (`McpServer`'s lazy `setToolRequestHandlers`) — with zero mutating
 * operations, `tools/list` is a protocol-level "Method not found", not an empty list, so that case
 * short-circuits to `[]` without making the call (structurally equivalent: 0 Tools registered).
 */
async function actualMcpToolsAsCliForm(modules: readonly CoreModule[]): Promise<string[]> {
  if (!hasAnyMutatingOperation(modules)) return [];
  const server = new McpServer({ name: 'parity-test', version: '0.0.0' });
  registerCoreModules(server, modules as CoreModule[], { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'parity-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  return tools.map((tool) => tool.name.replace('.', ' '));
}

describe('REQ-SYS-05 parity — fixture registry (representative mutating + read-only mix)', () => {
  it('every mutating CLI command that should exist is actually registered by the real CLI adapter', () => {
    const expected = expectedMutatingCliKeys(FIXTURE_MODULES);
    expect(actualMutatingCliCommands(FIXTURE_MODULES).sort()).toEqual(expected);
    expect(expected).toEqual(['dna set', 'memory approve', 'memory reject']);
  });

  it('every mutating CLI command has a matching Tool and vice versa (0 unmatched both ways)', async () => {
    const cli = actualMutatingCliCommands(FIXTURE_MODULES).sort();
    const tools = (await actualMcpToolsAsCliForm(FIXTURE_MODULES)).sort();

    expect(tools).toEqual(['dna set', 'memory approve', 'memory reject']);
    expect(computeParityDiff(cli, tools)).toEqual({ onlyInA: [], onlyInB: [] });
  });

  it('read-only operations never appear as a Tool, and the CLI still exposes them (mutates does not gate the CLI)', async () => {
    const commands = buildCliCommands(FIXTURE_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    expect(listRegisteredCliCommands(commands)).toEqual(
      expect.arrayContaining(['dna show', 'memory search']),
    );
    const toolsAsCliForm = await actualMcpToolsAsCliForm(FIXTURE_MODULES);
    expect(toolsAsCliForm).not.toContain('dna show');
    expect(toolsAsCliForm).not.toContain('memory search');
  });

  it('a registrar bypass (a mutating op dropped by one of the two registrars) is caught by the diff', () => {
    // Simulates the regression spec-006 §4.3 says this test guards against: one operation present
    // in the CLI's enumeration but absent from the Tools enumeration (or vice versa).
    const cliSide = ['dna set', 'memory approve', 'memory reject'];
    const toolsSideMissingOne = ['dna set', 'memory approve']; // "memory reject" dropped by a buggy registrar
    expect(computeParityDiff(cliSide, toolsSideMissingOne)).toEqual({
      onlyInA: ['memory reject'],
      onlyInB: [],
    });
  });
});

describe('REQ-SYS-05 parity — production registry (src/core/index.ts CORE_MODULES)', () => {
  it('reports 0 unmatched operations — the fourteen mutating ops (incl. `dna add|remove|update`, task-093, `memory amend`, task-127, and `memory park`, task-180) are on BOTH surfaces (task-051/050/052/025/093/020/046/048/047/045/127/180)', async () => {
    const cli = actualMutatingCliCommands(CORE_MODULES).sort();
    const tools = (await actualMcpToolsAsCliForm(CORE_MODULES)).sort();

    // task-025-implement-dna-set + task-020-implement-memory-add + task-050-directive-create make
    // this a LIVE parity guard (not vacuously-empty): each mutating op must be reachable as a CLI
    // command AND an MCP Tool, 0 unmatched.
    // task-051-directive-assign adds `directive assign` (P3.2); task-045-memory-submit adds
    // `memory submit` (P1.6); task-046-memory-approve adds `memory approve` (P1.7);
    // task-047-memory-reject adds `memory reject` (P1.8); task-048-memory-deprecate adds
    // `memory deprecate` (P1.9); task-052-directive-remove adds `directive remove` (P3.3).
    // task-093-dna-mutation-surface-add-remove-update adds `dna add|remove|update`: `dl-081`'s
    // ratification chose option (E) precisely because spec-006 §3's one-Tool-per-function rule makes
    // this three Tools rather than the dozen a per-collection verb set would have cost.
    // task-127 adds `memory amend` (`dl-108`), the approver-gated amendment verb; task-180 adds
    // `memory park` (`dl-110`), the verb that takes a declared `returns` edge.
    const expected = [
      'directive assign',
      'directive create',
      'directive remove',
      'dna add',
      'dna remove',
      'dna set',
      'dna update',
      'memory add',
      'memory amend',
      'memory approve',
      'memory deprecate',
      'memory park',
      'memory reject',
      'memory submit',
    ];
    expect(cli).toEqual(expected);
    expect(tools).toEqual(expected);
    expect(computeParityDiff(cli, tools)).toEqual({ onlyInA: [], onlyInB: [] });
  });

  it('the read-only production operations are Resources, the fourteen mutating ops (incl. `dna.add`, `dna.remove`, `dna.update`, `memory.amend`, `memory.park`) are Tools, never both', async () => {
    const server = new McpServer({ name: 'parity-test-prod', version: '0.0.0' });
    registerCoreModules(server, CORE_MODULES as CoreModule[], {
      resolveRoot: () => '/fixture-root',
      buildParams: () => ({}),
    });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'parity-test-prod-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([
      'wingfoil://directives/list',
      'wingfoil://dna/show',
      // task-049-memory-history's `memory.memoryHistory` is `mutates: false`, so the mechanical
      // registrar derives a Resource for it, exactly as it did for `memory.memorySearch`.
      'wingfoil://memory/history',
      'wingfoil://memory/search',
      'wingfoil://paths',
      'wingfoil://workflow/list',
    ]);
    // `directive.directiveAssign`, `directive.directiveCreate`, `directive.directiveRemove`,
    // `dna.dnaSet`, `memory.memoryAdd`, `memory.memoryApprove`, `memory.memoryDeprecate`,
    // `memory.memoryReject` + `memory.memorySubmit` are `mutates: true` → registered ONLY as Tools
    // (never Resources), so they do NOT appear above; they are the Tools the surface now advertises.
    expect(hasAnyMutatingOperation(CORE_MODULES)).toBe(true);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'directive.assign',
      'directive.create',
      'directive.remove',
      'dna.add',
      'dna.remove',
      'dna.set',
      'dna.update',
      'memory.add',
      'memory.amend',
      'memory.approve',
      'memory.deprecate',
      'memory.park',
      'memory.reject',
      'memory.submit',
    ]);
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://directive/assign');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://directive/remove');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://memory/approve');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://memory/deprecate');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://memory/reject');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://memory/submit');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://memory/approve');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://directive/create');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://dna/set');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://memory/add');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://memory/amend');
    expect(resources.map((r) => r.uri)).not.toContain('wingfoil://memory/park');
  });
});
