/**
 * The shape of the enumeration-parity allowlist (`task-187`): every entry has a reason, the list is
 * sorted by key and lists a key once, and a `planned` entry — and only a `planned` entry — cites the
 * tasks expected to resolve it. Each gate applies the entries of its own enumerations (`parity-gate.ts`).
 */
import { PARITY_ALLOWLIST, PLANNED, UNTRIAGED } from './enumeration-parity.allowlist';
import { parityKey } from './support/enumeration-parity';

describe('enumeration-parity allowlist', () => {
  const keys = PARITY_ALLOWLIST.map(parityKey);

  it('gives every entry a reason, in sorted order, once', () => {
    expect(PARITY_ALLOWLIST.filter((entry) => entry.reason.trim() === '').map(parityKey)).toEqual([]);
    expect(keys).toEqual([...keys].sort());
    expect(keys.filter((key, position) => keys.indexOf(key) !== position)).toEqual([]);
  });

  it('has a planned entry cite at least one task, and no other entry cite any', () => {
    expect(PARITY_ALLOWLIST.filter((entry) => (entry.reason === PLANNED) !== (entry.plannedBy?.length ?? 0) > 0).map(parityKey)).toEqual([]);
  });

  it('never grows the untriaged backlog past the first run (10 entries): a new entry carries its own reason', () => {
    expect(PARITY_ALLOWLIST.filter((entry) => entry.reason === UNTRIAGED).length).toBeLessThanOrEqual(10);
  });
});
