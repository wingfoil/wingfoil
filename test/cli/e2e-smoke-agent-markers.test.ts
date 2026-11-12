/**
 * task-333 design D14 — the e2e smoke scrubs the `spec-018` §1 environment markers from its base environment, so
 * its throwaway repository's approvals pass when an agent runs it (`wave-checks`, the `e2e-smoke` phase). The smoke
 * spells the list itself, because it runs from a copy of `scripts/` with no `test/` and no `dist/`
 * (`test/cli/e2e-smoke-candidate.test.ts`); this holds that list equal to the test helper's
 * (`test/agent-markers.cjs`), which `test/lint/agent-markers-scrubbed.test.ts` holds equal to `AGENT_MARKERS`.
 */
import { AGENT_ENV_MARKERS } from '../agent-markers.cjs';

// Loaded rather than imported: `scripts/e2e-smoke.d.cts` declares the smoke's tested surface, not this constant.
const smoke = jest.requireActual<{ AGENT_ENV_MARKERS: readonly string[] }>('../../scripts/e2e-smoke.cjs');

describe('task-333 D14 — the e2e smoke scrubs the agent markers', () => {
  it("lists exactly the test helper's environment markers, in spec-018 §1 order, frozen", () => {
    expect([...smoke.AGENT_ENV_MARKERS]).toEqual([...AGENT_ENV_MARKERS]);
    expect(Object.isFrozen(smoke.AGENT_ENV_MARKERS)).toBe(true);
  });
});
