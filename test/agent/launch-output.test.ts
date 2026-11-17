/**
 * task-336 AC 1 (red-first) — a headless run's output forwarded line by line, in process (`spec-016` §3.3 steps 14 and
 * 16, §3.5 as amended at the design gate; `dl-182` Q1 (a); approver rulings D1 (a), D11): `launchAgent` driven with
 * `LaunchHost.spawn` injected (the `FakeChild` of `test/agent/helpers/fake-child.ts`, built with a piped `stderr`), so
 * the bytes each stream carries are exactly the ones the test writes, and the coverage-measured process reaches the
 * line splitter the CLI suite `test/cli/agent-execute-output.integration.test.ts` shows a user.
 *
 * The output sink is the new interface of `src/validation/warning.ts`, beside `withNoticeSink`:
 * `withOutputSink(sink, run)`, `sink(line, stream)` with `stream` `'stdout' | 'stderr'` and `line` without its newline.
 * Pinned: the spawn options (stderr piped too); chunks split mid-line and mid-UTF-8 sequence; an invalid byte → U+FFFD;
 * a carriage return kept before the newline; a pending line forwarded at 64 KiB; the unterminated tail flushed after the
 * exit; each stream's own order; with `LaunchInput.log`, every forwarded line appended to the file in the console form.
 *
 * Today `withOutputSink` is not exported (`tsc` TS2305; under Jest's `isolatedModules` a runtime `TypeError`), stderr
 * is inherited and stdout drained to nowhere.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withOutputSink, withWarningSink, type OutputStream } from '../../src/validation/warning';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { FakeChild, settle, spawnInto, tick } from './helpers/fake-child';
import { launchFixture } from './helpers/launch-input';

const repos: string[] = [];
const scratch: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** The launch fixture's manifest with a headless block (`output: none`, the built-ins' value). */
function withHeadless(manifest: AdapterManifest): AdapterManifest {
  return { ...manifest, launch: { ...manifest.launch, headless: { args: ['scripts/agent-ok.cjs', '--work'], output: 'none' } } } as AdapterManifest;
}

type Forwarded = [string, OutputStream];

/** One write to a child stream: text, or raw bytes. */
type Chunk = { readonly stream: OutputStream; readonly data: string | Buffer };

/**
 * Launch a headless run against a `FakeChild` with both pipes, write `chunks` in order (one event-loop tick after each),
 * end the child, and return the forwarded `(line, stream)` pairs, the notices, the spawn calls and the outcome.
 */
async function forward(chunks: readonly Chunk[], extra: Partial<Record<'log', string>> = {}): Promise<{
  forwarded: Forwarded[];
  notices: string[];
  calls: ReturnType<typeof spawnInto>['calls'];
  outcome: CoreResult<unknown>;
}> {
  const { root, input } = launchFixture(withHeadless);
  repos.push(root);
  const child = new FakeChild({}, undefined, { stderr: true });
  const { spawn, calls } = spawnInto(child);
  const forwarded: Forwarded[] = [];
  const notices: string[] = [];
  const run: Promise<CoreResult<unknown>> = withOutputSink(
    (line: string, stream: OutputStream) => forwarded.push([line, stream]),
    () =>
      withNoticeSink(
        (notice) => notices.push(notice),
        () => withWarningSink(() => undefined, () => launchAgent(root, { ...input, kind: 'headless', ...extra } as LaunchInput, { spawn }, () => undefined)),
      ),
  );
  await tick();
  for (const chunk of chunks) {
    const target = chunk.stream === 'stdout' ? child.stdout : child.stderr!;
    target.write(chunk.data);
    await tick();
  }
  await tick();
  const outcome = await settle(child, run);
  return { forwarded, notices, calls, outcome };
}

const out = (data: string | Buffer): Chunk => ({ stream: 'stdout', data });
const err = (data: string | Buffer): Chunk => ({ stream: 'stderr', data });

