/**
 * The run-log library (task-206, `spec-016` §4.1–§4.5, `dl-114` Q1 (A) / Q2 (b) / Q3 (i), `dl-135`
 * point 2 / Q2 (c) / Q3 (a), `dl-111`): the 18-key record in its fixed order, the run id counted at
 * `state_ref`, the strict reader, the `agent: record <run-id>` commit, the collision rule, the failed
 * commit, and the `notes` field. `agent execute` (task-228), `agent list` (task-240) and `agent show`
 * (task-220) are its callers; none of them exists yet, so every case drives the library directly over
 * a scratch repository.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  ADHOC_PHASE,
  deriveNotesField,
  executionNotesSection,
  formatRunId,
  isRunId,
  nextRunId,
  NO_WORKFLOW,
  NOT_REPORTED,
  notesField,
  parseRunLog,
  readRunLogAt,
  recordRun,
  resolveRunLogPath,
  RUN_RECORD_KEYS,
  runLogPreflight,
  RUN_TOKEN_KEYS,
  serializeRunRecord,
  type RunRecord,
} from '../../src/agent';
import { errorDetails } from '../../src/core/error-details';
import { captureDryRun } from '../../src/storage';
import { getMemoryHistory } from '../../src/memory/history';
import { parseMemoryOperation } from '../../src/memory/audit';
import { cloneTempRepo, commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

const ELEMENT_ID = 'task-001-demo';
const ELEMENT = `task:${ELEMENT_ID}`;
const LOG = `docs/runs/${ELEMENT_ID}.jsonl`;
const SHA = 'a'.repeat(40);

/** The §4.2 key 16 defect (bug-288: an exit code is 0–255). */
const EXIT_STATUS_DEFECT = "'exit_status' must be an integer from 0 to 255 or \"signal:<NAME>\"";

/** A complete, valid record; `overrides` replaces whole fields. */
function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: `${ELEMENT_ID}/design/1`,
    element: ELEMENT,
    workflow: 'dev-loop',
    phase: 'design',
    role: 'architect',
    mode: 'fresh',
    agent: 'claude',
    adapter: 'custom/fake',
    agent_version: NOT_REPORTED,
    model: NOT_REPORTED,
    session: NOT_REPORTED,
    tokens: { input: 10, output: NOT_REPORTED, cache_read: 0, cache_write: NOT_REPORTED },
    wingfoil: '0.3.0 (unknown)',
    state_ref: SHA,
    duration_ms: 1234,
    exit_status: 0,
    result: 'n/a',
    notes: 'none',
    ...overrides,
  };
}

/** One serialized line, without its terminator, for building log text by hand. */
const line = (overrides: Partial<RunRecord> = {}): string => serializeRunRecord(record(overrides)).replace(/\n$/, '');

/** The record as a plain object, keys in §4.2 order, for mutating into an invalid line. */
const asObject = (): Record<string, unknown> => JSON.parse(line()) as Record<string, unknown>;

