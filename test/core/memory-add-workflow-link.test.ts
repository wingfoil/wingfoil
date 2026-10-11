/**
 * task-227 — `memory add --workflow <ref> [--step <key>]` links the element it adds to a workflow step
 * (`spec-017` §4.8 "Linkage", §7.10, §10; `spec-008` §12; ruling R16), on fixture repositories, through the
 * registered `memoryAdd` operation.
 *
 * - AC 1: with `--workflow`, the add commit carries `WingFoil-Instance: <id>` and `WingFoil-Step: <key>` in the
 *   trailer block git reads (`%(trailers:only)`, the message's final paragraph, where `WingFoil-Version:` stays
 *   the last line), and the next deduction lists the element in the step's `created` (here: it binds the
 *   self-creating instance, §3.4).
 * - AC 2: without `--step`, the one frontier step adding `--type` is chosen; none → `no step of <instance> adds
 *   a <type>`; several → the same refusal listing the keys (`CONFLICT`, exit 1). Also: `--step` selects among
 *   them, a `--step` off the frontier is refused, a `<ref>` naming no open instance is `NOT_FOUND`, `--step`
 *   without `--workflow` is a usage error (exit 2), and every refusal writes nothing.
 * - AC 3: without `--workflow` the commit message is the bare subject plus the build signature — no linkage line.
 */
import { CORE_MODULES, deduceWorkflowStateAtHead, type InstanceDeduction } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { UsageError } from '../../src/core/usage-error';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

const TEMPLATE = (type: string): string => `---
id: ""
type: ${type}
title: ""
status: draft
---

<!-- body -->
`;

const typeEntry = (type: string, sequence: string): string => `  ${type}:
    path: "docs/${type}/{id}.md"
    id_pattern: "${type}-{n}-{slug}"
    template:
      file: "memory/templates/${type}.md"
      frontmatter:
        required: [title]
    states:
      sequence: [ ${sequence} ]
`;

const MEMORY_YAML = `version: 1
types:
${typeEntry('bug', 'draft, open, closed')}${typeEntry('note', 'draft, done')}${typeEntry('task', 'draft, backlog, in-progress, done')}${typeEntry('plan', 'draft, active, done')}`;

/** An ingest main: no `element:`, its first phase adds a bug. */
const CAPTURE = `name: capture
kind: main
description: Capture one bug.
phases:
  - name: record
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
  - name: close
    actions:
      - memory.approve
`;

/** Two phases adding a bug, the first optional: both are on the frontier at once (§4.10). */
const TWICE = `name: twice
kind: main
description: Two ready steps that add a bug.
phases:
  - name: early
    optional: true
    actions:
      - 'memory.add(type: bug)'
  - name: late
    actions:
      - 'memory.add(type: bug)'
`;

/** A main bound to a task whose current step adds nothing. */
const BOUND = `name: bound
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
`;

function plan(id: string, workflow: string, element = ''): string {
  return `---\nid: "${id}"\ntype: plan\ntitle: "${id}"\nstatus: active\nworkflow: "${workflow}"\nphase: "x"\nelement: "${element}"\n---\n\n<!-- body -->\n`;
}

function seed(repo: string): void {
  writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
  for (const type of ['bug', 'note', 'task', 'plan']) writeFixtureFile(repo, `.wingfoil/memory/templates/${type}.md`, TEMPLATE(type));
  writeFixtureFile(
    repo,
    '.wingfoil/workflows.yaml',
    'version: 1.0\ninclude:\n  - workflows/custom/capture.yaml\n  - workflows/custom/twice.yaml\n  - workflows/custom/bound.yaml\n',
  );
  writeFixtureFile(repo, '.wingfoil/workflows/custom/capture.yaml', CAPTURE);
  writeFixtureFile(repo, '.wingfoil/workflows/custom/twice.yaml', TWICE);
  writeFixtureFile(repo, '.wingfoil/workflows/custom/bound.yaml', BOUND);
  commitAll(repo, 'seed');
}

function open(repo: string, id: string, workflow: string, element = ''): void {
  writeFixtureFile(repo, `docs/plan/${id}.md`, plan(id, workflow, element));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', `wf(plan): add ${id}`]);
}

type AddResult = Awaited<ReturnType<CoreFn<unknown, { id: string; path: string }>>>;

