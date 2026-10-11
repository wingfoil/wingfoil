/**
 * task-211 — `wingfoil workflow create <name>` and `wingfoil workflow remove <ref>` (`spec-017` §7.7, §7.8,
 * §10, §11; BDD P4.8, P4.9; REQ-SEC-07; `dl-030`, `dl-066` option 1, `dl-086`), through the registered
 * `CORE_MODULES` operations, on fixture repositories committed at `HEAD`.
 *
 * - AC 1: BDD P4.8 sc. 1 (the file under `custom/`, never `built-in/`, referenced by the manifest, one commit),
 *   sc. 2 (an instance in flight is untouched), sc. 3 (`workflow already exists: <name>`, nothing overwritten —
 *   also when only the file exists on disk, `dl-086`); the usage errors (exit 2) are thrown `UsageError`s.
 * - AC 2: BDD P4.9 sc. 1–3 and the open-instance scenario; a modified `workflows.yaml` is refused by the write
 *   guard.
 * - AC 3: the created file loads with zero errors through the registry (`loadWorkflowRegistryAtHead`, task-194).
 * - AC 5: the still-included refusal (`dl-030`: REQ-SEC-07 clause (b)'s workflow half, owned here).
 *
 * The CLI's exit codes and console bytes are `test/cli/workflow-create-remove.integration.test.ts`.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { CORE_MODULES, deduceWorkflowStateAtHead, enumerateOperations, loadWorkflowRegistryAtHead } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
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
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

/** The manifest, with the comments an in-place edit must keep. */
const MANIFEST = `# The main workflow configuration.
version: 1.0

include:
  # startable
  - workflows/custom/release-cycle.yaml   # the release cycle
  - workflows/custom/hotfix.yaml
  - workflows/custom/checklist.yaml
  - workflows/custom/arch-review.yaml
  - workflows/built-in/base.yaml
  # includable
  - workflows/custom/shared.yaml

# trailing comment
`;

const WORKFLOWS: Readonly<Record<string, string>> = {
  'custom/release-cycle.yaml': `name: release-cycle
startable: true
element: release
phases:
  - name: smoke
    role: developer
  - name: checks
    include: shared
  - name: ship
    role: developer
    actions:
      - element.set_state(released)
`,
  'custom/hotfix.yaml': `name: hotfix
startable: true
phases:
  - name: fix
    role: developer
  - name: checks
    include: shared
`,
  'custom/checklist.yaml': `name: checklist
startable: true
phases:
  - name: tick
    role: developer
`,
  'custom/arch-review.yaml': `name: arch-review
startable: true
phases:
  - name: review
    role: developer
`,
  'built-in/base.yaml': `name: base
startable: true
phases:
  - name: one
    role: developer
`,
  'custom/shared.yaml': `name: shared
includable: true
phases:
  - name: lint
    role: developer
`,
};

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** Six workflows (one built-in), a release, and two open instances: `release-cycle` on the release, and `checklist`. */
function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', MANIFEST);
  for (const [file, text] of Object.entries(WORKFLOWS)) writeFixtureFile(root, `.wingfoil/workflows/${file}`, text);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'docs/releases/minor-1.md', element('release', 'minor-1', 'in-development'));
  writeFixtureFile(root, 'docs/plans/rc-1-plan.md', element('plan', 'rc-1-plan', 'active', 'workflow: "release-cycle"\nphase: "minor-1"\nelement: "minor-1"\n'));
  writeFixtureFile(root, 'docs/plans/checklist-1-plan.md', element('plan', 'checklist-1-plan', 'active', 'workflow: "checklist"\nphase: "1"\nelement: ""\n'));
  commitAll(root, 'fixture');
}

function operation(name: 'workflowCreate' | 'workflowRemove'): CoreFn<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === name);
  if (found === undefined) throw new Error(`${name} is not registered`);
  return found.operation.fn;
}

interface CreateArgs {
  readonly kind?: string;
  readonly element?: string;
  readonly description?: string;
  readonly startable?: boolean;
  readonly includable?: boolean;
}

