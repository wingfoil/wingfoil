/**
 * The `CoreModule` registry mechanism (spec-006-core-domain-api §2, §4-5, task-006). Pure,
 * dependency-free unit tests for: the `CoreResult` success/failure constructors, the deterministic
 * (REQ-SYS-07) operation enumerator, the mechanical camelCase-name -> CLI-verb/MCP-verb derivation
 * (spec-006 §5), and the generic parity-diff helper the AC's "0 unmatched operations" assertion is
 * built on (spec-006 §4.3 — a regression guard against a registrar silently dropping an operation).
 */
import { coreErr, coreOk } from '../../src/core/types';
import {
  commandUsage,
  computeParityDiff,
  deriveVerb,
  enumerateOperations,
  extraOperandsReason,
  missingOperandReason,
  type CoreModule,
} from '../../src/core/registry';

describe('coreOk / coreErr', () => {
  it('coreOk wraps a value with ok: true and no commit by default', () => {
    expect(coreOk({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
  });

  it('coreOk carries an optional commit', () => {
    expect(coreOk('v', { sha: 'abc', message: 'wf(x): y' })).toEqual({
      ok: true,
      value: 'v',
      commit: { sha: 'abc', message: 'wf(x): y' },
    });
  });

  it('coreErr wraps a CoreError with ok: false', () => {
    expect(coreErr({ code: 'NOT_FOUND', message: 'nope' })).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'nope' },
    });
  });
});

describe('deriveVerb — mechanical {module}{Verb} camelCase -> verb derivation (spec-006 §5)', () => {
  it('strips the module-name prefix and lowercases the leading letter', () => {
    expect(deriveVerb('dna', 'dnaShow')).toBe('show');
    expect(deriveVerb('memory', 'memoryApprove')).toBe('approve');
    expect(deriveVerb('directives', 'directivesList')).toBe('list');
  });

  it('kebab-cases a multi-word verb suffix', () => {
    expect(deriveVerb('workflow', 'workflowSetTeam')).toBe('set-team');
  });

  it('falls back to the full (kebab-cased) operation name when it does not start with the module name', () => {
    expect(deriveVerb('dna', 'projectInit')).toBe('project-init');
  });

  it('returns the empty string for a "self-named" operation (module name === operation name) — the flat/no-verb command form (spec-008-cli-grammar §1, e.g. `paths`)', () => {
    expect(deriveVerb('paths', 'paths')).toBe('');
  });
});

describe('enumerateOperations — deterministic, sorted flattening (REQ-SYS-07)', () => {
  const fixture: CoreModule[] = [
    {
      name: 'zeta',
      operations: {
        zetaB: { name: 'zetaB', mutates: false, fn: async () => coreOk(null) },
        zetaA: { name: 'zetaA', mutates: true, fn: async () => coreOk(null) },
      },
    },
    {
      name: 'alpha',
      operations: {
        alphaOnly: { name: 'alphaOnly', mutates: false, fn: async () => coreOk(null) },
      },
    },
  ];

  it('sorts modules by name and operations by name within each module', () => {
    const flat = enumerateOperations(fixture);
    expect(flat.map((entry) => `${entry.module.name}.${entry.operation.name}`)).toEqual([
      'alpha.alphaOnly',
      'zeta.zetaA',
      'zeta.zetaB',
    ]);
  });

  it('is stable across repeated calls given the same input (no reliance on unordered iteration)', () => {
    const first = enumerateOperations(fixture).map((e) => e.operation.name);
    const second = enumerateOperations(fixture).map((e) => e.operation.name);
    expect(second).toEqual(first);
  });
});

describe('computeParityDiff — the REQ-SYS-05 fit-criterion primitive', () => {
  it('reports no diff when both sides match exactly', () => {
    expect(computeParityDiff(['memory approve', 'dna set'], ['memory approve', 'dna set'])).toEqual({
      onlyInA: [],
      onlyInB: [],
    });
  });

  it('flags an entry present in A (CLI) but missing from B (Tools) — a registrar bypass on the MCP side', () => {
    expect(computeParityDiff(['memory approve', 'dna set'], ['memory approve'])).toEqual({
      onlyInA: ['dna set'],
      onlyInB: [],
    });
  });

  it('flags an entry present in B (Tools) but missing from A (CLI) — a registrar bypass on the CLI side', () => {
    expect(computeParityDiff(['memory approve'], ['memory approve', 'dna set'])).toEqual({
      onlyInA: [],
      onlyInB: ['dna set'],
    });
  });

  it('the reported diffs are themselves sorted, independent of input order', () => {
    expect(computeParityDiff(['b', 'a'], [])).toEqual({ onlyInA: ['a', 'b'], onlyInB: [] });
  });
});

describe('the operand refusals (task-179, bug-168, bug-180)', () => {
  it('missingOperandReason names the placeholder --help shows', () => {
    expect(missingOperandReason('id')).toBe('missing required argument: <id>');
  });

  it('commandUsage lists the positional, then only the REQUIRED options with their placeholders', () => {
    expect(
      commandUsage('memory approve', {
        positional: { name: 'id', required: true, description: 'd' },
        options: [
          { name: 'reason', required: true, valueName: 'text' },
          { name: 'note', valueName: 'text' },
          { name: 'value', required: true },
        ],
      }),
    ).toBe('wingfoil memory approve <id> --reason <text> --value <value>');
  });

  it('commandUsage brackets an optional positional, and a command with neither is its name alone', () => {
    expect(commandUsage('paths', { positional: { name: 'category', description: 'c' } })).toBe('wingfoil paths [category]');
    expect(commandUsage('workflow list', {})).toBe('wingfoil workflow list');
  });

  it('extraOperandsReason appends a declared surplus hint after what the command takes', () => {
    expect(extraOperandsReason('dna set', 'path', 2, 'the value travels in --value')).toBe(
      'wingfoil dna set takes one positional <path>; the value travels in --value (got 2 positionals)',
    );
  });
});
