/**
 * task-210 AC4 — `--dry-run` is documented where a flag every mutating command takes belongs:
 * `spec-008-cli-grammar` §2 (the global-flag table, beside `--reason`, the other flag §2 lists with the
 * commands that take it) and the CLI reference's "Global options". Both are read as files in the
 * repository; deterministic.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

/** The lines of a Markdown section, from its heading to the next heading of the same or a higher level. */
function section(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) throw new Error(`no heading ${heading}`);
  const level = /^#+/.exec(heading)?.[0].length ?? 0;
  const end = lines.findIndex((line, index) => index > start && /^#+ /.test(line) && (/^#+/.exec(line)?.[0].length ?? 0) <= level);
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

describe('--dry-run is documented (task-210 AC4)', () => {
  it('spec-008 §2 has a --dry-run row', () => {
    const spec = readFileSync(join(repoRoot, 'docs/04_memory/design/specs/spec-008-cli-grammar.md'), 'utf-8');
    expect(section(spec, '### 2. Global flags')).toMatch(/^\| `--dry-run` /m);
  });

  it("the CLI reference's Global options name --dry-run", () => {
    const reference = readFileSync(join(repoRoot, 'docs/cli-reference.md'), 'utf-8');
    expect(section(reference, '### Global options')).toMatch(/^\| `--dry-run` /m);
  });
});
