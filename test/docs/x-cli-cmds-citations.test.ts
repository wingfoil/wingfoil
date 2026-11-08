/**
 * task-335 AC 8 (characterization at red; `bug-380`, `claim-evidence`, `dl-075`) — `spec-016` and `spec-017` cite
 * `docs/01_vision/X_cli-cmds.md` by section heading and row, never by a bare line number, which the file's own
 * revisions move.
 *
 * The AC's check is `grep -nE "X_cli-cmds\.md:[0-9]" docs/04_memory/design/specs/spec-01[67]-*.md`; the bug's
 * wider pattern (its Steps to Reproduce, step 1) also catches a line range after the file name, ``(`:163-170`)``.
 * Before the approver's amendments of the design gate, at `b64c11db0`, the AC's grep printed `spec-016` l.29, l.364,
 * l.376 and l.421, and the wider pattern those and `spec-016` l.954 and `spec-017` l.1306; after them both print
 * nothing. The interior citation `` (`:169`) `` that
 * neither grep matches is checked by name. Not vacuous: each spec still cites `X_cli-cmds.md` (by section).
 * The whole file is read, its Revision notes included, as the AC's grep reads it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPECS = ['docs/04_memory/design/specs/spec-016-agent-execution.md', 'docs/04_memory/design/specs/spec-017-workflow-commands-and-state-deduction.md'];

/** The AC's grep. */
const AC_PATTERN = /X_cli-cmds\.md:[0-9]/;
/** `bug-380`'s wider pattern. */
const BUG_PATTERN = /X_cli-cmds[.a-z]*.?(:| \(.?:|: [^(]*\(.?:)[0-9]/;

/** The spec's lines, numbered from 1. */
function specBody(path: string): { line: number; text: string }[] {
  return readFileSync(join(__dirname, '..', '..', path), 'utf-8')
    .split('\n')
    .map((text, index) => ({ line: index + 1, text }));
}

describe('task-335 AC 8 — spec-016 and spec-017 cite X_cli-cmds.md by section, not by line (bug-380)', () => {
  it.each(SPECS)('%s: no line matches the AC grep or the bug pattern', (path) => {
    expect(specBody(path).filter(({ text }) => AC_PATTERN.test(text) || BUG_PATTERN.test(text))).toEqual([]);
  });

  it('spec-017: the interior line citation (`:169`) is gone', () => {
    expect(specBody(SPECS[1]!).filter(({ text }) => text.includes('(`:169`)'))).toEqual([]);
  });

  it.each(SPECS)('%s still cites X_cli-cmds.md (the check is not vacuous)', (path) => {
    expect(specBody(path).some(({ text }) => text.includes('X_cli-cmds.md'))).toBe(true);
  });
});
