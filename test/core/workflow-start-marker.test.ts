/**
 * task-345 — the start marker and the instances it opens (`dl-217` (a); `spec-017` §1.3, §2, §3.1–§3.3, §7.1,
 * §7.4; `spec-008` §2), through the registered `CORE_MODULES` operations on fixture repositories committed at
 * `HEAD`, and through the compiled CLI where the bytes a user sees are the contract.
 *
 * - AC 1 (red-first): `workflow start`'s add commit carries `WingFoil-Start: <workflow>` in its final trailer
 *   paragraph, before `WingFoil-Version:` (and the dry run's `message` shows it); a plan added after a marked
 *   start without the marker — by `memory add` or by hand — is no instance, whatever it names, and a marked start
 *   whose plan is now `done` still counts. The pre-marker rule is transitory: `workflow status` reports each
 *   instance it keeps open with `W_INSTANCE_PRE_MARKER` (the design addendum's cases (f)–(i)); no other command
 *   raises it.
 * - AC 2 (red-first): an open plan naming a workflow the registry does not load is no instance, marked or not, and
 *   stays reported by `W_INSTANCE_WORKFLOW_UNKNOWN` (in the deduction and in `workflow list`).
 * - AC 3 (characterization, green before and after): in a repository with no marked start, every open plan of a
 *   loaded startable main is an instance, in the same start order, and a later marked start keeps them.
 *
 * task-346 (`bug-390`, `spec-017` §7.1 as amended): `start` writes the add commit alone, so (a) counts one commit;
 * the plan is left `draft`, so (e) submits it before it is marked `done`.
 *
 * Fixture: the `writeProject` repository of `test/core/workflow-start-end.test.ts` (`release-cycle` with
 * `element: release`, the element-less `report-bug` and `checklist`, the sub `dev-loop`; the `plan` type
 * `{workflow}-{phase}-plan` under `docs/plans/{scope}/`), plus a `roles.yaml` for the CLI.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { CORE_MODULES, deduceWorkflowStateAtHead, enumerateOperations, renderStatusConsole, type StatusResult } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { runAsDryRun } from '../../src/core/dry-run';
// task-345: the marker's key, exported by the deduction module (`spec-017` §3.1).
import { START_TRAILER } from '../../src/workflow/deduce';
import { runCliEntry } from '../cli/helpers/spawn-cli';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  plan:
    path: "docs/plans/{scope}/{id}.md"
    id_pattern: "{workflow}-{phase}-plan"
    template:
      frontmatter:
        required: [ title, workflow, phase ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const PLAN_TEMPLATE = `---
id: ""
type: plan
title: ""
status: draft
workflow: ""
phase: ""
element: ""
parent: ""
---

## Steps

<!-- placeholder -->
`;

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
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
description: "Deliver one release"
phases:
  - name: ship
    role: developer
    actions:
      - element.set_state(released)
`;

const REPORT_BUG = `name: report-bug
startable: true
description: "Report a bug"
phases:
  - name: triage
    role: developer
    produces: [ "README.md" ]
`;

const CHECKLIST = `name: checklist
startable: true
phases:
  - name: tick
    role: developer
`;

const DEV_LOOP = `name: dev-loop
kind: sub
phases:
  - name: red
    role: developer
`;

const WORKFLOWS = ['release-cycle', 'report-bug', 'checklist', 'dev-loop'];

const workflowsYaml = (names: readonly string[]): string => `version: 1.0\ninclude:\n${names.map((name) => `  - workflows/custom/${name}.yaml\n`).join('')}`;

/** The repository of `test/core/workflow-start-end.test.ts`, with a `roles.yaml`, committed. */
function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', workflowsYaml(WORKFLOWS));
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/report-bug.yaml', REPORT_BUG);
  writeFixtureFile(root, '.wingfoil/workflows/custom/checklist.yaml', CHECKLIST);
  writeFixtureFile(root, '.wingfoil/workflows/custom/dev-loop.yaml', DEV_LOOP);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: []\nglobal: []\n');
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  writeFixtureFile(root, 'docs/releases/minor-v1.md', '---\nid: "minor-v1"\ntype: release\ntitle: "minor-v1"\nstatus: in-development\n---\n\n## Body\n');
  commitAll(root, 'fixture');
}

/** A plan file as a hand-written one looks (no WingFoil trailer on its commit). */
function planFile(id: string, workflow: string, status: string): string {
  return `---\nid: "${id}"\ntype: plan\ntitle: "${id}"\nstatus: ${status}\nworkflow: "${workflow}"\nphase: "1"\nelement: ""\nparent: ""\n---\n`;
}

