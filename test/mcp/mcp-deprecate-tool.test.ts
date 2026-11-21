/**
 * task-367 AC 1 (characterization; P5.2.3, `spec-004` §4.3, `spec-018` §2) — a successful `memory.deprecate` Tool call
 * over the PRODUCTION server (`createMcpServer`) writes the single commit the compiled CLI writes for the same
 * arguments: subject `wf(task): deprecate <id> [draft → deprecated]`, the `Reason:` block, the `WingFoil-Version:`
 * line and exactly one attribution pair. The behaviour exists (green `21a0b5a3d`); this case pins it, since the red
 * suite asserted only the blank-reason refusal of `memory.deprecate`.
 *
 * Fixture: `buildAttributionRepo` (`task-004-deprecate-me` at `draft`), twinned for the CLI run under
 * `WINGFOIL_AGENT=Claude`, the entry the server's environment names too. Deterministic: fixed fixtures and identity.
 */
import { buildAttributionRepo } from '../core/helpers/attribution-fixture';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { coAuthorByGit, commitsSince, commitView, connectProductionTools, finalParagraph, gitState, messageOf, runCli } from './helpers/production-tools';

const TIMEOUT_MS = 60_000;
const ID = 'task-004-deprecate-me';

describe('task-367 AC 1 (characterization) — memory.deprecate over the production server writes the CLI\'s commit', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  it('one commit: wf(task): deprecate … [draft → deprecated], the Reason: block, WingFoil-Version and one attribution pair, equal to the CLI\'s', async () => {
    const root = buildAttributionRepo();
    const twin = buildAttributionRepo();
    roots.push(root, twin);
    const before = gitState(root).head;
    const client = await connectProductionTools(root, { WINGFOIL_AGENT: 'Claude' });

    const result = await client.callTool({ name: 'memory.deprecate', arguments: { id: ID, reason: 'replaced by task-007' } });
    await client.close();

    expect(result.isError ?? false).toBe(false);
    expect(commitsSince(root, before)).toBe(1);
    const message = messageOf(root);
    expect(message.split('\n')[0]).toBe(`wf(task): deprecate ${ID} [draft → deprecated]`);
    expect(message).toMatch(/^Reason: replaced by task-007$/m);
    const trailer = finalParagraph(message);
    expect(trailer[0]).toMatch(/^WingFoil-Version: \S/);
    expect(trailer.slice(1)).toEqual(['Co-Authored-By: Claude <noreply@anthropic.com>', 'AI-Model: not-reported']);
    expect(message.match(/^Co-Authored-By:/gim)).toHaveLength(1);
    expect(message.match(/^AI-Model:/gim)).toHaveLength(1);
    expect(coAuthorByGit(root)).toBe('Claude <noreply@anthropic.com>');
    expect(commitView(root).paths).toEqual([`docs/tasks/${ID}.md`]);

    const cli = runCli(twin, ['memory', 'deprecate', ID, '--reason', 'replaced by task-007'], { WINGFOIL_AGENT: 'Claude' });
    expect({ status: cli.status, stderr: cli.stderr }).toEqual({ status: 0, stderr: '' });
    expect(commitView(root)).toEqual(commitView(twin));
  }, TIMEOUT_MS);
});
