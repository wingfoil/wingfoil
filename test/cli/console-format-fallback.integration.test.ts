/**
 * What `--format console` prints today (`task-156-state-what-format-console-prints-today-until`,
 * `bug-152`, `bug-203`, spec-008 §2).
 *
 * `console` has no human rendering yet: `renderSuccess` (`src/cli/output.ts`) prints the payload
 * `--format json` prints, indented by two spaces. Its rendering is `dl-043`'s decision, deferred with
 * P5.1.4 to v0.4. Until then no output is coloured, so `--no-color` and `NO_COLOR` change nothing.
 *
 * This suite pins both facts on the compiled CLI, byte for byte, so the v0.4 change that gives
 * `console` a rendering (or colour) breaks it visibly and has to update spec-008 §2 with it.
 *
 * The fixture is the static `test/cli/fixtures/wingfoil-root/`; each payload stays far below the
 * 64 KiB a pipe buffers.
 */
import { CLI_FIXTURE_ROOT, runCliHarness, type SpawnedRun } from './helpers/spawn-cli';

/** The read commands that run on the static fixture root. */
const READ_COMMANDS: readonly (readonly string[])[] = [['paths'], ['dna', 'show'], ['directives', 'list'], ['workflow', 'list']];

function runCli(...args: readonly string[]): SpawnedRun {
  return runCliHarness(CLI_FIXTURE_ROOT, args);
}

/** `--format json`'s compact payload, indented by two spaces and closed by a newline. */
function indentedJson(compact: string): string {
  return JSON.stringify(JSON.parse(compact), null, 2) + '\n';
}

describe('`--format console` prints indented JSON until P5.1.4 (task-156, bug-152, spec-008 §2)', () => {
  it.each(READ_COMMANDS.map((command) => [command.join(' '), command]))(
    '`%s` with no `--format` prints exactly `--format json`\'s payload, indented',
    (_label, command) => {
      const asJson = runCli(...command, '--format', 'json');
      const byDefault = runCli(...command);
      const asConsole = runCli(...command, '--format', 'console');

      expect(asJson.status).toBe(0);
      expect(byDefault.status).toBe(0);
      expect(byDefault.stderr).toBe('');
      expect(byDefault.stdout).toBe(indentedJson(asJson.stdout));
      expect(asConsole.stdout).toBe(byDefault.stdout);
    },
  );
});

describe('`--no-color` and `NO_COLOR` change nothing while no output is coloured (task-156, bug-203, spec-008 §2)', () => {
  const ESC = '\u001b';
  let savedNoColor: string | undefined;

  beforeEach(() => {
    savedNoColor = process.env['NO_COLOR'];
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    if (savedNoColor === undefined) delete process.env['NO_COLOR'];
    else process.env['NO_COLOR'] = savedNoColor;
  });

  it.each(READ_COMMANDS.map((command) => [command.join(' '), command]))(
    '`%s` prints the same bytes, with no escape sequence, under `--no-color` and `NO_COLOR=1`',
    (_label, command) => {
      const plain = runCli(...command);
      const noColorFlag = runCli(...command, '--no-color');
      process.env['NO_COLOR'] = '1';
      const noColorEnv = runCli(...command);

      expect(plain.status).toBe(0);
      expect(plain.stdout).not.toContain(ESC);
      expect(noColorFlag.stdout).toBe(plain.stdout);
      expect(noColorEnv.stdout).toBe(plain.stdout);
    },
  );
});
