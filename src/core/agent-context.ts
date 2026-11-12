/**
 * The agent context of an invocation (`spec-018` §1, §2.6, §3.1–§3.2; `dl-212` D1; task-333).
 *
 * An **agent marker** is one fact of the invocation that says the command runs in an agent's session: WingFoil's
 * launcher variable `WINGFOIL_AGENT`, the `--co-author` option, and the vendor variables `CLAUDE_CODE_CHILD_SESSION`
 * (Claude Code) and `CODEX_SANDBOX` (Codex CLI). {@link AGENT_MARKERS} is the closed, ordered set: nothing else in
 * `src/` spells a marker variable, so the CLI, `agent execute` and the shipped check read the same list, and the set
 * grows only by a revision of `spec-018` (§1.3). `CLAUDECODE` is deliberately not a marker: an IDE sets it in the
 * terminals it opens for the human too (§1).
 *
 * An environment marker is present when its variable is **defined**, whatever its value, the empty string included:
 * fail-closed, as a set but blank `GIT_AUTHOR_*` still decides git's identity. A value is never printed.
 *
 * {@link resolveAgentContext} reads the markers once per operation and its result is handed on, never re-read
 * (`dl-064` B.1). Its gated form — the one every approver-gated operation (`spec-018` §0) calls — computes the
 * markers only: it reads no `team.agents` entry and neither refuses nor warns, so an agent on a gated operation is
 * told {@link E_AGENT_CONTEXT} and nothing else (§2.6). The ungated form, which fills {@link AgentContext.attribution}
 * for the trailers of `spec-018` §2, is `task-334`'s; until then it returns the markers with no attribution.
 *
 * {@link refuseAgentContext} is the first step of the shared approver check (`requireApproverAuthority`,
 * `./approval-authority.ts`, §3.1): with any marker present the operation is refused, `VALIDATION`, exit `1`, with
 * §3.2's message and hint, before its identity is judged.
 *
 * **How the invocation reaches the core** (design D5). The CLI registrar wraps each operation in
 * {@link withAgentInvocation} with `process.env` and the `--co-author` value; {@link currentAgentInvocation} reads it
 * back inside the operation, its awaited continuations included — an `AsyncLocalStorage`, the pattern of the dry run
 * (`src/storage/dry-run.ts`) and the warning sink (`src/validation/warning.ts`), so no operation signature changes.
 * With none set — an in-process caller, a library — it is `{ env: process.env }`: the environment markers still
 * hold, fail-closed (the MCP surface is not a marker, `spec-018` §1.2).
 *
 * Deterministic: a pure function of its inputs; the marker order is the table's, never the environment's.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { reportWarning } from '../validation/warning';
import { loadDnaYamlAtHead } from './loaders';
import type { CoreOption } from './registry';
import { coreErr, coreOk, type CoreResult } from './types';

/** The id of an agent marker: its environment variable's name, or the option's spelling (`spec-018` §3.2 `details`). */
export type AgentMarkerId = 'WINGFOIL_AGENT' | '--co-author' | 'CLAUDE_CODE_CHILD_SESSION' | 'CODEX_SANDBOX';

/** One agent marker of `spec-018` §1. */
export interface AgentMarker {
  readonly id: AgentMarkerId;
  /** An environment variable, or an option given on the command line. */
  readonly kind: 'environment' | 'option';
  /** How a refusal names it when present (`spec-018` §3.2). */
  readonly phrase: string;
}

/** The agent markers, in `spec-018` §1's order — the order a refusal lists the ones it found. Frozen. */
export const AGENT_MARKERS: readonly AgentMarker[] = Object.freeze([
  Object.freeze({ id: 'WINGFOIL_AGENT', kind: 'environment', phrase: 'WINGFOIL_AGENT is set' }),
  Object.freeze({ id: '--co-author', kind: 'option', phrase: '--co-author was given' }),
  Object.freeze({ id: 'CLAUDE_CODE_CHILD_SESSION', kind: 'environment', phrase: 'CLAUDE_CODE_CHILD_SESSION is set' }),
  Object.freeze({ id: 'CODEX_SANDBOX', kind: 'environment', phrase: 'CODEX_SANDBOX is set' }),
] as const satisfies readonly AgentMarker[]);

/**
 * The `--co-author <name>` option (`spec-018` §1 row 2, §2.3): a marker, and the explicit name of the `team.agents`
 * entry that signs. Declared by no operation: the CLI registrar derives it for every `mutates: true` operation that
 * does not declare `agentAttribution: false` (`agent execute`, §1.1), as it derives `--dry-run` (design D4).
 */
