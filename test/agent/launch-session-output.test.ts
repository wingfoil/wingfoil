/**
 * task-356 AC 2 (b) (red-first, `bug-375`; `spec-016` §2.6 `session.id: output` and §3.5, as amended at the design
 * gate; approver ruling D2 (a), the design addendum's H2) — a headless work run's session id read from the agent's
 * stdout, in process: `launchAgent` with `LaunchHost.spawn` injected (the `FakeChild` of
 * `test/agent/helpers/fake-child.ts`, the pattern of `test/agent/launch-headless.test.ts`), so the child's stdout is
 * exactly the text the test writes.
 *
 * - `output: jsonl`: the lines are read in order, each parsed alone, and the first whose value at `session.field`
 *   is a non-empty string gives the id; lines that are not JSON or lack the field are passed over. The stdout is
 *   the four lines of `events.jsonl` the approver captured by hand on 2026-11-09 (the design addendum's H2:
 *   `codex exec --json -c 'mcp_servers.wingfoil={…}' "Reply with the word ok." < /dev/null > events.jsonl`,
 *   `codex-cli 0.145.0`, exit 0), copied verbatim; `session.field` is `thread_id`, the key of its first event
 *   (`thread.started`). Without that first line no line carries the id: `not-reported` and one warning.
 * - `output: json`: the one document's value at `session.field`; invalid JSON is `not-reported` and a warning.
 * - an interactive launch of a `session.id: output` manifest reads nothing: `not-reported`, no warning.
 *
 * Today `postRunFacts` reads no stdout (`runAgent` drains it), so every headless case records `not-reported`.
 */
import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

/** `events.jsonl` of the design addendum's H2, all four lines verbatim (codex-cli 0.145.0, 2026-11-09). */
const H2_EVENTS = [
  '{"type":"thread.started","thread_id":"01a1bf53-dcb5-7902-b518-2286ea29c38c"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"ok"}}',
  '{"type":"turn.completed","usage":{"input_tokens":14803,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":0}}',
];
const H2_THREAD_ID = '01a1bf53-dcb5-7902-b518-2286ea29c38c';

const NO_ID_WARNING = "adapter 'hand': the headless output carries no session id: session recorded as not-reported";

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

/**
 * The launch fixture's manifest with `session.id: output` at `field` and a headless block of `output`. Built through
 * `unknown`: `jsonl` is the value this task adds to the schema's enum.
 */
function sessionFromOutput(output: string, field: string): (manifest: AdapterManifest) => AdapterManifest {
  return (manifest) =>
    ({
      ...manifest,
      launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs', '--work'], output } },
      session: { id: 'output', field, resume: { supported: false } },
    }) as unknown as AdapterManifest;
}

/** Launch `kind` against a child that prints `stdout` and then exits 0; the recorded session and the warnings. */
async function run(kind: 'interactive' | 'headless', output: string, field: string, stdout: string): Promise<{ session: unknown; warnings: string[] }> {
  const { root, input } = launchFixture(sessionFromOutput(output, field));
  repos.push(root);
  const child = new FakeChild();
  const { spawn } = spawnInto(child);
  const warnings: string[] = [];
  const launched: Promise<CoreResult<unknown>> = withNoticeSink(
    () => undefined,
    () => withWarningSink((warning) => warnings.push(warning), () => launchAgent(root, { ...input, kind } as LaunchInput, { spawn }, () => undefined)),
  );
  await tick();
  if (stdout !== '') child.stdout.write(stdout);
  await tick();
  await tick();
  const outcome = await settle(child, launched);
  if (!outcome.ok) throw new Error(outcome.error.message);
  return { session: (outcome.value as { run: { session: unknown } }).run.session, warnings };
}

describe('task-356 AC 2 (b) — a headless run records the session id its stdout carries (spec-016 §2.6, bug-375)', () => {
  it('output: jsonl, the H2 events: session is the thread_id of the first event, no warning', async () => {
    const { session, warnings } = await run('headless', 'jsonl', 'thread_id', `${H2_EVENTS.join('\n')}\n`);
    expect(session).toBe(H2_THREAD_ID);
    expect(warnings).toEqual([]);
  }, 60000);

  // The non-JSON line is the one H2's run printed on stderr (`events.err`), placed on stdout here to stand for any
  // line of text an agent prints among its events.
  it('output: jsonl, a line that is not JSON before the events is passed over', async () => {
    const { session, warnings } = await run('headless', 'jsonl', 'thread_id', `Reading additional input from stdin...\n${H2_EVENTS.join('\n')}\n`);
    expect(session).toBe(H2_THREAD_ID);
    expect(warnings).toEqual([]);
  }, 60000);

  it('output: jsonl, the H2 events without their first line: not-reported, and one warning', async () => {
    const { session, warnings } = await run('headless', 'jsonl', 'thread_id', `${H2_EVENTS.slice(1).join('\n')}\n`);
    expect(session).toBe('not-reported');
    expect(warnings).toEqual([NO_ID_WARNING]);
  }, 60000);

  it('output: json, one document: session is its value at session.field', async () => {
    const { session, warnings } = await run('headless', 'json', 'session_id', `${JSON.stringify({ session_id: 's-1' })}\n`);
    expect(session).toBe('s-1');
    expect(warnings).toEqual([]);
  }, 60000);

  it('output: json, stdout that is not JSON: not-reported, and one warning naming the adapter', async () => {
    const { session, warnings } = await run('headless', 'json', 'session_id', 'not json\n');
    expect(session).toBe('not-reported');
    expect(warnings).toEqual([expect.stringMatching(/^adapter 'hand': .*not-reported$/)]);
  }, 60000);

  it('an interactive launch of a session.id: output manifest: not-reported, no warning (characterization)', async () => {
    const { session, warnings } = await run('interactive', 'jsonl', 'thread_id', '');
    expect(session).toBe('not-reported');
    expect(warnings).toEqual([]);
  }, 60000);
});