/** Commit a plan by hand at `docs/plans/<scope>/<id>.md` with the subject `wf(plan): add <id>`; answer its path. */
function commitPlanByHand(root: string, id: string, workflow: string, status: string, scope: string): string {
  const path = `docs/plans/${scope}/${id}.md`;
  writeFixtureFile(root, path, planFile(id, workflow, status));
  commitAll(root, `wf(plan): add ${id}`);
  return path;
}

function operation(module: string, name: string): CoreFn<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === module && entry.operation.name === name);
  if (found === undefined) throw new Error(`${module}.${name} is not registered`);
  return found.operation.fn;
}

/** An operation's answer as a `CoreResult` (some operations answer their value bare). */
async function call(module: string, name: string, params: Record<string, unknown>): Promise<CoreResult<unknown>> {
  const value = await operation(module, name)(params);
  return (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<unknown>;
}

function valueOf<T>(result: CoreResult<unknown>, what: string): T {
  if (!result.ok) throw new Error(`expected ${what}, got ${result.error.code}: ${result.error.message}`);
  return result.value as T;
}

interface StartValue {
  readonly instance: { readonly id: string };
  readonly commits: readonly string[];
}

interface DryRunValue {
  readonly dryRun: boolean;
  readonly subject: string;
  readonly message: string;
  readonly paths: readonly string[];
  readonly diff: string;
}

interface Diagnostic {
  readonly code: string;
  readonly severity: string;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

const start = async (root: string, name: string, options: Record<string, string> = {}): Promise<StartValue> =>
  valueOf<StartValue>(await call('workflow', 'workflowStart', { root, positional: name, options }), `a start of ${name}`);

/** `memory add --type plan --title <title> --set workflow=… --set phase=… --set scope=…`; answer its id and path. */
async function addPlan(root: string, workflow: string, phase: string, scope: string): Promise<{ id: string; path: string }> {
  const result = await call('memory', 'memoryAdd', { root, options: { type: 'plan', title: `${workflow} — ${phase}`, set: [`workflow=${workflow}`, `phase=${phase}`, `scope=${scope}`] } });
  return valueOf<{ id: string; path: string }>(result, 'a memory add');
}

async function submit(root: string, id: string): Promise<void> {
  valueOf(await call('memory', 'memorySubmit', { root, positional: id, positionals: [id], options: {} }), `a submit of ${id}`);
}

const status = async (root: string, ref?: string): Promise<StatusResult> =>
  valueOf<StatusResult>(await call('workflow', 'workflowStatus', { root, ...(ref === undefined ? {} : { positional: ref }) }), 'a status');

const out = (root: string, args: string[]): string => git(root, args).trim();
const instanceIds = (root: string): string[] => deduceWorkflowStateAtHead(root).instances.map((entry) => entry.instance.id);
const startTrailerOf = (root: string, commit: string): string => out(root, ['log', '-1', '--format=%(trailers:key=WingFoil-Start,valueonly)', commit]);

const PRE_MARKER = 'W_INSTANCE_PRE_MARKER';
/** The stdout line task-345 printed under a kept instance; task-373 D4 removed it (the rule is a stderr warning). */
const PRE_MARKER_LINE = '    warning: kept by the pre-marker rule: restart it with workflow start';
const preMarker = (diagnostics: readonly Diagnostic[]): Diagnostic[] => diagnostics.filter((entry) => entry.code === PRE_MARKER);
const preMarkerEntry = (id: string, file: string): Diagnostic => ({
  code: PRE_MARKER,
  severity: 'warning',
  file,
  path: '',
  message: `instance ${id} is kept by the pre-marker rule: restart it with workflow start`,
});
const unknownWorkflowEntry = (id: string, file: string, workflow: string): Diagnostic => ({
  code: 'W_INSTANCE_WORKFLOW_UNKNOWN',
  severity: 'warning',
  file,
  path: 'workflow',
  message: `open plan ${id} names workflow '${workflow}', which the registry does not load`,
});

describe('task-345 AC 1 — workflow start writes the start marker (spec-017 §3.1, spec-008 §2)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  it('the marker key is exported as START_TRAILER = "WingFoil-Start"', () => {
    expect(START_TRAILER).toBe('WingFoil-Start');
  });

  it('(a) the add commit — the one commit start writes (task-346) — carries `WingFoil-Start: <workflow>` in its one trailer paragraph, before WingFoil-Version:', async () => {
    const value = await start(repo, 'checklist');
    expect(value.commits).toHaveLength(1);
    const [add] = value.commits as [string];
    expect(add).toBe(out(repo, ['rev-parse', 'HEAD']));

    const message = out(repo, ['log', '-1', '--format=%B', add]);
    const [subject, ...rest] = message.split('\n\n');
    expect(subject).toBe('wf(plan): add checklist-1-plan');
    // The body is one paragraph: the trailer paragraph (the stamp and any attribution trailers vary, so only the order is pinned).
    expect(rest).toHaveLength(1);
    const lines = rest[0]!.split('\n');
    const marker = lines.indexOf('WingFoil-Start: checklist');
    const version = lines.findIndex((line) => line.startsWith('WingFoil-Version: '));
    expect(marker).toBeGreaterThanOrEqual(0);
    expect(version).toBeGreaterThan(marker);

    expect(startTrailerOf(repo, add)).toBe('checklist');
  });

  it('(a) the dry run of the same start shows the marker in its message, in-process and on the CLI (--format json and console)', async () => {
    const before = out(repo, ['rev-parse', 'HEAD']);
    const plan = valueOf<DryRunValue>(await runAsDryRun(() => operation('workflow', 'workflowStart')({ root: repo, positional: 'checklist', options: {} }) as Promise<CoreResult<unknown>>), 'a dry run');
    expect(plan).toMatchObject({ dryRun: true, subject: 'wf(plan): add checklist-1-plan' });
    expect(plan.message).toContain('\n\nWingFoil-Start: checklist\nWingFoil-Version: ');

    for (const format of ['json', 'console']) {
      const run = runCliEntry(repo, ['workflow', 'start', 'checklist', '--dry-run', '--format', format]);
      expect([run.status, run.stderr]).toEqual([0, '']);
      const printed = JSON.parse(run.stdout) as DryRunValue;
      expect(printed).toMatchObject({ dryRun: true, subject: 'wf(plan): add checklist-1-plan' });
      expect(printed.message).toContain('\n\nWingFoil-Start: checklist\nWingFoil-Version: ');
    }
    expect(out(repo, ['rev-parse', 'HEAD'])).toBe(before);
  });
});

