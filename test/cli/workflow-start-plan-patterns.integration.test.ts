/**
 * task-217 review F1 — `workflow start` on plan `id_pattern` / `path` shapes the `-<n>` suffix cannot make
 * unique (`spec-017` §7.1): `{phase}` only in the `path`, and a `path` with no `{id}`. A second start must
 * end — refused or started — never loop. Driven through the compiled CLI with a time limit, because a loop
 * in the operation is synchronous and no in-process timeout could stop it. Also the `{slug}` nit: the
 * collision check predicts the id from the title `memory add` will slug (`<workflow> — <phase>`).
 *
 * task-346 AC 2 item 7 (`bug-491`'s Steps, `spec-017` §7.1 as amended): on an `init --template Kanban` project whose
 * plan type is edited to `plan-{n}-{slug}` / `docs/memory/plan/{id}.md`, `start` writes `workflow` and `phase` as
 * fields, accepts `--set phase=`, and the plan it adds can be submitted.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry, spawnCapture } from './helpers/spawn-cli';

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

/**
 * `wingfoil workflow start checklist --format json`, killed after 20 s. A killed child ends on a signal,
 * and `spawnCapture` throws on a signal, so a run returned here did not time out: `timedOut` is `false`.
 */
function start(root: string): { timedOut: boolean; status: number; stdout: string; stderr: string } {
  const run = spawnCapture('node', [CLI_ENTRY, 'workflow', 'start', 'checklist', '--format', 'json'], { cwd: root, timeout: 20_000 });
  return { timedOut: false, ...run };
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

describe('task-346 AC 2 item 7 — bug-491\'s Steps on the compiled CLI: a numbered plan type gets workflow and phase', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  /** `init --template Kanban`, the plan type edited as bug-491's Steps edit it, committed. */
  function numberedKanban(): string {
    const root = makeTempGitRepo();
    const init = runCliEntry(root, ['init', '--template', 'Kanban', '--no-interactive']);
    if (init.status !== 0) throw new Error(`init exited ${init.status}: ${init.stderr}`);
    const path = join(root, '.wingfoil/memory.yaml');
    const scaffold = readFileSync(path, 'utf-8');
    const from = '    path: docs/memory/plan/{scope}/{id}.md\n    id_pattern: "{workflow}-{phase}-plan"\n';
    if (!scaffold.includes(from)) throw new Error('fixture bug: the scaffolded plan type moved');
    writeFileSync(path, scaffold.replace(from, '    path: docs/memory/plan/{id}.md\n    id_pattern: "plan-{n}-{slug}"\n'));
    commitAll(root, 'plan type: numbered');
    return root;
  }

  it('workflow start decision-log-ingest: exit 0, the plan draft with workflow and phase "1"; --set phase= accepted; memory submit succeeds', () => {
    repo = numberedKanban();

    const first = runCliEntry(repo, ['workflow', 'start', 'decision-log-ingest', '--format', 'json']);
    expect([first.status, first.stderr]).toEqual([0, '']);
    const id = (JSON.parse(first.stdout) as { instance: { id: string } }).instance.id;
    expect(id).toBe('plan-001-decision-log-ingest-1');
    const plan = join(repo, 'docs/memory/plan', `${id}.md`);
    const document = readFileSync(plan, 'utf-8');
    expect(document).toMatch(/^status: draft$/m);
    expect(document).toMatch(/^workflow: "decision-log-ingest"$/m);
    expect(document).toMatch(/^phase: "1"$/m);

    const second = runCliEntry(repo, ['workflow', 'start', 'adr-ingest', '--set', 'phase=capture', '--format', 'json']);
    expect([second.status, second.stderr]).toEqual([0, '']);
    const secondId = (JSON.parse(second.stdout) as { instance: { id: string } }).instance.id;
    expect(readFileSync(join(repo, 'docs/memory/plan', `${secondId}.md`), 'utf-8')).toMatch(/^phase: "capture"$/m);

    appendFileSync(plan, '\nCapture the decision, then close the run.\n');
    const submitted = runCliEntry(repo, ['memory', 'submit', id]);
    expect([submitted.status, submitted.stderr]).toEqual([0, '']);
    expect(readFileSync(plan, 'utf-8')).toMatch(/^status: active$/m);
  });

  it('(unchanged) --set scope=x on the same type: exit 1, `--set scope: … has no token {scope} …`, nothing written', () => {
    repo = numberedKanban();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    const run = runCliEntry(repo, ['workflow', 'start', 'adr-ingest', '--set', 'scope=x']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', "error: --set scope: memory type 'plan' has no token {scope} in its id_pattern or path\n"]);
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(head);
  });
});
