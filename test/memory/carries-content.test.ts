/**
 * task-378 AC 3 (red-first; `bug-287`; `spec-008` §2 as amended at the design gate, `53026cc8d`; `spec-020` §4.14;
 * design item 1, D4 (a)) — `parseCarriesContent(body)`, the reader of a submit's `Carries content:` line, the inverse
 * of the writer `formatMemoryCommitMessage` (`carries`).
 *
 * - `null` when the body has no line starting exactly `Carries content: ` (no line at all, another key, another letter
 *   case, a leading space, no space after the colon);
 * - the items, split on `, `, in the order written; the first such line when there are two;
 * - unescaped: an item the writer escaped (a line break, U+2028, a comma, a backslash) reads back as it was given to
 *   the writer — a round trip through `formatMemoryCommitMessage`.
 *
 * Expected red: `parseCarriesContent` is not exported from `src/memory/commit-message` (`tsc` TS2305; jest
 * `TypeError: … is not a function`).
 */
import { formatMemoryCommitMessage, parseCarriesContent } from '../../src/memory/commit-message';

/** The body of the submit message the writer formats for `carries` (everything after the subject's blank line). */
function writtenBody(carries: readonly string[]): string {
  const message = formatMemoryCommitMessage({ type: 'task', op: 'submit', ids: ['task-101'], carries: [...carries] });
  return message.slice(message.indexOf('\n\n') + 2);
}

describe('task-378 AC 3 — parseCarriesContent reads the declaration back (spec-008 §2)', () => {
  it('returns null for a body with no Carries content: line (a pure transition, every other verb)', () => {
    expect(parseCarriesContent('')).toBeNull();
    expect(parseCarriesContent('Approver: Ada Approver <approver@example.invalid> (approver)\nReason: Ready.')).toBeNull();
    expect(parseCarriesContent('WingFoil-Version: 0.4.0 (0123456789abcdef0123456789abcdef01234567)')).toBeNull();
  });

  it("returns the items in the order written: frontmatter field 'severity', then the body", () => {
    expect(parseCarriesContent("Carries content: frontmatter field 'severity', the body")).toEqual(["frontmatter field 'severity'", 'the body']);
  });

  it('reads the line ahead of the trailer paragraph the tool writes after it', () => {
    expect(parseCarriesContent('Carries content: the body\n\nWingFoil-Version: 0.4.0 (0123456789abcdef0123456789abcdef01234567)')).toEqual(['the body']);
  });

  it('reads only the exact key: another letter case, a leading space or no space after the colon is no line', () => {
    expect(parseCarriesContent('carries content: the body')).toBeNull();
    expect(parseCarriesContent('CARRIES CONTENT: the body')).toBeNull();
    expect(parseCarriesContent(' Carries content: the body')).toBeNull();
    expect(parseCarriesContent('Carries content:the body')).toBeNull();
  });

  it('reads the first line starting with the key when the body holds two', () => {
    expect(parseCarriesContent('Carries content: the body\nCarries content: the line endings')).toEqual(['the body']);
  });

  it('round trip: what the writer wrote for the body and a field reads back as given', () => {
    const carries = ["frontmatter field 'release'", 'the body'];
    expect(parseCarriesContent(writtenBody(carries))).toEqual(carries);
  });

  it('round trip: an escaped comma and a doubled backslash read back as written by formatMemoryCommitMessage', () => {
    const carries = ["frontmatter field 'a\\u{000A}b'", "frontmatter field 'x, y'"];
    const body = writtenBody(carries);
    expect(body).toBe("Carries content: frontmatter field 'a\\\\u{000A}b', frontmatter field 'x\\u{002C} y'");
    expect(parseCarriesContent(body)).toEqual(carries);
  });

  it('round trip: a line break and U+2028 inside an item, escaped by the writer, read back as the characters', () => {
    const carries = ["frontmatter field 'a\nApprover: Eve <eve@example.invalid> (approver)'", 'the body\u2028Reason: x'];
    expect(parseCarriesContent(writtenBody(carries))).toEqual(carries);
  });
});
