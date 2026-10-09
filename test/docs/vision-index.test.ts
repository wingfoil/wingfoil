/**
 * `bug-270` (absorbed by task-212, the `vision-change` workflow's index element, `dl-132` element 5):
 * `docs/01_vision/00_index.md` tells agents to read only the `Lx–Ly` ranges it cites, valid for the version,
 * date and line count its document map records. This suite checks both against the vision files, so an edit
 * that does not update the index in the same change fails here instead of drifting (as `X_cli-cmds.md`'s rows
 * did between `task-141` and `task-186`). `vision-change`'s `update-vision` and `schedule` phases bind their
 * `vision-index.current` check to this file (`.wingfoil/workflows/bindings.yaml`).
 *
 * The checker (`support/vision-index.ts`) parses fences instead of hard-coding the `#` lines inside them
 * (`bug-270` step 4: `task-141`'s script skips `06_features.md` lines 380 and 414, and reports a false
 * mismatch once they moved to 381 and 415). Characterization against the current index; the synthetic
 * cases show each kind of drift is caught.
 *
 * Deterministic: findings in index order; synthetic inputs fixed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { headings, lineCount, visionIndexFindings } from './support/vision-index';

const VISION = join(__dirname, '..', '..', 'docs', '01_vision');

function readVision(file: string): string | null {
  const path = join(VISION, file);
  return existsSync(path) ? readFileSync(path, 'utf-8') : null;
}

describe('docs/01_vision/00_index.md matches the vision files (bug-270)', () => {
  it('every document-map row and every section range is current', () => {
    expect(visionIndexFindings(readVision('00_index.md')!, readVision)).toEqual([]);
  });
});

describe('the checker catches each kind of drift (synthetic inputs)', () => {
  const doc = [
    '# Title', //                                         1
    '', //                                                2
    '**Version:** 1.2', //                                3
    '**Date:** 2026-10-09', //                            4
    '', //                                                5
    '## First', //                                        6
    'text', //                                            7
    '```yaml', //                                         8
    '# not a heading', //                                 9
    '```', //                                             10
    '### Sub', //                                         11
    'text', //                                            12
    '## Second', //                                       13
    'end', //                                             14
  ].join('\n') + '\n';

  function index(row: string, ranges: string): string {
    return [
      '| Document | Ver | Date | Status | Lines | What |',
      '|---|---|---|---|---|---|',
      row,
      '',
      '## Per-document section maps',
      '',
      '### `a.md`',
      '',
      ranges,
      '',
      '---',
      '',
    ].join('\n');
  }
  const ROW = '| [`a.md`](a.md) | 1.2 | 2026-10-09 | Approved | 14 | a |';
  const RANGES = '- First — L6–12 (Sub L11–12)\n- Second — L13–14';
  const read = (file: string): string | null => (file === 'a.md' ? doc : null);

  it('a consistent index has no finding; a `#` line inside a fence is not a heading', () => {
    expect(lineCount(doc)).toBe(14);
    expect([...headings(doc).keys()]).toEqual([1, 6, 11, 13]);
    expect(visionIndexFindings(index(ROW, RANGES), read)).toEqual([]);
  });

  it('a stale version, date or line count in the document map', () => {
    expect(visionIndexFindings(index('| [`a.md`](a.md) | 1.1 | 2026-10-01 | Approved | 13 | a |', RANGES), read)).toEqual([
      { file: 'a.md', what: 'version', indexed: '1.1', actual: '1.2' },
      { file: 'a.md', what: 'date', indexed: '2026-10-01', actual: '2026-10-09' },
      { file: 'a.md', what: 'lines', indexed: '13', actual: '14' },
    ]);
  });

  it('a range that does not start on a heading, or does not end where its section ends', () => {
    expect(visionIndexFindings(index(ROW, '- First — L7–12\n- Second — L13–13\n- Sub — L9–10'), read)).toEqual([
      { file: 'a.md', what: 'range start', indexed: 'L7–12', actual: 'line 7 is not a heading' },
      { file: 'a.md', what: 'range end', indexed: 'L13–13', actual: 'L13–14' },
      { file: 'a.md', what: 'range start', indexed: 'L9–10', actual: 'line 9 is not a heading' },
    ]);
  });

  it('a listed file that does not exist, and an index with no map', () => {
    expect(visionIndexFindings(index('| [`b.md`](b.md) | 1.0 | 2026-10-09 | Approved | 3 | b |', RANGES), read)).toEqual([
      { file: 'b.md', what: 'file', indexed: 'listed', actual: 'missing' },
    ]);
    expect(visionIndexFindings('# empty', read).map((finding) => finding.what)).toEqual(['document map', 'section maps']);
  });
});
