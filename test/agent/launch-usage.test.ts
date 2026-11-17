/**
 * task-337 AC 1 and AC 2 (red-first; `spec-016` §2.2, §2.6 and §4.2 as amended at `2d193b318`; `dl-188` part 1 (c),
 * `dl-180` version (b), `bug-366`; approver rulings D1 (a), D2 (a), D4, D5, D12) — `launchAgent` driven in process, so
 * the new branches count toward coverage (the compiled-CLI suites are `test/cli/agent-execute-usage.integration.test.ts`
 * and `test/cli/agent-execute-version.integration.test.ts`).
 *
 * AC 1, the usage sources after the agent exits:
 * - `usage.from: [transcript, output]` on an interactive launch, the transcript present at
 *   `<host.homeDir>/.t/projects/<launch dir slug>/<session id>.jsonl` → the record's `tokens` are its sums and `model`
 *   its model; absent → every value `not-reported` and exactly one warning, `adapter 'hand': usage.transcript: …absent`,
 *   naming neither the home directory nor the path (the interactive launch's `output` source yields nothing silently);
 * - a count of the wrong type in the transcript → that count `not-reported` and one warning;
 * - a list is tried in order, the first source that yields supplies everything, the next is not read, values are never
 *   mixed: `[transcript, lookup]` with a transcript never runs the lookup; `[lookup, transcript]` with a lookup that
 *   yields one count records that count and nothing of the transcript; a lookup that fails passes to the transcript.
 *
 * AC 2, `version_args` before the launch and after the run: a version that changes during the run → `agent_version`
 * the one before, `agent_version_after` the one after, and one warning saying so; a version command that prints
 * nothing → a warning before the banner (`… before the launch: agent_version recorded as not-reported`) and one after
 * it (`… after the run: agent_version_after recorded as not-reported`).
 *
 * The home directory is `LaunchHost.homeDir` (the design's new host fact), a temporary directory: no test mutates
 * `HOME`. The session id is the assigned one, `assignedSessionId(<the clone's salt>, <run id>)`, computed here from
 * `sessionSalt(root)` as `launchAgent` computes it. Expected red: `homeDir` and a `usage.from` list are not in the
 * types (`tsc` TS2353 / TS2322); at run time the record carries no `agent_version_after` and the usage reads nothing
 * from a transcript.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { assignedSessionId, launchAgent, sessionSalt, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withWarningSink } from '../../src/validation/warning';
import { launchFixture } from './helpers/launch-input';

const TRANSCRIPT = join(__dirname, '..', 'fixtures', 'agents', 'transcripts', 'two-messages.jsonl');

/** The transcript declaration of these cases: `claude-code`'s, under `.t/` of the host's home directory. */
const TRANSCRIPT_DECLARATION = {
  path: '{home}/.t/projects/{launch_dir_slug}/{session_id}.jsonl',
  select: { field: 'type', equals: 'assistant' },
  message_id: 'message.id',
  fields: {
    model: 'message.model',
    input: 'message.usage.input_tokens',
    output: 'message.usage.output_tokens',
    cache_read: 'message.usage.cache_read_input_tokens',
    cache_write: 'message.usage.cache_creation_input_tokens',
  },
};

/** The headless result's paths (`claude-code`'s `usage.fields`, no model path). */
const OUTPUT_FIELDS = {
  input: 'usage.input_tokens',
  output: 'usage.output_tokens',
  cache_read: 'usage.cache_read_input_tokens',
  cache_write: 'usage.cache_creation_input_tokens',
};