async function add(repo: string, options: Record<string, string>): Promise<AddResult> {
  const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAdd;
  if (!op) throw new Error('fixture bug: memoryAdd is not registered');
  return (op.fn as CoreFn<unknown, { id: string; path: string }>)({ root: repo, options });
}

const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();
const trailersOfHead = (repo: string): string => git(repo, ['log', '-1', '--format=%(trailers:only,unfold)']).trim();
const bodyOfHead = (repo: string): string => git(repo, ['log', '-1', '--format=%B']).replace(/\s+$/, '');

function instance(repo: string, id: string): InstanceDeduction {
  const found = deduceWorkflowStateAtHead(repo).instances.find((entry) => entry.instance.id === id);
  if (!found) throw new Error(`no open instance ${id}`);
  return found;
}

describe('task-227 — memory add --workflow links the added element to a step (spec-017 §4.8, §7.10)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    seed(repo);
  });
  afterEach(() => removeTempDir(repo));

  describe('AC 1 — the linkage trailers, and the element in the step\'s `created`', () => {
    it('writes WingFoil-Instance and WingFoil-Step in the final trailer block, before WingFoil-Version', async () => {
      open(repo, 'cap-1', 'capture');
      const added = await add(repo, { type: 'bug', title: 'Broken link', workflow: 'cap-1' });
      expect(added.ok).toBe(true);
      if (!added.ok) return;
      expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe(`wf(bug): add ${added.value.id}`);
      const trailers = trailersOfHead(repo).split('\n');
      expect(trailers.slice(0, 2)).toEqual(['WingFoil-Instance: cap-1', 'WingFoil-Step: capture.record']);
      expect(trailers[2]).toMatch(/^WingFoil-Version: /);
      expect(trailers).toHaveLength(3);
      // What the operation reports is the message it recorded, the build signature aside.
      expect(added.commit?.message).toBe(`wf(bug): add ${added.value.id}\n\nWingFoil-Instance: cap-1\nWingFoil-Step: capture.record`);
    });

    it('the next deduction lists the element in the step\'s `created` and binds the self-creating instance', async () => {
      open(repo, 'cap-1', 'capture');
      expect(instance(repo, 'cap-1').instance.element).toBeNull();
      const added = await add(repo, { type: 'bug', title: 'Broken link', workflow: 'cap-1', step: 'capture.record' });
      expect(added.ok).toBe(true);
      if (!added.ok) return;
      const deduced = instance(repo, 'cap-1');
      const bug = { type: 'bug', id: added.value.id, status: 'draft' };
      expect(deduced.instance.element).toEqual(bug);
      expect(deduced.instance.created).toEqual([bug]);
      // Bound, the creating step runs on its element: its key gains the scope (`spec-017` §4.9).
      expect(deduced.frontier.map((step) => [step.key, step.created])).toEqual([[`capture.record@bug:${added.value.id}`, [bug]]]);
    });

    it('a second element linked to the bound creating step is listed in `created` and does not rebind', async () => {
      open(repo, 'cap-1', 'capture');
      const first = await add(repo, { type: 'bug', title: 'First', workflow: 'cap-1' });
      const second = await add(repo, { type: 'bug', title: 'Second', workflow: 'cap-1' });
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(trailersOfHead(repo).split('\n')[1]).toBe(`WingFoil-Step: capture.record@bug:${first.value.id}`);
      const deduced = instance(repo, 'cap-1');
      expect(deduced.instance.element?.id).toBe(first.value.id);
      expect(deduced.instance.created.map((ref) => ref.id)).toEqual([first.value.id, second.value.id]);
    });

    it('a workflow name as <ref> selects its most recently started open instance', async () => {
      open(repo, 'cap-1', 'capture');
      open(repo, 'cap-2', 'capture');
      const added = await add(repo, { type: 'bug', title: 'Second', workflow: 'capture' });
      expect(added.ok).toBe(true);
      expect(trailersOfHead(repo).split('\n').slice(0, 2)).toEqual(['WingFoil-Instance: cap-2', 'WingFoil-Step: capture.record']);
    });
  });

  describe('AC 2 — which step: the one adding --type, or --step; refusals are CONFLICT and write nothing', () => {
    it('no frontier step adds the type: `no step of <instance> adds a <type>`', async () => {
      open(repo, 'cap-1', 'capture');
      const before = head(repo);
      const added = await add(repo, { type: 'note', title: 'A note', workflow: 'cap-1' });
      expect(added).toMatchObject({ ok: false, error: { code: 'CONFLICT', message: 'no step of cap-1 adds a note' } });
      expect(head(repo)).toBe(before);
      expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
    });

    it('a bound instance whose current step adds nothing is refused the same way', async () => {
      writeFixtureFile(repo, 'docs/task/task-001-t.md', '---\nid: "task-001-t"\ntype: task\ntitle: "t"\nstatus: backlog\n---\n');
      commitAll(repo, 'a task');
      open(repo, 'loop-1', 'bound', 'task-001-t');
      const added = await add(repo, { type: 'bug', title: 'B', workflow: 'loop-1' });
      expect(added).toMatchObject({ ok: false, error: { code: 'CONFLICT', message: 'no step of loop-1 adds a bug' } });
    });

    it('several frontier steps add the type: the same refusal, listing their keys and asking for --step', async () => {
      open(repo, 'tw-1', 'twice');
      expect(instance(repo, 'tw-1').frontier.map((step) => step.key)).toEqual(['twice.early', 'twice.late']);
      const before = head(repo);
      const added = await add(repo, { type: 'bug', title: 'B', workflow: 'tw-1' });
      expect(added).toMatchObject({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'no step of tw-1 adds a bug alone: give --step, one of: twice.early, twice.late',
          details: { instance: 'tw-1', type: 'bug', steps: ['twice.early', 'twice.late'] },
        },
      });
      expect(head(repo)).toBe(before);
    });

    it('--step picks one of several', async () => {
      open(repo, 'tw-1', 'twice');
      const added = await add(repo, { type: 'bug', title: 'B', workflow: 'tw-1', step: 'twice.late' });
      expect(added.ok).toBe(true);
      expect(trailersOfHead(repo).split('\n').slice(0, 2)).toEqual(['WingFoil-Instance: tw-1', 'WingFoil-Step: twice.late']);
    });

    it('a --step off the frontier: `step \'<key>\' is not on the frontier of <instance>`', async () => {
      open(repo, 'cap-1', 'capture');
      const added = await add(repo, { type: 'bug', title: 'B', workflow: 'cap-1', step: 'capture.close' });
      expect(added).toMatchObject({ ok: false, error: { code: 'CONFLICT', message: "step 'capture.close' is not on the frontier of cap-1" } });
    });

    it('a frontier --step that adds another type: `no step of <instance> adds a <type>`', async () => {
      open(repo, 'cap-1', 'capture');
      const added = await add(repo, { type: 'note', title: 'N', workflow: 'cap-1', step: 'capture.record' });
      expect(added).toMatchObject({ ok: false, error: { code: 'CONFLICT', message: 'no step of cap-1 adds a note' } });
    });

    it('a <ref> naming no open instance is NOT_FOUND, as `workflow next` words it', async () => {
      expect(await add(repo, { type: 'bug', title: 'B', workflow: 'capture' })).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'workflow is not open: capture' },
      });
      expect(await add(repo, { type: 'bug', title: 'B', workflow: 'ghost' })).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'unknown workflow: ghost' },
      });
    });

    it('--step without --workflow is a usage error (exit 2)', async () => {
      await expect(add(repo, { type: 'bug', title: 'B', step: 'capture.record' })).rejects.toThrow(
        new UsageError('missing required argument: --workflow'),
      );
    });
  });

  describe('AC 3 — without --workflow, memory add links nothing', () => {
    it('records the bare subject and the build signature, no linkage line, even with an instance open', async () => {
      open(repo, 'cap-1', 'capture');
      const added = await add(repo, { type: 'bug', title: 'Unlinked' });
      expect(added.ok).toBe(true);
      if (!added.ok) return;
      expect(added.commit?.message).toBe(`wf(bug): add ${added.value.id}`);
      expect(bodyOfHead(repo)).toBe(`wf(bug): add ${added.value.id}${STAMP_TRAILER}`);
      expect(instance(repo, 'cap-1').instance.created).toEqual([]);
    });
  });
});
