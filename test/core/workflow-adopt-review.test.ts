/**
 * task-294 — red after review (approver rulings 2026-10-25, reject 2f581d78), in-process through the registered
 * `CORE_MODULES` operation `workflowAdopt`, on fixture repositories (the `life` workflow of
 * `./helpers/adopt-fixture.ts`, replaced per case through its `workflows` option; the helper is not edited):
 *
 * - **D1 re-ruled for `--plan`** — BDD P4.21 sc. 2 "Propose the adoptions of an instance without writing" and
 *   sc. 3 "Apply the proposed adoptions …" bound on the shape of `sw-life-cycle.seed-first-release-line`, whose
 *   `produces` is a plain string path naming the created element (`"docs/planning/{id}.md"`): `--plan` lists the
 *   step with its one candidate, `--plan --apply` writes that one adoption, the step completes and the gate after
 *   it stays held (red: today `--plan` prints `nothing to adopt`, measured on 2bd17839). The `{ type, path }` form
 *   stays listed (characterization).
 * - **Finding 2** — two frontier steps sharing one candidate: `--plan --apply` writes exactly the adoptions
 *   `--plan` proposes, with no part-way refusal (red: today it writes `life.seed-a`'s adoption, then exits 1 with
 *   `step 'life.seed-b' is not on the frontier of life-1-plan`).
 */
import { exitCodeForResult } from '../../src/core/exit-code';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import {
  adopt,
  as,
  blobOf,
  buildLifeRepo,
  call,
  changedPaths,
  commitCount,
  INSTANCE,
  MORGAN,
  ok,
  RL_V1,
  RL_V1_PATH,
  start,
  subjectOf,
  SUBJECT_RL_V1,
  type AdoptPlanView,
  type NextView,
} from './helpers/adopt-fixture';

/** `sw-life-cycle.seed-first-release-line`'s shape: a string `produces` path naming the created element. */
const STRING_PRODUCES = `name: life
startable: true
phases:
  - name: seed
    role: developer
    actions:
      - 'memory.add(type: release-line, version: "v1")'
      - memory.submit
    produces:
      - "docs/planning/{id}.md"
  - name: approve
    role: reviewer
    approval: { by_role: approver }
    actions:
      - memory.approve
  - name: close
    role: developer
`;

const TYPED_PRODUCES = STRING_PRODUCES.replace('      - "docs/planning/{id}.md"\n', '      - { type: release-line, path: "docs/planning/{release-line.id}.md" }\n');

/** Two frontier steps adding a release-line `version: "v1"`, sharing the one candidate `rl-v1` (review r1). */
const TWIN = `name: life
startable: true
phases:
  - name: seed-a
    role: developer
    optional: true
    actions:
      - 'memory.add(type: release-line, version: "v1")'
  - name: seed-b
    role: developer
    actions:
      - 'memory.add(type: release-line, version: "v1")'
  - name: close
    role: developer
`;

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(removeTempDir));
async function startedWith(life: string): Promise<string> {
  const root = buildLifeRepo({ workflows: { life } });
  roots.push(root);
  await start(root);
  return root;
}

const plan = async (root: string): Promise<AdoptPlanView> => ok<AdoptPlanView>(await adopt(root, { positional: INSTANCE, flags: { plan: true } }));
const apply = (root: string) => as(MORGAN, () => adopt(root, { positional: INSTANCE, flags: { plan: true, apply: true }, options: { reason: 'adoption of the pre-engine state' } }));

describe('task-294 red after review — D1 re-ruled: a string produces path naming the created element (BDD P4.21 sc. 2, sc. 3)', () => {
  it('Propose the adoptions: --plan lists the step with its single candidate, writing nothing', async () => {
    const root = await startedWith(STRING_PRODUCES);
    const before = snapshotPersistence(root);

    const value = await plan(root);

    expect(value.steps).toEqual([{ step: 'life.seed', type: 'release-line', candidates: [RL_V1], recorded: false }]);
    assertPersistenceUnchanged(root, before, 'adopt --plan');
  });

  it('Apply the proposed adoptions: one empty commit, the step completes, the gate after it stays held', async () => {
    const root = await startedWith(STRING_PRODUCES);
    const count = commitCount(root);
    const blob = blobOf(root, RL_V1_PATH);

    const result = await apply(root);

    const value = ok<AdoptPlanView>(result);
    expect(exitCodeForResult(result)).toBe(0);
    expect(commitCount(root)).toBe(count + 1);
    expect(subjectOf(root)).toBe(SUBJECT_RL_V1);
    expect(changedPaths(root)).toBe('');
    expect(blobOf(root, RL_V1_PATH)).toBe(blob);
    expect(value.applied.map((entry) => [entry.step, `${entry.element.type}:${entry.element.id}`])).toEqual([['life.seed', 'release-line:rl-v1']]);
    const next = ok<NextView>(await call('workflowNext', root, { positional: INSTANCE }));
    expect(next.next?.key).toBe('life.approve@release-line:rl-v1');
    expect(next.next?.awaiting).toMatchObject({ kind: 'approval', elements: [RL_V1] });
  });

  it('the { type, path } form stays listed (characterization)', async () => {
    const root = await startedWith(TYPED_PRODUCES);
    expect((await plan(root)).steps).toEqual([{ step: 'life.seed', type: 'release-line', candidates: [RL_V1], recorded: false }]);
  });
});

describe('task-294 red after review — finding 2: two frontier steps sharing one candidate', () => {
  it('--plan proposes the candidate once, to the first step in walk order', async () => {
    const root = await startedWith(TWIN);
    const steps = (await plan(root)).steps;
    expect(steps[0]).toEqual({ step: 'life.seed-a', type: 'release-line', candidates: [RL_V1], recorded: false });
    expect(steps.filter((entry) => entry.candidates.some((candidate) => candidate.id === 'rl-v1'))).toHaveLength(1);
    expect(steps.map((entry) => entry.step)).not.toContain('life.seed-b');
  });

  it('--plan --apply writes exactly the proposed adoptions, with no part-way refusal', async () => {
    const root = await startedWith(TWIN);
    const proposed = (await plan(root)).steps.filter((entry) => !entry.recorded && entry.candidates.length === 1);
    const count = commitCount(root);

    const result = await apply(root);

    const value = ok<AdoptPlanView>(result);
    expect(commitCount(root)).toBe(count + proposed.length);
    expect(proposed.map((entry) => entry.step)).toEqual(['life.seed-a']);
    expect(subjectOf(root)).toBe(`workflow: adopt ${INSTANCE} life.seed-a release-line:rl-v1`);
    expect(value.applied.map((entry) => entry.step)).toEqual(['life.seed-a']);
  });
});
