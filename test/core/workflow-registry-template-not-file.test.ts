/**
 * task-283 review finding F3 (approver ruling (a), in-task): since task-283 the working-tree
 * `loadWorkflowRegistry` reads every Memory template `memory.yaml` declares up front. A declared template path
 * that is not a regular file (here a directory) must read as **absent** — `null`, as `readPathsAtRev` answers for
 * a tree at a commit — so the registry loads, instead of throwing `EISDIR`. On `2de79ef9` (before task-283) the
 * template was read only when a check asked for it, and this load succeeded.
 *
 * What is compared: the whole `WorkflowsLoadResult` (manifest, workflows, bindings, diagnostics) of a fixture
 * whose `task` template path is a directory, against the same fixture with that path absent.
 * - (i) no check needs the `task` template: the two results are equal;
 * - (ii) a check does need it (an action token `{task.nofield}`, which `workflowCoreDiagnostics` checks against
 *   the template's frontmatter fields): the outcome equals the absent case's, where today an absent template
 *   gives `templateFields` `null` and so no `the task template declares no field` warning
 *   (`src/core/workflow-core-checks.ts`, `tokenDiagnostics`). A control with a regular template lacking the
 *   field pins that the check really consults the template.
 */
import { mkdirSync } from 'fs';
import { join } from 'path';

import { loadWorkflowRegistry } from '../../src/core';
import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    template:
      file: "memory/templates/task.md"
      frontmatter:
        required: [ title ]
    states:
      sequence: [ draft, backlog, done ]
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, released ]
`;

/** A task workflow; with `needsTemplate`, an action token whose field the core checks look up in the template. */
function workflow(needsTemplate: boolean): string {
  return `name: deliver
startable: true
element: task
phases:
  - name: work
    role: developer
    actions:
${needsTemplate ? `      - 'cli.run(note: "{task.nofield}")'\n` : ''}      - element.set_state(done)
`;
}

const BINDINGS_YAML = `version: 1.0
actions:
  cli.run: { manual: true }
`;

type TemplateShape = 'directory' | 'absent' | 'file-without-field';

function project(template: TemplateShape, needsTemplate: boolean): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/deliver.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/deliver.yaml', workflow(needsTemplate));
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  if (template === 'directory') {
    mkdirSync(join(root, '.wingfoil/memory/templates/task.md'), { recursive: true });
    writeFixtureFile(root, '.wingfoil/memory/templates/task.md/README', 'a directory where a template file is declared\n');
  } else if (template === 'file-without-field') {
    writeFixtureFile(root, '.wingfoil/memory/templates/task.md', '---\nid: ""\ntype: task\ntitle: ""\nstatus: draft\n---\n\n## Body\n');
  }
  return root;
}

describe('task-283 review F3 — the working-tree registry reads a declared template path that is not a file as absent', () => {
  const roots: string[] = [];
  const make = (template: TemplateShape, needsTemplate: boolean): string => {
    const root = project(template, needsTemplate);
    roots.push(root);
    return root;
  };
  afterAll(() => roots.forEach((root) => removeTempDir(root)));

  it('(i) no check needs the template: loadWorkflowRegistry does not throw, and answers as with the template absent', () => {
    const absent = loadWorkflowRegistry(make('absent', false));
    expect(() => loadWorkflowRegistry(make('directory', false))).not.toThrow();
    expect(loadWorkflowRegistry(make('directory', false))).toEqual(absent);
    expect(absent.workflows.map((entry) => entry.name)).toEqual(['deliver']);
  });

  it('(ii) a check needs the template: the outcome equals the template-absent outcome (no field warning)', () => {
    const absent = loadWorkflowRegistry(make('absent', true));
    expect(absent.diagnostics.filter((diagnostic) => /template declares no field/.test(diagnostic.message))).toEqual([]);
    expect(loadWorkflowRegistry(make('directory', true))).toEqual(absent);
  });

  it('control: a regular template without the field does make the check warn (the template is consulted)', () => {
    const control = loadWorkflowRegistry(make('file-without-field', true));
    expect(control.diagnostics.map((diagnostic) => diagnostic.message)).toContainEqual(
      expect.stringContaining("token '{task.nofield}': the task template declares no field 'nofield'"),
    );
  });
});
