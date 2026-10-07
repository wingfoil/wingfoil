/**
 * task-198 AC 5 (grep half) — the `determinism` directive and `spec-017` §1.3: no wall-clock value and
 * no random value enters workflow state deduction. Every source file of `src/workflow/` and the
 * deduction's `src/core` reader is scanned for the calls that would bring one in.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');

/** The deduction's sources: every `src/workflow/*.ts`, plus the `HEAD` snapshot reader in `src/core`. */
function deductionSources(): string[] {
  const workflow = readdirSync(join(ROOT, 'src/workflow'))
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => `src/workflow/${name}`);
  return [...workflow, 'src/core/workflow-deduction.ts'];
}

const FORBIDDEN = /\bDate\.now\s*\(|\bnew Date\s*\(|\bMath\.random\s*\(|\bperformance\.now\s*\(|\bprocess\.hrtime\b|\bcrypto\.random|\brandomUUID\s*\(/;

describe('task-198 AC 5 — no clock and no randomness in the deduction (spec-017 §1.3)', () => {
  it('covers the deduction module itself', () => {
    expect(deductionSources()).toEqual(expect.arrayContaining(['src/workflow/deduce.ts', 'src/core/workflow-deduction.ts']));
  });

  it.each(deductionSources())('%s calls no clock and no random source', (file) => {
    const offending = readFileSync(join(ROOT, file), 'utf-8')
      .split('\n')
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter(({ text }) => FORBIDDEN.test(text));
    expect(offending).toEqual([]);
  });
});
