/**
 * Pure DNA key-path validation (P2.1, task-025-implement-dna-set), as it stands after
 * task-093-dna-mutation-surface-add-remove-update.
 *
 * `isValidKeyPath` answers the *shape* question only — is this a well-formed dotted path — which is
 * the exit-2 usage-error case (`P2.1-dna-set.feature`, "invalid key path: '..language'"). Whether a
 * well-formed path names anything the schema declares is a different question, answered by
 * `src/dna/path.ts` and refused at exit 1 (`bug-084`, `spec-005` §1 as ruled on `bug-076`).
 *
 * `setDnaValue` used to live here and is gone: it treated every segment as an object key and created
 * an object for any segment it could not descend into, which is the mechanism `bug-084` filed — and
 * the semantics it stood for are now `applyDnaMutation`'s (`src/dna/mutate.ts`), which resolves
 * against the schema first. task-063's text setter went the same way (task-312, `bug-254`): every DNA
 * write goes through `applyDnaEditInText` (`src/dna/edit.ts`, tested by `./edit.test.ts`).
 */
import { isValidKeyPath, DNA_KEY_ALIASES } from '../../src/dna/set';

describe('isValidKeyPath (P2.1 AC(c) — malformed dotted path)', () => {
  it('accepts a simple two-segment dotted path', () => {
    expect(isValidKeyPath('tech_stack.language')).toBe(true);
  });

  it('accepts a single-segment path', () => {
    expect(isValidKeyPath('version')).toBe(true);
  });

  it("rejects the BDD's leading-double-dot example '..language'", () => {
    expect(isValidKeyPath('..language')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidKeyPath('')).toBe(false);
  });

  it('rejects a leading, trailing, or interior empty segment', () => {
    expect(isValidKeyPath('.foo')).toBe(false);
    expect(isValidKeyPath('foo.')).toBe(false);
    expect(isValidKeyPath('a..b')).toBe(false);
  });
});

describe('DNA_KEY_ALIASES is a READ-side alias only (bug-084)', () => {
  it('still carries the single `tech_stack -> stacks` entry `dna show` resolves (spec-002 Consequences)', () => {
    expect(DNA_KEY_ALIASES.tech_stack).toBe('stacks');
    expect(Object.keys(DNA_KEY_ALIASES)).toEqual(['tech_stack']);
  });
});
