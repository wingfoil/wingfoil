/**
 * task-350 AC 4 (red-first; `dl-198` (c)'s documentation) — the user documentation names the global
 * `--project <dir>` option and says why the project root is not inferred:
 *
 * - `docs/cli-reference.md`: the `### Global options` table has a row whose first cell is `` `--project <dir>` ``,
 *   and `### Where to run it` names `--project <dir>` and says `WingFoil never infers the project root`;
 * - `docs/user-guide.md`: the guide names `--project <dir>` and says the same, and the `## 11.` bullet that
 *   starts `**Run from the repository root**` names `--project`.
 *
 * The `docs/01_vision/X_cli-cmds.md` Global Options row is gated by `test/docs/x-cli-cmds.test.ts` ("every
 * root-program long option has a Global Options row"), which turns red by itself once the flag is registered.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = join(__dirname, '..', '..', 'docs');
const CLI_REFERENCE = readFileSync(join(DOCS, 'cli-reference.md'), 'utf-8');
const USER_GUIDE = readFileSync(join(DOCS, 'user-guide.md'), 'utf-8');

/** The fragment both documents carry, word for word, so the rationale reads the same in each. */
const NOT_INFERRED = 'WingFoil never infers the project root';

/** The text of the section headed exactly `heading`: from that line up to the next heading of the same or a higher level. */
function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`no heading ${JSON.stringify(heading)}`);
  const level = (/^#+/.exec(heading) as RegExpExecArray)[0].length;
  const end = lines.findIndex((line, index) => index > start && /^#+ /.test(line) && (/^#+/.exec(line) as RegExpExecArray)[0].length <= level);
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

describe('task-350 AC 4 — docs/cli-reference.md documents --project and why the root is not inferred', () => {
  it('the Global options table has a `--project <dir>` row', () => {
    const rows = section(CLI_REFERENCE, '### Global options')
      .split('\n')
      .filter((line) => line.startsWith('| `'));
    expect(rows.map((row) => (row.split('|')[1] ?? '').trim())).toContain('`--project <dir>`');
  });

  it('"Where to run it" names --project <dir> and says WingFoil never infers the project root', () => {
    const text = section(CLI_REFERENCE, '### Where to run it');
    expect(text).toContain('--project <dir>');
    expect(text).toContain(NOT_INFERRED);
  });
});

describe('task-350 AC 4 — docs/user-guide.md documents --project and why the root is not inferred', () => {
  it('names --project <dir> and says WingFoil never infers the project root', () => {
    expect(USER_GUIDE).toContain('--project <dir>');
    expect(USER_GUIDE).toContain(NOT_INFERRED);
  });

  it('the known-limitations bullet "Run from the repository root" names --project', () => {
    const limitations = USER_GUIDE.slice(USER_GUIDE.indexOf('\n## 11. '));
    expect(limitations.startsWith('\n## 11. ')).toBe(true);
    const bullet = limitations.split('\n').find((line) => line.startsWith('- **Run from the repository root**'));
    expect(bullet).toBeDefined();
    expect(bullet).toContain('--project');
  });
});
