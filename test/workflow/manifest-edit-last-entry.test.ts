/**
 * task-211 review F1 — removing the last `include:` entry is not refused by the in-place edit: the edit is
 * made, and `workflow remove`'s prospective load refuses it as the workflows not loading (`VALIDATION`,
 * `spec-017` §7.8, §10), as the CLI reference says. A new file: red's files stay unchanged.
 */
import { CORE_MODULES, enumerateOperations } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { withIncludeRemoved } from '../../src/workflow/manifest-edit';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

describe('the last include: entry (task-211 review F1)', () => {
  it('withIncludeRemoved makes the edit: an include: with no entry left', () => {
    expect(withIncludeRemoved('version: 1\ninclude:\n  - workflows/custom/a.yaml\n', 'workflows/custom/a.yaml')).toEqual({ ok: true, text: 'version: 1\ninclude:\n' });
  });

  it('workflow remove of the only workflow is refused as the workflows would not load (VALIDATION), nothing written', async () => {
    const root = makeTempGitRepo();
    try {
      writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/solo.yaml\n');
      writeFixtureFile(root, '.wingfoil/workflows/custom/solo.yaml', 'name: solo\nstartable: true\nphases:\n  - name: one\n');
      writeFixtureFile(root, '.wingfoil/memory.yaml', 'version: 1.0\ntypes:\n  plan:\n    path: "docs/plans/{id}.md"\n    states:\n      sequence: [ draft, active, done ]\n');
      commitAll(root, 'fixture');
      const remove = enumerateOperations(CORE_MODULES).find((entry) => entry.operation.name === 'workflowRemove')!.operation.fn;
      const result = (await remove({ root, positional: 'solo' })) as CoreResult<unknown>;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toMatch(/^cannot remove 'solo': the workflows would not load: /);
      expect(git(root, ['status', '--porcelain'])).toBe('');
      expect(git(root, ['log', '--format=%s', '-1']).trim()).toBe('fixture');
    } finally {
      removeTempDir(root);
    }
  });
});
