/**
 * Control-character gate (task-173-add-whole-project-typecheck-clean-gate-control-character, `bug-073`).
 *
 * A raw NUL once reached `src/memory/git-log.ts` through an editing tool, and lint, both typechecks
 * and the whole suite passed; the only symptom was `git diff` calling the file binary. This suite
 * fails when a tracked text file holds a byte in the C0 range other than tab, newline and carriage
 * return, or DEL — `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]` — and names the file and the byte offset.
 *
 * Binary files are excluded by an explicit extension list ({@link BINARY_EXTENSIONS}), NOT by git's
 * own text/binary verdict (`git ls-files --eol`): git calls a file binary BECAUSE it holds a NUL, so
 * excluding what git calls binary would exclude exactly the file `bug-073` is about.
 *
 * Deterministic: the tracked-file list is git's index, sorted; the verdict is a pure function of bytes.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import {
  ALLOWED_INVISIBLE_CHARACTERS,
  BINARY_EXTENSIONS,
  controlCharacterOffsets,
  formatFindings,
  formatInvisibleCharacterFindings,
  invisibleCharacterPositions,
  scanTrackedFiles,
  scanTrackedFilesForInvisibleCharacters,
} from './helpers/control-characters';

const REPO_ROOT = join(__dirname, '..', '..');

describe('control characters in tracked text files (bug-073, task-173)', () => {
  it('finds none in this repository', () => {
    const findings = scanTrackedFiles(REPO_ROOT);
    if (findings.length > 0) throw new Error(`control-character gate failed:\n${formatFindings(findings)}`);
    expect(findings).toEqual([]);
  });

  describe('the byte rule', () => {
    it.each([
      ['NUL', 0x00],
      ['BEL', 0x07],
      ['backspace', 0x08],
      ['vertical tab', 0x0b],
      ['form feed', 0x0c],
      ['shift out', 0x0e],
      ['ESC', 0x1b],
      ['record separator (bug-050)', 0x1e],
      ['unit separator (bug-050)', 0x1f],
      ['DEL', 0x7f],
    ])('flags %s at its byte offset', (_label, byte) => {
      expect(controlCharacterOffsets(Buffer.from([0x61, 0x62, byte, 0x63]))).toEqual([2]);
    });

    it('accepts tab, newline and carriage return, the three a text file legitimately carries', () => {
      expect(controlCharacterOffsets(Buffer.from('a\tb\nc\r\nd', 'utf-8'))).toEqual([]);
    });

    it('accepts UTF-8 multi-byte text, whose continuation bytes are >= 0x80', () => {
      expect(controlCharacterOffsets(Buffer.from('café — ✓ U+2028 named, not embedded', 'utf-8'))).toEqual([]);
    });

    it('reports every offset, in order', () => {
      expect(controlCharacterOffsets(Buffer.from([0x00, 0x61, 0x7f, 0x0a, 0x1b]))).toEqual([0, 2, 4]);
    });
  });

  describe('the scan over a git index', () => {
    let repo: string;

    beforeEach(() => {
      repo = makeTempGitRepo();
    });

    afterEach(() => removeTempDir(repo));

    it('fails on a tracked text file holding a planted NUL, naming the file and the offset', () => {
      writeFixtureFile(repo, 'src/clean.ts', 'export const a = 1;\n');
      writeFixtureFile(repo, 'src/planted.ts', 'export const b = "x\u0000y";\n');
      git(repo, ['add', '.']);
      const findings = scanTrackedFiles(repo);
      expect(findings).toEqual([{ path: 'src/planted.ts', offset: 19, byte: 0x00, line: 1 }]);
      expect(formatFindings(findings)).toBe('src/planted.ts: byte 0x00 at offset 19 (line 1)');
    });

    it('names the line of an offending byte past the first line', () => {
      writeFixtureFile(repo, 'notes.md', 'one\ntwo\nthree \u001b[31m red\n');
      git(repo, ['add', '.']);
      expect(scanTrackedFiles(repo)).toEqual([{ path: 'notes.md', offset: 14, byte: 0x1b, line: 3 }]);
    });

    it('skips files on the binary list, and only those', () => {
      // task-224 (dl-128 Q2 (a)): the README's demo is a GIF committed under docs/assets/.
      expect(BINARY_EXTENSIONS).toEqual(['.gif', '.png']);
      writeFixtureFile(repo, 'docs/image.png', 'PNG\u0000\u0001\u001a');
      writeFixtureFile(repo, 'docs/demo.gif', 'GIF89a\u0000\u0001\u001a');
      writeFixtureFile(repo, 'docs/image.png.md', 'x\u0000');
      git(repo, ['add', '.']);
      expect(scanTrackedFiles(repo).map((finding) => finding.path)).toEqual(['docs/image.png.md']);
    });

    it('reads only tracked files: an untracked file is not the gate\'s business', () => {
      writeFixtureFile(repo, 'tracked.txt', 'clean\n');
      git(repo, ['add', 'tracked.txt']);
      writeFixtureFile(repo, 'untracked.txt', 'x\u0000');
      expect(scanTrackedFiles(repo)).toEqual([]);
    });

    it('skips a tracked file deleted from the working tree, which has no bytes to judge', () => {
      writeFixtureFile(repo, 'gone.txt', 'x\u0000');
      git(repo, ['add', 'gone.txt']);
      rmSync(join(repo, 'gone.txt'));
      expect(scanTrackedFiles(repo)).toEqual([]);
    });
  });
});

/*
 * task-317 (`bug-246`, design gate D1 (a), D2): the gate widened to the Unicode format and separator
 * characters a byte scan below 0x80 cannot see - category Cf (bidi controls, zero-width characters,
 * U+FEFF, U+00AD), Zl (U+2028), Zp (U+2029), Zs other than U+0020, and the C1 controls U+0080-U+009F.
 * Every such character below is written as a `\u` escape, never raw: the gate reads this file too.
 */
