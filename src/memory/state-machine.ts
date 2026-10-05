/**
 * State-machine transition-legality engine (REQ-SYS-04, task-005-per-type-state-machines).
 *
 * task-004-decoupled-pillars already shipped the *structural* `StateMachine` Zod schema in
 * `./schema.ts` — the `sequence`/`gates`/`waiting` shape plus a `.superRefine()` enforcing
 * spec-001-memory-yaml-schema's "Semantic validation (post-parse)" rules (gates/waiting keys must be
 * members of `sequence`, `"deprecated"` is reserved, etc.). This module does NOT re-validate any of
 * that — it takes an already-parsed, already-structurally-valid `StateMachine` and answers a
 * different question: **given a document's current `status` and a requested CLI verb
 * (`submit`/`approve`/`reject`/`deprecate`), what is the legal target state, if any?**
 *
 * This is spec-009-validation-strategy §1's Pass 2 (semantic / cross-file): the transition rule
 * needs the type's registered machine (loaded from `memory.yaml`) plus the document's own `status`
 * field — neither is decidable from the document's frontmatter schema alone, matching spec-009's own
 * worked example ("`wingfoil.status` must be a member of that type's `states.values`"). An illegal
 * transition throws the shared `ValidationError` (exit code `1` — a business-rule failure, not an
 * integrity one, per spec-009 §3 as rewritten under `dl-032-illegal-transition-message-contract`)
 * and — critically — throws *before* returning any target, so a caller can never reach
 * the frontmatter-write step on an illegal transition (REQ-STATE-01: rejected before any file write).
 * This module never touches a document or the filesystem itself; it is a pure function of
 * (`machine`, `currentState`, `op`) → target-or-throw, and it is the caller's job to gate any actual
 * write on this function returning normally.
 *
 * Rules implemented below (spec-001-memory-yaml-schema, "Sub-schema: StateMachine" +
 * "Which verb drives each forward edge — fully determined by the schema" + "`deprecated` is
 * implicit"):
 *
 * - `submit`: legal only from a state that is in `sequence`, is NOT a `gates` key, and is NOT in
 *   `waiting`, and that has a next state in `sequence`. Target: the next state in `sequence`.
 * - `approve`: legal only from a state that IS a `gates` key and is NOT also in `waiting` (a state
 *   that is both is spec-001's explicit "verb-less" case: "its forward edge is verb-less (picked up
 *   automatically)" — the manual `approve` verb does not apply, only the manual `reject` does).
 *   Target: the next state in `sequence`.
 * - `reject`: legal only from a state that IS a `gates` key (regardless of `waiting` membership —
 *   spec-001: a gate+waiting state "still exposes a manual `reject`/decline path"). Target:
 *   `gates[<state>].reject`, always taken verbatim (it need not be a `sequence` member).
 * - `deprecate`: the implicit wildcard edge — always legal from any current state, target is the
 *   reserved `"deprecated"` state. Never declared in `sequence`/`gates`/`waiting` (enforced
 *   structurally by task-004's `.superRefine()`; this engine does not need to re-check it).
 * - Anything else (state not a member of `sequence` at all, wrong verb for the state's category, or
 *   a `sequence`-terminal state with no next entry) is illegal.
 *
 * task-036-frontmatter-lifecycle-validation adds {@link validateFrontmatterState} — a distinct check
 * from the transition engine above: REQ-STATE-01's "document state derived from frontmatter" half,
 * independent of any transition attempt. `resolveTransitionTarget` only answers "is verb `op` legal
 * FROM `currentState`"; it never asserts that an arbitrary `status` string read off a document's
 * frontmatter is itself a member of the type's declared state set at all — the check
 * spec-010-memory-frontmatter-schema's "Validation rules" table names ("`status` must be a state of
 * the type's machine" → failure "invalid state for type") and BDD
 * `P4.11-deliverables.feature`/`P4.13-state-deduction.feature` both exercise (`"invalid state
 * 'shipped' for type 'task'"`). A state is legal for a type iff it belongs to that machine's full
 * reachable set — `sequence` ∪ every `gates.<state>.reject` target (spec-001 permits those to be
 * off-chain, and `resolveTransitionTarget` returns them verbatim) ∪ the reserved implicit
 * `"deprecated"` state (never declared in `sequence` itself, per the `StateMachine` schema's own
 * `.superRefine()`, but always a legal transition target via `memory.deprecate` — see
 * `resolveTransitionTarget`'s `deprecate` case above).
 *
 * **Type resolution (REQ-STATE-08):** `resolveStateMachine` resolves a type's machine as
 * `types.<name>.states ?? defaults.states ?? `{@link DEFAULT_STATE_MACHINE}. task-005's own tests
 * exercise only the real types registered in `.wingfoil/memory.yaml`, every one of which
 * declares its own `states` block — so the `?? defaults.states` arm was left uncovered by that task,
 * and `task-010-default-state-machine-fallback` closed that gap with a throwaway fixture type
 * (declared with no `states:` key) in `test/memory/state-machine.test.ts`. The **third** arm is
 * task-071's (`bug-030-init-memory-yaml-has-no-state-machine`): task-010's fixture still *declared* a
 * `defaults` block, so a file with no machine anywhere — the shape `wingfoil init` scaffolded — was
 * never resolved by anything, and it threw. See {@link DEFAULT_STATE_MACHINE} for why the engine, not
 * the config file, owns that default.
 */
