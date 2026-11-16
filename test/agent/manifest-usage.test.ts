/**
 * task-337 AC 1 (red-first; `spec-016` §2.2 `usage.from` and `usage.transcript.*`, §2.3 `{home}`, `{launch_dir_slug}`,
 * `{session_id}` in `usage.transcript.path` and the path rule, as amended at `2d193b318`; `dl-188` part 1 (c);
 * approver rulings D5, D13) — the manifest rules of the usage sources:
 *
 * - `usage.from` is one source or a list of `output`, `lookup` and `transcript`, each at most once: the list is
 *   accepted, a repeated source is refused;
 * - `transcript` needs `usage.transcript`; `output` needs `launch.headless.output: json` (D13);
 * - `{home}` and `{launch_dir_slug}` are placeholders of §2.3's closed set, legal in `usage.transcript.path` only;
 *   `{home}` there as its first segment only; each placeholder fills a whole segment, the last one allowed
 *   `{session_id}.<ext>`; `{session_id}` there under any `session.id` but `none`.
 *
 * Every case starts from the fake adapter fixture (`test/fixtures/agents/custom/fake.yaml`), as
 * `test/agent/manifest.test.ts` does, with the transcript source added. Expected red: today's strict schema refuses a
 * `usage.from` list and the `usage.transcript` key, and `{home}` is an unknown placeholder.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { dump, load } from 'js-yaml';

import { E_ADAPTER_PLACEHOLDER, parseAdapterManifest } from '../../src/agent';
import { ValidationError, type ValidationIssue } from '../../src/validation';

const FIXTURE = join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml');

type Manifest = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TRANSCRIPT = {
  path: '{home}/.fake-agent/projects/{launch_dir_slug}/{session_id}.jsonl',
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

/** The fake adapter with `usage.from: [transcript, output]`, the transcript block and the headless result fields. */
function withTranscript(): Manifest {
  const manifest = load(readFileSync(FIXTURE, 'utf-8')) as Manifest;
  manifest.usage = {
    from: ['transcript', 'output'],
    fields: { input: 'usage.input_tokens', output: 'usage.output_tokens', cache_read: 'usage.cache_read_input_tokens', cache_write: 'usage.cache_creation_input_tokens' },
    transcript: JSON.parse(JSON.stringify(TRANSCRIPT)) as Manifest,
  };
  return manifest;
}

function issuesOf(manifest: Manifest): readonly ValidationIssue[] {
  try {
    parseAdapterManifest(dump(manifest), { name: 'fake', kind: 'custom', file: 'HEAD:.wingfoil/agents/custom/fake.yaml' });
    return [];
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return error.issues;
  }
}

const at = (issues: readonly ValidationIssue[], path: string): readonly ValidationIssue[] => issues.filter((issue) => issue.path === path);

describe('task-337 AC 1 — usage.from takes a list (spec-016 §2.2)', () => {
  it('[transcript, output] with usage.transcript, usage.fields and launch.headless.output: json loads, and parses to what it declares', () => {
    expect(issuesOf(withTranscript())).toEqual([]);
    const parsed = parseAdapterManifest(dump(withTranscript()), { name: 'fake', kind: 'custom', file: 'f.yaml' });
    expect(parsed.usage.from).toEqual(['transcript', 'output']);
    expect(parsed.usage).toMatchObject({ transcript: TRANSCRIPT });
  });

  it('a single transcript source loads too', () => {
    const manifest = withTranscript();
    manifest.usage.from = 'transcript';
    delete manifest.usage.fields;
    expect(issuesOf(manifest)).toEqual([]);
  });

  it('a source named twice is refused on usage.from', () => {
    const manifest = withTranscript();
    manifest.usage.from = ['transcript', 'output', 'transcript'];
    expect(at(issuesOf(manifest), 'usage.from').length + at(issuesOf(manifest), 'usage.from.2').length).toBeGreaterThan(0);
  });

  it('none is not a member of a list, and an empty list is refused', () => {
    const none = withTranscript();
    none.usage.from = ['transcript', 'none'];
    expect(issuesOf(none).some((issue) => issue.path.startsWith('usage.from'))).toBe(true);
    const empty = withTranscript();
    empty.usage.from = [];
    expect(issuesOf(empty).some((issue) => issue.path.startsWith('usage.from'))).toBe(true);
  });
});

