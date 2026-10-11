/**
 * task-217 review F1 — `workflow start` on plan `id_pattern` / `path` shapes the `-<n>` suffix cannot make
 * unique (`spec-017` §7.1): `{phase}` only in the `path`, and a `path` with no `{id}`. A second start must
 * end — refused or started — never loop. Driven through the compiled CLI with a time limit, because a loop
 * in the operation is synchronous and no in-process timeout could stop it. Also the `{slug}` nit: the
 * collision check predicts the id from the title `memory add` will slug (`<workflow> — <phase>`).
 */
import { spawnSync } from 'child_process';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY } from './helpers/spawn-cli';

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
    - name: Alex
      email: alex@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const TEMPLATE = '---\nid: ""\ntype: plan\ntitle: ""\nstatus: draft\nworkflow: ""\nphase: ""\nelement: ""\n---\n\n## Steps\n';

function writeProject(root: string, plan: { path: string; idPattern: string }): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/checklist.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/checklist.yaml', 'name: checklist\nstartable: true\nphases:\n  - name: tick\n    role: developer\n');
  writeFixtureFile(
    root,
    '.wingfoil/memory.yaml',
    `version: 1.0\ntypes:\n  plan:\n    path: "${plan.path}"\n    id_pattern: "${plan.idPattern}"\n    template:\n      frontmatter:\n        required: [ title ]\n      file: "memory/templates/plan.md"\n    states:\n      sequence: [ draft, active, done ]\n      waiting: [ active ]\n`,
  );
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture');
}

/** `wingfoil workflow start checklist --format json`, killed after 20 s. */
function start(root: string): { timedOut: boolean; status: number | null; stdout: string; stderr: string } {
  const run = spawnSync('node', [CLI_ENTRY, 'workflow', 'start', 'checklist', '--format', 'json'], { cwd: root, encoding: 'utf-8', timeout: 20_000 });
  return { timedOut: run.signal !== null, status: run.status, stdout: run.stdout, stderr: run.stderr };
}

describe('workflow start ends on every plan pattern (task-217 review F1)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('`{phase}` only in the path: the second start is refused with `plan id already exists`, not looped', () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{phase}/{id}.md', idPattern: '{workflow}-plan' });
    expect(start(repo)).toMatchObject({ timedOut: false, status: 0 });
    const second = start(repo);
    expect(second).toMatchObject({ timedOut: false, status: 1, stderr: '{"error":"plan id already exists: checklist-plan"}\n' });
  });

  it('a path with no `{id}`: the second start ends with a refusal, nothing written', () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{scope}/plan.md', idPattern: '{workflow}-{phase}-plan' });
    expect(start(repo)).toMatchObject({ timedOut: false, status: 0 });
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    const second = start(repo);
    expect(second).toMatchObject({ timedOut: false, status: 1 });
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(head);
  });

  it('a `{slug}` id: the collision check slugs the title memory add writes, so the second start takes the suffix', () => {
    repo = makeTempGitRepo();
    writeProject(repo, { path: 'docs/plans/{id}.md', idPattern: '{phase}-{slug}' });
    const first = start(repo);
    expect(first).toMatchObject({ timedOut: false, status: 0 });
    expect((JSON.parse(first.stdout) as { instance: { id: string } }).instance.id).toBe('1-checklist-1');
    const second = start(repo);
    expect(second).toMatchObject({ timedOut: false, status: 0 });
    expect((JSON.parse(second.stdout) as { instance: { id: string } }).instance.id).toBe('1-2-checklist-1-2');
  });
});
