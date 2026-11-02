/**
 * task-312 AC 2 (`bug-255`) — `rewriteKeyLine` (`src/dna/edit.ts`) keeps the whitespace written before an
 * inline comment. The rule, as the design gate ruled it on 2026-10-30 (D2 (a)): a gap holding a tab is kept
 * as written at any width of the new value; a space-only gap keeps today's column rule (the `#` stays in
 * its column while the new value fits, one space otherwise — `test/dna/edit.test.ts` pins that rule too).
 *
 * Before the fix the line was rebuilt by counting every character before the `#` as one column, so the tab
 * of `name: ab<TAB># comment` became one space at an unchanged width, and two when the value got shorter.
 *
 * Each case drives the pure editor with a `set-scalar` edit and, as the editor's safety contract asks, the
 * WHOLE intended document — the parse of the expected text, so the expected bytes and the intended object
 * cannot disagree. The last three cases are carried over from the in-text setter's suite, which AC 1
 * deletes: the column rule with a value that changes width, and a `#` inside a quoted value.
 */
import { load } from 'js-yaml';

import { applyDnaEditInText, type DnaTextStep } from '../../src/dna/edit';

/** Set `value` at `path` in `text`, verified against the parse of `expected`. */
function setScalar(text: string, path: readonly DnaTextStep[], value: unknown, expected: string): string | undefined {
  return applyDnaEditInText(text, { kind: 'set-scalar', path, value }, load(expected));
}

const PROJECT_NAME: readonly DnaTextStep[] = [{ key: 'project' }, { key: 'name' }];

describe('task-312 AC 2 — a tab before an inline comment stays a tab (bug-255, red-first)', () => {
  it('(a) same width: `name: ab<TAB># …` set to `cd` keeps the tab', () => {
    const text = 'project:\n  name: ab\t# your project name\n';
    const expected = 'project:\n  name: cd\t# your project name\n';
    expect(setScalar(text, PROJECT_NAME, 'cd', expected)).toBe(expected);
  });

  it('(b) a key inside a sequence entry, below its `- ` line, keeps the tab', () => {
    const text = 'modules:\n  - name: core\n    path: ab\t# where it lives\n';
    const expected = 'modules:\n  - name: core\n    path: cd\t# where it lives\n';
    expect(setScalar(text, [{ key: 'modules' }, { index: 0 }, { key: 'path' }], 'cd', expected)).toBe(expected);
  });

  it('(c) a CRLF file keeps the tab and its line endings', () => {
    const text = 'project:\r\n  name: ab\t# c\r\n';
    const expected = 'project:\r\n  name: cd\t# c\r\n';
    expect(setScalar(text, PROJECT_NAME, 'cd', expected)).toBe(expected);
  });

  it('(d) a shorter value keeps the tab as written (D2 (a))', () => {
    const text = 'project:\n  name: ab\t# your project name\n';
    const expected = 'project:\n  name: c\t# your project name\n';
    expect(setScalar(text, PROJECT_NAME, 'c', expected)).toBe(expected);
  });

  it('(e) a longer value keeps the tab as written (D2 (a))', () => {
    const text = 'project:\n  name: ab\t# your project name\n';
    const expected = 'project:\n  name: a-much-longer-name\t# your project name\n';
    expect(setScalar(text, PROJECT_NAME, 'a-much-longer-name', expected)).toBe(expected);
  });
});

describe('task-312 AC 2 — a space-only gap keeps the column rule (characterization)', () => {
  it('(f) same width: a run of spaces is kept as it is', () => {
    const text = 'project:\n  name: ab   # c\n';
    const expected = 'project:\n  name: cd   # c\n';
    expect(setScalar(text, PROJECT_NAME, 'cd', expected)).toBe(expected);
  });

  it('(g) a value that changes width leaves the `#` in its column', () => {
    // `'1.2'` is quoted because the given value is the string "1.2"; the point is the `#` column.
    const text = 'version: 1.1                     # [AUTHORING] config-file format version\n';
    const expected = "version: '1.2'                   # [AUTHORING] config-file format version\n";
    const edited = setScalar(text, [{ key: 'version' }], '1.2', expected);
    expect(edited).toBe(expected);
    expect(edited!.indexOf('#')).toBe(text.indexOf('#'));
  });

  it('(h) a `#` inside a quoted value is not taken for the comment', () => {
    const text = "motto: 'not # a comment'   # but this one is\n";
    const expected = 'motto: plain               # but this one is\n';
    expect(setScalar(text, [{ key: 'motto' }], 'plain', expected)).toBe(expected);
  });
});
