/**
 * The rule that ties a vision document's `**Version:**` to its revision history (`bug-383`, `task-322`).
 *
 * A document is judged when it carries a `**Version:** X.Y` line and a `## Revision history` heading outside
 * fenced code. A judged document has an entry `**Version X.Y (YYYY-MM-DD)` for its header version, dated as its
 * header `**Date:**`, no entry newer than the header (numeric `major.minor`), and entries strictly descending.
 * Pure: no I/O, no clock.
 */

export interface RevisionHistoryFinding {
  readonly file: string;
  readonly what: string;
  readonly expected: string;
  readonly actual: string;
}

interface Entry {
  readonly version: string;
  readonly date: string;
}

interface Parsed {
  readonly version: string | null;
  readonly date: string | null;
  readonly hasHistory: boolean;
  readonly entries: Entry[];
}

const VERSION_LINE = /^\*\*Version:\*\*\s*(\d+\.\d+)\s*$/;
const DATE_LINE = /^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})\s*$/;
const HISTORY_HEADING = /^##\s+Revision history\s*$/;
const ENTRY_LINE = /^\*\*Version (\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)/;
const FENCE = /^\s*(```|~~~)/;

function parse(text: string): Parsed {
  let version: string | null = null;
  let date: string | null = null;
  let hasHistory = false;
  const entries: Entry[] = [];
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const v = VERSION_LINE.exec(line);
    if (v && version === null) version = v[1]!;
    const d = DATE_LINE.exec(line);
    if (d && date === null) date = d[1]!;
    if (HISTORY_HEADING.test(line)) {
      hasHistory = true;
      continue;
    }
    if (hasHistory) {
      const e = ENTRY_LINE.exec(line);
      if (e) entries.push({ version: e[1]!, date: e[2]! });
    }
  }
  return { version, date, hasHistory, entries };
}

function compare(a: string, b: string): number {
  const [am, an] = a.split('.').map(Number) as [number, number];
  const [bm, bn] = b.split('.').map(Number) as [number, number];
  return am !== bm ? am - bm : an - bn;
}

/** Whether the rule applies to the document: a `**Version:**` line and a `## Revision history` heading. */
export function isJudged(text: string): boolean {
  const p = parse(text);
  return p.version !== null && p.hasHistory;
}

/** The findings of the document, in document order; `[]` when it is not judged or consistent. */
export function revisionHistoryFindings(file: string, text: string): RevisionHistoryFinding[] {
  const p = parse(text);
  if (p.version === null || !p.hasHistory) return [];
  const findings: RevisionHistoryFinding[] = [];
  const own = p.entries.find((e) => e.version === p.version);
  if (!own) {
    findings.push({
      file,
      what: `**Version:** ${p.version} has no revision-history entry`,
      expected: `an entry "**Version ${p.version} (${p.date ?? 'date'})"`,
      actual: p.entries.length === 0 ? 'no entries' : `entries ${p.entries.map((e) => e.version).join(', ')}`,
    });
  } else if (p.date !== null && own.date !== p.date) {
    findings.push({
      file,
      what: `the entry for version ${p.version} is dated otherwise than the header`,
      expected: p.date,
      actual: own.date,
    });
  }
  for (const e of p.entries) {
    if (compare(e.version, p.version) > 0) {
      findings.push({
        file,
        what: `the entry for version ${e.version} is newer than the header version ${p.version}`,
        expected: `no entry above ${p.version}`,
        actual: e.version,
      });
    }
  }
  for (let i = 1; i < p.entries.length; i++) {
    const prev = p.entries[i - 1]!;
    const cur = p.entries[i]!;
    if (compare(cur.version, prev.version) >= 0) {
      findings.push({
        file,
        what: `version ${cur.version} follows version ${prev.version}: entries are not strictly descending`,
        expected: `an entry below ${prev.version}`,
        actual: cur.version,
      });
    }
  }
  return findings;
}
