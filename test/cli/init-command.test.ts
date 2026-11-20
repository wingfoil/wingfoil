/**
 * task-029-implement-wingfoil-init (P5.1.1, spec-008-cli-grammar §4, spec-005-cli-command-contract §1)
 * — `runInit`, the `wingfoil init` command handler. Drives the wizard-vs-`--template`/non-interactive
 * prompt matrix (spec-008 §4) and the exit-code contract (spec-005 §1) without a real TTY: the wizard
 * prompt and the core init flow are injected. Exit/stdout/stderr are spied exactly like the registrar
 * tests so the single spec-005 exit path is asserted, not simulated.
 */
import { runInit, type InitCliDeps } from '../../src/cli/init-command';
import { WINGFOIL_ALREADY_INITIALIZED } from '../../src/core/init';
import { coreErr, coreOk } from '../../src/core/types';
import type { InitProjectValue } from '../../src/core/init';
import { TEMPLATE_NAMES } from '../../src/storage';
import { reportWarning } from '../../src/validation/warning';

describe('runInit — wizard + --template (P5.1.1)', () => {
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let initCalls: Array<{ root: string; template: string }>;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    initCalls = [];
  });
  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  function deps(over: Partial<InitCliDeps> = {}): InitCliDeps {
    return {
      root: '/repo',
      isTTY: false,
      prompt: async () => '',
      init: (root, template) => {
        initCalls.push({ root, template });
        return coreOk<InitProjectValue>(
          { root, template, files: ['.wingfoil/dna.yaml'] },
          { sha: 'a'.repeat(40), message: `init ${template}` },
        );
      },
      ...over,
    };
  }

  it('AC (b): `--template Kanban` initializes non-interactively, no prompt, exit 0', async () => {
    const prompt = jest.fn(async () => 'never-called');
    await runInit({ template: 'Kanban', interactive: true, format: 'console' }, deps({ prompt }));

    expect(prompt).not.toHaveBeenCalled();
    expect(initCalls).toEqual([{ root: '/repo', template: 'Kanban' }]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('resolves the template name case-insensitively before calling core', async () => {
    await runInit({ template: 'scrum', interactive: true, format: 'console' }, deps());
    expect(initCalls).toEqual([{ root: '/repo', template: 'Scrum' }]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('AC (a): the wizard prompts in a TTY, uses the selected template, exit 0', async () => {
    const prompt = jest.fn(async () => 'Scrum');
    await runInit({ template: undefined, interactive: true, format: 'console' }, deps({ isTTY: true, prompt }));

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(initCalls).toEqual([{ root: '/repo', template: 'Scrum' }]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('an empty wizard answer falls back to the default template', async () => {
    const prompt = jest.fn(async () => '   ');
    await runInit({ template: undefined, interactive: true, format: 'console' }, deps({ isTTY: true, prompt }));
    expect(initCalls).toHaveLength(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('an unknown answer typed into the wizard is a usage error, exit 2, never calls core', async () => {
    const prompt = jest.fn(async () => 'Waterfallish');
    await runInit({ template: undefined, interactive: true, format: 'console' }, deps({ isTTY: true, prompt }));
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(initCalls).toHaveLength(0);
    const written = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('Waterfallish');
  });

  it('spec-008 §4: no --template + not a TTY fails with exit 2, missing-arg message, never calls core', async () => {
    await runInit({ template: undefined, interactive: true, format: 'console' }, deps({ isTTY: false }));
    // task-119 AC 1 (bug-140): the error names the legal values, read from the template registry.
    expect(stderrSpy).toHaveBeenCalledWith(
      `error: missing required argument: --template (one of: ${TEMPLATE_NAMES.join(', ')})\n`,
    );
    expect(TEMPLATE_NAMES).toEqual(['Scrum', 'Kanban']);
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(initCalls).toHaveLength(0);
  });

  it('spec-008 §4: --no-interactive fails immediately even in a TTY, exit 2', async () => {
    const prompt = jest.fn(async () => 'Scrum');
    await runInit({ template: undefined, interactive: false, format: 'console' }, deps({ isTTY: true, prompt }));
    expect(prompt).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(initCalls).toHaveLength(0);
  });

  it('an unknown --template value is a usage error: exit 2, never calls core', async () => {
    await runInit({ template: 'Nope', interactive: true, format: 'console' }, deps());
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(initCalls).toHaveLength(0);
    const written = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('Nope');
  });

  it('an invalid --format value is a usage error, exit 2, never calls core', async () => {
    await runInit({ template: 'Scrum', interactive: true, format: 'xml' }, deps());
    expect(stderrSpy).toHaveBeenCalledWith(
      'error: invalid --format value "xml", expected one of: console, json, yaml\n',
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(initCalls).toHaveLength(0);
  });

  it('AC (c): an already-initialized project renders the exact error and exits 1', async () => {
    const init: InitCliDeps['init'] = () =>
      coreErr({ code: 'VALIDATION', message: WINGFOIL_ALREADY_INITIALIZED });
    await runInit({ template: 'Scrum', interactive: true, format: 'console' }, deps({ init }));
    expect(stderrSpy).toHaveBeenCalledWith(`error: ${WINGFOIL_ALREADY_INITIALIZED}\n`);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("a refusal's details follow its error line, as on every other command (task-130 review, spec-005 §3.1)", async () => {
    const init: InitCliDeps['init'] = () =>
      coreErr({
        code: 'VALIDATION',
        message: 'cannot scaffold the project',
        details: { issues: [{ code: 'E_VALIDATION', path: '', file: '.wingfoil/dna.yaml', message: 'x', detail: 'why' }] },
      });
    await runInit({ template: 'Scrum', interactive: true, format: 'json' }, deps({ init }));
    const written = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(JSON.parse(written)).toEqual({
      error: 'cannot scaffold the project',
      details: [{ file: '.wingfoil/dna.yaml', detail: 'why' }],
    });
  });

  it('a successful init renders the result payload on stdout (spec-005 §2)', async () => {
    await runInit({ template: 'Kanban', interactive: true, format: 'json' }, deps());
    const written = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('"template":"Kanban"');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('runInit — the missing-template error reads the registry (task-119 AC 1, bug-140)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../../src/storage');
  });

  it('a template added to the registry appears in the message without editing it', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      let isolatedRunInit: typeof runInit | undefined;
      jest.isolateModules(() => {
        jest.doMock('../../src/storage', () => ({
          ...jest.requireActual<Record<string, unknown>>('../../src/storage'),
          TEMPLATE_NAMES: ['Scrum', 'Kanban', 'Shape Up'],
        }));
        ({ runInit: isolatedRunInit } = jest.requireActual<typeof import('../../src/cli/init-command')>(
          '../../src/cli/init-command',
        ));
      });
      await isolatedRunInit!(
        { template: undefined, interactive: false, format: 'console' },
        { root: '/repo', isTTY: false, prompt: async () => '' },
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        'error: missing required argument: --template (one of: Scrum, Kanban, Shape Up)\n',
      );
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

/**
 * task-375 AC 3 (red-first, `bug-304`; `spec-008` §6 "Warnings on a successful command"; approver ruling D3) — `init`
 * installs the warning sink around its core call and writes the result's warnings, like every registrar command: a
 * warning raised while `init` runs and one carried by the result both reach stderr through the one renderer, before the
 * payload, as `warning: <text>` in `console` and one `{"warning": "<text>"}` line each under `--format json`. Expected
 * red: today the raised warning goes to the fallback (`Warning: probe`) and `result.warnings` is not written.
 */
describe('task-375 AC 3 — runInit renders warnings through the one renderer (bug-304)', () => {
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  const written = (spy: jest.SpyInstance): string => spy.mock.calls.map((call) => String(call[0])).join('');

  function deps(): InitCliDeps {
    return {
      root: '/repo',
      isTTY: false,
      prompt: async () => '',
      init: (root, template) => {
        reportWarning('probe');
        return coreOk<InitProjectValue>({ root, template, files: ['.wingfoil/dna.yaml'] }, { sha: 'a'.repeat(40), message: `init ${template}` }, ['after']);
      },
    };
  }

  it('console: the raised warning, then the result warning, as `warning: ` lines on stderr; the payload on stdout; exit 0', async () => {
    await runInit({ template: 'Kanban', interactive: true, format: 'console' }, deps());
    expect(written(stderrSpy)).toBe('warning: probe\nwarning: after\n');
    expect(written(stdoutSpy)).toContain('Kanban');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('--format json: one {"warning"} line each on stderr, stdout still the JSON payload', async () => {
    await runInit({ template: 'Kanban', interactive: true, format: 'json' }, deps());
    expect(written(stderrSpy)).toBe('{"warning":"probe"}\n{"warning":"after"}\n');
    expect((JSON.parse(written(stdoutSpy)) as { template: string }).template).toBe('Kanban');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
