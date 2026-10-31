/**
 * task-327 review follow-ups (`bug-404`): the edge answers of `workflowReads` that the red does not pin, and the
 * `--candidate` default of `--repository`. Answers are the shapes of `workflow list --all --format json`
 * (`{ workflows, diagnostics }`) with the arrays emptied; a JSON array is the smallest valid JSON that is no object.
 */
import { spawnSync } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const smoke = require('../../scripts/e2e-smoke.cjs') as {
  workflowReads: (
    invoke: (args: readonly string[], cwd: string) => { status: number | null; stdout: string; stderr: string },
    root: string,
  ) => { checks: { label: string; ok: boolean; detail: string }[]; reads: Record<string, unknown> };
  formatReport: (report: Record<string, unknown>, meta: { command: readonly string[] }) => string;
  readsRepository: (parsed: { repository?: string }, candidate: boolean | undefined, root: string) => string | undefined;
};

/** A real process answer (`node -e` writing `stdout`, exit 0): its stderr is what the process wrote, not a stand-in. */
const answer = (stdout: string) => () => {
  const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', stdout], { encoding: 'utf-8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

describe('task-327 review follow-ups', () => {
  it('fails the list check at 0 workflows, says why, and renders non-empty cells', () => {
    const { checks, reads } = smoke.workflowReads(answer('{"workflows":[],"diagnostics":[]}'), '/r');
    expect(checks).toEqual([
      {
        label: '[repository] wingfoil workflow list --all --format json',
        ok: false,
        detail: 'exit 0, 0 workflows: a candidate repository always has workflows',
      },
    ]);
    expect(reads.show).toBeUndefined();
    const rows = smoke
      .formatReport({ ok: false, checks, workflowReads: reads }, { command: ['wingfoil'] })
      .split('\n')
      .filter((l) => l.startsWith('| `wingfoil workflow'));
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.split('|').map((c) => c.trim()).slice(1, 4).every((c) => c !== '')).toBe(true);
  });

  it('renders a non-empty Result for a show row that read no workflow', () => {
    const text = smoke.formatReport({ ok: true, checks: [], workflowReads: { show: [] } }, { command: ['wingfoil'] });
    expect(text).toContain('each of the 0 | 0 (0/0) | no workflow was read |');
  });

  it('words an exit-0 JSON answer that is no object as such, and keeps "not valid JSON" for text', () => {
    expect(smoke.workflowReads(answer('[1]'), '/r').checks[0]).toMatchObject({ ok: false, detail: 'stdout is not a JSON object' });
    expect(smoke.workflowReads(answer('null'), '/r').checks[0]?.detail).toBe('stdout is not a JSON object');
    expect(smoke.workflowReads(answer('Usage: x'), '/r').checks[0]?.detail).toBe('stdout is not valid JSON');
  });

  it('readsRepository: the flag wins, --candidate defaults to the checkout, otherwise none', () => {
    expect(smoke.readsRepository({ repository: '/x' }, true, '/checkout')).toBe('/x');
    expect(smoke.readsRepository({}, true, '/checkout')).toBe('/checkout');
    expect(smoke.readsRepository({}, undefined, '/checkout')).toBeUndefined();
    expect(smoke.readsRepository({ repository: '/x' }, undefined, '/checkout')).toBe('/x');
  });

  const rowsOf = (reads: Record<string, unknown>): string[] =>
    smoke
      .formatReport({ ok: false, checks: [], workflowReads: reads }, { command: ['wingfoil'] })
      .split('\n')
      .filter((l) => l.startsWith('| `wingfoil workflow'));

  it('the report words a non-object list answer as the check does, and an empty list as failed', () => {
    const [list] = rowsOf(smoke.workflowReads(answer('[1]'), '/r').reads);
    expect(list).toBe('| `wingfoil workflow list --all --format json` | 0 | stdout is not a JSON object |');
    const [empty] = rowsOf(smoke.workflowReads(answer('{"workflows":[],"diagnostics":[]}'), '/r').reads);
    expect(empty).toBe('| `wingfoil workflow list --all --format json` | 0 | 0 workflows: a candidate repository always has workflows |');
    const [text] = rowsOf(smoke.workflowReads(answer('Usage: x'), '/r').reads);
    expect(text).toContain('stdout is not valid JSON');
  });

  it('the report words a non-object show and status answer as the check does', () => {
    const list = '{"workflows":[{"name":"a"},{"name":"b"}],"diagnostics":[]}';
    const invoke = (args: readonly string[]) => answer(args[1] === 'list' ? list : args[2] === 'a' ? '{"diagnostics":[]}' : '[1]')();
    const { reads } = smoke.workflowReads(invoke, '/r');
    expect(rowsOf(reads)[1]).toContain('stdout not a JSON object: b');
    const status = rowsOf({ list: { exit: 0, workflows: 1, diagnostics: 0, errors: 0, codes: [] }, show: [{ name: 'a', exit: 0, diagnostics: 0, errors: 0 }], status: { exit: 0, diagnostics: null, errors: null, open: null, pendingApprovals: null, ungated: null, ungatedRoutedTo: null, notObject: true } })[2];
    expect(status).toBe('| `wingfoil workflow status --format json` | 0 | stdout is not a JSON object |');
  });
});
