/**
 * task-336 AC 1 and AC 3 (red-first) — a headless run's output on the compiled CLI (`spec-016` §3.3 steps 14 and 16,
 * §3.5 as amended at the design gate; `dl-182` Q1 (a), Q3 (a); approver rulings D1 (a), D11), with the fake adapter
 * (`seed()` of `test/agent/helpers/agent-execute-fixture.ts`) writing declared lines on both streams
 * (`WINGFOIL_FAKE_AGENT_SAY`), then its headless JSON document (`launch.headless.output: json`).
 *
 * - AC 1, `--format console`: every line of both streams on `agent execute`'s stderr, verbatim, followed by a newline,
 *   each stream in its own order (how the two interleave is the order the pipes deliver: no cross-stream order is
 *   pinned); a last line written without a newline arrives with one; the fake's headless document is itself forwarded;
 *   the banner notice precedes every forwarded line and the summary notice follows every one.
 * - AC 1, `--format json`: stdout exactly `{ "run": <the committed record> }`; every stderr line one JSON document, each
 *   forwarded line exactly `{"output":"<line>","stream":"stdout"|"stderr"}`, keys in that order.
 * - AC 3: a marker the fake writes on both streams reaches stderr (the positive case) and nothing else: not the commit
 *   history (`git log -p --all`), not any file of the repository (`git grep --no-index`), not the run record; after the
 *   run `git status --porcelain --ignored --untracked-files=all` is empty and `.wingfoil/run/` holds no file.
 *
 * Today the agent's stderr is inherited (its lines reach stderr raw, also under `json`) and its stdout drained, so the
 * stdout lines are nowhere.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { execute, records, removeRunScratch, type AgentRun } from './helpers/agent-execute-cli';

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

const RUN_1 = `${TASK_ID}/adhoc/1`;
const MARKER = 'WF336-OUTPUT-MARKER';

/** What the fake says, in order: stdout and stderr lines, the stderr one last without a newline. */
const SAY: [string, string][] = [
  ['out', 'fake out line 1\n'],
  ['err', 'fake err line 1\n'],
  ['out', `fake out ${MARKER}\n`],
  ['err', `fake err ${MARKER}\n`],
  ['out', 'fake out line 3\n'],
  ['err', 'fake err last, no newline'],
];
const STDOUT_LINES = ['fake out line 1', `fake out ${MARKER}`, 'fake out line 3'];
const STDERR_LINES = ['fake err line 1', `fake err ${MARKER}`, 'fake err last, no newline'];

/** The fake's default headless document (`fake-agent.cjs` `defaultDocument`) for the run's assigned session id. */
const DOCUMENT_LINE = /^\{"session_id":"[^"]+","model":"fake-model","usage":\{"input":120,"output":45,"cache_read":10,"cache_write":5\}\}$/;

const BANNER = new RegExp(`^run ${RUN_1}: launching Fake Agent \\(custom/fake\\) as developer on ${TASK_REF}$`);
const SUMMARY = new RegExp(`^run ${RUN_1}: agent exited 0 after \\d+\\.\\d s \\(recorded in [0-9a-f]{7}\\)$`);

function fixture(): string {
  const repo = seed();
  repos.push(repo);
  return repo;
}

function headless(repo: string, format: 'console' | 'json'): AgentRun {
  return execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless', '--format', format], { WINGFOIL_FAKE_AGENT_SAY: JSON.stringify(SAY) });
}

/** The positions of `line` among `lines` (exact matches). */
const positions = (lines: readonly string[], line: string): number[] => lines.flatMap((candidate, index) => (candidate === line ? [index] : []));

describe('task-336 AC 1 — --format console: the agent output on stderr, line by line (spec-016 §3.5)', () => {
  let run: AgentRun;
  let lines: string[];
  beforeAll(() => {
    run = headless(fixture(), 'console');
    lines = run.stderr.split('\n');
  });

  it('exits 0, and stderr ends with a newline', () => {
    expect(run.status).toBe(0);
    expect(run.stderr.endsWith('\n')).toBe(true);
  });

  it("every line of the agent's stdout and stderr appears once, verbatim, each stream in its own order", () => {
    for (const line of [...STDOUT_LINES, ...STDERR_LINES]) expect([line, positions(lines, line).length]).toEqual([line, 1]);
    const stdoutAt = STDOUT_LINES.map((line) => positions(lines, line)[0]!);
    const stderrAt = STDERR_LINES.map((line) => positions(lines, line)[0]!);
    expect([...stdoutAt].sort((a, b) => a - b)).toEqual(stdoutAt);
    expect([...stderrAt].sort((a, b) => a - b)).toEqual(stderrAt);
  });

  it('the headless JSON document the agent prints on stdout is forwarded too, after its stdout lines', () => {
    const at = lines.flatMap((line, index) => (DOCUMENT_LINE.test(line) ? [index] : []));
    expect(at).toHaveLength(1);
    expect(at[0]!).toBeGreaterThan(positions(lines, STDOUT_LINES[2]!)[0]!);
  });

  it('the banner notice precedes every forwarded line and the summary notice follows every one', () => {
    const banner = lines.findIndex((line) => BANNER.test(line));
    const summary = lines.findIndex((line) => SUMMARY.test(line));
    expect(banner).toBeGreaterThanOrEqual(0);
    expect(summary).toBeGreaterThan(banner);
    const forwarded = [...STDOUT_LINES, ...STDERR_LINES].map((line) => positions(lines, line)[0]);
    for (const at of forwarded) {
      expect(at).toBeGreaterThan(banner);
      expect(at).toBeLessThan(summary);
    }
  });
});

