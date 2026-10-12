/**
 * task-211 — W3 B6 gate: the arms of the in-place `include:` edit (`src/workflow/manifest-edit.ts`) no
 * task-211 suite reached: a single-quoted entry (whole, or continued on the next line), an entry that is not a plain path (written JSON-quoted),
 * an `include:` key whose list is not on block lines, and a quoted top-level key the edit cannot find. Pure.
 */
import { parseYaml } from '../../src/validation';
import { withIncludeAdded, withIncludeRemoved } from '../../src/workflow/manifest-edit';

describe('withIncludeAdded / withIncludeRemoved — gate arms (task-211)', () => {
  it('reads a single-quoted entry as its value, doubled quotes undone', () => {
    const text = "include:\n  - 'workflows/a.yaml'\n  - 'workflows/it''s.yaml'\n";
    const removed = withIncludeRemoved(text, "workflows/it's.yaml");
    expect(removed).toEqual({ ok: true, text: "include:\n  - 'workflows/a.yaml'\n" });
  });

  it('reads a single-quoted entry continued on the next line as its raw first line, which matches no entry', () => {
    const text = "include:\n  - workflows/a.yaml\n  - 'workflows/\n    b.yaml'\n";
    expect(withIncludeRemoved(text, 'workflows/ b.yaml')).toEqual({ ok: false, reason: 'no include: entry resolves to workflows/ b.yaml' });
  });

  it('writes an entry that is not a plain path JSON-quoted, and it reads back as given', () => {
    const added = withIncludeAdded('include:\n  - workflows/a.yaml\n', 'workflows/my flow.yaml');
    expect(added).toEqual({ ok: true, text: 'include:\n  - workflows/a.yaml\n  - "workflows/my flow.yaml"\n' });
    if (!added.ok) return;
    expect((parseYaml(added.text, 'workflows.yaml') as { include: string[] }).include).toEqual(['workflows/a.yaml', 'workflows/my flow.yaml']);
  });

  it('refuses an include: key whose list continues as a flow sequence on the next line', () => {
    const text = 'include:\n  [workflows/a.yaml]\n';
    expect(withIncludeAdded(text, 'b.yaml')).toEqual({ ok: false, reason: 'its include: list has no block entry' });
  });

  it('refuses a quoted top-level key, which YAML reads but the line edit cannot find', () => {
    const text = '"include":\n  - workflows/a.yaml\n';
    expect(withIncludeRemoved(text, 'workflows/a.yaml')).toEqual({ ok: false, reason: 'it has no top-level include: list' });
  });
});
