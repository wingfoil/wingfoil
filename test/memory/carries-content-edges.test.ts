/**
 * task-378 (green, developer; `spec-008` §2, `spec-020` §4.14) — the edges of the pure pieces: `parseCarriesContent`
 * keeps an escape naming no Unicode code point as written; `describeCommittedSubmitContent` has no target when the
 * commit blob has no frontmatter, or a frontmatter that is no mapping.
 */
import { parseCarriesContent } from '../../src/memory/commit-message';
import { describeCommittedSubmitContent } from '../../src/memory/submit';

describe('task-378 — parseCarriesContent keeps what no writer writes as written', () => {
  it('an escape beyond U+10FFFF stays the text it is', () => {
    expect(parseCarriesContent("Carries content: frontmatter field 'a\\u{110000}b'")).toEqual(["frontmatter field 'a\\u{110000}b'"]);
  });
});

describe('task-378 — describeCommittedSubmitContent with no target state', () => {
  const parent = '---\nid: t-1\nstatus: draft\n---\n\nBody.\n';
  it('null for a commit blob with no frontmatter', () => {
    expect(describeCommittedSubmitContent(parent, 'Just text.\n')).toBeNull();
  });
  it('null for a frontmatter that is a list, not a mapping', () => {
    expect(describeCommittedSubmitContent(parent, '---\n- a\n- b\n---\n\nBody.\n')).toBeNull();
  });
});
