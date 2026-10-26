/**
 * task-293 — element provenance read by the workflow deduction (P4.21, `cp-002`, REQ-STATE-11, `dl-187`;
 * `spec-017` §2, §4.3, §4.8), on fixture repositories at `HEAD`, through the `src/core` barrel and the
 * `CORE_MODULES` operations. The records are written by hand, as `task-294` (`adopt`) and `task-295` (`rekey`)
 * will write them: an empty commit, the subject, and a final trailer paragraph.
 *
 * - AC 1: an adoption (`workflow: adopt <instance> <key> <type>:<id>`, `WingFoil-Instance`, `WingFoil-Step`,
 *   `WingFoil-Adopted`) makes the element created by that step for `created` evidence only: never `record`, never
 *   `state`; a gate stays held (BDD P4.21 "Edge — an adoption cannot pass a gate"). A commit missing the subject
 *   prefix or a trailer adopts nothing (design D1 (a)).
 * - AC 2: a rekey (`workflow: rekey <instance> <from> <to>`, `WingFoil-Rekey-From` / `-To`) remaps the linkages,
 *   records and adoptions of its instance it descends from, keeping the scope; chains apply in walk order.
 * - AC 3: two adoptions on unrelated branches — `W_PROVENANCE_CONFLICT`; a key the registry does not declare —
 *   `W_PROVENANCE_ORPHAN` (texts and locations: design D4).
 * - AC 4 (characterization): the records are read in the one `git log` of §4.8's *Cost* — the same git processes
 *   as the same fixture without them (REQ-PERF-03; `workflow-next-spawn-count.test.ts` is not edited).
 * - AC 5 (characterization): `workflow next` / `status` results and console views are unchanged apart from the
 *   provenance diagnostics.
 *
 * The pure side (`resolveProvenance`, the diagnostics order) is `test/workflow/provenance.test.ts`.
 */
import { execFileSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { CORE_MODULES, deduceWorkflowStateAtHead, renderNextConsole, renderStatusConsole, type Deduction, type InstanceDeduction, type NextResult, type StatusResult } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
      waiting: [ backlog ]
      returns: { in-review: in-progress }
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, triaged, closed ]
      gates:
        open: { reject: closed }
  spec:
    path: "docs/specs/{id}.md"
    states:
      sequence: [ draft, pending, approved ]
      gates:
        pending: { reject: draft }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
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
    - name: Roberto
      email: roberto@example.invalid
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;

/** An ingest main: no `element:`, its first phase adds a bug (`bug-ingest.yaml`'s shape). */
const CAPTURE = `name: capture-flow
kind: main
description: Capture a single bug.
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
    produces:
      - "docs/bugs/{id}.md"
  - name: triage
    actions:
      - memory.approve
    approval: { by_role: approver }
`;

/** A dev-loop-shaped main bound to a task: start, design (adds specs), red, review (falls back to red), done. */
const LOOP = `name: loop
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: design
    actions:
      - agent.execute
      - 'memory.add(type: spec)'
      - memory.submit
    produces:
      - { type: spec, path: "docs/specs/{spec.id}.md" }
  - name: red
    actions:
      - agent.execute
  - name: review
    actions:
      - memory.submit
    approval: { by_role: approver }
    fallback: { step: red, set_state: in-progress }
  - name: done
    actions:
      - memory.approve
      - element.set_state(done)
`;

/** A task-bound main whose `check` (a checkpoint) and `build` (adds specs) phases a rename renames. */
function ren(check: string, build: string): string {
  return `name: ren
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: ${check}
    actions:
      - agent.execute
  - name: ${build}
    actions:
      - 'memory.add(type: spec)'
      - memory.submit
    produces:
      - { type: spec, path: "docs/specs/{spec.id}.md" }
  - name: finish
    actions:
      - agent.execute
`;
}

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId = ''): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

const REN_FILE = '.wingfoil/workflows/custom/ren.yaml';

