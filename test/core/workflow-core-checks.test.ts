/**
 * task-194 — the workflow **core** checks (spec-003-workflows-yaml-schema § "Diagnostics", rows whose
 * "Runs in" is `core`; spec-017 §2; `bug-150`): the checks that need `memory.yaml` / `dna.yaml` and
 * therefore run in `src/core` after the pillar-isolated loader.
 *
 * - AC 1: each core code fires on a fixture, after the loader's diagnostics, in spec-003's order
 *   (`bug-150`'s `role: nobody` / `memory.add(type: nonsense)` reproduction is one fixture).
 * - AC 2: a cadence `on:` event whose type or state `memory.yaml` does not declare is an error.
 * - AC 4: the registry read at `HEAD` ignores a dirty `dna.yaml`.
 * - AC 5: this repository raises exactly spec-017 §12's core set (characterization; task-199 removed all three
 *   warnings it held).
 * - task-199: a selection (`where` without `iterate_over`) puts the types it selects in scope for the
 *   phase's action arguments (spec-017 §4.1).
 *
 * AC 3 (the exit-state function) is `workflow-exit-state.test.ts`.
 */
import { rmSync } from 'fs';
import { join } from 'path';

// Through the `src/core` barrel: the public surface task-198/199/204/211 import.
import { CORE_MODULES, loadWorkflowRegistry, loadWorkflowRegistryAtHead, loadWorkflowRegistryAtRev, workflowCoreDiagnostics } from '../../src/core';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml, ValidationError } from '../../src/validation';
import { Workflow } from '../../src/workflow/schema';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

const MAIN_FILE = 'workflows/custom/main.yaml';
const SUB_FILE = 'workflows/custom/sub.yaml';

/** The core codes, in spec-003's table order (plus task-194's cadence row after the core errors). */
const CORE_CODES = [
  'E_PHASE_ROLE_UNKNOWN',
  'E_PHASE_APPROVER_UNKNOWN',
  'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN',
  'E_WORKFLOW_COLLECTION_UNRESOLVED',
  'E_PHASE_CADENCE_EVENT_UNKNOWN',
  'W_PHASE_TOKEN_OUT_OF_SCOPE',
  'W_PHASE_EXIT_STATE_UNDETERMINED',
  'W_PHASE_FALLBACK_STATE_MISMATCH',
  'W_PHASE_FALLBACK_NOT_REENTRANT',
];

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    template:
      frontmatter:
        required: [ title ]
      file: "memory/templates/task.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
      waiting: [ backlog, approved ]
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, triaged, closed ]
      gates:
        open: { reject: closed }
      waiting: [ triaged ]
  release-line:
    path: "docs/rl/{id}.md"
    states:
      sequence: [ draft, planning, active, done ]
      gates:
        planning: { reject: draft }
`;

const TASK_TEMPLATE = '---\nid: ""\ntype: task\ntitle: ""\nstatus: draft\nrelease: ""\n---\n\n## Body\n';

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Roberto
      email: roberto@example.invalid
      roles: [ approver ]
  roles:
    - name: developer
    - name: reviewer
    - name: approver
paths:
  sources: [ src/ ]
`;