import { ValidationError } from '../validation';

import { StateMachine as StateMachineSchema } from './schema';
import type { MemoryYaml, StateMachine } from './schema';

/** The reserved implicit-wildcard target state (spec-001) — never declared explicitly anywhere. */
export const DEPRECATED_STATE = 'deprecated';

/**
 * The terminal state of the `adr` and `tech-spec` machines (`memory.yaml`). The state before it is a
 * `waiting` state, so no verb drives the edge into it — not `approve` and not `memory deprecate`
 * (`spec-001`: "`submit`/`approve` on a `waiting` state is illegal"). It is reached only through the
 * `supersedes:` engine trigger: approving an element whose `supersedes:` names another element of its
 * type moves that element along this edge ({@link supersedesEdgeFrom}, `dl-065` Q1.1, task-162). A
 * superseded decision is archived content — a later element explicitly replaced it — which is why
 * `dl-028-archived-states-excluded-from-context` puts it in {@link ARCHIVED_STATUSES} alongside
 * {@link DEPRECATED_STATE}.
 */
export const SUPERSEDED_STATE = 'superseded';

/**
 * The canonical **archived** status set, ratified by `dl-028-archived-states-excluded-from-context`:
 * exactly `{deprecated, superseded}`, in this fixed order (REQ-SYS-07 — no unordered iteration in any
 * output-affecting path).
 *
 * REQ-STATE-06's Rationale ("distinguish active from archived decisions") always named the archived
 * set, but its Description and Fit Criterion named only `deprecated`; dl-028 closes that gap and the
 * SARD entry now names both. The previously-specified `rejected` is **not** here: `spec-001-memory-yaml-schema`
 * removed that status from every type's machine (a `reject` transition lands back on `draft`), so it
 * can never appear in a document's frontmatter.
 */
export const ARCHIVED_STATUSES: readonly string[] = Object.freeze([DEPRECATED_STATE, SUPERSEDED_STATE]);

/**
 * True when a document's frontmatter `status` is an archived state ({@link ARCHIVED_STATUSES}).
 *
 * This is the **single shared predicate** dl-028 mandates: both the default-search path
 * (`searchMemoryDocuments`, REQ-STATE-06) and the agent-context path (`src/core/relevance.ts`'s
 * relevance filter, spec-012 §6) consume it, so "archived" has exactly one definition. It supersedes
 * `task-038`'s `isDeprecatedStatus`.
 *
 * It takes the **already-parsed status string**, not the raw frontmatter record: every call site
 * projects `status` out of frontmatter anyway (for its own result shape), and a frontmatter-shaped
 * predicate forced those callers either to re-parse or to hand back a record they had already
 * destructured — the composition problem `task-038`'s reviewer flagged. Non-string / absent `status`
 * values are normalised to `undefined` by the caller's own frontmatter projection and are never
 * archived.
 *
 * Note the deliberate asymmetry with the *context* filter: `src/core/relevance.ts` excludes
 * `draft` **in addition to** this archived set (spec-012 §6 — only "stable, decided and still-current"
 * content enters an execution context), while default `memory search` keeps drafts visible.
 * `draft` is therefore NOT part of the archived set.
 */
