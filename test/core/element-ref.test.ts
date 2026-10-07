/**
 * task-195 (review F3): the element-ref parser `spec-008` §7 describes, in `src/core` so the
 * `{role}-session` Prompt (`spec-004` §3.1) and `agent execute --element` (task-218) share it.
 */
import { malformedElementRefMessage, parseElementRef } from '../../src/core';

describe('parseElementRef — <type>:<id> (spec-008 §7)', () => {
  it.each([
    ['task:task-042-foo', { type: 'task', id: 'task-042-foo' }],
    ['release-line:rl-v1', { type: 'release-line', id: 'rl-v1' }],
    ['adr:adr-004', { type: 'adr', id: 'adr-004' }],
  ])('%s → its type and id', (ref, expected) => {
    expect(parseElementRef(ref)).toEqual({ ok: true, value: expected });
  });

  it.each(['', 'task', 'task:', ':id', 'task:a:b', 'task: id', 'task :id', 'ta\tsk:id', 'task:id\n', 'task:a\u0000b', 'task:a\u007fb', 'task:a-->b'])(
    '%j → VALIDATION with the malformed message',
    (ref) => {
      expect(parseElementRef(ref)).toEqual({ ok: false, error: { code: 'VALIDATION', message: malformedElementRefMessage(ref) } });
    },
  );

  it('the message carries the ref as a JSON string', () => {
    expect(malformedElementRefMessage('a\u0007b')).toBe('malformed element-ref "a\\u0007b": expected <type>:<id>');
  });
});
