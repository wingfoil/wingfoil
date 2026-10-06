/**
 * MCP-surface parity (`task-187`, `dl-116` Q1 (A)): the Resources and Tools
 * `spec-004-mcp-surface-contract` enumerates, against what the MCP server registers.
 *
 * The code side is what a client sees over the SDK, not source text: the production server
 * (`createMcpServer`, the server `wingfoil mcp` starts, `spec-014` §3) is connected over the in-memory
 * transport and asked `resources/list`, `resources/templates/list` and `tools/list`. Its Tools channel
 * is empty until P5.2.3 (v0.4), so §4.1's Tools are also compared with the Tools `registerCoreModules`
 * derives from `CORE_MODULES` — the registrar the server adds when Tools ship, and the set §4.2's
 * bijection (`{ CLI state-mutating verbs } ≡ { MCP Tools }`) is about.
 *
 * The enumerations compared, both directions:
 *
 * - `spec-004 §2.1 resources` — the URI-scheme block, against the URIs and URI templates registered;
 * - `spec-004 §4.1 tools` — the Tool names of the naming-convention block, against `tools/list`;
 * - `spec-004 §4.1 tools vs CORE_MODULES` — the same names, against `registerCoreModules`' Tools.
 *
 * Prompts (§3.1) are not compared: their names derive from the DNA role set at start. Warn mode for
 * v0.3: see `enumeration-parity.allowlist.ts`. Deterministic: sorted sets.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { CORE_MODULES } from '../../src/core';
import { createMcpServer } from '../../src/mcp';
import { connectCoreModuleSurface } from '../mcp/helpers/channel-enumeration';
import { type ParityFinding, compareEnumeration, fencedBlocks, markdownSection, parityKey } from './support/enumeration-parity';
import { expectAllowlisted } from './support/parity-gate';

const repoRoot = join(__dirname, '..', '..');
const SPEC_004 = 'docs/04_memory/design/specs/spec-004-mcp-surface-contract.md';
const FIXTURE = join(__dirname, 'fixtures', 'enumeration-parity', 'mcp-surface-drift.md');

const ENUMERATIONS = ['spec-004 §2.1 resources', 'spec-004 §4.1 tools', 'spec-004 §4.1 tools vs CORE_MODULES'] as const;

/** What the server side registers. */
interface McpSurface {
  readonly resources: readonly string[];
  readonly tools: readonly string[];
  readonly coreModuleTools: readonly string[];
}

/** List a connected client's Resources (URIs and URI templates) and Tools, sorted. */
async function listSurface(client: Client): Promise<{ resources: string[]; tools: string[] }> {
  const caps = client.getServerCapabilities();
  const uris = caps?.resources ? (await client.listResources()).resources.map((resource) => resource.uri) : [];
  const templates = caps?.resources ? (await client.listResourceTemplates()).resourceTemplates.map((template) => template.uriTemplate) : [];
  const tools = caps?.tools ? (await client.listTools()).tools.map((tool) => tool.name) : [];
  return { resources: [...uris, ...templates].sort(), tools: tools.sort() };
}

/** Every finding of `spec004` against `surface`. */
export function mcpFindings(surface: McpSurface, spec004: { path: string; text: string }): ParityFinding[] {
  const [uriBlock] = fencedBlocks(markdownSection(spec004.text, /^#### 2\.1 /), '');
  const [toolBlock] = fencedBlocks(markdownSection(spec004.text, /^#### 4\.1 /), '');
  if (uriBlock === undefined || toolBlock === undefined) throw new Error(`${spec004.path}: no URI block in §2.1 or no Tool block in §4.1`);
  const uris = uriBlock
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line !== '');
  const tools = [...toolBlock.matchAll(/^wingfoil [^→\n]*→\s*(\S+)/gm)].map(([, name]) => name ?? '');
  return [
    ...compareEnumeration('spec-004 §2.1 resources', spec004.path, uris, surface.resources),
    ...compareEnumeration('spec-004 §4.1 tools', spec004.path, tools, surface.tools),
    ...compareEnumeration('spec-004 §4.1 tools vs CORE_MODULES', spec004.path, tools, surface.coreModuleTools),
  ];
}

let surface: McpSurface;

beforeAll(async () => {
  const server = createMcpServer({ resolveRoot: () => repoRoot, roles: ['developer'] });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-parity', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const production = await listSurface(client);
  await client.close();

  const core = await connectCoreModuleSurface(CORE_MODULES, { resolveRoot: () => repoRoot });
  const derived = await listSurface(core.client);
  await core.client.close();

  surface = { resources: production.resources, tools: production.tools, coreModuleTools: derived.tools };
});

describe('MCP-surface parity — the engine, on a fixture', () => {
  it('reads the server side: the registered Resources, the empty production Tools channel, the derived Tools', () => {
    expect(surface.resources).toEqual(expect.arrayContaining(['wingfoil://dna', 'wingfoil://memory/{type}/{id}']));
    expect(surface.tools).toEqual([]);
    expect(surface.coreModuleTools).toEqual(expect.arrayContaining(['memory.add', 'memory.approve']));
  });

  it('reports every drift of a drifted copy, in each enumeration, both directions', () => {
    const fixtureSurface: McpSurface = {
      resources: ['wingfoil://dna', 'wingfoil://workflows'],
      tools: ['memory.add'],
      coreModuleTools: ['memory.add', 'memory.submit'],
    };
    const findings = mcpFindings(fixtureSurface, { path: 'fixture.md', text: readFileSync(FIXTURE, 'utf8') });
    expect(findings.map(parityKey).sort()).toEqual([
      'spec-004 §2.1 resources|fixture.md|missing|wingfoil://workflows',
      'spec-004 §2.1 resources|fixture.md|surplus|wingfoil://teleport',
      'spec-004 §4.1 tools vs CORE_MODULES|fixture.md|missing|memory.submit',
      'spec-004 §4.1 tools vs CORE_MODULES|fixture.md|surplus|memory.teleport',
      'spec-004 §4.1 tools|fixture.md|surplus|memory.teleport',
    ]);
  });
});

describe('MCP-surface parity — spec-004 in the repository', () => {
  it('lists every difference in the allowlist', () => {
    const findings = mcpFindings(surface, { path: SPEC_004, text: readFileSync(join(repoRoot, SPEC_004), 'utf8') });
    expectAllowlisted('MCP-surface parity', findings, ENUMERATIONS);
  });
});