async function create(root: string, name: string | undefined, args: CreateArgs = {}): Promise<CoreResult<unknown>> {
  const options: Record<string, string> = {};
  if (args.kind !== undefined) options['kind'] = args.kind;
  if (args.element !== undefined) options['element'] = args.element;
  if (args.description !== undefined) options['description'] = args.description;
  return operation('workflowCreate')({
    root,
    ...(name === undefined ? {} : { positional: name }),
    options,
    ...(args.startable === undefined ? {} : { startable: args.startable }),
    ...(args.includable === undefined ? {} : { includable: args.includable }),
  });
}

async function remove(root: string, ref: string | undefined): Promise<CoreResult<unknown>> {
  return operation('workflowRemove')({ root, ...(ref === undefined ? {} : { positional: ref }) });
}

const out = (root: string, args: string[]): string => git(root, args).trim();
const head = (root: string): string => out(root, ['rev-parse', 'HEAD']);
const changedPaths = (root: string, commit: string): string[] => out(root, ['show', '--name-only', '--format=', commit]).split('\n').sort();
const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf-8');

interface CreateValue {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly name: string;
  readonly file: string;
  readonly startable: boolean;
  readonly includable: boolean;
  readonly commit: string;
}

interface RemoveValue {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly name: string;
  readonly file: string;
  readonly commit: string;
}

function valueOf<T>(result: CoreResult<unknown>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result.value as T;
}

function refusal(result: CoreResult<unknown>): { code: string; message: string; details?: unknown } {
  if (result.ok) throw new Error('expected a refusal');
  return result.error as { code: string; message: string; details?: unknown };
}

