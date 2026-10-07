/**
 * The role-scoped MCP **Prompts** channel — `{role}-session` prompts that embed the role's assigned
 * directives (task-039-mcp-prompts-role-based-infra, **REQ-INT-02**,
 * `spec-004-mcp-surface-contract` §3). This is the third and last channel type spec-004 §1 names,
 * alongside the Resources channel (`./index.ts`'s `registerReadOnlyResources`, task-011/task-030) and
 * the still-unshipped Tools channel (P5.2.3, v0.4).
 *
 * **Wired into the production server by `task-058-mcp-prompts-role-based` (P5.2.2).** task-039
 * shipped this registrar as infra, exactly like `task-011-mcp-resources-read-only` did for Resources;
 * task-058 adds it to `createMcpServer` (`./server.ts`) per `spec-014-mcp-server-entry-point` §3
 * ("when Prompts ship (P5.2.2, v0.2), it adds their registrar") and implements the undefined-role
 * refusal of `p5-interaction/P5.2.2-mcp-prompts.feature` (`no prompt for undefined role '<role>'`).
 *
 * **Read-only (spec-004 §3.3).** A prompt handler reads `dna.yaml`, `roles.yaml` and the directive
 * files and returns text. There is no code path in this module that writes, and it registers no Tool —
 * so Prompts cannot become the agent write path REQ-SEC-05 reserves for validated Tools
 * (`test/mcp/role-prompts.test.ts` asserts both: files byte-for-byte unchanged after a round trip, and
 * no Tools channel declared on a Prompts-only server).
 *
 * **Nothing is re-implemented here.** Role catalogue via `loadDnaYaml`, bindings via `loadRolesYaml`,
 * directive files via `loadDirectives`, and the role → directive resolution itself via
 * `resolveRoleDirectives` (`src/core/context.ts`, task-037) — the same canonical resolver
 * `assembleExecutionContext` uses, so REQ-INT-02's "100% of R's currently assigned directives" and
 * REQ-STATE-05's "100% of the role's directives and 0 of another role's" stay one guarantee rather than
 * two that can drift apart. The only thing that resolver does not supply is a directive's **body**
 * (`loadDirectives` returns `{path, frontmatter}`), which {@link readDirectiveBody} reads with the
 * `storage` primitives `./memory-resource.ts` already uses for the same reason.
 */
import { join } from 'path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, GetPromptRequestSchema, ListPromptsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

import {
  assembleExecutionContext,
  loadDirectives,
  loadRolesYaml,
  parseElementRef,
  resolveRevision,
  resolveRoleDirectives,
  RevisionError,
} from '../core';
import type { CoreError, DirectiveFile, ExecutionContextElement } from '../core';
import { errorDetails, type ErrorDetail } from '../core/error-details';
import { readDocument, splitFrontmatter, WINGFOIL_DIR } from '../storage';

import { readRefusalError, warningDetails, withRefusalDetails, withWarnings } from './read-only';

/** Options for {@link registerRolePrompts}. */
export interface RegisterRolePromptsOptions {
  /**
   * Resolves the project root each `prompts/get` is served from — invoked per request by the
   * `prompts/get` handler, which resolves the role's directives then (spec-004 §3.2).
   */
  readonly resolveRoot: () => string;
  /**
   * The DNA role set (`dna.yaml` `team.roles[].name`, declaration order), read once before the server
   * starts — by `wingfoil mcp`'s pre-flight (`loadDnaRoleSet`, `dl-049` (b)) — and fixed for the
   * server's life: spec-004 §3.1's "fixed set derived from DNA at server start".
   */
  readonly roles: readonly string[];
}

/** spec-004 §3.1's prompt-name suffix: one prompt per role, named `{role}-session`. Module-local —
 * {@link roleSessionPromptName} is the only naming API this channel exposes. */
const ROLE_PROMPT_NAME_SUFFIX = '-session';

/**
 * `{role}-session` — spec-004 §3.1's prompt naming convention, as a function so the wire-visible name
 * is derived in exactly one place (the registrar here, and any later consumer such as
 * `task-058-mcp-prompts-role-based`) rather than spelled out per call site.
 */
export function roleSessionPromptName(role: string): string {
  return `${role}${ROLE_PROMPT_NAME_SUFFIX}`;
}

/**
 * A `prompts/get` refusal whose JSON-RPC error carries `message` **verbatim** with code `InvalidParams`
 * (-32602, the code the MCP SDK itself uses for an unknown prompt name).
 *
 * Deliberately a plain `Error` with a `code`, not the SDK's `McpError`: `McpError`'s constructor
 * prefixes its own message with `MCP error <code>: `, and the SDK serializes `error.message` as-is, so a
 * client — which adds that prefix again when it rebuilds the error — would read the prefix twice.
 */
