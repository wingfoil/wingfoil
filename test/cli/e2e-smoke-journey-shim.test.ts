/**
 * task-242 (green fix, coordinator finding 2026-10-15) — the Journey 4 run's `wingfoil` shim
 * (`scripts/e2e-smoke.cjs` `smokeJourney`) execs the CLI by an absolute path. The staging stage smokes the
 * `wingfoil` on `PATH` (`publish-staging.cjs`), so `argv[0]` can be the bare name `wingfoil`; a shim that
 * exec'd that name found itself first on `PATH` and re-exec'd forever, hanging the run. A bare name is now
 * resolved on the caller's `PATH` with the shim's own directory skipped, a name found nowhere fails the check,
 * and a run that never ends is killed after its timeout with the check failed.
 *
 * The timeout is `smokeJourney`'s fifth parameter, which `scripts/e2e-smoke.d.cts` (the red commit's file)
 * does not declare, so this file loads the script through `require` with its own signature.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}
type SmokeJourney = (
  template: string,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  script?: string,
  timeoutMs?: number,
) => Check;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { smokeJourney } = require('../../scripts/e2e-smoke.cjs') as { smokeJourney: SmokeJourney };

describe('task-242 — the journey shim never execs itself, and a run is bounded', () => {
  let dir: string;
  let bin: string;
  let script: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wf-task242-shim-'));
    bin = join(dir, 'bin');
    // A `wingfoil` on PATH, as the staging stage installs it: it answers --version only.
    mkdirSync(bin);
    writeFileSync(join(bin, 'wingfoil'), `#!/bin/sh\necho "stub 9.9.9"\n`);
    chmodSync(join(bin, 'wingfoil'), 0o755);
    // A journey stub: the nine commands, then an OK line carrying what the shim ran.
    const commands = [
      'workflow start deliver',
      'workflow next',
      'memory add --type task --title T --workflow deliver-1-plan',
      'memory submit task-001-t',
      'workflow status',
      'memory approve task-001-t --reason ok',
      'workflow next',
      'workflow finalize',
      'workflow end',
    ];
    script = join(dir, 'journey.sh');
    writeFileSync(script, `${commands.map((c) => `echo '$ wingfoil ${c}'; echo '[exit 0]'`).join('\n')}\necho "OK: $(wingfoil --version)"\n`);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('a bare-name argv resolves on the caller\'s PATH: the shim runs that wingfoil, once, and the check passes', () => {
    const started = Date.now();
    const check = smokeJourney('Scrum', ['wingfoil'], { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }, script, 30_000);
    expect(check).toEqual({
      label: '[Scrum/journey] bash docs/examples/06-workflow-approval/run.sh',
      ok: true,
      detail: 'exit 0, 9 wingfoil commands, OK: stub 9.9.9',
    });
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  it('a bare name found on no PATH directory fails the check with a reason, without running the script', () => {
    const check = smokeJourney('Scrum', ['wingfoil-not-installed-anywhere'], { ...process.env, PATH: bin }, script, 30_000);
    expect(check).toMatchObject({ ok: false, detail: 'could not find wingfoil-not-installed-anywhere on PATH' });
  });

  it('a script that never ends is killed after the timeout, the check failed with it', () => {
    const forever = join(dir, 'forever.sh');
    writeFileSync(forever, 'while :; do sleep 1; done\n');
    const check = smokeJourney('Kanban', [process.execPath], process.env, forever, 1_500);
    expect(check).toEqual({ label: '[Kanban/journey] bash docs/examples/06-workflow-approval/run.sh', ok: false, detail: 'timed out after 1.5 s' });
  });
});
