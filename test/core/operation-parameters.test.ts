/**
 * task-364 AC 1 (characterization, `dl-040` option 1, `spec-006` §2): every operation of `CORE_MODULES` declares
 * its parameters once, in `CoreOperation.positional`, `.options` and `.flags` — the one declaration both
 * registrars derive from (the CLI's arguments and options, the MCP Tool's input schema, the Resource's URI).
 *
 * What these assertions verify, over the real registry (`enumerateOperations(CORE_MODULES)`), and no more:
 * - inside each operation, the names of its positional, its options and its flags, plus `dry-run` when it
 *   mutates (the parameter the registrars derive from `mutates`, `spec-008` §2), are pairwise distinct, so
 *   one name maps to one Tool property and one CLI parameter;
 * - no declaration of the operation's own is named `dry-run`, `co-author` or `ai-model` (the names the
 *   registrars derive from `mutates`, `spec-018` §1–§2);
 * - every declared name is spelled `^[a-z][a-z0-9_-]*$`, the CLI spelling a Tool property takes verbatim
 *   (`spec-004` §4.3, design D3).
 *
 * It does not assert that a declaration is complete against the operation's `fn`: no metadata says what an
 * `fn` reads.
 */
import { CORE_MODULES, DRY_RUN_FLAG } from '../../src/core';
import { enumerateOperations, type CoreOperation } from '../../src/core/registry';

/** The names an operation declares itself, in declaration order: its positional, its options, its flags. */
function declaredNames(operation: CoreOperation): string[] {
  return [
    ...(operation.positional ? [operation.positional.name] : []),
    ...(operation.options ?? []).map((option) => option.name),
    ...(operation.flags ?? []).map((flag) => flag.name),
  ];
}

const OPERATIONS = enumerateOperations(CORE_MODULES).map(({ module, operation }) => ({
  key: `${module.name}.${operation.name}`,
  operation,
}));

describe('task-364 AC 1 (characterization) — every CORE_MODULES operation declares its parameters once', () => {
  it('enumerates the registry (a non-empty set, so the checks below are not vacuous)', () => {
    expect(OPERATIONS.length).toBeGreaterThan(0);
    expect(OPERATIONS.some(({ operation }) => declaredNames(operation).length > 0)).toBe(true);
  });

  it('inside each operation, the positional, option and flag names, plus dry-run when it mutates, are pairwise distinct', () => {
    const repeats: string[] = [];
    for (const { key, operation } of OPERATIONS) {
      const names = [...declaredNames(operation), ...(operation.mutates ? [DRY_RUN_FLAG.name] : [])];
      const seen = new Set<string>();
      for (const name of names) {
        if (seen.has(name)) repeats.push(`${key}: ${name}`);
        seen.add(name);
      }
    }
    expect(repeats).toEqual([]);
  });

  it('no operation declares a parameter of its own named dry-run, co-author or ai-model', () => {
    const reserved = new Set(['dry-run', 'co-author', 'ai-model']);
    const clashes = OPERATIONS.flatMap(({ key, operation }) =>
      declaredNames(operation).filter((name) => reserved.has(name)).map((name) => `${key}: ${name}`),
    );
    expect(clashes).toEqual([]);
  });

  it('every declared name is spelled ^[a-z][a-z0-9_-]*$', () => {
    const misspelled = OPERATIONS.flatMap(({ key, operation }) =>
      declaredNames(operation).filter((name) => !/^[a-z][a-z0-9_-]*$/.test(name)).map((name) => `${key}: ${name}`),
    );
    expect(misspelled).toEqual([]);
  });
});