/** A repository with the fixture configuration, `workflows` as `{ file: body }`, all committed. */
function writeProject(root: string, workflows: Record<string, string>, extra: Record<string, string> = {}): void {
  const include = Object.keys(workflows)
    .map((file) => `  - ${file}\n`)
    .join('');
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${include}`);
  for (const [file, body] of Object.entries(workflows)) writeFixtureFile(root, `.wingfoil/${file}`, body);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/task.md', TASK_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  for (const [path, content] of Object.entries(extra)) writeFixtureFile(root, path, content);
  commitAll(root, 'fixture');
}

/** The registry's full ordered diagnostics at `HEAD`, whether the load succeeds or throws. */
function diagnosticsAtHead(root: string): Diag[] {
  try {
    return [...(loadWorkflowRegistryAtRev(root, 'HEAD').diagnostics as Diag[])];
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    return [...(err as { diagnostics: Diag[] }).diagnostics];
  }
}

function core(diagnostics: readonly Diag[]): Diag[] {
  return diagnostics.filter((d) => CORE_CODES.includes(d.code));
}

const err = (path: string, code: string, message: string, file = MAIN_FILE): Diag => ({ code, severity: 'error', file, path, message });
const warn = (path: string, code: string, message: string, file = MAIN_FILE): Diag => ({ code, severity: 'warning', file, path, message });

describe('spec-003 § Diagnostics — the core rows (task-194)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('bug-150: `role: nobody` and `memory.add(type: nonsense)` are errors, and the load throws', () => {
    writeProject(repo, {
      [MAIN_FILE]: "name: main\nkind: main\nphases:\n  - name: capture\n    role: nobody\n    actions:\n      - 'memory.add(type: nonsense)'\n",
    });
    expect(() => loadWorkflowRegistryAtRev(repo, 'HEAD')).toThrow(ValidationError);
    expect(core(diagnosticsAtHead(repo))).toEqual([
      err('phases[0].role', 'E_PHASE_ROLE_UNKNOWN', "unknown role 'nobody' (not defined in dna.yaml)"),
      err('phases[0].actions[0]', 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', "unknown memory type 'nonsense' (not defined in memory.yaml)"),
    ]);
  });

  it('bug-150 through `workflow list`: exit 1 (VALIDATION), the role error is the reason', async () => {
    writeProject(repo, {
      [MAIN_FILE]: "name: main\nkind: main\nphases:\n  - name: capture\n    role: nobody\n    actions:\n      - 'memory.add(type: nonsense)'\n",
    });
    const op = CORE_MODULES.find((m) => m.name === 'workflow')!.operations['workflowList']!;
    const result = (await op.fn({ root: repo })) as { ok: boolean; error?: { code: string; message: string } };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('VALIDATION');
    expect(result.error?.message).toBe("E_PHASE_ROLE_UNKNOWN phases[0].role (workflows/custom/main.yaml): unknown role 'nobody' (not defined in dna.yaml)");
  });

  it('E_PHASE_ROLE_UNKNOWN — `role` and `approval.by_role`; a known role is silent', () => {
    writeProject(repo, {
      [MAIN_FILE]: 'name: main\nkind: main\nphases:\n  - name: a\n    role: developer\n  - name: b\n    role: ghost\n    approval: { by_role: phantom }\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      err('phases[1].role', 'E_PHASE_ROLE_UNKNOWN', "unknown role 'ghost' (not defined in dna.yaml)"),
      err('phases[1].approval.by_role', 'E_PHASE_ROLE_UNKNOWN', "unknown role 'phantom' (not defined in dna.yaml)"),
    ]);
  });

  it('E_PHASE_APPROVER_UNKNOWN — `by_person` matches a member name or email, or is an error', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        'name: main\nkind: main\nphases:\n  - name: a\n    approval: { by_person: Roberto }\n  - name: b\n    approval: { by_person: roberto@example.invalid }\n  - name: c\n    approval: { by_person: nobody@example.invalid }\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      err(
        'phases[2].approval.by_person',
        'E_PHASE_APPROVER_UNKNOWN',
        "unknown approver 'nobody@example.invalid' (no team.members[] name or email in dna.yaml)",
      ),
    ]);
  });

  it('approval declares exactly one of by_role / by_person: both is a structural error (spec-003 Layer 2)', () => {
    writeProject(repo, { [MAIN_FILE]: 'name: main\nkind: main\nphases:\n  - name: a\n    approval: { by_role: approver, by_person: Roberto }\n' });
    expect(diagnosticsAtHead(repo).map((d) => `${d.code} ${d.path}`)).toEqual(['E_VALIDATION phases[0].approval']);
  });

  it('E_WORKFLOW_ELEMENT_TYPE_UNKNOWN — element, Memory iterate_over, memory.add type, produces owner', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        "name: main\nkind: main\nelement: nonsense\nphases:\n  - name: loop\n    include: sub\n    iterate_over: ghost\n  - name: seed\n    actions:\n      - 'memory.add(type: phantom)'\n    produces:\n      - { type: phantom, path: 'docs/{phantom.id}.md' }\n",
      [SUB_FILE]: 'name: sub\nkind: sub\nphases:\n  - name: go\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      err('element', 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', "unknown memory type 'nonsense' (not defined in memory.yaml)"),
      err('phases[0].iterate_over', 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', "unknown memory type 'ghost' (not defined in memory.yaml)"),
      err('phases[1].actions[0]', 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', "unknown memory type 'phantom' (not defined in memory.yaml)"),
      err('phases[1].produces[0].type', 'E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', "unknown memory type 'phantom' (not defined in memory.yaml)"),
    ]);
  });

  it('E_WORKFLOW_COLLECTION_UNRESOLVED — an unknown dna: list, an unknown bindings: collection, a bad dna key', () => {
    writeProject(
      repo,
      {
        [MAIN_FILE]:
          'name: main\nkind: main\nphases:\n  - name: a\n    include: sub\n    iterate_over: dna:nothing.here\n  - name: b\n    include: sub\n    iterate_over: bindings:missing\n  - name: c\n    include: sub\n    iterate_over: dna:modules\n  - name: d\n    include: sub\n    iterate_over: bindings:templates\n  - name: e\n    include: sub\n    iterate_over: dna:paths.sources\n',
        [SUB_FILE]: 'name: sub\nkind: sub\nphases:\n  - name: go\n',
      },
      {
        '.wingfoil/dna.yaml': DNA_YAML.replace('    path: src/core\n', '    path: src/core\n  - name: "Bad Key"\n    path: src/bad\n'),
        '.wingfoil/workflows/bindings.yaml': 'version: 1.0\ncollections:\n  templates: [ default, kanban ]\n',
      },
    );
    expect(core(diagnosticsAtHead(repo))).toEqual([
      err('phases[0].iterate_over', 'E_WORKFLOW_COLLECTION_UNRESOLVED', "collection 'dna:nothing.here' names no list in dna.yaml"),
      err('phases[1].iterate_over', 'E_WORKFLOW_COLLECTION_UNRESOLVED', "collection 'bindings:missing' names no collection in bindings.yaml"),
      err(
        'phases[2].iterate_over',
        'E_WORKFLOW_COLLECTION_UNRESOLVED',
        "collection 'dna:modules' entry 1: collection key 'Bad Key' is outside the ID characters [a-z0-9-.]",
      ),
      err(
        'phases[4].iterate_over',
        'E_WORKFLOW_COLLECTION_UNRESOLVED',
        "collection 'dna:paths.sources' entry 0: collection key 'src/' is outside the ID characters [a-z0-9-.]",
      ),
    ]);
  });

  it('E_WORKFLOW_COLLECTION_UNRESOLVED — with no bindings.yaml, a bindings: collection names nothing', () => {
    writeProject(repo, {
      [MAIN_FILE]: 'name: main\nkind: main\nphases:\n  - name: a\n    include: sub\n    iterate_over: bindings:templates\n',
      [SUB_FILE]: 'name: sub\nkind: sub\nphases:\n  - name: go\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      err('phases[0].iterate_over', 'E_WORKFLOW_COLLECTION_UNRESOLVED', "collection 'bindings:templates' names no collection in bindings.yaml"),
    ]);
  });

  it('AC 2: a cadence event whose type or state memory.yaml does not declare is E_PHASE_CADENCE_EVENT_UNKNOWN', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        'name: main\nkind: main\nphases:\n  - name: a\n    cadence: { recurring: { on: task-done } }\n  - name: b\n    cadence: { recurring: { on: release-line-active } }\n  - name: c\n    cadence: { recurring: { on: bug-deprecated } }\n  - name: d\n    cadence: { recurring: { on: release-released } }\n  - name: e\n    cadence: { recurring: { on: task-shipped } }\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      err(
        'phases[3].cadence.recurring.on',
        'E_PHASE_CADENCE_EVENT_UNKNOWN',
        "cadence event 'release-released' names no memory.yaml type and state (<memory-type>-<state>)",
      ),
      err(
        'phases[4].cadence.recurring.on',
        'E_PHASE_CADENCE_EVENT_UNKNOWN',
        "cadence event 'task-shipped' names no memory.yaml type and state (<memory-type>-<state>)",
      ),
    ]);
  });

  it('W_PHASE_TOKEN_OUT_OF_SCOPE — a type in no enclosing scope, a field the template does not declare', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        'name: main\nkind: main\nelement: task\nphases:\n  - name: a\n    actions:\n      - git.create_branch("task/{task.id}")\n      - git.create_branch("bug/{bug.id}")\n    produces:\n      - "docs/{task.nofield}.md"\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn('phases[0].produces[0]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{task.nofield}': the task template declares no field 'nofield'"),
      warn('phases[0].actions[1]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{bug.id}' names no enclosing element (in scope: task)"),
    ]);
  });

  it('W_PHASE_TOKEN_OUT_OF_SCOPE — an included workflow sees its includer\'s element; a where value is checked', () => {
    writeProject(repo, {
      [MAIN_FILE]: 'name: main\nkind: main\nelement: task\nphases:\n  - name: loop\n    include: sub\n    iterate_over: bug\n    where: { tags: ["{task.release}", "{release-line.id}"] }\n',
      [SUB_FILE]: 'name: sub\nkind: sub\nelement: bug\nphases:\n  - name: go\n    produces:\n      - "docs/{task.id}/{bug.id}.md"\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn('phases[0].where.tags[1]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{release-line.id}' names no enclosing element (in scope: task)"),
    ]);
  });

  it('W_PHASE_TOKEN_OUT_OF_SCOPE — {element.<f>} names the innermost element, {item…} is a collection entry, an unbound workflow has no scope', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        'name: main\nkind: main\nphases:\n  - name: a\n    actions:\n      - git.create_branch("x/{element.id}")\n      - git.create_branch("x/{item.name}")\n  - name: b\n    include: sub\n    iterate_over: task\n',
      [SUB_FILE]: 'name: sub\nkind: sub\nelement: task\nphases:\n  - name: go\n    actions:\n      - git.create_branch("x/{element.release}")\n      - git.create_branch("x/{element.nofield}")\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn('phases[0].actions[0]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{element.id}' names no enclosing element (in scope: none)"),
      warn('phases[0].actions[1]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{element.nofield}': the task template declares no field 'nofield'", SUB_FILE),
    ]);
  });

  it('task-199: a selection puts the types it selects in scope for the phase\'s action arguments — not for produces, not for {element.<f>}', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        'name: main\nkind: main\nelement: task\nphases:\n  - name: derive\n    where: { type: [bug], status: [open] }\n    actions:\n' +
        '      - \'memory.add(type: task, bug: "{bug.id}")\'\n      - \'memory.add(type: task, line: "{release-line.id}")\'\n      - git.create_branch("x/{element.nofield}")\n' +
        '    produces:\n      - "docs/{bug.id}.md"\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn('phases[0].produces[0]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{bug.id}' names no enclosing element (in scope: task)"),
      warn('phases[0].actions[1]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{release-line.id}' names no enclosing element (in scope: task; selected: bug)"),
      warn('phases[0].actions[2]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{element.nofield}': the task template declares no field 'nofield'"),
    ]);
  });

  it('task-199: an iterating phase\'s where is a filter, not a selection — its types put nothing in scope', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        'name: main\nkind: main\nelement: task\nphases:\n  - name: loop\n    include: sub\n    iterate_over: bug\n    where: { type: [release-line] }\n',
      [SUB_FILE]: 'name: sub\nkind: sub\nelement: bug\nphases:\n  - name: go\n    actions:\n      - \'memory.add(type: task, line: "{release-line.id}")\'\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn('phases[0].actions[0]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{release-line.id}' names no enclosing element (in scope: task, bug)", SUB_FILE),
    ]);
  });

  it('a workflow no startable one reaches: its exit states are checked from its type\'s first state, its tokens are not', () => {
    writeProject(repo, {
      [MAIN_FILE]: 'name: main\nkind: main\nphases:\n  - name: go\n',
      [SUB_FILE]: 'name: sub\nkind: sub\nelement: task\nphases:\n  - name: go\n    actions:\n      - git.create_branch("x/{bug.id}")\n      - memory.approve\n',
      'workflows/custom/loose.yaml': 'name: loose\nkind: sub\nphases:\n  - name: go\n    actions:\n      - memory.submit\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn(
        'phases[0].actions[1]',
        'W_PHASE_EXIT_STATE_UNDETERMINED',
        'cannot apply \'memory.approve\' to task from state \'draft\': illegal `approve` from "draft": not a `gates` state — `approve` is only legal from a gate',
        SUB_FILE,
      ),
    ]);
  });

  it('a diagnostic raised on two include paths is reported once, with the first path\'s message', () => {
    writeProject(repo, {
      [MAIN_FILE]: 'name: main\nkind: main\nelement: task\nphases:\n  - name: one\n    include: sub\n',
      'workflows/custom/other.yaml': 'name: other\nkind: main\nelement: bug\nphases:\n  - name: one\n    include: sub\n',
      [SUB_FILE]: 'name: sub\nkind: sub\nphases:\n  - name: go\n    actions:\n      - git.create_branch("x/{dl.id}")\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn('phases[0].actions[0]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{dl.id}' names no enclosing element (in scope: task)", SUB_FILE),
    ]);
  });

  it('templates: one outside .wingfoil/, one with no frontmatter, one whose frontmatter is not a map — no field is checked', () => {
    const memory = MEMORY_YAML.replace(
      '  bug:\n    path: "docs/bugs/{id}.md"\n',
      '  bug:\n    path: "docs/bugs/{id}.md"\n    template:\n      frontmatter:\n        required: [ title ]\n      file: "../outside.md"\n',
    ).replace(
      '  release-line:\n    path: "docs/rl/{id}.md"\n',
      '  release-line:\n    path: "docs/rl/{id}.md"\n    template:\n      frontmatter:\n        required: [ title ]\n      file: "memory/templates/rl.md"\n',
    );
    const workflows = {
      [MAIN_FILE]:
        'name: main\nkind: main\nelement: task\nphases:\n  - name: a\n    include: sub\n    iterate_over: bug\n  - name: b\n    include: rl\n    iterate_over: release-line\n',
      [SUB_FILE]: 'name: sub\nkind: sub\nelement: bug\nphases:\n  - name: go\n    produces: [ "x/{bug.nofield}" ]\n',
      'workflows/custom/rl.yaml': 'name: rl\nkind: sub\nelement: release-line\nphases:\n  - name: go\n    produces: [ "x/{release-line.nofield}" ]\n',
    };
    writeProject(repo, workflows, { '.wingfoil/memory.yaml': memory, '.wingfoil/memory/templates/rl.md': 'no frontmatter\n', 'outside.md': '---\nid: x\n---\n' });
    expect(core(diagnosticsAtHead(repo))).toEqual([]);
    expect(core([...(loadWorkflowRegistry(repo).diagnostics as Diag[])])).toEqual([]);
    writeFixtureFile(repo, '.wingfoil/memory/templates/rl.md', '---\n- a list\n---\n');
    commitAll(repo, 'list frontmatter');
    expect(core(diagnosticsAtHead(repo))).toEqual([]);
  });

  it('the working tree reads the templates from disk, and an invalid dna.yaml is refused, not skipped', () => {
    writeProject(repo, { [MAIN_FILE]: 'name: main\nkind: main\nelement: task\nphases:\n  - name: a\n    produces: [ "x/{task.nofield}" ]\n' });
    expect(core([...(loadWorkflowRegistry(repo).diagnostics as Diag[])])).toEqual([
      warn('phases[0].produces[0]', 'W_PHASE_TOKEN_OUT_OF_SCOPE', "token '{task.nofield}': the task template declares no field 'nofield'"),
    ]);
    rmSync(join(repo, '.wingfoil/memory/templates/task.md'));
    expect(core([...(loadWorkflowRegistry(repo).diagnostics as Diag[])])).toEqual([]);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'version: 1.0\n');
    expect(() => loadWorkflowRegistry(repo)).toThrow(ValidationError);
  });

  it('W_PHASE_EXIT_STATE_UNDETERMINED — an action the machine cannot apply from the state the previous phase leaves', () => {
    writeProject(repo, {
      [MAIN_FILE]: 'name: main\nkind: main\nelement: task\nphases:\n  - name: a\n    actions:\n      - memory.submit\n  - name: b\n    actions:\n      - memory.submit\n  - name: c\n    actions:\n      - memory.approve\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn(
        'phases[1].actions[0]',
        'W_PHASE_EXIT_STATE_UNDETERMINED',
        'cannot apply \'memory.submit\' to task from state \'pending\': illegal `submit` from "pending": a `gates` state — its forward edge requires `approve`, not `submit`',
      ),
      warn('phases[2].actions[0]', 'W_PHASE_EXIT_STATE_UNDETERMINED', "cannot apply 'memory.approve' to task: the state it starts from is undetermined"),
    ]);
  });

  it('W_PHASE_FALLBACK_STATE_MISMATCH — set_state differs from the reject target of the gate the phase holds', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        'name: main\nkind: main\nelement: task\nphases:\n  - name: start\n    actions:\n      - element.set_state(in-progress)\n  - name: review\n    actions:\n      - memory.submit\n    fallback: { step: start, set_state: backlog }\n',
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn(
        'phases[1].fallback.set_state',
        'W_PHASE_FALLBACK_STATE_MISMATCH',
        "fallback set_state 'backlog' differs from the reject target 'in-progress' of task gate 'in-review'",
      ),
    ]);
  });

  it('W_PHASE_FALLBACK_NOT_REENTRANT — fallback to an earlier phase, but the gate rejects forward', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        "name: main\nkind: main\nphases:\n  - name: capture\n    actions:\n      - 'memory.add(type: bug)'\n      - memory.submit\n  - name: triage\n    actions:\n      - memory.approve\n    approval: { by_role: approver }\n    fallback: { step: capture }\n",
    });
    expect(core(diagnosticsAtHead(repo))).toEqual([
      warn(
        'phases[1].fallback.step',
        'W_PHASE_FALLBACK_NOT_REENTRANT',
        "fallback step 'capture' is an earlier phase, but a reject from bug gate 'open' goes forward to 'closed': the reject completes this phase",
      ),
    ]);
  });

  it('order: the loader diagnostics first, then the core ones in spec-003 order (file, workflow level, phases, table rows)', () => {
    writeProject(repo, {
      [MAIN_FILE]:
        'name: main\nkind: main\nelement: task\nphases:\n  - name: loop\n    include: sub\n    iterate_over: nope\n  - name: b\n    role: ghost\n    actions:\n      - git.create_branch("bug/{bug.id}")\n      - memory.approve\n',
      [SUB_FILE]: 'name: sub\nkind: sub\nelement: nope\nphases:\n  - name: go\n    role: phantom\n',
    });
    expect(diagnosticsAtHead(repo).map((d) => `${d.file} ${d.path} ${d.code}`)).toEqual([
      `${MAIN_FILE} phases[1].actions[0] W_WORKFLOW_UNBOUND_TOKEN`,
      `${MAIN_FILE} phases[0].iterate_over E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`,
      `${MAIN_FILE} phases[1].role E_PHASE_ROLE_UNKNOWN`,
      `${MAIN_FILE} phases[1].actions[0] W_PHASE_TOKEN_OUT_OF_SCOPE`,
      `${MAIN_FILE} phases[1].actions[1] W_PHASE_EXIT_STATE_UNDETERMINED`,
      `${SUB_FILE} element E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`,
      `${SUB_FILE} phases[0].role E_PHASE_ROLE_UNKNOWN`,
    ]);
  });

  it('a check whose input is absent is not decided: no dna.yaml, no memory.yaml → no core diagnostic', () => {
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n  - ${MAIN_FILE}\n  - ${SUB_FILE}\n`);
    writeFixtureFile(repo, `.wingfoil/${MAIN_FILE}`, "name: main\nkind: main\nphases:\n  - name: a\n    role: nobody\n    actions:\n      - 'memory.add(type: nonsense)'\n  - name: b\n    include: sub\n    iterate_over: dna:modules");
    writeFixtureFile(repo, `.wingfoil/${SUB_FILE}`, 'name: sub\nkind: sub\nphases:\n  - name: go\n');
    commitAll(repo, 'fixture');
    expect(core(diagnosticsAtHead(repo))).toEqual([]);
    expect(core([...(loadWorkflowRegistry(repo).diagnostics as Diag[])])).toEqual([]);
  });

  it('an absent manifest is an empty registry; an unborn HEAD is one too', () => {
    expect(loadWorkflowRegistryAtHead(repo)).toEqual({ manifest: null, workflows: [], bindings: null, diagnostics: [] });
    writeFixtureFile(repo, 'README.md', 'x\n');
    commitAll(repo, 'init');
    expect(loadWorkflowRegistryAtHead(repo)).toEqual({ manifest: null, workflows: [], bindings: null, diagnostics: [] });
  });
});

