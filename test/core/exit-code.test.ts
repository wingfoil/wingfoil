/**
 * Exit-code selection (spec-005-cli-command-contract §1, REQ-INT-04, task-012-cli-exit-code-contract).
 * Both the CLI and the MCP surface derive severity from the same CoreError model (REQ-SYS-05); this
 * maps a CoreError / CoreResult onto the 0/1/2 exit contract in ONE place so neither surface hardcodes
 * its own convention. Parse-level usage errors (2) are *detected* by the surface before any core call,
 * but since task-101-route-commander-parse-errors-through-the-exit-code-contract (`bug-098`) their code
 * is chosen here too, by `exitCodeForParseOutcome` — covered at the bottom of this file.
 */
import { coreErr, coreFailed, coreOk } from '../../src/core/types';
import type { CoreErrorCode } from '../../src/core/types';
import { classifyParseOutcome, exitCodeForError, exitCodeForParseOutcome, exitCodeForResult } from '../../src/core/exit-code';

const ALL_CODES: readonly CoreErrorCode[] = ['NOT_FOUND', 'INVALID_TRANSITION', 'VALIDATION', 'CONFLICT', 'IO'];

describe('exitCodeForError — CoreError → exit code (REQ-INT-04)', () => {
  it.each(ALL_CODES)('maps the domain error code %s to a logic-error exit 1', (code) => {
    expect(exitCodeForError({ code, message: `boom: ${code}` })).toBe(1);
  });
});

describe('exitCodeForResult — CoreResult → exit code', () => {
  it('maps a successful result to 0', () => {
    expect(exitCodeForResult(coreOk({ any: 'value' }))).toBe(0);
  });

  it.each(ALL_CODES)('maps a %s failure result to 1', (code) => {
    expect(exitCodeForResult(coreErr({ code, message: 'boom' }))).toBe(1);
  });
});

/**
 * task-365 AC 7 (red-first; `spec-020` §8.1, `spec-006` §2 as amended; design items 4 and 5): a completed run whose
 * verdict fails is a success that carries `failed: { message }`, and `exitCodeForResult` maps it to 1 in `src/core`, so
 * both surfaces share the mapping. Expected red: `coreFailed` is not exported by `src/core/types` (`tsc` TS2305; jest
 * `TypeError: … is not a function`).
 */
describe('task-365 AC 7 — coreFailed and its exit code (spec-020 §8.1)', () => {
  it('coreFailed(value, message) is a success carrying the value and `failed: { message }`', () => {
    const value = { verdict: 'fail' };
    expect(coreFailed(value, 'E_VERIFY_FINDINGS: m')).toEqual({ ok: true, value, failed: { message: 'E_VERIFY_FINDINGS: m' } });
  });

  it('exitCodeForResult maps a success carrying `failed` to 1', () => {
    expect(exitCodeForResult(coreFailed({ verdict: 'fail' }, 'm'))).toBe(1);
  });

  it('coreOk never writes the `failed` key, and its exit code stays 0', () => {
    const result = coreOk({ verdict: 'pass' });
    expect('failed' in result).toBe(false);
    expect(exitCodeForResult(result)).toBe(0);
  });
});

/**
 * The argument-parser mapping (task-101, `bug-098`). The code strings are Commander's, read from the
 * INSTALLED `commander@15.0.0` (`node_modules/commander/lib/command.js` / `lib/error.js`) rather than
 * from memory — they are version surface, and this suite is what fails if an upgrade renames one while
 * `USAGE_ERROR_PARSE_CODES` still lists the old spelling.
 */
