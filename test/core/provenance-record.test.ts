/**
 * task-294 AC 1 / AC 3 (red-first) — `src/core/provenance-record.ts`, the writer `workflow adopt` and
 * `workflow rekey` share (design "Shared module for task-295"; `spec-017` §4.8, §7.11; `dl-187` "The commit"):
 *
 * - `adoptionSubject` / `adoptionTrailers`: `workflow: adopt <instance> <key> <type>:<id>` and the three trailers
 *   of §4.8, keyed by `src/workflow/provenance.ts`'s constants, in that order;
 * - `provenanceMessage`: the subject, then one body paragraph — `Approver:` (a bulk application only) and the
 *   `Reason:` line;
 * - `writeProvenanceRecord`: one empty commit authored by the given identity, the trailers in the final paragraph
 *   with `WingFoil-Version:` last; refused while the index holds staged changes (`requireCleanIndex`); a dry run
 *   plans `{dryRun: true, subject, message, paths: [], diff: ''}` and writes nothing (`spec-008` §2).
 */
import { requireCleanIndex } from '../../src/core/write-guard';
import { adoptionSubject, adoptionTrailers, provenanceMessage, writeProvenanceRecord } from '../../src/core/provenance-record';
import { captureDryRun } from '../../src/storage/dry-run';
import { ADOPTED_TRAILER, INSTANCE_TRAILER, STEP_TRAILER } from '../../src/workflow/provenance';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const RL_V1 = { type: 'release-line', id: 'rl-v1' };
const SUBJECT = 'workflow: adopt life-1-plan life.seed release-line:rl-v1';
const MORGAN = { name: 'Morgan', email: 'morgan@example.invalid' };
const TRAILERS = ['WingFoil-Instance: life-1-plan', 'WingFoil-Step: life.seed', 'WingFoil-Adopted: release-line:rl-v1'];

describe('task-294 — the adoption subject and trailers (spec-017 §4.8, §7.11)', () => {
  it('adoptionSubject: workflow: adopt <instance> <key> <type>:<id>', () => {
    expect(adoptionSubject('life-1-plan', 'life.seed', RL_V1)).toBe(SUBJECT);
    expect(adoptionSubject('life-1-plan', 'life.adr@release-line:rl-v1', { type: 'adr', id: 'adr-1' })).toBe('workflow: adopt life-1-plan life.adr@release-line:rl-v1 adr:adr-1');
  });

  it("adoptionTrailers: WingFoil-Instance, WingFoil-Step, WingFoil-Adopted, keyed by the reader's constants", () => {
    expect(adoptionTrailers('life-1-plan', 'life.seed', RL_V1)).toEqual(TRAILERS);
    expect(adoptionTrailers('life-1-plan', 'life.seed', RL_V1).map((line: string) => line.slice(0, line.indexOf(':')))).toEqual([INSTANCE_TRAILER, STEP_TRAILER, ADOPTED_TRAILER]);
  });
});

describe('task-294 — provenanceMessage: the subject and one body paragraph', () => {
  it('without an approver: the Reason: line alone', () => {
    expect(provenanceMessage({ subject: SUBJECT, reason: 'created by hand', approver: null })).toBe(`${SUBJECT}\n\nReason: created by hand`);
  });

  it('with an approver (a bulk application): Approver: <name> <<email>> (approver), then the Reason: line, in one paragraph', () => {
    expect(provenanceMessage({ subject: SUBJECT, reason: 'adoption of the pre-engine state', approver: MORGAN })).toBe(
      `${SUBJECT}\n\nApprover: Morgan <morgan@example.invalid> (approver)\nReason: adoption of the pre-engine state`,
    );
  });

  it('a multi-line reason stays one block after the Reason: key', () => {
    expect(provenanceMessage({ subject: SUBJECT, reason: 'line one\n\nline two.', approver: null })).toBe(`${SUBJECT}\n\nReason: line one\n\nline two.`);
  });
});

describe('task-294 — writeProvenanceRecord: one empty commit, the trailers last', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, 'README.md', 'fixture\n');
    commitAll(root, 'fixture');
  });
  afterEach(() => removeTempDir(root));

  const record = { subject: SUBJECT, reason: 'created by hand', approver: null, trailers: TRAILERS };

  it('commits no file, authored by the identity given, the message then the trailer paragraph with WingFoil-Version: last', () => {
    const before = git(root, ['rev-parse', 'HEAD']).trim();

    const result = writeProvenanceRecord(root, MORGAN, record);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(git(root, ['rev-parse', 'HEAD']).trim());
    expect(git(root, ['rev-parse', 'HEAD~1']).trim()).toBe(before);
    expect(git(root, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('');
    expect(git(root, ['log', '-1', '--format=%an <%ae>']).trim()).toBe('Morgan <morgan@example.invalid>');
    const message = git(root, ['log', '-1', '--format=%B']).trim();
    const paragraphs = message.split('\n\n');
    expect(paragraphs.slice(0, 2)).toEqual([SUBJECT, 'Reason: created by hand']);
    const final = paragraphs[2]!.split('\n');
    expect(final.slice(0, 3)).toEqual(TRAILERS);
    expect(final).toHaveLength(4);
    expect(final[3]).toMatch(/^WingFoil-Version: /);
    expect(git(root, ['log', '-1', '--format=%(trailers:key=WingFoil-Adopted,valueonly)']).trim()).toBe('release-line:rl-v1');
  });

  it("is refused while the index holds staged changes, with requireCleanIndex's refusal, and writes nothing", () => {
    writeFixtureFile(root, 'staged.txt', 'x\n');
    git(root, ['add', '--', 'staged.txt']);
    const expected = requireCleanIndex(root, SUBJECT);
    const before = snapshotPersistence(root);

    const result = writeProvenanceRecord(root, MORGAN, record);

    expect(result).toEqual(expected);
    expect(result.ok).toBe(false);
    assertPersistenceUnchanged(root, before, 'staged index');
  });

  it('under a dry run, plans the commit — no paths, no diff — and writes nothing (spec-008 §2)', async () => {
    const before = snapshotPersistence(root);

    const outcome = await captureDryRun(async () => writeProvenanceRecord(root, MORGAN, { ...record, approver: MORGAN }));

    expect(outcome.kind).toBe('planned');
    if (outcome.kind !== 'planned') return;
    expect(outcome.plan).toMatchObject({ dryRun: true, subject: SUBJECT, paths: [], diff: '' });
    const message = (outcome.plan as { message: string }).message;
    expect(message.startsWith(`${SUBJECT}\n\nApprover: Morgan <morgan@example.invalid> (approver)\nReason: created by hand\n\n${TRAILERS.join('\n')}\nWingFoil-Version: `)).toBe(true);
    assertPersistenceUnchanged(root, before, 'dry run');
  });
});
