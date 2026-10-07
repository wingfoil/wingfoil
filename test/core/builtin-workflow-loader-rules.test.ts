/**
 * task-196 (`bug-183`) — the P4.17 integrity check of a built-in workflow template applies the per-file
 * rules the workflow loader applies (`workflowFileDiagnostics`, spec-003 § "Diagnostics"), not the
 * `Workflow` schema alone, so a template that passes integrity also loads.
 *
 * The divergence `bug-183` names: since `task-136` made `kind` optional, a template with neither `kind`
 * nor `startable`/`includable` is schema-valid, and the loader then refuses it with
 * `E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE`. Rules that need OTHER files (an `include` that names a
 * workflow outside the template) are not decidable on one template and are not applied.
 */
import { verifyBuiltinTemplates, type BuiltinTemplateSource } from '../../src/core/builtin-integrity';

function workflow(name: string, body: string): BuiltinTemplateSource {
  return { name, kind: 'workflow', content: body };
}

const invalid = (name: string): { name: string; kind: 'workflow'; message: string } => ({
  name,
  kind: 'workflow',
  message: `built-in workflow template invalid: ${name}`,
});

describe('verifyBuiltinTemplates — a built-in workflow template meets the loader per-file rules (bug-183)', () => {
  it('fails a template that is neither startable nor includable (no kind, no booleans)', () => {
    const source = workflow('orphan', 'name: orphan\nphases:\n  - name: one\n');
    expect(verifyBuiltinTemplates([source])).toEqual(invalid('orphan'));
  });

  it('fails a template that declares kind together with startable/includable', () => {
    const source = workflow('both', 'name: both\nkind: main\nstartable: true\nphases:\n  - name: one\n');
    expect(verifyBuiltinTemplates([source])).toEqual(invalid('both'));
  });

  it('fails a template with a duplicated phase name', () => {
    const source = workflow('twice', 'name: twice\nkind: main\nphases:\n  - name: one\n  - name: one\n');
    expect(verifyBuiltinTemplates([source])).toEqual(invalid('twice'));
  });

  it('passes a template that declares startable: true with no kind (characterization)', () => {
    const source = workflow('flow', 'name: flow\nstartable: true\nphases:\n  - name: one\n');
    expect(verifyBuiltinTemplates([source])).toBeNull();
  });

  it('does not decide a cross-file rule: an include naming a workflow outside the template passes', () => {
    const source = workflow('outer', 'name: outer\nkind: main\nphases:\n  - name: one\n    include: some-other-workflow\n');
    expect(verifyBuiltinTemplates([source])).toBeNull();
  });

  it('does not fail on a loader warning (an unbound action token is a W_ diagnostic)', () => {
    const source = workflow('warned', 'name: warned\nkind: main\nphases:\n  - name: one\n    actions: [ "made.up.token" ]\n');
    expect(verifyBuiltinTemplates([source])).toBeNull();
  });
});
