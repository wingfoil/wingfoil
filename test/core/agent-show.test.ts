/**
 * task-220 — `wingfoil agent show <run-id>` (`spec-016` §6, §5.1; BDD
 * `docs/02_requirements/02_bdd/features/p5-interaction/P5.3.5-agent-show.feature`).
 *
 * Drives the real, registered `CORE_MODULES` `agent.agentShow` operation — the `CoreFn` the CLI command
 * dispatches to — over a throwaway repository whose run log is written by task-206's `recordRun`, the
 * same library `agent execute` will commit through. The compiled CLI's bytes (console lines, `hint:`
 * line, exit codes) are pinned by `test/cli/agent-show.integration.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { NOT_REPORTED, recordRun, serializeRunRecord, type RunRecord } from '../../src/agent';
import { CORE_MODULES, WINGFOIL_NOT_INITIALIZED } from '../../src/core';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreFn, CoreOperation } from '../../src/core/registry';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const ELEMENT_ID = 'task-001-demo';
const LOG = `docs/runs/${ELEMENT_ID}.jsonl`;

const DNA = (runs: string): string => `version: 1
modules:
  - name: core
    path: src/core
team:
  members:
    - name: ada
      roles: [ approver ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
${runs}`;

const DNA_WITH_RUNS = DNA('  runs: [ docs/runs/ ]\n');

/** A complete, valid record of `ELEMENT_ID`; `overrides` replaces whole fields. */
function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: `${ELEMENT_ID}/design/1`,
    element: `task:${ELEMENT_ID}`,
    workflow: 'dev-loop',
    phase: 'design',
    role: 'architect',
    mode: 'fresh',
    agent: 'claude',
    adapter: 'custom/fake',
    agent_version: '1.2.3',
    model: NOT_REPORTED,
    session: NOT_REPORTED,
    tokens: { input: 1200, output: 340, cache_read: NOT_REPORTED, cache_write: 0 },
    wingfoil: '0.3.0 (unknown)',
    state_ref: 'a'.repeat(40),
    duration_ms: 5120,
    exit_status: 0,
    result: 'n/a',
    notes: 'none',
    ...overrides,
  };
}

interface ShowValue {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly run: RunRecord;
  readonly commit: string;
}

function agentShowOperation(): CoreOperation {
  const operation = CORE_MODULES.find((module) => module.name === 'agent')?.operations.agentShow;
  if (!operation) throw new Error('"agentShow" is not registered on the agent module');
  return operation;
}

const show = (root: string, positional?: string) => (agentShowOperation().fn as CoreFn<unknown, ShowValue>)({ root, positional });

const head = (repo: string): string => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();

/** Record `run` through the run-log library and return the sha of its `agent: record` commit. */
function recorded(repo: string, run: RunRecord): string {
  const result = recordRun(repo, LOG, run);
  if (!result.ok) throw new Error(`fixture: recordRun refused: ${result.error.message}`);
  return result.value.sha;
}

/** The thrown refusal of `positional`, as the CLI maps it (`exitCodeForThrow`). */
async function thrown(root: string, positional: string): Promise<{ reason: string; exitCode: number }> {
  try {
    await show(root, positional);
  } catch (error) {
    return exitCodeForThrow(error);
  }
  throw new Error(`agent show ${positional} did not throw`);
}

describe('task-220 — agent show is registered (spec-016 §8, spec-006 §3)', () => {
  it('is the agent module\'s read-only agentShow, taking a required <run-id> positional', () => {
    const operation = agentShowOperation();
    expect(operation.mutates).toBe(false);
    expect(operation.positional).toMatchObject({ name: 'run-id', required: true });
    expect(operation.example).toMatch(/^wingfoil agent show \S+\/[a-z][a-z0-9-]*\/[1-9][0-9]*$/);
    expect(typeof operation.renderConsole).toBe('function');
  });
});

