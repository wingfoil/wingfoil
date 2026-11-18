/**
 * task-376 — the project the `workflow next` / `workflow show` offer suites run on
 * (`test/core/workflow-next-offers.test.ts`, `test/cli/workflow-next-offers.integration.test.ts`).
 *
 * The configuration mirrors this repository's shapes (`.wingfoil/memory.yaml`): a `{n}-{slug}` id pattern, a gate on
 * `pending`, a `{kind}-{version}` id pattern and a `{release}` path token, each type with a template so that the
 * commands the suites run as printed reach the real verbs. The identity of `makeTempGitRepo` is a member holding
 * `developer` and `approver`.
 */
import { commitAll, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';
import { runCliEntry } from './spawn-cli';

const typeBlock = (name: string, path: string, idPattern: string, sequence: string, gate: boolean): string =>
  [
    `  ${name}:`,
    `    path: "${path}"`,
    `    id_pattern: "${idPattern}"`,
    '    template:',
    '      frontmatter:',
    '        required: [ title ]',
    `      file: "memory/templates/${name}.md"`,
    '    states:',
    `      sequence: [ ${sequence} ]`,
    ...(gate ? ['      gates:', '        pending: { reject: draft }'] : []),
    '',
  ].join('\n');

const MEMORY_YAML = [
  'version: 1.0',
  'types:',
  typeBlock('bug', 'docs/bugs/{id}.md', 'bug-{n}-{slug}', 'draft, pending, open', true),
  typeBlock('decision-log', 'docs/dls/{id}.md', 'dl-{n}-{slug}', 'draft, pending, ready', true),
  typeBlock('release', 'docs/releases/{id}.md', '{kind}-{version}', 'draft, planning, released', false),
  typeBlock('task', 'docs/tasks/{release}/{id}.md', 'task-{n}-{slug}', 'draft, pending, done', true),
  '  plan:',
  '    path: "docs/plans/{id}.md"',
  '    id_pattern: "{workflow}-{phase}-plan"',
  '    template:',
  '      frontmatter:',
  '        required: [ title, workflow, phase ]',
  '      file: "memory/templates/plan.md"',
  '    states:',
  '      sequence: [ draft, active, done ]',
  '      waiting: [ active ]',
  '',
].join('\n');

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
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

const template = (type: string, extra = ''): string => `---\nid: ""\ntype: ${type}\ntitle: ""\nstatus: draft\n${extra}---\n\n## Body\n`;

/** A Memory document as a fixture commits it. */
export function elementDoc(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** What a fixture project holds besides the fixed configuration. */
export interface OffersProject {
  /** Workflow file stem → its YAML, included by the manifest in this order. */
  readonly workflows: Readonly<Record<string, string>>;
  /** Repository-relative path → content, committed with the configuration. */
  readonly files?: Readonly<Record<string, string>>;
  /** The content of `.wingfoil/workflows/bindings.yaml`, when the project has one. */
  readonly bindings?: string;
}

/** A temporary repository holding `project`, committed. */
export function makeOffersRepo(project: OffersProject): string {
  const root = makeTempGitRepo();
  const stems = Object.keys(project.workflows);
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${stems.map((stem) => `  - workflows/custom/${stem}.yaml\n`).join('')}`);
  for (const stem of stems) writeFixtureFile(root, `.wingfoil/workflows/custom/${stem}.yaml`, project.workflows[stem]!);
  if (project.bindings !== undefined) writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', project.bindings);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: [ testing ]\nglobal: []\n');
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  for (const type of ['bug', 'decision-log', 'task']) writeFixtureFile(root, `.wingfoil/memory/templates/${type}.md`, template(type));
  writeFixtureFile(root, '.wingfoil/memory/templates/release.md', template('release', 'version: ""\n'));
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', template('plan', 'workflow: ""\nphase: ""\nelement: ""\nparent: ""\n'));
  for (const [path, content] of Object.entries(project.files ?? {})) writeFixtureFile(root, path, content);
  commitAll(root, 'fixture configuration');
  return root;
}

/** `wingfoil workflow start <name>` on the compiled CLI; throws when it does not exit `0`. */
export function startWorkflow(root: string, name: string, element?: string): void {
  const run = runCliEntry(root, ['workflow', 'start', name, ...(element === undefined ? [] : ['--element', element])]);
  if (run.status !== 0) throw new Error(`workflow start ${name} exited ${run.status}: ${run.stderr}`);
}