export function isArchivedStatus(status: string | undefined): boolean {
  return status !== undefined && ARCHIVED_STATUSES.includes(status);
}

/** `E_INVALID_<X>` field-level code (spec-009 §3) for an illegal state transition. */
export const E_INVALID_TRANSITION = 'E_INVALID_TRANSITION';

/**
 * `E_INVALID_<X>` field-level code (spec-009 §3, spec-010-memory-frontmatter-schema "Validation
 * rules") for a document frontmatter `status` value that is not a legal state for its declared type
 * at all — as opposed to {@link E_INVALID_TRANSITION}, which flags an illegal *transition attempt*
 * (verb + current state), not the current state's bare legality. See {@link validateFrontmatterState}.
 */
export const E_INVALID_STATE = 'E_INVALID_STATE';

/** The four CLI verbs a transition can be requested for (`memory.add` assigns `sequence[0]` directly, no verb). */
export type TransitionOp = 'submit' | 'approve' | 'reject' | 'deprecate';

/**
 * REQ-STATE-08's default machine, owned by the **engine** rather than by any config file
 * (`bug-030-init-memory-yaml-has-no-state-machine`, task-071). It is the last arm of
 * {@link resolveStateMachine}'s resolution: it governs every registered type that declares no `states`
 * block in a `memory.yaml` that declares no `defaults.states` either.
 *
 * **Why the engine owns it.** REQ-STATE-08 states the rule over the *type* — "A Memory type that does
 * not declare its own `states` uses the default machine" — with no mention of a `defaults` block, and
 * its Rationale is "reduce config friction for simple types". `spec-001-memory-yaml-schema` makes
 * `defaults` optional (`defaults: z.object({ states: StateMachine }).optional()`). A `memory.yaml`
 * that omits `defaults` and registers a type without `states` is therefore a legal file whose types
 * REQ-STATE-08 still gives a machine — which can only hold if the default exists without being
 * declared. Before task-071 that combination threw instead, so every project `wingfoil init` created
 * refused every transition verb (bug-030). BDD `p1-memory/P1.13-memory-element-schema.feature`
 * scenario 2 is read the same way: its `Given` only puts a type in the file "without a `states`
 * block", and its `Then` names the machine by value — so its title ("uses the defaults block")
 * describes the common case rather than a precondition.
 *
 * **Why this value.** It is `spec-001`'s own worked `defaults` example, verbatim, and the machine
 * REQ-STATE-08 names since task-153 reconciled it (`bug-052`) — not the earlier
 * `draft → pending → approved/rejected → deprecated` wording, which `spec-001` §Consequences
 * deliberately superseded: the default machine "loses its `rejected` state" ("no document ever records
 * `status: rejected` again" — a `reject` from the `pending` gate lands straight back on `draft`), and
 * `deprecated` is the reserved implicit wildcard reachable from any state, never declared in a
 * `sequence` (the `StateMachine` schema's own `.superRefine()` forbids declaring it). The resulting
 * legal set is exactly REQ-STATE-08's fit criterion under that encoding: `submit` draft→pending,
 * `approve` pending→approved, `reject` pending→draft, `deprecate` →`deprecated` from anywhere, and
 * nothing else.
 *
 * Frozen: it is shared by every type that falls back to it, so no consumer may mutate the machine
 * other types are resolving (a shared constant, built once, with no per-call construction and no
 * ordering dependence — REQ-SYS-07).
 */
export const DEFAULT_STATE_MACHINE: StateMachine = (() => {
  // Built through the real `StateMachine` schema, so the built-in is held to exactly the structural
  // rules (`gates` keys ⊆ `sequence`, `"deprecated"` never declared) every hand-written machine is —
  // a malformed default would otherwise be the one machine nothing validates. Frozen through, so a
  // consumer cannot mutate what every falling-back type resolves.
  const machine = StateMachineSchema.parse({
    sequence: ['draft', 'pending', 'approved'],
    gates: { pending: { reject: 'draft' } },
  });
  Object.freeze(machine.sequence);
  Object.freeze(machine.gates!['pending']);
  Object.freeze(machine.gates);
  return Object.freeze(machine);
})();