describe('task-220 — agent show <run-id> (spec-016 §6)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_WITH_RUNS);
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  describe('AC 1 — a recorded run', () => {
    it('returns {baseline, run, commit}: baseline HEAD, the record, and the agent: record commit that added it', async () => {
      const first = record();
      const firstSha = recorded(repo, first);
      recorded(repo, record({ id: `${ELEMENT_ID}/design/2`, exit_status: 'signal:SIGINT' }));
      writeFixtureFile(repo, 'README.md', 'later\n');
      commitAll(repo, 'an unrelated later commit');

      const result = await show(repo, first.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ baseline: { rev: 'HEAD', commit: head(repo) }, run: first, commit: firstSha });
      expect(Object.keys(result.value)).toEqual(['baseline', 'run', 'commit']);
      expect(execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s', firstSha], { encoding: 'utf-8' }).trim()).toBe(
        `agent: record ${first.id}`,
      );
      expect(exitCodeForResult(result)).toBe(0);
    });

    it('the payload\'s run keeps the record\'s §4.2 key order', async () => {
      const run = record();
      recorded(repo, run);
      const result = await show(repo, run.id);
      if (!result.ok) throw new Error(result.error.message);
      expect(JSON.stringify(result.value.run)).toBe(serializeRunRecord(run).replace(/\n$/, ''));
    });

    it('console: key: value lines in §4.2 order, tokens flattened, then commit: <sha>', async () => {
      const run = record();
      const sha = recorded(repo, run);
      const result = await show(repo, run.id);
      if (!result.ok) throw new Error(result.error.message);
      expect(agentShowOperation().renderConsole?.(result.value)).toBe(
        [
          `id: ${ELEMENT_ID}/design/1`,
          `element: task:${ELEMENT_ID}`,
          'workflow: dev-loop',
          'phase: design',
          'role: architect',
          'mode: fresh',
          'agent: claude',
          'adapter: custom/fake',
          'agent_version: 1.2.3',
          'model: not-reported',
          'session: not-reported',
          'tokens.input: 1200',
          'tokens.output: 340',
          'tokens.cache_read: not-reported',
          'tokens.cache_write: 0',
          'wingfoil: 0.3.0 (unknown)',
          `state_ref: ${'a'.repeat(40)}`,
          'duration_ms: 5120',
          'exit_status: 0',
          'result: n/a',
          'notes: none',
          `commit: ${sha}`,
          '',
        ].join('\n'),
      );
    });

    it('reads dna.yaml\'s paths.runs at HEAD, not the working tree (spec-016 §5.1)', async () => {
      const run = record();
      recorded(repo, run);
      writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA('  runs: [ elsewhere/ ]\n'));
      const result = await show(repo, run.id);
      expect(result.ok).toBe(true);
    });

    it('finds the adding commit of a record that reached HEAD through a merge', async () => {
      execFileSync('git', ['-C', repo, 'checkout', '--quiet', '-b', 'side']);
      const run = record();
      const sha = recorded(repo, run);
      execFileSync('git', ['-C', repo, 'checkout', '--quiet', 'main']);
      writeFixtureFile(repo, 'README.md', 'main moves\n');
      commitAll(repo, 'main moves');
      execFileSync('git', ['-C', repo, 'merge', '--quiet', '--no-ff', '-m', 'merge side', 'side']);
      const result = await show(repo, run.id);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value.commit).toBe(sha);
    });
  });

  describe('AC 2 — a malformed id is a usage error (exit 2)', () => {
    it.each([
      ['no slash', 'task-001-demo'],
      ['two segments', `${ELEMENT_ID}/design`],
      ['four segments', `a/${ELEMENT_ID}/design/1`],
      ['an uppercase phase', `${ELEMENT_ID}/Design/1`],
      ['a zero count', `${ELEMENT_ID}/design/0`],
      ['a padded count', `${ELEMENT_ID}/design/01`],
      ['an element id outside the ID class', 'task 1/design/1'],
      ['a type:id element', `task:${ELEMENT_ID}/design/1`],
      ['a blank operand', '  '],
    ])('%s', async (_label, value) => {
      expect(await thrown(repo, value)).toEqual({
        reason: `invalid run id "${value}", expected <element-id>/<phase>/<n>`,
        exitCode: 2,
      });
    });

    it('is refused before the project is read: also outside an initialized project', async () => {
      const bare = makeTempGitRepo();
      try {
        expect((await thrown(bare, 'nope')).exitCode).toBe(2);
      } finally {
        removeTempDir(bare);
      }
    });

    it('an absent operand is the one missing-operand form (a caller that skipped the registrar)', async () => {
      await expect(show(repo)).rejects.toThrow('missing required argument: <run-id>');
    });
  });

  describe('AC 3 — an unknown id (exit 1), and the working tree as a hint only', () => {
    it('a run the log at HEAD does not hold: NOT_FOUND, run not found: <run-id>, no hint', async () => {
      recorded(repo, record());
      const result = await show(repo, `${ELEMENT_ID}/design/2`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({ code: 'NOT_FOUND', message: `run not found: ${ELEMENT_ID}/design/2` });
      expect(exitCodeForResult(result)).toBe(1);
    });

    it('an element with no run log at all: the same refusal', async () => {
      const result = await show(repo, 'task-999-other/red/1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'run not found: task-999-other/red/1' });
    });

    it('a run only the working tree holds (an uncommitted append): refused, with a hint saying so', async () => {
      recorded(repo, record());
      const uncommitted = record({ id: `${ELEMENT_ID}/design/2` });
      appendFileSync(join(repo, LOG), serializeRunRecord(uncommitted));
      const result = await show(repo, uncommitted.id);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({
        code: 'NOT_FOUND',
        message: `run not found: ${uncommitted.id}`,
        hint: `the working tree's ${LOG} holds ${uncommitted.id}, but HEAD does not: agent show reads HEAD; commit the run log to show it`,
      });
      expect(exitCodeForResult(result)).toBe(1);
    });

    it('a run log that was never committed (untracked): refused, with the hint', async () => {
      const run = record();
      writeFixtureFile(repo, LOG, serializeRunRecord(run));
      const result = await show(repo, run.id);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.hint).toContain(`the working tree's ${LOG} holds ${run.id}, but HEAD does not`);
    });

    it('a working-tree log that does not parse gives no hint: the refusal is unchanged', async () => {
      writeFixtureFile(repo, LOG, 'not json\n');
      const result = await show(repo, `${ELEMENT_ID}/design/1`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({ code: 'NOT_FOUND', message: `run not found: ${ELEMENT_ID}/design/1` });
    });
  });

  describe('the other refusals (exit 1)', () => {
    it('a run log at HEAD that violates §4.5 is VALIDATION with the reader\'s message', async () => {
      writeFixtureFile(repo, LOG, 'not json\n');
      commitAll(repo, 'a broken log');
      const result = await show(repo, `${ELEMENT_ID}/design/1`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({ code: 'VALIDATION', message: `run log ${LOG}: line 1 is not a valid run record: not JSON` });
    });

    it('dna.yaml at HEAD with no paths.runs: VALIDATION, naming the missing category', async () => {
      writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA(''));
      commitAll(repo, 'no runs');
      const result = await show(repo, `${ELEMENT_ID}/design/1`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({ code: 'VALIDATION', message: 'dna.yaml declares no run log (paths.runs)' });
    });

    it('no dna.yaml at HEAD (here: written but never committed): NOT_FOUND, naming the file and the baseline', async () => {
      const fresh = makeTempGitRepo();
      try {
        writeFixtureFile(fresh, 'README.md', 'x\n');
        commitAll(fresh, 'no dna');
        writeFixtureFile(fresh, '.wingfoil/dna.yaml', DNA_WITH_RUNS);
        const result = await show(fresh, `${ELEMENT_ID}/design/1`);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toEqual({ code: 'NOT_FOUND', message: '.wingfoil/dna.yaml is not committed at HEAD, which agent show reads: commit it first' });
      } finally {
        removeTempDir(fresh);
      }
    });

    it('an uninitialized project: the shared not-initialized refusal', async () => {
      const bare = makeTempGitRepo();
      try {
        const result = await show(bare, `${ELEMENT_ID}/design/1`);
        expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: WINGFOIL_NOT_INITIALIZED } });
      } finally {
        removeTempDir(bare);
      }
    });

    it('a repository with no commit yet: NOT_FOUND from the revision, never a throw', async () => {
      const empty = makeTempGitRepo();
      try {
        writeFixtureFile(empty, '.wingfoil/dna.yaml', DNA_WITH_RUNS);
        const result = await show(empty, `${ELEMENT_ID}/design/1`);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(exitCodeForResult(result)).toBe(1);
      } finally {
        removeTempDir(empty);
      }
    });
  });
});
