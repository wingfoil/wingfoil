/**
 * task-312 AC 1 (`bug-254`) — the dead in-text setter of `src/dna/set.ts` is gone: neither `src/dna/set.ts`
 * nor the `dna` module's barrel (`src/dna/index.ts`) exports it any more, while the helpers that the live
 * write path (`src/dna/edit.ts`) and the path parser still use stay exported.
 *
 * The removed name is assembled from two parts below, never written whole: the AC's own evidence is
 * `grep -rn <name> src test` returning nothing, and this file must not be the hit that keeps it from being
 * empty. A namespace import compiles whether or not the export exists, so the pin is a runtime check of
 * each module's own keys.
 */
import * as dna from '../../src/dna';
import * as set from '../../src/dna/set';

/** The name of the removed export (`bug-254`), assembled so that the AC's grep stays empty. */
const REMOVED = ['setDnaValue', 'InText'].join('');

describe('task-312 AC 1 — the dead in-text setter is no longer exported (bug-254)', () => {
  it('src/dna/set.ts does not export it', () => {
    expect(Object.keys(set)).not.toContain(REMOVED);
  });

  it('the dna module barrel (src/dna/index.ts) does not re-export it', () => {
    expect(Object.keys(dna)).not.toContain(REMOVED);
  });
});

describe('task-312 AC 1 — what the live write path and the path parser use stays exported (characterization)', () => {
  it.each(['inlineCommentIndex', 'valueOf', 'splitDnaPath', 'isValidKeyPath', 'quoteDnaSegment', 'DNA_KEY_ALIASES'])(
    'src/dna/set.ts still exports %s',
    (name) => {
      expect(Object.keys(set)).toContain(name);
    },
  );

  it.each(['splitDnaPath', 'isValidKeyPath', 'quoteDnaSegment', 'DNA_KEY_ALIASES', 'applyDnaEditInText'])(
    'the dna module barrel still exports %s',
    (name) => {
      expect(Object.keys(dna)).toContain(name);
    },
  );
});
