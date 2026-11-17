/**
 * task-333 AC 7 (`spec-018` §6 preamble, Consequences "Tests outside this spec's cases"; design D8) — the jest run
 * carries no agent marker, whoever starts it.
 *
 * `spec-018` refuses every approver-gated verb in a session one of its §1 markers marks. A suite started by an agent
 * inherits the agent's marker (Claude Code sets `CLAUDE_CODE_CHILD_SESSION` in every process it spawns), and the core
 * reads the environment of the process it runs in, so a suite that approves in-process or in a child would fail for
 * the runner's reason. `test/global-setup.cjs` removes the markers once, before any worker is forked; this suite
 * pins that, and the parity of the one list (`test/agent-markers.cjs`) with `AGENT_MARKERS`
 * (`src/core/agent-context.ts`), so a marker added to `src` is scrubbed here too.
 *
 * - characterization: the worker's environment holds none of the markers, and the helper is pure — they pass as
 *   soon as the helper and the setup's scrub exist, whatever `src` refuses;
 * - the parity case is red until `src/core/agent-context.ts` exists (it reads the module in the test, so the other
 *   cases still run).
 */
import { AGENT_ENV_MARKERS, withoutAgentMarkers } from '../agent-markers.cjs';

describe('task-333 AC 7 — the jest run carries no agent marker (spec-018 §6 preamble, design D8)', () => {
  it('the helper lists the environment markers of spec-018 §1, in §1 order, frozen', () => {
    expect([...AGENT_ENV_MARKERS]).toEqual(['WINGFOIL_AGENT', 'CLAUDE_CODE_CHILD_SESSION', 'CODEX_SANDBOX']);
    expect(Object.isFrozen(AGENT_ENV_MARKERS)).toBe(true);
  });

  it('the environment a jest worker sees holds none of them (test/global-setup.cjs removed them)', () => {
    expect(AGENT_ENV_MARKERS.filter((key) => key in process.env)).toEqual([]);
  });

  it('withoutAgentMarkers drops every marker, even an empty one, keeps every other variable and leaves its input as it was', () => {
    const input = { WINGFOIL_AGENT: '', CLAUDE_CODE_CHILD_SESSION: '1', CODEX_SANDBOX: 'seatbelt', CLAUDECODE: '1', PATH: '/bin' };
    const copy = { ...input };
    expect(withoutAgentMarkers(input)).toEqual({ CLAUDECODE: '1', PATH: '/bin' });
    expect(input).toEqual(copy);
  });

  it('parity: the helper lists exactly the environment ids of AGENT_MARKERS (src/core/agent-context.ts), in its order', () => {
    // Loaded in the test, not imported, so the cases above run before the module exists.
    const { AGENT_MARKERS } = jest.requireActual<{ AGENT_MARKERS: readonly { readonly id: string; readonly kind: string }[] }>('../../src/core/agent-context');
    const environmentIds = AGENT_MARKERS
      .filter((marker) => marker.kind === 'environment')
      .map((marker) => marker.id);
    expect([...AGENT_ENV_MARKERS]).toEqual(environmentIds);
  });
});
