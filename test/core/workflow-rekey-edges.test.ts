/**
 * task-295 (developer, refactor) — the edges of `workflow rekey` the red suites do not reach:
 *
 * - an in-process caller that leaves out `<ref>` gets the registrar's usage refusal, `missing required argument:
 *   <ref>` (exit 2), after the option checks and before any read;
 * - a rekey that completes the instance's last step answers `next: null`, and the console prints `no next step`;
 * - the dry-run table's fixture shape — a phase record naming the old key, no adoption — remaps that record alone.
 */
import { renderRekeyConsole, type RekeyResult } from '../../src/core/workflow-rekey';
import { UsageError } from '../../src/core/usage-error';
import { commitAll, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { asMorgan, buildRekeyRepo, call, commitWith, LIFE_FILE, ok } from './helpers/rekey-fixture';

const VALID = { from: 'life.seed', to: 'life.seed-line', reason: 'phase renamed' } as const;

describe('task-295 — workflow rekey edges', () => {
  let root: string;
  beforeEach(async () => {
    root = await buildRekeyRepo();
  });
  afterEach(() => removeTempDir(root));

  it('no <ref> in process: UsageError "missing required argument: <ref>"', async () => {
    await expect(asMorgan(() => call('workflowRekey', root, undefined, { ...VALID }))).rejects.toThrow(UsageError);
    await expect(asMorgan(() => call('workflowRekey', root, undefined, { ...VALID }))).rejects.toThrow('missing required argument: <ref>');
  });

  it('a rekey that completes the last step: next is null and the console says "no next step"', async () => {
    // `life` keeps only the renamed phase: once the adoption counts for it, the instance has nothing left to do.
    writeFixtureFile(root, LIFE_FILE, "name: life\nstartable: true\nphases:\n  - name: seed-line\n    role: developer\n    actions:\n      - 'memory.add(type: release-line, version: \"v1\")'\n");
    commitAll(root, 'drop life.close');
    const value = ok<RekeyResult>(await asMorgan(() => call('workflowRekey', root, 'life-1-plan', { ...VALID })));
    expect(value).toMatchObject({ remapped: 1, next: null });
    expect(renderRekeyConsole(value).split('\n')).toContain('no next step');
  });

  it('a phase record alone naming the old key is remapped: remapped 1, with no adoption', async () => {
    commitWith(root, 'workflow: finalize life-1-plan life.close-old', { 'WingFoil-Phase': 'life.close-old completed', 'WingFoil-Instance': 'life-1-plan' });
    const value = ok<RekeyResult>(await asMorgan(() => call('workflowRekey', root, 'life-1-plan', { from: 'life.close-old', to: 'life.close', reason: 'renamed' })));
    expect(value.remapped).toBe(1);
  });
});
