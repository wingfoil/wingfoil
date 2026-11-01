/**
 * task-330 (`bug-339`; `spec-016` §3.3 step 2, §3.7; approver ruling D1 (a) of the design gate) — the step forms
 * of `agent execute` report the deduction's diagnostics as `warning:` lines on stderr, one per diagnostic, in
 * the form `agent list` prints for the same deduction (`<code> (<file>): <message>`), before any step refusal;
 * `workflow next` lists the same diagnostics in its payload. Today `agent execute` prints none of them.
 *
 * The fixture is the step fixture's `delivery-1` (two parallel `loop.implement` steps) with
 * `docs/04_memory/v0.1/task-203-sibling.md` edited and not committed: the deduction reads `HEAD`, so it
 * reports `W_UNCOMMITTED_INPUTS` for that file. The expected diagnostic object and line are the ones
 * `wingfoil workflow next --format json` printed on this very tree (the test also derives them from that
 * command's `diagnostics`, so the two surfaces are compared as well as pinned).
 *
 * Every case is a dry run: nothing is spawned, nothing is written.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { TASK_ID } from '../agent/helpers/agent-execute-fixture';
import { headOf, RELEASE_ID, seedStep, SIBLING_ID, startInstance } from '../agent/helpers/agent-execute-step-fixture';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture } from './helpers/spawn-cli';

const DIRTY_FILE = `docs/04_memory/v0.1/${SIBLING_ID}.md`;
const MESSAGE = `uncommitted change to a deduction input, not read (the answer is computed from HEAD): ${DIRTY_FILE}`;
const WARNING_LINE = `warning: W_UNCOMMITTED_INPUTS (${DIRTY_FILE}): ${MESSAGE}`;
const DIAGNOSTIC = { code: 'W_UNCOMMITTED_INPUTS', severity: 'warning', file: DIRTY_FILE, path: '', message: MESSAGE };

describe('task-330 — agent execute reports the deduction’s diagnostics (bug-339)', () => {
  let repo: string;
  let head: string;

  const cli = (args: readonly string[]) => spawnCapture(process.execPath, [CLI_ENTRY, ...args], { cwd: repo });
  const warningLines = (stderr: string): string[] => stderr.split('\n').filter((line) => line.startsWith('warning: W_'));

  beforeAll(() => {
    repo = seedStep();
    startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
    head = headOf(repo);
    appendFileSync(join(repo, DIRTY_FILE), 'an edit the deduction does not read\n');
  });

  afterAll(() => removeTempDir(repo));

  it('the reference: workflow next --format json lists the W_UNCOMMITTED_INPUTS diagnostic on this tree', () => {
    const next = cli(['workflow', 'next', '--format', 'json']);
    expect(next.status).toBe(0);
    expect((JSON.parse(next.stdout) as { diagnostics: unknown[] }).diagnostics).toEqual([DIAGNOSTIC]);
  });

  it('AC 1 — agent execute --next --dry-run: exit 0, one warning: line per diagnostic, the lines workflow next’s diagnostics give', () => {
    const next = JSON.parse(cli(['workflow', 'next', '--format', 'json']).stdout) as { diagnostics: { code: string; file: string; message: string }[] };
    const expected = next.diagnostics.map((d) => `warning: ${d.code} (${d.file}): ${d.message}`);
    const run = cli(['agent', 'execute', '--next', '--dry-run']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual(expected);
    expect(warningLines(run.stderr)).toEqual([WARNING_LINE]);
    expect(run.stdout).toContain(`"id": "${TASK_ID}/implement/1"`);
  });

  it('AC 1 — --format json: stdout still parses as the dry-run payload, stderr holds the warning as a JSON line', () => {
    const run = cli(['agent', 'execute', '--next', '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as { dryRun: boolean }).dryRun).toBe(true);
    expect(run.stderr.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as unknown)).toEqual([{ warning: `W_UNCOMMITTED_INPUTS (${DIRTY_FILE}): ${MESSAGE}` }]);
  });

  it('AC 1 — a refusal after the deduction: the warning is line 0, the error line 1, nothing spawned, HEAD unchanged', () => {
    const run = cli(['agent', 'execute', '--workflow', 'delivery-1', '--step', `loop.review@task:${TASK_ID}`, '--dry-run']);
    expect(run.status).toBe(1);
    expect(run.stderr.split('\n')).toEqual([WARNING_LINE, `error: step 'loop.review@task:${TASK_ID}' is not on the frontier of delivery-1`, '']);
    expect(run.stdout).toBe('');
    expect(headOf(repo)).toBe(head);
  });

  it('characterization — the stepless form reads no deduction and prints no W_UNCOMMITTED_INPUTS line (spec-016 §3.3 step 2)', () => {
    const run = cli(['agent', 'execute', '--element', `task:${TASK_ID}`, '--role', 'developer', '--dry-run']);
    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain('W_UNCOMMITTED_INPUTS');
  });
});