describe('task-337 AC 1 — the sources each need their declaration (spec-016 §2.2; D13)', () => {
  it('transcript without usage.transcript is refused, naming usage.transcript', () => {
    const manifest = withTranscript();
    delete manifest.usage.transcript;
    expect(at(issuesOf(manifest), 'usage.transcript').filter((issue) => /required with usage\.from.*transcript/.test(issue.message))).toHaveLength(1);
  });

  it('output without launch.headless.output: json is refused (D13), the message naming launch.headless.output: json', () => {
    const jsonl = withTranscript();
    jsonl.launch.headless.output = 'jsonl';
    expect(issuesOf(jsonl).filter((issue) => /launch\.headless\.output: json/.test(issue.message))).toHaveLength(1);
    const noHeadless = withTranscript();
    delete noHeadless.launch.headless;
    expect(issuesOf(noHeadless).filter((issue) => /launch\.headless\.output: json/.test(issue.message))).toHaveLength(1);
  });

  it('usage.transcript is strict: an unknown key, or no path, select or fields, is refused', () => {
    const unknown = withTranscript();
    unknown.usage.transcript.glob = '*.jsonl';
    expect(issuesOf(unknown).some((issue) => issue.path === 'usage.transcript' && /glob/.test(issue.message))).toBe(true);
    for (const key of ['path', 'select', 'fields']) {
      const missing = withTranscript();
      delete missing.usage.transcript[key];
      expect({ key, refused: issuesOf(missing).some((issue) => issue.path.startsWith(`usage.transcript.${key}`) || issue.path === 'usage.transcript') }).toEqual({ key, refused: true });
    }
  });
});

describe('task-337 AC 1 — {home} and {launch_dir_slug} (spec-016 §2.3)', () => {
  it('{home} outside usage.transcript.path is refused, naming where it is legal', () => {
    const manifest = withTranscript();
    manifest.launch.interactive.args.push('{home}');
    const issues = at(issuesOf(manifest), 'launch.interactive.args.5');
    expect(issues.filter((issue) => issue.code === E_ADAPTER_PLACEHOLDER && /placeholder \{home\} is not legal here: it is legal in usage\.transcript\.path/.test(issue.message))).toHaveLength(1);
  });

  it('{launch_dir_slug} outside usage.transcript.path is refused, naming where it is legal', () => {
    const manifest = withTranscript();
    manifest.session.lookup_args = ['test/fixtures/agents/fake-agent.cjs', '--lookup', '{launch_dir_slug}'];
    const issues = at(issuesOf(manifest), 'session.lookup_args.2');
    expect(issues.filter((issue) => issue.code === E_ADAPTER_PLACEHOLDER && /placeholder \{launch_dir_slug\} is not legal here: it is legal in usage\.transcript\.path/.test(issue.message))).toHaveLength(1);
  });

  it('{home} anywhere but the first segment of the path is refused', () => {
    const manifest = withTranscript();
    manifest.usage.transcript.path = '/data/{home}/{session_id}.jsonl';
    expect(at(issuesOf(manifest), 'usage.transcript.path').length).toBeGreaterThan(0);
  });

  it('a placeholder that fills part of a segment is refused; {session_id}.<ext> as the last segment is legal', () => {
    const manifest = withTranscript();
    manifest.usage.transcript.path = '{home}/.fake-agent/x-{launch_dir_slug}/{session_id}.jsonl';
    expect(at(issuesOf(manifest), 'usage.transcript.path').length).toBeGreaterThan(0);
    const extension = withTranscript();
    extension.usage.transcript.path = '{home}/{launch_dir_slug}/{session_id}.jsonl';
    expect(issuesOf(extension)).toEqual([]);
  });

  it('{session_id} in the path under session.id: none is refused', () => {
    const manifest = withTranscript();
    manifest.session = { id: 'none', resume: { supported: false } };
    expect(at(issuesOf(manifest), 'usage.transcript.path').length).toBeGreaterThan(0);
  });
});
