/**
 * task-240 — W3 B6 gate: two arms of `src/core/agent-list.ts` no task-240 suite reached: a diagnostic with
 * no file renders without the `(<file>)` part, and `agent list` in a directory with no `.wingfoil/` is
 * refused before anything is read.
 */
import { agentListFn, diagnosticWarning } from '../../src/core/agent-list';
import { WINGFOIL_NOT_INITIALIZED } from '../../src/core/init';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

describe('agent list — gate arms (task-240)', () => {
  it('renders a diagnostic with no file as `<code>: <message>`', () => {
    expect(diagnosticWarning({ code: 'W_X', message: 'm' } as Parameters<typeof diagnosticWarning>[0])).toBe('W_X: m');
    expect(diagnosticWarning({ code: 'W_X', message: 'm', file: '' } as Parameters<typeof diagnosticWarning>[0])).toBe('W_X: m');
  });

  it('refuses an uninitialized project', async () => {
    const root = makeTempGitRepo();
    try {
      const result = await agentListFn({ root, options: {} });
      expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: WINGFOIL_NOT_INITIALIZED } });
    } finally {
      removeTempDir(root);
    }
  });
});
