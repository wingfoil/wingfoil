/**
 * task-299 AC1 (unit) — `raiseConfigVersion`, the one raise every tool write of a versioned configuration
 * file applies (`dl-174` (a), `spec-006` §6 item 7): the first top-level `version:` read as a number plus
 * 0.1 (`1.9 → 2.0`), in the file's quoting, every other byte (spacing, trailing comment, other lines)
 * kept; a text with no top-level numeric `version:` is returned unchanged. `INITIAL_CONFIG_VERSION` is the
 * value a file written whole for the first time carries.
 *
 * Red-first: the export is new (task-299 design D1). Expected values are literal text.
 */
import { load } from 'js-yaml';

import { INITIAL_CONFIG_VERSION, isVersionIncrease, raiseConfigVersion } from '../../src/validation';

const versionOf = (text: string): unknown => (load(text) as { version?: unknown }).version;

describe('raiseConfigVersion (task-299, dl-174)', () => {
  it.each([
    ['version: 1.9   # c\n', 'version: 2.0   # c\n'],
    ['version: 1.2\n', 'version: 1.3\n'],
    ['version: 1\n', 'version: 1.1\n'],
    ['version: 2.0\n', 'version: 2.1\n'],
    ['version: 1.10\n', 'version: 1.2\n'],
    ['version: "1.8" # q\n', 'version: "1.9" # q\n'],
    ["version: '2.0'\n", "version: '2.1'\n"],
    ['# h\nversion: 2.1\nversion2: 3\n', '# h\nversion: 2.2\nversion2: 3\n'],
    ['a: 1\r\nversion: 1.4\r\nb: 2\r\n', 'a: 1\r\nversion: 1.5\r\nb: 2\r\n'],
  ])('AC1: raises %j to %j', (before, after) => {
    expect(raiseConfigVersion(before)).toBe(after);
  });

  it.each([
    ['version: 1.9   # c\n'],
    ['version: 1.2\n'],
    ['version: 1\n'],
    ['version: 2.0\n'],
    ['version: 1.10\n'],
    ['version: "1.8" # q\n'],
    ["version: '2.0'\n"],
    ['# h\nversion: 2.1\nversion2: 3\n'],
  ])('AC1: the raise of %j is a bump as isVersionIncrease reads it', (before) => {
    expect(isVersionIncrease(versionOf(before), versionOf(raiseConfigVersion(before)))).toBe(true);
  });

  it.each([['x: 1\n'], ['a:\n  version: 1\n'], ['# version: 1\n'], ['version: abc\n']])(
    'AC1: leaves %j unchanged (no top-level numeric version:)',
    (text) => {
      expect(raiseConfigVersion(text)).toBe(text);
    },
  );

  it('AC1: a file written whole for the first time carries version 1.0', () => {
    expect(INITIAL_CONFIG_VERSION).toBe('1.0');
  });
});
