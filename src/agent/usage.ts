/**
 * A run's token counts and model (`spec-016` §2.6 "Usage and model", task-337, `dl-188` part 1 (c)): the reading of
 * one source's values, shared by the three sources `usage.from` may name.
 *
 * - {@link documentUsage}: the values at `usage.fields`' paths in one JSON document — the `lookup` source's
 *   (`usage.lookup_args`' stdout) and the `output` source's (a headless run's stdout under
 *   `launch.headless.output: json`).
 * - {@link transcriptUsage}: the `transcript` source, the agent's session transcript (a JSON Lines file the agent CLI
 *   writes on the host): the selected lines are the messages, one per `usage.transcript.message_id`, each count summed
 *   over them, the model their distinct values sorted and joined (approver ruling D3 (a)).
 * - {@link renderTranscriptPath} and {@link launchDirSlug}: where the transcript is (§2.3 `{home}`,
 *   `{launch_dir_slug}`, `{session_id}`), and {@link readTranscriptLines}, which streams it under the lookup's limit.
 *
 * **Determinism.** Every source is read after the agent exits, by the post-run step only (§3.3 step 16): nothing of it
 * enters the bootstrap, the context or the run id, and only the four counts and the model reach the record. The
 * transcript's host path is never recorded nor named in a message.
 */
import { createReadStream } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';

import { NOT_REPORTED, RUN_TOKEN_KEYS, type ReportedCount, type RunTokens } from './run-log';
import type { AdapterManifest } from './schema';

/** The JSON paths of one source's values (§2.2 `usage.fields`, `usage.transcript.fields`). */
export type UsageFieldPaths = NonNullable<AdapterManifest['usage']['fields']>;

/** `usage.transcript` as a manifest declares it (§2.2). */
export type TranscriptDeclaration = NonNullable<AdapterManifest['usage']['transcript']>;

/** One source's model and counts, and the warnings its values raised (each without the adapter's prefix). */
export interface SourceUsage {
  readonly model: string;
  readonly tokens: RunTokens;
  readonly warnings: string[];
}

/**
 * The value at the dotted `path` of a JSON value (§2.2 `session.field`, `usage.fields`): each segment a
 * key of a plain object; `undefined` when a segment is absent or the value on the way is not an object.
 */
export function readJsonPath(document: unknown, path: string): unknown {
  let value: unknown = document;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * Whether `usage` holds at least one value, a count or the model (§2.6): a source that yields none passes to the
 * next one of `usage.from`'s list.
 */
export function yieldsUsage(usage: Pick<SourceUsage, 'model' | 'tokens'>): boolean {
  return usage.model !== NOT_REPORTED || RUN_TOKEN_KEYS.some((key) => usage.tokens[key] !== NOT_REPORTED);
}

/**
 * The model and the counts at `fields`' paths in `document` (§2.6 `lookup`, `output`): a path not declared, or absent
 * in the document, is `not-reported` silently; a `model` that is not a non-empty string, or a count that is not a
 * non-negative integer, is `not-reported` with one warning, `<label> <key> is not …: not read from it` — it names the
 * source, since a later source of `usage.from` may still supply that value (`spec-016` §2.6, `spec-008` §2).
 *
 * @param label - Who printed the document, as the warnings name it (`the usage lookup's`, `the headless output's`).
 */
export function documentUsage(document: unknown, fields: UsageFieldPaths, label: string): SourceUsage {
  const warnings: string[] = [];
  let model: string = NOT_REPORTED;
  if (fields.model !== undefined) {
    const value = readJsonPath(document, fields.model);
    if (typeof value === 'string' && value !== '') model = value;
    else if (value !== undefined) warnings.push(`${label} model is not a non-empty string: not read from it`);
  }
  const count = (key: keyof RunTokens): ReportedCount => {
    const path = fields[key];
    if (path === undefined) return NOT_REPORTED;
    const value = readJsonPath(document, path);
    if (isCount(value)) return value;
    if (value !== undefined) warnings.push(`${label} ${key} is not a non-negative integer: not read from it`);
    return NOT_REPORTED;
  };
  return { model, tokens: { input: count('input'), output: count('output'), cache_read: count('cache_read'), cache_write: count('cache_write') }, warnings };
}

/** The transcript source being read: {@link transcriptAccumulator}'s. */
export interface TranscriptAccumulator {
  /** Feed one line of the transcript, in file order. */
  readonly add: (line: string) => void;
  /** The model and the counts over the messages fed so far. */
  readonly result: () => SourceUsage;
}

/**
 * The transcript source fed line by line (§2.6 `transcript`): `add` each line in file order, then `result` once. A line
 * that is not JSON, or not a selected line (its value at `select.field` is not the string `select.equals`), is passed
 * over; under `message_id` the selected lines with the same id are one message, the last of them kept (a line whose id
 * is not a string or a number is a message of its own); without it every selected line is one message.
 */
export function transcriptAccumulator(declaration: Pick<TranscriptDeclaration, 'select' | 'message_id' | 'fields'>): TranscriptAccumulator {
  const byId = new Map<string, unknown>();
  const unkeyed: unknown[] = [];
  return {
    add(line) {
      if (line.trim() === '') return;
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        return;
      }
      if (readJsonPath(value, declaration.select.field) !== declaration.select.equals) return;
      const id = declaration.message_id === undefined ? undefined : readJsonPath(value, declaration.message_id);
      if (typeof id === 'string' || typeof id === 'number') {
        const key = JSON.stringify(id);
        // The last line of an id is read: a re-insert keeps the id's first place, which nothing depends on.
        byId.set(key, value);
      } else {
        unkeyed.push(value);
      }
    },
    result() {
      return messagesUsage([...byId.values(), ...unkeyed], declaration.fields);
    },
  };
}

