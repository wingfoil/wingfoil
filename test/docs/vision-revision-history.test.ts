/**
 * A vision document's `**Version:**` is tied to its revision history (`bug-383`,
 * `task-322-tie-vision-version-bumps-to-their-revision-entries-and-the-case-study-s-figures-to-the-release-health-reports`,
 * approver design gate D1 (a)).
 *
 * `doc-versioning` makes every edit of a vision document bump its `**Version:**`, and the documents that keep a
 * `## Revision history` record the bump there. Nothing checked that the two agree: a bump with no entry passed.
 * The rule, in `./support/vision-revision-history.ts` (pure, no I/O): a document is *judged* when it carries a
 * `**Version:** X.Y` line and a `## Revision history` heading outside fenced code (D1 (a): only documents that keep
 * a history are judged, so a document that does not keep one is not asked to start one); a judged document has an
 * entry `**Version X.Y (YYYY-MM-DD)` for its header version, dated as its header `**Date:**` (trailing spaces
 * trimmed), no entry newer than the header (compared numerically on `major.minor`: 1.17 is above 1.9) and its
 * entries strictly descending.
 *
 * T1: red-first. The support module does not exist at the red commit, so this suite fails on the missing import
 * (`tsc`: TS2307; jest: "Cannot find module"). Offline and deterministic: the folder is listed with
 * `readdirSync(...).sort()` and read from the working tree; no clock, no network, no git. The synthetic inputs are
 * cut from the real header lines and entry lines of `docs/01_vision/X_cli-cmds.md` (`**Version:** 1.9`,
 * `**Date:** 2026-10-25` with its two trailing spaces, `**Version 1.9 (2026-10-25) — …`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isJudged, revisionHistoryFindings } from './support/vision-revision-history';

const VISION = join(__dirname, '..', '..', 'docs', '01_vision');
const files = readdirSync(VISION)
  .filter((name) => name.endsWith('.md'))
  .sort();

const DASH = '—';

/** A vision document cut down to a header, a revision history and what the test varies. */
function document(header: { version: string; date: string }, entries: [string, string][]): string {
  return [
    '# CLI Commands Reference — WingFoil',
    '',
    `**Version:** ${header.version}`,
    `**Date:** ${header.date}  `,
    '**Status:** Approved',
    '',
    '---',
    '',
    '## Revision history',
    '',
    ...entries.flatMap(([version, date]) => [`**Version ${version} (${date}) ${DASH} \`workflow rekey\` gets its row, per \`task-295\`.**`, '']),
  ].join('\n');
}

describe('task-322 — AC 1: a vision document\'s version has its revision entry (bug-383, D1 (a))', () => {
  it('V1: every docs/01_vision document passes, and the judged ones are exactly X_cli-cmds.md', () => {
    expect(files).toContain('X_cli-cmds.md');
    const texts = files.map((name) => [name, readFileSync(join(VISION, name), 'utf8')] as const);
    const findings = texts.flatMap(([name, text]) => revisionHistoryFindings(name, text));
    expect(findings).toEqual([]);
    expect(texts.filter(([, text]) => isJudged(text)).map(([name]) => name)).toEqual(['X_cli-cmds.md']);
  });

  it('V2: a header and entries that agree give no finding', () => {
    const text = document({ version: '1.9', date: '2026-10-25' }, [
      ['1.9', '2026-10-25'],
      ['1.8', '2026-10-25'],
    ]);
    expect(isJudged(text)).toBe(true);
    expect(revisionHistoryFindings('X_cli-cmds.md', text)).toEqual([]);
  });

  it('V3: a header bumped to 1.10 with no 1.10 entry gives one finding naming the file and 1.10 (bug-383\'s reproduction)', () => {
    const text = document({ version: '1.10', date: '2026-10-26' }, [
      ['1.9', '2026-10-25'],
      ['1.8', '2026-10-25'],
    ]);
    const findings = revisionHistoryFindings('X_cli-cmds.md', text);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('X_cli-cmds.md');
    expect(JSON.stringify(findings[0])).toContain('1.10');
  });

  it('V4: an entry dated otherwise than the header gives one finding naming 1.9', () => {
    const text = document({ version: '1.9', date: '2026-10-25' }, [
      ['1.9', '2026-10-24'],
      ['1.8', '2026-10-24'],
    ]);
    const findings = revisionHistoryFindings('X_cli-cmds.md', text);
    expect(findings).toHaveLength(1);
    expect(JSON.stringify(findings[0])).toContain('1.9');
  });

  it('V5: an entry newer than the header gives one finding naming 1.10', () => {
    const text = document({ version: '1.9', date: '2026-10-25' }, [
      ['1.10', '2026-10-25'],
      ['1.9', '2026-10-25'],
      ['1.8', '2026-10-25'],
    ]);
    const findings = revisionHistoryFindings('X_cli-cmds.md', text);
    expect(findings).toHaveLength(1);
    expect(JSON.stringify(findings[0])).toContain('1.10');
  });

  it('V6: entries not strictly descending give one finding (1.8 above 1.9; 1.9 twice)', () => {
    const ascending = document({ version: '1.9', date: '2026-10-25' }, [
      ['1.8', '2026-10-25'],
      ['1.9', '2026-10-25'],
    ]);
    expect(revisionHistoryFindings('X_cli-cmds.md', ascending)).toHaveLength(1);
    const twice = document({ version: '1.9', date: '2026-10-25' }, [
      ['1.9', '2026-10-25'],
      ['1.9', '2026-10-25'],
      ['1.8', '2026-10-25'],
    ]);
    expect(revisionHistoryFindings('X_cli-cmds.md', twice)).toHaveLength(1);
  });

  it('V7: a document with no "## Revision history" is not judged (D1 (a)) and gives no finding', () => {
    const text = ['# Product Brief', '', '**Version:** 1.11', '**Date:** 2026-10-18', '**Status:** Approved', '', '## Identity', ''].join('\n');
    expect(isJudged(text)).toBe(false);
    expect(revisionHistoryFindings('01_product-brief.md', text)).toEqual([]);
  });

  it('V8: a document with no "**Version:**" line is not judged and gives no finding', () => {
    const text = ['# Index', '', '## Revision history', '', `**Version 1.9 (2026-10-25) ${DASH} an entry.**`, ''].join('\n');
    expect(isJudged(text)).toBe(false);
    expect(revisionHistoryFindings('00_index.md', text)).toEqual([]);
  });

  it('V9: a "## Revision history" only inside a fenced block is not a heading, so the document is not judged', () => {
    const text = ['# Doc', '', '**Version:** 1.9', '**Date:** 2026-10-25  ', '', '```markdown', '## Revision history', '```', ''].join('\n');
    expect(isJudged(text)).toBe(false);
    expect(revisionHistoryFindings('doc.md', text)).toEqual([]);
  });

  it('V10: versions compare numerically on major.minor: a header 1.17 with entries 1.17 and 1.9 passes', () => {
    const text = document({ version: '1.17', date: '2026-10-25' }, [
      ['1.17', '2026-10-25'],
      ['1.9', '2026-10-25'],
    ]);
    expect(revisionHistoryFindings('06_features.md', text)).toEqual([]);
  });
});