export const CO_AUTHOR_OPTION: CoreOption = {
  name: 'co-author',
  valueName: 'name',
  description: "run as the team.agents entry <name>, in an agent's session (an approver-gated command refuses it)",
};

/** The usage refusal of a blank `--co-author` value (`spec-018` §2.5), exit `2`. */
export const BLANK_CO_AUTHOR = 'invalid flag value: --co-author must not be blank';

/**
 * The `--ai-model <id>` option (`spec-018` §2.4, task-334): the model identifier the `AI-Model:` trailer records. Not a
 * marker. Derived by the CLI registrar beside {@link CO_AUTHOR_OPTION}, on the same operations (design D7).
 */
export const AI_MODEL_OPTION: CoreOption = {
  name: 'ai-model',
  valueName: 'id',
  description: "the model identifier the commit's AI-Model: trailer records, in an agent's session (else WINGFOIL_AGENT_MODEL, else not-reported)",
};

/** The environment variable `AI-Model:` falls back to when `--ai-model` is not given (`spec-018` §2.4). */
export const AGENT_MODEL_VARIABLE = 'WINGFOIL_AGENT_MODEL';

/** What `AI-Model:` records when the agent reports no model (`spec-018` §2.4, `spec-016` §2.6's literal). */
export const MODEL_NOT_REPORTED = 'not-reported';

/** The usage refusal of a blank `--ai-model` value (`spec-008` §2, design D4), exit `2`. */
export const BLANK_AI_MODEL = 'invalid flag value: --ai-model must not be blank';

/** The usage refusal of an `--ai-model` value that is not one line (`spec-018` §2.4), exit `2`. */
export const MULTI_LINE_AI_MODEL = 'invalid flag value: --ai-model must be one line';

/** The usage refusal of `--ai-model` in a session no marker marks (`spec-018` §2.4), exit `2`. */
export const AI_MODEL_WITHOUT_AGENT = 'invalid flag combination: --ai-model needs an agent context (--co-author, or a session an agent started)';

/** The usage refusal of a `WINGFOIL_AGENT_MODEL` value that is not one line (`spec-008` §2, design D4), exit `2`. */
export const MULTI_LINE_AGENT_MODEL = `invalid environment value: ${AGENT_MODEL_VARIABLE} must be one line`;

/**
 * Whether a model identifier is NOT one line: it holds a C0 control character (tab and line breaks included), DEL, a C1
 * control, or a Unicode line or paragraph separator (`spec-008` §2, the `--ai-model` row).
 */
export function isMultiLineValue(value: string): boolean {
  return [...value].some((char) => {
    const code = char.codePointAt(0) as number;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
  });
}

/** Whether `env` carries an environment marker of {@link AGENT_MARKERS} (defined, whatever its value). */
export function hasEnvironmentMarker(env: Readonly<Record<string, string | undefined>>): boolean {
  return AGENT_MARKERS.some((marker) => marker.kind === 'environment' && isPresent(marker, { env }));
}

/** The warning code of an attribution to the first `team.agents` entry by default (`spec-018` §2.3 rule 4). */
export const W_AGENT_ENTRY_GUESSED = 'W_AGENT_ENTRY_GUESSED';

/** The warning code of an agent's session in a project that declares no `team.agents` entry (`spec-018` §2.3). */
export const W_NO_AGENT_ENTRY = 'W_NO_AGENT_ENTRY';

/** The built-in adapter each vendor marker selects its entry by (`spec-018` §2.3 rule 3), in §1 order. */
const VENDOR_ADAPTERS: readonly { readonly marker: AgentMarkerId; readonly adapter: string }[] = [
  { marker: 'CLAUDE_CODE_CHILD_SESSION', adapter: 'claude-code' },
  { marker: 'CODEX_SANDBOX', adapter: 'codex-cli' },
];

/** The code that opens the agent-context refusal's message (`spec-018` §3.2). */
export const E_AGENT_CONTEXT = 'E_AGENT_CONTEXT';

/**
 * The `team.agents` entry and the model the trailers of `spec-018` §2 name. Declared here so the attribution half
 * (`task-334`) fills it without changing {@link AgentContext}'s shape; this task never produces one.
 */
export interface Attribution {
  readonly name: string;
  readonly email: string;
  readonly model: string;
  /** The body line of an entry chosen by default (`spec-018` §2.3 rule 4), the commit body's first paragraph. */
  readonly note?: string;
}

/** What {@link resolveAgentContext} found: the markers present, in §1 order, and the attribution (`null` here). */
export interface AgentContext {
  readonly markers: readonly AgentMarker[];
  readonly attribution: Attribution | null;
}

