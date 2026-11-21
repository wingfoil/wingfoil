/**
 * The `wingfoil://capabilities` Resource (`spec-019` §6, task-362): the capabilities document of the running build —
 * the file formats it reads, its commands and the capabilities it provides — served by the production server.
 *
 * Hand-registered, as every shipped Resource is (`spec-004` §2.1), at the URI the test-only registrar derives for the
 * self-named `capabilities` operation (`deriveMcpResourceUri`). Each read calls the operation's own function,
 * `capabilitiesFn`, the one the CLI command runs, so its `text` is the bytes `wingfoil capabilities --format json`
 * prints without the final newline. The read takes no project: the registration has no `resolveRoot` at all. A read
 * carrying a write intent is refused first (`spec-004` §2.3). These are WingFoil's capabilities, not the protocol
 * capabilities an MCP `initialize` exchanges.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { capabilitiesFn } from '../core';

import { coreResultResource, refuseIfWriteIntent } from './read-only';

/** `spec-019` §6 — the capabilities document of this build. */
export const CAPABILITIES_URI = 'wingfoil://capabilities';

/** Register `capabilities.read` at {@link CAPABILITIES_URI} on `server` (`spec-019` §6). */
export function registerCapabilitiesResource(server: McpServer): void {
  server.registerResource(
    'capabilities.read',
    CAPABILITIES_URI,
    { description: 'the file formats this WingFoil reads, its commands and the capabilities it provides (read-only)', mimeType: 'application/json' },
    async (readUri, extra) => {
      refuseIfWriteIntent(extra._meta);
      return coreResultResource(readUri, await capabilitiesFn({}));
    },
  );
}
