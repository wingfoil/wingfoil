/**
 * REQ-PERF-04's reference repository in the parallel pass (task-357, `bug-221`): what
 * `test/mcp/resource-latency.test.ts` asserts besides the time, no clock.
 *
 * `test/mcp/resource-latency.test.ts` times MCP Resource fetches on the 1,000-document reference repository
 * and, since its budgets presuppose an otherwise idle machine, runs only in the opt-in latency pass
 * (`test/latency-suites.cjs` `IN_PROCESS_LATENCY_SUITES`). Its load-independent clauses run here, inside
 * `npm test`'s parallel pass and `npm run test:coverage`, on the same fixture and the same client
 * (`test/mcp/helpers/resource-reference-repo.ts`: the production registrar plus `registerMemoryResources`
 * over the SDK's in-memory transport):
 *
 * - the worst-case scan position's `wingfoil://memory/{type}/{id}` fetch returns that document, and
 *   `wingfoil://dna/show` answers JSON;
 * - an unresolvable id of a known type is a protocol-level read failure, not a silent empty payload;
 * - REQ-PERF-04's "the MCP server sustains queries for the duration of an agent session without restart":
 *   200 fetches on one never-restarted connection, none failing, the connection alive at the end. The
 *   no-growth trend over those fetches is a timing and stays in the latency pass.
 *
 * No timing helper is imported and no clock is read (`test/core/latency-budget-placement.test.ts` rule 6).
 */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { removeTempDir } from '../storage/helpers/git-fixture';
import { connectedClient, type FixtureDoc, seedReferenceRepo, SESSION_ROUNDS, sessionDocs, sessionUri, worstCaseDoc } from './helpers/resource-reference-repo';

jest.setTimeout(60_000);

describe('REQ-PERF-04 reference repository (1,000 Memory documents): what the resource latency suite asserts besides the time', () => {
  let root: string;
  let client: Client;
  let docs: FixtureDoc[];

  beforeAll(async () => {
    const seeded = seedReferenceRepo();
    root = seeded.root;
    docs = seeded.docs;
    ({ client } = await connectedClient(root));
  });

  afterAll(() => removeTempDir(root));

  it('`wingfoil://dna/show` answers JSON', async () => {
    const result = await client.readResource({ uri: 'wingfoil://dna/show' });
    expect(result.contents[0]?.mimeType).toBe('application/json');
  });

  it('`wingfoil://memory/{type}/{id}` at the worst-case scan position returns that document', async () => {
    const worstCase = worstCaseDoc(docs);
    const result = await client.readResource({ uri: `wingfoil://memory/${worstCase.type}/${worstCase.id}` });
    const content = result.contents[0];
    expect(content && 'text' in content ? content.text : '').toContain(`id: ${worstCase.id}`);
  });

  it('an unresolvable id (known type) surfaces as a protocol-level read failure, not a silent empty payload', async () => {
    await expect(client.readResource({ uri: 'wingfoil://memory/task/no-such-id' })).rejects.toThrow(/not found/);
  });

  it(`sustains ${String(SESSION_ROUNDS)} fetches on a single, never-restarted connection with no error, alive at the end`, async () => {
    const sampleDocs = sessionDocs(docs);
    const failures: string[] = [];
    for (let i = 0; i < SESSION_ROUNDS; i += 1) {
      const uri = sessionUri(sampleDocs, i);
      const result = await client.readResource({ uri }).catch((caught: unknown) => {
        failures.push(`${uri}: ${String(caught)}`);
        return undefined;
      });
      if (result !== undefined && result.contents.length !== 1) failures.push(`${uri}: ${String(result.contents.length)} contents`);
    }
    expect(failures).toEqual([]);

    const final = await client.readResource({ uri: 'wingfoil://dna/show' });
    expect(final.contents[0]?.mimeType).toBe('application/json');
  });
});