/**
 * Resolve the state machine that governs `typeName`, per REQ-STATE-08. Three arms, in precedence
 * order — the first that exists wins:
 *
 * 1. the type's own `states` block (`types.<name>.states`);
 * 2. the file's `defaults.states`, when it declares one — a per-project override of the built-in;
 * 3. {@link DEFAULT_STATE_MACHINE}, the engine's built-in default (task-071 / bug-030).
 *
 * Because arm 3 always applies, **no registered type can fail to resolve a machine**: the previous
 * "neither the type nor `defaults` declares a machine" throw is gone, and with it the failure that
 * made every transition verb refuse in a freshly-`wingfoil init`-ed project.
 *
 * The one remaining throw is for a type that is **not registered at all**. It is a plain `Error`, not
 * a `ValidationError`, because it is a caller-programming-error condition rather than a
 * document-transition failure — and it is not reachable from any CLI or MCP call: every transition
 * verb goes through `prepareMemoryTransition` (`src/core/memory-transition.ts`), which returns the
 * `NOT_FOUND` result `unknown memory type '<t>' (not defined in memory.yaml)` (exit `1`) for an
 * unregistered type *before* calling this function. Only a direct library call naming a type the file
 * does not register can reach it.
 */
export function resolveStateMachine(memoryYaml: MemoryYaml, typeName: string): StateMachine {
  const typeEntry = memoryYaml.types[typeName];
  if (!typeEntry) {
    throw new Error(`memory.yaml has no type "${typeName}" registered`);
  }
  return typeEntry.states ?? memoryYaml.defaults?.states ?? DEFAULT_STATE_MACHINE;
}

/**
 * Build one `E_INVALID_TRANSITION` `ValidationError` and throw it. Exits `1`: an illegal transition is
 * understood input that a rule refused, not a parse/integrity failure (spec-009 §3, `dl-032`) — so the
 * plain constructor, not `ValidationError.semantic(...)`. The message here is the type-agnostic
 * diagnostic; {@link resolveTypeTransition} turns it into the pinned contract message.
 */
function illegal(currentState: string, op: TransitionOp, message: string, filePath: string): never {
  throw new ValidationError([
    {
      code: E_INVALID_TRANSITION,
      path: 'status',
      file: filePath,
      message: `illegal \`${op}\` from "${currentState}": ${message}`,
    },
  ]);
}

/**
 * Compute the legal target state for `op` applied to `currentState` under `machine`. Returns the
 * target state on success; throws `ValidationError` (never returns a target) when the transition is
 * illegal, per REQ-STATE-01 — a caller must never write a document's `status` unless this function
 * returns normally. `filePath` is only used to enrich the thrown error's `file` field (optional —
 * defaults to `''` when no document is on hand, e.g. in pure unit tests).
 */
export function resolveTransitionTarget(
  machine: StateMachine,
  currentState: string,
  op: TransitionOp,
  filePath = '',
): string {
  if (op === 'deprecate') {
    // Implicit wildcard edge from any state (spec-001) — always legal, never declared explicitly.
    return DEPRECATED_STATE;
  }

  const index = machine.sequence.indexOf(currentState);
  const gate = (machine.gates ?? {})[currentState];
  const isWaiting = (machine.waiting ?? []).includes(currentState);

  switch (op) {
    case 'submit': {
      if (index === -1) {
        return illegal(currentState, op, "not a member of this type's `sequence`", filePath);
      }
      if (gate) {
        return illegal(currentState, op, 'a `gates` state — its forward edge requires `approve`, not `submit`', filePath);
      }
      if (isWaiting) {
        return illegal(
          currentState,
          op,
          'a `waiting` state — its forward edge fires only via a Workflow action, not `submit`',
          filePath,
        );
      }
      const next = machine.sequence[index + 1];
      if (next === undefined) {
        return illegal(currentState, op, 'the last state in `sequence` — there is no forward edge', filePath);
      }
      return next;
    }
    case 'approve': {
      if (!gate) {
        return illegal(currentState, op, 'not a `gates` state — `approve` is only legal from a gate', filePath);
      }
      if (isWaiting) {
        return illegal(
          currentState,
          op,
          'both a `gates` and `waiting` state — its forward edge is verb-less (fires only via a Workflow action), not `approve`',
          filePath,
        );
      }
      const next = machine.sequence[index + 1];
      if (next === undefined) {
        return illegal(currentState, op, 'a `gates` state with no next `sequence` entry to approve into', filePath);
      }
      return next;
    }
    case 'reject': {
      if (!gate) {
        return illegal(currentState, op, 'not a `gates` state — `reject` is only legal from a gate', filePath);
      }
      // `reject` target is taken verbatim — need not be a `sequence` member (spec-001).
      return gate.reject;
    }
    default: {
      const exhaustive: never = op;
      return illegal(currentState, exhaustive, 'unknown operation', filePath);
    }
  }
}

