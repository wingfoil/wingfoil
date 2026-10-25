/**
 * task-295 AC 2 (design D6, D1 step 3; `spec-017` §7.12, §10) — the pure parts of `workflow rekey` in
 * `src/core/workflow-rekey.ts`, reached by path:
 *
 * - `REKEY_UNAUTHORIZED` is §10's refusal text, `user not authorized to rekey`;
 * - `renderRekeyConsole` prints the D6 lines exactly: `workflow: <workflow> (<instance>)`, then
 *   `rekeyed: <from> -> <to>, <n> record(s) remapped (<commit>)` when a commit was written or
 *   `already rekeyed: <from> -> <to>, nothing written` on the no-op, then the next step's lines or `no next step`.
 *
 * Whether the text ends with a newline is not part of D6 and is not asserted.
 *
 * Red until the module exists: TS2307 under `tsc`, "Cannot find module" under jest.
 */
import { REKEY_UNAUTHORIZED, renderRekeyConsole, type RekeyResult } from '../../src/core/workflow-rekey';

const SHA = 'c'.repeat(40);

function step(key: string): NonNullable<RekeyResult['next']> {
  return {
    key,
    trail: [{ workflow: 'life', phase: 'close', scope: null }],
    scope: null,
    role: 'approver',
    agentRole: false,
    members: [],
    directives: [],
    actions: [],
    evidence: { kinds: ['record'], missing: ['record'], finalizable: true },
    reentered: false,
    reentryCommit: null,
    awaiting: null,
  } as unknown as NonNullable<RekeyResult['next']>;
}

const base = {
  baseline: { rev: 'HEAD', commit: 'b'.repeat(40) },
  instance: { id: 'life-1-plan', workflow: 'life' },
  from: 'life.seed',
  to: 'life.seed-line',
} as unknown as Pick<RekeyResult, 'baseline' | 'instance' | 'from' | 'to'>;

const lines = (text: string): string[] => text.replace(/\n$/, '').split('\n');

describe('task-295 — REKEY_UNAUTHORIZED (spec-017 §10)', () => {
  it("is 'user not authorized to rekey'", () => {
    expect(REKEY_UNAUTHORIZED).toBe('user not authorized to rekey');
  });
});

describe('task-295 — renderRekeyConsole (design D6)', () => {
  it('a commit written, no next step: the instance, the rekeyed line with its count and commit, then "no next step"', () => {
    const text = renderRekeyConsole({ ...base, remapped: 1, commit: SHA, next: null } as RekeyResult);
    expect(lines(text)).toEqual(['workflow: life (life-1-plan)', `rekeyed: life.seed -> life.seed-line, 1 record(s) remapped (${SHA})`, 'no next step']);
  });

  it('a commit written with a next step: the next step heading follows the rekeyed line', () => {
    const text = renderRekeyConsole({ ...base, remapped: 3, commit: SHA, next: step('life.close') } as RekeyResult);
    expect(lines(text).slice(0, 3)).toEqual(['workflow: life (life-1-plan)', `rekeyed: life.seed -> life.seed-line, 3 record(s) remapped (${SHA})`, 'next step: life.close']);
  });

  it('the no-op (commit null): "already rekeyed: <from> -> <to>, nothing written"', () => {
    const text = renderRekeyConsole({ ...base, remapped: 0, commit: null, next: null } as RekeyResult);
    expect(lines(text)).toEqual(['workflow: life (life-1-plan)', 'already rekeyed: life.seed -> life.seed-line, nothing written', 'no next step']);
  });
});