/** The facts of one invocation the markers are read from. */
export interface AgentInvocation {
  /** The environment the command runs in (the CLI passes `process.env`). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The `--co-author` value, when the option was given. */
  readonly coAuthor?: string;
  /** The `--ai-model` value, when the option was given (`spec-018` §2.4; read by `task-334`). */
  readonly aiModel?: string;
}

/** {@link resolveAgentContext}'s request: the invocation, and whether the operation is approver-gated. */
export interface AgentContextRequest extends AgentInvocation {
  /** `true` for an approver-gated operation (`spec-018` §0), declared by the operation, never inferred. */
  readonly gated: boolean;
}

const invocationStore = new AsyncLocalStorage<AgentInvocation>();

/**
 * Run `run` with `invocation` as the agent invocation every operation inside it reads
 * ({@link currentAgentInvocation}), its awaited continuations included. Returns what `run` returns. Set by the CLI
 * registrar around each operation (design D5); it decides over `process.env` while it is set.
 */
export function withAgentInvocation<T>(invocation: AgentInvocation, run: () => T): T {
  return invocationStore.run(invocation, run);
}

/** The invocation {@link withAgentInvocation} set around the running operation, or `{ env: process.env }` with none. */
export function currentAgentInvocation(): AgentInvocation {
  return invocationStore.getStore() ?? { env: process.env };
}

/** Whether `marker` is present in `invocation`: a defined variable (empty included), or a given option. */
function isPresent(marker: AgentMarker, invocation: AgentInvocation): boolean {
  if (marker.kind === 'option') return invocation.coAuthor !== undefined;
  return Object.prototype.hasOwnProperty.call(invocation.env, marker.id) && invocation.env[marker.id] !== undefined;
}

/**
 * The agent context of the invocation `request` describes (`spec-018` §2.6), read once per operation and handed on.
 * `markers` are the {@link AGENT_MARKERS} present, in §1 order. `attribution` is `null`: on a gated operation it
 * always is — `team.agents` is not read, no refusal fires and no warning is printed —, and the ungated form that fills
 * it is `task-334`'s. A `CoreResult` so that form can return its `spec-018` §2.5 refusals through the same shape.
 *
 * @param root - The project root; read by the ungated form (`team.agents` at `HEAD`), never by the gated one.
 */
export function resolveAgentContext(root: string, request: AgentContextRequest): CoreResult<AgentContext> {
  const context = gatedContext(request);
  if (request.gated || context.markers.length === 0) return coreOk<AgentContext>(context);

  const agents = loadDnaYamlAtHead(root)?.team?.agents ?? [];
  const declared = agents.length === 0 ? 'none' : agents.map((agent) => agent.name).join(', ');
  const named = (name: string, source: string): CoreResult<{ name: string; email?: string }> => {
    const entry = agents.find((agent) => agent.name === name);
    if (entry !== undefined) return coreOk(entry);
    return coreErr({
      code: 'VALIDATION',
      message: `unknown team.agents entry '${name}' (from ${source}): the committed dna.yaml declares ${declared}`,
    });
  };

  // `spec-018` §2.3: the first rule that applies decides.
  const launcher = request.env.WINGFOIL_AGENT;
  let chosen: CoreResult<{ name: string; email?: string }>;
  let note: string | undefined;
  if (request.coAuthor !== undefined) chosen = named(request.coAuthor, '--co-author');
  else if (launcher !== undefined && launcher.trim().length > 0) chosen = named(launcher, 'WINGFOIL_AGENT');
  else if (agents.length === 0) {
    // No entry at all: the commit names no co-author, and the gap is put on screen (`spec-018` §2.3, design D5).
    const phrases = context.markers.map((marker) => marker.phrase).join(', ');
    return coreOk<AgentContext>(context, undefined, [
      `${W_NO_AGENT_ENTRY}: this command runs in an agent's session (${phrases}) but dna.yaml declares no team.agents ` +
        'entry, so its commit names no AI co-author; declare one (wingfoil dna add team.agents …)',
    ]);
  } else {
    const vendor = VENDOR_ADAPTERS.filter(({ marker }) => context.markers.some((present) => present.id === marker))
      .map(({ adapter }) => agents.find((agent) => agent.adapter === adapter))
      .find((entry) => entry !== undefined);
    const first = agents[0] as { name: string; email?: string };
    if (vendor === undefined) note = `Attributed to the first team.agents entry, ${first.name}: no entry is named for this agent.`;
    chosen = coreOk(vendor ?? first);
  }
  if (!chosen.ok) return chosen;

  const { name, email } = chosen.value;
  if (email === undefined || email.trim().length === 0) {
    return coreErr({
      code: 'VALIDATION',
      message:
        `team.agents entry '${name}' has no email, and a commit it co-authors must name one; declare it first ` +
        `(wingfoil dna update team.agents.${name} --entry-email <address>), then retry`,
    });
  }
  const attribution: Attribution = { name, email, model: modelOf(request), ...(note === undefined ? {} : { note }) };
  return coreOk<AgentContext>({ markers: context.markers, attribution }, undefined, note === undefined ? [] : [`${W_AGENT_ENTRY_GUESSED}: ${note}`]);
}

