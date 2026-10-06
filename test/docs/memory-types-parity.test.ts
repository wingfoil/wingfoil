/**
 * Memory-type parity (`task-187`, `dl-116` Q1 (A)): the Memory types and their state machines that
 * `spec-001-memory-yaml-schema` and `spec-004-mcp-surface-contract` enumerate, against the
 * `memory.yaml` the CLI loads (`loadMemoryYaml`, so the code side is what WingFoil itself reads).
 *
 * The enumerations compared, both directions:
 *
 * - `spec-001 types` — the type keys of the "Worked examples — every current type" YAML block;
 * - `spec-001 states` — each machine of that block (`defaults` and every type) flattened into one fact
 *   per declared item (`stateFacts`: the sequence, each gate's reject target, each `waiting` state,
 *   each `returns` edge and `limits` entry), so a difference names the one fact that differs;
 * - `spec-004 §2.1 types` — the type list the `{type}` URI parameter enumerates.
 *
 * The agent guide's enumeration (`dl-116` names it) is left to `align-agent-docs` (`dl-025`). Warn
 * mode for v0.3: see `enumeration-parity.allowlist.ts`. Deterministic: both sides are sorted sets.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadMemoryYaml } from '../../src/core/loaders';
import {
  type ParityFinding,
  type StatesBlock,
  backticked,
  compareEnumeration,
  fencedBlocks,
  markdownSection,
  parityKey,
  parseYaml,
  stateFacts,
} from './support/enumeration-parity';
import { expectAllowlisted } from './support/parity-gate';

const repoRoot = join(__dirname, '..', '..');
const SPEC_001 = 'docs/04_memory/design/specs/spec-001-memory-yaml-schema.md';
const SPEC_004 = 'docs/04_memory/design/specs/spec-004-mcp-surface-contract.md';
const FIXTURE = join(__dirname, 'fixtures', 'enumeration-parity', 'memory-types-drift.md');

const ENUMERATIONS = ['spec-001 types', 'spec-001 states', 'spec-004 §2.1 types'] as const;

/** The part of a `memory.yaml`-shaped document this gate compares. */
interface MachinesDocument {
  readonly defaults?: { readonly states?: StatesBlock };
  readonly types?: Readonly<Record<string, { readonly states?: StatesBlock }>>;
}

/** Type names, and every state fact of `defaults` and each type, sorted. */
function machines(config: MachinesDocument): { types: string[]; facts: string[] } {
  const types = Object.keys(config.types ?? {}).sort();
  const facts = [
    ...(config.defaults ? stateFacts('defaults', config.defaults.states) : []),
    ...types.flatMap((type) => (config.types?.[type]?.states === undefined ? [] : stateFacts(type, config.types[type]?.states))),
  ];
  return { types, facts: facts.sort() };
}

/** Every finding of the two documents against `config`. */
export function memoryTypeFindings(
  config: MachinesDocument,
  spec001: { path: string; text: string },
  spec004: { path: string; text: string },
): ParityFinding[] {
  const examples = markdownSection(spec001.text, /^### Worked examples/);
  const [block] = fencedBlocks(examples, 'yaml');
  if (block === undefined) throw new Error(`${spec001.path}: no yaml block under "Worked examples"`);
  const documented = machines(parseYaml(block, spec001.path) as MachinesDocument);
  const shipped = machines(config);

  const uriScheme = markdownSection(spec004.text, /^#### 2\.1 /);
  const typeList = /`\{type\}` is any type key[^(]*\(([^)]*)\)/.exec(uriScheme)?.[1];
  if (typeList === undefined) throw new Error(`${spec004.path}: no {type} list in §2.1`);
  const listed = backticked(typeList.replace(/\s+/g, ' ')).flatMap((span) => span.split(',')).map((name) => name.trim()).filter((name) => name !== '');

  return [
    ...compareEnumeration('spec-001 types', spec001.path, documented.types, shipped.types),
    ...compareEnumeration('spec-001 states', spec001.path, documented.facts, shipped.facts),
    ...compareEnumeration('spec-004 §2.1 types', spec004.path, listed, shipped.types),
  ];
}

describe('Memory-type parity — the engine, on a fixture', () => {
  it('flattens a machine into one fact per declared item', () => {
    expect(
      stateFacts('task', {
        sequence: ['draft', 'pending', 'done'],
        gates: { pending: { reject: 'draft' } },
        waiting: ['done'],
        returns: { pending: 'draft' },
        limits: { pending: 3 },
      }),
    ).toEqual([
      'task: gate pending reject draft',
      'task: limit pending 3',
      'task: returns pending > draft',
      'task: sequence draft > pending > done',
      'task: waiting done',
    ]);
  });

  it('reports every drift of a drifted copy: a type, a state, a gate, a waiting state, a returns edge', () => {
    const text = readFileSync(FIXTURE, 'utf8');
    const config: MachinesDocument = {
      defaults: { states: { sequence: ['draft', 'pending', 'approved'], gates: { pending: { reject: 'draft' } } } },
      types: {
        task: {
          states: {
            sequence: ['draft', 'backlog', 'in-progress', 'done'],
            gates: { backlog: { reject: 'draft' } },
            waiting: ['in-progress'],
            returns: { 'in-progress': 'backlog' },
          },
        },
        bug: { states: { sequence: ['draft', 'open', 'closed'] } },
      },
    };
    const findings = memoryTypeFindings(config, { path: 'spec-001.md', text }, { path: 'spec-004.md', text });
    expect(findings.map(parityKey).sort()).toEqual([
      'spec-001 states|spec-001.md|missing|bug: sequence draft > open > closed',
      'spec-001 states|spec-001.md|missing|task: returns in-progress > backlog',
      'spec-001 states|spec-001.md|missing|task: sequence draft > backlog > in-progress > done',
      'spec-001 states|spec-001.md|missing|task: waiting in-progress',
      'spec-001 states|spec-001.md|surplus|adr: sequence draft > accepted',
      'spec-001 states|spec-001.md|surplus|task: sequence draft > backlog > done',
      'spec-001 states|spec-001.md|surplus|task: waiting done',
      'spec-001 types|spec-001.md|missing|bug',
      'spec-001 types|spec-001.md|surplus|adr',
      'spec-004 §2.1 types|spec-004.md|missing|bug',
      'spec-004 §2.1 types|spec-004.md|surplus|rfc',
    ]);
  });
});

describe('Memory-type parity — spec-001 and spec-004 in the repository', () => {
  it('reads a non-empty code side', () => {
    const shipped = machines(loadMemoryYaml(repoRoot) as MachinesDocument);
    expect(shipped.types).toEqual(expect.arrayContaining(['bug', 'task']));
    expect(shipped.facts.length).toBeGreaterThan(shipped.types.length);
  });

  it('lists every difference in the allowlist', () => {
    const findings = memoryTypeFindings(
      loadMemoryYaml(repoRoot) as MachinesDocument,
      { path: SPEC_001, text: readFileSync(join(repoRoot, SPEC_001), 'utf8') },
      { path: SPEC_004, text: readFileSync(join(repoRoot, SPEC_004), 'utf8') },
    );
    expectAllowlisted('Memory-type parity', findings, ENUMERATIONS);
  });
});
