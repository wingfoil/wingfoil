/**
 * task-294 AC 2 (red-first) — REQ-STATE-11's fit criterion on `workflow adopt --plan` and `--plan --apply`
 * (`spec-017` §7.11, rule 6; design D1, D3), in-process through the registered `CORE_MODULES` operation
 * `workflowAdopt`, on a fixture of four elements added before the instance started, without linkage:
 *
 * - `life.seed` adds a release-line `version: "v1"`: one candidate, `rl-v1`;
 * - `life.adr` adds an adr: one candidate, `adr-1` — a step reachable only once `rl-v1` counts as created, so
 *   the plan lists it only if the walk deduces again after a simulated adoption;
 * - `life.note` adds a task: two candidates, `task-1` and `task-2` — listed, adopts nothing, stops the walk.
 *
 * `--plan` is byte-identical on two runs and writes nothing; `--apply` writes one empty commit per
 * single-candidate step, in walk order, and touches no file; a re-run writes nothing and lists the recorded
 * adoptions first (D3).
 */
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
  element,
  INSTANCE,
  MORGAN,
  ok,
  RL_V1,
  RL_V1_PATH,
  start,
  subjectOf,
  SUBJECT_RL_V1,
  workflowOperation,
  type AdoptPlanView,
  type NextView,
} from './helpers/adopt-fixture';

const DOCUMENTS = {
  'docs/adrs/adr-1.md': element('adr', 'adr-1', 'accepted'),
  'docs/tasks/task-1.md': element('task', 'task-1', 'done'),
  'docs/tasks/task-2.md': element('task', 'task-2', 'done'),
};
const PATHS = [RL_V1_PATH, ...Object.keys(DOCUMENTS)];
const ADR_1 = { type: 'adr', id: 'adr-1', status: 'accepted' };
const TASKS = [
  { type: 'task', id: 'task-1', status: 'done' },
  { type: 'task', id: 'task-2', status: 'done' },
];
const ADR_STEP = 'life.adr@release-line:rl-v1';
const NOTE_STEP = 'life.note@release-line:rl-v1';

describe('task-294 AC 2 — REQ-STATE-11: --plan proposes, --apply writes one commit per step, a re-run writes nothing', () => {
  let root: string;
  beforeEach(async () => {
    root = buildLifeRepo({ phases: ['seed', 'adr', 'note', 'close'], documents: DOCUMENTS });
    await start(root);
  });
  afterEach(() => removeTempDir(root));

  const plan = async (): Promise<AdoptPlanView> => ok<AdoptPlanView>(await adopt(root, { positional: INSTANCE, flags: { plan: true } }));
  const apply = () => as(MORGAN, () => adopt(root, { positional: INSTANCE, flags: { plan: true, apply: true }, options: { reason: 'adoption of the pre-engine state' } }));

  it('--plan lists every step blocked on a creation, in walk order, the candidates in id order; the walk deduces again after each single-candidate step', async () => {
    // Before any adoption the frontier holds only `life.seed`: `life.adr` is reachable only through the walk.
    const next = ok<NextView>(await call('workflowNext', root, { positional: INSTANCE }));
    expect(next.next?.key).toBe('life.seed');

    const value = await plan();

    expect(value.steps).toEqual([
      { step: 'life.seed', type: 'release-line', candidates: [RL_V1], recorded: false },
      { step: ADR_STEP, type: 'adr', candidates: [ADR_1], recorded: false },
      { step: NOTE_STEP, type: 'task', candidates: TASKS, recorded: false },
    ]);
    expect(value.orphans).toEqual([]);
    expect(value.applied).toEqual([]);
  });

  it('--plan is byte-identical on two runs on one commit (value and console text), and writes 0 commits', async () => {
    const before = snapshotPersistence(root);
    const count = commitCount(root);
    const renderConsole = workflowOperation('workflowAdopt').renderConsole!;

    const first = await plan();
    const second = await plan();

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(renderConsole(second)).toBe(renderConsole(first));
    expect(commitCount(root)).toBe(count);
    assertPersistenceUnchanged(root, before, 'adopt --plan, twice');
  });

  it('--apply writes exactly one empty commit per single-candidate step, in walk order, and leaves every element file byte-identical', async () => {
    const count = commitCount(root);
    const blobs = PATHS.map((path) => blobOf(root, path));

    const value = ok<AdoptPlanView>(await apply());

    expect(commitCount(root)).toBe(count + 2);
    expect([subjectOf(root, 'HEAD~1'), subjectOf(root, 'HEAD')]).toEqual([SUBJECT_RL_V1, `workflow: adopt ${INSTANCE} ${ADR_STEP} adr:adr-1`]);
    expect([changedPaths(root, 'HEAD~1'), changedPaths(root, 'HEAD')]).toEqual(['', '']);
    expect(PATHS.map((path) => blobOf(root, path))).toEqual(blobs);
    expect(value.applied.map((entry) => [entry.step, `${entry.element.type}:${entry.element.id}`])).toEqual([
      ['life.seed', 'release-line:rl-v1'],
      [ADR_STEP, 'adr:adr-1'],
    ]);
  });

  it('a re-run of --apply writes 0 commits, and lists the recorded adoptions first, then what is still proposed (design D3)', async () => {
    ok(await apply());
    const before = snapshotPersistence(root);

    const value = ok<AdoptPlanView>(await apply());

    assertPersistenceUnchanged(root, before, 'adopt --plan --apply, re-run');
    expect(value.applied).toEqual([]);
    expect(value.steps).toEqual([
      { step: 'life.seed', type: 'release-line', candidates: [RL_V1], recorded: true },
      { step: ADR_STEP, type: 'adr', candidates: [ADR_1], recorded: true },
      { step: NOTE_STEP, type: 'task', candidates: TASKS, recorded: false },
    ]);
  });
});
