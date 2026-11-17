/**
 * task-337 AC 1 (red-first; `spec-016` §2.2 `usage.transcript.*`, §2.3 `{home}` / `{launch_dir_slug}` and the path
 * rule, §2.6 the `transcript` source, as amended at `2d193b318`; `dl-188` part 1 (c); approver rulings D3 (a), D12) —
 * the pure half of the transcript source, the design's new module `src/agent/usage.ts`:
 *
 * - `transcriptUsage(lines, declaration)`: a line that is not JSON is passed over; the selected lines
 *   (`select.field` equals `select.equals`) are the messages, one per `message_id` value, the last line of an id read;
 *   each count is the sum over the messages of the integers at its path, `not-reported` (never `0`) when no message
 *   carries it; a value of the wrong type makes that count `not-reported` with one warning; the model is the distinct
 *   non-empty strings, sorted and joined with `, ` (D3 (a));
 * - `launchDirSlug(dir)`: every character outside `[A-Za-z0-9]` replaced by `-` (D12);
 * - `renderTranscriptPath(template, { home, launchDir, sessionId })`: each placeholder fills a whole `/` segment, the
 *   last may be `{session_id}.<ext>`; a result that is not absolute, or a segment that renders as `.` or `..`, is
 *   `undefined`.
 *
 * The transcript lines are shaped from the approver's by-hand checks H1/H2 recorded in the task's design gate note
 * (Claude Code `2.1.322`: assistant lines carrying `message.id`, `message.model` and `message.usage` with the four
 * integer keys beside other keys such as `output_tokens_details`, `server_tool_use`, `service_tier`, `cache_creation`),
 * never copied from a real transcript; `test/fixtures/agents/transcripts/two-messages.jsonl` sums to H2's totals
 * (`input 4, output 73, cache_read 36139, cache_write 9580`). Expected red: `src/agent/usage.ts` does not exist
 * (`tsc` TS2307; Jest "Cannot find module").
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchDirSlug, renderTranscriptPath, transcriptUsage } from '../../src/agent/usage';

/** `claude-code`'s `usage.transcript` as amended §2.8 declares it. */
const DECLARATION = {
  path: '{home}/.claude/projects/{launch_dir_slug}/{session_id}.jsonl',
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

const TRANSCRIPT = join(__dirname, '..', 'fixtures', 'agents', 'transcripts', 'two-messages.jsonl');

/** One assistant line of the H1 shape. */
function assistant(id: string, model: string, usage: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    message: { id, type: 'message', role: 'assistant', model, content: [], usage: { ...usage, output_tokens_details: {}, service_tier: 'standard', cache_creation: {} } },
  });
}

const USER = JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } });

describe('task-337 AC 1 — transcriptUsage (spec-016 §2.6 transcript)', () => {
  it('the fixture transcript: the four counts summed over its two assistant messages, its one model', () => {
    const lines = readFileSync(TRANSCRIPT, 'utf-8').split('\n');
    expect(transcriptUsage(lines, DECLARATION)).toEqual({
      model: 'claude-opus-5-5',
      tokens: { input: 4, output: 73, cache_read: 36139, cache_write: 9580 },
      warnings: [],
    });
  });

  it('a line that is not JSON and a user line are passed over; a repeated message id counts once, its last line read', () => {
    const lines = [
      USER,
      assistant('msg_1', 'm-1', { input_tokens: 10, cache_creation_input_tokens: 3, cache_read_input_tokens: 100, output_tokens: 1 }),
      'not json {',
      assistant('msg_1', 'm-1', { input_tokens: 10, cache_creation_input_tokens: 3, cache_read_input_tokens: 100, output_tokens: 5 }),
      assistant('msg_2', 'm-1', { input_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 200, output_tokens: 7 }),
      '',
    ];
    expect(transcriptUsage(lines, DECLARATION)).toEqual({
      model: 'm-1',
      tokens: { input: 30, output: 12, cache_read: 300, cache_write: 3 },
      warnings: [],
    });
  });

  it('without message_id every selected line is one message', () => {
    const withoutId = { path: DECLARATION.path, select: DECLARATION.select, fields: DECLARATION.fields };
    const lines = [
      assistant('msg_1', 'm-1', { input_tokens: 10, output_tokens: 1 }),
      assistant('msg_1', 'm-1', { input_tokens: 10, output_tokens: 5 }),
    ];
    expect(transcriptUsage(lines, withoutId).tokens).toMatchObject({ input: 20, output: 6 });
  });

  it('a count no message carries is not-reported, never 0; no selected line at all: every value not-reported', () => {
    const lines = [assistant('msg_1', 'm-1', { input_tokens: 10, output_tokens: 5 })];
    expect(transcriptUsage(lines, DECLARATION)).toEqual({
      model: 'm-1',
      tokens: { input: 10, output: 5, cache_read: 'not-reported', cache_write: 'not-reported' },
      warnings: [],
    });
    expect(transcriptUsage([USER, 'not json'], DECLARATION)).toEqual({
      model: 'not-reported',
      tokens: { input: 'not-reported', output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' },
      warnings: [],
    });
  });

  it('a count of the wrong type: that count not-reported and one warning naming it; the other counts summed', () => {
    const lines = [
      assistant('msg_1', 'm-1', { input_tokens: '10', cache_creation_input_tokens: 3, cache_read_input_tokens: 100, output_tokens: 5 }),
      assistant('msg_2', 'm-1', { input_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 200, output_tokens: 7 }),
    ];
    const result = transcriptUsage(lines, DECLARATION);
    expect(result.tokens).toEqual({ input: 'not-reported', output: 12, cache_read: 300, cache_write: 3 });
    expect(result.model).toBe('m-1');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/input.*not a non-negative integer/);
  });

  it('two models: the distinct values, sorted and joined with ", " (D3 (a))', () => {
    const lines = [
      assistant('msg_1', 'm-2', { input_tokens: 1, output_tokens: 1 }),
      assistant('msg_2', 'm-1', { input_tokens: 1, output_tokens: 1 }),
      assistant('msg_3', 'm-2', { input_tokens: 1, output_tokens: 1 }),
    ];
    expect(transcriptUsage(lines, DECLARATION).model).toBe('m-1, m-2');
  });
});

describe('task-337 AC 1 — launchDirSlug (spec-016 §2.3 {launch_dir_slug}, D12)', () => {
  it("task-236's observation: /, . and every other character outside [A-Za-z0-9] become -", () => {
    expect(launchDirSlug('/home/u/Workspaces/.wf2-wt/task-236')).toBe('-home-u-Workspaces--wf2-wt-task-236');
  });

  it("H1's scratch directory: _ and . become - too", () => {
    expect(launchDirSlug('/tmp/wf_slug.check-1zq2Bq')).toBe('-tmp-wf-slug-check-1zq2Bq');
  });
});

describe('task-337 AC 1 — renderTranscriptPath (spec-016 §2.3 the path rule)', () => {
  // `launchDir` is already a slug here, which launchDirSlug leaves unchanged, so the case holds whether the function
  // slugs its `launchDir` itself or is handed the slug: that convention is the implementation's (launchDirSlug is pinned
  // above, and the in-process launch suite pins the whole path).
  const values = { home: '/home/u', launchDir: '-tmp-repo', sessionId: '4f4d7684-d54a-4948-8c15-8b0414c8b6d8' };

  it("claude-code's path renders to an absolute path, {session_id} followed by its extension", () => {
    expect(renderTranscriptPath(DECLARATION.path, values)).toBe('/home/u/.claude/projects/-tmp-repo/4f4d7684-d54a-4948-8c15-8b0414c8b6d8.jsonl');
  });

  it('a result that is not absolute is undefined', () => {
    expect(renderTranscriptPath(DECLARATION.path, { ...values, home: 'relative/home' })).toBeUndefined();
  });

  it('a segment that renders as .. or . is undefined', () => {
    expect(renderTranscriptPath('{home}/projects/{session_id}/x.jsonl', { ...values, sessionId: '..' })).toBeUndefined();
    expect(renderTranscriptPath('{home}/projects/{session_id}/x.jsonl', { ...values, sessionId: '.' })).toBeUndefined();  });
});