function writeProject(root: string, renYaml = ren('old', 'build-old')): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/capture-flow.yaml\n  - workflows/custom/loop.yaml\n  - workflows/custom/ren.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/capture-flow.yaml', CAPTURE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/loop.yaml', LOOP);
  writeFixtureFile(root, REN_FILE, renYaml);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture configuration');
}

/** Write `files` and commit them with `subject` and, when given, a final trailer paragraph. Returns the new sha. */
function commit(root: string, files: Record<string, string>, subject: string, trailers: Record<string, string> = {}, body?: string): string {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, ['add', '-A']);
  const block = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  git(root, ['commit', '--allow-empty', '--quiet', '--cleanup=whitespace', '-m', subject, ...(body === undefined ? [] : ['-m', body]), ...(block === '' ? [] : ['-m', block])]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

/** A phase record (`spec-003` § "Evidence") of `step` on `scope`, as `workflow finalize` writes it. */
function record(root: string, instance: string, step: string, scope: string | null): string {
  return commit(root, {}, `workflow: finalize ${instance} ${step}`, {
    'WingFoil-Phase': `${step} completed`,
    'WingFoil-Instance': instance,
    ...(scope === null ? {} : { 'WingFoil-Element': scope }),
  });
}

/** An adoption record (`spec-017` §4.8), as `workflow adopt` will write it: a `Reason:` body, then the trailers. */
function adopt(root: string, instance: string, step: string, ref: string): string {
  return commit(root, {}, `workflow: adopt ${instance} ${step} ${ref}`, { 'WingFoil-Instance': instance, 'WingFoil-Step': step, 'WingFoil-Adopted': ref }, 'Reason: created by hand before the engine.');
}

/** A rekey record (`spec-017` §4.8), as `workflow rekey` will write it. */
function rekey(root: string, instance: string, from: string, to: string): string {
  return commit(root, {}, `workflow: rekey ${instance} ${from} ${to}`, { 'WingFoil-Instance': instance, 'WingFoil-Rekey-From': from, 'WingFoil-Rekey-To': to }, 'Reason: phase renamed.');
}

function only(deduction: Deduction, id: string): InstanceDeduction {
  const found = deduction.instances.find((entry) => entry.instance.id === id);
  if (!found) throw new Error(`no instance ${id} in ${JSON.stringify(deduction.instances.map((entry) => entry.instance.id))}`);
  return found;
}

const keys = (instance: InstanceDeduction): string[] => instance.frontier.map((step) => step.key);
const states = (instance: InstanceDeduction): string[] => instance.phases.map((phase) => `${phase.phase}:${phase.state}`);
const provenance = (deduction: Deduction) => deduction.diagnostics.filter((d) => d.code === 'W_PROVENANCE_ORPHAN' || d.code === 'W_PROVENANCE_CONFLICT');

describe('task-293 AC 1 — an adoption makes the element created by its step, for `created` evidence only (spec-017 §4.3, §4.8)', () => {
  it('(a) an adopted bug binds the ingest instance and completes `capture`; `triage` still awaits the approval of the bug (BDD P4.21 "Edge")', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1');
      adopt(repo, 'ing-1', 'capture-flow.capture', 'bug:bug-1');
      let deduction = deduceWorkflowStateAtHead(repo);
      let instance = only(deduction, 'ing-1');
      expect(instance.instance).toMatchObject({ element: { type: 'bug', id: 'bug-1', status: 'open' }, created: [{ type: 'bug', id: 'bug-1', status: 'open' }] });
      expect(states(instance)).toEqual(['capture:complete', 'triage:current']);
      expect(keys(instance)).toEqual(['capture-flow.triage@bug:bug-1']);
      expect(instance.frontier[0]).toMatchObject({ approval: { elements: [{ type: 'bug', id: 'bug-1', status: 'open' }], recordNeeded: false } });
      expect(provenance(deduction)).toEqual([]);

      // The approval, not the adoption, passes the gate.
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'triaged') }, 'wf(bug): approve bug-1 [open → triaged]', {}, 'Approver: Roberto <roberto@example.invalid> (approver)\nReason: reproduced.');
      deduction = deduceWorkflowStateAtHead(repo);
      instance = only(deduction, 'ing-1');
      expect(instance.complete).toBe(true);
    } finally {
      removeTempDir(repo);
    }
  });

  it('(b) an adoption into a step that adds nothing, or into a checkpoint, completes nothing (never `record`)', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1', { 'WingFoil-Instance': 'ing-1', 'WingFoil-Step': 'capture-flow.capture' });
      commit(repo, { 'docs/bugs/bug-2.md': element('bug', 'bug-2', 'open') }, 'wf(bug): add bug-2');
      adopt(repo, 'ing-1', 'capture-flow.triage@bug:bug-1', 'bug:bug-2');
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'task');
      commit(repo, { 'docs/plans/loop-1.md': plan('loop-1', 'loop', 'task-1') }, 'wf(plan): add loop-1');
      record(repo, 'loop-1', 'loop.design', 'task:task-1');
      commit(repo, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'approved') }, 'wf(spec): add spec-1');
      adopt(repo, 'loop-1', 'loop.red@task:task-1', 'spec:spec-1');

      const deduction = deduceWorkflowStateAtHead(repo);
      const ingest = only(deduction, 'ing-1');
      expect(states(ingest)).toEqual(['capture:complete', 'triage:current']);
      expect(ingest.frontier[0]).toMatchObject({ key: 'capture-flow.triage@bug:bug-1', approval: { elements: [{ type: 'bug', id: 'bug-1', status: 'open' }] } });
      const loop = only(deduction, 'loop-1');
      expect(keys(loop)).toEqual(['loop.red@task:task-1']);
      expect(loop.frontier[0]!.evidence).toEqual({ kinds: ['record'], missing: ['record'], finalizable: true });
      // The adoption is read (the step lists what it created), it just is no record.
      expect(loop.instance.created).toEqual([{ type: 'spec', id: 'spec-1', status: 'approved' }]);
      expect(provenance(deduction)).toEqual([]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('(c) an adoption into `loop.design` lists the spec as created, resolves the `{ type, path }` entry, and completes `design` from `created`', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'task');
      commit(repo, { 'docs/plans/loop-1.md': plan('loop-1', 'loop', 'task-1') }, 'wf(plan): add loop-1');
      commit(repo, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'draft') }, 'wf(spec): add spec-1');
      adopt(repo, 'loop-1', 'loop.design@task:task-1', 'spec:spec-1');
      let step = only(deduceWorkflowStateAtHead(repo), 'loop-1').frontier[0]!;
      expect(step.key).toBe('loop.design@task:task-1');
      expect(step.created).toEqual([{ type: 'spec', id: 'spec-1', status: 'draft' }]);
      expect(step.produces).toEqual([{ pattern: 'docs/specs/{spec.id}.md', owner: 'spec', resolved: ['docs/specs/spec-1.md'], exists: true, evidence: false }]);
      expect(step.evidence).toEqual({ kinds: ['created'], missing: ['created'], finalizable: false });

      commit(repo, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'pending') }, 'wf(spec): submit spec-1');
      const instance = only(deduceWorkflowStateAtHead(repo), 'loop-1');
      expect(keys(instance)).toEqual(['loop.red@task:task-1']);
      expect(instance.instance.created).toEqual([{ type: 'spec', id: 'spec-1', status: 'pending' }]);
      step = instance.frontier[0]!;
      expect(step.evidence.missing).toEqual(['record']);
    } finally {
      removeTempDir(repo);
    }
  });

  it('(d) a commit missing the subject prefix or a valid trailer adopts nothing (design D1 (a))', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1');
      const trailers = { 'WingFoil-Instance': 'ing-1', 'WingFoil-Step': 'capture-flow.capture', 'WingFoil-Adopted': 'bug:bug-1' };
      // The subject, a trailer missing.
      commit(repo, {}, 'workflow: adopt ing-1 capture-flow.capture bug:bug-1', { 'WingFoil-Instance': 'ing-1', 'WingFoil-Step': 'capture-flow.capture' });
      // The subject, `WingFoil-Adopted` not a `<type>:<id>`.
      commit(repo, {}, 'workflow: adopt ing-1 capture-flow.capture bug:bug-1', { ...trailers, 'WingFoil-Adopted': 'bug-1' });
      // The three trailers under another subject.
      commit(repo, {}, 'workflow: finalize ing-1 capture-flow.capture', trailers);
      commit(repo, {}, 'wf(bug): amend bug-1 [open → open]', trailers);
      // The trailers in a body paragraph, not the final one.
      commit(repo, {}, 'workflow: adopt ing-1 capture-flow.capture bug:bug-1', { 'WingFoil-Version': '0.3.1 (abc1234)' }, Object.entries(trailers).map(([key, value]) => `${key}: ${value}`).join('\n') + '\n\nSee above.');
      const instance = only(deduceWorkflowStateAtHead(repo), 'ing-1');
      expect(instance.instance).toMatchObject({ element: null, created: [] });
      expect(keys(instance)).toEqual(['capture-flow.capture']);
    } finally {
      removeTempDir(repo);
    }
  });
});

