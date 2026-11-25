/**
 * task-374 (green, developer) — the edge of `workflow show <instance plan id>` (`spec-017` §7.6, `bug-359`) the red
 * suite leaves open: an instance plan whose `workflow` field is blank names no workflow, so its id is `unknown
 * workflow: <ref>` as any other unresolved name, never `unknown workflow: ` with an empty name.
 */
import { CORE_MODULES } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { writeRefProject } from './helpers/ref-not-open-fixture';

const showOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowShow'];

async function show(root: string, ref: string): Promise<CoreResult<unknown>> {
  if (showOp === undefined) throw new Error('no workflowShow operation in CORE_MODULES');
  return (await showOp.fn({ root, positional: ref })) as CoreResult<unknown>;
}

describe('task-374 — workflow show of an instance plan naming no workflow', () => {
  it('a closed instance plan with a blank workflow field: NOT_FOUND "unknown workflow: <its id>"', async () => {
    const repo = makeTempGitRepo();
    try {
      writeRefProject(repo);
      writeFixtureFile(repo, 'docs/plans/blank-1-plan.md', '---\nid: "blank-1-plan"\ntype: plan\ntitle: "blank-1-plan"\nstatus: done\nworkflow: ""\nphase: "x"\nelement: "minor-1"\nparent: ""\n---\n\n## Body\n');
      commitAll(repo, 'a closed plan naming no workflow');
      expect(await show(repo, 'blank-1-plan')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: 'unknown workflow: blank-1-plan' } });
    } finally {
      removeTempDir(repo);
    }
  });
});
