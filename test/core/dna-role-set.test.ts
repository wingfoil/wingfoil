/**
 * task-174 (`dl-049` (b), `bug-035`, `bug-184`) — the two core reads the MCP server's pre-flight and
 * its Resource refusals stand on.
 *
 * - `loadDnaRoleSet(root)`: the DNA role set `wingfoil mcp` reads once, before it serves (spec-014 §1,
 *   spec-004 §3.1 "derived from DNA at server start"), refused with the shared not-initialized message
 *   when the root has no `.wingfoil/` (task-143's `requireInitializedProject`).
 * - `coreErrorOf(error)`: the thrown-loader-error → `CoreError` mapping every read-only query applies,
 *   factored out so a surface that calls a loader directly (the MCP Resources) can give the same
 *   refusal its details.
 */
import { coreErrorOf, loadDnaRoleSet, WINGFOIL_NOT_INITIALIZED } from '../../src/core';
import { DiagnosticsError, ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DNA_YAML = `
version: 1.1
project:
  name: "Fixture Project"
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: qa
    - name: developer
    - name: architect
paths:
  sources: [ src/ ]
`;

describe('loadDnaRoleSet — the role set the MCP pre-flight reads (dl-049 (b))', () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach(removeTempDir));

  function repo(files: Readonly<Record<string, string>>): string {
    const root = makeTempGitRepo();
    roots.push(root);
    for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
    if (Object.keys(files).length > 0) commitAll(root, 'seed');
    return root;
  }

  it('returns the DNA team.roles names in declaration order', () => {
    expect(loadDnaRoleSet(repo({ '.wingfoil/dna.yaml': DNA_YAML }))).toEqual({ ok: true, value: ['qa', 'developer', 'architect'] });
  });

  it('refuses a root with no .wingfoil/ with the shared not-initialized message, naming no path', () => {
    const root = repo({});
    const result = loadDnaRoleSet(root);

    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: WINGFOIL_NOT_INITIALIZED } });
  });

  it('refuses an invalid dna.yaml as a VALIDATION error carrying the loader issues', () => {
    const result = loadDnaRoleSet(repo({ '.wingfoil/dna.yaml': 'version: 1.1\nteam: [ not, a, mapping ]\n' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(Array.isArray(result.error.details?.issues)).toBe(true);
  });
});

describe('coreErrorOf — a thrown loader error as a CoreError', () => {
  const issue = { code: 'E_X', path: 'a', file: 'f.yaml', message: 'bad' };

  it('a DiagnosticsError keeps its diagnostics under details.diagnostics', () => {
    const diagnostic = { code: 'E_Y', severity: 'error' as const, file: 'w.yaml', path: 'p', message: 'broken' };
    const error = new DiagnosticsError([diagnostic]);

    expect(coreErrorOf(error)).toEqual({ code: 'VALIDATION', message: error.message, details: { diagnostics: [diagnostic] } });
  });

  it('a ValidationError keeps its issues under details.issues', () => {
    const error = new ValidationError([issue]);

    expect(coreErrorOf(error)).toEqual({ code: 'VALIDATION', message: error.message, details: { issues: [issue] } });
  });

  it('an ENOENT is NOT_FOUND with its message', () => {
    const error = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });

    expect(coreErrorOf(error)).toEqual({ code: 'NOT_FOUND', message: 'ENOENT: no such file' });
  });

  it('anything else is not a domain refusal: null', () => {
    expect(coreErrorOf(new Error('boom'))).toBeNull();
    expect(coreErrorOf('a string')).toBeNull();
    expect(coreErrorOf(null)).toBeNull();
  });
});
