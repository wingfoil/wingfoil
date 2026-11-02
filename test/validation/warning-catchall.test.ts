/**
 * task-312 AC 3 (`bug-316`), the rule inside `emitUnknownFieldWarning` (`src/validation/warning.ts`) — as the
 * design gate ruled it on 2026-10-30 (D3 (A)): a key absent from an object schema's `shape` is unknown only
 * when the schema has no catchall or a passthrough one. A typed catchall (`.catchall(z.array(z.string()))`,
 * what `Paths` takes) declares every extra key, and validates it, so it raises no warning. The passthrough
 * cases of `test/validation/warning.test.ts` stay as they are; the nested case below is the shape `dna.yaml`
 * has (`paths:` under a passthrough root).
 */
import { z } from 'zod';

import { emitUnknownFieldWarning, withWarningSink } from '../../src/validation/warning';

function warningsOf(raw: Record<string, unknown>, schema: Parameters<typeof emitUnknownFieldWarning>[1]): string[] {
  const warnings: string[] = [];
  withWarningSink((text) => warnings.push(text), () => emitUnknownFieldWarning(raw, schema, 'cfg.yaml'));
  return warnings;
}

describe('task-312 AC 3 — a typed catchall makes its extra keys known (D3 (A), red-first)', () => {
  it('a key covered by a typed catchall raises no warning', () => {
    const schema = z.object({ known: z.string() }).catchall(z.array(z.string()));
    expect(warningsOf({ known: 'x', extra: ['y'] }, schema)).toEqual([]);
  });

  it('a nested typed-catchall block under a passthrough root raises no warning for its extra keys', () => {
    const block = z.object({ known: z.array(z.string()).optional() }).catchall(z.array(z.string()));
    const schema = z.object({ block }).passthrough();
    expect(warningsOf({ block: { known: ['a'], extra: ['y'] } }, schema)).toEqual([]);
  });
});

describe('task-312 AC 3 — passthrough schemas still warn beside a typed catchall (characterization)', () => {
  it('an unknown key of the passthrough root still warns while the nested catchall extra does not count', () => {
    const block = z.object({ known: z.array(z.string()).optional() }).catchall(z.array(z.string()));
    const schema = z.object({ block }).passthrough();
    const warnings = warningsOf({ block: { known: ['a'] }, mystery: 1 }, schema);
    expect(warnings).toEqual(['cfg.yaml: unknown field(s) ignored: mystery']);
  });
});
