/**
 * task-211 — the refusal arms of the in-place `include:` edit (`src/workflow/manifest-edit.ts`) past
 * `manifest-edit.test.ts`: a file that is not YAML, an `include:` that is not a list of paths, an item
 * written over several lines, and an edit whose result does not read back as the list expected. Pure.
 */
import { withIncludeAdded, withIncludeRemoved } from '../../src/workflow/manifest-edit';

describe('withIncludeAdded / withIncludeRemoved — refusals (task-211)', () => {
  it.each([
    ['a file that is not YAML', 'include:\n  - [unclosed\n'],
    ['an include of mappings', 'include:\n  - file: a.yaml\n'],
  ])('refuses %s', (_label, text) => {
    expect(withIncludeAdded(text, 'b.yaml')).toEqual({ ok: false, reason: 'its include: is not a list of file paths' });
    expect(withIncludeRemoved(text, 'a.yaml')).toEqual({ ok: false, reason: 'its include: is not a list of file paths' });
  });

  it('refuses an edit that does not read back as expected (an entry continued on the next line)', () => {
    const text = 'include:\n  - workflows/a.yaml\n  - "workflows/\n    b.yaml"\n';
    expect(withIncludeAdded(text, 'c.yaml')).toEqual({ ok: false, reason: 'the edited file does not read back as the expected include: list' });
  });

  it('reads an unterminated quote as the raw text, which matches no entry', () => {
    expect(withIncludeRemoved("include:\n  - a.yaml\n  - 'b.yaml\n", "'b.yaml").ok).toBe(false);
  });
});