describe('workflow create and workflow remove (task-211, spec-017 §7.7–§7.8)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  describe('BDD P4.8 — workflow create (AC 1, AC 3)', () => {
    it('sc. 1: writes the file under custom/, appends it to the manifest in place, one commit with both files', async () => {
      const before = head(repo);
      const value = valueOf<CreateValue>(await create(repo, 'design-review', { kind: 'main' }));

      expect(value).toMatchObject({ name: 'design-review', file: '.wingfoil/workflows/custom/design-review.yaml', startable: true, includable: false });
      expect(value.baseline).toEqual({ rev: 'HEAD', commit: before });
      expect(existsSync(join(repo, '.wingfoil/workflows/built-in/design-review.yaml'))).toBe(false);
      expect(read(repo, '.wingfoil/workflows/custom/design-review.yaml')).toBe('name: design-review\nstartable: true\nversion: 1.0\nphases:\n  - name: step-1\n');
      // The manifest keeps every comment and gains one line after the last item, at its indentation.
      expect(read(repo, '.wingfoil/workflows.yaml')).toBe(
        MANIFEST.replace('  - workflows/custom/shared.yaml\n', '  - workflows/custom/shared.yaml\n  - workflows/custom/design-review.yaml\n'),
      );
      expect(out(repo, ['rev-parse', 'HEAD~1'])).toBe(before);
      expect(value.commit).toBe(head(repo));
      expect(out(repo, ['log', '-1', '--format=%s'])).toBe('wf(workflow): create design-review');
      expect(changedPaths(repo, 'HEAD')).toEqual(['.wingfoil/workflows.yaml', '.wingfoil/workflows/custom/design-review.yaml']);
      expect(out(repo, ['status', '--porcelain'])).toBe('');
    });

    it('AC 3: every form loads at HEAD with zero errors and the declared facts (task-136–task-194)', async () => {
      valueOf(await create(repo, 'sub-flow', { kind: 'sub' }));
      valueOf(await create(repo, 'both-flow', { startable: true, includable: true, element: 'release', description: 'Review the "design": twice' }));
      valueOf(await create(repo, 'start-flow', { startable: true }));
      valueOf(await create(repo, 'inc-flow', { includable: true }));

      const registry = loadWorkflowRegistryAtHead(repo);
      expect(registry.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
      const byName = new Map(registry.workflows.map((workflow) => [workflow.name, workflow]));
      expect(byName.get('sub-flow')).toMatchObject({ includable: true, phases: [{ name: 'step-1' }] });
      expect(byName.get('sub-flow')?.startable).toBeUndefined();
      expect(byName.get('both-flow')).toMatchObject({ startable: true, includable: true, element: 'release', description: 'Review the "design": twice', version: 1 });
      expect(byName.get('start-flow')).toMatchObject({ startable: true });
      expect(byName.get('inc-flow')).toMatchObject({ includable: true });
      expect(registry.manifest?.include.slice(-4)).toEqual([
        'workflows/custom/sub-flow.yaml',
        'workflows/custom/both-flow.yaml',
        'workflows/custom/start-flow.yaml',
        'workflows/custom/inc-flow.yaml',
      ]);
    });

    it('sc. 2: an instance in flight is untouched — its plan and its frontier are the same after the create', async () => {
      const planBefore = read(repo, 'docs/plans/rc-1-plan.md');
      const frontier = (): string[] =>
        (deduceWorkflowStateAtHead(repo).instances.find((entry) => entry.instance.id === 'rc-1-plan')?.frontier ?? []).map((step) => step.key);
      const before = frontier();
      expect(before.length).toBeGreaterThan(0);

      valueOf(await create(repo, 'design-review', { kind: 'main' }));

      expect(read(repo, 'docs/plans/rc-1-plan.md')).toBe(planBefore);
      expect(frontier()).toEqual(before);
    });

    it('sc. 3: a workflow loaded at HEAD under that name is refused, nothing is overwritten or committed', async () => {
      const before = head(repo);
      const error = refusal(await create(repo, 'arch-review', { kind: 'main' }));
      expect(error).toMatchObject({ code: 'CONFLICT', message: 'workflow already exists: arch-review' });
      expect(read(repo, '.wingfoil/workflows/custom/arch-review.yaml')).toBe(WORKFLOWS['custom/arch-review.yaml']);
      expect(read(repo, '.wingfoil/workflows.yaml')).toBe(MANIFEST);
      expect(head(repo)).toBe(before);
    });

    it('sc. 3: the name of a built-in workflow is taken too (the name is unique across the registry)', async () => {
      expect(refusal(await create(repo, 'base', { kind: 'main' }))).toMatchObject({ code: 'CONFLICT', message: 'workflow already exists: base' });
    });

    it('sc. 3 (dl-086): a file on disk at the target is refused although no workflow of that name is loaded', async () => {
      writeFileSync(join(repo, '.wingfoil/workflows/custom/ghost.yaml'), 'name: ghost\n# work in progress\n');
      const before = head(repo);
      const error = refusal(await create(repo, 'ghost', { kind: 'main' }));
      expect(error).toMatchObject({ code: 'CONFLICT', message: 'workflow already exists: ghost' });
      expect(read(repo, '.wingfoil/workflows/custom/ghost.yaml')).toBe('name: ghost\n# work in progress\n');
      expect(head(repo)).toBe(before);
    });

    it.each<[string, string | undefined, CreateArgs, string]>([
      ['a missing name', undefined, { kind: 'main' }, 'missing required argument: <name>'],
      ['a name outside [a-z][a-z0-9-]*', 'Arch_Review', { kind: 'main' }, "invalid workflow name 'Arch_Review' (allowed: [a-z][a-z0-9-]*)"],
      ['a path-shaped name', '../escape', { kind: 'main' }, "invalid workflow name '../escape' (allowed: [a-z][a-z0-9-]*)"],
      ['--kind with --startable', 'x-flow', { kind: 'main', startable: true }, '--kind cannot be combined with --startable or --includable (declare one or the other)'],
      ['--kind with --includable', 'x-flow', { kind: 'sub', includable: true }, '--kind cannot be combined with --startable or --includable (declare one or the other)'],
      ['neither --kind nor a boolean', 'x-flow', {}, 'missing required argument: --kind, --startable or --includable'],
      ['an unknown --kind', 'x-flow', { kind: 'both' }, "invalid workflow kind 'both' (allowed: main, sub)"],
    ])('usage: %s → UsageError (exit 2), nothing written', async (_label, name, args, message) => {
      const before = head(repo);
      await expect(create(repo, name, args)).rejects.toEqual(new UsageError(message));
      expect(head(repo)).toBe(before);
      expect(out(repo, ['status', '--porcelain'])).toBe('');
    });

    it('an --element type memory.yaml does not declare is refused: the workflows would not load (VALIDATION)', async () => {
      const before = head(repo);
      const error = refusal(await create(repo, 'x-flow', { kind: 'main', element: 'epic' }));
      expect(error.code).toBe('VALIDATION');
      expect(error.message).toMatch(/^workflow 'x-flow' would not load: /);
      expect(JSON.stringify(error.details)).toContain('E_WORKFLOW_ELEMENT_TYPE_UNKNOWN');
      expect(existsSync(join(repo, '.wingfoil/workflows/custom/x-flow.yaml'))).toBe(false);
      expect(read(repo, '.wingfoil/workflows.yaml')).toBe(MANIFEST);
      expect(head(repo)).toBe(before);
    });

    it('the write guard refuses a modified workflows.yaml (spec-017 §7.7, §10)', async () => {
      const edited = `${MANIFEST}# an uncommitted note\n`;
      writeFileSync(join(repo, '.wingfoil/workflows.yaml'), edited);
      const before = head(repo);
      const error = refusal(await create(repo, 'x-flow', { kind: 'main' }));
      expect(error.code).toBe('VALIDATION');
      expect(error.message).toMatch(/^refusing to commit \.wingfoil\/workflows\.yaml: it carries uncommitted modifications/);
      expect(read(repo, '.wingfoil/workflows.yaml')).toBe(edited);
      expect(existsSync(join(repo, '.wingfoil/workflows/custom/x-flow.yaml'))).toBe(false);
      expect(head(repo)).toBe(before);
    });
  });

  describe('BDD P4.9 — workflow remove (AC 2, AC 5)', () => {
    it('sc. 1: deletes the file and its include line in one commit; the registry no longer loads it', async () => {
      const before = head(repo);
      const value = valueOf<RemoveValue>(await remove(repo, 'arch-review'));

      expect(value).toMatchObject({ name: 'arch-review', file: '.wingfoil/workflows/custom/arch-review.yaml' });
      expect(value.baseline).toEqual({ rev: 'HEAD', commit: before });
      expect(existsSync(join(repo, '.wingfoil/workflows/custom/arch-review.yaml'))).toBe(false);
      expect(read(repo, '.wingfoil/workflows.yaml')).toBe(MANIFEST.replace('  - workflows/custom/arch-review.yaml\n', ''));
      expect(out(repo, ['rev-parse', 'HEAD~1'])).toBe(before);
      expect(value.commit).toBe(head(repo));
      expect(out(repo, ['log', '-1', '--format=%s'])).toBe('wf(workflow): remove arch-review');
      expect(changedPaths(repo, 'HEAD')).toEqual(['.wingfoil/workflows.yaml', '.wingfoil/workflows/custom/arch-review.yaml']);
      expect(loadWorkflowRegistryAtHead(repo).workflows.map((workflow) => workflow.name)).not.toContain('arch-review');
      expect(out(repo, ['status', '--porcelain'])).toBe('');
    });

    it('sc. 2 (dl-030: REQ-SEC-07 clause (b), the workflow half): included elsewhere → CONFLICT naming the first referrer, all in details', async () => {
      const before = head(repo);
      const error = refusal(await remove(repo, 'shared'));
      expect(error).toMatchObject({
        code: 'CONFLICT',
        message: "cannot remove 'shared': included by 'hotfix'",
        details: { referrers: ['hotfix', 'release-cycle'] },
      });
      expect(read(repo, '.wingfoil/workflows/custom/shared.yaml')).toBe(WORKFLOWS['custom/shared.yaml']);
      expect(read(repo, '.wingfoil/workflows.yaml')).toBe(MANIFEST);
      expect(head(repo)).toBe(before);
    });

    it('sc. 3: a workflow under workflows/built-in/ is refused (REQ-SEC-07 clause (a))', async () => {
      const before = head(repo);
      expect(refusal(await remove(repo, 'base'))).toMatchObject({ code: 'VALIDATION', message: 'built-in workflows cannot be removed' });
      expect(existsSync(join(repo, '.wingfoil/workflows/built-in/base.yaml'))).toBe(true);
      expect(head(repo)).toBe(before);
    });

    it('new scenario: a workflow with an open instance is refused (CONFLICT), whether named or given by the instance id', async () => {
      const before = head(repo);
      const expected = { code: 'CONFLICT', message: "cannot remove 'checklist': open instance checklist-1-plan", details: { instances: ['checklist-1-plan'] } };
      expect(refusal(await remove(repo, 'checklist'))).toMatchObject(expected);
      expect(refusal(await remove(repo, 'checklist-1-plan'))).toMatchObject(expected);
      expect(existsSync(join(repo, '.wingfoil/workflows/custom/checklist.yaml'))).toBe(true);
      expect(head(repo)).toBe(before);
    });

    it('an unknown <ref> is NOT_FOUND unknown workflow', async () => {
      expect(refusal(await remove(repo, 'nope'))).toMatchObject({ code: 'NOT_FOUND', message: 'unknown workflow: nope' });
    });

    it('a missing <ref> is the missing-operand UsageError (exit 2)', async () => {
      await expect(remove(repo, undefined)).rejects.toEqual(new UsageError('missing required argument: <ref>'));
    });

    it('the write guard refuses a modified workflows.yaml (P4.9, spec-017 §10)', async () => {
      const edited = MANIFEST.replace('# trailing comment', '# trailing comment, edited');
      writeFileSync(join(repo, '.wingfoil/workflows.yaml'), edited);
      const before = head(repo);
      const error = refusal(await remove(repo, 'arch-review'));
      expect(error.code).toBe('VALIDATION');
      expect(error.message).toMatch(/^refusing to commit \.wingfoil\/workflows\.yaml: it carries uncommitted modifications/);
      expect(existsSync(join(repo, '.wingfoil/workflows/custom/arch-review.yaml'))).toBe(true);
      expect(read(repo, '.wingfoil/workflows.yaml')).toBe(edited);
      expect(head(repo)).toBe(before);
    });

    it('the write guard refuses a modified workflow file: its uncommitted edit would be destroyed', async () => {
      writeFileSync(join(repo, '.wingfoil/workflows/custom/arch-review.yaml'), `${WORKFLOWS['custom/arch-review.yaml']}# edited\n`);
      const error = refusal(await remove(repo, 'arch-review'));
      expect(error.code).toBe('VALIDATION');
      expect(error.message).toMatch(/^refusing to commit \.wingfoil\/workflows\/custom\/arch-review\.yaml: /);
      expect(read(repo, '.wingfoil/workflows/custom/arch-review.yaml')).toContain('# edited');
    });

    it('a removal that would leave the workflows unloadable is refused (VALIDATION): the last startable workflow', async () => {
      const solo = makeTempGitRepo();
      try {
        writeFixtureFile(solo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/solo.yaml\n  - workflows/custom/part.yaml\n');
        writeFixtureFile(solo, '.wingfoil/workflows/custom/solo.yaml', 'name: solo\nstartable: true\nphases:\n  - name: one\n    role: developer\n');
        writeFixtureFile(solo, '.wingfoil/workflows/custom/part.yaml', 'name: part\nincludable: true\nphases:\n  - name: one\n    role: developer\n');
        writeFixtureFile(solo, '.wingfoil/memory.yaml', MEMORY_YAML);
        writeFixtureFile(solo, '.wingfoil/dna.yaml', DNA_YAML);
        commitAll(solo, 'fixture');
        const before = head(solo);
        const error = refusal(await remove(solo, 'solo'));
        expect(error.code).toBe('VALIDATION');
        expect(error.message).toMatch(/^cannot remove 'solo': the workflows would not load: /);
        expect(JSON.stringify(error.details)).toContain('E_NO_MAIN_WORKFLOW');
        expect(existsSync(join(solo, '.wingfoil/workflows/custom/solo.yaml'))).toBe(true);
        expect(head(solo)).toBe(before);
      } finally {
        removeTempDir(solo);
      }
    });
  });
});