/**
 * The `<to>` of the illegal-transition contract message — what the verb the user typed reaches from
 * `<from>`. A transition verb names no target of its own, and {@link resolveTransitionTarget} refuses a
 * call exactly when the verb has no edge from the current state (`deprecate` is never refused), so on a
 * refusal that target is always nothing, rendered `(none)` (`task-181`, `bug-165`, `bug-127`;
 * REQ-STATE-01).
 *
 * It replaces the verb's **canonical edge** (`dl-053` option 1): the target the verb reaches from the
 * first state in `sequence` where it is legal. That edge starts somewhere else in the machine, so it
 * printed backward moves (`approve` on a `planned` bug → `planned -> triaged`; `submit` on the last
 * state of the default machine → `approved -> pending`) and skips (`triaged -> resolved`), naming a move
 * nobody attempted to exactly the user who has just made an illegal call. Why the verb has no edge is
 * the issue's `detail` (`dl-032` option (c)), which reaches the operator under the message
 * (`dl-055`, task-130).
 */
const NO_TARGET = '(none)';

/**
 * Resolve the legal target of verb `op` for a document of type `typeName` currently in `currentState`
 * — the entry point every Memory transition verb (`submit`, and `approve`/`reject`/`deprecate` after
 * it) uses. It resolves the type's machine ({@link resolveStateMachine}, REQ-STATE-08) and delegates
 * legality to {@link resolveTransitionTarget}, adding only the user-facing contract:
 *
 * An illegal transition is rethrown as the `E_INVALID_TRANSITION` issue ratified by
 * `dl-032-illegal-transition-message-contract` (option (c)) — `message` is the pinned
 * `` illegal transition <from> -> <to> for type '<type>' `` (REQ-STATE-01 Fit Criterion; BDD `P1.6`
 * sc.2, `P5.2.3` sc.2), `detail` carries the engine's explanation of *why* the edge is illegal, and the
 * exit code is `1`. `<to>` is always {@link NO_TARGET}: the verb reaches nothing from `<from>`.
 *
 * @throws {@link ../validation.ValidationError} `E_INVALID_TRANSITION` (exit `1`) as above.
 * @throws `Error` when `typeName` is not registered (see {@link resolveStateMachine}). A registered type
 *   can no longer fail to resolve a machine: REQ-STATE-08's built-in default is the last fallback.
 */
export function resolveTypeTransition(
  memoryYaml: MemoryYaml,
  typeName: string,
  currentState: string,
  op: TransitionOp,
  filePath = '',
): string {
  const machine = resolveStateMachine(memoryYaml, typeName);
  try {
    return resolveTransitionTarget(machine, currentState, op, filePath);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    const detail = error.issues.map((issue) => issue.message).join('; ');
    throw new ValidationError([
      {
        code: E_INVALID_TRANSITION,
        path: 'status',
        file: filePath,
        message: `illegal transition ${currentState} -> ${NO_TARGET} for type '${typeName}'`,
        detail,
      },
    ]);
  }
}

