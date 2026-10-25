/**
 * task-294 AC 1 / AC 3 (red-first) — `wingfoil workflow adopt`, the single form and the refusals the BDD
 * scenarios do not reach (`spec-017` §7.11, §8, §10; `spec-008` §12; design "Refusal order" 1–9 and D1–D10 as
 * ruled at the design gate, 2026-10-24), in-process through the registered `CORE_MODULES` operation
 * `workflowAdopt`, so the branches count toward coverage (W3 B7 lesson, task-237):
 *
 * - the step and the element each derived when the other is given; the `AdoptResult` payload;
 * - each refusal with its §10 text and code: off the frontier, a step that adds nothing, a step that already has
 *   its created element, no / several frontier steps adding the type, no candidate, a staged index, an unknown
 *   or closed `<ref>`;
 * - the usage refusals (a thrown `UsageError`, exit 2) before any read: `spec-008` §12's flag combinations, a
 *   malformed `--element`, a missing or blank `--reason` (D6: validated with `--plan` alone too);
 * - D8: on `--plan --apply`, authority is checked before the instance is resolved;
 * - D5: `--plan`'s `W_UNCOMMITTED_INPUTS` go out as success warnings, the payload keeps §8's shape;
 * - the console rendering (design "Output"), on hand-built values, through the operation's `renderConsole`.
 */
import { malformedElementRefMessage } from '../../src/core/element-ref';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { requireCleanIndex } from '../../src/core/write-guard';
import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import {
  adopt,
  BULK_REFUSAL,
  buildLifeRepo,
  element,
  head,
  INSTANCE,
  lifeYaml,
  linkedAddByHand,
  ok,
  outcomeOf,
  RL_V1,
  RL_V1_PATH,
  start,
  subjectOf,
  SUBJECT_RL_V1,
  workflowOperation,
  type AdoptPlanView,
  type AdoptResultView,
  type Invocation,
} from './helpers/adopt-fixture';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(removeTempDir));
function repo(options?: Parameters<typeof buildLifeRepo>[0]): string {
  const root = buildLifeRepo(options);
  roots.push(root);
  return root;
}

function expectRefusal(result: CoreResult<unknown>, code: string, message: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect({ code: result.error.code, message: result.error.message }).toEqual({ code, message });
  expect(exitCodeForResult(result)).toBe(1);
}

const REASON = { reason: 'created by hand before the engine' };

