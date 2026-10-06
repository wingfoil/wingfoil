/**
 * bug-004-dna-set-strips-yaml-comments / task-063 — `wingfoil dna set` must be a MINIMAL,
 * comment-preserving in-place edit, not a whole-file `js-yaml` `dump()` round-trip.
 *
 * The fixture is deliberately **WingFoil's own `.wingfoil/dna.yaml`**, read from this
 * repository at run time: it is the real, comment-dense artefact the bug is about, and the one whose
 * inline `[SPEC]`/`[AUTHORING]` field-provenance annotations carry governance weight (removing or
 * renaming a `[SPEC]` field requires changing the referenced specification first, per the legend
 * `dna.yaml` itself declares in its header). A `dump()` round-trip silently deletes all of them.
 *
 * Exercises the REAL, registered `CORE_MODULES` `dna.dnaSet` operation (the same `CoreFn` behind the
 * CLI `dna set` command and the MCP `dna.set` Tool), in a THROWAWAY temp git repo — this repository's
 * own `.wingfoil/dna.yaml` is only ever READ, never written.
 *
 * Complements `./dna-set.test.ts` (P2.1 fit criteria), which stays the contract for exit codes,
 * commit scoping and schema re-validation; this file owns bug-004's two acceptance criteria only.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { makeTempGitRepo, removeTempDir, writeFixtureFile, commitAll } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

/** WingFoil's own dogfooding Project DNA — the realistic comment-rich fixture bug-004 describes. */
const REAL_DNA = readFileSync(
  join(__dirname, '..', '..', '.wingfoil', 'dna.yaml'),
  'utf-8',
);

/** The real, registered `dna.dnaSet` `CoreFn` — fails loudly if a future change un-registers it. */
function dnaSetFn(): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'dna')?.operations.dnaSet;
  if (!operation) throw new Error('fixture bug: "dnaSet" operation not registered on the dna module');
  return operation.fn;
}

function dnaText(repo: string): string {
  return readFileSync(join(repo, '.wingfoil', 'dna.yaml'), 'utf-8');
}

/** Every whole-line comment, in order — the provenance annotations a `dump()` round-trip destroys. */
function commentLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trimStart().startsWith('#'));
}

/** Count of inline field-provenance markers (`[SPEC]` / `[AUTHORING]`) anywhere in the text. */
function provenanceMarkers(text: string): number {
  return (text.match(/\[SPEC\]|\[SPEC:|\[AUTHORING\]/g) ?? []).length;
}

/** Index-aligned line diff — an insertion shifts indices, so this reports a *minimal* edit honestly. */
function changedLines(before: string, after: string): Array<{ index: number; from: string; to: string }> {
  const b = before.split('\n');
  const a = after.split('\n');
  const changes: Array<{ index: number; from: string; to: string }> = [];
  for (let i = 0; i < Math.max(b.length, a.length); i += 1) {
    if (b[i] !== a[i]) changes.push({ index: i, from: b[i] ?? '<eof>', to: a[i] ?? '<eof>' });
  }
  return changes;
}

describe('dna.dnaSet — bug-004: a comment-rich dna.yaml survives a set (task-063)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', REAL_DNA);
    commitAll(repo, 'seed WingFoil own dna.yaml');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('the fixture is genuinely comment-rich (guard: the test would be vacuous otherwise)', () => {
    expect(commentLines(REAL_DNA).length).toBeGreaterThan(20);
    expect(provenanceMarkers(REAL_DNA)).toBeGreaterThan(5);
  });

  it('AC(b): every comment line — including the [SPEC]/[AUTHORING] provenance annotations — survives a set', async () => {
    const result = await dnaSetFn()({ root: repo, positionals: ['project.name'], options: { value: 'WingFoil Renamed' } });
    expect(result.ok).toBe(true);

    const after = dnaText(repo);
    expect(commentLines(after)).toEqual(commentLines(REAL_DNA));
    expect(provenanceMarkers(after)).toBe(provenanceMarkers(REAL_DNA));
  });

  it('AC(a): ONLY the target value changes — exactly one line differs, and it is the target key line', async () => {
    const result = await dnaSetFn()({ root: repo, positionals: ['project.name'], options: { value: 'WingFoil Renamed' } });
    expect(result.ok).toBe(true);

    const changes = changedLines(REAL_DNA, dnaText(repo));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.from).toBe('  name: WingFoil');
    expect(changes[0]!.to).toBe('  name: WingFoil Renamed');
  });

  it('an inline trailing comment on the edited line is kept (the annotation lives ON the field line)', async () => {
    // `methodology: custom            # see .wingfoil/workflows.yaml (main: sw-life-cycle)`
    const result = await dnaSetFn()({ root: repo, positionals: ['project.methodology'], options: { value: 'scrum' } });
    expect(result.ok).toBe(true);

    const line = dnaText(repo)
      .split('\n')
      .find((candidate) => candidate.trimStart().startsWith('methodology:'));
    expect(line).toContain('methodology: scrum');
    expect(line).toContain('# see .wingfoil/workflows.yaml (main: sw-life-cycle)');
  });

  it('REQ-SYS-07: the written bytes are a pure function of (file, key, value) — two independent repos agree', async () => {
    const second = makeTempGitRepo();
    try {
      writeFixtureFile(second, '.wingfoil/dna.yaml', REAL_DNA);
      commitAll(second, 'seed WingFoil own dna.yaml');

      await dnaSetFn()({ root: repo, positionals: ['project.name'], options: { value: 'WingFoil Renamed' } });
      await dnaSetFn()({ root: second, positionals: ['project.name'], options: { value: 'WingFoil Renamed' } });

      expect(dnaText(second)).toBe(dnaText(repo));
    } finally {
      removeTempDir(second);
    }
  });

  it('a key absent from the file is inserted into its parent block, adding exactly one line and no comment loss', async () => {
    // task-093/bug-084: the inserted key must be one the SCHEMA declares — an undeclared key is now
    // refused at exit 1 rather than created. `stacks.technologies` carries a `version?` field that the
    // `Zod` entry does not fill, so this still exercises "absent key, inserted in place", and it does
    // so inside a sequence entry, which is the shape `setDnaValueInText` alone could never reach.
    const result = await dnaSetFn()({ root: repo, positionals: ['stacks.technologies.Zod.version'], options: { value: '4.4.3' } });
    expect(result.ok).toBe(true);

    const after = dnaText(repo);
    expect(commentLines(after)).toEqual(commentLines(REAL_DNA));
    expect(after.split('\n')).toHaveLength(REAL_DNA.split('\n').length + 1);
    expect(after).toContain('\n    - name: Zod\n      category: validation\n      version: 4.4.3\n');

    // ...and it really is inside that entry, not appended somewhere that merely looks right.
    const changed = execFileSync('git', ['-C', repo, 'show', '--name-only', '--format=', 'HEAD'], {
      encoding: 'utf-8',
    }).trim();
    expect(changed).toBe('.wingfoil/dna.yaml');
  });

  it('a set to the current value stays an idempotent no-op on the comment-rich file (byte-identical, no commit)', async () => {
    const before = dnaText(repo);
    const unchanged = snapshotPersistence(repo);
    const result = await dnaSetFn()({ root: repo, positionals: ['project.name'], options: { value: 'WingFoil' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.commit).toBeUndefined();
    expect(dnaText(repo)).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });
});