/** `object` without `key`, the other keys in their order. */
const without = <T extends object>(object: T, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

describe('run record serialization (spec-016 §4.2)', () => {
  it('declares the 18 keys in §4.2 order and the four token keys', () => {
    expect(RUN_RECORD_KEYS).toEqual([
      'id', 'element', 'workflow', 'phase', 'role', 'mode', 'agent', 'adapter', 'agent_version', 'model',
      'session', 'tokens', 'wingfoil', 'state_ref', 'duration_ms', 'exit_status', 'result', 'notes',
    ]);
    expect(RUN_TOKEN_KEYS).toEqual(['input', 'output', 'cache_read', 'cache_write']);
    expect(NOT_REPORTED).toBe('not-reported');
  });

  it('writes one LF-terminated line, keys in order, no insignificant whitespace', () => {
    const text = serializeRunRecord(record());
    expect(text.endsWith('\n')).toBe(true);
    expect(text.slice(0, -1)).not.toMatch(/\n/);
    expect(text).toBe(
      `{"id":"${ELEMENT_ID}/design/1","element":"${ELEMENT}","workflow":"dev-loop","phase":"design","role":"architect",` +
        '"mode":"fresh","agent":"claude","adapter":"custom/fake","agent_version":"not-reported","model":"not-reported",' +
        '"session":"not-reported","tokens":{"input":10,"output":"not-reported","cache_read":0,"cache_write":"not-reported"},' +
        `"wingfoil":"0.3.0 (unknown)","state_ref":"${SHA}","duration_ms":1234,"exit_status":0,"result":"n/a","notes":"none"}\n`,
    );
  });

  it('writes the fixed order whatever order the caller built the object in', () => {
    const shuffled = Object.fromEntries(Object.entries(record()).reverse()) as unknown as RunRecord;
    const tokens = { cache_write: 1, cache_read: 2, output: 3, input: 4 };
    expect(serializeRunRecord({ ...shuffled, tokens })).toBe(
      serializeRunRecord(record({ tokens: { input: 4, output: 3, cache_read: 2, cache_write: 1 } })),
    );
  });

  it('a run with no step is workflow n/a and phase adhoc', () => {
    expect(NO_WORKFLOW).toBe('n/a');
    expect(ADHOC_PHASE).toBe('adhoc');
    const adhoc = record({ id: `${ELEMENT_ID}/adhoc/1`, workflow: NO_WORKFLOW, phase: ADHOC_PHASE });
    expect(serializeRunRecord(adhoc)).toContain('"workflow":"n/a","phase":"adhoc"');
  });

  it('never writes 0 or null for an unreported value: null and absent fields are refused', () => {
    const withNull = { ...record(), model: null } as unknown as RunRecord;
    expect(() => serializeRunRecord(withNull)).toThrow(/'model' must be a string/);
    const tokensNull = record({ tokens: { input: null, output: 1, cache_read: 1, cache_write: 1 } as unknown as RunRecord['tokens'] });
    expect(() => serializeRunRecord(tokensNull)).toThrow(/'tokens\.input' must be a non-negative integer or "not-reported"/);
    expect(() => serializeRunRecord(without(record(), 'session') as unknown as RunRecord)).toThrow(/missing key 'session'/);
  });

  it('records a signal exit as signal:<NAME>', () => {
    expect(serializeRunRecord(record({ exit_status: 'signal:SIGINT' }))).toContain('"exit_status":"signal:SIGINT"');
    expect(() => serializeRunRecord(record({ exit_status: 'killed' }))).toThrow(/'exit_status'/);
  });
});

describe('run id (spec-016 §4.3)', () => {
  it('is <element-id>/<phase>/<n>', () => {
    expect(formatRunId(ELEMENT_ID, 'design', 3)).toBe(`${ELEMENT_ID}/design/3`);
    expect(formatRunId(ELEMENT_ID, ADHOC_PHASE, 1)).toBe(`${ELEMENT_ID}/adhoc/1`);
  });

  it.each([
    [`${ELEMENT_ID}/design/1`, true],
    [`${ELEMENT_ID}/red-2/12`, true],
    [`${ELEMENT_ID}/design/0`, false],
    [`${ELEMENT_ID}/design/01`, false],
    [`${ELEMENT_ID}/Design/1`, false],
    [`${ELEMENT_ID}/2design/1`, false],
    [`${ELEMENT_ID}/des.ign/1`, false],
    [`${ELEMENT_ID}/design`, false],
    [`${ELEMENT_ID}/design/1/2`, false],
    [`other-element/design/1`, false],
    [`${ELEMENT_ID}x/design/1`, false],
  ])('%s matches ^<element-id>/[a-z][a-z0-9-]*/[1-9][0-9]*$: %s', (id, valid) => {
    expect(isRunId(id, ELEMENT_ID)).toBe(valid);
  });

  it('refuses to format a malformed id', () => {
    expect(() => formatRunId(ELEMENT_ID, 'Design', 1)).toThrow(/not a run id/);
    expect(() => formatRunId(ELEMENT_ID, 'design', 0)).toThrow(/not a run id/);
    expect(() => formatRunId('Bad/Id', 'design', 1)).toThrow(/not a run id/);
  });

  describe('n counted at state_ref', () => {
    let repo: string;
    let clone: string | undefined;

    beforeEach(() => {
      repo = makeTempGitRepo();
      clone = undefined;
    });

    afterEach(() => {
      removeTempDir(repo);
      if (clone !== undefined) removeTempDir(clone);
    });

    it('is 1 when the log does not exist at state_ref', () => {
      writeFixtureFile(repo, 'README.md', 'x\n');
      commitAll(repo, 'init');
      const stateRef = git(repo, ['rev-parse', 'HEAD']).trim();
      expect(nextRunId(repo, { logPath: LOG, element: ELEMENT, phase: 'design', stateRef })).toEqual({ ok: true, value: `${ELEMENT_ID}/design/1` });
    });

    it('is 1 + the matching (element, phase) records at state_ref, whatever the workflow, ignoring later commits and the working tree', () => {
      const lines = [
        line({ id: `${ELEMENT_ID}/design/1` }),
        line({ id: `${ELEMENT_ID}/red/1`, phase: 'red' }),
        line({ id: `${ELEMENT_ID}/design/2`, workflow: 'other-flow' }),
      ];
      writeFixtureFile(repo, LOG, `${lines.join('\n')}\n`);
      commitAll(repo, 'runs');
      const stateRef = git(repo, ['rev-parse', 'HEAD']).trim();
      writeFixtureFile(repo, LOG, `${[...lines, line({ id: `${ELEMENT_ID}/design/3` })].join('\n')}\n`);
      commitAll(repo, 'later run');
      writeFixtureFile(repo, LOG, 'not json\n');

      expect(nextRunId(repo, { logPath: LOG, element: ELEMENT, phase: 'design', stateRef })).toEqual({ ok: true, value: `${ELEMENT_ID}/design/3` });
      expect(nextRunId(repo, { logPath: LOG, element: ELEMENT, phase: 'red', stateRef })).toEqual({ ok: true, value: `${ELEMENT_ID}/red/2` });
      expect(nextRunId(repo, { logPath: LOG, element: ELEMENT, phase: ADHOC_PHASE, stateRef })).toEqual({ ok: true, value: `${ELEMENT_ID}/adhoc/1` });
    });

    it('is the same in two clones of the same history', () => {
      writeFixtureFile(repo, LOG, `${line()}\n`);
      commitAll(repo, 'runs');
      const stateRef = git(repo, ['rev-parse', 'HEAD']).trim();
      clone = cloneTempRepo(repo);
      const args = { logPath: LOG, element: ELEMENT, phase: 'design', stateRef };
      expect(nextRunId(clone, args)).toEqual(nextRunId(repo, args));
      expect(nextRunId(clone, args)).toEqual({ ok: true, value: `${ELEMENT_ID}/design/2` });
    });

    it('refuses a log at state_ref that the strict reader refuses', () => {
      writeFixtureFile(repo, LOG, '{"id":1}\n');
      commitAll(repo, 'bad log');
      const stateRef = git(repo, ['rev-parse', 'HEAD']).trim();
      const result = nextRunId(repo, { logPath: LOG, element: ELEMENT, phase: 'design', stateRef });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    });
  });
});

describe('strict reader (spec-016 §4.5)', () => {
  const refusal = (text: string, path = LOG): { code: string; message: string } => {
    const result = parseRunLog(text, path);
    if (result.ok) throw new Error('expected a refusal');
    return { code: result.error.code, message: result.error.message };
  };
  const invalid = (k: number, detail: string): { code: string; message: string } => ({
    code: 'VALIDATION',
    message: `run log ${LOG}: line ${k} is not a valid run record: ${detail}`,
  });

  it('reads a valid log in line order', () => {
    const text = `${line()}\n${line({ id: `${ELEMENT_ID}/design/2`, exit_status: 'signal:SIGTERM' })}\n`;
    const result = parseRunLog(text, LOG);
    expect(result).toEqual({ ok: true, value: [record(), record({ id: `${ELEMENT_ID}/design/2`, exit_status: 'signal:SIGTERM' })] });
  });

  it('reads an empty log as no records', () => {
    expect(parseRunLog('', LOG)).toEqual({ ok: true, value: [] });
  });

  it('refuses non-JSON', () => {
    expect(refusal(`${line()}\nnot json\n`)).toEqual(invalid(2, 'not JSON'));
    expect(refusal('\n')).toEqual(invalid(1, 'not JSON'));
  });

  it('refuses a line that is JSON but not an object', () => {
    expect(refusal('[1,2]\n')).toEqual(invalid(1, 'not a JSON object'));
    expect(refusal('null\n')).toEqual(invalid(1, 'not a JSON object'));
  });

  it('refuses a missing key', () => {
    expect(refusal(`${JSON.stringify(without(asObject(), 'notes'))}\n`)).toEqual(invalid(1, "missing key 'notes'"));
  });

  it('refuses an extra key', () => {
    expect(refusal(`${JSON.stringify({ ...asObject(), cost: 1 })}\n`)).toEqual(invalid(1, "unexpected key 'cost'"));
  });

  it('refuses an out-of-order key', () => {
    const { id, element, ...rest } = asObject();
    expect(refusal(`${JSON.stringify({ element, id, ...rest })}\n`)).toEqual(
      invalid(1, "key 'element' out of order: expected 'id' at position 1"),
    );
  });

  it('refuses an extra or missing token key, and tokens out of order', () => {
    const base = asObject();
    expect(refusal(`${JSON.stringify({ ...base, tokens: { input: 1, output: 1, cache_read: 1 } })}\n`)).toEqual(
      invalid(1, "missing key 'tokens.cache_write'"),
    );
    expect(refusal(`${JSON.stringify({ ...base, tokens: { input: 1, output: 1, cache_read: 1, cache_write: 1, total: 4 } })}\n`)).toEqual(
      invalid(1, "unexpected key 'tokens.total'"),
    );
    expect(refusal(`${JSON.stringify({ ...base, tokens: { output: 1, input: 1, cache_read: 1, cache_write: 1 } })}\n`)).toEqual(
      invalid(1, "key 'tokens.output' out of order: expected 'tokens.input' at position 1"),
    );
  });

  it.each<[string, unknown, string]>([
    ['model', null, "'model' must be a string"],
    ['role', 3, "'role' must be a string"],
    ['tokens', 'not-reported', "'tokens' must be an object"],
    ['duration_ms', 1.5, "'duration_ms' must be a non-negative integer"],
    ['duration_ms', -1, "'duration_ms' must be a non-negative integer"],
    ['exit_status', 'oops', EXIT_STATUS_DEFECT],
    ['exit_status', 1.5, EXIT_STATUS_DEFECT],
    // bug-288: a process exit code is 0–255; a negative or larger integer is no exit code.
    ['exit_status', -1, EXIT_STATUS_DEFECT],
    ['exit_status', 256, EXIT_STATUS_DEFECT],
  ])('refuses a wrong type: %s = %j', (key, value, detail) => {
    expect(refusal(`${JSON.stringify({ ...asObject(), [key]: value })}\n`)).toEqual(invalid(1, detail));
  });

  it.each<[unknown, string]>([
    [0.5, "'tokens.input' must be a non-negative integer or \"not-reported\""],
    [null, "'tokens.input' must be a non-negative integer or \"not-reported\""],
    ['0', "'tokens.input' must be a non-negative integer or \"not-reported\""],
  ])('refuses a wrong token value: %j', (value, detail) => {
    const base = asObject();
    const tokens = { ...(base.tokens as object), input: value };
    expect(refusal(`${JSON.stringify({ ...base, tokens })}\n`)).toEqual(invalid(1, detail));
  });

  it('refuses an id whose element segment is not the file basename', () => {
    const other = JSON.stringify({ ...asObject(), id: 'task-002-other/design/1', element: 'task:task-002-other' });
    expect(refusal(`${other}\n`)).toEqual(invalid(1, `'id' 'task-002-other/design/1' is not a run id of element '${ELEMENT_ID}' (the file's basename)`));
  });

  it('refuses an id that disagrees with its own element or phase (F6)', () => {
    expect(refusal(`${JSON.stringify({ ...asObject(), phase: 'red' })}\n`)).toEqual(
      invalid(1, `'id' '${ELEMENT_ID}/design/1' does not match element '${ELEMENT}' and phase 'red'`),
    );
    expect(refusal(`${JSON.stringify({ ...asObject(), element: 'task:task-002-other' })}\n`)).toEqual(
      invalid(1, `'id' '${ELEMENT_ID}/design/1' does not match element 'task:task-002-other' and phase 'design'`),
    );
    expect(refusal(`${JSON.stringify({ ...asObject(), element: ELEMENT_ID })}\n`)).toEqual(invalid(1, "'element' must be <type>:<id>"));
  });

  it('refuses a malformed id', () => {
    expect(refusal(`${JSON.stringify({ ...asObject(), id: `${ELEMENT_ID}/design/0` })}\n`)).toEqual(
      invalid(1, `'id' '${ELEMENT_ID}/design/0' is not a run id of element '${ELEMENT_ID}' (the file's basename)`),
    );
  });

  it('refuses a duplicate id', () => {
    expect(refusal(`${line()}\n${line()}\n`)).toEqual({ code: 'VALIDATION', message: `run log ${LOG}: run id ${ELEMENT_ID}/design/1 recorded twice` });
  });

  it('refuses a last line with no newline, since an append would corrupt it', () => {
    expect(refusal(line())).toEqual(invalid(1, 'not terminated by a newline'));
  });

  it('reads at a revision, an absent log being no records', () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, LOG, `${line()}\n`);
      commitAll(repo, 'one run');
      expect(readRunLogAt(repo, 'HEAD', LOG)).toEqual({ ok: true, value: [record()] });
      expect(readRunLogAt(repo, 'HEAD', 'docs/runs/task-404.jsonl')).toEqual({ ok: true, value: [] });
      const unknownRev = readRunLogAt(repo, 'no-such-branch', LOG);
      expect(unknownRev.ok).toBe(false);
      if (!unknownRev.ok) expect(unknownRev.error.code).toBe('NOT_FOUND');
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('run-log location (spec-016 §4.1)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => removeTempDir(repo));

  it('is <runs>/<element-id>.jsonl, joined as a path whatever the trailing slash', () => {
    expect(resolveRunLogPath(repo, ['docs/runs/'], ELEMENT_ID)).toEqual({ ok: true, value: LOG });
    expect(resolveRunLogPath(repo, ['docs/runs'], ELEMENT_ID)).toEqual({ ok: true, value: LOG });
    expect(resolveRunLogPath(repo, ['./docs//runs/'], ELEMENT_ID)).toEqual({ ok: true, value: LOG });
    expect(resolveRunLogPath(repo, [join(repo, 'docs', 'runs')], ELEMENT_ID)).toEqual({ ok: true, value: LOG });
  });

  it('refuses a dna.yaml that declares no run log', () => {
    for (const runs of [undefined, [], [''], ['  ']]) {
      expect(resolveRunLogPath(repo, runs, ELEMENT_ID)).toEqual({
        ok: false,
        error: { code: 'VALIDATION', message: 'dna.yaml declares no run log (paths.runs)' },
      });
    }
  });

  it('confines the run log to the project root (REQ-SEC-06)', () => {
    for (const runs of [['../outside/'], ['/tmp/wf-runs/'], ['docs/../../x/']]) {
      const result = resolveRunLogPath(repo, runs, ELEMENT_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toMatch(/^cannot write '.*': it resolves to '.*', outside the project root/);
        expect(result.error.message).not.toMatch(/Memory/);
      }
    }
  });

  it('refuses an element id that is not an id', () => {
    const result = resolveRunLogPath(repo, ['docs/runs/'], '../escape');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});

describe('recording a run (spec-016 §4.3 collision, §4.4 commit, §3.7)', () => {
  let repo: string;
  let head: string;

  const show = (args: string[]): string => git(repo, args);

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'src/app.ts', 'export const a = 1;\n');
    writeFixtureFile(repo, 'docs/04_memory/task.md', '---\nid: x\n---\n');
    commitAll(repo, 'init');
    head = show(['rev-parse', 'HEAD']).trim();
  });

  afterEach(() => removeTempDir(repo));

  it('commits exactly the run-log file as `agent: record <run-id>` with the WingFoil-Version trailer, leaving the agent’s edits untouched', () => {
    writeFixtureFile(repo, 'src/app.ts', 'export const a = 2;\n'); // agent edit, unstaged
    writeFixtureFile(repo, 'docs/04_memory/task.md', '---\nid: y\n---\n');
    git(repo, ['add', 'docs/04_memory/task.md']); // agent edit, staged
    writeFixtureFile(repo, 'scratch.txt', 'new\n'); // untracked
    const before = show(['status', '--porcelain']);

    const result = recordRun(repo, LOG, record({ state_ref: head }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sha = show(['rev-parse', 'HEAD']).trim();
    expect(result.commit).toEqual({ sha, message: `agent: record ${ELEMENT_ID}/design/1` });
    expect(result.value).toEqual({ record: record({ state_ref: head }), sha });

    expect(show(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).trim().split('\n')).toEqual([LOG]);
    expect(show(['log', '-1', '--format=%B', sha]).trimEnd()).toBe(`agent: record ${ELEMENT_ID}/design/1${STAMP_TRAILER}`);
    expect(show(['show', `${sha}:${LOG}`])).toBe(serializeRunRecord(record({ state_ref: head })));
    expect(show(['status', '--porcelain'])).toBe(before);
    expect(show(['diff', '--cached', '--name-only']).trim()).toBe('docs/04_memory/task.md');
  });

  it('appends to the log at HEAD', () => {
    writeFixtureFile(repo, LOG, `${line()}\n`);
    commitAll(repo, 'first run');
    const second = record({ id: `${ELEMENT_ID}/design/2` });
    const result = recordRun(repo, LOG, second);
    expect(result.ok).toBe(true);
    expect(show(['show', `HEAD:${LOG}`])).toBe(`${line()}\n${serializeRunRecord(second)}`);
    expect(readRunLogAt(repo, 'HEAD', LOG)).toEqual({ ok: true, value: [record(), second] });
  });

  it('is not a Memory operation: memory history does not report it', () => {
    const result = recordRun(repo, LOG, record());
    expect(result.ok).toBe(true);
    const subject = show(['log', '-1', '--format=%s']).trim();
    expect(subject).toBe(`agent: record ${ELEMENT_ID}/design/1`);
    expect(parseMemoryOperation(subject)).toBeNull();
    const sha = show(['rev-parse', 'HEAD']).trim();
    expect(getMemoryHistory(repo, 'docs/04_memory/task.md').map((entry) => entry.sha)).not.toContain(sha);
  });

  it('refuses a run id already recorded at HEAD: CONFLICT, nothing appended, the record as a details line', () => {
    writeFixtureFile(repo, LOG, `${line()}\n`);
    commitAll(repo, 'a parallel run recorded the same id');
    const before = show(['rev-parse', 'HEAD']).trim();
    const ours = record({ duration_ms: 99 });

    const result = recordRun(repo, LOG, ours);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toBe(`run id ${ELEMENT_ID}/design/1 already recorded at HEAD`);
    expect(errorDetails(result.error)).toEqual([{ detail: serializeRunRecord(ours).trimEnd() }]);
    expect(show(['rev-parse', 'HEAD']).trim()).toBe(before);
    expect(readFileSync(join(repo, LOG), 'utf-8')).toBe(`${line()}\n`);
    expect(show(['status', '--porcelain'])).toBe('');
  });

  it('a failed commit is IO `run <run-id> not recorded: <cause>`, with the record as a details line, and leaves nothing behind', () => {
    writeFixtureFile(repo, '.hooks/pre-commit', '#!/bin/sh\necho "hook says no" >&2\nexit 1\n');
    chmodSync(join(repo, '.hooks/pre-commit'), 0o755);
    commitAll(repo, 'hooks');
    git(repo, ['config', 'core.hooksPath', '.hooks']);
    const before = show(['rev-parse', 'HEAD']).trim();

    const result = recordRun(repo, LOG, record());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('IO');
    expect(result.error.message).toBe(`run ${ELEMENT_ID}/design/1 not recorded: hook says no`);
    expect(errorDetails(result.error)).toEqual([{ detail: line() }]);
    expect(show(['rev-parse', 'HEAD']).trim()).toBe(before);
    expect(existsSync(join(repo, LOG))).toBe(false);
    expect(existsSync(join(repo, 'docs', 'runs'))).toBe(false);
    expect(show(['status', '--porcelain'])).toBe('');
  });

  it('a refusing hook that prints the project root: the cause names no absolute path (review F2)', () => {
    writeFixtureFile(repo, '.hooks/pre-commit', '#!/bin/sh\necho "refused in $(pwd)/docs/runs" >&2\nexit 1\n');
    chmodSync(join(repo, '.hooks/pre-commit'), 0o755);
    commitAll(repo, 'hooks');
    git(repo, ['config', 'core.hooksPath', '.hooks']);

    const result = recordRun(repo, LOG, record());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('IO');
    expect(result.error.message).toBe(`run ${ELEMENT_ID}/design/1 not recorded: refused in docs/runs`);
    expect(result.error.message).not.toContain(repo);
    expect(result.error.message).not.toContain(realpathSync(repo));
    expect(errorDetails(result.error)).toEqual([{ detail: line() }]);
  });

  it('a stale index.lock: IO, no throw, no absolute path, the record kept, nothing left behind (review F1)', () => {
    writeFileSync(join(repo, '.git', 'index.lock'), '');
    const before = show(['rev-parse', 'HEAD']).trim();

    const result = recordRun(repo, LOG, record());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('IO');
    expect(result.error.message).toMatch(new RegExp(`^run ${ELEMENT_ID}/design/1 not recorded: .*index\\.lock`));
    expect(result.error.message).not.toContain(repo);
    expect(result.error.message).not.toContain(realpathSync(repo));
    expect(errorDetails(result.error)).toEqual([{ detail: line() }]);
    expect(show(['rev-parse', 'HEAD']).trim()).toBe(before);
    expect(existsSync(join(repo, 'docs', 'runs'))).toBe(false);
  });

  it('a filesystem failure on the write is IO with the record in details and no absolute path (re-review)', () => {
    mkdirSync(join(repo, 'docs', 'runs'), { recursive: true });
    chmodSync(join(repo, 'docs', 'runs'), 0o555);
    try {
      const before = show(['rev-parse', 'HEAD']).trim();
      const result = recordRun(repo, LOG, record());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('IO');
      expect(result.error.message).toMatch(new RegExp(`^run ${ELEMENT_ID}/design/1 not recorded: .*EACCES`));
      expect(result.error.message).toContain(LOG);
      expect(result.error.message).not.toContain(repo);
      expect(result.error.message).not.toContain(realpathSync(repo));
      expect(errorDetails(result.error)).toEqual([{ detail: line() }]);
      expect(show(['rev-parse', 'HEAD']).trim()).toBe(before);
    } finally {
      chmodSync(join(repo, 'docs', 'runs'), 0o755);
    }
  });

  it('under a dry run, plans the record commit and writes nothing (task-210)', async () => {
    const outcome = await captureDryRun(async () => recordRun(repo, LOG, record()));
    expect(outcome.kind).toBe('planned');
    if (outcome.kind === 'planned') {
      expect(outcome.plan.subject).toBe(`agent: record ${ELEMENT_ID}/design/1`);
      expect(outcome.plan.paths).toEqual([LOG]);
    }
    expect(existsSync(join(repo, 'docs', 'runs'))).toBe(false);
  });

  it('a failed commit restores a log that existed at HEAD', () => {
    writeFixtureFile(repo, LOG, `${line()}\n`);
    writeFixtureFile(repo, '.hooks/pre-commit', '#!/bin/sh\nexit 1\n');
    chmodSync(join(repo, '.hooks/pre-commit'), 0o755);
    commitAll(repo, 'hooks and a run');
    git(repo, ['config', 'core.hooksPath', '.hooks']);

    const result = recordRun(repo, LOG, record({ id: `${ELEMENT_ID}/design/2` }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(new RegExp(`^run ${ELEMENT_ID}/design/2 not recorded: `));
    expect(readFileSync(join(repo, LOG), 'utf-8')).toBe(`${line()}\n`);
    expect(show(['status', '--porcelain'])).toBe('');
  });

  it('refuses a run log with uncommitted changes, writing nothing', () => {
    writeFixtureFile(repo, LOG, `${line()}\n`);
    commitAll(repo, 'run');
    writeFileSync(join(repo, LOG), `${line()}\nhand edit\n`, 'utf-8');
    const result = recordRun(repo, LOG, record({ id: `${ELEMENT_ID}/design/2` }));
    const ours = record({ id: `${ELEMENT_ID}/design/2` });
    expect(result).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: `run log ${LOG} has uncommitted changes`, details: { run_id: ours.id, record: ours, issues: [{ detail: serializeRunRecord(ours).trimEnd() }] } },
    });
    expect(readFileSync(join(repo, LOG), 'utf-8')).toBe(`${line()}\nhand edit\n`);
  });

  it('refuses a record that is not of this log’s element', () => {
    const other = record({ id: 'task-002-other/design/1', element: 'task:task-002-other' });
    const result = recordRun(repo, LOG, other);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(errorDetails(result.error)).toEqual([{ detail: serializeRunRecord(other).trimEnd() }]);
    }
    expect(existsSync(join(repo, LOG))).toBe(false);
  });

  it('refuses an invalid record, writing nothing', () => {
    const result = recordRun(repo, LOG, record({ duration_ms: -5 }));
    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: "run record is not valid: 'duration_ms' must be a non-negative integer" } });
    expect(existsSync(join(repo, LOG))).toBe(false);
  });

  it('refuses a record whose id disagrees with its phase or element, which would wedge later runs (F6)', () => {
    for (const bad of [record({ phase: 'red' }), record({ element: 'task:task-002-other' })]) {
      expect(() => serializeRunRecord(bad)).toThrow(/does not match element/);
      const result = recordRun(repo, LOG, bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    }
    expect(existsSync(join(repo, LOG))).toBe(false);
  });

  it('refuses a run-log directory that is a symbolic link inside the project, with the record in details (F5)', () => {
    mkdirSync(join(repo, 'docs', 'elsewhere'), { recursive: true });
    symlinkSync('elsewhere', join(repo, 'docs', 'runs'));
    const result = recordRun(repo, LOG, record());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toMatch(/'docs\/runs' is a symbolic link/);
      expect(errorDetails(result.error)).toEqual([{ detail: line() }]);
    }
    expect(existsSync(join(repo, 'docs', 'elsewhere', `${ELEMENT_ID}.jsonl`))).toBe(false);
  });

  it('the step-6 pre-flight: declared, confined, inspectable, unmodified (F5)', () => {
    expect(runLogPreflight(repo, ['docs/runs/'], ELEMENT_ID)).toEqual({ ok: true, value: LOG });
    expect(runLogPreflight(repo, undefined, ELEMENT_ID)).toEqual({ ok: false, error: { code: 'VALIDATION', message: 'dna.yaml declares no run log (paths.runs)' } });
    writeFixtureFile(repo, LOG, 'untracked\n');
    expect(runLogPreflight(repo, ['docs/runs/'], ELEMENT_ID)).toEqual({ ok: false, error: { code: 'CONFLICT', message: `run log ${LOG} has uncommitted changes` } });
  });

  it('refuses when the log at HEAD is not a valid run log', () => {
    writeFixtureFile(repo, LOG, 'garbage\n');
    commitAll(repo, 'bad');
    const result = recordRun(repo, LOG, record());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ code: 'VALIDATION', message: `run log ${LOG}: line 1 is not a valid run record: not JSON` });
      expect(errorDetails(result.error)).toEqual([{ detail: line() }]);
    }
  });
});