/**
 * True when `state`'s forward edge leads into {@link SUPERSEDED_STATE} and no verb drives it: `state`
 * is a `waiting` state and the next `sequence` entry is `superseded` (`accepted` for `adr`, `approved`
 * for `tech-spec`). This is the edge the `supersedes:` trigger fires (`dl-065` Q1.1, `spec-001`), read
 * from the machine rather than from a type name, so a project type with the same shape gets the same
 * trigger. Pure (REQ-SYS-07).
 */
export function supersedesEdgeFrom(machine: StateMachine, state: string): boolean {
  const index = machine.sequence.indexOf(state);
  return index !== -1 && (machine.waiting ?? []).includes(state) && machine.sequence[index + 1] === SUPERSEDED_STATE;
}

/**
 * The target of the `supersedes:` trigger on a document of type `typeName` in `currentState` —
 * always {@link SUPERSEDED_STATE} — or a thrown `E_INVALID_TRANSITION` with `dl-032`'s contract
 * message, `illegal transition <from> -> superseded for type '<type>'`, when the document is not in
 * the state whose `waiting` edge leads there ({@link supersedesEdgeFrom}). The trigger is not a verb,
 * so this is not a {@link TransitionOp}, and its `<to>` is the one state it can ever reach.
 *
 * @throws {@link ../validation.ValidationError} `E_INVALID_TRANSITION` as above.
 * @throws `Error` when `typeName` is not registered (see {@link resolveStateMachine}).
 */
export function resolveSupersedeTarget(
  memoryYaml: MemoryYaml,
  typeName: string,
  currentState: string,
  filePath: string,
): string {
  const machine = resolveStateMachine(memoryYaml, typeName);
  if (supersedesEdgeFrom(machine, currentState)) return SUPERSEDED_STATE;
  throw new ValidationError([
    {
      code: E_INVALID_TRANSITION,
      path: 'status',
      file: filePath,
      message: `illegal transition ${currentState} -> ${SUPERSEDED_STATE} for type '${typeName}'`,
      detail:
        `only an element in the \`waiting\` state whose forward edge leads to '${SUPERSEDED_STATE}' can be superseded ` +
        `(spec-001); '${currentState}' is not that state`,
    },
  ]);
}

/**
 * True when `from → to` is an edge of `machine`, whichever verb or engine action drives it — the
 * question a hop of a chained transition bracket asks (`[a → b → c]`, `task-126`, `bug-155`), where
 * the commit names states and no verb per hop. The edges are exactly the targets
 * {@link resolveTransitionTarget} can return, plus the verb-less forward edges it refuses to drive:
 *
 * 1. the **forward edge** `sequence[i] → sequence[i + 1]`, for every `i` — including out of a `gates`
 *    or `waiting` state, whose forward edge is taken by `approve` or by a workflow action rather than
 *    by `submit`, but is an edge all the same;
 * 2. every **`gates.<from>.reject`** target;
 * 3. the implicit wildcard edge to {@link DEPRECATED_STATE}, from any state.
 *
 * A self-loop is not an edge. Pure; no ordering dependence (REQ-SYS-07).
 */
export function isMachineEdge(machine: StateMachine, from: string, to: string): boolean {
  if (to === DEPRECATED_STATE) return true;
  const index = machine.sequence.indexOf(from);
  if (index !== -1 && machine.sequence[index + 1] === to) return true;
  return (machine.gates ?? {})[from]?.reject === to;
}