describe('task-294 — the single form (spec-017 §7.11)', () => {
  it('derives the step from --element: the one frontier step whose phase adds its type', async () => {
    const root = repo();
    await start(root);
    const value = ok<AdoptResultView>(await adopt(root, { positional: INSTANCE, options: { element: 'release-line:rl-v1', ...REASON } }));
    expect(subjectOf(root)).toBe(SUBJECT_RL_V1);
    expect(value.adopted).toEqual([{ step: 'life.seed', element: RL_V1, commit: head(root) }]);
  });

  it("derives the element from --step: the step's one candidate", async () => {
    const root = repo({ documents: { 'docs/planning/rl-v2.md': element('release-line', 'rl-v2', 'planning', { version: 'v2' }) } });
    await start(root);
    ok(await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', ...REASON } }));
    expect(subjectOf(root)).toBe(SUBJECT_RL_V1);
  });

  it('answers AdoptResult: the baseline it gated on, the instance, the adoption written and the new next step (spec-017 §8)', async () => {
    const root = repo();
    await start(root);
    const baseline = head(root);
    const value = ok<AdoptResultView>(await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v1', ...REASON } }));
    expect(Object.keys(value).sort()).toEqual(['adopted', 'baseline', 'instance', 'next']);
    expect(value.baseline).toEqual({ rev: 'HEAD', commit: baseline });
    expect(value.instance).toMatchObject({ id: INSTANCE, workflow: 'life' });
    expect(value.adopted).toEqual([{ step: 'life.seed', element: RL_V1, commit: head(root) }]);
    expect(value.next?.key).toBe('life.close@release-line:rl-v1');
  });

  it('records no Approver: line on the single form, whoever runs it (rule 7)', async () => {
    const root = repo();
    await start(root);
    ok(await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v1', ...REASON } }));
    expect(git(root, ['log', '-1', '--format=%B'])).not.toContain('Approver:');
  });
});

describe('task-294 — the single form refuses, each with its spec-017 §10 text, writing nothing', () => {
  async function refused(root: string, invocation: Invocation, code: string, message: string): Promise<CoreResult<unknown>> {
    const before = snapshotPersistence(root);
    const result = await adopt(root, invocation);
    expectRefusal(result, code, message);
    assertPersistenceUnchanged(root, before, message);
    return result;
  }

  it('a --step that is not on the frontier', async () => {
    const root = repo();
    await start(root);
    await refused(root, { positional: INSTANCE, options: { step: 'life.close', element: 'release-line:rl-v1', ...REASON } }, 'CONFLICT', `step 'life.close' is not on the frontier of ${INSTANCE}`);
  });

  it('a step whose phase adds no element', async () => {
    const root = repo({ workflows: { 'check-first': lifeYaml(['close', 'seed'], 'check-first') } });
    const instance = await start(root, 'check-first');
    await refused(root, { positional: instance, options: { step: 'check-first.close', element: 'release-line:rl-v1', ...REASON } }, 'CONFLICT', 'check-first.close adds no element to adopt');
  });

  it('a step that already has its created element (linked by an add commit)', async () => {
    const docFirst = `name: doc-first
startable: true
phases:
  - name: seed
    role: developer
    actions:
      - 'memory.add(type: release-line)'
    produces: [ "docs/notes/readme.md" ]
  - name: close
    role: developer
`;
    const root = repo({ workflows: { 'doc-first': docFirst } });
    const instance = await start(root, 'doc-first');
    linkedAddByHand(root, 'docs/planning/rl-v3.md', element('release-line', 'rl-v3', 'draft', { version: 'v3' }), 'release-line', 'rl-v3', instance, 'doc-first.seed');
    // The step stays on the frontier on its missing `produces`, scoped by the element it created.
    await refused(
      root,
      { positional: instance, options: { step: 'doc-first.seed@release-line:rl-v3', element: 'release-line:rl-v1', ...REASON } },
      'CONFLICT',
      'doc-first.seed@release-line:rl-v3 already has its created element',
    );
  });

  it('no --step, and no frontier step adds the element\'s type', async () => {
    const root = repo({ documents: { 'docs/tasks/task-1.md': element('task', 'task-1', 'done') } });
    await start(root);
    await refused(root, { positional: INSTANCE, options: { element: 'task:task-1', ...REASON } }, 'CONFLICT', `no step of ${INSTANCE} adds a task`);
  });

  it('no --step, and several frontier steps add the type: their keys in frontier order, also in details.steps', async () => {
    const twin = `name: twin
startable: true
phases:
  - name: seed-a
    role: developer
    optional: true
    actions:
      - 'memory.add(type: release-line)'
  - name: seed-b
    role: developer
    actions:
      - 'memory.add(type: release-line)'
`;
    const root = repo({ workflows: { twin } });
    const instance = await start(root, 'twin');
    const result = await refused(
      root,
      { positional: instance, options: { element: 'release-line:rl-v1', ...REASON } },
      'CONFLICT',
      `no step of ${instance} adds a release-line alone: give --step, one of: twin.seed-a, twin.seed-b`,
    );
    if (!result.ok) expect((result.error.details as { steps?: unknown } | undefined)?.steps).toEqual(['twin.seed-a', 'twin.seed-b']);
  });

  it('no --element, and no element matches the declared rules', async () => {
    const root = repo({ workflows: { later: `name: later\nstartable: true\nphases:\n  - name: seed\n    role: developer\n    actions:\n      - 'memory.add(type: release-line, version: "v2")'\n` } });
    const instance = await start(root, 'later');
    await refused(root, { positional: instance, options: { step: 'later.seed', ...REASON } }, 'CONFLICT', 'no candidate for later.seed; name one with --element');
  });

  it('an index holding staged changes: requireCleanIndex refuses the empty commit, the staged change stays staged', async () => {
    const root = repo();
    await start(root);
    writeFixtureFile(root, 'notes.txt', 'staged\n');
    git(root, ['add', '--', 'notes.txt']);
    const expected = requireCleanIndex(root, SUBJECT_RL_V1);
    expect(expected.ok).toBe(false);
    if (expected.ok) return;
    const before = head(root);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v1', ...REASON } });

    expectRefusal(result, expected.error.code, expected.error.message);
    expect(head(root)).toBe(before);
    expect(git(root, ['diff', '--cached', '--name-only']).trim()).toBe('notes.txt');
  });

  it('a <ref> that names no workflow and no instance', async () => {
    const root = repo();
    await start(root);
    await refused(root, { positional: 'nope', options: { step: 'life.seed', element: 'release-line:rl-v1', ...REASON } }, 'NOT_FOUND', 'unknown workflow: nope');
  });

  it('a <ref> that names a loaded workflow with no open instance', async () => {
    const root = repo({ workflows: { other: lifeYaml(['close'], 'other') } });
    await start(root);
    await refused(root, { positional: 'other', flags: { plan: true } }, 'NOT_FOUND', 'workflow is not open: other');
  });
});

describe('task-294 — usage refusals: a UsageError (exit 2) before any read (spec-008 §12, spec-017 §10)', () => {
  const cases: readonly [string, Invocation, string][] = [
    ['--apply without --plan', { flags: { apply: true }, options: REASON }, 'invalid flag combination: --apply needs --plan'],
    ['--plan with --step', { flags: { plan: true }, options: { step: 'life.seed' } }, 'invalid flag combination: --plan proposes every step; drop --step and --element'],
    ['--plan with --element', { flags: { plan: true }, options: { element: 'release-line:rl-v1' } }, 'invalid flag combination: --plan proposes every step; drop --step and --element'],
    ['none of --plan, --step, --element', { options: REASON }, 'missing required argument: --step, --element or --plan'],
    ['a malformed --element', { options: { element: 'nocolon', ...REASON } }, malformedElementRefMessage('nocolon')],
    ['the single form without --reason', { options: { step: 'life.seed', element: 'release-line:rl-v1' } }, 'missing required argument: --reason'],
    ['--plan --apply without --reason', { flags: { plan: true, apply: true } }, 'missing required argument: --reason'],
    ['a blank --reason', { options: { step: 'life.seed', element: 'release-line:rl-v1', reason: '   ' } }, 'invalid flag value: --reason must not be blank'],
    ['a blank --reason with --plan alone (design D6: validated when given)', { flags: { plan: true }, options: { reason: '   ' } }, 'invalid flag value: --reason must not be blank'],
  ];

  it.each(cases)('%s', async (_label, invocation, message) => {
    const root = repo();
    // `<ref>` names nothing: a usage refusal comes before the instance is resolved.
    const before = snapshotPersistence(root);
    const outcome = await outcomeOf(() => adopt(root, { positional: 'nope', ...invocation }));
    expect('thrown' in outcome).toBe(true);
    if (!('thrown' in outcome)) return;
    expect(outcome.thrown).toBeInstanceOf(UsageError);
    expect((outcome.thrown as Error).message).toBe(message);
    expect(exitCodeForThrow(outcome.thrown).exitCode).toBe(2);
    assertPersistenceUnchanged(root, before, message);
  });

  it('--plan alone takes a valid --reason, records it nowhere, and writes nothing (design D6)', async () => {
    const root = repo();
    await start(root);
    const before = snapshotPersistence(root);
    ok(await adopt(root, { positional: INSTANCE, flags: { plan: true }, options: { reason: 'looking only' } }));
    assertPersistenceUnchanged(root, before, 'plan with a reason');
  });
});

describe('task-294 — authority on --plan --apply (REQ-SEC-03, design D8)', () => {
  it('is checked before the instance is resolved: a non-approver is refused even for a <ref> that names nothing', async () => {
    const root = repo();
    const before = snapshotPersistence(root);
    const result = await adopt(root, { positional: 'nope', flags: { plan: true, apply: true }, options: { reason: 'x' } });
    expectRefusal(result, 'VALIDATION', BULK_REFUSAL);
    assertPersistenceUnchanged(root, before, 'authority before the instance');
  });

  it("names the uncommitted grant when only the working tree's dna.yaml would grant it", async () => {
    const root = repo();
    await start(root);
    const dna = git(root, ['show', 'HEAD:.wingfoil/dna.yaml']).replace('roles: [ developer ]', 'roles: [ developer, approver ]');
    writeFixtureFile(root, '.wingfoil/dna.yaml', dna);
    const result = await adopt(root, { positional: INSTANCE, flags: { plan: true, apply: true }, options: { reason: 'x' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message.startsWith(`${BULK_REFUSAL} — the working tree's '.wingfoil/dna.yaml' grants it`)).toBe(true);
  });
});

describe('task-294 — --plan reads HEAD, declared: the working tree explains, never decides (spec-017 §11, design D5)', () => {
  it('an uncommitted change to a candidate is a success warning naming it; the payload keeps the §8 shape', async () => {
    const root = repo();
    await start(root);
    writeFixtureFile(root, RL_V1_PATH, element('release-line', 'rl-v1', 'active', { version: 'v1' }));

    const result = await adopt(root, { positional: INSTANCE, flags: { plan: true } });

    const value = ok<AdoptPlanView>(result);
    expect(value.steps).toEqual([{ step: 'life.seed', type: 'release-line', candidates: [RL_V1], recorded: false }]);
    expect(Object.keys(value).sort()).toEqual(['applied', 'baseline', 'instance', 'orphans', 'steps']);
    expect(result.ok && (result.warnings ?? []).join('\n')).toContain(RL_V1_PATH);
  });
});

describe('task-294 — the console rendering (design "Output"), through the registered renderConsole', () => {
  const render = (value: unknown): string => {
    const renderConsole = workflowOperation('workflowAdopt').renderConsole;
    if (renderConsole === undefined) throw new Error('workflowAdopt declares no renderConsole');
    return renderConsole(value);
  };
  const instance = { id: INSTANCE, workflow: 'life' };
  const baseline = { rev: 'HEAD', commit: 'c0ffee' };
  const adr = { type: 'adr', id: 'adr-1', status: 'accepted' };
  const rl2 = { type: 'release-line', id: 'rl-v2', status: 'planning' };

  it('the single form: the workflow line, the adoption, then the next step or "no next step"', () => {
    expect(render({ baseline, instance, adopted: [{ step: 'life.seed', element: RL_V1, commit: 'abc1234' }], next: null })).toBe(
      'workflow: life (life-1-plan)\nadopted: release-line:rl-v1 into life.seed (abc1234)\nno next step\n',
    );
  });

  it('a plan: one line per step (recorded, one, several, none), per orphan, per application', () => {
    const value = {
      baseline,
      instance,
      steps: [
        { step: 'life.seed', type: 'release-line', candidates: [RL_V1], recorded: true },
        { step: 'life.adr@release-line:rl-v1', type: 'adr', candidates: [adr], recorded: false },
        { step: 'life.more@release-line:rl-v1', type: 'release-line', candidates: [RL_V1, rl2], recorded: false },
        { step: 'life.note@release-line:rl-v1', type: 'task', candidates: [], recorded: false },
      ],
      orphans: [
        { commit: 'd00d', key: 'life.old', element: RL_V1 },
        { commit: 'beef', key: 'life.gone', element: null },
      ],
      applied: [{ step: 'life.adr@release-line:rl-v1', element: adr, commit: 'f00d' }],
    };
    expect(render(value)).toBe(
      [
        'workflow: life (life-1-plan)',
        'step life.seed: adopted release-line:rl-v1 (recorded)',
        'step life.adr@release-line:rl-v1: 1 candidate adr:adr-1',
        'step life.more@release-line:rl-v1: 2 candidates release-line:rl-v1, release-line:rl-v2',
        'step life.note@release-line:rl-v1: no candidate of type task',
        'orphan: life.old (d00d) release-line:rl-v1',
        'orphan: life.gone (beef)',
        'applied: adr:adr-1 into life.adr@release-line:rl-v1 (f00d)',
        '',
      ].join('\n'),
    );
  });

  it('a plan with no step, orphan or application: "nothing to adopt"', () => {
    expect(render({ baseline, instance, steps: [], orphans: [], applied: [] })).toBe('workflow: life (life-1-plan)\nnothing to adopt\n');
  });
});