describe('task-345 AC 1 — a plan added without the marker after a marked start is no instance (spec-017 §3.2)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  it('(b) a `memory add` plan naming a loaded main, draft and then active, is no instance; `workflow next <its id>` is `workflow is not open:`', async () => {
    await start(repo, 'checklist');
    const before = deduceWorkflowStateAtHead(repo).diagnostics;

    const added = await addPlan(repo, 'report-bug', 'x', 'x');
    expect(added.id).toBe('report-bug-x-plan');
    expect(startTrailerOf(repo, 'HEAD')).toBe('');
    let deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances.map((entry) => entry.instance.id)).toEqual(['checklist-1-plan']);
    expect(deduction.active).toBe('checklist-1-plan');
    expect(deduction.diagnostics).toEqual(before);

    await submit(repo, added.id);
    deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances.map((entry) => entry.instance.id)).toEqual(['checklist-1-plan']);
    expect(deduction.active).toBe('checklist-1-plan');
    expect(deduction.diagnostics).toEqual(before);

    const next = await call('workflow', 'workflowNext', { root: repo, positional: 'report-bug-x-plan' });
    expect(next.ok ? null : next.error).toMatchObject({ code: 'NOT_FOUND', message: 'workflow is not open: report-bug-x-plan' });
  });

  it('(c) a plan committed by hand after a marked start (no WingFoil trailer at all) is no instance', async () => {
    await start(repo, 'checklist');
    commitPlanByHand(repo, 'b-1-plan', 'report-bug', 'active', 'report-bug');
    const deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances.map((entry) => entry.instance.id)).toEqual(['checklist-1-plan']);
    expect(deduction.active).toBe('checklist-1-plan');
  });

  it('(d) control: a plan naming the sub `dev-loop`, by hand, before any start, is never an instance and raises no diagnostic', () => {
    commitPlanByHand(repo, 'd-1-plan', 'dev-loop', 'active', 'dev-loop');
    const deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances).toEqual([]);
    expect(deduction.active).toBeNull();
    expect(deduction.diagnostics.filter((entry) => entry.file === 'docs/plans/dev-loop/d-1-plan.md')).toEqual([]);
  });

  it('(e) a marked start whose plan is now `done` still counts: a later `memory add` plan is no instance', async () => {
    await start(repo, 'checklist');
    // task-346: the plan start left `draft` is submitted (`draft → active`) before it is finalized.
    await submit(repo, 'checklist-1-plan');
    const path = join(repo, 'docs/plans/checklist/checklist-1-plan.md');
    writeFileSync(path, readFileSync(path, 'utf-8').replace(/^status: active$/m, 'status: done'), 'utf-8');
    commitAll(repo, 'wf(plan): finalize checklist-1-plan [active → done]');

    await addPlan(repo, 'report-bug', 'x', 'x');
    const deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances).toEqual([]);
    expect(deduction.active).toBeNull();
  });
});

