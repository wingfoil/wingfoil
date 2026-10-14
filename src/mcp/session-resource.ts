/**
 * The session Resource `wingfoil://session/{role}/{element}/{state}` (task-236; approver ruling (a) of
 * 2026-10-13 and D-E…D-G of 2026-10-14; `spec-016` §2.4, `spec-004` §2.1/§3.4): the execution context of the
 * `{role}-session` Prompt for `(role, element, state)`, served also as a read-only Resource, byte for byte.
 *
 * **Why both.** An agent CLI may let its model read MCP Resources but not get MCP Prompts: the by-hand pass of
 * the `claude-code` built-in found Claude Code 2.1.296's model has `ListMcpResourcesTool` and
 * `ReadMcpResourceTool` and no way to get a Prompt, which Claude Code offers only as a command the user types.
 * `agent execute`'s bootstrap therefore names this Resource; the Prompt stays served, unchanged.
 *
 * **Never listed.** `state` is any commit, so the template has no `list` callback: `resources/list` names no
 * `wingfoil://session/` URI and `resources/templates/list` declares the template. A client reads it by the full
 * URI the bootstrap gives; the SDK matches a read against every registered template.
 *
 * **The variables.** `{element}` is the Prompt's `element` argument, `<type>:<id>` (`spec-008` §7), in one
 * segment (`:` is a legal path character; no id holds `/` or `,`). Each variable is percent-decoded before it
 * is checked, so `task%3Atask-042-foo` reads as `task:task-042-foo`.
 *
 * **Refusals**, in order: a write intent (`spec-004` §2.3), before anything is read; a role outside the role set
 * fixed at server start (`spec-004` §3.1) → `no session context for undefined role '<role>'`; then the
 * Prompt's own (§3.4): a malformed element-ref, a malformed revision, a revision naming no commit and an element
 * the commit does not hold are `-32602`; a context the repository refuses is a failed read.
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { parseElementRef } from '../core';

import { buildSessionContext, promptRequestError } from './prompt';
import { refuseIfWriteIntent, withRefusalDetails, withWarnings } from './read-only';

/** `spec-004` §2.1 — the execution context of `role` on `element` at the commit `state` (task-236). */
export const SESSION_CONTEXT_URI_TEMPLATE = 'wingfoil://session/{role}/{element}/{state}';

/** Options for {@link registerSessionContextResource}. */
export interface RegisterSessionContextResourceOptions {
  /** Resolves the project root each read is served from. */
  readonly resolveRoot: () => string;
  /** The DNA role set, fixed at server start (`spec-004` §3.1), the same set the Prompts are registered for. */
  readonly roles: readonly string[];
}

/**
 * A URI variable, percent-decoded; left as sent when it is not valid percent-encoding (the check then refuses
 * it). The SDK types a variable `string | string[]`; none of this template's variables has the explode
 * modifier, so it is always one string (as `memory-resource.ts` notes for its own).
 */
function decoded(value: string | string[] | undefined): string {
  const text = value as string;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Register the session Resource template on `server` (task-236). */
export function registerSessionContextResource(server: McpServer, options: RegisterSessionContextResourceOptions): void {
  server.registerResource(
    'session.context',
    new ResourceTemplate(SESSION_CONTEXT_URI_TEMPLATE, { list: undefined }),
    {
      description:
        "the execution context of a role on a Memory element at a commit, as the '{role}-session' prompt returns it with element and state (read-only)",
      mimeType: 'text/markdown',
    },
    (uri, variables, extra) =>
      withRefusalDetails(() => {
        refuseIfWriteIntent(extra._meta);
        const role = decoded(variables.role);
        if (!options.roles.includes(role)) throw promptRequestError(`no session context for undefined role '${role}'`);
        const element = parseElementRef(decoded(variables.element));
        if (!element.ok) throw promptRequestError(element.error.message);
        const { text, warnings } = buildSessionContext(options.resolveRoot(), role, element.value, decoded(variables.state));
        return withWarnings({ contents: [{ uri: uri.toString(), mimeType: 'text/markdown', text }] }, warnings);
      }),
  );
}
