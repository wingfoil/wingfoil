/**
 * task-335 AC 5 (red-first) — `--timeout <duration>`'s grammar (`dl-181` Q4 (a), `spec-016` §3.1, `spec-008` §12;
 * approver ruling D5 (a)): `<n>s`, `<n>m` or `<n>h`, `<n>` a positive integer without a leading zero, at most `24h`.
 * The parser is the leaf module `src/agent/duration.ts` (no import); `agent execute` turns its error into a
 * `UsageError` (exit `2`) before the project is read, which `test/core/agent-execute.test.ts` pins with the two
 * full messages. Here only the value and the message's distinguishing text are pinned.
 */
import { parseDuration } from '../../src/agent/duration';

describe('task-335 AC 5 — parseDuration: <n>s | <n>m | <n>h, at most 24h (spec-016 §3.1)', () => {
  it.each([
    ['1s', 1000],
    ['90s', 90000],
    ['5m', 300000],
    ['2h', 7200000],
    ['24h', 86400000],
    ['1440m', 86400000],
    ['86400s', 86400000],
  ])('%s → %d ms, labelled as given', (raw, ms) => {
    expect(parseDuration(raw)).toEqual({ ms, label: raw });
  });

  it.each(['0s', '05m', '00h', '1d', '1.5h', '', 's', '5', '5 m', '-5m', '+5m', '5M', '1h30m'])('%j is not a duration of that form', (raw) => {
    expect(parseDuration(raw)).toEqual({ error: expect.stringContaining(`--timeout expects <n>s, <n>m or <n>h, got "${raw}"`) });
  });

  it.each(['25h', '1441m', '86401s'])('%s is over 24h', (raw) => {
    expect(parseDuration(raw)).toEqual({ error: expect.stringContaining(`--timeout must be at most 24h, got "${raw}"`) });
  });
});
