/**
 * task-337 AC 1 (red-first; `spec-016` §2.2, §2.6 the usage sources, §2.7 and §2.8, as amended at `2d193b318`;
 * `dl-188` part 1 (c); approver rulings D4, D5, D6 (a), D12; BDD `P5.3.1-agent-execute.feature` "A run's token counts
 * are read from the agent's session transcript" and "A headless run with no transcript takes its counts from its result
 * document") — on the compiled CLI with the fake agent and no terminal.
 *
 * The fixture is `seed()` with a custom adapter derived inline from the fake's (`manifest(name, …)`; `fake.yaml` itself
 * is unchanged): `fake-usage` replaces its `usage` block with `from: [transcript, output]`, the transcript at
 * `{home}/.fake-agent/projects/{launch_dir_slug}/{session_id}.jsonl` with `claude-code`'s message paths, and the
 * headless result's four counts (`claude-code`'s `usage.fields`, no model path); the fake keeps `launch.headless.output:
 * json`. `HOME` is a temporary directory in the CLI's environment only, which the agent inherits; the fake writes the
 * transcript there under `WINGFOIL_FAKE_AGENT_TRANSCRIPT` (`test/fixtures/agents/transcripts/two-messages.jsonl`, shaped
 * from the H1/H2 checks of the task's design gate note) and prints `WINGFOIL_FAKE_AGENT_DOCUMENT` as its headless result.
 *
 * - (a) interactive, with a transcript → the record's `tokens` are its sums, `model` its model; nothing of the home
 *   directory or the transcript's path is printed;
 * - (b) `--headless`, no transcript, a result document carrying `usage` → the document's counts, `model`
 *   `not-reported`; one `usage.transcript` warning, naming no path;
 * - (c) interactive, neither → every count `not-reported`, never `0`;
 * - (d) `--headless`, both → the transcript's (the transcript is read first, D4).
 *
 * Expected red: today's strict schema refuses `fake-usage` (`usage.from` a list, the `usage.transcript` key), so every
 * case fails on its exit code before any launch.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { DNA_YAML, manifest, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { errorLine, execute, records, removeRunScratch, warningLines, type AgentRun } from './helpers/agent-execute-cli';

const TRANSCRIPT = join(__dirname, '..', 'fixtures', 'agents', 'transcripts', 'two-messages.jsonl');
const RUN_1 = `${TASK_ID}/adhoc/1`;

/** The usage block of `fake-usage`. */
const USAGE = `usage:
  from: [ transcript, output ]
  fields:
    input: usage.input_tokens
    output: usage.output_tokens
    cache_read: usage.cache_read_input_tokens
    cache_write: usage.cache_creation_input_tokens
  transcript:
    path: "{home}/.fake-agent/projects/{launch_dir_slug}/{session_id}.jsonl"
    select: { field: type, equals: assistant }
    message_id: message.id
    fields:
      model: message.model
      input: message.usage.input_tokens
      output: message.usage.output_tokens
      cache_read: message.usage.cache_read_input_tokens
      cache_write: message.usage.cache_creation_input_tokens
`;

/** `fake.yaml` with its `usage` block replaced by {@link USAGE}. */
const WITH_USAGE = (text: string): string => {
  const replaced = text.replace(/^usage:\n(?: {2}[^\n]*\n)+/m, USAGE);
  if (replaced === text) throw new Error('fixture: fake.yaml has no usage block to replace');
  return replaced;
};

/** The result document of a headless run (`claude-code`'s `--output-format json` shape, H2: `usage` with the four keys). */
const DOCUMENT = JSON.stringify({ type: 'result', usage: { input_tokens: 7, output_tokens: 8, cache_read_input_tokens: 9, cache_creation_input_tokens: 10 } });

const repos: string[] = [];
const cleanup: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const root of repos.splice(0)) removeTempDir(root);
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(): string {
  const root = seed((dir) => {
    writeFixtureFile(dir, '.wingfoil/agents/custom/fake-usage.yaml', manifest('fake-usage', WITH_USAGE));
    writeFixtureFile(dir, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: fake-usage'));
  });
  repos.push(root);
  return root;
}

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-337-home-'));
  cleanup.push(dir);
  return dir;
}

const run1 = (root: string): Record<string, unknown> | undefined => records(root, TASK_ID).find((record) => record['id'] === RUN_1);
const usageWarnings = (run: AgentRun): string[] => warningLines(run.stderr).filter((line) => line.includes('usage.transcript'));
const NONE = { input: 'not-reported', output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' };

describe('task-337 AC 1 — the run record reads its usage from the transcript, then the headless result (spec-016 §2.6)', () => {
  it('(a) interactive, with a transcript: the sums of its two messages and its model; no path printed', () => {
    const root = repo();
    const dir = home();
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer'], { HOME: dir, WINGFOIL_FAKE_AGENT_TRANSCRIPT: TRANSCRIPT });
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ model: 'claude-opus-5-5', tokens: { input: 4, output: 73, cache_read: 36139, cache_write: 9580 } });
    expect(usageWarnings(run)).toEqual([]);
    expect(run.stderr).not.toContain(dir);
    expect(run.stdout).not.toContain(dir);
  });

  it('(b) --headless, no transcript: the result document\'s counts, model not-reported, one usage.transcript warning naming no path', () => {
    const root = repo();
    const dir = home();
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer', '--headless'], { HOME: dir, WINGFOIL_FAKE_AGENT_DOCUMENT: DOCUMENT });
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ model: 'not-reported', tokens: { input: 7, output: 8, cache_read: 9, cache_write: 10 } });
    const warnings = usageWarnings(run);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^warning: adapter 'fake-usage': usage\.transcript: .*absent/);
    expect(warnings[0]).not.toContain(dir);
  });

  it('(c) interactive, neither a transcript nor a result: every count not-reported, never 0', () => {
    const root = repo();
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer'], { HOME: home() });
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ model: 'not-reported', tokens: NONE });
  });

  it('(d) --headless, both: the transcript\'s values, read first (D4)', () => {
    const root = repo();
    const run = execute(root, ['--element', TASK_REF, '--role', 'developer', '--headless'], {
      HOME: home(),
      WINGFOIL_FAKE_AGENT_TRANSCRIPT: TRANSCRIPT,
      WINGFOIL_FAKE_AGENT_DOCUMENT: DOCUMENT,
    });
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(run1(root)).toMatchObject({ model: 'claude-opus-5-5', tokens: { input: 4, output: 73, cache_read: 36139, cache_write: 9580 } });
  });
});
