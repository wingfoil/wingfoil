/**
 * `wingfoil workflow create <name>` and `wingfoil workflow remove <ref>` (task-211; `spec-017` §7.7, §7.8, §10,
 * §11; BDD P4.8, P4.9; REQ-SEC-07, `dl-030`, `dl-066` option 1, `dl-086`).
 *
 * **Baseline.** Both decide at `HEAD` (`spec-017` §11): `create` reads the registry for the name's uniqueness,
 * `remove` the registry, the referrers and the open instances (the deduction). The one filesystem read is
 * `create`'s check that its target file is not already on disk (`dl-086`: a read predicting where a write
 * lands resolves on the filesystem). Every written path is guarded first: confinement (REQ-SEC-06) and
 * `requireUnmodifiedTarget` (`dl-080` (B)), so a modified `workflows.yaml` is refused, never swept in.
 *
 * **The registry the commit would leave is loaded before writing** (task-211 design decision 2): `HEAD`'s
 * workflow files with the new file and the edited manifest overlaid (or the removed file absent), through the
 * same loader and core checks every workflow command reads (`loadWorkflowRegistryAtRev`, task-194). A `spec-003`
 * error refuses the command, so neither can leave a repository whose `workflow list` fails — the created file
 * loads with zero errors by construction (AC 3).
 *
 * **One commit, both files**, written through `writeAndCommit` (so `--dry-run` plans it, task-210):
 * `wf(workflow): create <name>` / `wf(workflow): remove <name>` — scopes the audit reader skips as non-Memory
 * (`src/memory/audit.ts`, task-126).
 */
import { join } from 'path';

import { documentExists, readDocument, writeAndCommit } from '../storage';
import { DiagnosticsError, raiseConfigVersion } from '../validation';
import { withWarningSink } from '../validation/warning';
import { renderCustomWorkflow, type NewWorkflow } from '../workflow/create';
import { deduceWorkflowState, type Baseline } from '../workflow/deduce';
import { withIncludeAdded, withIncludeRemoved, type ManifestEdit } from '../workflow/manifest-edit';
import { invalidKindMessage, WORKFLOW_NAME_RE, type Workflow } from '../workflow/schema';

import { requireCustomAsset } from './builtin-asset';
import { requireConfinedTarget, requireConfinedWriteTarget } from './confinement';
import { requireGitIdentity } from './git-identity';
import { requireInitializedProject } from './init';
import { missingOperandReason } from './registry';
import { atHeadOr, resolveRevision } from './revision';
import { coreErr, coreOk, type CoreResult } from './types';
import { UsageError } from './usage-error';
import { verifyCommittedPaths, requireUnmodifiedTarget } from './write-guard';
import { readDeductionSnapshotAtHead } from './workflow-deduction';
import { unknownWorkflowMessage } from './workflow-list-show';
import { loadWorkflowRegistryAtRev } from './workflow-registry';

/** The manifest both commands edit, repository-relative. */
export const WORKFLOWS_MANIFEST_PATH = '.wingfoil/workflows.yaml';

/** `.wingfoil/`'s prefix on a repository-relative path; a manifest `include` entry is relative to it. */
const CONFIG_PREFIX = '.wingfoil/';

/** `--kind` with a boolean (exit 2; `spec-003`'s `E_WORKFLOW_KIND_CONFLICT`, as an argument error). */
export const KIND_CONFLICT_MESSAGE = '--kind cannot be combined with --startable or --includable (declare one or the other)';

/** Neither `--kind` nor a boolean (exit 2; `spec-003`'s `E_WORKFLOW_NEITHER_STARTABLE_NOR_INCLUDABLE`). */
export const NO_DECLARATION_MESSAGE = 'missing required argument: --kind, --startable or --includable';

/** `spec-017` §10's refusal of a duplicate name (BDD P4.8 sc. 3). */
export const workflowExistsMessage = (name: string): string => `workflow already exists: ${name}`;

/** `wingfoil workflow create <name> …` params: the name rides the positional, `--kind` / `--element` / `--description` the options. */
export interface WorkflowCreateParams {
  readonly root: string;
  readonly positional?: string;
  readonly options?: Readonly<Record<string, string | readonly string[]>>;
  readonly startable?: boolean;
  readonly includable?: boolean;
}

