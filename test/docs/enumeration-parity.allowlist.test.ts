/**
 * The shape of the enumeration-parity allowlist (`task-187`): every entry has a reason, the list is
 * sorted by key and lists a key once, and a `planned` entry — and only a `planned` entry — cites the
 * tasks expected to resolve it. Each gate applies the entries of its own enumerations (`parity-gate.ts`).
 */
import { PARITY_ALLOWLIST, PLANNED, UNTRIAGED } from './enumeration-parity.allowlist';
import { parityKey } from './support/enumeration-parity';

/** The first run's untriaged findings (base `1abafadd`): the only keys `UNTRIAGED` may ever carry. */
const FIRST_RUN_UNTRIAGED: readonly string[] = [
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|directive.assign',
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|directive.create',
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|directive.remove',
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|dna.add',
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|dna.remove',
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|dna.set',
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|dna.update',
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|memory.amend',
  'spec-004 §4.1 tools vs CORE_MODULES|docs/04_memory/design/specs/spec-004-mcp-surface-contract.md|missing|memory.park',
  'spec-005 Context nouns|docs/04_memory/design/specs/spec-005-cli-command-contract.md|missing|directives',
];

describe('enumeration-parity allowlist', () => {
  const keys = PARITY_ALLOWLIST.map(parityKey);

  it('gives every entry a reason, in sorted order, once', () => {
    expect(PARITY_ALLOWLIST.filter((entry) => entry.reason.trim() === '').map(parityKey)).toEqual([]);
    expect(keys).toEqual([...keys].sort());
    expect(keys.filter((key, position) => keys.indexOf(key) !== position)).toEqual([]);
  });

  it('has a planned entry cite at least one task, and no other entry cite any', () => {
    const planned = (reason: string): boolean => reason === PLANNED || reason.startsWith('planned: ');
    expect(PARITY_ALLOWLIST.filter((entry) => planned(entry.reason) !== (entry.plannedBy?.length ?? 0) > 0).map(parityKey)).toEqual([]);
  });

  // Review fix F4: the untriaged backlog is the first run's, key by key. Fixing one entry removes it
  // from both lists; it does not free a slot for a new untriaged entry.
  it('marks UNTRIAGED only first-run findings (task-187), never a new entry', () => {
    const untriaged = PARITY_ALLOWLIST.filter((entry) => entry.reason === UNTRIAGED).map(parityKey);
    expect(untriaged.filter((key) => !FIRST_RUN_UNTRIAGED.includes(key))).toEqual([]);
  });
});