/** The model and the counts over `messages` (§2.6 `transcript`). */
function messagesUsage(messages: readonly unknown[], fields: UsageFieldPaths): SourceUsage {
  const warnings: string[] = [];
  const count = (key: keyof RunTokens): ReportedCount => {
    const path = fields[key];
    if (path === undefined) return NOT_REPORTED;
    let sum: number | undefined;
    for (const message of messages) {
      const value = readJsonPath(message, path);
      if (value === undefined) continue;
      if (!isCount(value)) {
        warnings.push(`${key} is not a non-negative integer in a message: not read from it`);
        return NOT_REPORTED;
      }
      sum = (sum ?? 0) + value;
    }
    return sum === undefined || !Number.isSafeInteger(sum) ? NOT_REPORTED : sum;
  };
  const tokens: RunTokens = { input: count('input'), output: count('output'), cache_read: count('cache_read'), cache_write: count('cache_write') };
  let model: string = NOT_REPORTED;
  if (fields.model !== undefined) {
    const models = new Set<string>();
    let wrong = false;
    for (const message of messages) {
      const value = readJsonPath(message, fields.model);
      if (value === undefined) continue;
      if (typeof value !== 'string') wrong = true;
      else if (value !== '') models.add(value);
    }
    if (wrong) warnings.push('model is not a string in a message: not read from it');
    else if (models.size > 0) model = [...models].sort().join(', ');
  }
  return { model, tokens, warnings };
}

/** {@link transcriptAccumulator} over `lines`, in order: the transcript source's values (§2.6 `transcript`). */
export function transcriptUsage(lines: Iterable<string>, declaration: Pick<TranscriptDeclaration, 'select' | 'message_id' | 'fields'>): SourceUsage {
  const accumulator = transcriptAccumulator(declaration);
  for (const line of lines) accumulator.add(line);
  return accumulator.result();
}

/**
 * `{launch_dir_slug}` (§2.3): `dir` with every character other than `A`–`Z`, `a`–`z` and `0`–`9` replaced by `-`,
 * the name Claude Code gives a project's folder of transcripts. The caller passes the launch directory with its
 * symbolic links resolved.
 */
export function launchDirSlug(dir: string): string {
  return dir.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * `usage.transcript.path` rendered (§2.3): each `/`-separated segment that is exactly `{home}`, `{launch_dir_slug}` or
 * `{session_id}` takes its value, and a last segment `{session_id}.<ext>` the session id followed by `.<ext>`;
 * `launchDir` is slugged here ({@link launchDirSlug}, which leaves a slug unchanged). `undefined` when the result is not
 * an absolute path or one of its segments is `.` or `..`.
 */
export function renderTranscriptPath(template: string, values: { readonly home: string; readonly launchDir: string; readonly sessionId: string }): string | undefined {
  const single: Readonly<Record<string, string>> = {
    '{home}': values.home,
    '{launch_dir_slug}': launchDirSlug(values.launchDir),
    '{session_id}': values.sessionId,
  };
  const segments = template.split('/');
  const rendered = segments.map((segment, index) => {
    const value = single[segment];
    if (value !== undefined) return value;
    if (index === segments.length - 1 && segment.startsWith('{session_id}.')) return `${values.sessionId}${segment.slice('{session_id}'.length)}`;
    return segment;
  });
  const path = rendered.join('/');
  if (!isAbsolute(path)) return undefined;
  if (path.split(/[/\\]/).some((segment) => segment === '.' || segment === '..')) return undefined;
  return path;
}

/** How a transcript read ended: every line fed, or why not (one phrase, for a warning). */
export type TranscriptRead = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Stream the file `path` line by line to `onLine` (§2.6 `transcript`), stopping after `timeoutMs`: `is absent` when
 * there is no such file, `is unreadable (<code>)` for any other error, `was not read within <ms> ms` past the limit. The reason
 * never names the path.
 */
export function readTranscriptLines(path: string, timeoutMs: number, onLine: (line: string) => void): Promise<TranscriptRead> {
  return new Promise((settle) => {
    let settled = false;
    const finish = (outcome: TranscriptRead): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle(outcome);
    };
    const stream = createReadStream(path, { encoding: 'utf-8' });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    const timer = setTimeout(() => {
      finish({ ok: false, reason: `was not read within ${timeoutMs} ms` });
      lines.close();
      stream.destroy();
    }, timeoutMs);
    // The interface re-emits its input's error (and closes on its end only): one handler, here.
    lines.on('error', (error: NodeJS.ErrnoException) => {
      finish({ ok: false, reason: error.code === 'ENOENT' ? 'is absent' : `is unreadable (${error.code ?? error.message})` });
      lines.close();
    });
    lines.on('line', (line) => {
      if (!settled) onLine(line);
    });
    lines.once('close', () => finish({ ok: true }));
  });
}
