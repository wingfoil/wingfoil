/**
 * task-135 / `bug-038-init-skips-secret-scan-of-builtin-templates` — `init` secret-scans the built-in
 * templates it is about to install, before writing anything (spec-007 §4 step 5, REQ-SEC-08).
 *
 * spec-007 §4 step 5 gives the scan a caller inside `init`: "run the scan over the built-in
 * directive/workflow templates about to be installed *before* writing any file. Any `blocking`
 * finding aborts `init` before writing partial assets, with a message naming the failing template
 * ... and `pattern_id`", as "an additional integrity gate run in the same pre-write pass" as the
 * REQ-SEC-10 schema check. Until this task nothing in `src/` outside `src/validation` called the
 * scanner.
 *
 * BDD: `p3-directives/P3.8-builtin-directive-templates.feature`, scenario "Error - a built-in template
 * carries a secret".
 *
 * The planted template uses the `builtinTemplates` test seam both init entry points already expose
 * (the one `bug-018`'s symmetry table drives), so the guard is pinned on BOTH write paths. Every
 * "secret" below is an obviously fake fixture value, assembled at runtime
 * (`test/validation/helpers/secret-fixtures.ts`, `security-secrets` S1, dl-122).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { exitCodeForResult, type CoreResult } from '../../src/core';
import { verifyBuiltinTemplates, type BuiltinTemplateSource } from '../../src/core/builtin-integrity';
import { initWingfoilProject, initWingfoilStorage } from '../../src/core/init';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { FAKE_PEM_HEADER, FAKE_PEM_RSA_HEADER } from '../validation/helpers/secret-fixtures';

/** A schema-valid built-in directive whose body is `bodyLine` — so only the secret scan can fail it. */
function directiveWithBody(name: string, bodyLine: string): BuiltinTemplateSource {
  return {
    name,
    kind: 'directive',
    content: `---
id: "${name}"
name: ${name}
type: directive
kind: built-in
title: Security
ref: [P3.8]
---

# Security

${bodyLine}
`,
  };
}

const PEM_LINE = FAKE_PEM_RSA_HEADER;
const SECRET_MESSAGE = 'built-in directive template secret scan failed: security (private-key-pem, line 12)';

describe('verifyBuiltinTemplates — secret scan of the built-in templates (bug-038, spec-007 §4 step 5)', () => {
  it('fails a schema-valid template carrying a blocking finding, naming the template and pattern', () => {
    expect(verifyBuiltinTemplates([directiveWithBody('security', PEM_LINE)])).toEqual({
      name: 'security',
      kind: 'directive',
      patternId: 'private-key-pem',
      message: SECRET_MESSAGE,
    });
  });

  it('names a workflow template with the workflow kind', () => {
    const workflow: BuiltinTemplateSource = {
      name: 'task',
      kind: 'workflow',
      content: `name: task\nkind: sub\ndescription: "${FAKE_PEM_HEADER}"\nphases:\n  - name: plan\n`,
    };
    expect(verifyBuiltinTemplates([workflow])?.message).toBe(
      'built-in workflow template secret scan failed: task (private-key-pem, line 3)',
    );
  });

  it('reports the FIRST failing source in list order (REQ-SYS-07)', () => {
    const clean = directiveWithBody('testing', 'Write the test first.');
    const leaking = directiveWithBody('security', PEM_LINE);
    expect(verifyBuiltinTemplates([clean, leaking, directiveWithBody('architecture', PEM_LINE)])?.name).toBe(
      'security',
    );
  });

  it('does not fail on a warn-only finding or on an exempt placeholder value (spec-007 §3, §4 step 6)', () => {
    const warnOnly = directiveWithBody('security', 'auth: fakeFAKEfakeFAKEfakeFAKEfakeFAKE1234');
    const placeholder = directiveWithBody('testing', 'export API_TOKEN=REDACTED');
    expect(verifyBuiltinTemplates([warnOnly, placeholder])).toBeNull();
  });
});

/** The two production write paths, each invoked with the REQ-SEC-10 source-list override. */
const WRITE_PATHS: ReadonlyArray<
  readonly [name: string, run: (root: string, builtin?: readonly BuiltinTemplateSource[]) => CoreResult<unknown>]
> = [
  ['initWingfoilStorage', (root, builtin) => initWingfoilStorage(root, builtin)],
  ['initWingfoilProject', (root, builtin) => initWingfoilProject(root, 'Scrum', builtin)],
];

describe.each(WRITE_PATHS)('bug-038 — init refuses a built-in template carrying a secret: %s', (_name, runInit) => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('aborts before writing, exit 1, naming the template and the pattern', () => {
    const result = runInit(repo, [directiveWithBody('security', PEM_LINE)]);

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: SECRET_MESSAGE } });
    expect(exitCodeForResult(result)).toBe(1);
    expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
    expect(git(repo, ['rev-list', '--all', '--count']).trim()).toBe('0');
  });

  it('still succeeds with the derived source list — the shipped templates pass the scan', () => {
    expect(runInit(repo).ok).toBe(true);
  });
});
