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
  BINARY_EXTENSIONS,
  controlCharacterOffsets,
  formatFindings,
  scanTrackedFiles,
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
      expect(BINARY_EXTENSIONS).toEqual(['.png']);
      writeFixtureFile(repo, 'docs/image.png', 'PNG\u0000\u0001\u001a');
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