describe('workflowCoreDiagnostics — pure', () => {
  it('reads only its arguments: an empty registry, or no memory.yaml and no dna.yaml, gives nothing', () => {
    expect(workflowCoreDiagnostics({ include: [], workflows: [], bindings: null }, { memoryYaml: null, dnaYaml: null, templateFields: () => null })).toEqual([]);
  });

  // Review F1: two distinct problems at one path are two diagnostics; only the same problem raised on
  // two include paths is reported once.
  const PURE_MEMORY = MemoryYaml.parse(parseYaml(MEMORY_YAML, 'memory.yaml'));
  const pure = (workflows: unknown[], dnaYaml: unknown = null): Diag[] =>
    workflowCoreDiagnostics(
      { include: workflows.map((_, i) => `f${i}.yaml`), workflows: workflows.map((w) => Workflow.parse(w)), bindings: null },
      { memoryYaml: PURE_MEMORY, dnaYaml: dnaYaml as never, templateFields: () => new Set(['id', 'title']) },
    ) as Diag[];

  it('F1: two out-of-scope tokens in one action are two warnings', () => {
    const got = pure([{ name: 'main', kind: 'main', element: 'task', phases: [{ name: 'a', actions: ['git.x(a: "{foo.id}", b: "{bar.id}")'] }] }]);
    expect(got.map((d) => d.message)).toEqual([
      "token '{foo.id}' names no enclosing element (in scope: task)",
      "token '{bar.id}' names no enclosing element (in scope: task)",
    ]);
  });

  it('F1: every key problem of a dna.yaml list is its own error', () => {
    const dna = { team: { roles: [], members: [] }, modules: [{ name: 'Bad One', path: 'a' }, { name: 'Bad One', path: 'b' }, { path: 'c' }] };
    const got = pure(
      [
        { name: 'main', kind: 'main', phases: [{ name: 'a', include: 'sub', iterate_over: 'dna:modules' }] },
        { name: 'sub', kind: 'sub', phases: [{ name: 'g' }] },
      ],
      dna,
    );
    expect(got.map((d) => `${d.code} ${d.path} ${d.message}`)).toEqual([
      "E_WORKFLOW_COLLECTION_UNRESOLVED phases[0].iterate_over collection 'dna:modules' entry 0: collection key 'Bad One' is outside the ID characters [a-z0-9-.]",
      "E_WORKFLOW_COLLECTION_UNRESOLVED phases[0].iterate_over collection 'dna:modules' entry 1: collection key 'Bad One' is outside the ID characters [a-z0-9-.]",
      "E_WORKFLOW_COLLECTION_UNRESOLVED phases[0].iterate_over collection 'dna:modules' entry 1: duplicate collection key 'Bad One'",
      "E_WORKFLOW_COLLECTION_UNRESOLVED phases[0].iterate_over collection 'dna:modules' entry 2: a collection entry map needs an id or name field",
    ]);
  });

  it('task-199: a selection\'s scalar `type` is in scope; a type already in scope or repeated is listed once; a type-less where selects nothing', () => {
    const selecting = (where: Record<string, unknown>) =>
      pure([{ name: 'main', kind: 'main', element: 'task', phases: [{ name: 'a', where, actions: ['git.x(a: "{bug.id}", b: "{foo.id}")'] }] }]).map((d) => d.message);
    expect(selecting({ type: 'bug' })).toEqual(["token '{foo.id}' names no enclosing element (in scope: task; selected: bug)"]);
    expect(selecting({ type: ['task', 'bug', 'bug'] })).toEqual(["token '{foo.id}' names no enclosing element (in scope: task; selected: bug)"]);
    expect(selecting({ status: 'open' })).toEqual([
      "token '{bug.id}' names no enclosing element (in scope: task)",
      "token '{foo.id}' names no enclosing element (in scope: task)",
    ]);
  });

  it('F3: a typed set_state on a selection of its type holds the gate it approves out of (fallback mismatch fires as for memory.approve)', () => {
    const phase = (action: string) => ({
      name: 'a',
      where: { type: 'task', status: 'pending' },
      actions: [action],
      approval: { by_role: 'developer' },
      fallback: { step: 'a', set_state: 'done' },
    });
    const expected = ["W_PHASE_FALLBACK_STATE_MISMATCH phases[0].fallback.set_state fallback set_state 'done' differs from the reject target 'draft' of task gate 'pending'"];
    for (const action of ['memory.approve', 'task.set_state(backlog)']) {
      const got = pure([{ name: 'main', kind: 'main', phases: [phase(action)] }]);
      expect(got.map((d) => `${d.code} ${d.path} ${d.message}`)).toEqual(expected);
    }
  });
});

