/**
 * task-311 (bug-108, dl-080 (B)) AC3 — the text that names `directive remove`'s gating read.
 *
 * `command-baseline` (`.wingfoil/directives/custom/command-baseline.md`) listed `directive remove` as the
 * one shipped deviation from its rule — the directive resolved on the working tree, `bug-108` `open` — and
 * `docs/cli-reference.md` warned of the same defect. Once the verb resolves the directive at `HEAD`, both
 * texts would state a defect that no longer exists, so this suite pins them moved:
 *
 * - `command-baseline` at version 1.8 or later, with its Revision 1.8 history line naming this task — the
 *   version as `>=` with its history line, so a later bump does not break the pin (bug-314);
 * - its *Where the shipped code still deviates* paragraph no longer quoting the step-3 TSDoc sentence
 *   that kept the read on the working tree, nor naming `bug-108` as filed and `open`;
 * - `docs/cli-reference.md` no longer carrying the "One known defect breaks this rule today" sentence.
 *
 * Red-first: on the base of this task the directive is at `version: "1.7"`, the paragraph carries both
 * texts, and `grep -c "One known defect breaks this rule today" docs/cli-reference.md` prints `1`.
 * Reads this repository's own files, read-only. Deterministic (REQ-SYS-07): fixed paths, no clock.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { extractFrontmatter } from '../../src/storage/frontmatter';

const REPO_ROOT = join(__dirname, '..', '..');
const COMMAND_BASELINE = join(REPO_ROOT, '.wingfoil', 'directives', 'custom', 'command-baseline.md');
const CLI_REFERENCE = join(REPO_ROOT, 'docs', 'cli-reference.md');

/** The paragraph that opens with `**Where the shipped code still deviates`, up to the next blank line. */
function deviatesParagraph(raw: string): string {
  const start = raw.indexOf('**Where the shipped code still deviates');
  if (start < 0) throw new Error('fixture bug: command-baseline has no "Where the shipped code still deviates" paragraph');
  const end = raw.indexOf('\n\n', start);
  return raw.slice(start, end < 0 ? undefined : end);
}

describe('the docs state that `directive remove` resolves its directive at HEAD (task-311 AC3, bug-108)', () => {
  const raw = readFileSync(COMMAND_BASELINE, 'utf-8');

  it('command-baseline is at version 1.8 or later, with the Revision 1.8 history line of task-311', () => {
    const fm = load(extractFrontmatter(raw) as string) as Record<string, unknown>;
    expect(typeof fm.version).toBe('string');
    expect(Number(fm.version)).toBeGreaterThanOrEqual(1.8);
    expect(raw).toMatch(/^\*\*Revision 1\.8 \(2026-10-29, `task-311-/m);
  });

  it('its "Where the shipped code still deviates" paragraph no longer keeps the read on the working tree', () => {
    const paragraph = deviatesParagraph(raw);
    expect(paragraph).not.toContain('This read stays on the **working tree**');
  });

  it('its "Where the shipped code still deviates" paragraph no longer names bug-108 as filed and open', () => {
    const paragraph = deviatesParagraph(raw);
    expect(paragraph).not.toMatch(/filed as\s+\*\*`bug-108-[^`]*`\*\*\s+\(`open`\)/i);
  });

  it('docs/cli-reference.md no longer warns of the known `directive remove` defect', () => {
    expect(readFileSync(CLI_REFERENCE, 'utf-8')).not.toContain('One known defect breaks this rule today');
  });
});