describe('invisible format and separator characters in tracked text files (bug-246, task-317)', () => {
  it('finds no invisible format or separator character in this repository', () => {
    const findings = scanTrackedFilesForInvisibleCharacters(REPO_ROOT);
    if (findings.length > 0) {
      throw new Error(`invisible-character gate failed:\n${formatInvisibleCharacterFindings(findings)}`);
    }
    expect(findings).toEqual([]);
  });

  it('declares an allow-list, empty today', () => {
    expect(ALLOWED_INVISIBLE_CHARACTERS).toEqual([]);
  });

  describe('the character rule', () => {
    it.each([
      ['LEFT-TO-RIGHT EMBEDDING (bidi, Cf)', 0x202a],
      ['RIGHT-TO-LEFT OVERRIDE (bidi, Cf)', 0x202e],
      ['LEFT-TO-RIGHT ISOLATE (bidi, Cf)', 0x2066],
      ['POP DIRECTIONAL ISOLATE (bidi, Cf)', 0x2069],
      ['LINE SEPARATOR (Zl)', 0x2028],
      ['PARAGRAPH SEPARATOR (Zp)', 0x2029],
      ['the first C1 control', 0x0080],
      ['NEXT LINE (C1)', 0x0085],
      ['the last C1 control', 0x009f],
      ['NO-BREAK SPACE (Zs)', 0x00a0],
      ['SOFT HYPHEN (Cf)', 0x00ad],
      ['ZERO WIDTH SPACE (Cf)', 0x200b],
      ['ZERO WIDTH JOINER (Cf)', 0x200d],
      ['ZERO WIDTH NO-BREAK SPACE / BOM (Cf)', 0xfeff],
    ])('flags %s at its line and column', (_label, codePoint) => {
      expect(invisibleCharacterPositions(`a${String.fromCodePoint(codePoint)}b`)).toEqual([
        { line: 1, column: 2, codePoint },
      ]);
    });

    it('accepts the ASCII space and tab', () => {
      expect(invisibleCharacterPositions('a b\tc')).toEqual([]);
    });

    it('accepts visible non-ASCII text', () => {
      expect(invisibleCharacterPositions('caf\u00E9 \u2014 \u2713')).toEqual([]);
    });

    it('accepts U+2027 HYPHENATION POINT, visible punctuation (Po) next to U+2028', () => {
      expect(invisibleCharacterPositions('a\u2027b')).toEqual([]);
    });

    it('counts lines by LF only: U+2028 does not start a line', () => {
      expect(invisibleCharacterPositions('one\ntwo \u2028x')).toEqual([{ line: 2, column: 5, codePoint: 0x2028 }]);
    });

    it('counts columns in code points: an astral character is one column', () => {
      expect(invisibleCharacterPositions('\u{1F600}\u202E')).toEqual([{ line: 1, column: 2, codePoint: 0x202e }]);
    });
  });

  describe('the scan over a git index', () => {
    let repo: string;

    beforeEach(() => {
      repo = makeTempGitRepo();
    });

    afterEach(() => removeTempDir(repo));

    it('fails on a tracked text file holding a planted bidi override, naming the file, line and column', () => {
      writeFixtureFile(repo, 'src/clean.ts', 'export const a = 1;\n');
      writeFixtureFile(repo, 'src/planted.ts', 'export const b = "x\u202Ey";\n');
      git(repo, ['add', '.']);
      const findings = scanTrackedFilesForInvisibleCharacters(repo);
      expect(findings).toEqual([{ path: 'src/planted.ts', line: 1, column: 20, codePoint: 0x202e }]);
      expect(formatInvisibleCharacterFindings(findings)).toBe('src/planted.ts: U+202E at line 1, column 20');
    });

    it('reports a leading U+FEFF at line 1, column 1: the decode keeps the BOM', () => {
      writeFixtureFile(repo, 'notes.md', '\uFEFFtitle\n');
      git(repo, ['add', '.']);
      expect(scanTrackedFilesForInvisibleCharacters(repo)).toEqual([
        { path: 'notes.md', line: 1, column: 1, codePoint: 0xfeff },
      ]);
    });

    it('sorts findings by path, then line and column, one formatted line each', () => {
      writeFixtureFile(repo, 'b.md', 'x\u00A0y\n\u2029\n');
      writeFixtureFile(repo, 'a.md', 'ok\nz\u200Bz\n');
      git(repo, ['add', '.']);
      const findings = scanTrackedFilesForInvisibleCharacters(repo);
      expect(findings).toEqual([
        { path: 'a.md', line: 2, column: 2, codePoint: 0x200b },
        { path: 'b.md', line: 1, column: 2, codePoint: 0x00a0 },
        { path: 'b.md', line: 2, column: 1, codePoint: 0x2029 },
      ]);
      expect(formatInvisibleCharacterFindings(findings)).toBe(
        'a.md: U+200B at line 2, column 2\nb.md: U+00A0 at line 1, column 2\nb.md: U+2029 at line 2, column 1',
      );
    });

    it('skips files on the binary list', () => {
      writeFixtureFile(repo, 'docs/image.png', 'PNG\u2028');
      git(repo, ['add', '.']);
      expect(scanTrackedFilesForInvisibleCharacters(repo)).toEqual([]);
    });

    it('reads only tracked files', () => {
      writeFixtureFile(repo, 'tracked.txt', 'clean\n');
      git(repo, ['add', 'tracked.txt']);
      writeFixtureFile(repo, 'untracked.txt', 'x\u2028');
      expect(scanTrackedFilesForInvisibleCharacters(repo)).toEqual([]);
    });

    it('drops a finding whose path and code point are on the allow-list, and only that one', () => {
      writeFixtureFile(repo, 'src/planted.ts', 'export const b = "x\u202Ey";\n');
      git(repo, ['add', '.']);
      const allowed = [{ path: 'src/planted.ts', codePoint: 0x202e }];
      expect(scanTrackedFilesForInvisibleCharacters(repo, allowed)).toEqual([]);
      writeFixtureFile(repo, 'src/planted.ts', 'export const b = "x\u202Ey";\nconst c = "\u2028";\n');
      git(repo, ['add', '.']);
      expect(scanTrackedFilesForInvisibleCharacters(repo, allowed)).toEqual([
        { path: 'src/planted.ts', line: 2, column: 12, codePoint: 0x2028 },
      ]);
    });
  });
});