describe('AC 4 — every read is at HEAD', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('a dirty dna.yaml that removes a role still validates against the committed roles', () => {
    writeProject(repo, { [MAIN_FILE]: 'name: main\nkind: main\nphases:\n  - name: a\n    role: developer\n' });
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML.replace('    - name: developer\n', ''));
    expect(core(diagnosticsAtHead(repo))).toEqual([]);
    // The working-tree registry (`workflow list`'s baseline until task-204) sees the edit.
    let thrown: unknown;
    try {
      loadWorkflowRegistry(repo);
    } catch (error) {
      thrown = error;
    }
    expect(core((thrown as { diagnostics: Diag[] }).diagnostics)).toEqual([
      err('phases[0].role', 'E_PHASE_ROLE_UNKNOWN', "unknown role 'developer' (not defined in dna.yaml)"),
    ]);
  });

  it('a dirty memory.yaml and a dirty workflow file are not read either', () => {
    writeProject(repo, { [MAIN_FILE]: "name: main\nkind: main\nphases:\n  - name: a\n    actions:\n      - 'memory.add(type: bug)'\n" });
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML.replace('  bug:\n', '  bugz:\n'));
    writeFixtureFile(repo, `.wingfoil/${MAIN_FILE}`, 'name: main\nkind: main\nphases:\n  - name: a\n    role: ghost\n');
    expect(core(diagnosticsAtHead(repo))).toEqual([]);
  });
});

describe('AC 5 — this repository raises exactly spec-017 §12\'s core set (characterization)', () => {
  // task-199 rewrote release-planning.build-backlog against a selection (its two out-of-scope tokens are
  // gone) and dropped bug-ingest.triage's fallback, which a reject to `closed` could never re-enter; the
  // full repository warning set is pinned by workflow-repository-conformance.test.ts.
  it('no core diagnostic, no error', () => {
    const root = join(__dirname, '..', '..');
    const registry = loadWorkflowRegistryAtRev(root, 'HEAD');
    expect(registry.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(core(registry.diagnostics as Diag[])).toEqual([]);
  });
});