const NONE = { input: 'not-reported', output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' };

const cleanup: string[] = [];
afterAll(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** One event the launch reported, in order: a notice (the banner) or a warning. */
type Event = { readonly notice: string } | { readonly warning: string };

interface Outcome {
  readonly result: CoreResult<unknown>;
  readonly events: Event[];
  readonly warnings: string[];
}

async function launch(root: string, input: LaunchInput, home: string): Promise<Outcome> {
  const events: Event[] = [];
  const result = await withNoticeSink(
    (text) => events.push({ notice: text }),
    () => withWarningSink((text) => events.push({ warning: text }), () => launchAgent(root, input, { homeDir: home }, () => undefined)),
  );
  return { result, events, warnings: events.flatMap((event) => ('warning' in event ? [event.warning] : [])) };
}

const record = (outcome: Outcome): Record<string, unknown> => {
  if (!outcome.result.ok) throw new Error(outcome.result.error.message);
  return (outcome.result.value as { run: Record<string, unknown> }).run;
};

/** A temporary home directory. */
function homeDir(): string {
  const home = mkdtempSync(join(tmpdir(), 'wf-337-home-'));
  cleanup.push(home);
  return home;
}

/** The fixture with session.id: assign and the given usage; the session id launchAgent will assign. */
function fixture(usage: AdapterManifest['usage'], extra: Partial<AdapterManifest> = {}): { root: string; input: LaunchInput; sessionId: string } {
  const { root, input } = launchFixture((manifest: AdapterManifest) => ({
    ...manifest,
    ...extra,
    session: { id: 'assign', assign_args: ['--session-id', '{session_id}'], resume: { supported: false } },
    usage,
  }));
  cleanup.push(root);
  const salt = sessionSalt(root);
  if (!salt.ok) throw new Error(salt.error.message);
  return { root, input, sessionId: assignedSessionId(salt.value, input.runId) };
}

/** Write `source` as the transcript the declaration renders for this root, home and session. */
function placeTranscript(home: string, root: string, sessionId: string, source: string): string {
  const path = join(home, '.t', 'projects', realpathSync(root).replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`);
  mkdirSync(dirname(path), { recursive: true });
  copyFileSync(source, path);
  return path;
}

describe('task-337 AC 1 — the transcript source, in process (spec-016 §2.6)', () => {
  it('usage.from [transcript, output], interactive, the transcript present: its sums and its model', async () => {
    const home = homeDir();
    const { root, input, sessionId } = fixture({ from: ['transcript', 'output'], fields: OUTPUT_FIELDS, transcript: TRANSCRIPT_DECLARATION });
    placeTranscript(home, root, sessionId, TRANSCRIPT);
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({
      session: sessionId,
      model: 'claude-opus-5-5',
      tokens: { input: 4, output: 73, cache_read: 36139, cache_write: 9580 },
    });
    expect(outcome.warnings).toEqual([]);
  }, 60000);

  it('usage.from transcript alone reads the same', async () => {
    const home = homeDir();
    const { root, input, sessionId } = fixture({ from: 'transcript', transcript: TRANSCRIPT_DECLARATION });
    placeTranscript(home, root, sessionId, TRANSCRIPT);
    expect(record(await launch(root, input, home))).toMatchObject({ model: 'claude-opus-5-5', tokens: { input: 4, output: 73, cache_read: 36139, cache_write: 9580 } });
  }, 60000);

  it('the transcript absent: every value not-reported, never 0, and one warning naming neither the home directory nor the path', async () => {
    const home = homeDir();
    const { root, input } = fixture({ from: ['transcript', 'output'], fields: OUTPUT_FIELDS, transcript: TRANSCRIPT_DECLARATION });
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ model: 'not-reported', tokens: NONE });
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]).toMatch(/^adapter 'hand': usage\.transcript: .*absent/);
    expect(outcome.warnings[0]).not.toContain(home);
    expect(outcome.warnings[0]).not.toContain('.jsonl');
  }, 60000);

  it('a count of the wrong type: that count not-reported, the others summed, one warning', async () => {
    const home = homeDir();
    const { root, input, sessionId } = fixture({ from: 'transcript', transcript: TRANSCRIPT_DECLARATION });
    const scratch = mkdtempSync(join(tmpdir(), 'wf-337-src-'));
    cleanup.push(scratch);
    const source = join(scratch, 'wrong-type.jsonl');
    writeFileSync(
      source,
      `${JSON.stringify({ type: 'assistant', message: { id: 'msg_test_a', model: 'claude-opus-5-5', usage: { input_tokens: '2', output_tokens: 31, cache_read_input_tokens: 18000, cache_creation_input_tokens: 9580 } } })}\n`,
    );
    placeTranscript(home, root, sessionId, source);
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ model: 'claude-opus-5-5', tokens: { input: 'not-reported', output: 31, cache_read: 18000, cache_write: 9580 } });
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]).toMatch(/^adapter 'hand': usage\.transcript: input is not a non-negative integer in a message: not read from it$/);
  }, 60000);
});

describe('task-337 AC 1 — a list of sources: the first that yields, nothing mixed, the rest not read (spec-016 §2.6, D4)', () => {
  it('[transcript, lookup] with a transcript: the transcript, and the lookup never runs', async () => {
    const home = homeDir();
    const { root, input, sessionId } = fixture({ from: ['transcript', 'lookup'], lookup_args: ['scripts/both.cjs'], fields: { input: 'tokens.in' }, transcript: TRANSCRIPT_DECLARATION });
    placeTranscript(home, root, sessionId, TRANSCRIPT);
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ tokens: { input: 4, output: 73, cache_read: 36139, cache_write: 9580 } });
    expect(existsSync(join(root, 'lookups.log'))).toBe(false);
  }, 60000);

  it('[lookup, transcript] with a lookup that yields one count: that count, the others not-reported, nothing of the transcript', async () => {
    const home = homeDir();
    const { root, input, sessionId } = fixture({ from: ['lookup', 'transcript'], lookup_args: ['scripts/both.cjs'], fields: { input: 'tokens.in' }, transcript: TRANSCRIPT_DECLARATION });
    placeTranscript(home, root, sessionId, TRANSCRIPT);
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ model: 'not-reported', tokens: { input: 7, output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' } });
  }, 60000);

  it('[lookup, transcript] with a lookup that fails: its warning, then the transcript', async () => {
    const home = homeDir();
    const { root, input, sessionId } = fixture({ from: ['lookup', 'transcript'], lookup_args: ['scripts/not-json.cjs'], fields: { input: 'tokens.in' }, transcript: TRANSCRIPT_DECLARATION });
    placeTranscript(home, root, sessionId, TRANSCRIPT);
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ model: 'claude-opus-5-5', tokens: { input: 4, output: 73, cache_read: 36139, cache_write: 9580 } });
    expect(outcome.warnings).toEqual(["adapter 'hand': the usage lookup failed (printed no JSON): model and tokens not read from it"]);
  }, 60000);
});

/** A version command reading `version.txt` in the root (else `1.0.0`), and an agent that writes `1.0.1` to it. */
function writeVersionScripts(root: string): void {
  writeFileSync(
    join(root, 'scripts', 'version-file.cjs'),
    "const fs = require('fs'); process.stdout.write((fs.existsSync('version.txt') ? fs.readFileSync('version.txt', 'utf-8').split('\\n')[0] : '1.0.0') + '\\n');\n",
  );
  writeFileSync(join(root, 'scripts', 'agent-bump.cjs'), "require('fs').writeFileSync('version.txt', '1.0.1\\n');\n");
}

describe('task-337 AC 2 — version_args before the launch and after the run, in process (spec-016 §2.6, §4.2 key 19; D1 (a), D2 (a))', () => {
  it('a version that changes during the run: agent_version the one before, agent_version_after the one after, one warning after the banner', async () => {
    const home = homeDir();
    const { root, input } = fixture(
      { from: 'none' },
      { version_args: ['scripts/version-file.cjs'], launch: { interactive: { args: ['scripts/agent-bump.cjs'], terminal: 'optional' } } },
    );
    writeVersionScripts(root);
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ agent_version: '1.0.0', agent_version_after: '1.0.1', result: 'n/a' });
    const changed = "adapter 'hand': the agent CLI changed during the run: version_args printed '1.0.0' before the launch and '1.0.1' after it";
    expect(outcome.warnings).toEqual([changed]);
    const banner = outcome.events.findIndex((event) => 'notice' in event && event.notice.includes(': launching '));
    const warning = outcome.events.findIndex((event) => 'warning' in event && event.warning === changed);
    expect(banner).toBeGreaterThanOrEqual(0);
    expect(warning).toBeGreaterThan(banner);
  }, 60000);

  it('the same version before and after: both recorded, no warning', async () => {
    const home = homeDir();
    const { root, input } = fixture({ from: 'none' }, { version_args: ['scripts/version-file.cjs'] });
    writeVersionScripts(root);
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ agent_version: '1.0.0', agent_version_after: '1.0.0' });
    expect(outcome.warnings).toEqual([]);
  }, 60000);

  it('a version command that prints nothing: one warning before the banner, one after it; both not-reported', async () => {
    const home = homeDir();
    const { root, input } = fixture({ from: 'none' }, { version_args: ['scripts/silent.cjs'] });
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ agent_version: 'not-reported', agent_version_after: 'not-reported' });
    const before = "adapter 'hand': version_args printed nothing before the launch: agent_version recorded as not-reported";
    const after = "adapter 'hand': version_args printed nothing after the run: agent_version_after recorded as not-reported";
    expect(outcome.warnings).toEqual([before, after]);
    const at = (text: string): number => outcome.events.findIndex((event) => 'warning' in event && event.warning === text);
    const banner = outcome.events.findIndex((event) => 'notice' in event && event.notice.includes(': launching '));
    expect(at(before)).toBeLessThan(banner);
    expect(at(after)).toBeGreaterThan(banner);
  }, 60000);

  it('no version_args: both not-reported, silently', async () => {
    const home = homeDir();
    const { root, input } = fixture({ from: 'none' });
    const outcome = await launch(root, input, home);
    expect(record(outcome)).toMatchObject({ agent_version: 'not-reported', agent_version_after: 'not-reported' });
    expect(outcome.warnings).toEqual([]);
  }, 60000);
});
