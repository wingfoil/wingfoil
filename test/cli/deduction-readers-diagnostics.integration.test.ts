/**
 * task-373 (`dl-176` (a); `spec-017` §3.2, §7.3, §7.4, §8 and `spec-008` §2, §6 as amended at the task's design gate;
 * approver rulings D1, D2, D4) — the deduction readers `workflow status`, `workflow next` and `agent list` keep stdout
 * to the answer and write each entry of their payload's `diagnostics` on stderr as one success warning, in the form
 * `agent list` already prints: `warning: <code> (<file>): <message>` under `--format console`, one
 * `{"warning": "<code> (<file>): <message>"}` line under `--format json`, one YAML document under `--format yaml`.
 *
 * - AC 1 (red-first for `status` and `next`, characterization for `agent list`): console — exit 0, stderr exactly
 *   the one `warning:` line, the same bytes for the three commands; stdout holds no diagnostic code and no
 *   `<n> diagnostic(s)` line.
 * - AC 2 (red-first for the stderr documents of `status` and `next`; characterization for the payload's top-level
 *   `diagnostics`, compared with a literal array, and for `agent list`'s stderr).
 * - D4: an instance only the pre-marker rule keeps open is reported by `workflow status` as a stderr line, the last of
 *   its warnings; stdout no longer carries `kept by the pre-marker rule`.
 *
 * Fixture: the step fixture (`test/agent/helpers/agent-execute-step-fixture.ts`) with `delivery-1` open, so `agent
 * list --waiting` lists its two steps, and `docs/04_memory/v0.1/task-203-sibling.md` edited and not committed: the
 * deduction reads `HEAD`, so each reader reports `W_UNCOMMITTED_INPUTS` for that file. In the first fixture
 * `delivery-1`'s start commit carries the start marker `WingFoil-Start: delivery` (`spec-017` §3.1), so that
 * diagnostic is the only one; in the second it is committed by hand with no marker, so `workflow status` adds
 * `W_INSTANCE_PRE_MARKER`. The literal lines are the ones the commands printed on these trees (`--format json`'s
 * `diagnostics` for `status` and `next`, the stderr of `agent list`), recorded in the task's Execution Notes.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadAll as yamlLoadAll, load as yamlLoad } from 'js-yaml';

import { planMd, planPath, RELEASE_ID, seedStep, SIBLING_ID, startInstance } from '../agent/helpers/agent-execute-step-fixture';
import { commitAll, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const DIRTY_FILE = `docs/04_memory/v0.1/${SIBLING_ID}.md`;
const MESSAGE = `uncommitted change to a deduction input, not read (the answer is computed from HEAD): ${DIRTY_FILE}`;
const DIAGNOSTIC = { code: 'W_UNCOMMITTED_INPUTS', severity: 'warning', file: DIRTY_FILE, path: '', message: MESSAGE };
const WARNING_TEXT = `W_UNCOMMITTED_INPUTS (${DIRTY_FILE}): ${MESSAGE}`;
const WARNING_LINE = `warning: ${WARNING_TEXT}`;

const PLAN_FILE = planPath('delivery-1');
const PRE_MARKER_MESSAGE = 'instance delivery-1 is kept by the pre-marker rule: restart it with workflow start';
const PRE_MARKER_DIAGNOSTIC = { code: 'W_INSTANCE_PRE_MARKER', severity: 'warning', file: PLAN_FILE, path: '', message: PRE_MARKER_MESSAGE };
const PRE_MARKER_TEXT = `W_INSTANCE_PRE_MARKER (${PLAN_FILE}): ${PRE_MARKER_MESSAGE}`;
const PRE_MARKER_LINE = `warning: ${PRE_MARKER_TEXT}`;

const COUNT_LINE = /^\d+ diagnostic\(s\)/m;

/** The three readers, the class of AC 1 / AC 2 each one's stderr half has (design table). */
const READERS: readonly { readonly name: string; readonly args: readonly string[]; readonly cls: string }[] = [
  { name: 'workflow status', args: ['workflow', 'status'], cls: 'red-first' },
  { name: 'workflow next', args: ['workflow', 'next'], cls: 'red-first' },
  { name: 'agent list --waiting', args: ['agent', 'list', '--waiting'], cls: 'characterization' },
];

/** Open `delivery-1` with a commit that carries the start marker, as `workflow start` writes it (`spec-017` §3.1). */
function startMarked(repo: string): void {
  writeFixtureFile(repo, PLAN_FILE, planMd('delivery-1', 'delivery', RELEASE_ID));
  commitAll(repo, 'wf(plan): add delivery-1\n\nWingFoil-Start: delivery');
}

