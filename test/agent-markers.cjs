'use strict';
/**
 * The agent markers a test environment must not carry (`spec-018` §1, §6 preamble; task-333 AC 7, design D8).
 *
 * `spec-018` makes every approver-gated verb refuse a session that one of its environment markers marks
 * (`WINGFOIL_AGENT`, `CLAUDE_CODE_CHILD_SESSION`, `CODEX_SANDBOX`; the fourth marker, `--co-author`, is an option and
 * lives on a command line, not in an environment). A suite run under an agent inherits the agent's own marker —
 * Claude Code sets `CLAUDE_CODE_CHILD_SESSION` in every process it spawns — so a suite that runs `memory approve`,
 * in-process or in a child, would be refused for a reason that is the runner's, not the test's.
 *
 * Two uses, one list:
 *
 * - `test/global-setup.cjs` deletes {@link AGENT_ENV_MARKERS} from jest's main process before any worker is forked,
 *   as it applies the git isolation (`test/git-isolation.cjs`), so every worker and every process it spawns starts
 *   unmarked, whoever runs `npm test`;
 * - a case that builds a child environment starts from {@link withoutAgentMarkers}`(process.env)` and then adds what
 *   the case names (`spec-018` §6).
 *
 * `test/lint/agent-markers-scrubbed.test.ts` holds the list equal to the environment ids of `AGENT_MARKERS`
 * (`src/core/agent-context.ts`), so a marker added there is scrubbed here.
 */

/** The environment ids of `spec-018` §1's markers, in §1 order. */
const AGENT_ENV_MARKERS = Object.freeze(['WINGFOIL_AGENT', 'CLAUDE_CODE_CHILD_SESSION', 'CODEX_SANDBOX']);

/**
 * `env` without any {@link AGENT_ENV_MARKERS} variable, every other variable kept. Pure: `env` is not changed.
 *
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {Record<string, string | undefined>}
 */
function withoutAgentMarkers(env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (!AGENT_ENV_MARKERS.includes(key)) out[key] = value;
  }
  return out;
}

module.exports = { AGENT_ENV_MARKERS, withoutAgentMarkers };
