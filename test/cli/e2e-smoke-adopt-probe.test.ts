/**
 * task-294 AC 5 (red until green edits `scripts/e2e-smoke.cjs`; design D9 as ruled at the design gate,
 * 2026-10-24; `dl-187` "What changes elsewhere") — the smoke scenario gains a `workflow adopt --plan` probe: after
 * `workflow list`, it starts `sw-life-cycle` (`--format json`, captured), records the two checkpoints with
 * `workflow finalize`, and runs `workflow adopt {<capture>.instance.id} --plan --format json`, which exits 0 with
 * an empty plan — on either scaffold the next step, `<slug>-delivery.plan`, completes from its `produces` entry,
 * so no step is blocked on a creation (checked on the code build at red for Scrum and Kanban: after the two
 * finalizes `workflow next` printed `scrum-delivery.plan` / `kanban-delivery.plan`, kinds `created, produces`,
 * missing `produces`).
 *
 * Pure on `smokeSteps(template)`; the run itself is `test/cli/e2e-smoke.test.ts`'s.
 */
import { SMOKE_TEMPLATES, smokeSteps } from '../../scripts/e2e-smoke.cjs';

const JSON_FORMAT = ['--format', 'json'];

describe.each(SMOKE_TEMPLATES.map((template) => [template]))('task-294 — the adopt --plan probe of the %s scenario (design D9)', (template) => {
  const steps = smokeSteps(template);
  const index = (predicate: (args: readonly string[]) => boolean): number => steps.findIndex((step) => predicate(step.args));

  const list = index((args) => args[0] === 'workflow' && args[1] === 'list');
  const startAt = index((args) => args.slice(0, 3).join(' ') === 'workflow start sw-life-cycle');
  const adoptAt = index((args) => args[0] === 'workflow' && args[1] === 'adopt');

  it('starts sw-life-cycle after workflow list, as JSON, capturing the instance', () => {
    expect(list).toBeGreaterThanOrEqual(0);
    expect(startAt).toBeGreaterThan(list);
    const start = steps[startAt]!;
    expect(start).toMatchObject({ args: ['workflow', 'start', 'sw-life-cycle', ...JSON_FORMAT], exit: 0, json: true });
    expect(typeof start.capture).toBe('string');
  });

  it('records the two checkpoints with workflow finalize, between the start and the probe', () => {
    expect(adoptAt).toBeGreaterThan(startAt);
    const between = steps.slice(startAt + 1, adoptAt);
    expect(between.filter((step) => step.args[0] === 'workflow' && step.args[1] === 'finalize' && step.exit === 0)).toHaveLength(2);
  });

  it('runs workflow adopt <instance> --plan --format json: exit 0, no step, no orphan, nothing applied', () => {
    const start = steps[startAt]!;
    expect(steps[adoptAt]).toEqual({
      args: ['workflow', 'adopt', `{${start.capture}.instance.id}`, '--plan', ...JSON_FORMAT],
      exit: 0,
      json: true,
      expect: { 'steps.length': 0, 'orphans.length': 0, 'applied.length': 0 },
    });
  });
});
