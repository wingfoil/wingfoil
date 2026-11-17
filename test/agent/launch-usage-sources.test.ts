/**
 * task-337 (green, developer's own tests; `spec-016` §2.6 "Usage and model" as amended at `2d193b318`): the branches of
 * the launch's usage sources that the red suites do not reach, driven in process —
 *
 * - `output` on a headless `output: json` run: the document's counts; a stdout that is not one JSON document → nothing
 *   and one warning; the document kept beside the forwarding, so every line still reaches the caller;
 * - `transcript` with a session id that is `not-reported` (`session.id: none`) → one warning, then the next source;
 * - `transcript` whose path does not render as an absolute path → one warning, never a read.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { launchAgent, type AdapterManifest, type LaunchInput } from '../../src/agent';
import type { CoreResult } from '../../src/core/types';
import { withNoticeSink, withOutputSink, withWarningSink } from '../../src/validation/warning';
import { launchFixture } from './helpers/launch-input';

const FIELDS = { input: 'usage.input_tokens', output: 'usage.output_tokens', cache_read: 'usage.cache_read_input_tokens', cache_write: 'usage.cache_creation_input_tokens' };
const TRANSCRIPT = {
  path: '{home}/.t/{launch_dir_slug}/{session_id}.jsonl',
  select: { field: 'type', equals: 'assistant' },
  fields: { input: 'message.usage.input_tokens' },
};
const NONE = { input: 'not-reported', output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' };
const DOCUMENT = { type: 'result', usage: { input_tokens: 7, output_tokens: 8, cache_read_input_tokens: 9, cache_creation_input_tokens: 10 } };

const cleanup: string[] = [];
afterAll(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Outcome {
  readonly record: Record<string, unknown>;
  readonly warnings: string[];
  readonly output: string[];
}

async function launch(root: string, input: LaunchInput): Promise<Outcome> {
  const home = mkdtempSync(join(tmpdir(), 'wf-337-home-'));
  cleanup.push(home);
  const warnings: string[] = [];
  const output: string[] = [];
  const result: CoreResult<unknown> = await withOutputSink(
    (line) => output.push(line),
    () => withNoticeSink(() => undefined, () => withWarningSink((text) => warnings.push(text), () => launchAgent(root, input, { homeDir: home }, () => undefined))),
  );
  if (!result.ok) throw new Error(result.error.message);
  return { record: (result.value as { run: Record<string, unknown> }).run, warnings, output };
}

/** A headless fixture whose agent is `scripts/<script>`, written with `text`. */
function headless(usage: AdapterManifest['usage'], script: string, text: string): { root: string; input: LaunchInput } {
  const { root, input } = launchFixture((manifest: AdapterManifest) => ({
    ...manifest,
    launch: { ...manifest.launch, headless: { args: [`scripts/${script}`], output: 'json' } },
    usage,
  }));
  cleanup.push(root);
  writeFileSync(join(root, 'scripts', script), text);
  return { root, input: { ...input, kind: 'headless' } };
}

describe('task-337 — the output source of a headless output: json run (spec-016 §2.6 output)', () => {
  it("the document's counts, every line still forwarded", async () => {
    const { root, input } = headless({ from: 'output', fields: FIELDS }, 'doc.cjs', `process.stdout.write(${JSON.stringify(JSON.stringify(DOCUMENT, null, 1))} + '\\n');\n`);
    const outcome = await launch(root, input);
    expect(outcome.record).toMatchObject({ model: 'not-reported', tokens: { input: 7, output: 8, cache_read: 9, cache_write: 10 } });
    expect(outcome.warnings).toEqual([]);
    expect(outcome.output.join('\n')).toBe(JSON.stringify(DOCUMENT, null, 1));
  }, 60000);

  it('a stdout that is not one JSON document: nothing, and one warning', async () => {
    const { root, input } = headless({ from: 'output', fields: FIELDS }, 'text.cjs', "process.stdout.write('hello\\n');\n");
    const outcome = await launch(root, input);
    expect(outcome.record).toMatchObject({ model: 'not-reported', tokens: NONE });
    expect(outcome.warnings).toEqual(["adapter 'hand': the headless output is not one JSON document: model and tokens not read from it"]);
  }, 60000);

  it('a value of the wrong type in the document: that count not-reported, one warning naming the headless output', async () => {
    const document = { usage: { ...DOCUMENT.usage, input_tokens: 'seven' } };
    const { root, input } = headless({ from: 'output', fields: FIELDS }, 'wrong.cjs', `process.stdout.write(${JSON.stringify(JSON.stringify(document))});\n`);
    const outcome = await launch(root, input);
    expect(outcome.record).toMatchObject({ tokens: { input: 'not-reported', output: 8, cache_read: 9, cache_write: 10 } });
    expect(outcome.warnings).toEqual(["adapter 'hand': the headless output's input is not a non-negative integer: not read from it"]);
  }, 60000);
});

describe('task-337 — the transcript source that cannot be read (spec-016 §2.6 transcript)', () => {
  it('a session id that is not-reported: one warning, then the next source', async () => {
    const { root, input } = headless({ from: ['transcript', 'output'], fields: FIELDS, transcript: TRANSCRIPT }, 'doc.cjs', `process.stdout.write(${JSON.stringify(JSON.stringify(DOCUMENT))});\n`);
    const outcome = await launch(root, input);
    expect(outcome.record).toMatchObject({ session: 'not-reported', tokens: { input: 7, output: 8, cache_read: 9, cache_write: 10 } });
    expect(outcome.warnings).toEqual(["adapter 'hand': usage.transcript: the session id is not-reported: the transcript is not read"]);
  }, 60000);

  it('a path that does not render as an absolute path: one warning naming no path', async () => {
    const { root, input } = launchFixture((manifest: AdapterManifest) => ({
      ...manifest,
      session: { id: 'assign', assign_args: ['--session-id', '{session_id}'], resume: { supported: false } },
      usage: { from: 'transcript', transcript: { ...TRANSCRIPT, path: '{launch_dir_slug}/{session_id}.jsonl' } },
    }));
    cleanup.push(root);
    const outcome = await launch(root, input);
    expect(outcome.record).toMatchObject({ model: 'not-reported', tokens: NONE });
    expect(outcome.warnings).toEqual(["adapter 'hand': usage.transcript: the path does not render as an absolute path: the transcript is not read"]);
  }, 60000);
});
