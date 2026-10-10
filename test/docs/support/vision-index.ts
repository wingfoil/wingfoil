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
 * - **Coverage** (independent review of task-212). Every vision file other than `00_index.md` has exactly one
 *   document-map row and one section-map block, and every row parses (a malformed `Lines` cell is a finding, not a
 *   skipped row).
 * - **Anchors.** Every single-line reference `Lx` in a section map, and every reference in *Quick lookup* (single
 *   line or range), starts on a heading of the file it names, except the anchors {@link INDEX_ANCHORS}
 *   declares — references into prose on purpose. A *Quick lookup* range may span sections, so only its start
 *   is checked.
 * - **Spelling.** A range is written with an en dash (`L22–30`); a hyphen range (`L22-30`) is a finding, since the
 *   checks above would not read it.
 *
 * Pure: the caller passes the index text, a reader for the other files and, to check coverage, the vision
 * files that exist. Findings come back in the order the index lists them, then coverage.
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

/**
 * References that point into prose on purpose (`file:Lx` or `file:Lx–y`), not at a heading — the
 * primary-persona notes (cited in *Quick lookup* and in the section maps) and the P4.18–P4.20 rows. A new one is
 * added here deliberately, in the same change as the index.
 */
export const INDEX_ANCHORS: ReadonlySet<string> = new Set(['01_product-brief.md:L108', '08_mvp-canvas.md:L57', '06_features.md:L102–104']);

/** The text of the `## <title>` section of `index`, up to the next `---` rule or `## ` heading. */
function section(index: string, title: RegExp): string | null {
  const lines = index.split('\n');
  const start = lines.findIndex((line) => title.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line === '---' || line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

const ROW = /^\| \[`([^`]+)`\]\([^)]*\)\s*\|\s*(\S+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|[^|]*\|\s*(\d+)\s*\|[^|]*\|$/;

/**
 * Every finding of `index` against the files `read` returns (`null` = the file does not exist). With `files`
 * (the vision folder's `*.md`), also every file not covered by exactly one row and one block.
 */
export function visionIndexFindings(index: string, read: (file: string) => string | null, files?: readonly string[]): VisionIndexFinding[] {
  const findings: VisionIndexFinding[] = [];
  const missing = (file: string): void => {
    findings.push({ file, what: 'file', indexed: 'listed', actual: 'missing' });
  };
  const rowsOf = new Map<string, number>();
  const blocksOf = new Map<string, number>();

  for (const [, range] of index.matchAll(/\b(L\d+-\d+)\b/g)) {
    findings.push({ file: '00_index.md', what: 'range spelling', indexed: range!, actual: 'an en dash range (Lx–y)' });
  }

  const map = section(index, /^## Document map/) ?? index;
  const rowLines = map.split('\n').filter((line) => line.startsWith('| ['));
  if (rowLines.length === 0) findings.push({ file: '00_index.md', what: 'document map', indexed: 'no rows', actual: 'rows expected' });
  for (const line of rowLines) {
    const row = ROW.exec(line.trimEnd());
    if (row === null) {
      findings.push({ file: '00_index.md', what: 'row', indexed: line.trim(), actual: 'unparseable (| [`file`](file) | Ver | YYYY-MM-DD | Status | Lines | What |)' });
      continue;
    }
    const [, file, version, date, lines] = row;
    rowsOf.set(file!, (rowsOf.get(file!) ?? 0) + 1);
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
  } else {
    const blocks = maps.split(/^---$/m)[0]!.split(/^### `/m).slice(1);
    for (const block of blocks) {
      const file = block.slice(0, block.indexOf('`'));
      blocksOf.set(file, (blocksOf.get(file) ?? 0) + 1);
      const text = read(file);
      if (text === null) {
        missing(file);
        continue;
      }
      const levels = headings(text);
      const total = lineCount(text);
      for (const [ref, from, to] of block.matchAll(/L(\d+)(?:–(\d+))?/g)) {
        const start = Number(from);
        if (to === undefined && INDEX_ANCHORS.has(`${file}:${ref!}`)) continue;
        if (!levels.has(start)) {
          findings.push({ file, what: to === undefined ? 'anchor' : 'range start', indexed: ref!, actual: `line ${start} is not a heading` });
          continue;
        }
        if (to === undefined) continue;
        const end = sectionEnd(levels, start, total);
        if (end !== Number(to)) findings.push({ file, what: 'range end', indexed: ref!, actual: `L${start}–${end}` });
      }
    }
  }

  const lookup = section(index, /^## Quick lookup/);
  if (lookup === null) {
    findings.push({ file: '00_index.md', what: 'quick lookup', indexed: 'absent', actual: 'a "## Quick lookup" section' });
  } else {
    for (const line of lookup.split('\n').filter((candidate) => candidate.startsWith('|'))) {
      const cells = line.split('|');
      const goTo = cells[cells.length - 2] ?? '';
      let file: string | null = null;
      for (const [, stem, ref, from] of goTo.matchAll(/`([^`]+)`|(L(\d+)(?:–\d+)?)/g)) {
        if (stem !== undefined) {
          file = /^(?:\d\d|X)_[A-Za-z0-9-]+$/.test(stem) ? `${stem}.md` : file;
          continue;
        }
        if (file === null || INDEX_ANCHORS.has(`${file}:${ref!}`)) continue;
        const text = read(file);
        if (text === null) {
          missing(file);
          continue;
        }
        if (!headings(text).has(Number(from))) findings.push({ file, what: 'quick lookup', indexed: ref!, actual: `line ${from} is not a heading` });
      }
    }
  }

  for (const file of [...(files ?? [])].filter((name) => name !== '00_index.md').sort()) {
    if ((rowsOf.get(file) ?? 0) !== 1) findings.push({ file, what: 'document-map rows', indexed: String(rowsOf.get(file) ?? 0), actual: '1' });
    if ((blocksOf.get(file) ?? 0) !== 1) findings.push({ file, what: 'section-map blocks', indexed: String(blocksOf.get(file) ?? 0), actual: '1' });
  }
  return findings;
}
