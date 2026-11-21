/**
 * Bare JSON-RPC error messages on the wire (`bug-034`; `spec-004` §1, `spec-014` §3; approver ruling D4 (A), task-367).
 *
 * The SDK's `McpError` builds `MCP error <code>: ` into its `message`, and the server sends that message as is, so a
 * client that renders its own `MCP error <code>:` prefix — the SDK's own `Client` does — shows two. The production
 * server strips it from every JSON-RPC error it sends, at the transport, so every error the SDK raises is covered
 * (`resources/read` of an unknown URI, an unknown Prompt, a malformed request) and a client renders one prefix.
 * WingFoil's own refusals are plain `Error`s with no prefix and pass through unchanged.
 */
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isJSONRPCErrorResponse } from '@modelcontextprotocol/sdk/types.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * `message` with the SDK's `MCP error <code>: ` prefix removed once from its `error.message`, when it is a JSON-RPC
 * error response and the prefix names its own `error.code`; any other message is returned as it is. Pure: a changed
 * message is a copy.
 */
export function stripMcpErrorPrefix(message: JSONRPCMessage): JSONRPCMessage {
  if (!isJSONRPCErrorResponse(message)) return message;
  const prefix = `MCP error ${message.error.code}: `;
  if (!message.error.message.startsWith(prefix)) return message;
  return { ...message, error: { ...message.error, message: message.error.message.slice(prefix.length) } };
}

/**
 * `transport`, its `send` replaced by one that hands the previous `send` each message through
 * {@link stripMcpErrorPrefix}. Returns the same transport; `createMcpServer`'s server connects through it.
 */
export function withBareErrorMessages<T extends Transport>(transport: T): T {
  const send = transport.send.bind(transport);
  transport.send = (message, options) => send(stripMcpErrorPrefix(message), options);
  return transport;
}