function promptRequestError(message: string): Error {
  return Object.assign(new Error(message), { code: ErrorCode.InvalidParams });
}

/** {@link promptRequestError} carrying `details` as `error.data.details` when there are any (spec-004 §3.4). */
function promptRequestErrorWithDetails(message: string, details: readonly ErrorDetail[]): Error {
  const error = promptRequestError(message);
  return details.length > 0 ? Object.assign(error, { data: { details } }) : error;
}

/**
 * The two optional arguments of every `{role}-session` Prompt (task-195, `spec-016` §2.4, approver
 * ruling R18, spec-004 §3.1): given together, they turn the Prompt into the carrier of the `spec-012` §7
 * execution context for `(role, element, state)`; given neither, the Prompt is the role header and
 * directive blocks it always was.
 */
const ROLE_PROMPT_ARGUMENTS = [
  {
    name: 'element',
    description: "the Memory element to build the execution context for, as <type>:<id> (e.g. task:task-042-foo); given together with 'state'",
    required: false,
  },
  {
    name: 'state',
    description: "the commit the execution context is read at (a sha, as agent execute passes it); given together with 'element'",
    required: false,
  },
] as const;

const ROLE_PROMPT_ARGUMENT_NAMES: readonly string[] = ROLE_PROMPT_ARGUMENTS.map((argument) => argument.name);


/**
 * The details of a context refusal that is a failed read: the issues `errorDetails` selects, then the
 * `details.cause` of an absent pillar file (`assembleExecutionContext`), which no `issues` carries.
 */
function contextRefusalDetails(error: CoreError): ErrorDetail[] {
  const cause = error.details?.cause;
  return [...errorDetails(error), ...(typeof cause === 'string' ? [{ detail: cause }] : [])];
}

/**
 * The `prompts/get` result for `role` with `element` and `state` (task-195, spec-004 §3.2): one `user`
 * message whose text is `assembleExecutionContext`'s §7 payload, as returned — never re-serialized, and
 * never indexed by its body markers (`bug-265`). `state` is resolved once, here, and the builder reads
 * everything at that sha, so neither a later commit nor an uncommitted edit changes the answer.
 *
 * The context's diagnostics ride beside `messages` as `warnings`, never inside the payload: the
 * directive-resolution warnings (`spec-012` §5.1 order), then the builder's notes (§3 stage order), then
 * the `W_MEMORY_UNREADABLE` lines of the files the scan left out (path order, task-171).
 *
 * Refusals (spec-004 §3.4): a `state` that is not a commit and an element the commit does not hold are
 * request errors, `-32602` — the latter with the unreadable files as `error.data.details`, so a subject
 * that does not parse is not reported as merely absent. Every other refusal is about the repository (an
 * archived subject, one in a newer `format:`, a missing pillar file) and is a failed read, as a failed
 * Resource read is: the core message with its details.
 */
function buildContextPrompt(root: string, role: string, element: ExecutionContextElement, state: string): GetPromptResult {
  let sha: string;
  try {
    sha = resolveRevision(root, state);
  } catch (error) {
    if (error instanceof RevisionError) throw promptRequestError(error.message);
    throw error;
  }
  const result = assembleExecutionContext(root, { role, element, stateRef: sha });
  if (!result.ok) {
    const { error } = result;
    if (error.code === 'NOT_FOUND') {
      const unreadable = error.details?.unreadable;
      throw promptRequestErrorWithDetails(error.message, warningDetails(Array.isArray(unreadable) ? (unreadable as string[]) : []));
    }
    throw readRefusalError(error.message, contextRefusalDetails(error));
  }
  const { payload, context, notes } = result.value;
  return withWarnings(
    { messages: [{ role: 'user', content: { type: 'text', text: payload } }] },
    [...context.warnings, ...notes, ...(result.warnings ?? [])],
  );
}

/**
 * The P5.2.2 undefined-role refusal, verbatim from `p5-interaction/P5.2.2-mcp-prompts.feature`
 * (Scenario "Error - requesting a prompt for an undefined role"): `no prompt for undefined role '<role>'`.
 */
function undefinedRolePromptError(role: string): Error {
  return promptRequestError(`no prompt for undefined role '${role}'`);
}

/**
 * Read one directive file's body — everything after its YAML frontmatter block, trimmed of
 * surrounding blank lines so the composed prompt is a pure function of the file's content and not of
 * how many trailing newlines its author happened to leave (REQ-SYS-07).
 *
 * `file.path` is root-relative to `.wingfoil/` (`loadDirectives` stores it as `directives/<...>.md`),
 * so it is resolved against `<root>/.wingfoil` here. A file with no frontmatter block cannot reach
 * this function — `loadDirectives` rejects that case with `E_MISSING_FRONTMATTER` before any
 * directive is returned — but `splitFrontmatter` degrades to "whole document is body" anyway.
 */
