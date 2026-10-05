/**
 * The control-character scan (task-173, `bug-073`), used by `test/lint/control-characters.test.ts`.
 * Not a `.test.ts` file, so jest never collects it as a suite.
 *
 * A byte scan rather than a character-class regex, which the `no-control-regex` lint rule forbids.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * Extensions of the tracked files that are binary by nature, and so are not scanned. An explicit list,
 * not git's verdict (`git ls-files --eol` reports `-text` for any file holding a NUL, which is exactly
 * the file the gate exists to catch). Today the repository's only binaries are the PNGs under
 * `docs/assets/` (`git ls-files --eol | grep -- -text`). A new binary type is added here, on purpose.
 */
export const BINARY_EXTENSIONS: readonly string[] = ['.png'];

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
 * Scan every tracked, non-binary file of the repository at `root` and report each control byte. A
 * tracked path that is missing from the working tree, a symbolic link or a submodule has no bytes of
 * its own to judge and is skipped.
 */
export function scanTrackedFiles(root: string): ControlCharacterFinding[] {
  const findings: ControlCharacterFinding[] = [];
  for (const path of trackedPaths(root)) {
    if (BINARY_EXTENSIONS.includes(extname(path).toLowerCase())) continue;
    const bytes = readRegularFile(join(root, path));
    if (bytes === null) continue;
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
