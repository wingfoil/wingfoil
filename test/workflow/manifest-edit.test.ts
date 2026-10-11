/**
 * task-211 — the in-place edit of `workflows.yaml`'s `include:` list that `workflow create` and `workflow
 * remove` commit (`spec-017` §7.7, §7.8; design decision 7), and the scaffold `workflow create` writes
 * (decision 3). Pure functions: no repository, no clock.
 */
import { renderCustomWorkflow } from '../../src/workflow/create';
import { withIncludeAdded, withIncludeRemoved } from '../../src/workflow/manifest-edit';

const MANIFEST = `# head comment
version: 1.0

include:
  # startable
  - workflows/custom/a.yaml   # first
  - "workflows/custom/b.yaml"

  # subs
  - 'workflows/custom/c.yaml'

# trailing
other: 1
`;

describe('withIncludeAdded (task-211)', () => {
  it('appends after the last item, at its indentation, keeping every comment and blank line', () => {
    expect(withIncludeAdded(MANIFEST, 'workflows/custom/d.yaml')).toEqual({
      ok: true,
      text: MANIFEST.replace("  - 'workflows/custom/c.yaml'\n", "  - 'workflows/custom/c.yaml'\n  - workflows/custom/d.yaml\n"),
    });
  });

  it('keeps an unindented list unindented and the file without a final newline as it was', () => {
    expect(withIncludeAdded('include:\n- workflows/x.yaml', 'workflows/custom/d.yaml')).toEqual({ ok: true, text: 'include:\n- workflows/x.yaml\n- workflows/custom/d.yaml' });
  });

  it('keeps CRLF line endings', () => {
    expect(withIncludeAdded('version: 1\r\ninclude:\r\n  - a.yaml\r\n', 'b.yaml')).toEqual({ ok: true, text: 'version: 1\r\ninclude:\r\n  - a.yaml\r\n  - b.yaml\r\n' });
  });

  it('writes a manifest when there is none', () => {
    expect(withIncludeAdded(null, 'workflows/custom/d.yaml')).toEqual({ ok: true, text: 'version: 1.0\ninclude:\n  - workflows/custom/d.yaml\n' });
  });

  it.each([
    ['a flow-style list', 'include: [ a.yaml ]\n'],
    ['no include key', 'version: 1\n'],
    ['an empty include', 'include:\nversion: 1\n'],
  ])('refuses %s: it cannot be edited in place', (_label, text) => {
    const edit = withIncludeAdded(text, 'b.yaml');
    expect(edit.ok).toBe(false);
  });
});

describe('withIncludeRemoved (task-211)', () => {
  it.each([
    ['a plain item with a comment', 'workflows/custom/a.yaml', "  - workflows/custom/a.yaml   # first\n"],
    ['a double-quoted item', 'workflows/custom/b.yaml', '  - "workflows/custom/b.yaml"\n'],
    ['a single-quoted item', 'workflows/custom/c.yaml', "  - 'workflows/custom/c.yaml'\n"],
  ])('removes %s, and that line only', (_label, entry, line) => {
    expect(withIncludeRemoved(MANIFEST, entry)).toEqual({ ok: true, text: MANIFEST.replace(line, '') });
  });

  it('matches the entry the loader resolves (./ and doubled separators normalized)', () => {
    expect(withIncludeRemoved('include:\n  - ./workflows//custom/a.yaml\n  - b.yaml\n', 'workflows/custom/a.yaml')).toEqual({ ok: true, text: 'include:\n  - b.yaml\n' });
  });

  it('refuses an entry the list does not hold, and a flow-style list', () => {
    expect(withIncludeRemoved(MANIFEST, 'workflows/custom/z.yaml').ok).toBe(false);
    expect(withIncludeRemoved('include: [ a.yaml, b.yaml ]\n', 'a.yaml').ok).toBe(false);
  });
});

describe('renderCustomWorkflow (task-211)', () => {
  it('writes name, the declaration, version 1.0 and one phase step-1', () => {
    expect(renderCustomWorkflow({ name: 'arch-review', startable: true, includable: false })).toBe(
      'name: arch-review\nstartable: true\nversion: 1.0\nphases:\n  - name: step-1\n',
    );
  });

  it('writes both booleans, the element and a quoted description in a fixed order', () => {
    expect(renderCustomWorkflow({ name: 'x', startable: true, includable: true, element: 'release', description: 'Say "hi": now' })).toBe(
      'name: x\nstartable: true\nincludable: true\ndescription: "Say \\"hi\\": now"\nelement: release\nversion: 1.0\nphases:\n  - name: step-1\n',
    );
  });

  it('quotes an element that is not a plain name', () => {
    expect(renderCustomWorkflow({ name: 'x', startable: false, includable: true, element: 'a: b' })).toContain('element: "a: b"\n');
  });
});
