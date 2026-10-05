/**
 * task-136 — the Workflow pillar's load-time diagnostics (spec-003-workflows-yaml-schema § "Diagnostics",
 * § "Names", Layer 1, Layer 2 top-level fields; `dl-109` K1 (a), K3; `bug-144`, `bug-145`).
 *
 * Every loader row this task owns fires on a minimal fixture with its code, severity, `file` (relative
 * to `.wingfoil/`), `path` and message; the array comes out in spec-003's order, byte-identical across
 * runs (REQ-SYS-07); the first error is the `VALIDATION` reason (exit 1) and every diagnostic rides in
 * `details`. An absent manifest is an empty registry; every built-in template and this repository's own
 * configuration load with no error.
 */
import { join } from 'path';

import { CORE_MODULES } from '../../src/core';
import { loadWorkflowsYaml } from '../../src/core/loaders';
import { TEMPLATES, templateScaffold, DEFAULT_TEMPLATE, resolveTemplate } from '../../src/storage/templates';
import { EXIT_VALIDATION, ValidationError } from '../../src/validation';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

/** Write a manifest that includes `files` (in order) and each file's content. */
function writeWorkflows(root: string, files: ReadonlyArray<readonly [string, string]>): void {
  const include = files.map(([name]) => `  - workflows/custom/${name}.yaml`).join('\n');
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${include}\n`);
  for (const [name, content] of files) writeFixtureFile(root, `.wingfoil/workflows/custom/${name}.yaml`, content);
}

/** Load, expect a throw, and return the thrown error's `diagnostics` array. */
function diagnosticsOf(root: string): { error: ValidationError; diagnostics: Diag[] } {
  try {
    loadWorkflowsYaml(root);
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    const diagnostics = (err as { diagnostics?: Diag[] }).diagnostics;
    expect(Array.isArray(diagnostics)).toBe(true);
    return { error: err as ValidationError, diagnostics: diagnostics ?? [] };
  }
  throw new Error('expected loadWorkflowsYaml to throw');
}

const MAIN = 'name: main\nkind: main\nphases:\n  - name: go\n';

describe('spec-003 § Diagnostics — each loader row owned by task-136 fires on a minimal fixture', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('E_WORKFLOW_INVALID_KIND — BDD P4.1 sc. 3 message', () => {
    writeWorkflows(repo, [
      ['main', MAIN],
      ['odd', 'name: odd\nkind: hybrid\nphases:\n  - name: p\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_INVALID_KIND',
        severity: 'error',
        file: 'workflows/custom/odd.yaml',
        path: 'kind',
        message: "invalid workflow kind 'hybrid' (allowed: main, sub)",
      },
    ]);
  });

  it('E_WORKFLOW_NAME_INVALID — a workflow name outside [a-z][a-z0-9-]*', () => {
    writeWorkflows(repo, [['main', 'name: Main.Flow\nkind: main\nphases:\n  - name: go\n']]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_NAME_INVALID',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'name',
        message: "invalid workflow name 'Main.Flow' (allowed: [a-z][a-z0-9-]*)",
      },
    ]);
  });

  it('E_WORKFLOW_DUPLICATE_NAME — two files declare one name (reported on the later file)', () => {
    writeWorkflows(repo, [
      ['main', MAIN],
      ['again', MAIN],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_DUPLICATE_NAME',
        severity: 'error',
        file: 'workflows/custom/again.yaml',
        path: 'name',
        message: "duplicate workflow name 'main' (already declared in workflows/custom/main.yaml)",
      },
    ]);
  });

  it('E_WORKFLOW_KIND_CONFLICT — kind declared together with startable or includable', () => {
    writeWorkflows(repo, [['main', 'name: main\nkind: main\nstartable: true\nphases:\n  - name: go\n']]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_KIND_CONFLICT',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'kind',
        message: "workflow 'main' declares kind together with startable/includable (declare one or the other)",
      },
    ]);
  });

  it('E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE — both booleans absent or false, no kind', () => {
    writeWorkflows(repo, [
      ['main', MAIN],
      ['idle', 'name: idle\nstartable: false\nphases:\n  - name: p\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE',
        severity: 'error',
        file: 'workflows/custom/idle.yaml',
        path: 'startable',
        message: "workflow 'idle' is neither startable nor includable (set startable: true or includable: true)",
      },
    ]);
  });

  it('E_NO_MAIN_WORKFLOW — a present manifest that loads no startable workflow', () => {
    writeWorkflows(repo, [['only-sub', 'name: only-sub\nincludable: true\nphases:\n  - name: p\n']]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_NO_MAIN_WORKFLOW',
        severity: 'error',
        file: 'workflows.yaml',
        path: 'include',
        message: 'no startable workflow: at least one included workflow must be startable (startable: true or kind: main)',
      },
    ]);
  });

  it('E_PHASE_NAME_INVALID — a phase name outside [a-z][a-z0-9-]*', () => {
    writeWorkflows(repo, [['main', 'name: main\nkind: main\nphases:\n  - name: go\n  - name: build.all\n']]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_PHASE_NAME_INVALID',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'phases[1].name',
        message: "invalid phase name 'build.all' (allowed: [a-z][a-z0-9-]*)",
      },
    ]);
  });

  it('E_PHASE_NAME_RESERVED — a phase named adhoc', () => {
    writeWorkflows(repo, [['main', 'name: main\nkind: main\nphases:\n  - name: adhoc\n']]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_PHASE_NAME_RESERVED',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'phases[0].name',
        message: "phase name 'adhoc' is reserved (a run without a step)",
      },
    ]);
  });

  it('E_PHASE_DUPLICATE_NAME — a phase name repeats within one workflow', () => {
    writeWorkflows(repo, [['main', 'name: main\nkind: main\nphases:\n  - name: go\n  - name: go\n']]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_PHASE_DUPLICATE_NAME',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'phases[1].name',
        message: "duplicate phase name 'go' in workflow 'main'",
      },
    ]);
  });

  it('E_WORKFLOW_INCLUDE_UNRESOLVED — a path-shaped phase include (bug-144, bug-145)', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nphases:\n  - name: delivery\n    include: workflows/custom/loop.yaml\n'],
      ['loop', 'name: loop\nkind: sub\nphases:\n  - name: p\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_INCLUDE_UNRESOLVED',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'phases[0].include',
        message: "include 'workflows/custom/loop.yaml' names no loaded workflow (a phase include is a workflow name, not a file path)",
      },
    ]);
  });

  it('E_WORKFLOW_INCLUDE_UNRESOLVED — a name no file declares', () => {
    writeWorkflows(repo, [['main', 'name: main\nkind: main\nphases:\n  - name: delivery\n    include: ghost\n']]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_INCLUDE_UNRESOLVED',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'phases[0].include',
        message: "include 'ghost' names no loaded workflow",
      },
    ]);
  });

  it('E_WORKFLOW_NOT_INCLUDABLE — include of a startable-only workflow (dl-109 K3)', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nphases:\n  - name: delivery\n    include: other\n'],
      ['other', 'name: other\nkind: main\nphases:\n  - name: p\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_NOT_INCLUDABLE',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'phases[0].include',
        message: "workflow 'other' is not includable",
      },
    ]);
  });

  it('E_WORKFLOW_ELEMENT_MISMATCH — iterate_over a type other than the included element', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nelement: release\nphases:\n  - name: loop\n    include: per-task\n    iterate_over: bug\n'],
      ['per-task', 'name: per-task\nkind: sub\nelement: task\nphases:\n  - name: p\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_ELEMENT_MISMATCH',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'phases[0].include',
        message: "workflow 'per-task' declares element 'task', but this phase iterates over 'bug'",
      },
    ]);
  });

  it('E_WORKFLOW_ELEMENT_MISMATCH — a plain include from a workflow bound to another type', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nelement: release\nphases:\n  - name: loop\n    include: per-task\n'],
      ['per-task', 'name: per-task\nkind: sub\nelement: task\nphases:\n  - name: p\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics.map((d) => [d.code, d.path, d.message])).toEqual([
      [
        'E_WORKFLOW_ELEMENT_MISMATCH',
        'phases[0].include',
        "workflow 'per-task' declares element 'task', but this phase neither iterates over 'task' nor runs in a workflow bound to 'task'",
      ],
    ]);
  });

  it('E_WORKFLOW_ELEMENT_MISMATCH — an element-bound workflow iterated over a collection', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nphases:\n  - name: loop\n    include: per-task\n    iterate_over: "dna:modules"\n'],
      ['per-task', 'name: per-task\nkind: sub\nelement: task\nphases:\n  - name: p\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      ['E_WORKFLOW_ELEMENT_MISMATCH', "workflow 'per-task' declares element 'task' and cannot be iterated over collection 'dna:modules'"],
    ]);
  });

  it('accepts the two legal element bindings (iterate_over the type; plain include from a workflow bound to it)', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nelement: release\nphases:\n  - name: loop\n    include: per-task\n    iterate_over: task\n'],
      ['task-wrap', 'name: task-wrap\nkind: sub\nelement: task\nphases:\n  - name: inner\n    include: per-task\n'],
      ['per-task', 'name: per-task\nkind: sub\nelement: task\nphases:\n  - name: p\n'],
    ]);
    expect(() => loadWorkflowsYaml(repo)).not.toThrow();
  });

  it('E_WORKFLOW_INCLUDE_CYCLE — message include cycle: <w1> -> … -> <w1>, reported once', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nphases:\n  - name: go\n    include: a\n'],
      ['a', 'name: a\nkind: sub\nphases:\n  - name: to-b\n    include: b\n'],
      ['b', 'name: b\nkind: sub\nphases:\n  - name: to-a\n    include: a\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_INCLUDE_CYCLE',
        severity: 'error',
        file: 'workflows/custom/a.yaml',
        path: 'phases[0].include',
        message: 'include cycle: a -> b -> a',
      },
    ]);
  });

  it('E_WORKFLOW_INCLUDE_CYCLE — a workflow including itself', () => {
    writeWorkflows(repo, [
      ['main', MAIN],
      ['self', 'name: self\nkind: sub\nphases:\n  - name: again\n    include: self\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([['E_WORKFLOW_INCLUDE_CYCLE', 'include cycle: self -> self']]);
  });

  it('E_WORKFLOW_INCLUDE_CYCLE — a three-workflow cycle is named in include order, from its first member', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nphases:\n  - name: go\n    include: a\n'],
      ['a', 'name: a\nkind: sub\nphases:\n  - name: to-b\n    include: b\n'],
      ['b', 'name: b\nkind: sub\nphases:\n  - name: to-c\n    include: c\n'],
      ['c', 'name: c\nkind: sub\nphases:\n  - name: to-a\n    include: a\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics.map((d) => [d.file, d.path, d.message])).toEqual([
      ['workflows/custom/a.yaml', 'phases[0].include', 'include cycle: a -> b -> c -> a'],
    ]);
  });

  it('E_WORKFLOW_INCLUDE_CYCLE — every cyclic component is reported, at its first member (review finding 3)', () => {
    // One component {a, b, c, d}: cycles a->b->c->a and b->c->d->b. The guarantee is one diagnostic at
    // the component's first member in manifest order (a), on each of its includes that enters the
    // component, naming the shortest cycle through that include; b->c->d->b is not reported from b,
    // whose shortest cycle passes through the earlier a.
    writeWorkflows(repo, [
      ['main', MAIN],
      ['a', 'name: a\nkind: sub\nphases:\n  - name: to-b\n    include: b\n'],
      ['b', 'name: b\nkind: sub\nphases:\n  - name: to-c\n    include: c\n'],
      ['c', 'name: c\nkind: sub\nphases:\n  - name: to-a\n    include: a\n  - name: to-d\n    include: d\n'],
      ['d', 'name: d\nkind: sub\nphases:\n  - name: to-b\n    include: b\n'],
    ]);
    expect(diagnosticsOf(repo).diagnostics.map((d) => [d.file, d.path, d.message])).toEqual([
      ['workflows/custom/a.yaml', 'phases[0].include', 'include cycle: a -> b -> c -> a'],
    ]);

    // With a->b->c->a removed, the remaining cycle is reported at its own first member, b.
    writeFixtureFile(repo, '.wingfoil/workflows/custom/c.yaml', 'name: c\nkind: sub\nphases:\n  - name: to-d\n    include: d\n');
    expect(diagnosticsOf(repo).diagnostics.map((d) => [d.file, d.path, d.message])).toEqual([
      ['workflows/custom/b.yaml', 'phases[0].include', 'include cycle: b -> c -> d -> b'],
    ]);
  });

  it('E_PHASE_FALLBACK_STEP_UNKNOWN — BDD P4.15 sc. 3 message (spec-017 Consequences)', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nphases:\n  - name: red\n  - name: review\n    fallback: { step: ghost }\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_PHASE_FALLBACK_STEP_UNKNOWN',
        severity: 'error',
        file: 'workflows/custom/main.yaml',
        path: 'phases[1].fallback.step',
        message: "fallback step 'ghost' not found in workflow",
      },
    ]);
  });

  it('E_WORKFLOW_FILE_NOT_FOUND is a diagnostic of workflows.yaml, path include[<i>]', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/main.yaml\n  - workflows/custom/missing.yaml\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/main.yaml', MAIN);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics).toEqual([
      {
        code: 'E_WORKFLOW_FILE_NOT_FOUND',
        severity: 'error',
        file: 'workflows.yaml',
        path: 'include[1]',
        message: 'included workflow file not found: workflows/custom/missing.yaml',
      },
    ]);
  });
});

describe('structural (Zod) failures keep spec-009 codes and do not cascade', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('a structurally invalid file reports E_VALIDATION at spec-003 paths; an include naming it is not unresolved', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nphases:\n  - name: go\n    include: broken\n'],
      ['broken', 'name: broken\nkind: sub\nphases:\n  - name: p\n    optional: maybe\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics.map((d) => [d.code, d.file, d.path])).toEqual([
      ['E_VALIDATION', 'workflows/custom/broken.yaml', 'phases[0].optional'],
    ]);
  });

  it('the cycle search does not walk into a structurally invalid file', () => {
    writeWorkflows(repo, [
      ['main', 'name: main\nkind: main\nphases:\n  - name: go\n    include: a\n'],
      ['a', 'name: a\nkind: sub\nphases:\n  - name: to-b\n    include: b\n'],
      ['b', 'name: b\nkind: sub\nphases:\n  - name: to-broken\n    include: broken\n  - name: to-a\n    include: a\n'],
      ['broken', 'name: broken\nkind: sub\nphases:\n  - name: p\n    optional: maybe\n'],
    ]);
    expect(diagnosticsOf(repo).diagnostics.map((d) => [d.code, d.file, d.message])).toEqual([
      ['E_WORKFLOW_INCLUDE_CYCLE', 'workflows/custom/a.yaml', 'include cycle: a -> b -> a'],
      ['E_VALIDATION', 'workflows/custom/broken.yaml', expect.any(String)],
    ]);
  });

  it('a file with no readable name leaves include resolution and the startable rule undecided', () => {
    writeWorkflows(repo, [
      ['loop', 'name: loop\nkind: sub\nphases:\n  - name: q\n    include: somewhere\n'],
      ['nameless', 'kind: main\nphases:\n  - name: p\n'],
    ]);
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics.map((d) => [d.code, d.file, d.path])).toEqual([['E_VALIDATION', 'workflows/custom/nameless.yaml', 'name']]);
  });
});

describe('YAML and manifest failures join the one array (review finding 5)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('a workflow file that is not YAML is an E_YAML_PARSE_ERROR diagnostic, after the earlier ones', () => {
    writeFixtureFile(
      repo,
      '.wingfoil/workflows.yaml',
      'version: 1.0\ninclude:\n  - workflows/custom/missing.yaml\n  - workflows/custom/m.yaml\n  - workflows/custom/p.yaml\n',
    );
    writeFixtureFile(repo, '.wingfoil/workflows/custom/m.yaml', 'name: m\nkind: main\nphases:\n  - name: go\n    fallback: { step: ghost }\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/p.yaml', 'name: p\nphases: [\n');
    const { error, diagnostics } = diagnosticsOf(repo);
    expect(diagnostics.map((d) => [d.code, d.severity, d.file, d.path])).toEqual([
      ['E_WORKFLOW_FILE_NOT_FOUND', 'error', 'workflows.yaml', 'include[0]'],
      ['E_PHASE_FALLBACK_STEP_UNKNOWN', 'error', 'workflows/custom/m.yaml', 'phases[0].fallback.step'],
      ['E_YAML_PARSE_ERROR', 'error', 'workflows/custom/p.yaml', ''],
    ]);
    expect(error.message).toMatch(/^E_WORKFLOW_FILE_NOT_FOUND include\[0\] \(workflows\.yaml\): /);
  });

  it('a manifest that is not YAML is one E_YAML_PARSE_ERROR diagnostic of workflows.yaml', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'include: [\n');
    expect(diagnosticsOf(repo).diagnostics.map((d) => [d.code, d.file, d.path])).toEqual([['E_YAML_PARSE_ERROR', 'workflows.yaml', '']]);
  });

  it('a structurally invalid manifest reports its Zod issues as diagnostics of workflows.yaml', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude: []\n');
    expect(diagnosticsOf(repo).diagnostics.map((d) => [d.code, d.file, d.path])).toEqual([['E_VALIDATION', 'workflows.yaml', 'include']]);
  });
});

describe('startable / includable — dl-109 K1 (a), BDD P4.1 sc. 1–2', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('kind: sub is includable-only — a sub-only registry has no startable workflow', () => {
    writeWorkflows(repo, [['dev-loop', 'name: dev-loop\nkind: sub\nphases:\n  - name: p\n']]);
    expect(diagnosticsOf(repo).diagnostics.map((d) => d.code)).toEqual(['E_NO_MAIN_WORKFLOW']);
  });

  it('kind: main is startable-only — including it is refused', () => {
    writeWorkflows(repo, [
      ['release-cycle', 'name: release-cycle\nkind: main\nphases:\n  - name: p\n'],
      ['host', 'name: host\nkind: main\nphases:\n  - name: q\n    include: release-cycle\n'],
    ]);
    expect(diagnosticsOf(repo).diagnostics.map((d) => d.code)).toEqual(['E_WORKFLOW_NOT_INCLUDABLE']);
  });

  it('a workflow declaring only includable: true is not startable', () => {
    writeWorkflows(repo, [['loop', 'name: loop\nincludable: true\nphases:\n  - name: p\n']]);
    expect(diagnosticsOf(repo).diagnostics.map((d) => d.code)).toEqual(['E_NO_MAIN_WORKFLOW']);
  });

  it('a workflow declaring both booleans is startable and includable', () => {
    writeWorkflows(repo, [
      ['both', 'name: both\nstartable: true\nincludable: true\nphases:\n  - name: p\n'],
      ['host', 'name: host\nkind: main\nphases:\n  - name: q\n    include: both\n'],
    ]);
    const { workflows } = loadWorkflowsYaml(repo);
    expect(workflows.map((w) => w.name)).toEqual(['both', 'host']);
  });
});

describe('spec-003 Layer 1 — an absent manifest is an empty registry', () => {
  it('loads { manifest: null, workflows: [], bindings: null, diagnostics: [] } with no diagnostic when .wingfoil/workflows.yaml is absent', () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, '.wingfoil/dna.yaml', 'version: 1.0\n');
      expect(loadWorkflowsYaml(repo)).toEqual({ manifest: null, workflows: [], bindings: null, diagnostics: [] });
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('spec-003 § Diagnostics — one deterministic order (REQ-SYS-07)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    // Manifest-level, then files in include order; workflow-level before phase-level; phases in
    // declared order; per phase, table order.
    writeFixtureFile(
      repo,
      '.wingfoil/workflows.yaml',
      'version: 1.0\ninclude:\n  - workflows/custom/zeta.yaml\n  - workflows/custom/missing.yaml\n  - workflows/custom/alpha.yaml\n',
    );
    writeFixtureFile(
      repo,
      '.wingfoil/workflows/custom/zeta.yaml',
      [
        'name: Zeta',
        'kind: sub',
        'includable: true',
        'phases:',
        '  - name: adhoc',
        '    fallback: { step: nowhere }',
        '    include: ghost',
        '  - name: adhoc',
        '',
      ].join('\n'),
    );
    writeFixtureFile(repo, '.wingfoil/workflows/custom/alpha.yaml', 'name: alpha\nkind: sub\nphases:\n  - name: x\n    include: alpha\n');
  });
  afterEach(() => removeTempDir(repo));

  it('emits the array in spec-003 order', () => {
    const { diagnostics } = diagnosticsOf(repo);
    expect(diagnostics.map((d) => `${d.file} ${d.path} ${d.code}`)).toEqual([
      'workflows.yaml include[1] E_WORKFLOW_FILE_NOT_FOUND',
      'workflows/custom/zeta.yaml name E_WORKFLOW_NAME_INVALID',
      'workflows/custom/zeta.yaml kind E_WORKFLOW_KIND_CONFLICT',
      'workflows/custom/zeta.yaml phases[0].name E_PHASE_NAME_RESERVED',
      'workflows/custom/zeta.yaml phases[0].fallback.step E_PHASE_FALLBACK_STEP_UNKNOWN',
      'workflows/custom/zeta.yaml phases[1].name E_PHASE_NAME_RESERVED',
      'workflows/custom/zeta.yaml phases[1].name E_PHASE_DUPLICATE_NAME',
      'workflows/custom/alpha.yaml phases[0].include E_WORKFLOW_INCLUDE_CYCLE',
    ]);
  });

  it('is byte-identical across two loads', () => {
    const first = JSON.stringify(diagnosticsOf(repo).diagnostics);
    const second = JSON.stringify(diagnosticsOf(repo).diagnostics);
    expect(second).toBe(first);
  });

  it('fails with VALIDATION (exit 1): the first error is the reason, every diagnostic is in details', async () => {
    const { error, diagnostics } = diagnosticsOf(repo);
    expect(error.exitCode).toBe(EXIT_VALIDATION);
    const reason = 'E_WORKFLOW_FILE_NOT_FOUND include[1] (workflows.yaml): included workflow file not found: workflows/custom/missing.yaml';
    expect(error.message).toBe(reason);

    const workflowList = CORE_MODULES.find((m) => m.name === 'workflow')?.operations.workflowList;
    if (!workflowList) throw new Error('fixture bug: workflow.workflowList not registered');
    const result = await workflowList.fn({ root: repo });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toBe(reason);
      expect(result.error.details).toEqual({ diagnostics });
    }
  });
});

describe('built-in templates load with zero errors under the new loader (bug-144, P4.17)', () => {
  it('the Kanban scaffold includes its delivery sub-workflow by name', () => {
    const kanban = resolveTemplate('Kanban')!;
    const lifeCycle = templateScaffold(kanban).find((f) => f.path === '.wingfoil/workflows/custom/sw-life-cycle.yaml');
    expect(lifeCycle?.content).toContain('include: kanban-delivery\n');
    expect(lifeCycle?.content).not.toContain('include: workflows/');
  });

  const cases: Array<[string, string]> = [
    ['default', DEFAULT_TEMPLATE],
    ...TEMPLATES.map((t): [string, string] => [t.name, t.name]),
  ];
  it.each(cases)('%s template scaffold loads with no diagnostic', (_label, templateName) => {
    const repo = makeTempGitRepo();
    try {
      for (const file of templateScaffold(resolveTemplate(templateName)!)) writeFixtureFile(repo, file.path, file.content);
      expect(() => loadWorkflowsYaml(repo)).not.toThrow();
    } finally {
      removeTempDir(repo);
    }
  });
});

describe("this repository's own .wingfoil/workflows/custom/ (characterization, spec-003 § Names)", () => {
  it('loads with no error from the task-136 rules', () => {
    const liveRoot = join(__dirname, '..', '..');
    const { workflows } = loadWorkflowsYaml(liveRoot);
    expect(workflows.length).toBeGreaterThanOrEqual(23);
  });
});
