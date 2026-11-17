/**
 * task-336 AC 7 (red-first) — the documents state that an agent's output may hold secrets and is never committed
 * (`dl-182` Q5 (a); `spec-016` §3.5 as amended at the design gate), and name the two new options:
 *
 * - `docs/user-guide.md` §9.4 ("Launch an agent", the text from its heading to `## 10.`) says "may hold secrets" and
 *   "never committed";
 * - `docs/cli-reference.md`'s `wingfoil agent execute` entry (from its heading to the next `### `) says both too, and has
 *   a `` | `--log <path>` | `` option row;
 * - its `wingfoil agent list` entry names `` `--active` `` and no longer says it comes later.
 *
 * That every registered option is named in its entry is `test/docs/cli-reference.test.ts`'s. Today neither document
 * says anything of secrets in the output (`grep -n "secret" docs/user-guide.md` → no line in §9.4).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = join(__dirname, '..', '..', 'docs');
const GUIDE = readFileSync(join(DOCS, 'user-guide.md'), 'utf-8');
const REFERENCE = readFileSync(join(DOCS, 'cli-reference.md'), 'utf-8');

/** The text from the line `start` up to (excluding) the next line beginning with `next` after it. */
function between(text: string, start: string, next: string): string {
  const from = text.indexOf(`\n${start}\n`);
  if (from < 0) throw new Error(`no line ${JSON.stringify(start)}`);
  const to = text.indexOf(`\n${next}`, from + start.length + 2);
  return to < 0 ? text.slice(from) : text.slice(from, to);
}

const LAUNCH_SECTION = between(GUIDE, '### 9.4 Launch an agent', '## 10.');
const EXECUTE_ENTRY = between(REFERENCE, '### `wingfoil agent execute`', '### ');
const LIST_ENTRY = between(REFERENCE, '### `wingfoil agent list`', '### ');

describe('task-336 AC 7 — the user guide says the output may hold secrets and is never committed (dl-182 Q5 (a))', () => {
  it('characterization — §9.4 "Launch an agent" is where the guide describes a launch', () => {
    expect(LAUNCH_SECTION).toContain('agent execute');
  });

  it('§9.4 says "may hold secrets"', () => {
    expect(LAUNCH_SECTION).toContain('may hold secrets');
  });

  it('§9.4 says "never committed"', () => {
    expect(LAUNCH_SECTION).toContain('never committed');
  });
});

describe('task-336 AC 7 — the CLI reference (dl-182 Q5 (a); spec-008 §12)', () => {
  it('the agent execute entry says "may hold secrets" and "never committed"', () => {
    expect(EXECUTE_ENTRY).toContain('may hold secrets');
    expect(EXECUTE_ENTRY).toContain('never committed');
  });

  it('the agent execute entry has a `--log <path>` option row', () => {
    expect(EXECUTE_ENTRY).toMatch(/^\| `--log <path>` \|/m);
  });

  it('the agent list entry names `--active` and no longer says it comes later', () => {
    expect(LIST_ENTRY).toContain('`--active`');
    expect(LIST_ENTRY).not.toContain('`--active` comes later');
  });
});
