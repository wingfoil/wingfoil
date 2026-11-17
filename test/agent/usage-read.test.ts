/**
 * task-337 (green, developer's own tests; `spec-016` §2.6 "Usage and model" as amended at `2d193b318`): the branches of
 * `src/agent/usage.ts` that `test/agent/usage.test.ts` (red) does not reach — the transcript read's three failures
 * (absent, unreadable, not read within the limit), a model of the wrong type, a line whose message id is neither a
 * string nor a number, `documentUsage`'s warnings and `yieldsUsage`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { documentUsage, readTranscriptLines, transcriptUsage, yieldsUsage } from '../../src/agent/usage';

const NONE = { input: 'not-reported', output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' } as const;
const DECLARATION = {
  select: { field: 'type', equals: 'assistant' },
  message_id: 'message.id',
  fields: { model: 'message.model', input: 'message.usage.input_tokens', output: 'message.usage.output_tokens' },
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-337-read-'));
  dirs.push(dir);
  return dir;
}

describe('readTranscriptLines (spec-016 §2.6 transcript: the read)', () => {
  it('feeds every line of a file, in order', async () => {
    const path = join(scratch(), 't.jsonl');
    writeFileSync(path, 'a\nb\n\nc');
    const lines: string[] = [];
    await expect(readTranscriptLines(path, 10000, (line) => lines.push(line))).resolves.toEqual({ ok: true });
    expect(lines).toEqual(['a', 'b', '', 'c']);
  });

  it('a file that does not exist: is absent, the reason naming no path', async () => {
    const path = join(scratch(), 'missing.jsonl');
    const read = await readTranscriptLines(path, 10000, () => undefined);
    expect(read).toEqual({ ok: false, reason: 'is absent' });
  });

  it('a directory at the path: is unreadable, with the error code', async () => {
    const dir = join(scratch(), 'dir.jsonl');
    mkdirSync(dir);
    await expect(readTranscriptLines(dir, 10000, () => undefined)).resolves.toEqual({ ok: false, reason: 'is unreadable (EISDIR)' });
  });

  // A FIFO whose writer holds it open and writes nothing: the read waits, deterministically, until the limit.
  (process.platform === 'win32' ? it.skip : it)('a file that cannot be read in time: was not read within the limit, and no line is fed after it', async () => {
    const fifo = join(scratch(), 'fifo.jsonl');
    execFileSync('mkfifo', [fifo]);
    const writer = spawn('sh', ['-c', 'exec 3>"$1"; sleep 30', 'sh', fifo], { stdio: 'ignore' });
    try {
      const lines: string[] = [];
      const read = await readTranscriptLines(fifo, 200, (line) => lines.push(line));
      expect(read).toEqual({ ok: false, reason: 'was not read within 200 ms' });
      expect(lines).toEqual([]);
    } finally {
      // The writer's end closes: the read the stream left pending sees the end of the file and returns.
      writer.kill('SIGKILL');
      await new Promise((resolve) => writer.once('exit', resolve));
    }
  }, 30000);

  it('a file without read permission: is unreadable (EACCES), unless the process may read it anyway', async () => {
    const path = join(scratch(), 'secret.jsonl');
    writeFileSync(path, '{}\n');
    chmodSync(path, 0o000);
    const read = await readTranscriptLines(path, 10000, () => undefined);
    // root reads any file: then the read succeeds, which is not this case's subject.
    if (process.getuid?.() === 0) expect(read).toEqual({ ok: true });
    else expect(read).toEqual({ ok: false, reason: 'is unreadable (EACCES)' });
  });
});

describe('transcriptUsage — the remaining value rules (spec-016 §2.6 transcript)', () => {
  const line = (message: Record<string, unknown>): string => JSON.stringify({ type: 'assistant', message });

  it('a model of the wrong type: the model not-reported and one warning; the counts still summed', () => {
    const result = transcriptUsage([line({ id: 'a', model: 7, usage: { input_tokens: 1, output_tokens: 2 } }), line({ id: 'b', model: 'm-1', usage: { input_tokens: 3 } })], DECLARATION);
    expect(result).toEqual({ model: 'not-reported', tokens: { input: 4, output: 2, cache_read: 'not-reported', cache_write: 'not-reported' }, warnings: ['model is not a string in a message: recorded as not-reported'] });
  });

  it('an empty model string is passed over, silently', () => {
    expect(transcriptUsage([line({ id: 'a', model: '', usage: { input_tokens: 1 } })], DECLARATION).model).toBe('not-reported');
  });

  it('a numeric message id keys like a string one; an id of another type makes the line a message of its own', () => {
    const result = transcriptUsage(
      [
        line({ id: 1, usage: { input_tokens: 1 } }),
        line({ id: 1, usage: { input_tokens: 5 } }),
        line({ id: { nested: true }, usage: { input_tokens: 10 } }),
        line({ id: { nested: true }, usage: { input_tokens: 10 } }),
      ],
      DECLARATION,
    );
    expect(result.tokens.input).toBe(25);
  });

  it('a select value that is not the string equals: the line is passed over', () => {
    expect(transcriptUsage([JSON.stringify({ type: ['assistant'], message: { usage: { input_tokens: 1 } } })], DECLARATION).tokens).toEqual(NONE);
  });
});

describe('documentUsage and yieldsUsage (spec-016 §2.6 lookup, output)', () => {
  it('reads the declared paths; a wrong type is not-reported with one warning naming the source', () => {
    const result = documentUsage({ m: '', u: { i: 4, o: -1, r: 9 } }, { model: 'm', input: 'u.i', output: 'u.o', cache_read: 'u.r', cache_write: 'u.w' }, "the headless output's");
    expect(result).toEqual({
      model: 'not-reported',
      tokens: { input: 4, output: 'not-reported', cache_read: 9, cache_write: 'not-reported' },
      warnings: ["the headless output's model is not a non-empty string: recorded as not-reported", "the headless output's output is not a non-negative integer: recorded as not-reported"],
    });
  });

  it('yields when the model or any count is reported, not otherwise', () => {
    expect(yieldsUsage({ model: 'not-reported', tokens: NONE })).toBe(false);
    expect(yieldsUsage({ model: 'm', tokens: NONE })).toBe(true);
    expect(yieldsUsage({ model: 'not-reported', tokens: { ...NONE, cache_write: 0 } })).toBe(true);
  });
});
