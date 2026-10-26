/**
 * task-295 review ruling A (a) (developer test) — the console renderers of `workflow rekey`, `workflow adopt` and
 * `workflow finalize` print a `--dry-run` plan as `workflow start` and `workflow create` do: the plan as JSON, indented
 * by two spaces, then one newline. The compiled CLI is pinned by `test/cli/workflow-console-dry-run.integration.test.ts`
 * (qa's red after review); this file reaches the guards in process.
 */
import { renderAdoptConsole, renderFinalizeConsole, renderRekeyConsole, type FinalizeResult } from '../../src/core';

const PLAN = { dryRun: true, subject: 'workflow: rekey life-1-plan life.seed life.seed-line', message: 'm', paths: [], diff: '' };
const PRINTED = `${JSON.stringify(PLAN, null, 2)}\n`;

describe('task-295 A (a) — a dry-run plan reaching a workflow console renderer is printed as the plan', () => {
  it('renderRekeyConsole', () => {
    expect(renderRekeyConsole(PLAN)).toBe(PRINTED);
  });

  it('renderAdoptConsole', () => {
    expect(renderAdoptConsole(PLAN)).toBe(PRINTED);
  });

  it('renderFinalizeConsole', () => {
    expect(renderFinalizeConsole(PLAN as unknown as FinalizeResult)).toBe(PRINTED);
  });
});
