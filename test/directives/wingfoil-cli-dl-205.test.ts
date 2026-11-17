/**
 * task-348 AC 2 (red-first; `dl-205` Q2 (ii), approver ruling D2 (a), 2026-11-08) — the `wingfoil-cli` directive's
 * § "2. Verb or hand procedure" says a form the pinned build cannot read is used at once and declared: the break is
 * declared at `dev-loop`'s `design`, before `red` (a `pinned-build` bug filed through `bug-ingest`, the
 * `KNOWN_READ_FAILURES` entries, the §1 exception), and the pin advance that reads the form removes all three. One
 * `version:` bump (`doc-versioning`); the directive still names no bug id (§3 points to the tag instead).
 *
 * Reads this repository's working tree, as `test/directives/wingfoil-cli.test.ts` does; its `section(n)` and
 * `prose()` helpers are local to that file and copied here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const TEXT = readFileSync(join(ROOT, '.wingfoil', 'directives', 'custom', 'wingfoil-cli.md'), 'utf-8');

function section(number: number): string {
  const start = TEXT.search(new RegExp(`\\n## ${number}\\. `));
  if (start < 0) throw new Error(`wingfoil-cli has no section "## ${number}."`);
  const end = TEXT.indexOf('\n## ', start + 1);
  return TEXT.slice(start, end < 0 ? undefined : end);
}

/** A phrase matched across the directive's line wrapping: each run of spaces matches any whitespace. */
function prose(phrase: string): RegExp {
  return new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '\\s+'));
}

describe('task-348 AC 2 — wingfoil-cli §2: a form the pinned build cannot read is declared before red (dl-205 Q2 (ii))', () => {
  it.each([
    'A form the pinned build cannot read',
    '`dl-205` Q2 (ii)',
    'before `red`',
    '`pinned-build` bug',
    'KNOWN_READ_FAILURES',
    'the pin advance',
  ])('§2 says %s', (phrase) => {
    expect(section(2)).toMatch(prose(phrase));
  });

  it('`version:` is "1.6" or later; its newest clause names dl-205 Q2 (ii) and task-348, keeping `prev 1.5`', () => {
    const line = /^version:\s*"?([0-9.]+)"?[^#\n]*#(.*)$/m.exec(TEXT);
    expect(line).not.toBeNull();
    expect(Number(line![1])).toBeGreaterThanOrEqual(1.6);
    const comment = line![2]!;
    const cut = comment.indexOf('(prev ');
    const head = cut < 0 ? comment : comment.slice(0, cut);
    expect(head).toContain('dl-205 Q2 (ii)');
    expect(head).toContain('task-348');
    expect(comment).toContain('prev 1.5');
  });

  it('the directive still names no bug id', () => {
    expect(TEXT).not.toMatch(/\bbug-\d+/);
  });
});