/**
 * The model identifier `AI-Model:` records (`spec-018` §2.4, design D4): the `--ai-model` value, else a non-blank
 * `WINGFOIL_AGENT_MODEL`, else {@link MODEL_NOT_REPORTED}; trimmed either way. The CLI has already refused a blank
 * or multi-line `--ai-model` and a multi-line variable (usage, exit `2`).
 */
function modelOf(invocation: AgentInvocation): string {
  const given = invocation.aiModel?.trim();
  if (given !== undefined && given.length > 0) return given;
  const variable = invocation.env[AGENT_MODEL_VARIABLE]?.trim();
  return variable !== undefined && variable.length > 0 ? variable : MODEL_NOT_REPORTED;
}

/** The ungated contexts already resolved, per invocation and project root (design D3). */
const resolvedContexts = new WeakMap<AgentInvocation, Map<string, CoreResult<AgentContext>>>();

/**
 * The ungated agent context of the running operation (`spec-018` §2.6): {@link resolveAgentContext} over
 * {@link currentAgentInvocation}, called by every non-gated mutating operation right after its membership pre-flight.
 * Resolved once per invocation and root (design D3): an operation that runs another — `workflow start` adding its
 * plan through `memory add`, `workflow end` finalizing it through the transition preamble — gets the same result
 * back, and its warnings ({@link W_AGENT_ENTRY_GUESSED}, {@link W_NO_AGENT_ENTRY}) are reported once, through
 * `reportWarning`, at the first resolution.
 */
export function resolveOperationAgentContext(root: string): CoreResult<AgentContext> {
  const invocation = currentAgentInvocation();
  const byRoot = resolvedContexts.get(invocation) ?? new Map<string, CoreResult<AgentContext>>();
  resolvedContexts.set(invocation, byRoot);
  const known = byRoot.get(root);
  if (known !== undefined) return known;
  const resolved = resolveAgentContext(root, { ...invocation, gated: false });
  byRoot.set(root, resolved);
  if (resolved.ok) (resolved.warnings ?? []).forEach((warning) => reportWarning(warning));
  return resolved.ok ? coreOk(resolved.value) : resolved;
}

/** The markers `invocation` carries, in §1 order, and no attribution: the gated form, which never refuses (§2.6). */
function gatedContext(invocation: AgentInvocation): AgentContext {
  return { markers: AGENT_MARKERS.filter((marker) => isPresent(marker, invocation)), attribution: null };
}

/**
 * The gated agent context of the running operation (`spec-018` §2.6): {@link resolveAgentContext}'s gated form over
 * {@link currentAgentInvocation}. The gated form reads no `team.agents` entry and never refuses, so this returns the
 * context itself rather than a `CoreResult` a caller would have to test for a refusal that cannot happen.
 */
export function resolveGatedAgentContext(): AgentContext {
  return gatedContext(currentAgentInvocation());
}

/**
 * `ok` when `context` carries no marker; otherwise the refusal of `spec-018` §3.2 for `command` — the command as the
 * grammar names it (`memory approve`, `workflow adopt --plan --apply`, …): `VALIDATION` (exit `1`), the message
 * listing each present marker's phrase in §1 order, the hint, and `details.markers` the marker ids. No value is
 * printed. The first step of the shared approver check (§3.1); any later authority check that records a decision
 * calls it first too.
 */
export function refuseAgentContext(context: AgentContext, command: string): CoreResult<void> {
  if (context.markers.length === 0) return coreOk<void>(undefined);
  const phrases = context.markers.map((marker) => marker.phrase).join(', ');
  return coreErr({
    code: 'VALIDATION',
    message:
      `${E_AGENT_CONTEXT}: '${command}' needs the approver and does not run in an agent's session (${phrases}): ` +
      "an approval is recorded only from the approver's own session, never from an agent's (dl-212)",
    hint: `run '${command}' yourself, from a terminal no agent started — not through an agent's shell`,
    details: { markers: context.markers.map((marker) => marker.id) },
  });
}