describe('task-345 AC 1 — the transitory pre-marker rule is reported by workflow status (spec-017 §2, §3.2, §7.4; design addendum)', () => {
  let repo: string;
  let keptPath: string;
  beforeEach(async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    keptPath = commitPlanByHand(repo, 'a-1-plan', 'checklist', 'active', 'checklist');
    await start(repo, 'report-bug');
  });
  afterEach(() => removeTempDir(repo));

  it('(f) the kept instance gets W_INSTANCE_PRE_MARKER, last in diagnostics, and no console line (task-373 D4); the marked one gets neither', async () => {
    const result = await status(repo);
    expect(result.open.map((entry) => entry.instance.id)).toEqual(['report-bug-1-plan', 'a-1-plan']);
    const diagnostics = result.diagnostics as readonly Diagnostic[];
    expect(preMarker(diagnostics)).toEqual([preMarkerEntry('a-1-plan', keptPath)]);
    expect(diagnostics[diagnostics.length - 1]).toEqual(preMarkerEntry('a-1-plan', keptPath));

    // task-373 D4 (spec-017 §3.2 as amended): the rule is a stderr warning of the operation, never a stdout line.
    const lines = renderStatusConsole(result).split('\n');
    const marked = lines.indexOf('* report-bug-1-plan (report-bug) — active, complete');
    const kept = lines.indexOf('  a-1-plan (checklist)');
    expect(marked).toBeGreaterThanOrEqual(0);
    expect(kept).toBeGreaterThan(marked);
    expect(lines).not.toContain(PRE_MARKER_LINE);
    expect(lines.some((line) => line.includes('kept by the pre-marker rule'))).toBe(false);
    expect(lines.some((line) => /diagnostic\(s\)/.test(line))).toBe(false);
  });

  it('(g) with a <ref>: the kept instance carries the entry, the marked one none', async () => {
    expect(preMarker((await status(repo, 'a-1-plan')).diagnostics as readonly Diagnostic[])).toEqual([preMarkerEntry('a-1-plan', keptPath)]);
    expect(preMarker((await status(repo, 'report-bug-1-plan')).diagnostics as readonly Diagnostic[])).toEqual([]);
  });

  it('(h) status only: workflow next on the kept instance raises no W_INSTANCE_PRE_MARKER', async () => {
    const next = valueOf<{ diagnostics: readonly Diagnostic[] }>(await call('workflow', 'workflowNext', { root: repo, positional: 'a-1-plan' }), 'a next');
    expect(preMarker(next.diagnostics)).toEqual([]);
  });

  it('(i) on the CLI: workflow status exits 0, the warning on stderr as its last line, none on stdout, the entry in --format json (task-373 D4)', () => {
    const jsonRun = runCliEntry(repo, ['workflow', 'status', '--format', 'json']);
    expect(jsonRun.status).toBe(0);
    const payload = JSON.parse(jsonRun.stdout) as { diagnostics: readonly Diagnostic[] };
    expect(preMarker(payload.diagnostics)).toEqual([preMarkerEntry('a-1-plan', keptPath)]);
    const texts = payload.diagnostics.map((d) => `${d.code} (${d.file}): ${d.message}`);
    // One `{"warning": …}` line per diagnostic, in payload order (spec-008 §6, spec-017 §7.4).
    expect(jsonRun.stderr).toBe(texts.map((text) => `${JSON.stringify({ warning: text })}\n`).join(''));

    const consoleRun = runCliEntry(repo, ['workflow', 'status']);
    expect(consoleRun.status).toBe(0);
    expect(consoleRun.stderr).toBe(texts.map((text) => `warning: ${text}\n`).join(''));
    expect(consoleRun.stderr.trimEnd().split('\n').pop()).toBe(`warning: W_INSTANCE_PRE_MARKER (${keptPath}): instance a-1-plan is kept by the pre-marker rule: restart it with workflow start`);
    expect(consoleRun.stdout.split('\n')).not.toContain(PRE_MARKER_LINE);
    expect(consoleRun.stdout).not.toContain('kept by the pre-marker rule');
  });
});

