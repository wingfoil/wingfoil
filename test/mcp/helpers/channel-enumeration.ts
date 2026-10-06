/**
 * Shared "channel enumeration" fixture (REQ-INT-01 / REQ-SEC-05) — task-011-mcp-resources-read-only
 * establishes this; task-016-read-only-agent-channel reuses it rather than re-deriving the same
 * assertion. Not a `.test.ts` file, so Jest's `testMatch` never picks it up as a suite on its own
 * (mirrors `test/storage/helpers/git-fixture.ts`'s own convention).
 *
 * Connects a real MCP `Client`/`McpServer` pair, over the SDK's in-memory transport, wired with
 * every Resource `src/mcp/index.ts`'s `registerReadOnlyResources` registers; attempts every
 * write-shaped request the Resources channel can receive; and provides a before/after snapshot
 * comparison so a caller can assert nothing persisted after every refused attempt (spec-004 §2.3's
 * "the refusal persists nothing") over a committed git fixture: the listed files' bytes, the
 * working-tree status (untracked and ignored files included), `HEAD`, its symbolic target, and every
 * ref. See {@link PersistenceSnapshot} for exactly what is and is not compared (task-147).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { CoreModule } from '../../../src/core';
import { registerCoreModules, registerReadOnlyResources } from '../../../src/mcp';
import { WRITE_INTENT_META_KEY } from '../../../src/mcp/read-only';
import {
  assertPersistenceUnchanged,
  snapshotPersistence,
  type PersistenceSnapshot,
} from '../../storage/helpers/persistence-snapshot';

export interface ChannelEnumerationClient {
  readonly client: Client;
  readonly server: McpServer;
}

/** Connect a Client/Server pair with the full read-only Resources channel wired on, over the fixture at `root`. */
export async function connectReadOnlyClient(root: string): Promise<ChannelEnumerationClient> {
  const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
  registerReadOnlyResources(server, { resolveRoot: () => root });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

/**
 * Connect a Client/Server pair with the operation-derived Tool/Resource surface wired on via
 * `registerCoreModules(modules)` — a `mutates: true` op becomes a Tool, a `mutates: false` op a
 * Resource (the structural half of REQ-SEC-05). task-011 established this fixture "to extend to Tools
 * without rework"; this is that extension (task-016-read-only-agent-channel), letting a test enumerate
 * the agent-facing channels over the SDK.
 */
export async function connectCoreModuleSurface(
  modules: readonly CoreModule[],
  options: { resolveRoot: () => string },
): Promise<ChannelEnumerationClient> {
  const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
  registerCoreModules(server, modules, {
    resolveRoot: options.resolveRoot,
    buildParams: (ctx) => ({ root: ctx.root }),
  });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

/**
 * What a no-persistence check compares: the shared snapshot of `test/storage/helpers/persistence-snapshot.ts`
 * (task-184 moved it there from this file, bug-194, so the core and CLI "writes nothing" assertions
 * compare the same things this channel's do). Re-exported for this file's callers.
 */
export type { PersistenceSnapshot } from '../../storage/helpers/persistence-snapshot';

/**
 * Snapshot a set of root-relative files' raw bytes plus the repository state, for
 * {@link assertFilesUnchanged}. Throws if the working tree is not clean (untracked and ignored files
 * included): this channel's fixtures are committed, and the stricter precondition is kept from
 * task-147 rather than relying on the shared snapshot's dirty-file bytes.
 */
export function snapshotFiles(root: string, relativePaths: readonly string[]): PersistenceSnapshot {
  const snapshot = snapshotPersistence(root, relativePaths);
  if (snapshot.status !== '') {
    throw new Error(`channel-enumeration: fixture must be committed before a snapshot; git status:\n${snapshot.status}`);
  }
  return snapshot;
}

/**
 * Assert nothing {@link PersistenceSnapshot} compares has changed since `snapshot` was taken: the
 * listed files' bytes, the working-tree status, `HEAD`, its symbolic target, and the refs. Each
 * check throws its own message, in that order.
 */
export function assertFilesUnchanged(root: string, snapshot: PersistenceSnapshot): void {
  assertPersistenceUnchanged(root, snapshot, 'channel-enumeration');
}

/**
 * Attempt every write-shaped request the read-only Resources channel can receive against `client`,
 * targeting a resolvable `resourceUri` (e.g. `wingfoil://memory/task/task-001-foo`): one raw,
 * unsupported `resources/write` call, and one `resources/read` call carrying a write-intent `_meta`
 * marker (see `src/mcp/read-only.ts`'s module doc for why `_meta` is the one channel a real
 * `resources/read` request can smuggle extra data through). Returns each attempt's caught error
 * message, in that order — both MUST equal spec-004 §2.3's exact refusal string
 * (`resources are read-only`); neither should ever resolve successfully.
 *
 * The request objects below deliberately do not conform to the SDK's own typed `Request` union (no
 * client method exists for either shape — MCP defines no `resources/write` at all, and no typed
 * client helper accepts extra `_meta` write-intent data) — hence the `as never` casts, which only
 * suppress the compile-time check; both requests are dispatched exactly as any other JSON-RPC
 * request at runtime.
 */
export async function attemptEveryResourceWrite(client: Client, resourceUri: string): Promise<string[]> {
  const messages: string[] = [];

  try {
    await client.request(
      { method: 'resources/write', params: { uri: resourceUri, text: 'malicious overwrite attempt' } } as never,
      z.unknown(),
    );
    messages.push('(no error thrown — resources/write unexpectedly succeeded)');
  } catch (error) {
    messages.push(error instanceof Error ? error.message : String(error));
  }

  try {
    await client.request(
      {
        method: 'resources/read',
        params: { uri: resourceUri, _meta: { [WRITE_INTENT_META_KEY]: { text: 'malicious overwrite attempt' } } },
      } as never,
      z.unknown(),
    );
    messages.push('(no error thrown — resources/read-with-write-intent unexpectedly succeeded)');
  } catch (error) {
    messages.push(error instanceof Error ? error.message : String(error));
  }

  return messages;
}