describe('task-336 AC 1 — --format json: stdout the record, stderr one document per line (spec-016 §3.5; spec-005 §3.2)', () => {
  let repo: string;
  let run: AgentRun;
  let lines: string[];
  beforeAll(() => {
    repo = fixture();
    run = headless(repo, 'json');
    lines = run.stderr.split('\n').filter((line) => line !== '');
  });

  it('exits 0; stdout is exactly { "run": <the committed record> }', () => {
    expect(run.status).toBe(0);
    const committed = records(repo, TASK_ID);
    expect(committed).toEqual([expect.objectContaining({ id: RUN_1, exit_status: 0, result: 'n/a' })]);
    expect(JSON.parse(run.stdout)).toEqual({ run: committed[0] });
  });

  it('every stderr line is one JSON document', () => {
    const unparsable = lines.filter((line) => {
      try {
        JSON.parse(line);
        return false;
      } catch {
        return true;
      }
    });
    expect(unparsable).toEqual([]);
  });

  it('each forwarded line is exactly {"output":"<line>","stream":"stdout"|"stderr"}, each stream in its own order', () => {
    const outputs = lines.filter((line) => line.startsWith('{"output":'));
    expect(outputs.filter((line) => line.endsWith('"stream":"stdout"}')).slice(0, 3)).toEqual(STDOUT_LINES.map((line) => JSON.stringify({ output: line, stream: 'stdout' })));
    expect(outputs.filter((line) => line.endsWith('"stream":"stderr"}'))).toEqual(STDERR_LINES.map((line) => JSON.stringify({ output: line, stream: 'stderr' })));
  });

  it('the headless JSON document is forwarded as the last stream: stdout line', () => {
    const stdoutOutputs = lines.filter((line) => line.startsWith('{"output":') && line.endsWith('"stream":"stdout"}'));
    expect(stdoutOutputs).toHaveLength(4);
    const document = JSON.parse(stdoutOutputs[3]!) as { output: string; stream: string };
    expect(Object.keys(document)).toEqual(['output', 'stream']);
    expect(document.output).toMatch(DOCUMENT_LINE);
  });

  it('the notices are still the banner then the summary, around every forwarded line', () => {
    // Only the lines that parse: whether every line does is the test above's.
    const documents = lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
    const notices = documents.flatMap((document, index) => ('notice' in document ? [[index, document['notice']] as const] : []));
    expect(notices.map(([, notice]) => notice)).toEqual([expect.stringMatching(BANNER), expect.stringMatching(SUMMARY)]);
    const outputAt = documents.flatMap((document, index) => ('output' in document ? [index] : []));
    expect(outputAt.length).toBe(7);
    for (const at of outputAt) {
      expect(at).toBeGreaterThan(notices[0]![0]);
      expect(at).toBeLessThan(notices[1]![0]);
    }
  });
});

describe('task-336 AC 3 — nothing of the output is kept (dl-182 Q3 (a); spec-016 §3.5)', () => {
  let repo: string;
  let run: AgentRun;
  beforeAll(() => {
    repo = fixture();
    run = headless(repo, 'console');
  });

  it('the marker reaches stderr from both streams (the positive case)', () => {
    expect(run.status).toBe(0);
    const lines = run.stderr.split('\n');
    expect(positions(lines, `fake out ${MARKER}`)).toHaveLength(1);
    expect(positions(lines, `fake err ${MARKER}`)).toHaveLength(1);
  });

  it('the marker is in no commit, no file of the repository and not in the run record', () => {
    expect(git(repo, ['log', '-p', '--all'])).not.toContain(MARKER);
    const grep = spawnSync('git', ['grep', '--no-index', '-l', MARKER], { cwd: repo, encoding: 'utf-8' });
    expect([grep.status, grep.stdout]).toEqual([1, '']);
    expect(JSON.stringify(records(repo, TASK_ID))).not.toContain(MARKER);
  });

  it('the working tree is clean, ignored files included, and .wingfoil/run/ holds no file', () => {
    expect(git(repo, ['status', '--porcelain', '--ignored', '--untracked-files=all'])).toBe('');
    const dir = join(repo, '.wingfoil', 'run');
    const files: string[] = [];
    const walk = (path: string): void => {
      if (!existsSync(path)) return;
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(path, entry.name));
        else files.push(join(path, entry.name));
      }
    };
    walk(dir);
    expect(files).toEqual([]);
  });
});
