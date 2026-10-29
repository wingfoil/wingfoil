/**
 * The control-character scan (task-173, `bug-073`) and the invisible-character scan (task-317,
 * `bug-246`), used by `test/lint/control-characters.test.ts`. Not a `.test.ts` file, so jest never
 * collects it as a suite.
 *
 * The control-character scan reads bytes rather than matching a character-class regex, which the
 * `no-control-regex` lint rule forbids; it judges single bytes below 0x80 only. The invisible-character
 * scan decodes each file as UTF-8 and judges code points: the Unicode format and separator characters
 * a byte scan cannot see (bidi controls, zero-width characters, U+2028, U+00A0, the C1 controls, ...).
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * Extensions of the tracked files that are binary by nature, and so are not scanned. An explicit list,
 * not git's verdict (`git ls-files --eol` reports `-text` for any file holding a NUL, which is exactly
 * the file the gate exists to catch). Today the repository's only binaries are the PNGs under
 * `docs/assets/` and the README's demo GIF there (task-224, `dl-128` Q2 (a))
 * (`git ls-files --eol | grep -- -text`). A new binary type is added here, on purpose.
 */
export const BINARY_EXTENSIONS: readonly string[] = ['.gif', '.png'];

/** One offending byte in a tracked file. */
export interface ControlCharacterFinding {
  /** Repository-relative path, as git lists it. */
  readonly path: string;
  /** Zero-based byte offset in the file. */
  readonly offset: number;
  /** The offending byte. */
  readonly byte: number;
  /** One-based line number: one more than the newlines before `offset`. */
  readonly line: number;
}

/** True for a byte in `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]`: C0 except tab, LF and CR, plus DEL. */
function isControlByte(byte: number): boolean {
  if (byte === 0x7f) return true;
  return byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d;
}

/** Every offset in `bytes` holding a control byte, in ascending order. */
export function controlCharacterOffsets(bytes: Uint8Array): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset < bytes.length; offset++) {
    if (isControlByte(bytes[offset] as number)) offsets.push(offset);
  }
  return offsets;
}

/**
 * The tracked files whose code points the invisible-character scan may report although they match
 * {@link isInvisibleCodePoint}: one entry per `{ path, codePoint }`, versioned here like
 * {@link BINARY_EXTENSIONS}. Empty today: the repository needs none (`bug-246`, task-317). An entry is
 * added on purpose, with a comment naming why the character must stay raw.
 */
export const ALLOWED_INVISIBLE_CHARACTERS: readonly { readonly path: string; readonly codePoint: number }[] = [];

/** One invisible format or separator character in a text, by position. */
export interface InvisibleCharacterPosition {
  /** One-based line: one more than the LFs before it (U+2028 does not start a line). */
  readonly line: number;
  /** One-based column, in code points from the start of the line (an astral character counts one). */
  readonly column: number;
  /** The offending code point. */
  readonly codePoint: number;
}

/** One invisible format or separator character in a tracked file. */
export interface InvisibleCharacterFinding extends InvisibleCharacterPosition {
  /** Repository-relative path, as git lists it. */
  readonly path: string;
}

/** Unicode categories Cf (format), Zl (line separator), Zp (paragraph separator), Zs (space separator). */
const INVISIBLE_CATEGORY = /^[\p{Cf}\p{Zl}\p{Zp}\p{Zs}]$/u;

/**
 * True for a code point of category Cf, Zl, Zp or Zs other than U+0020, or a C1 control
 * (U+0080-U+009F): the characters that render as nothing, or as an ordinary space, and so hide what a
 * line holds (design gate D1 (a), task-317).
 */
function isInvisibleCodePoint(codePoint: number): boolean {
  if (codePoint === 0x20) return false;
  if (codePoint >= 0x80 && codePoint <= 0x9f) return true;
  return INVISIBLE_CATEGORY.test(String.fromCodePoint(codePoint));
}

/** Every invisible format or separator character of `text`, in order, with its line and column. */
export function invisibleCharacterPositions(text: string): InvisibleCharacterPosition[] {
  const positions: InvisibleCharacterPosition[] = [];
  let line = 1;
  let column = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) as number;
    if (codePoint === 0x0a) {
      line++;
      column = 0;
      continue;
    }
    column++;
    if (isInvisibleCodePoint(codePoint)) positions.push({ line, column, codePoint });
  }
  return positions;
}

/** The tracked paths of the repository at `root`, from its index, sorted. */
function trackedPaths(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf-8' })
    .split('\0')
    .filter((path) => path !== '')
    .sort();
}

/** The bytes of `absolute` when it is a regular file in the working tree, otherwise `null`. */
function readRegularFile(absolute: string): Buffer | null {
  try {
    if (!lstatSync(absolute).isFile()) return null;
  } catch {
    return null;
  }
  return readFileSync(absolute);
}

/**
 * The tracked, non-binary files of the repository at `root` with their bytes, in path order. A tracked
 * path that is missing from the working tree, a symbolic link or a submodule has no bytes of its own to
 * judge and is skipped. The one walk both scans share.
 */
function* trackedTextFiles(root: string): Generator<{ path: string; bytes: Buffer }> {
  for (const path of trackedPaths(root)) {
    if (BINARY_EXTENSIONS.includes(extname(path).toLowerCase())) continue;
    const bytes = readRegularFile(join(root, path));
    if (bytes === null) continue;
    yield { path, bytes };
  }
}

/** Scan every tracked, non-binary file of the repository at `root` and report each control byte. */
export function scanTrackedFiles(root: string): ControlCharacterFinding[] {
  const findings: ControlCharacterFinding[] = [];
  for (const { path, bytes } of trackedTextFiles(root)) {
    for (const offset of controlCharacterOffsets(bytes)) {
      let line = 1;
      for (let index = 0; index < offset; index++) if (bytes[index] === 0x0a) line++;
      findings.push({ path, offset, byte: bytes[offset] as number, line });
    }
  }
  return findings;
}

/** One line per finding: `path: byte 0xNN at offset N (line L)`. */
export function formatFindings(findings: readonly ControlCharacterFinding[]): string {
  return findings
    .map(
      (finding) =>
        `${finding.path}: byte 0x${finding.byte.toString(16).padStart(2, '0')} at offset ${finding.offset} (line ${finding.line})`,
    )
    .join('\n');
}

/**
 * Scan every tracked, non-binary file of the repository at `root`, decoded as UTF-8 (a leading BOM is
 * kept, and reported), and report each invisible format or separator character, sorted by path, then
 * line and column. A finding whose `{ path, codePoint }` is on `allowed` is dropped.
 */
export function scanTrackedFilesForInvisibleCharacters(
  root: string,
  allowed: readonly { readonly path: string; readonly codePoint: number }[] = ALLOWED_INVISIBLE_CHARACTERS,
): InvisibleCharacterFinding[] {
  const findings: InvisibleCharacterFinding[] = [];
  for (const { path, bytes } of trackedTextFiles(root)) {
    for (const position of invisibleCharacterPositions(bytes.toString('utf-8'))) {
      if (allowed.some((entry) => entry.path === path && entry.codePoint === position.codePoint)) continue;
      findings.push({ path, ...position });
    }
  }
  return findings;
}

/** One line per finding: `path: U+XXXX at line L, column C`. */
export function formatInvisibleCharacterFindings(findings: readonly InvisibleCharacterFinding[]): string {
  return findings
    .map(
      (finding) =>
        `${finding.path}: U+${finding.codePoint.toString(16).toUpperCase().padStart(4, '0')} at line ${finding.line}, column ${finding.column}`,
    )
    .join('\n');
}
