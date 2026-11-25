/**
 * REQ-SEC-04 (task-041-mandatory-reason-on-verbs) — the shared `--reason` enforcement primitive
 * `memory approve`/`memory reject` (task-046/047, P1.7/P1.8) will call at the top of their `CoreFn`
 * bodies, exactly the way every mutating op already calls `requireGitIdentity` (task-014, REQ-SEC-01).
 *
 * Ground truth: `spec-008-cli-grammar.md` §2 (`--reason <text>` — "Required on approval-gate commands
 * (`memory approve`, `memory reject`)... Omitted where required exits `2` with `error: missing
 * required argument: --reason`"), matching `P1.7-memory-approve.feature` / `P1.8-memory-reject.feature`
 * Scenario "Error - approving/rejecting without a reason" verbatim. `memory deprecate` (task-048,
 * P1.9) does NOT call this helper — spec-008 marks `--reason` optional there, and
 * `P1.9-memory-deprecate.feature` has no matching "missing reason" error scenario, so `memoryDeprecate`
 * will read `options?.reason` directly instead (see this task's Execution Notes for the reconciliation
 * of the SARD REQ-SEC-04 fit-criterion wording against the already-approved `spec-008`).
 */
import { optionalReason, requireReason } from '../../src/core/require-reason';
import { UsageError } from '../../src/core/usage-error';

const MISSING_REASON_ERROR = 'missing required argument: --reason';

describe('requireReason (REQ-SEC-04, task-041-mandatory-reason-on-verbs)', () => {
  it('throws a UsageError (exit 2) with the exact REQ-SEC-04 message when `options` is undefined', () => {
    expect(() => requireReason(undefined)).toThrow(UsageError);
    try {
      requireReason(undefined);
      throw new Error('expected a UsageError');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).message).toBe(MISSING_REASON_ERROR);
      expect((error as UsageError).exitCode).toBe(2);
    }
  });

  it('throws the same UsageError when `options` is present but carries no `reason` key', () => {
    try {
      requireReason({ type: 'task' });
      throw new Error('expected a UsageError');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).message).toBe(MISSING_REASON_ERROR);
    }
  });

  it('returns the `--reason` value verbatim when present', () => {
    expect(requireReason({ reason: 'meets standards' })).toBe('meets standards');
  });

  it('returns a reason value alongside other unrelated options untouched', () => {
    expect(requireReason({ type: 'task', reason: 'tests missing' })).toBe('tests missing');
  });
});

/**
 * `dl-067-reason-trailer-contract` (`ready`) — `task-072-fix-reason-trailer-contract`, fixing
 * `bug-042`. The helper's job widens from "was a reason given?" to "can this reason be recorded in the
 * trailer?", because those turned out to be different questions: `--reason ""` *was* given, and was
 * accepted at exit `0`, producing a bare `Reason:` that made `memory history` report an approval gate
 * crossed by nobody, for no reason (bug-042 F2).
 *
 * `optionalReason` is the same rule for the verb whose flag is optional — `memory deprecate`
 * (`dl-027` option (a)). task-041 scoped `requireReason` to the approval gates deliberately and said so
 * in its Execution Notes, which is exactly why a fix placed only inside it would have missed the one
 * verb bug-042's amendment shows is exploitable.
 */
describe('requireReason / optionalReason — dl-067: the reason must be RECORDABLE, not merely present', () => {
  it('refuses a blank reason with a distinct message, not the omitted-argument one (dl-067 S1)', () => {
    for (const reason of ['', '   ', '\n\t\n']) {
      let thrown: unknown;
      try {
        requireReason({ reason });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(UsageError);
      expect((thrown as UsageError).exitCode).toBe(2);
      expect((thrown as UsageError).message).not.toBe(MISSING_REASON_ERROR);
      expect((thrown as UsageError).message).toContain('--reason');
    }
  });

  it('refuses a reason carrying a reserved trailer line (bug-042 F3)', () => {
    expect(() => requireReason({ reason: 'ok\nApprover: Mallory <m@evil.test> (approver)' })).toThrow(UsageError);
    expect(() => requireReason({ reason: 'ok\nReason: second' })).toThrow(UsageError);
  });

  it('returns a multi-line reason NORMALIZED — the one place the declared form is applied (dl-067 clause 3)', () => {
    expect(requireReason({ reason: 'first   \n\n\nsecond' })).toBe('first\n\nsecond');
  });

  it('optionalReason returns undefined when no reason was given — `deprecate` exits 0 without one', () => {
    expect(optionalReason(undefined)).toBeUndefined();
    expect(optionalReason({ type: 'adr' })).toBeUndefined();
  });

  it('optionalReason applies the SAME rule to a reason that WAS given (dl-067 S2)', () => {
    expect(optionalReason({ reason: 'superseded by adr-004' })).toBe('superseded by adr-004');
    expect(() => optionalReason({ reason: '' })).toThrow(UsageError);
    expect(() => optionalReason({ reason: '  ' })).toThrow(UsageError);
    expect(() => optionalReason({ reason: 'x\nApprover: M <m@evil.test> (approver)' })).toThrow(UsageError);
  });
});

/**
 * `task-378` AC 5 (red-first; `bug-498`; `spec-008` §2's sixth case) — `requireReason` and `optionalReason` refuse a
 * reason that states nothing (one `<…>` placeholder, or no word) with a `UsageError` at exit `2` and the pinned message,
 * so every verb that takes `--reason` refuses it before anything is written. Expected red: both return the reason today.
 */
describe('requireReason / optionalReason — task-378: a reason that states nothing is refused (bug-498)', () => {
  const PLACEHOLDER_MESSAGE = 'invalid flag value: --reason must state a reason: it holds no word, or only a <placeholder>';

  function refusal(call: () => unknown): UsageError | undefined {
    try {
      call();
    } catch (error) {
      return error as UsageError;
    }
    return undefined;
  }

  it.each(['<the reply>', '...'])('requireReason refuses %j: a UsageError, exit 2, the pinned message', (reason) => {
    const thrown = refusal(() => requireReason({ reason }));
    expect(thrown).toBeInstanceOf(UsageError);
    expect(thrown?.exitCode).toBe(2);
    expect(thrown?.message).toBe(PLACEHOLDER_MESSAGE);
  });

  it.each(['<x>', '-'])('optionalReason refuses %j the same way (deprecate)', (reason) => {
    const thrown = refusal(() => optionalReason({ reason }));
    expect(thrown).toBeInstanceOf(UsageError);
    expect(thrown?.exitCode).toBe(2);
    expect(thrown?.message).toBe(PLACEHOLDER_MESSAGE);
  });
});