function readDirectiveBody(root: string, file: DirectiveFile): string {
  return splitFrontmatter(readDocument(join(root, WINGFOIL_DIR, file.path))).body.trim();
}

/** An ATX heading line: up to three spaces of indent, one to six `#`, then a space, a tab or the end. */
const ATX_HEADING = /^( {0,3})(#{1,6})(?=[ \t]|$)/;

/** A code-fence line: up to three spaces of indent, then three or more backticks or tildes. */
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** How many levels a directive body's headings are pushed down inside a prompt (`dl-039` headings 1). */
const EMBEDDED_HEADING_DEMOTION = 2;

/**
 * Push every heading of a directive `body` down {@link EMBEDDED_HEADING_DEMOTION} levels, capped at H6
 * (`dl-039` headings 1, spec-004 §3.2). A directive file opens with its own H1, so embedded verbatim
 * under a `## Directive:` block it outranked the block holding it, and every directive after the first
 * read, structurally, as a new top-level section beside `# Role:`. Demoted, the body's H1 becomes an H3
 * under its H2 block, and the prompt's outline matches its nesting.
 *
 * Only ATX headings (`#` … `######`) are rewritten. A line inside a fenced code block (``` or ~~~,
 * closed by a fence of the same character at least as long) is code, not outline, and is left as
 * written — a `# comment` in a shell example stays one. Every other byte is unchanged.
 */
function demoteHeadings(body: string): string {
  let fence: string | null = null;
  return body
    .split('\n')
    .map((line) => {
      const fenceMatch = CODE_FENCE.exec(line);
      if (fence !== null) {
        const closing = fenceMatch?.[1];
        if (closing !== undefined && closing[0] === fence[0] && closing.length >= fence.length && line.trim() === closing) {
          fence = null;
        }
        return line;
      }
      if (fenceMatch) {
        fence = fenceMatch[1]!;
        return line;
      }
      return line.replace(ATX_HEADING, (_whole, indent: string, hashes: string) =>
        `${indent}${'#'.repeat(Math.min(6, hashes.length + EMBEDDED_HEADING_DEMOTION))}`,
      );
    })
    .join('\n');
}

/** One directive as it appears in a composed prompt: the `id` the `## Directive:` heading names and
 * the body text that follows it. */
interface RolePromptDirectiveBlock {
  readonly id: string;
  readonly body: string;
}

/**
 * Compose the prompt text for `role` from its already-resolved directives — spec-004 §3.2's shape: a
 * `# Role: {role}` header followed by one `## Directive: {id}` block per directive, each carrying that
 * directive's full body with its headings demoted two levels ({@link demoteHeadings}).
 *
 * The heading uses `frontmatter.id`, not `name`: spec-004 §3.2's own example headings read
 * `## Directive: code-quality` / `security-secrets`, which are the `id` values of the real directive
 * files (`code-quality.md` carries `id: code-quality`, `name: "Code Quality"`), and `roles.yaml` binds
 * by id.
 *
 * Block order is `resolveRoleDirectives`' — deduplicated by id and sorted id-ascending per
 * `spec-012-context-loader-relevance-filtering` §5 / REQ-SYS-07. spec-004 §3.2 states the resolution
 * as a *set* (`roles.yaml[R].directives` ∪ `global`) and the order as id-ascending (`dl-039` ordering
 * 1). The choice rests on reusing the one resolver, which keeps REQ-INT-02's "100%" and REQ-STATE-05's
 * disjointness a single guarantee; an own-then-global grouping would be equally deterministic.
 */
function composeRolePromptText(role: string, directives: readonly RolePromptDirectiveBlock[]): string {
  const blocks = directives.map(({ id, body }) => `## Directive: ${id}\n${demoteHeadings(body)}`);
  return [`# Role: ${role}`, ...blocks].join('\n\n');
}

/**
 * Build the `prompts/get` result for `role`: resolve its directives against the project **now**
 * (spec-004 §3.2 — per request, never cached from server boot) and compose them into one message.
 *
 * `resolveRoleDirectives` also returns operator diagnostics (`warnings`, e.g. dl-029's "no directives
 * assigned to role 'intern'"); they are **not** embedded in the prompt. spec-004 §3.2 defines the
 * prompt payload as role header + directive blocks, and folding a diagnostic into agent-facing
 * instruction text would put an unratified string into the payload — the same reasoning
 * `src/core/context.ts` gives for keeping its own warnings out of the serialized context envelope.
 */
function buildRolePrompt(root: string, role: string): GetPromptResult {
  const { directives } = resolveRoleDirectives(loadDirectives(root), loadRolesYaml(root), role);
  const text = composeRolePromptText(
    role,
    directives.map((file) => ({ id: file.frontmatter.id, body: readDirectiveBody(root, file) })),
  );
  // MCP's `PromptMessage.role` is the two-value enum `"user" | "assistant"` (the SDK's
  // `PromptMessageSchema`); `user` is the only wire role that can deliver instructional content.
  // spec-004 §3.2's example says so since `dl-039` (role 1) — it used to show an unrepresentable
  // `role: "system"`.
  return { messages: [{ role: 'user', content: { type: 'text', text } }] };
}

/**
 * Register the role-scoped Prompts channel: one `{role}-session` Prompt per role in `options.roles`
 * (spec-004 §3.1), each embedding that role's directives (§3.2), and the refusals of §3.4.
 *
 * **The role set is fixed; the directives are not** (`dl-049` (b), task-174). `options.roles` is the
 * DNA role set `wingfoil mcp` read once, in its pre-flight, before the server started; it is copied
 * here and never re-read, so `prompts/list` and the undefined-role check read nothing, and a role added
 * to `dna.yaml` while the server runs is served after a restart. The Prompts capability is therefore
 * declared without `listChanged`: the list cannot change during a session. What a Prompt *embeds* is
 * still resolved per request — `roles.yaml` and the directive files are read on every `prompts/get`
 * (spec-004 §3.2, REQ-INT-02's "a newly assigned directive appears on the next session start"). This
 * function itself reads nothing, so `createMcpServer` keeps spec-014 §2's "no I/O at construction".
 *
 * **Why the low-level handlers, not `McpServer.registerPrompt`.** The high-level API answers an
 * unregistered name with its own `Prompt <name> not found` before any WingFoil code runs, so the BDD's
 * `no prompt for undefined role 'wizard'` cannot be expressed through it. This function therefore owns
 * `prompts/list` and `prompts/get` on `server.server` — the same pattern `./read-only.ts`'s
 * `registerWriteRefusalHandler` uses — and a later `registerPrompt` on the same server fails loudly ("A
 * request handler for prompts/list already exists") instead of being silently shadowed. spec-004 §3.4's
 * two refusals, both `-32602`: a `{role}-session` name whose role is not in the set is `no prompt for
 * undefined role '<role>'`; a name that is not `{role}-session`-shaped names no role and keeps the SDK's
 * `Prompt <name> not found`. A read that fails while a Prompt is built carries the loader's details as
 * `error.data.details`, as a failed Resource read does (`withRefusalDetails`, `bug-184`).
 *
 * Call before the server is connected (MCP capabilities cannot be registered after connecting).
 */
export function registerRolePrompts(server: McpServer, options: RegisterRolePromptsOptions): void {
  const roles: readonly string[] = [...options.roles];
  server.server.registerCapabilities({ prompts: {} });
  server.server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: roles.map((role) => ({
      name: roleSessionPromptName(role),
      description: `session instructions for the '${role}' role, embedding its assigned directives (read-only); with element and state, the execution context for that element at that commit`,
      arguments: ROLE_PROMPT_ARGUMENTS.map((argument) => ({ ...argument })),
    })),
  }));
  server.server.setRequestHandler(GetPromptRequestSchema, (request) => {
    const { name } = request.params;
    if (!name.endsWith(ROLE_PROMPT_NAME_SUFFIX)) {
      throw promptRequestError(`Prompt ${name} not found`);
    }
    const role = name.slice(0, -ROLE_PROMPT_NAME_SUFFIX.length);
    if (!roles.includes(role)) throw undefinedRolePromptError(role);
    // task-195: the two optional arguments (spec-004 §3.1); an unknown name is refused rather than
    // ignored, so a misspelt `State` never falls back to the argument-less Prompt. Sorted: the first
    // unknown name reported does not depend on the client's key order (REQ-SYS-07).
    const args = request.params.arguments ?? {};
    const unknown = Object.keys(args).sort().find((key) => !ROLE_PROMPT_ARGUMENT_NAMES.includes(key));
    if (unknown !== undefined) {
      throw promptRequestError(`unknown prompt argument '${unknown}': '${name}' takes only 'element' and 'state'`);
    }
    // An empty string is an absent argument (spec-004 §3.1): a client that submits every declared
    // field sends `""` for the ones its user left blank.
    const element = args.element === '' ? undefined : args.element;
    const state = args.state === '' ? undefined : args.state;
    if (element === undefined && state === undefined) {
      return withRefusalDetails(() => buildRolePrompt(options.resolveRoot(), role));
    }
    if (element === undefined || state === undefined) {
      throw promptRequestError(
        `prompt arguments 'element' and 'state' go together: '${element === undefined ? 'element' : 'state'}' is missing`,
      );
    }
    const ref = parseElementRef(element);
    if (!ref.ok) throw promptRequestError(ref.error.message);
    return withRefusalDetails(() => buildContextPrompt(options.resolveRoot(), role, ref.value, state));
  });
}
