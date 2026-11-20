/**
 * task-375 AC 3 (red-first, `bug-304`; `spec-008` §6 "One console prefix"; approver ruling D3) — every console warning
 * carries `warning: `, so no source writes the old `Warning: ` prefix, and the specs that quote a warning quote the one
 * prefix.
 *
 * - **Sources:** no line of a tracked `src/**\/*.ts` file holds the literal `` `Warning: `` or `'Warning: ` (the start
 *   of a template or string literal). Red until green: the fallbacks of `src/validation/warning.ts` write it today.
 * - **Specs:** `spec-009` and `spec-013`, above their `## Process Notes` (the revision notes below it quote the old
 *   prefix on purpose), contain no `Warning: `. Passes once the design gate's amendments are recorded.
 *
 * Deterministic: files in `git ls-files` order, lines in file order.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SPECS = join(ROOT, 'docs', '04_memory', 'design', 'specs');

function specFile(prefix: string): string {
  const name = readdirSync(SPECS).find((entry) => entry.startsWith(`${prefix}-`) && entry.endsWith('.md'));
  if (name === undefined) throw new Error(`no ${prefix} under ${SPECS}`);
  return readFileSync(join(SPECS, name), 'utf-8');
}

describe('task-375 AC 3 — one console warning prefix in the sources and the specs (bug-304)', () => {
  it("no tracked src/**/*.ts line writes the literal `Warning: or 'Warning: ", () => {
    const files = execFileSync('git', ['-C', ROOT, 'ls-files', '--', 'src'], { encoding: 'utf-8' })
      .split('\n')
      .filter((path) => path.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const path of files) {
      readFileSync(join(ROOT, path), 'utf-8')
        .split('\n')
        .forEach((line, index) => {
          if (line.includes('`Warning: ') || line.includes("'Warning: ")) hits.push(`${path}:${index + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it.each(['spec-009', 'spec-013'])('%s, above its ## Process Notes, quotes no `Warning: `', (prefix) => {
    const text = specFile(prefix);
    const end = text.indexOf('\n## Process Notes');
    expect(end).toBeGreaterThan(0);
    expect(text.slice(0, end)).not.toContain('Warning: ');
    // The search can find what it looks for: the section quotes the one prefix.
    expect(text.slice(0, end)).toContain('warning: ');
  });
});
