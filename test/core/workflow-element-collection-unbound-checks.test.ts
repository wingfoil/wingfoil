/**
 * task-230 (refactor) — an `element:` collection in a workflow that declares no element is reported once, as
 * `E_WORKFLOW_COLLECTION_UNRESOLVED` (core), never also as `E_WORKFLOW_ELEMENT_MISMATCH` (loader), whatever the
 * iterated workflow declares (`spec-003` § "Collections", § "Diagnostics").
 */
import { loadWorkflowRegistryAtRev } from '../../src/core';
import { ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DNA_YAML =
  'version: 1.0\nmodules:\n  - name: core\n    path: src/core\nstacks:\n  technologies:\n    - name: TypeScript\n      category: language\nteam:\n  members:\n    - name: R\n      email: r@example.invalid\n      roles: [ approver ]\n  roles:\n    - name: approver\npaths:\n  sources: [ src/ ]\n';
const MEMORY_YAML = 'version: 1.0\ntypes:\n  release:\n    path: "docs/releases/{id}.md"\n    states:\n      sequence: [ draft, in-development, released ]\n';

describe('task-230 — element: collection in a workflow bound to nothing', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('one E_WORKFLOW_COLLECTION_UNRESOLVED, no E_WORKFLOW_ELEMENT_MISMATCH, when the iterated workflow declares an element', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/cycle.yaml\n  - workflows/custom/wave.yaml\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/cycle.yaml', 'name: cycle\nkind: main\nphases:\n  - name: implementation\n    include: wave\n    iterate_over: element:waves\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/wave.yaml', 'name: wave\nkind: sub\nelement: release\nphases:\n  - name: re-plan\n');
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    commitAll(repo, 'fixture');
    let diagnostics: { code: string; severity: string }[];
    try {
      diagnostics = [...(loadWorkflowRegistryAtRev(repo, 'HEAD').diagnostics as { code: string; severity: string }[])];
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      diagnostics = [...(err as { diagnostics: { code: string; severity: string }[] }).diagnostics];
    }
    expect(diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual(['E_WORKFLOW_COLLECTION_UNRESOLVED']);
  });
});
