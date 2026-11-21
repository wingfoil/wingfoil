/**
 * task-373 (`dl-176` (a); `spec-017` §7.3, §7.4, §8 and `spec-008` §6 as amended at the task's design gate; approver
 * rulings D1, D2, D4) — in process, the half of the rule the CLI integration suite
 * (`test/cli/deduction-readers-diagnostics.integration.test.ts`) cannot count toward coverage:
 *
 * - (a) the registered `CORE_MODULES` operations `workflow.workflowNext` and `workflow.workflowStatus` answer
 *   `ok: true` with `warnings` equal to the lines of their `value.diagnostics`, in order, each
 *   `<code> (<file>): <message>` (the form `agent list` gives the same deduction, without the `warning: ` prefix the
 *   CLI adds), and with no `warnings` key when `diagnostics` is empty;
 * - (b) `renderNextConsole` and `renderStatusConsole` on a result that carries two diagnostics print neither code, no
 *   `<n> diagnostic(s)` line and, for `status`, no `kept by the pre-marker rule` line.
 *
 * Fixture: the step fixture (`test/agent/helpers/agent-execute-step-fixture.ts`) with `delivery-1` open and
 * `docs/04_memory/v0.1/task-203-sibling.md` edited and not committed, `delivery-1` started either with the start marker
 * (one diagnostic, `W_UNCOMMITTED_INPUTS`) or by hand (status adds `W_INSTANCE_PRE_MARKER`, last). The expected lines
 * are the `diagnostics` `--format json` printed on these trees, recorded in the task's Execution Notes.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, renderNextConsole, renderStatusConsole, type NextResult, type StatusResult } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { planMd, planPath, RELEASE_ID, seedStep, SIBLING_ID, startInstance } from '../agent/helpers/agent-execute-step-fixture';
import { commitAll, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DIRTY_FILE = `docs/04_memory/v0.1/${SIBLING_ID}.md`;
const MESSAGE = `uncommitted change to a deduction input, not read (the answer is computed from HEAD): ${DIRTY_FILE}`;
const DIAGNOSTIC = { code: 'W_UNCOMMITTED_INPUTS', severity: 'warning', file: DIRTY_FILE, path: '', message: MESSAGE };
const WARNING_TEXT = `W_UNCOMMITTED_INPUTS (${DIRTY_FILE}): ${MESSAGE}`;

const PLAN_FILE = planPath('delivery-1');
const PRE_MARKER_MESSAGE = 'instance delivery-1 is kept by the pre-marker rule: restart it with workflow start';
const PRE_MARKER_DIAGNOSTIC = { code: 'W_INSTANCE_PRE_MARKER', severity: 'warning', file: PLAN_FILE, path: '', message: PRE_MARKER_MESSAGE };
const PRE_MARKER_TEXT = `W_INSTANCE_PRE_MARKER (${PLAN_FILE}): ${PRE_MARKER_MESSAGE}`;

const COUNT_LINE = /diagnostic\(s\)/;

/** The registered operation's answer as a `CoreResult` (an operation may answer its value bare). */
async function call<T>(name: 'workflowNext' | 'workflowStatus', root: string): Promise<CoreResult<T>> {
  const operation = CORE_MODULES.find((module) => module.name === 'workflow')?.operations[name];
  if (operation === undefined) throw new Error(`no ${name} operation in CORE_MODULES`);
  const value = await operation.fn({ root });
  return (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<T>;
}

function valueOf<T>(result: CoreResult<T>): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** Open `delivery-1` with a commit that carries the start marker, as `workflow start` writes it (`spec-017` §3.1). */
function startMarked(repo: string): void {
  writeFixtureFile(repo, PLAN_FILE, planMd('delivery-1', 'delivery', RELEASE_ID));
  commitAll(repo, 'wf(plan): add delivery-1\n\nWingFoil-Start: delivery');
}

const dirty = (repo: string): void => appendFileSync(join(repo, DIRTY_FILE), 'an edit the deduction does not read\n');

describe('task-373 (a) — workflowNext and workflowStatus answer their diagnostics as success warnings', () => {
  const repos: string[] = [];
  afterAll(() => repos.forEach(removeTempDir));
  const fixture = (start: (repo: string) => void, edit: boolean): string => {
    const repo = seedStep();
    repos.push(repo);
    start(repo);
    if (edit) dirty(repo);
    return repo;
  };

  it.each(['workflowNext', 'workflowStatus'] as const)('%s, one diagnostic: ok, warnings the one line of value.diagnostics', async (name) => {
    const result = await call<NextResult | StatusResult>(name, fixture(startMarked, true));
    expect(result.ok).toBe(true);
    expect(valueOf(result).diagnostics).toEqual([DIAGNOSTIC]);
    expect(result.ok && result.warnings).toEqual([WARNING_TEXT]);
  });

  it('workflowStatus, two diagnostics: the warnings follow the payload order, the pre-marker one last', async () => {
    const result = await call<StatusResult>('workflowStatus', fixture((repo) => startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID), true));
    expect(valueOf(result).diagnostics).toEqual([DIAGNOSTIC, PRE_MARKER_DIAGNOSTIC]);
    expect(result.ok && result.warnings).toEqual([WARNING_TEXT, PRE_MARKER_TEXT]);
  });

  it.each(['workflowNext', 'workflowStatus'] as const)('%s, no diagnostic (characterization): ok, no warnings key', async (name) => {
    const result = await call<NextResult | StatusResult>(name, fixture(startMarked, false));
    expect(valueOf(result).diagnostics).toEqual([]);
    expect('warnings' in result).toBe(false);
  });
});

describe('task-373 (b) — the console renderers print no diagnostic, no count and no pre-marker line', () => {
  let repo: string;
  beforeAll(() => {
    repo = seedStep();
    startInstance(repo, 'delivery-1', 'delivery', RELEASE_ID);
    dirty(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('renderStatusConsole on a result with two diagnostics (W_UNCOMMITTED_INPUTS, W_INSTANCE_PRE_MARKER)', async () => {
    const status = valueOf(await call<StatusResult>('workflowStatus', repo));
    expect(status.diagnostics).toEqual([DIAGNOSTIC, PRE_MARKER_DIAGNOSTIC]);
    const text = renderStatusConsole(status);
    expect(text).toContain('* delivery-1 (delivery) — active');
    expect(text).not.toContain('W_UNCOMMITTED_INPUTS');
    expect(text).not.toContain('W_INSTANCE_PRE_MARKER');
    expect(text).not.toContain('kept by the pre-marker rule');
    expect(text).not.toMatch(COUNT_LINE);
  });

  it('renderNextConsole on a result with two diagnostics', async () => {
    const next = valueOf(await call<NextResult>('workflowNext', repo));
    const text = renderNextConsole({ ...next, diagnostics: [DIAGNOSTIC, PRE_MARKER_DIAGNOSTIC] } as NextResult);
    expect(text).toContain('next step: loop.implement@task:');
    expect(text).not.toContain('W_UNCOMMITTED_INPUTS');
    expect(text).not.toContain('W_INSTANCE_PRE_MARKER');
    expect(text).not.toMatch(COUNT_LINE);
  });
});