/** `wingfoil workflow remove <ref>` params. */
export interface WorkflowRemoveParams {
  readonly root: string;
  readonly positional?: string;
}

/** `workflow create`'s result (`spec-017` §8, task-211): the workflow written and the commit. */
export interface CreateResult {
  readonly baseline: Baseline;
  readonly name: string;
  readonly file: string;
  readonly startable: boolean;
  readonly includable: boolean;
  readonly commit: string;
}

/** `workflow remove`'s result (`spec-017` §8, task-211): the workflow deleted and the commit. */
export interface RemoveResult {
  readonly baseline: Baseline;
  readonly name: string;
  readonly file: string;
  readonly commit: string;
}

/** A value option's text, or `undefined` (none of these options is repeatable). */
function option(options: WorkflowCreateParams['options'], name: string): string | undefined {
  const value = options?.[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * The argument checks of `create` (exit `2`, before any read, task-125): the name, then the declaration.
 * `--kind` maps onto the two booleans `dl-109` K1 (a) makes canonical.
 */
function createUsage(params: WorkflowCreateParams): NewWorkflow {
  const name = params.positional;
  if (name === undefined || name.trim() === '') throw new UsageError(missingOperandReason('name'));
  if (!WORKFLOW_NAME_RE.test(name)) throw new UsageError(`invalid workflow name '${name}' (allowed: [a-z][a-z0-9-]*)`);
  const kind = option(params.options, 'kind');
  const startable = params.startable === true;
  const includable = params.includable === true;
  let facts: { startable: boolean; includable: boolean };
  if (kind !== undefined) {
    if (startable || includable) throw new UsageError(KIND_CONFLICT_MESSAGE);
    if (kind !== 'main' && kind !== 'sub') throw new UsageError(invalidKindMessage(kind));
    facts = { startable: kind === 'main', includable: kind === 'sub' };
  } else {
    if (!startable && !includable) throw new UsageError(NO_DECLARATION_MESSAGE);
    facts = { startable, includable };
  }
  const element = option(params.options, 'element');
  const description = option(params.options, 'description');
  return { name, ...facts, ...(element === undefined ? {} : { element }), ...(description === undefined ? {} : { description }) };
}

/** The refusal of a manifest the include edit cannot make in place (task-211 design decision 7). */
function notEditable(edit: Extract<ManifestEdit, { ok: false }>): CoreResult<never> {
  return coreErr({ code: 'CONFLICT', message: `workflows.yaml cannot be edited in place: ${edit.reason}` });
}

/**
 * Load the registry `sha` would hold with `overlay` applied; a `spec-003` error is `VALIDATION`, its message
 * prefixed with `prefix` and every diagnostic in `details`. The load's warnings are dropped: the commit's own
 * later loads report them.
 */
function prospectiveLoad(root: string, sha: string, overlay: ReadonlyMap<string, string | null>, prefix: string): CoreResult<undefined> {
  try {
    withWarningSink(
      () => {},
      () => loadWorkflowRegistryAtRev(root, sha, overlay),
    );
    return coreOk(undefined);
  } catch (error) {
    if (!(error instanceof DiagnosticsError)) throw error;
    return coreErr({ code: 'VALIDATION', message: `${prefix}: ${error.message}`, details: { diagnostics: error.diagnostics } });
  }
}

/** Commit `changes` as `message` and verify the commit carries exactly them (the post-commit alarm). */
function commitBoth(root: string, changes: readonly { path: string; content: string | null }[], message: string): CoreResult<string> {
  const sha = writeAndCommit(root, changes, message);
  const problems = verifyCommittedPaths(root, sha, new Map(changes.map((change) => [change.path, change.content])));
  if (problems.length > 0) return coreErr({ code: 'VALIDATION', message: `commit ${sha} carries more than the change it declares: ${problems.join('; ')}` });
  return coreOk(sha);
}

/**
 * `workflow create <name>` (`spec-017` §7.7, BDD P4.8). Refusal order: usage → identity (REQ-SEC-01) →
 * initialized project → the registry at `HEAD` (a `spec-003` error is `VALIDATION`) → a workflow of that name
 * loaded at `HEAD` (`CONFLICT`) → confinement → the target on disk (`dl-086`, `CONFLICT`) → the write guard on
 * the target and on `workflows.yaml` → the in-place manifest edit → the prospective load → the commit.
 *
 * @throws `UsageError` (exit 2) for the argument errors; `DiagnosticsError` for a `spec-003` error at `HEAD`.
 */
export async function workflowCreate(params: WorkflowCreateParams): Promise<CoreResult<CreateResult>> {
  const { root } = params;
  const workflow = createUsage(params);
  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;
  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  const sha = atHeadOr(root, () => resolveRevision(root, 'HEAD'), null);
  if (sha === null) return coreErr({ code: 'VALIDATION', message: 'workflow create needs a commit at HEAD: commit the project configuration first' });
  const registry = loadWorkflowRegistryAtRev(root, sha);
  const { name } = workflow;
  if (registry.workflows.some((loaded) => loaded.name === name)) return coreErr({ code: 'CONFLICT', message: workflowExistsMessage(name), details: { name } });

  const entry = `workflows/custom/${name}.yaml`;
  const file = `${CONFIG_PREFIX}${entry}`;
  for (const path of [file, WORKFLOWS_MANIFEST_PATH]) {
    const confined = requireConfinedWriteTarget(root, path, 'write');
    if (!confined.ok) return confined;
  }
  // `dl-086`: whether the write would land on an existing file is a question about the filesystem, not `HEAD`.
  if (documentExists(join(root, file))) return coreErr({ code: 'CONFLICT', message: workflowExistsMessage(name), details: { name, file } });
  for (const path of [file, WORKFLOWS_MANIFEST_PATH]) {
    const unmodified = requireUnmodifiedTarget(root, path);
    if (!unmodified.ok) return unmodified;
  }

  const manifestPath = join(root, WORKFLOWS_MANIFEST_PATH);
  const manifestExists = documentExists(manifestPath);
  const added = withIncludeAdded(manifestExists ? readDocument(manifestPath) : null, entry);
  if (!added.ok) return notEditable(added);
  // dl-174 (a), spec-006 §6 item 7 (task-299): an existing manifest's `version:` is raised in this commit; a
  // manifest written whole for the first time already carries `version: 1.0` (`withIncludeAdded`).
  const edit = { ok: true as const, text: manifestExists ? raiseConfigVersion(added.text) : added.text };
  const content = renderCustomWorkflow(workflow);
  const overlay = new Map<string, string | null>([
    [file, content],
    [WORKFLOWS_MANIFEST_PATH, edit.text],
  ]);
  const loads = prospectiveLoad(root, sha, overlay, `workflow '${name}' would not load`);
  if (!loads.ok) return loads;

  const message = `wf(workflow): create ${name}`;
  const committed = commitBoth(root, [{ path: file, content }, { path: WORKFLOWS_MANIFEST_PATH, content: edit.text }], message);
  if (!committed.ok) return committed;
  return coreOk(
    { baseline: { rev: 'HEAD', commit: sha }, name, file, startable: workflow.startable, includable: workflow.includable, commit: committed.value },
    { sha: committed.value, message },
  );
}

/** The workflows whose phases `include:` `name`, ascending — the referrer source under `dl-066` option 1. */
function includedBy(workflows: readonly Workflow[], name: string): string[] {
  return workflows
    .filter((workflow) => workflow.name !== name && workflow.phases.some((phase) => phase.include === name))
    .map((workflow) => workflow.name)
    .sort();
}

/**
 * `workflow remove <ref>` (`spec-017` §7.8, BDD P4.9, REQ-SEC-07). `<ref>` is a workflow name, or an open
 * instance id standing for its workflow (as `show` resolves it). Refusal order: usage → identity →
 * initialized project → the registry and the deduction at `HEAD` → `<ref>` (`NOT_FOUND`) → a file under
 * `workflows/built-in/` (REQ-SEC-07 clause (a), `VALIDATION`) → included by another workflow (clause (b),
 * `dl-030`; `CONFLICT`, every referrer in `details.referrers`) → an open instance (`CONFLICT`, every id in
 * `details.instances`; each also a `details.issues` line, which the surfaces print) → confinement → the write guard on the file and on `workflows.yaml` → the in-place
 * manifest edit → the prospective load → the commit.
 *
 * @throws `UsageError` (exit 2) without `<ref>`; `DiagnosticsError` for a `spec-003` error at `HEAD`.
 */
export async function workflowRemove(params: WorkflowRemoveParams): Promise<CoreResult<RemoveResult>> {
  const { root, positional: ref } = params;
  if (ref === undefined || ref.trim() === '') throw new UsageError(missingOperandReason('ref'));
  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;
  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;

  const snapshot = readDeductionSnapshotAtHead(root);
  const deduction = deduceWorkflowState(snapshot);
  const name = snapshot.workflows.some((workflow) => workflow.name === ref)
    ? ref
    : (deduction.instances.find((entry) => entry.instance.id === ref)?.instance.workflow ?? ref);
  const index = snapshot.workflows.findIndex((workflow) => workflow.name === name);
  if (index === -1) return coreErr({ code: 'NOT_FOUND', message: unknownWorkflowMessage(name), details: { ref } });
  // The registry's workflows are its manifest's files in `include` order, each `.wingfoil/`-prefixed.
  const file = snapshot.workflowFiles[index]!;
  const entry = file.slice(CONFIG_PREFIX.length);

  const custom = requireCustomAsset('workflow', entry);
  if (!custom.ok) return custom;
  const referrers = includedBy(snapshot.workflows, name);
  if (referrers.length > 0) {
    const issues = referrers.map((referrer) => ({ detail: `included by '${referrer}'` }));
    return coreErr({ code: 'CONFLICT', message: `cannot remove '${name}': included by '${referrers[0]}'`, details: { referrers, issues } });
  }
  const instances = deduction.instances
    .filter((open) => open.instance.workflow === name)
    .map((open) => open.instance.id)
    .sort();
  if (instances.length > 0) {
    const issues = instances.map((id) => ({ detail: `open instance ${id}` }));
    return coreErr({ code: 'CONFLICT', message: `cannot remove '${name}': open instance ${instances[0]}`, details: { instances, issues } });
  }

  const confined = requireConfinedTarget(root, file, 'remove');
  if (!confined.ok) return confined;
  const manifestConfined = requireConfinedWriteTarget(root, WORKFLOWS_MANIFEST_PATH, 'write');
  if (!manifestConfined.ok) return manifestConfined;
  for (const path of [file, WORKFLOWS_MANIFEST_PATH]) {
    const unmodified = requireUnmodifiedTarget(root, path);
    if (!unmodified.ok) return unmodified;
  }

  const removed = withIncludeRemoved(readDocument(join(root, WORKFLOWS_MANIFEST_PATH)), entry);
  if (!removed.ok) return notEditable(removed);
  // dl-174 (a): the manifest's `version:` is raised in this commit (spec-017 §7.8).
  const edit = { ok: true as const, text: raiseConfigVersion(removed.text) };
  const overlay = new Map<string, string | null>([
    [file, null],
    [WORKFLOWS_MANIFEST_PATH, edit.text],
  ]);
  const loads = prospectiveLoad(root, snapshot.commit, overlay, `cannot remove '${name}': the workflows would not load`);
  if (!loads.ok) return loads;

  const message = `wf(workflow): remove ${name}`;
  const committed = commitBoth(root, [{ path: file, content: null }, { path: WORKFLOWS_MANIFEST_PATH, content: edit.text }], message);
  if (!committed.ok) return committed;
  return coreOk({ baseline: deduction.baseline, name, file, commit: committed.value }, { sha: committed.value, message });
}

/** Whether `value` is a dry run's plan rather than the command's own result (`spec-008` §2). */
function isDryRunPlan(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { dryRun?: unknown }).dryRun === true;
}

/** `workflow create`'s `--format console` rendering: the workflow, its file and the commit. Pure. */
export function renderCreateConsole(value: CreateResult): string {
  if (isDryRunPlan(value)) return `${JSON.stringify(value, null, 2)}\n`;
  return `created workflow ${value.name} (${value.file}) in ${value.commit}\n`;
}

/** `workflow remove`'s `--format console` rendering: the workflow, its file and the commit. Pure. */
export function renderRemoveConsole(value: RemoveResult): string {
  if (isDryRunPlan(value)) return `${JSON.stringify(value, null, 2)}\n`;
  return `removed workflow ${value.name} (${value.file}) in ${value.commit}\n`;
}