/**
 * True when `status` is a state a document of this type may legitimately carry — the **full**
 * reachable state set of `machine`, which is the union of three sources:
 *
 * 1. **`machine.sequence`** — every state on the forward chain.
 * 2. **Every `machine.gates.<state>.reject` target** — `resolveTransitionTarget` returns these
 *    *verbatim* and spec-001-memory-yaml-schema's "Semantic validation (post-parse)" is explicit that
 *    such a target "need **not** be a member of `sequence`: it may revert into the chain (e.g.
 *    `pending: { reject: draft }`) or name an **off-chain decline state reached by no forward edge**".
 *    Only the gate *keys* (and `waiting` entries) are constrained to `sequence`; the reject targets
 *    are not. Omitting this arm is what task-036's first pass got wrong: the `reject` verb would write
 *    a status that this very function then declared invalid, leaving the document unmovable —
 *    a REQ-SYS-04 violation for a config shape spec-001 names by example. No type registered in
 *    `.wingfoil/memory.yaml` currently exercises it (all three of its reject targets —
 *    `draft`, `closed`, `in-progress` — happen to be `sequence` members), so it is covered by a
 *    synthetic fixture machine in `test/memory/state-machine.test.ts`.
 * 3. **{@link DEPRECATED_STATE}** — the reserved implicit wildcard target every type reaches via
 *    `memory.deprecate` (see {@link resolveTransitionTarget}'s `deprecate` case), never declared in
 *    any `sequence` (the `StateMachine` schema's own `.superRefine()` forbids declaring it).
 *
 * `machine.waiting` contributes nothing: every `waiting` entry is required to be a `sequence` member
 * already, so it is covered by (1).
 *
 * Iteration over `gates` is sorted (REQ-SYS-07 — no unordered iteration in any output-affecting path);
 * the predicate's boolean result is order-independent, but keeping the traversal deterministic keeps
 * it so under any future change that reports *which* source matched.
 */
function isDeclaredState(machine: StateMachine, status: string): boolean {
  if (status === DEPRECATED_STATE || machine.sequence.includes(status)) {
    return true;
  }
  const gates = machine.gates ?? {};
  return Object.keys(gates)
    .sort()
    .some((gateState) => gates[gateState]?.reject === status);
}

/**
 * Assert that `status` — a value read straight off a document's frontmatter — is a legal state for
 * `typeName` under `machine` (REQ-STATE-01: state is derived from frontmatter; spec-010's "Validation
 * rules": *"`status` must be a state of the type's machine"*). The legal set is exactly
 * {@link isDeclaredState}'s: `sequence` ∪ every `gates.<state>.reject` target ∪ `deprecated`.
 *
 * This is a distinct check from {@link resolveTransitionTarget}: that function asks "is verb `op`
 * legal FROM `currentState`", assuming `currentState` is already known-legal; this function asks
 * whether an arbitrary `status` string is itself a legal state for the type at all — independent of
 * any transition attempt, e.g. when validating a document's frontmatter as read (BDD
 * `P4.11-deliverables.feature` scenario 3, `P4.13-state-deduction.feature` scenario 3). The two must
 * agree: any state `resolveTransitionTarget` can return must validate here, or the tool would refuse
 * a document it wrote itself.
 *
 * @throws {@link ../validation.ValidationError} `E_INVALID_STATE` with the message
 *   `` invalid state '<status>' for type '<typeName>' `` when `status` is not a legal state for
 *   `typeName`. **Exit code `1`**, per spec-009-validation-strategy §3 as rewritten under
 *   `dl-032-illegal-transition-message-contract`: the code keys on the *nature* of the failure, not
 *   the pass that detected it — `2` is reserved for parse and system-integrity failures, while "every
 *   other validation failure ... including business-rule failures detected in Pass 2" exits `1`. An
 *   unrecognised `status` is understood input that a rule refused, so it is a `1`; that is why this
 *   throws the `ValidationError` constructor directly rather than `ValidationError.semantic(...)`,
 *   which hard-codes `2` for the genuine integrity checks (`loaders`, `id`, `query`). No BDD scenario
 *   pins an exit code for this message — `P4.11` sc.3 and `P4.13` sc.3 pin the text only — so the spec
 *   rule governs unopposed. (The separate `E_INVALID_TRANSITION` message/exit-code realignment that
 *   `dl-032` ratified lives in {@link resolveTypeTransition}, added by `task-045-memory-submit`.)
 *
 *   `filePath` is only used to enrich the thrown error's `file` field (optional — defaults to `''`
 *   when no document is on hand, e.g. in pure unit tests), mirroring {@link resolveTransitionTarget}'s
 *   own `filePath` parameter.
 */
export function validateFrontmatterState(
  machine: StateMachine,
  typeName: string,
  status: string,
  filePath = '',
): void {
  if (isDeclaredState(machine, status)) {
    return;
  }
  throw new ValidationError([
    {
      code: E_INVALID_STATE,
      path: 'status',
      file: filePath,
      message: `invalid state '${status}' for type '${typeName}'`,
    },
  ]);
}