describe('the notes field (spec-016 §4.2 key 18, dl-135 Q2 (c))', () => {
  const TEMPLATE_WITH = '---\nid: ""\n---\n\n## Description\n\n## Execution Notes\n\n<!-- log -->\n';
  const TEMPLATE_WITHOUT = '---\nid: ""\n---\n\n## Context\n\n## Decision\n';
  const element = (notes: string, tail = ''): string =>
    `---\nid: ${ELEMENT_ID}\nstatus: in-progress\n---\n\n## Description\n\nd\n\n## Execution Notes\n\n${notes}\n${tail}`;

  it('extracts the section by its heading line, up to the next heading of level 1 or 2, outside code fences', () => {
    expect(executionNotesSection(element('one\n### sub\ntwo', '## Next\nafter\n'))).toBe('\none\n### sub\ntwo\n');
    expect(executionNotesSection('a\n`## Execution Notes` inline\n')).toBeNull();
    expect(executionNotesSection('## Execution Notes\n```\n## not a heading\n```\nkept\n## End\n')).toBe('```\n## not a heading\n```\nkept\n');
    expect(executionNotesSection('---\ntitle: "## Execution Notes"\n---\nbody\n')).toBeNull();
    expect(executionNotesSection('## Triage & Execution Notes\nx\n')).toBeNull();
    expect(executionNotesSection('## Execution Notes\r\nx\r\n## End\r\n')).toBe('x\n');
  });

  it('is <element-id>#execution-notes when the section differs between state_ref and HEAD, else none', () => {
    expect(notesField(ELEMENT_ID, { template: TEMPLATE_WITH, atStateRef: element('a'), atHead: element('a\nb') })).toBe(`${ELEMENT_ID}#execution-notes`);
    expect(notesField(ELEMENT_ID, { template: TEMPLATE_WITH, atStateRef: element('a'), atHead: element('a').replace('d\n', 'changed\n') })).toBe('none');
    expect(notesField(ELEMENT_ID, { template: TEMPLATE_WITH, atStateRef: element('a'), atHead: element('a') })).toBe('none');
  });

  it('is always none for a type whose template lacks the section', () => {
    expect(notesField(ELEMENT_ID, { template: TEMPLATE_WITHOUT, atStateRef: element('a'), atHead: element('b') })).toBe('none');
    expect(notesField(ELEMENT_ID, { template: null, atStateRef: element('a'), atHead: element('b') })).toBe('none');
  });

  describe('read from git', () => {
    let repo: string;

    beforeEach(() => {
      repo = makeTempGitRepo();
      writeFixtureFile(repo, '.wingfoil/memory/templates/task.md', TEMPLATE_WITH);
      writeFixtureFile(repo, '.wingfoil/memory/templates/adr.md', TEMPLATE_WITHOUT);
      writeFixtureFile(repo, 'docs/task.md', element('start'));
      commitAll(repo, 'init');
    });

    afterEach(() => removeTempDir(repo));

    const derive = (stateRef: string, templatePath = '.wingfoil/memory/templates/task.md'): string =>
      deriveNotesField(repo, { elementId: ELEMENT_ID, elementPath: 'docs/task.md', templatePath, stateRef });

    it('sees notes the agent committed, and not notes it left uncommitted', () => {
      const stateRef = git(repo, ['rev-parse', 'HEAD']).trim();
      writeFixtureFile(repo, 'docs/task.md', element('start\nmore'));
      expect(derive(stateRef)).toBe('none');
      commitAll(repo, 'notes');
      expect(derive(stateRef)).toBe(`${ELEMENT_ID}#execution-notes`);
      expect(derive(stateRef, '.wingfoil/memory/templates/adr.md')).toBe('none');
    });
  });
});

