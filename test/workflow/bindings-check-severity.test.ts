/**
 * task-298 — `resolveToken`'s severity default for a `run` check (`dl-090` Q4, `dl-172` (a)).
 *
 * The loaded file always carries a `run` check's severity: `CheckBinding` fills `reject` after its checks, so that
 * a `severity` written on a manual check is still seen and refused. `BindingsYaml`'s type keeps `severity`
 * optional (a manual check has none), and `resolveToken` is total over that type: a `run` check built in code
 * without a severity resolves to `reject` as well.
 */
import { BindingsYaml, resolveToken } from '../../src/workflow/bindings';

describe('a run check resolves with severity reject unless it declares warn', () => {
  it('a binding built without severity resolves to reject', () => {
    const built: BindingsYaml = { checks: { 'lint.clean': { run: ['npm', 'run', 'lint'] } } };
    expect(resolveToken('lint.clean', 'check', built)).toEqual({ kind: 'run', source: 'project', argv: ['npm', 'run', 'lint'], severity: 'reject' });
  });

  it('a parsed binding without severity carries reject; a manual check carries none', () => {
    const parsed = BindingsYaml.parse({ checks: { 'lint.clean': { run: ['npm', 'run', 'lint'] }, 'demo.ok': { manual: true } } });
    expect(parsed.checks).toEqual({ 'lint.clean': { run: ['npm', 'run', 'lint'], severity: 'reject' }, 'demo.ok': { manual: true } });
  });
});
