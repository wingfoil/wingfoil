/**
 * `CoreError.details` reaches the CLI operator in every format (task-130 AC1, `dl-055` option 1).
 *
 * Every core refusal built from a `ValidationError` carries `details.issues` — the offending `file`
 * and, for the illegal-transition contract string, the engine's `detail` (`dl-032` option (c)). Before
 * this task `emitError` rendered only the reason, so neither reached anyone. The rule under test:
 *
 * - console: the contract line `error: <reason>` is unchanged and comes first; one indented line per
 *   issue that names a file or a detail follows it;
 * - json/yaml: an additive `details` array of `{file?, detail?}`, absent when no issue has either, so
 *   a consumer that reads only `error` keeps parsing.
 *
 * BDD: `P5.1.4-cli-ux.feature`, "Error - a refusal's details follow its error line" — measured end to
 * end on a real illegal transition by `./program.integration.test.ts` (`memory submit` sc.2).
 *
 * Driven through `buildCliCommands`, the same seam `./registrar.test.ts` uses, against a synthetic
 * registry whose failures are fixed values — the rendering is what is measured, not a domain rule.
 */
import { load as yamlLoad } from 'js-yaml';

import { buildCliCommands, type CliCommand } from '../../src/cli/registrar';
import type { CoreModule } from '../../src/core/registry';
import { coreErr } from '../../src/core/types';

const CONTRACT = "illegal transition draft -> (none) for type 'task'";
const FILE = 'docs/memory/task/task-001-x.md';
const DETAIL = 'not a `gates` state: `approve` is only legal from a gate';

const MODULES: CoreModule[] = [
  {
    name: 'memory',
    operations: {
      // The `dl-032` shape: the message is the contract string, the explanation rides as detail.
      memoryApprove: {
        name: 'memoryApprove',
        mutates: true,
        fn: async () =>
          coreErr({
            code: 'INVALID_TRANSITION',
            message: CONTRACT,
            details: { issues: [{ code: 'E_INVALID_TRANSITION', path: 'status', file: FILE, message: CONTRACT, detail: DETAIL }] },
          }),
      },
      // A file-only issue (the `bug-031` case: which document failed), an issue with neither, and a
      // malformed entry — `details` is an open record, so its contents are checked, not trusted.
      memorySearch: {
        name: 'memorySearch',
        mutates: false,
        fn: async () =>
          coreErr({
            code: 'VALIDATION',
            message: 'cannot parse a memory document',
            details: {
              issues: [
                { code: 'E_YAML_PARSE_ERROR', path: '', file: FILE, message: 'bad indentation' },
                { code: 'E_VALIDATION', path: '', file: '', message: 'unlocated' },
                null,
              ],
            },
          }),
      },
      // The usual `ValidationError` shape: its message already embeds `(<file>)`, so repeating the
      // file in a detail would print it twice (task-130 review, finding 2).
      memoryHistory: {
        name: 'memoryHistory',
        mutates: false,
        fn: async () =>
          coreErr({
            code: 'VALIDATION',
            message: `E_VALIDATION status (${FILE}): bad`,
            details: {
              issues: [
                { code: 'E_VALIDATION', path: 'status', file: FILE, message: 'bad', detail: DETAIL },
                { code: 'E_VALIDATION', path: 'title', file: FILE, message: 'worse' },
              ],
            },
          }),
      },
      // A multi-line detail: every continuation line is indented, so none can begin with `error: `.
      memoryDeprecate: {
        name: 'memoryDeprecate',
        mutates: true,
        fn: async () =>
          coreErr({
            code: 'VALIDATION',
            message: 'refused',
            details: { issues: [{ code: 'E_VALIDATION', path: '', file: '', message: 'm', detail: 'first\nerror: second' }] },
          }),
      },
      // No `details` at all — the shape every pre-existing consumer sees, which must not change.
      memorySubmit: {
        name: 'memorySubmit',
        mutates: true,
        fn: async () => coreErr({ code: 'NOT_FOUND', message: 'document not found: task-999' }),
      },
    },
  },
];

function command(verb: string): CliCommand {
  const found = buildCliCommands(MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) }).find(
    (candidate) => candidate.noun === 'memory' && candidate.verb === verb,
  );
  if (!found) throw new Error(`fixture bug: no command memory ${verb}`);
  return found;
}

describe('AC1 — CoreError.details on the CLI surface (dl-055 option 1)', () => {
  let exitSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;

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

  const stderr = (): string => stderrSpy.mock.calls.map((call) => String(call[0])).join('');

  it('console: the contract line first and unchanged, then one indented `<file>: <detail>` line', async () => {
    await command('approve').run('console');
    expect(stderr()).toBe(`error: ${CONTRACT}\n  ${FILE}: ${DETAIL}\n`);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('console: a file-only issue is a line naming the file; an issue with neither, or no issue at all, adds none', async () => {
    await command('search').run('console');
    expect(stderr()).toBe(`error: cannot parse a memory document\n  ${FILE}\n`);
  });

  it('json: an additive `details` array beside `error`', async () => {
    await command('approve').run('json');
    expect(JSON.parse(stderr())).toEqual({ error: CONTRACT, details: [{ file: FILE, detail: DETAIL }] });
    expect(stderr().split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('json: an entry carries only the fields its issue has', async () => {
    await command('search').run('json');
    expect(JSON.parse(stderr())).toEqual({ error: 'cannot parse a memory document', details: [{ file: FILE }] });
  });

  it('yaml: the same object, serialized as YAML', async () => {
    await command('approve').run('yaml');
    expect(yamlLoad(stderr())).toEqual({ error: CONTRACT, details: [{ file: FILE, detail: DETAIL }] });
  });

  it('a file the reason already names is not repeated: the detail stays, a file-only entry is dropped', async () => {
    await command('history').run('console');
    await command('history').run('json');
    const reason = `E_VALIDATION status (${FILE}): bad`;
    expect(stderr()).toBe(
      `error: ${reason}\n  ${DETAIL}\n${JSON.stringify({ error: reason, details: [{ detail: DETAIL }] })}\n`,
    );
  });

  it('console: a multi-line detail indents every continuation line, so no line begins with `error: `', async () => {
    await command('deprecate').run('console');
    expect(stderr()).toBe('error: refused\n  first\n    error: second\n');
    expect(stderr().split('\n').filter((line) => line.startsWith('error: '))).toHaveLength(1);
  });

  it('characterization: an error with no details renders exactly as before, in every format', async () => {
    await command('submit').run('console');
    await command('submit').run('json');
    expect(stderr()).toBe(`error: document not found: task-999\n${JSON.stringify({ error: 'document not found: task-999' })}\n`);
  });
});