describe('task-336 AC 1 — the headless spawn pipes both streams (spec-016 §3.3 step 14)', () => {
  it('headless: stdin the null device, stdout and stderr piped', async () => {
    const { calls, outcome } = await forward([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options).toMatchObject({ stdio: ['ignore', 'pipe', 'pipe'] });
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe('ok');
  }, 60000);
});

describe('task-336 AC 1 — every line of both streams reaches the output sink (spec-016 §3.5, D11)', () => {
  it('chunks split mid-line are joined: one call per line, the newline excluded', async () => {
    const { forwarded } = await forward([out('hel'), out('lo\nwor'), out('ld\n')]);
    expect(forwarded).toEqual([
      ['hello', 'stdout'],
      ['world', 'stdout'],
    ]);
  }, 60000);

  it('a UTF-8 sequence split across two chunks is decoded as one character', async () => {
    // "a\u00e9" and a newline: 0x61, then U+00E9 as 0xc3 0xa9, split between the two chunks.
    const { forwarded } = await forward([out(Buffer.from([0x61, 0xc3])), out(Buffer.from([0xa9, 0x0a]))]);
    expect(forwarded).toEqual([['a\u00e9', 'stdout']]);
  }, 60000);

  it('an invalid byte is decoded as U+FFFD', async () => {
    const { forwarded } = await forward([err(Buffer.from([0x61, 0xff, 0x62, 0x0a]))]);
    expect(forwarded).toEqual([['a\ufffdb', 'stderr']]);
  }, 60000);

  it('a carriage return before the newline stays in the line', async () => {
    const { forwarded } = await forward([out('x\r\n')]);
    expect(forwarded).toEqual([['x\r', 'stdout']]);
  }, 60000);

  it('a line still pending at 64 KiB is forwarded as it stands, as one line', async () => {
    const long = 'x'.repeat(64 * 1024);
    const { forwarded } = await forward([out(long), out('tail\n')]);
    expect(forwarded.map(([line, stream]) => [line.length, stream])).toEqual([
      [64 * 1024, 'stdout'],
      [4, 'stdout'],
    ]);
    expect(forwarded[0]![0]).toBe(long);
    expect(forwarded[1]![0]).toBe('tail');
  }, 60000);

  it('a last line without a newline is forwarded after the exit', async () => {
    const { forwarded } = await forward([out('first\nlast'), err('only-err')]);
    expect(forwarded.filter(([, stream]) => stream === 'stdout')).toEqual([
      ['first', 'stdout'],
      ['last', 'stdout'],
    ]);
    expect(forwarded.filter(([, stream]) => stream === 'stderr')).toEqual([['only-err', 'stderr']]);
  }, 60000);

  it('each stream keeps its own order (no order across the two streams is pinned)', async () => {
    const { forwarded } = await forward([out('o1\n'), err('e1\n'), out('o2\no3\n'), err('e2\n')]);
    expect(forwarded.filter(([, stream]) => stream === 'stdout').map(([line]) => line)).toEqual(['o1', 'o2', 'o3']);
    expect(forwarded.filter(([, stream]) => stream === 'stderr').map(([line]) => line)).toEqual(['e1', 'e2']);
    expect(forwarded).toHaveLength(5);
  }, 60000);

  it('the banner notice precedes the forwarding and the summary notice follows it (no output line is a notice)', async () => {
    const { forwarded, notices, outcome } = await forward([out('work\n')]);
    expect(outcome.ok ? 'ok' : outcome.error.message).toBe('ok');
    expect(forwarded).toEqual([['work', 'stdout']]);
    expect(notices).toEqual([expect.stringMatching(/^run task-001-hand\/adhoc\/1: launching /), expect.stringMatching(/^run task-001-hand\/adhoc\/1: agent exited 0 after /)]);
  }, 60000);
});

describe('task-336 AC 2 — LaunchInput.log: every forwarded line appended in the console form (spec-016 §3.3 step 13, §3.5)', () => {
  it("the file holds exactly the agent's lines, each followed by a newline, and none of WingFoil's", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-336-log-'));
    scratch.push(dir);
    const log = join(dir, 'run.log');
    const { forwarded } = await forward([out('o1\no2\n'), err('e1\n'), out('tail')], { log });
    expect(forwarded).toHaveLength(4);
    const lines = readFileSync(log, 'utf-8');
    expect(lines.endsWith('\n')).toBe(true);
    const written = lines.slice(0, -1).split('\n');
    expect(written.filter((line) => line.startsWith('o') || line === 'tail')).toEqual(['o1', 'o2', 'tail']);
    expect(written.filter((line) => line.startsWith('e'))).toEqual(['e1']);
    expect(written).toHaveLength(4);
  }, 60000);
});
