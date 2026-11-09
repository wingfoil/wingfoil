/**
 * task-356 (green, the developer's own suite; `spec-016` §2.6 `session.id: output`, as amended at the design gate) —
 * the bounds of the session-id reader of a headless run's stdout, beside red's
 * `test/agent/launch-session-output.test.ts`:
 *
 * - `output: json`: more than 1 MiB of stdout → `not-reported` and one warning naming the bound; a document with no
 *   value at `session.field`, or a value that is not a non-empty string → `not-reported` and the no-id warning;
 * - `output: jsonl`: a line over 1 MiB is passed over, and a later line still gives the id; the id on a last line with
 *   no newline is read; an id split across two chunks is read whole;
 * - `output: none`, or `session.id: output` with nothing to read, records `not-reported` silently.
 *
 * In process, with `LaunchHost.spawn` injected (`FakeChild`), as red's suite does.
 */
import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const MIB = 1024 * 1024;
const NO_ID = "adapter 'hand': the headless output carries no session id: session recorded as not-reported";

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

function sessionFromOutput(output: 'json' | 'jsonl' | 'none', field: string): (manifest: AdapterManifest) => AdapterManifest {
  return (manifest) => ({
    ...manifest,
    launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs', '--work'], output } },
    session: { id: 'output', field, resume: { supported: false } },
  });
}

/** A headless launch whose child writes `chunks` in order, then exits 0: the recorded session and the warnings. */
async function run(output: 'json' | 'jsonl' | 'none', field: string, chunks: readonly string[]): Promise<{ session: unknown; warnings: string[] }> {
  const { root, input } = launchFixture(sessionFromOutput(output, field));
  repos.push(root);
  const child = new FakeChild();
  const { spawn } = spawnInto(child);
  const warnings: string[] = [];
  const launched: Promise<CoreResult<unknown>> = withNoticeSink(
    () => undefined,
    () => withWarningSink((warning) => warnings.push(warning), () => launchAgent(root, { ...input, kind: 'headless' } as LaunchInput, { spawn }, () => undefined)),
  );
  await tick();
  for (const chunk of chunks) {
    child.stdout.write(chunk);
    await tick();
  }
  const outcome = await settle(child, launched);
  if (!outcome.ok) throw new Error(outcome.error.message);
  return { session: (outcome.value as { run: { session: unknown } }).run.session, warnings };
}

describe('task-356 — the bounds of the headless session-id reader (spec-016 §2.6)', () => {
  it('json: more than 1 MiB of stdout is not-reported, one warning naming the bound', async () => {
    const big = JSON.stringify({ session_id: 's-big', pad: 'x'.repeat(MIB) });
    const { session, warnings } = await run('json', 'session_id', [big.slice(0, MIB / 2), big.slice(MIB / 2)]);
    expect(session).toBe('not-reported');
    expect(warnings).toEqual(["adapter 'hand': the headless output is over 1 MiB: session recorded as not-reported"]);
  }, 60000);

  it('json: a document without the field is not-reported with the no-id warning', async () => {
    const { session, warnings } = await run('json', 'session_id', [JSON.stringify({ other: 1 })]);
    expect(session).toBe('not-reported');
    expect(warnings).toEqual([NO_ID]);
  }, 60000);

  it('json: a value that is not a non-empty string is not-reported with the no-id warning', async () => {
    const { session, warnings } = await run('json', 'session_id', [JSON.stringify({ session_id: 5 })]);
    expect(session).toBe('not-reported');
    expect(warnings).toEqual([NO_ID]);
  }, 60000);

  it('json: a nested field is read at its dotted path', async () => {
    const { session, warnings } = await run('json', 'meta.session', [JSON.stringify({ meta: { session: 's-nested' } })]);
    expect(session).toBe('s-nested');
    expect(warnings).toEqual([]);
  }, 60000);

  it('jsonl: a line over 1 MiB is passed over, and the next line gives the id', async () => {
    const long = JSON.stringify({ thread_id: 'too-long', pad: 'x'.repeat(MIB) });
    const { session, warnings } = await run('jsonl', 'thread_id', [long.slice(0, MIB / 2), `${long.slice(MIB / 2)}\n`, '{"thread_id":"t-after"}\n']);
    expect(session).toBe('t-after');
    expect(warnings).toEqual([]);
  }, 60000);

  it('jsonl: the id on a last line with no newline is read', async () => {
    const { session } = await run('jsonl', 'thread_id', ['{"type":"turn.started"}\n{"thread_id":"t-last"}']);
    expect(session).toBe('t-last');
  }, 60000);

  it('jsonl: a line split across two chunks is read whole', async () => {
    const { session } = await run('jsonl', 'thread_id', ['{"thread_', 'id":"t-split"}\n']);
    expect(session).toBe('t-split');
  }, 60000);

  it('jsonl: an empty stdout is not-reported with the no-id warning', async () => {
    const { session, warnings } = await run('jsonl', 'thread_id', []);
    expect(session).toBe('not-reported');
    expect(warnings).toEqual([NO_ID]);
  }, 60000);

  it('output: none reads nothing: not-reported, no warning', async () => {
    const { session, warnings } = await run('none', 'thread_id', ['{"thread_id":"ignored"}\n']);
    expect(session).toBe('not-reported');
    expect(warnings).toEqual([]);
  }, 60000);
});