/** The `ren` fixture up to a phase rename: `check` recorded, `build` holding a linked spec-1 and an adopted spec-2. */
function renamedRepo(): { repo: string; recordSha: string; linkSha: string; adoptSha: string } {
  const repo = makeTempGitRepo();
  writeProject(repo);
  commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'task');
  commit(repo, { 'docs/plans/ren-1.md': plan('ren-1', 'ren', 'task-1') }, 'wf(plan): add ren-1');
  const recordSha = record(repo, 'ren-1', 'ren.old', 'task:task-1');
  const linkSha = commit(repo, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'pending') }, 'wf(spec): add spec-1', { 'WingFoil-Instance': 'ren-1', 'WingFoil-Step': 'ren.build-old@task:task-1' });
  commit(repo, { 'docs/specs/spec-2.md': element('spec', 'spec-2', 'pending') }, 'wf(spec): add spec-2');
  const adoptSha = adopt(repo, 'ren-1', 'ren.build-old@task:task-1', 'spec:spec-2');
  return { repo, recordSha, linkSha, adoptSha };
}

describe('task-293 AC 2 — a rekey remaps the records of a renamed step (spec-017 §4.8, BDD P4.21 "Rekey")', () => {
  it('before the rename, `old` and `build-old` are complete', () => {
    const { repo } = renamedRepo();
    try {
      const instance = only(deduceWorkflowStateAtHead(repo), 'ren-1');
      expect(states(instance)).toEqual(['start:complete', 'old:complete', 'build-old:complete', 'finish:current']);
      expect(instance.instance.created).toEqual([
        { type: 'spec', id: 'spec-1', status: 'pending' },
        { type: 'spec', id: 'spec-2', status: 'pending' },
      ]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('renamed with no rekey: the record, the linkage and the adoption are orphans, evidence of nothing and owners of nothing', () => {
    const { repo, recordSha, linkSha, adoptSha } = renamedRepo();
    try {
      commit(repo, { [REN_FILE]: ren('new', 'build-new') }, 'rename phases');
      const deduction = deduceWorkflowStateAtHead(repo);
      const instance = only(deduction, 'ren-1');
      expect(states(instance)).toEqual(['start:complete', 'new:current', 'build-new:pending', 'finish:pending']);
      expect(instance.instance.created).toEqual([]);
      const orphans = provenance(deduction);
      // Ascending walk position: the newest first.
      expect(orphans.map((d) => [d.code, d.severity, d.file, d.path])).toEqual([
        ['W_PROVENANCE_ORPHAN', 'warning', 'docs/plans/ren-1.md', adoptSha],
        ['W_PROVENANCE_ORPHAN', 'warning', 'docs/plans/ren-1.md', linkSha],
        ['W_PROVENANCE_ORPHAN', 'warning', 'docs/plans/ren-1.md', recordSha],
      ]);
      expect(orphans[0]!.message).toBe(`adoption ${adoptSha} of ren-1 names ren.build-old@task:task-1, which the registry does not declare: it is evidence of nothing and owns nothing (spec:spec-2)`);
      expect(orphans[1]!.message).toBe(`linkage ${linkSha} of ren-1 names ren.build-old@task:task-1, which the registry does not declare: it is evidence of nothing and owns nothing (spec:spec-1)`);
      // The design leaves open whether a record's <key> carries its `WingFoil-Element` as a scope.
      expect(orphans[2]!.message).toMatch(new RegExp(`^record ${recordSha} of ren-1 names ren\\.old(@task:task-1)?, which the registry does not declare: it is evidence of nothing$`));
    } finally {
      removeTempDir(repo);
    }
  });

  it('with the rekeys, the record completes `new` on its element and the linkage and adoption complete `build-new`', () => {
    const { repo } = renamedRepo();
    try {
      commit(repo, { [REN_FILE]: ren('new', 'build-new') }, 'rename phases');
      rekey(repo, 'ren-1', 'ren.old', 'ren.new');
      rekey(repo, 'ren-1', 'ren.build-old', 'ren.build-new');
      const deduction = deduceWorkflowStateAtHead(repo);
      const instance = only(deduction, 'ren-1');
      expect(states(instance)).toEqual(['start:complete', 'new:complete', 'build-new:complete', 'finish:current']);
      expect(instance.instance.created).toEqual([
        { type: 'spec', id: 'spec-1', status: 'pending' },
        { type: 'spec', id: 'spec-2', status: 'pending' },
      ]);
      expect(provenance(deduction)).toEqual([]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('a chain old → mid, mid → new maps old to new', () => {
    const { repo } = renamedRepo();
    try {
      commit(repo, { [REN_FILE]: ren('mid', 'build-old') }, 'rename old to mid');
      rekey(repo, 'ren-1', 'ren.old', 'ren.mid');
      commit(repo, { [REN_FILE]: ren('new', 'build-old') }, 'rename mid to new');
      rekey(repo, 'ren-1', 'ren.mid', 'ren.new');
      const deduction = deduceWorkflowStateAtHead(repo);
      expect(states(only(deduction, 'ren-1'))).toEqual(['start:complete', 'new:complete', 'build-old:complete', 'finish:current']);
      expect(provenance(deduction)).toEqual([]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('a record written after the rekey is not remapped (an orphan); a rekey of another instance remaps nothing', () => {
    const { repo } = renamedRepo();
    try {
      commit(repo, { [REN_FILE]: ren('new', 'build-old') }, 'rename old to new');
      rekey(repo, 'ren-9', 'ren.old', 'ren.new');
      const deduction = deduceWorkflowStateAtHead(repo);
      expect(states(only(deduction, 'ren-1'))).toEqual(['start:complete', 'new:current', 'build-old:pending', 'finish:pending']);
      expect(provenance(deduction).map((d) => d.code)).toEqual(['W_PROVENANCE_ORPHAN']);

      rekey(repo, 'ren-1', 'ren.old', 'ren.new');
      const late = record(repo, 'ren-1', 'ren.old', 'task:task-1');
      const after = deduceWorkflowStateAtHead(repo);
      expect(states(only(after, 'ren-1'))).toEqual(['start:complete', 'new:complete', 'build-old:complete', 'finish:current']);
      expect(provenance(after).map((d) => [d.code, d.path])).toEqual([['W_PROVENANCE_ORPHAN', late]]);
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-293 AC 3 — two adoptions on unrelated branches are a conflict (spec-017 §4.8, D4)', () => {
  it('after the merge neither counts and one W_PROVENANCE_CONFLICT names both', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1');
      git(repo, ['branch', 'side']);
      const onMain = adopt(repo, 'ing-1', 'capture-flow.capture', 'bug:bug-1');
      git(repo, ['checkout', '--quiet', 'side']);
      const onSide = adopt(repo, 'ing-1', 'capture-flow.triage', 'bug:bug-1');
      git(repo, ['checkout', '--quiet', 'main']);
      git(repo, ['merge', '--quiet', '--no-ff', '-m', 'merge side', 'side']);

      const deduction = deduceWorkflowStateAtHead(repo);
      const instance = only(deduction, 'ing-1');
      expect(instance.instance).toMatchObject({ element: null, created: [] });
      expect(keys(instance)).toEqual(['capture-flow.capture']);
      expect(provenance(deduction)).toEqual([
        {
          code: 'W_PROVENANCE_CONFLICT',
          severity: 'warning',
          file: 'docs/plans/ing-1.md',
          path: 'bug:bug-1',
          message: `bug:bug-1 is claimed on unrelated branches by ing-1 capture-flow.capture (${onMain}), ing-1 capture-flow.triage (${onSide}): it counts as created by neither`,
        },
      ]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('an adoption descending from another of the same element supersedes it: no conflict', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1');
      adopt(repo, 'ing-1', 'capture-flow.triage', 'bug:bug-1');
      adopt(repo, 'ing-1', 'capture-flow.capture', 'bug:bug-1');
      const deduction = deduceWorkflowStateAtHead(repo);
      const instance = only(deduction, 'ing-1');
      expect(instance.instance.element).toEqual({ type: 'bug', id: 'bug-1', status: 'open' });
      expect(states(instance)).toEqual(['capture:complete', 'triage:current']);
      expect(provenance(deduction)).toEqual([]);
    } finally {
      removeTempDir(repo);
    }
  });
});

/** The argv of every git process one deduction spawns, through a `git` shim first on `PATH` (task-203 AC 5). */
function spawned(repo: string): string[] {
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
  const shim = mkdtempSync(join(tmpdir(), 'wf-git-shim-'));
  const log = join(shim, 'invocations.log');
  writeFileSync(join(shim, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\nexec '${realGit}' "$@"\n`);
  chmodSync(join(shim, 'git'), 0o755);
  writeFileSync(log, '');
  const saved = process.env.PATH;
  process.env.PATH = `${shim}:${saved ?? ''}`;
  try {
    deduceWorkflowStateAtHead(repo);
    return readFileSync(log, 'utf-8')
      .split('\n')
      .filter((line) => line.length > 0);
  } finally {
    process.env.PATH = saved;
    removeTempDir(shim);
  }
}

describe('task-293 AC 4 (characterization) — the records are read in the one walk (REQ-PERF-03, spec-017 §4.8 Cost)', () => {
  /** The `ren` fixture with an adoption, a config rename and a rekey — or, `withRecords: false`, plain empty commits in their place. */
  function fixture(withRecords: boolean): string {
    const repo = makeTempGitRepo();
    writeProject(repo);
    commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'task');
    commit(repo, { 'docs/plans/ren-1.md': plan('ren-1', 'ren', 'task-1') }, 'wf(plan): add ren-1');
    commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
    commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1');
    record(repo, 'ren-1', 'ren.old', 'task:task-1');
    if (withRecords) {
      adopt(repo, 'ing-1', 'capture-flow.capture', 'bug:bug-1');
      commit(repo, { [REN_FILE]: ren('new', 'build-old') }, 'rename phases');
      rekey(repo, 'ren-1', 'ren.old', 'ren.new');
    } else {
      commit(repo, {}, 'plain one');
      commit(repo, {}, 'plain two');
      commit(repo, {}, 'plain three');
    }
    return repo;
  }

  it('one `git log` with trailers and the same number of git processes as the same fixture without the records', () => {
    const withRecords = fixture(true);
    const without = fixture(false);
    try {
      const argv = spawned(withRecords);
      const baseline = spawned(without);
      const running = (lines: string[], subcommand: string): string[] => lines.filter((line) => line.split(' ').includes(subcommand));
      expect(running(argv, 'log').filter((line) => line.includes('%(trailers'))).toHaveLength(1);
      expect(running(argv, 'rev-list')).toEqual([]);
      expect(argv).toHaveLength(baseline.length);
      // The same subcommands in the same order: no process is added for the records.
      const subcommands = (lines: string[]): string[] => lines.map((line) => line.split(' ').find((word) => /^[a-z][a-z-]+$/.test(word) && word !== 'core.quotePath=false') ?? '');
      expect(subcommands(argv)).toEqual(subcommands(baseline));
    } finally {
      removeTempDir(withRecords);
      removeTempDir(without);
    }
  });

  it('`test/core/workflow-next-spawn-count.test.ts` keeps its pinned count (not edited by this task)', () => {
    const source = readFileSync(join(__dirname, 'workflow-next-spawn-count.test.ts'), 'utf-8');
    expect(source).not.toMatch(/task-293/);
  });
});

const nextOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowNext'];
const statusOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowStatus'];

async function call<T>(operation: typeof nextOp, name: string, root: string): Promise<T> {
  if (operation === undefined) throw new Error(`no ${name} operation in CORE_MODULES`);
  const value = await operation.fn({ root });
  const result = (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<T>;
  if (!result.ok) throw new Error(`${name} refused: ${result.error.message}`);
  return result.value;
}

/** A console view without its diagnostics-count line. */
const withoutCount = (text: string): string[] => text.split('\n').filter((line) => !/^\d+ diagnostic\(s\): --format json lists them$/.test(line));

describe('task-293 AC 5 (characterization) — `workflow next` / `status` shapes are unchanged apart from the provenance diagnostics', () => {
  it('an orphan record changes no field but `diagnostics` (and the baseline commit), and no console line but the count', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1', { 'WingFoil-Instance': 'ing-1', 'WingFoil-Step': 'capture-flow.capture' });
      const nextBefore = await call<NextResult>(nextOp, 'workflowNext', repo);
      const statusBefore = await call<StatusResult>(statusOp, 'workflowStatus', repo);

      record(repo, 'ing-1', 'capture-flow.gone', null);
      const nextAfter = await call<NextResult>(nextOp, 'workflowNext', repo);
      const statusAfter = await call<StatusResult>(statusOp, 'workflowStatus', repo);

      const others = (diagnostics: readonly { code: string }[]) => diagnostics.filter((d) => d.code !== 'W_PROVENANCE_ORPHAN');
      for (const [before, after] of [
        [nextBefore, nextAfter],
        [statusBefore, statusAfter],
      ] as const) {
        expect(Object.keys(after)).toEqual(Object.keys(before));
        const rest = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'baseline' && key !== 'diagnostics'));
        const beforeDiagnostics = before.diagnostics;
        const afterDiagnostics = after.diagnostics;
        expect(rest(after)).toEqual(rest(before));
        expect(others(afterDiagnostics)).toEqual(others(beforeDiagnostics));
        expect(afterDiagnostics.length - others(afterDiagnostics).length).toBeLessThanOrEqual(1);
      }
      expect(Object.keys(nextAfter.instance!)).toEqual(Object.keys(nextBefore.instance!));
      expect(Object.keys(nextAfter.next!)).toEqual(Object.keys(nextBefore.next!));
      expect(withoutCount(renderNextConsole(nextAfter))).toEqual(withoutCount(renderNextConsole(nextBefore)));
      expect(withoutCount(renderStatusConsole(statusAfter))).toEqual(withoutCount(renderStatusConsole(statusBefore)));
      if (nextAfter.diagnostics.length > 0) expect(renderNextConsole(nextAfter)).toContain(`${nextAfter.diagnostics.length} diagnostic(s): --format json lists them`);
    } finally {
      removeTempDir(repo);
    }
  });
});
