/**
 * task-295, red after review (approver rulings 2026-10-26 on the independent review's findings; `spec-017` §4.8,
 * §7.12, §10; `dl-187` C5) — `wingfoil workflow rekey` in process, through the registered `CORE_MODULES` operation,
 * on the fixture of `./helpers/rekey-fixture`:
 *
 * - **B (a)** — the no-op ("mapping already recorded") holds only when no orphan of the instance still has `<from>`
 *   as its base. A linkage naming the old key that reaches the walk after the first rekey through a merge (the
 *   reviewer's scratch r3: adopt; a side branch adds a linkage naming `life.seed` before the rename; rename; rekey,
 *   which remaps 1; merge the side branch) is still an orphan, so a second identical rekey writes a NEW record
 *   (`commit` non-null, `remapped: 1`), and no `W_PROVENANCE_ORPHAN` remains after it. A repeated rekey with no
 *   orphan left is still the no-op (`commit: null`).
 * - **C (a)** — `--to` must name a step of the instance's own workflow or of a workflow it includes, directly or
 *   indirectly. A phase of a declared workflow that `life` does not include is refused. §10 gives no text for this
 *   refusal, so the message pinned here is qa's PROPOSAL, recorded in the task's notes for the developer and the
 *   approver: `CONFLICT` "`<to>` is not a step of `<workflow>` or of a workflow it includes". A phase of an included
 *   sub-workflow, or of a workflow included by that one, is accepted.
 */
import { deduceWorkflowStateAtHead } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { asMorgan, buildRekeyRepo, call, commitWith, LIFE_FILE, ok } from './helpers/rekey-fixture';

const VALID = { from: 'life.seed', to: 'life.seed-line', reason: 'phase renamed' } as const;

interface RekeyView {
  readonly remapped: number;
  readonly commit: string | null;
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();
const count = (root: string): number => Number(git(root, ['rev-list', '--count', 'HEAD']).trim());
const orphans = (root: string): number => deduceWorkflowStateAtHead(root).diagnostics.filter((d) => d.code === 'W_PROVENANCE_ORPHAN').length;

function rekey(root: string, options: Record<string, unknown>): Promise<CoreResult<unknown>> {
  return asMorgan(() => call('workflowRekey', root, 'life-1-plan', options));
}

describe('task-295 B (a) — the no-op holds only when no orphan of the instance still has <from> as its base', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) removeTempDir(root);
  });

  it('r3: a linkage naming the old key merged in after the first rekey — a second identical rekey writes a new record (remapped 1); no orphan remains', async () => {
    const root = await buildRekeyRepo({
      beforeRename: (repo) => {
        git(repo, ['checkout', '--quiet', '-b', 'side']);
        writeFixtureFile(repo, 'docs/rl/rl-v2.md', '---\nid: "rl-v2"\ntype: release-line\ntitle: "rl-v2"\nstatus: draft\n---\n\n## Body\n');
        commitWith(repo, 'wf(release-line): add rl-v2', { 'WingFoil-Instance': 'life-1-plan', 'WingFoil-Step': 'life.seed' });
        git(repo, ['checkout', '--quiet', 'main']);
      },
    });
    roots.push(root);

    const first = ok<RekeyView>(await rekey(root, { ...VALID }));
    expect(first.remapped).toBe(1);
    git(root, ['merge', '--quiet', '--no-ff', '--no-edit', 'side']);
    // The precondition: the merged linkage still names life.seed and no rekey of its walk maps it.
    expect(orphans(root)).toBe(1);

    const before = count(root);
    const result = await rekey(root, { ...VALID });
    const second = ok<RekeyView>(result);
    expect(exitCodeForResult(result)).toBe(0);
    expect(second.commit).not.toBeNull();
    expect(second.commit).toBe(head(root));
    expect(second.remapped).toBe(1);
    expect(count(root)).toBe(before + 1);
    expect(git(root, ['log', '-1', '--format=%s']).trim()).toBe('workflow: rekey life-1-plan life.seed life.seed-line');
    expect(orphans(root)).toBe(0);
  });

  it('a repeated rekey with no orphan left is still the no-op: commit null, remapped 0, nothing written (characterization)', async () => {
    const root = await buildRekeyRepo();
    roots.push(root);
    ok(await rekey(root, { ...VALID }));
    expect(orphans(root)).toBe(0);
    const unchanged = snapshotPersistence(root);
    const value = ok<RekeyView>(await rekey(root, { ...VALID }));
    expect(value).toMatchObject({ commit: null, remapped: 0 });
    assertPersistenceUnchanged(root, unchanged);
  });
});

/**
 * `life` after the rename, with a third phase `nest` that includes `sub`; `sub` includes `deep`; `other` is
 * declared and includable but included by nothing `life` reaches.
 */
function addWorkflows(root: string): void {
  writeFixtureFile(
    root,
    '.wingfoil/workflows.yaml',
    'version: 1.0\ninclude:\n  - workflows/custom/life.yaml\n  - workflows/custom/sub.yaml\n  - workflows/custom/deep.yaml\n  - workflows/custom/other.yaml\n',
  );
  writeFixtureFile(
    root,
    LIFE_FILE,
    `name: life
startable: true
phases:
  - name: seed-line
    role: developer
    actions:
      - 'memory.add(type: release-line, version: "v1")'
  - name: close
    role: approver
  - name: nest
    include: sub
`,
  );
  writeFixtureFile(root, '.wingfoil/workflows/custom/sub.yaml', 'name: sub\nincludable: true\nphases:\n  - name: moved\n    role: developer\n  - name: deeper\n    include: deep\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/deep.yaml', 'name: deep\nincludable: true\nphases:\n  - name: inner\n    role: developer\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/other.yaml', 'name: other\nincludable: true\nphases:\n  - name: moved\n    role: developer\n');
  commitAll(root, 'add the sub-workflows sub, deep and other');
}

describe("task-295 C (a) — --to names a step of the instance's workflow or of a workflow it includes", () => {
  let root: string;
  beforeEach(async () => {
    root = await buildRekeyRepo();
    addWorkflows(root);
  });
  afterEach(() => removeTempDir(root));

  it('--to other.moved (declared, but life does not include other): refused CONFLICT, exit 1, nothing written (message: qa proposal)', async () => {
    const unchanged = snapshotPersistence(root);
    const result = await rekey(root, { ...VALID, to: 'other.moved' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toBe('other.moved is not a step of life or of a workflow it includes');
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);
  });

  it('--to sub.moved (a phase of a sub-workflow life includes directly): accepted, one record, remapped 1', async () => {
    const value = ok<RekeyView>(await rekey(root, { ...VALID, to: 'sub.moved' }));
    expect(value.commit).toBe(head(root));
    expect(value.remapped).toBe(1);
    expect(git(root, ['log', '-1', '--format=%s']).trim()).toBe('workflow: rekey life-1-plan life.seed sub.moved');
  });

  it('--to deep.inner (a phase of a workflow life includes indirectly, through sub): accepted, remapped 1', async () => {
    const value = ok<RekeyView>(await rekey(root, { ...VALID, to: 'deep.inner' }));
    expect(value.commit).toBe(head(root));
    expect(value.remapped).toBe(1);
  });
});