describe('task-373 — the deduction readers write each diagnostic on stderr, stdout carries only the answer (dl-176 (a))', () => {
  let repo: string;

  beforeAll(() => {
    repo = seedStep();
    startMarked(repo);
    appendFileSync(join(repo, DIRTY_FILE), 'an edit the deduction does not read\n');
  });

  afterAll(() => removeTempDir(repo));

  it.each(READERS)('AC 1 ($name, $cls) — console: exit 0, stderr exactly the one warning: line, stdout free of diagnostics', ({ args }) => {
    const run = runCliEntry(repo, args);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`${WARNING_LINE}\n`);
    expect(run.stdout).not.toContain('W_UNCOMMITTED_INPUTS');
    expect(run.stdout).not.toMatch(COUNT_LINE);
  });

  it('AC 1 — the three readers write the same bytes on stderr for the same deduction', () => {
    const stderrs = READERS.map(({ args }) => runCliEntry(repo, args).stderr);
    expect(stderrs).toEqual([`${WARNING_LINE}\n`, `${WARNING_LINE}\n`, `${WARNING_LINE}\n`]);
  });

  it.each(READERS)('AC 2 ($name, stderr $cls; payload characterization) — --format json: diagnostics unchanged on stdout, one {"warning"} line on stderr', ({ args }) => {
    const run = runCliEntry(repo, [...args, '--format', 'json']);
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as { diagnostics: unknown }).diagnostics).toEqual([DIAGNOSTIC]);
    expect(run.stderr).toBe(`${JSON.stringify({ warning: WARNING_TEXT })}\n`);
  });

  it.each(READERS)('AC 2 ($name, stderr $cls; payload characterization) — --format yaml: diagnostics unchanged on stdout, one { warning } document on stderr', ({ args }) => {
    const run = runCliEntry(repo, [...args, '--format', 'yaml']);
    expect(run.status).toBe(0);
    expect((yamlLoad(run.stdout) as { diagnostics: unknown }).diagnostics).toEqual([DIAGNOSTIC]);
    expect(yamlLoadAll(run.stderr)).toEqual([{ warning: WARNING_TEXT }]);
  });
});

describe('task-373 D4 — the pre-marker rule is a stderr warning of workflow status, the last of them (spec-017 §3.2, §7.4)', () => {
  let repo: string;

  beforeAll(() => {
    repo = seedStep();
    startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID); // committed by hand: no start marker
    appendFileSync(join(repo, DIRTY_FILE), 'an edit the deduction does not read\n');
  });

  afterAll(() => removeTempDir(repo));

  it('the payload (characterization): W_UNCOMMITTED_INPUTS, then W_INSTANCE_PRE_MARKER last', () => {
    const run = runCliEntry(repo, ['workflow', 'status', '--format', 'json']);
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as { diagnostics: unknown }).diagnostics).toEqual([DIAGNOSTIC, PRE_MARKER_DIAGNOSTIC]);
  });

  it('console: one warning: line per diagnostic in payload order, the pre-marker line last; stdout holds no pre-marker line and no count', () => {
    const run = runCliEntry(repo, ['workflow', 'status']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`${WARNING_LINE}\n${PRE_MARKER_LINE}\n`);
    expect(run.stderr.trimEnd().split('\n').pop()).toBe(PRE_MARKER_LINE);
    expect(run.stdout).not.toContain('kept by the pre-marker rule');
    expect(run.stdout).not.toContain('W_INSTANCE_PRE_MARKER');
    expect(run.stdout).not.toMatch(COUNT_LINE);
    expect(run.stdout).toContain('* delivery-1 (delivery) — active');
  });

  it('--format json: one {"warning"} line per diagnostic, the pre-marker one last', () => {
    const run = runCliEntry(repo, ['workflow', 'status', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`${JSON.stringify({ warning: WARNING_TEXT })}\n${JSON.stringify({ warning: PRE_MARKER_TEXT })}\n`);
  });

  it('workflow next raises no W_INSTANCE_PRE_MARKER (status only): its payload and its stderr hold the one uncommitted input', () => {
    const json = runCliEntry(repo, ['workflow', 'next', '--format', 'json']);
    expect((JSON.parse(json.stdout) as { diagnostics: unknown }).diagnostics).toEqual([DIAGNOSTIC]);
    const run = runCliEntry(repo, ['workflow', 'next']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`${WARNING_LINE}\n`);
  });
});
