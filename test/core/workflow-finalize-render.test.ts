/**
 * task-226 (refactor) — the parts of `workflow finalize` the operation tests do not reach in process:
 *
 * - `renderFinalizeConsole` (the CLI tests run it from `dist/`, outside the coverage count): the
 *   finalized step and its commit, then the next step's lines or `no next step`;
 * - the authority refusal on an approval phase with no scope names the type `plan` (decision 5);
 * - a commit git refuses (a failing `pre-commit` hook) is `CommitFailure`, worded `an empty commit`,
 *   and leaves `HEAD` where it was.
 */
import { chmodSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, renderFinalizeConsole, type FinalizeResult } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { CommitFailure, commitEmpty } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

function step(key: string): FinalizeResult['finalized'] {
  return {
    key,
    trail: [{ workflow: 'w', phase: 'p', scope: null }],
    scope: null,
    role: 'qa',
    agentRole: false,
    members: [],
    directives: [],
    actions: [],
    evidence: { kinds: ['record'], missing: ['record'], finalizable: true },
    reentered: false,
    reentryCommit: null,
    awaiting: null,
  } as unknown as FinalizeResult['finalized'];
}

describe('task-226 — renderFinalizeConsole', () => {
  const base = {
    baseline: { rev: 'HEAD' as const, commit: 'b'.repeat(40) },
    instance: { id: 'plan-1', workflow: 'w' } as FinalizeResult['instance'],
    finalized: step('w.p'),
    commit: 'c'.repeat(40),
  };

  it('prints the instance, the finalized step with its commit, then the next step', () => {
    const text = renderFinalizeConsole({ ...base, next: step('w.q') });
    expect(text.split('\n').slice(0, 3)).toEqual(['workflow: w (plan-1)', `finalized: w.p (${'c'.repeat(40)})`, 'next step: w.q']);
  });

  it('says so when the instance has no next step', () => {
    expect(renderFinalizeConsole({ ...base, next: null })).toBe(`workflow: w (plan-1)\nfinalized: w.p (${'c'.repeat(40)})\nno next step\n`);
  });
});

describe('task-226 — an unscoped approval phase: the authority refusal names the type plan', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/gate.yaml\n');
    writeFixtureFile(root, '.wingfoil/workflows/custom/gate.yaml', 'name: gate\nstartable: true\nphases:\n  - name: go\n    role: developer\n    approval: { by_role: approver }\n');
    writeFixtureFile(root, '.wingfoil/memory.yaml', 'version: 1.0\ntypes:\n  plan:\n    path: "docs/plans/{id}.md"\n    states:\n      sequence: [ draft, active, done ]\n      waiting: [ active ]\n');
    writeFixtureFile(
      root,
      '.wingfoil/dna.yaml',
      'version: 1.0\nmodules:\n  - name: core\n    path: src/core\nstacks:\n  technologies:\n    - name: TypeScript\n      category: language\nteam:\n  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [ developer ]\n  roles:\n    - name: developer\n    - name: approver\npaths:\n  sources: [ src/ ]\n',
    );
    writeFixtureFile(root, 'docs/plans/plan-1.md', '---\nid: "plan-1"\ntype: plan\ntitle: "plan-1"\nstatus: active\nworkflow: "gate"\nphase: "x"\n---\n\n## Body\n');
    commitAll(root, 'fixture');
  });
  afterEach(() => removeTempDir(root));

  it("user not authorized to approve type 'plan'", async () => {
    const op = CORE_MODULES.find((module) => module.name === 'workflow')!.operations['workflowFinalize']!;
    const result = (await op.fn({ root, options: { reason: 'Go.' } })) as CoreResult<unknown>;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'VALIDATION', message: "user not authorized to approve type 'plan'" });
  });
});

describe('task-226 — commitEmpty when git refuses the commit', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, 'a.txt', 'a\n');
    commitAll(root, 'initial');
  });
  afterEach(() => removeTempDir(root));

  it('throws CommitFailure worded "an empty commit", and HEAD does not move', () => {
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    writeFixtureFile(root, '.git/hooks/pre-commit', '#!/bin/sh\necho "hook says no" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    const before = git(root, ['rev-parse', 'HEAD']).trim();
    let thrown: unknown;
    try {
      commitEmpty(root, 'workflow: finalize p x.y');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CommitFailure);
    expect((thrown as Error).message).toMatch(/^E_COMMIT_FAILED: git did not commit an empty commit: .*hook says no/);
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });
});
