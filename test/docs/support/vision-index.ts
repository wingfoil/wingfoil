/**
 * The `docs/01_vision/00_index.md` check (`bug-270`; `task-141`'s one-line script made robust): the
 * document map and the per-document section ranges against the vision files themselves.
 *
 * - **Document map.** Each row's `Ver`, `Date` and `Lines` equal the file's header `**Version:**`
 *   (`—` when it has none), `**Date:**` and its line count (`awk 'END{print NR}'`: a final newline ends the
 *   last line, it does not start another).
 * - **Section ranges.** Every `Lx–Ly` range in a `### \`file\`` block of *Per-document section maps* starts
 *   on a heading line of that file and ends on the line before the next heading of the same or a higher
 *   level (the last line of the file when there is none) — the rule the index states in *How to use this
 *   index*. Headings inside fenced code are not headings: fences are parsed (a line opening with
 *   three backticks or tildes toggles), never skipped by line number, which is what broke `task-141`'s
 *   script once `06_features.md` moved (`bug-270` step 4).
 *
 * Pure: the caller passes the index text and a reader for the other files. Findings come back in the
 * order the index lists them.
 */

/** One way the index disagrees with a vision file. */
export interface VisionIndexFinding {
  readonly file: string;
  readonly what: string;
  readonly indexed: string;
  readonly actual: string;
}

/** The number of lines `awk 'END{print NR}'` counts. */
export function lineCount(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

/** Line number (1-based) → heading level, for every heading outside fenced code. */
export function headings(text: string): Map<number, number> {
  const levels = new Map<number, number>();
  let fence: string | null = null;
  text.split('\n').forEach((line, index) => {
    const opener = /^(```|~~~)/.exec(line)?.[1];
    if (opener !== undefined) {
      if (fence === null) fence = opener;
      else if (opener === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const hashes = /^(#+) /.exec(line)?.[1];
    if (hashes !== undefined) levels.set(index + 1, hashes.length);
  });
  return levels;
}

/** Where the section that starts at heading line `start` ends. */
function sectionEnd(levels: Map<number, number>, start: number, total: number): number {
  const level = levels.get(start)!;
  const next = [...levels.entries()].find(([line, other]) => line > start && other <= level);
  return next === undefined ? total : next[0] - 1;
}

function header(text: string, key: string): string | null {
  return new RegExp(`^\\*\\*${key}:\\*\\* (\\S+)`, 'm').exec(text)?.[1] ?? null;
}

/** Every finding of `index` against the files `read` returns (`null` = the file does not exist). */
export function visionIndexFindings(index: string, read: (file: string) => string | null): VisionIndexFinding[] {
  const findings: VisionIndexFinding[] = [];
  const missing = (file: string): void => {
    findings.push({ file, what: 'file', indexed: 'listed', actual: 'missing' });
  };

  const rows = [...index.matchAll(/^\| \[`([^`]+)`\][^|]*\|\s*(\S+)\s*\|\s*(\S+)\s*\|[^|]*\|\s*(\d+)\s*\|/gm)];
  if (rows.length === 0) findings.push({ file: '00_index.md', what: 'document map', indexed: 'no rows', actual: 'rows expected' });
  for (const [, file, version, date, lines] of rows) {
    const text = read(file!);
    if (text === null) {
      missing(file!);
      continue;
    }
    const actual = { version: header(text, 'Version') ?? '—', date: header(text, 'Date') ?? '—', lines: String(lineCount(text)) };
    if (version !== actual.version) findings.push({ file: file!, what: 'version', indexed: version!, actual: actual.version });
    if (date !== actual.date) findings.push({ file: file!, what: 'date', indexed: date!, actual: actual.date });
    if (lines !== actual.lines) findings.push({ file: file!, what: 'lines', indexed: lines!, actual: actual.lines });
  }

  const maps = index.split(/^## Per-document section maps$/m)[1];
  if (maps === undefined) {
    findings.push({ file: '00_index.md', what: 'section maps', indexed: 'absent', actual: 'a "## Per-document section maps" section' });
    return findings;
  }
  const blocks = maps.split(/^---$/m)[0]!.split(/^### `/m).slice(1);
  for (const block of blocks) {
    const file = block.slice(0, block.indexOf('`'));
    const text = read(file);
    if (text === null) {
      missing(file);
      continue;
    }
    const levels = headings(text);
    const total = lineCount(text);
    for (const [, from, to] of block.matchAll(/L(\d+)–(\d+)/g)) {
      const start = Number(from);
      const indexed = `L${from}–${to}`;
      if (!levels.has(start)) {
        findings.push({ file, what: 'range start', indexed, actual: `line ${start} is not a heading` });
        continue;
      }
      const end = sectionEnd(levels, start, total);
      if (end !== Number(to)) findings.push({ file, what: 'range end', indexed, actual: `L${start}–${end}` });
    }
  }
  return findings;
}
