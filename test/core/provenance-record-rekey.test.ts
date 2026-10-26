/**
 * task-295 AC 1–2 (`spec-017` §4.8, §7.12; design "The commit") — the rekey builders task-295 adds beside
 * task-294's adoption builders in `src/core/provenance-record.ts` (task-294's `#### Shared module for task-295`):
 *
 * - `rekeySubject(instance, from, to)` is `workflow: rekey <instance> <from> <to>`;
 * - `rekeyTrailers(instance, from, to)` is `WingFoil-Instance`, `WingFoil-Rekey-From`, `WingFoil-Rekey-To`, in that
 *   order, the keys being the ones `src/workflow/provenance.ts` reads back (task-293);
 * - `provenanceMessage` (task-294's) of a rekey: the subject, a blank line, `Approver: <name> <<email>> (approver)`
 *   then `Reason: <reason>` in one paragraph.
 *
 * Red until the module exists with these exports: TS2307 while `src/core/provenance-record.ts` is not on this
 * branch (task-294 is not merged yet), TS2305 once it is and until green; "Cannot find module", then a runtime
 * TypeError, under jest.
 */
import { provenanceMessage, rekeySubject, rekeyTrailers } from '../../src/core/provenance-record';
import { INSTANCE_TRAILER, REKEY_FROM_TRAILER, REKEY_SUBJECT_PREFIX, REKEY_TO_TRAILER } from '../../src/workflow/provenance';

describe('task-295 — the rekey record builders', () => {
  it('rekeySubject: "workflow: rekey <instance> <from> <to>"', () => {
    const subject = rekeySubject('life-1-plan', 'life.seed', 'life.seed-line');
    expect(subject).toBe('workflow: rekey life-1-plan life.seed life.seed-line');
    expect(subject.startsWith(REKEY_SUBJECT_PREFIX)).toBe(true);
  });

  it('rekeyTrailers: instance, from, to — with the keys the deduction reads', () => {
    expect(rekeyTrailers('life-1-plan', 'life.seed', 'life.seed-line')).toEqual([
      'WingFoil-Instance: life-1-plan',
      'WingFoil-Rekey-From: life.seed',
      'WingFoil-Rekey-To: life.seed-line',
    ]);
    expect([INSTANCE_TRAILER, REKEY_FROM_TRAILER, REKEY_TO_TRAILER]).toEqual(['WingFoil-Instance', 'WingFoil-Rekey-From', 'WingFoil-Rekey-To']);
  });

  it('provenanceMessage of a rekey: the subject, then Approver: and Reason: in one paragraph', () => {
    const subject = rekeySubject('life-1-plan', 'life.seed', 'life.seed-line');
    expect(provenanceMessage({ subject, reason: 'phase renamed', approver: { name: 'Morgan', email: 'morgan@example.invalid' } })).toBe(
      'workflow: rekey life-1-plan life.seed life.seed-line\n\nApprover: Morgan <morgan@example.invalid> (approver)\nReason: phase renamed',
    );
  });
});