describe('exitCodeForParseOutcome — an argument parser\'s own termination → exit code (spec-005 §1)', () => {
  /** Every code commander@15.0.0 raises through `Command#error()` or `InvalidArgumentError`. */
  const USAGE_ERROR_CODES = [
    'commander.unknownCommand',
    'commander.unknownOption',
    'commander.excessArguments',
    'commander.missingArgument',
    'commander.optionMissingArgument',
    'commander.missingMandatoryOptionValue',
    'commander.conflictingOption',
    'commander.invalidArgument',
    'commander.error',
  ] as const;

  it.each(USAGE_ERROR_CODES)('maps %s to a usage-error exit 2, overriding the parser\'s suggested 1', (code) => {
    // 1 is what commander suggests for all of these (`Command#error`'s `config.exitCode || 1`); the
    // contract answers 2, which is the whole of bug-098.
    expect(exitCodeForParseOutcome({ code, exitCode: 1 })).toBe(2);
  });

  it.each(['commander.helpDisplayed', 'commander.version', 'commander.help'])(
    'keeps %s at exit 0 — `--help` and `--version` always exit 0 (spec-005 §1)',
    (code) => {
      expect(exitCodeForParseOutcome({ code, exitCode: 0 })).toBe(0);
    },
  );

  it('maps an incomplete invocation reported through `commander.help` to a usage-error exit 2', () => {
    // `commander.help` with a NON-ZERO suggestion is `Command#help({ error: true })` — a noun with no
    // verb, `wingfoil` with no arguments, or `help <unknown>`: the invocation was incomplete, which
    // spec-005 §1 calls a usage error (task-103, `bug-103`). The same code with suggestion 0 is the
    // built-in `help` command and stays at 0 (the `it.each` above). That one bit is the whole
    // discriminator between "help printed because the user asked" and "help printed because there was
    // nothing to run", so both halves are pinned; weakening it to "the code alone" breaks one or the
    // other, and `wingfoil help` becoming a usage error is the direction that would go unnoticed.
    expect(exitCodeForParseOutcome({ code: 'commander.help', exitCode: 1 })).toBe(2);
  });

  it('gives an unrecognised parser code the status quo, never a usage-error meaning by default', () => {
    // A future commander release adding a code this table does not list must not silently acquire
    // exit 2; it keeps the parser's own suggestion, narrowed to the three-code contract.
    expect(exitCodeForParseOutcome({ code: 'commander.somethingNew', exitCode: 1 })).toBe(1);
    expect(exitCodeForParseOutcome({ code: 'commander.somethingNew', exitCode: 0 })).toBe(0);
    expect(exitCodeForParseOutcome({ code: 'commander.executeSubCommandAsync', exitCode: 1 })).toBe(1);
  });

  it('narrows any out-of-contract suggestion into the three-code contract', () => {
    expect(exitCodeForParseOutcome({ code: 'commander.somethingNew', exitCode: 127 })).toBe(1);
  });
});

describe('classifyParseOutcome — who owes the `error:` line (spec-005 §1, task-103)', () => {
  it('is the single rule `exitCodeForParseOutcome` reads — the two can never disagree', () => {
    // `exitCodeForParseOutcome` delegates here rather than re-deciding, which is what keeps AC6 of
    // task-101 (one place decides an exit code) true after this task added a second thing to decide.
    for (const outcome of [
      { code: 'commander.unknownCommand', exitCode: 1 },
      { code: 'commander.help', exitCode: 1 },
      { code: 'commander.help', exitCode: 0 },
      { code: 'commander.helpDisplayed', exitCode: 0 },
      { code: 'commander.executeSubCommandAsync', exitCode: 1 },
      { code: 'commander.somethingNew', exitCode: 127 },
    ]) {
      expect(classifyParseOutcome(outcome).exitCode).toBe(exitCodeForParseOutcome(outcome));
    }
  });

  it('asks the surface for an error line only on the outcome where the parser wrote none', () => {
    // spec-005 §1: a non-zero exit is ALWAYS accompanied by an error message on stderr. Commander
    // writes its own `error: …` line for every code in the usage-error set, and prints only help text
    // for an incomplete invocation — so that one outcome, and only that one, needs the surface to
    // emit the line (`bug-103`'s second violation).
    expect(classifyParseOutcome({ code: 'commander.help', exitCode: 1 })).toEqual({ exitCode: 2, needsErrorLine: true });
  });

  it.each([
    ['commander.unknownCommand', 1, 2],
    ['commander.unknownOption', 1, 2],
    ['commander.missingArgument', 1, 2],
  ])('leaves %s to commander, which already wrote its own message', (code, suggested, expected) => {
    expect(classifyParseOutcome({ code, exitCode: suggested })).toEqual({ exitCode: expected, needsErrorLine: false });
  });

  it.each([
    ['commander.help', 0],
    ['commander.helpDisplayed', 0],
    ['commander.version', 0],
  ])('never asks for an error line on a successful termination (%s)', (code, suggested) => {
    expect(classifyParseOutcome({ code, exitCode: suggested })).toEqual({ exitCode: 0, needsErrorLine: false });
  });

  it('never asks for an error line on an outcome this contract does not classify', () => {
    // The default branch keeps the parser's own suggestion, so it can still end at exit 1 with no
    // message — the residual case of the §1 rule. It is deliberately not papered over with a
    // manufactured message: `commander.executeSubCommandAsync` is the only code that reaches it today
    // and WingFoil registers no executable subcommand, so the branch is unreachable in production. A
    // future commander code landing here must be classified explicitly, not absorbed silently.
    expect(classifyParseOutcome({ code: 'commander.executeSubCommandAsync', exitCode: 1 })).toEqual({
      exitCode: 1,
      needsErrorLine: false,
    });
  });
});
