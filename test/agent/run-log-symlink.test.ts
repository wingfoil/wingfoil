/**
 * task-330 (`bug-354`; `spec-016` §4.5): the run-log readers list blob entries only. A `.jsonl` committed as a
 * symbolic link (git mode 120000) is not read: it is skipped with a `W_RUN_LOG_SYMLINK` warning, where today
 * its blob — the link's target path — is parsed as a log and refused as "not terminated by a newline".
 *
 * The fixture is a committed repository whose `docs/runs/` holds `task-1.jsonl`, a link to `../target.txt`, and
 * `task-2.jsonl`, a regular log of one valid record. `W_RUN_LOG_SYMLINK` does not exist yet: the import is the
 * stated red (TS2305 under `tsc`; an `undefined` constant at jest run time), so the assertions on the code fail.
 */
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { ADHOC_PHASE, NOT_REPORTED, nextRunId, readRunLogAt, readRunLogsAt, serializeRunRecord, W_RUN_LOG_SYMLINK, type RunRecord } from '../../src/agent';
import { withWarningSink } from '../../src/validation/warning';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const LINK_LOG = 'docs/runs/task-1.jsonl';
const REGULAR_LOG = 'docs/runs/task-2.jsonl';
const LINK_MESSAGE = `run log ${LINK_LOG} is a symbolic link: not read`;
const LINK_DIAGNOSTIC = { code: 'W_RUN_LOG_SYMLINK', severity: 'warning', file: LINK_LOG, path: '', message: LINK_MESSAGE };

const RECORD: RunRecord = {
  id: 'task-2/design/1',
  element: 'task:task-2',
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
  state_ref: 'a'.repeat(40),
  duration_ms: 1234,
  exit_status: 0,
  result: 'n/a',
  notes: 'none',
};

describe('task-330 — a symlinked run log is skipped with a warning (bug-354, spec-016 §4.5)', () => {
  let repo: string;
  let sha: string;

  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/target.txt', 'not a run log');
    mkdirSync(join(repo, 'docs/runs'), { recursive: true });
    symlinkSync('../target.txt', join(repo, LINK_LOG));
    writeFixtureFile(repo, REGULAR_LOG, serializeRunRecord(RECORD));
    commitAll(repo, 'seed');
    sha = git(repo, ['rev-parse', 'HEAD']).trim();
    expect(git(repo, ['ls-tree', 'HEAD', LINK_LOG])).toMatch(/^120000 blob /);
  });

  afterAll(() => removeTempDir(repo));

  it('the code is exported as a constant equal to its name', () => {
    expect(W_RUN_LOG_SYMLINK).toBe('W_RUN_LOG_SYMLINK');
  });

  it('readRunLogsAt lists the regular log only and reports the link once, as a diagnostic', () => {
    const reported: unknown[] = [];
    const result = readRunLogsAt(repo, sha, 'docs/runs/', (diagnostic: unknown) => reported.push(diagnostic));
    expect(result).toEqual({ ok: true, value: [RECORD] });
    expect(reported).toEqual([LINK_DIAGNOSTIC]);
  });

  it('readRunLogsAt without a diagnostic callback warns through the warning sink', () => {
    const warnings: string[] = [];
    const result = withWarningSink((text) => warnings.push(text), () => readRunLogsAt(repo, sha, 'docs/runs/'));
    expect(result).toEqual({ ok: true, value: [RECORD] });
    expect(warnings).toEqual([`W_RUN_LOG_SYMLINK (${LINK_LOG}): ${LINK_MESSAGE}`]);
  });

  it('readRunLogAt of the link: no records and one warning, not a parse refusal', () => {
    const warnings: string[] = [];
    const result = withWarningSink((text) => warnings.push(text), () => readRunLogAt(repo, 'HEAD', LINK_LOG));
    expect(result).toEqual({ ok: true, value: [] });
    expect(warnings).toEqual([`W_RUN_LOG_SYMLINK (${LINK_LOG}): ${LINK_MESSAGE}`]);
  });

  it('readRunLogAt of the regular log still reads it, with no warning (characterization of the unchanged path)', () => {
    const warnings: string[] = [];
    const result = withWarningSink((text) => warnings.push(text), () => readRunLogAt(repo, 'HEAD', REGULAR_LOG));
    expect(result).toEqual({ ok: true, value: [RECORD] });
    expect(warnings).toEqual([]);
  });

  it('nextRunId over the link counts no record: task-1/adhoc/1, with the same warning', () => {
    const warnings: string[] = [];
    const id = withWarningSink((text) => warnings.push(text), () => nextRunId(repo, { logPath: LINK_LOG, element: 'task:task-1', phase: ADHOC_PHASE, stateRef: sha }));
    expect(id).toEqual({ ok: true, value: 'task-1/adhoc/1' });
    expect(warnings).toEqual([`W_RUN_LOG_SYMLINK (${LINK_LOG}): ${LINK_MESSAGE}`]);
  });
});
