/** The environment ids of `spec-018` §1's agent markers, in §1 order (task-333 AC 7). */
export const AGENT_ENV_MARKERS: readonly ['WINGFOIL_AGENT', 'CLAUDE_CODE_CHILD_SESSION', 'CODEX_SANDBOX'];

/** `env` without any {@link AGENT_ENV_MARKERS} variable, every other variable kept. Pure. */
export function withoutAgentMarkers(env: Readonly<Record<string, string | undefined>>): Record<string, string | undefined>;