describe('the strict reader and writer agree', () => {
  it('a written record reads back', () => {
    const repo = makeTempGitRepo();
    try {
      const hookless = record({ id: `${ELEMENT_ID}/adhoc/1`, workflow: NO_WORKFLOW, phase: ADHOC_PHASE, exit_status: 'signal:SIGHUP' });
      writeFixtureFile(repo, 'README.md', 'x\n');
      commitAll(repo, 'init');
      expect(recordRun(repo, LOG, hookless).ok).toBe(true);
      expect(readRunLogAt(repo, 'HEAD', LOG)).toEqual({ ok: true, value: [hookless] });
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('bug-288 — the run log holds exactly the writer\'s form (spec-016 §4.2, §4.5)', () => {
  const NOT_SERIALIZED = 'not in the serialized form of spec-016 §4.2 (a CR, whitespace outside a string, or another spelling of a value)';
  const refused = (text: string): string | undefined => {
    const result = parseRunLog(text, LOG);
    return result.ok ? undefined : result.error.message;
  };

  it('the writer refuses a negative exit status and one above 255; 0 and 255 are written', () => {
    expect(() => serializeRunRecord(record({ exit_status: -1 }))).toThrow(EXIT_STATUS_DEFECT);
    expect(() => serializeRunRecord(record({ exit_status: 256 }))).toThrow(EXIT_STATUS_DEFECT);
    expect(serializeRunRecord(record({ exit_status: 255 }))).toContain('"exit_status":255,');
  });

  it('the reader refuses a CRLF line', () => {
    expect(refused(`${line()}\r\n`)).toBe(`run log ${LOG}: line 1 is not a valid run record: ${NOT_SERIALIZED}`);
  });

  it('the reader refuses whitespace inside or around the object', () => {
    expect(refused(`${line().replace('{"id"', '{ "id"')}\n`)).toBe(`run log ${LOG}: line 1 is not a valid run record: ${NOT_SERIALIZED}`);
    expect(refused(`${line()}  \n`)).toBe(`run log ${LOG}: line 1 is not a valid run record: ${NOT_SERIALIZED}`);
    expect(refused(`${line()}\n ${line({ id: `${ELEMENT_ID}/design/2` })}\n`)).toBe(`run log ${LOG}: line 2 is not a valid run record: ${NOT_SERIALIZED}`);
  });

  it('whitespace inside a string value is content, and reads back', () => {
    const spaced = record({ role: 'a role with spaces' });
    expect(parseRunLog(serializeRunRecord(spaced), LOG)).toEqual({ ok: true, value: [spaced] });
  });

  it('an absolute paths.runs outside the root is refused naming the configured target, not a ../ climb', () => {
    const repo = makeTempGitRepo();
    try {
      const result = resolveRunLogPath(repo, ['/etc'], 'task-001');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/^cannot write '\/etc\/task-001\.jsonl': it resolves to '\/etc\/task-001\.jsonl', outside the project root/);
    } finally {
      removeTempDir(repo);
    }
  });
});