describe('task-345 AC 2 — an open plan naming an unloaded workflow is no instance, and stays a warning (spec-017 §2, §3.2)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  it('by hand, with no marked start: not listed, not active, one W_INSTANCE_WORKFLOW_UNKNOWN (also in workflow list); next and end refuse its id', async () => {
    const path = commitPlanByHand(repo, 'ghost-1-plan', 'no-such-flow', 'active', 'no-such-flow');
    const entry = unknownWorkflowEntry('ghost-1-plan', path, 'no-such-flow');

    const deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances).toEqual([]);
    expect(deduction.active).toBeNull();
    expect(deduction.diagnostics.filter((d) => d.code === 'W_INSTANCE_WORKFLOW_UNKNOWN')).toEqual([entry]);

    expect((await status(repo)).open).toEqual([]);
    const listed = valueOf<{ diagnostics: readonly Diagnostic[] }>(await call('workflow', 'workflowList', { root: repo, options: {} }), 'a list');
    expect(listed.diagnostics.filter((d) => d.code === 'W_INSTANCE_WORKFLOW_UNKNOWN')).toEqual([entry]);

    for (const name of ['workflowNext', 'workflowEnd']) {
      const refused = await call('workflow', name, { root: repo, positional: 'ghost-1-plan' });
      expect(refused.ok ? null : refused.error).toMatchObject({ code: 'NOT_FOUND', message: 'workflow is not open: ghost-1-plan' });
    }
  });

  it('by `memory add` after a marked start: the started instance stays active and alone, the same warning', async () => {
    await start(repo, 'checklist');
    const added = await addPlan(repo, 'no-such-flow', 'x', 'x');

    const deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances.map((entry) => entry.instance.id)).toEqual(['checklist-1-plan']);
    expect(deduction.active).toBe('checklist-1-plan');
    expect(deduction.diagnostics.filter((d) => d.code === 'W_INSTANCE_WORKFLOW_UNKNOWN')).toEqual([unknownWorkflowEntry(added.id, added.path, 'no-such-flow')]);
    expect((await status(repo)).open.map((entry) => entry.instance.id)).toEqual(['checklist-1-plan']);
  });

  it('a marked plan whose workflow the registry stops loading: no instance, the same warning', async () => {
    await start(repo, 'checklist');
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', workflowsYaml(WORKFLOWS.filter((name) => name !== 'checklist')));
    commitAll(repo, 'stop loading checklist');

    const deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances).toEqual([]);
    expect(deduction.active).toBeNull();
    expect(deduction.diagnostics.filter((d) => d.code === 'W_INSTANCE_WORKFLOW_UNKNOWN')).toEqual([
      unknownWorkflowEntry('checklist-1-plan', 'docs/plans/checklist/checklist-1-plan.md', 'checklist'),
    ]);
  });
});

describe('task-345 AC 3 (characterization) — with no marked start every open plan of a loaded main stays an instance (dl-217 ratification)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  it('two hand plans and one `memory add` plan are instances, most recent first; a later marked start keeps them after it', async () => {
    commitPlanByHand(repo, 'a-1-plan', 'checklist', 'active', 'checklist');
    commitPlanByHand(repo, 'b-1-plan', 'report-bug', 'active', 'report-bug');
    const added = await addPlan(repo, 'report-bug', 'c', 'report-bug');
    expect(added.id).toBe('report-bug-c-plan');

    let deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances.map((entry) => entry.instance.id)).toEqual(['report-bug-c-plan', 'b-1-plan', 'a-1-plan']);
    expect(deduction.active).toBe('report-bug-c-plan');

    const started = await start(repo, 'release-cycle', { element: 'release:minor-v1' });
    expect(started.instance.id).toBe('release-cycle-minor-v1-plan');
    deduction = deduceWorkflowStateAtHead(repo);
    expect(instanceIds(repo)).toEqual(['release-cycle-minor-v1-plan', 'report-bug-c-plan', 'b-1-plan', 'a-1-plan']);
    expect(deduction.active).toBe('release-cycle-minor-v1-plan');
  });
});
