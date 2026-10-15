/**
 * task-245 H1 (`bug-275`) — the vision describes the default state machine `spec-001` declares:
 * `draft → pending → approved`, `reject` back to `draft`, `deprecated` from any state. There is no
 * `rejected` status (`spec-001-memory-yaml-schema`), yet nine lines of `docs/01_vision/` still gave the
 * default machine an `approved/rejected` state (`X_cli-cmds.md`, `06_features.md`, `07_sequencer.md`,
 * `08_mvp-canvas.md`). Each corrected file takes a `doc-versioning` bump; the pins are "≥" (bug-314).
 * `X_cli-cmds.md`'s revision history is a record and is not scanned (task-245 decision D1).
 *
 * Deterministic: the vision files are read in sorted order.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VISION = join(__dirname, '..', '..', 'docs', '01_vision');

/** Numeric `major.minor` comparison. */
function versionAtLeast(actual: string, floor: string): boolean {
  const [a1, a2] = actual.split('.').map(Number) as [number, number];
  const [f1, f2] = floor.split('.').map(Number) as [number, number];
  return a1 > f1 || (a1 === f1 && a2 >= f2);
}

describe('no vision line gives the default state machine a rejected state (bug-275)', () => {
  it('`grep -nE "approved/rejected|approved, rejected" docs/01_vision/*.md` finds nothing outside revision history', () => {
    const hits: string[] = [];
    for (const file of readdirSync(VISION).filter((name) => name.endsWith('.md')).sort()) {
      let text = readFileSync(join(VISION, file), 'utf8');
      if (file === 'X_cli-cmds.md') {
        const at = text.indexOf('\n## Revision history');
        if (at >= 0) text = text.slice(0, at);
      }
      text.split('\n').forEach((line, index) => {
        if (/approved\/rejected|approved, rejected/.test(line)) hits.push(`${file}:${index + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it.each([
    ['X_cli-cmds.md', '1.7'],
    ['06_features.md', '1.15'],
    ['07_sequencer.md', '1.10'],
    ['08_mvp-canvas.md', '1.12'],
  ])('%s is bumped to version %s or later', (file, floor) => {
    const version = /^\*\*Version:\*\* (\d+\.\d+)/m.exec(readFileSync(join(VISION, file), 'utf8'))?.[1];
    expect(version).toBeDefined();
    expect({ file, version, atLeast: versionAtLeast(version as string, floor) }).toEqual({ file, version, atLeast: true });
  });
});
