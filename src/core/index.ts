/**
 * `core` module — shared domain logic; single behavior behind both the CLI and MCP surfaces
 * (REQ-SYS-05). Exposes one loader per Project pillar (task-004-decoupled-pillars, REQ-SYS-02):
 * `loadMemoryYaml`, `loadDnaYaml`, `loadWorkflowsYaml`, `loadDirectives` — each independently reads
 * and validates only its own pillar's artifact(s), so editing one pillar's config never requires
 * touching another's loader.
 *
 * task-006-dual-interface-shared-core adds the `CoreModule` registry (spec-006-core-domain-api):
 * `CORE_MODULES` below is the single array `src/cli` and `src/mcp` both derive their surfaces
 * from. It is intentionally small today — see the SCOPE note on `CORE_MODULES` — the full
 * memory/dna/directives/workflow domain-operation tables in spec-006 §3 (`memoryAdd`, `dnaSet`,
 * `directiveCreate`, ...) are feature work for task-018..030, not this task.
 */
import { join, relative, sep } from 'path';

import { dump } from 'js-yaml';

import { DiagnosticsError, generateId, parseYaml, patternTokens, toValidationError, ValidationError } from '../validation';
import type { Paths } from '../dna/schema';
import { DnaYaml } from '../dna/schema';
import { applyDnaEditInText } from '../dna/edit';
import { applyDnaMutation, type DnaMutationRequest, type DnaMutationVerb } from '../dna/mutate';
import {
  DNA_ENTRY_OPTION_PREFIX,
  dnaEntryFieldOfOption,
  dnaEntryOptionName,
  dnaEntryOptionNames,
  resolveDnaPath,
} from '../dna/path';
import { DNA_KEY_ALIASES, splitDnaPath } from '../dna/set';
import {
  INVALID_DIRECTIVE_NAME_MESSAGE,
  isValidDirectiveName,
  renderCustomDirective,
} from '../directives/create';
import { parseDirectiveIds, withAssignedDirectives } from '../directives/roles-edit';
import { commitPaths, documentExists, readDocument, removeDocument, StorageError, writeDocument } from '../storage';
// Not re-exported by the `../storage` barrel, imported directly per that module's own convention
// (same as `src/memory/entry.ts`): `memory add` needs the CONFINED target path before it writes, to
// run task-092's absence guard on it.
import { resolveConfinedMemoryPath } from '../storage/memory-path';
import { E_PATH_ESCAPES_ROOT, E_TARGET_IS_SYMLINK } from '../storage/errors';
import {
  expandFieldTokens,
  findMemoryDocumentById,
  formatMemoryCommitMessage,
  hasNumericToken,
  isArchivedStatus,
  nextSequenceNumber,
  parseSetOptions,
  parseTags,
  readAuthorDate,
  reconstructMemoryTransitions,
  renderAddDocument,
  REJECTION_REASON_FIELD,
  renderRejectDocument,
  renderSubmitDocument,
  searchMemoryDocuments,
  setFrontmatterField,
  slugifyTitle,
  unknownSetNames,
  validateSearchQuery,
  writeMemoryEntry,
  writtenFields,
} from '../memory';

import {
  DNA_YAML_PATH,
  loadDirectiveInventory,
  loadDnaYaml,
  loadMemoryYaml,
  loadWorkflowsYaml,
  type WorkflowsLoadResult,
} from './loaders';
import { loadDirectiveListing, type DirectiveListing } from './directives-list';
import { selectDirectivesById } from './context';
import { checkAssignable, checkUnreferenced, updateRoleAssignments } from './directive-assign';
import type { MemoryYaml } from '../memory/schema';
import { requireGitIdentity } from './git-identity';
import { requireRequiredFields } from './required-fields';
import { requireInitializedProject } from './init';
import { requireCustomAsset } from './builtin-asset';
import { requireConfinedTarget, requireConfinedWriteTarget } from './confinement';
import { APPROVER_ROLE, requireApprovalAuthority } from './approval-authority';
import { optionalReason, requireReason } from './require-reason';
import { beginMemoryTransition, commitMemoryTransition } from './memory-transition';
import { amendReservedFields, requireAmendableEdit, requireAmendableType, requireRequiredFieldsKept } from './memory-amend';
import { resolveAddType } from './memory-add-type';
import { committedScopeError, requireAbsentTarget, requireUnmodifiedTarget } from './write-guard';
import { UsageError } from './usage-error';
import type { CoreFn, CoreModule, CoreOption } from './registry';
import { extraOperandsReason } from './registry';
import { coreErr, coreOk } from './types';
import type { CoreResult } from './types';

/** This module's `dna.yaml` name (`core`) — the stable identifier surfaces and tests key it by. */
export const MODULE_NAME = 'core' as const;

export {
  DIRECTIVES_DIR_PATH,
  DNA_YAML_PATH,
  MEMORY_YAML_PATH,
  ROLES_YAML_PATH,
  loadDirectives,
  // The committed-baseline readers `dl-080` (B) makes the rule for any read that gates an operation.
  // task-090 kept `loadDnaYamlAtHead` private while that rule was undecided; it is decided now, and a
  // facility the ruling tells the next implementer to use has to be reachable (task-091, D3).
  loadDirectivesAtHead,
  // The same readers at any commit (task-137, `spec-012` §2 `stateRef`); each `…AtHead` is its
  // `…AtRev` at `'HEAD'`.
  loadDirectivesAtRev,
  loadDnaYaml,
  loadDnaYamlAtHead,
  loadDnaYamlAtRev,
  loadMemoryYaml,
  loadMemoryYamlAtHead,
  loadMemoryYamlAtRev,
  loadRolesYaml,
  loadRolesYamlAtHead,
  loadRolesYamlAtRev,
  loadWorkflowsYaml,
  loadWorkflowsYamlAtRev,
} from './loaders';
export { isWellFormedRevision, resolveRevision, RevisionError } from './revision';
export type { DirectiveFile, WorkflowsLoadResult } from './loaders';
export { assembleExecutionContext, resolveRoleDirectives, selectDirectivesById } from './context';
export {
  buildDirectiveListing,
  loadDirectiveListing,
  GLOBAL_ASSIGNMENT,
  UNASSIGNED_ASSIGNMENT,
} from './directives-list';
export type { DirectiveListEntry, DirectiveListing } from './directives-list';
export type {
  DirectiveSelection,
  ExecutionContext,
  ExecutionContextElement,
  ExecutionContextInputs,
  RoleDirectiveResolution,
} from './context';
export * from './types';
export * from './registry';
export * from './exit-code';
export * from './git-identity';
export * from './approval-authority';
export * from './require-reason';
export * from './builtin-asset';
export * from './confinement';
export * from './usage-error';
export {
  initWingfoilStorage,
  initWingfoilProject,
  requireInitializedProject,
  WINGFOIL_ALREADY_INITIALIZED,
  WINGFOIL_NOT_INITIALIZED,
} from './init';
export type { InitStorageValue, InitProjectValue } from './init';
export {
  DEFAULT_CONTEXT_LIMITS,
  filterRelevantMemoryDocuments,
  NO_RELEVANT_MEMORY_NOTE,
} from './relevance';
export type {
  ContextLimits,
  RelevanceElementRef,
  RelevantMemoryDocument,
  RelevantMemoryResult,
} from './relevance';
// `prepareMemoryTransition` is deliberately not re-exported: outside `./memory-transition` a transition
// starts at `beginMemoryTransition`, which runs the identity pre-flight first (task-132 review).
export { beginMemoryTransition, commitMemoryTransition, verifyCommittedScope } from './memory-transition';
export type { BegunMemoryTransition } from './memory-transition';
export type { PreparedMemoryTransition } from './memory-transition';
export { resolveAddType } from './memory-add-type';
export type { ResolvedAddType } from './memory-add-type';
export {
  CONFIG_WRITE_CONTRACT,
  committedScopeError,
  requireAbsentTarget,
  requireInspectableTarget,
  requireNoDivergentStage,
  requireUnmodifiedTarget,
  requireUnmodifiedTargets,
  undeclaredCommittedPaths,
  verifyCommittedPaths,
} from './write-guard';
export type { WriteTargetContract } from './write-guard';
export { verifyBuiltinTemplates } from './builtin-integrity';
export type { BuiltinIntegrityFailure, BuiltinTemplateKind, BuiltinTemplateSource } from './builtin-integrity';

/** Params shared by every operation registered today — all of them are a bare pillar-config read. */
export interface RootParams {
  readonly root: string;
}

/**
 * Run a synchronous, throwing pillar loader (task-004's `load*` functions) and map its expected
 * failures onto a `CoreResult` (spec-006 §2): a `ValidationError` from the shared two-pass pipeline
 * becomes `VALIDATION`, a missing file (Node's `ENOENT`) becomes `NOT_FOUND`; anything else
 * propagates as a genuine thrown exception (a programmer bug, not a domain failure — spec-006 §2's
 * "no function throws for *expected* domain failures" implies unexpected ones still may). Factored
 * out of `wrapReadOnly` so both `dnaShowFn` (task-026) and `pathsFn` (task-028) reuse the exact
 * same mapping for their own richer, argument-aware bodies instead of duplicating it.
 */
function loadOrError<R>(loader: () => R): CoreResult<R> {
  try {
    return coreOk(loader());
  } catch (error) {
    // A loader that collects spec-003 diagnostics (task-136): the first error is the reason, the whole
    // ordered array rides `details` under spec-003's own name for it, `diagnostics`.
    if (error instanceof DiagnosticsError) {
      return coreErr({ code: 'VALIDATION', message: error.message, details: { diagnostics: error.diagnostics } });
    }
    if (error instanceof ValidationError) {
      return coreErr({ code: 'VALIDATION', message: error.message, details: { issues: error.issues } });
    }
    const errno = error as NodeJS.ErrnoException;
    if (errno && errno.code === 'ENOENT') {
      return coreErr({ code: 'NOT_FOUND', message: errno.message });
    }
    throw error;
  }
}

/** Adapt a synchronous, throwing pillar loader into a `CoreFn` taking just `{ root }` (spec-006 §2). */
function wrapReadOnly<R>(loader: (root: string) => R): CoreFn<unknown, R> {
  return async (params) => {
    const { root } = params as RootParams;
    return loadOrError(() => loader(root));
  };
}

/**
 * `wingfoil paths [category]` params (task-028-implement-paths-category) — the same generic seam
 * `dnaShowFn` reads: `positional` is the bare CLI positional (`ParamsContext.positional`,
 * `core/registry.ts` — task-026's single source of truth), interpreted here as the resource-path
 * **category**; `list` is the parsed `--list` flag (`ParamsContext.flags.list`, spread into params by
 * `buildParams`). `category`/`--list` are optional: an omitted category returns the whole `paths`
 * node (what the MCP surface's mechanical zero-argument `wingfoil://paths` Resource gets — it has no
 * per-request parameter, the same limitation `src/mcp/dna-resource.ts` documents for `dnaShow`).
 * `--list` is accepted (spec-008/X_cli-cmds.md's "drill-down") but currently a no-op on the returned
 * value: a DNA `paths` category is already a flat `string[]` with nothing coarser to collapse to, and
 * spec-005-cli-command-contract §4's own worked example (`paths sources --format json` ->
 * `{"category":"sources","paths":[...]}`) shows the full list without `--list` either — so there is
 * no approved "collapsed" shape to switch away from. */
export interface PathsParams {
  readonly root: string;
  readonly positional?: string;
  readonly list?: boolean;
}

/** `wingfoil paths <category>` success shape — spec-005-cli-command-contract §4's worked example,
 * verbatim (`{"category":"sources","paths":["src/cli","src/core"]}`). */
export interface PathsShowResult {
  readonly category: string;
  readonly paths: readonly string[];
}

/**
 * `paths` `CoreOperation.fn` (P2.5, spec-002-dna-yaml-schema's `Paths` node) —
 * task-028-implement-paths-category. Loads `.wingfoil/dna.yaml` via the same `loadOrError` +
 * `loadDnaYaml` path `dnaShowFn` uses, then narrows to one category (the bare positional):
 *
 * - category given and mapped (a non-empty array) -> `coreOk({category, paths})` (spec-005 §4 shape).
 * - category given but absent/empty in `paths:` -> `coreErr(NOT_FOUND, "no paths mapped for
 *   category '<category>'")` — the exact BDD `P2.5-paths.feature` "Error - querying an undefined
 *   category" wording (exit `1` via `exit-code.ts`, never a throw, never exit `2` — a read-only
 *   command, spec-005 §1; symmetric with `dnaShowFn`'s own unknown-section `NOT_FOUND`).
 * - category omitted -> `coreOk(<whole paths node>)` (see {@link PathsParams}'s doc comment on why;
 *   symmetric with `dna show` returning the whole DNA when no section is given).
 *
 * `dna.paths` is `.passthrough()` (spec-002), so an entry beyond the five named categories is still a
 * plain object property here, not necessarily an array — `Array.isArray` guards that case rather than
 * assuming the shape.
 */
const pathsFn: CoreFn<unknown, PathsShowResult | Paths> = async (params) => {
  const { root, positional: category } = params as PathsParams;
  const loaded: CoreResult<DnaYaml> = loadOrError(() => loadDnaYaml(root));
  if (!loaded.ok) return loaded;
  if (category === undefined) return coreOk(loaded.value.paths);

  const raw = (loaded.value.paths as Record<string, unknown>)[category];
  const entries = Array.isArray(raw) ? (raw as string[]) : undefined;
  if (!entries || entries.length === 0) {
    return coreErr({ code: 'NOT_FOUND', message: `no paths mapped for category '${category}'` });
  }
  return coreOk({ category, paths: entries });
};

/**
 * `dna show [section]` (P2.2-implement-dna-show, task-026): resolves `ParamsContext.positional`
 * (`core/registry.ts` — the generic CLI-positional seam this task adds) as an optional DNA section
 * name. No `positional` -> the whole parsed `DnaYaml` (unchanged behavior, what the MCP
 * `wingfoil://dna/show` Resource still gets, since the MCP surface never sets this field — see
 * `ParamsContext.positional`'s own doc comment). `tech_stack` resolves as a BDD-compatibility alias
 * for `stacks` (spec-002-dna-yaml-schema Consequences: the schema renamed the BDD's `tech_stack`
 * wording). An unknown section is a domain `NOT_FOUND` (`CoreResult.error`, exit `1` via
 * `exit-code.ts` — never a thrown exception and never exit `2`, since a read-only command can only
 * exit `0`/`1` per spec-005-cli-command-contract §1), with the exact P2.2 message
 * `no DNA key named '<section>'`. The `tech_stack`→`stacks` alias is the shared `DNA_KEY_ALIASES`
 * (`src/dna/set.ts`) — the single source of truth `dna set` uses too, so read and write stay symmetric.
 */
const dnaShowFn: CoreFn<unknown, unknown> = async (params) => {
  const { root, positional: section } = params as RootParams & { positional?: string };
  const loaded: CoreResult<DnaYaml> = loadOrError(() => loadDnaYaml(root));
  if (!loaded.ok || section === undefined) return loaded;

  const key = DNA_KEY_ALIASES[section] ?? section;
  const dna = loaded.value as Record<string, unknown>;
  if (!(key in dna)) {
    return coreErr({ code: 'NOT_FOUND', message: `no DNA key named '${section}'` });
  }
  return coreOk(dna[key]);
};

/**
 * `dna set <path> --value <v>` params (P2.1, task-025-implement-dna-set) — the first mutating
 * operation. `positionals` is the full CLI positional list (`ParamsContext.positionals`,
 * `core/registry.ts`): `positionals[0]` is the dotted path and is the ONLY positional the verb reads.
 *
 * The value moved out of `positionals[1]` into `--value` in `task-093`, per
 * `dl-082-cli-parameter-shape`: a positional carries the identity of the target, an option carries a
 * named attribute of the action. The path is the target; the value was an attribute in positional
 * clothing. See {@link DnaMutationParams} — the four verbs now share one parameter shape.
 */
export interface DnaSetParams {
  readonly root: string;
  readonly positionals?: readonly string[];
  readonly options?: Readonly<Record<string, string>>;
}

/**
 * The shared body of every DNA mutation (`dna set`, and `dna add|remove|update` since
 * task-093-dna-mutation-surface-add-remove-update) — the mutating-op template `dna set` established
 * (P2.1, task-025), now with one structure-aware traversal underneath all four verbs:
 *
 * 1. **Argument validation** — done by the callers before this body runs (`dnaPathPositional`,
 *    `dnaMutationRequest`, `dnaSetFn`'s `--value` check): a missing required argument, or a dotted
 *    path `splitDnaPath` cannot parse (an empty segment, the BDD's `..language`; an unterminated
 *    quote; a `"` no delimiter can account for), is a usage error: `throw new UsageError(...)` → exit
 *    **2** (mapped by `exitCodeForThrow`), per spec-005-cli-command-contract §1, whatever the git
 *    identity (task-125, `bug-172`). A path that is well-formed but names nothing the schema declares
 *    is a different failure and exits **1** — see step 5.
 * 2. **`requireGitIdentity` pre-flight** (REQ-SEC-01, task-014) — refuse before any read/write when
 *    `user.name`/`user.email` are unset, returning its `CoreResult.error` unchanged (exit 1).
 * 3. **`requireUnmodifiedTarget` pre-flight** (`dl-080`(B) / `bug-078`, task-092) — refuse, before
 *    anything is read or written, while `dna.yaml` carries modifications this operation does not own.
 *    The plain "refuse a dirty target" rule applies here unaltered: all four verbs **edit an existing
 *    file in place**, so `task-092`'s two exceptions are both inapplicable — `requireAbsentTarget` is
 *    for a target that must be new (`memory add`), and `wingfoil init`'s exemption rests on
 *    `detectInitState` refusing an initialized project before a guard could run, whereas these verbs
 *    *require* an initialized project and load `dna.yaml` as their input. Placed before the load, so
 *    no refusal and no written byte can depend on a value the dirty copy contributed — which is also
 *    what makes `loadDnaYaml`'s working-tree read equivalent to `HEAD`'s here.
 * 4. **Load** the current `.wingfoil/dna.yaml` through the same two-pass path `dnaShow` uses (a
 *    missing/invalid file → `NOT_FOUND`/`VALIDATION`, exit 1).
 * 5. **Resolve + apply** through `src/dna`'s `applyDnaMutation`, which resolves the `<path>` against
 *    `DnaYaml` itself and **refuses a path that does not resolve rather than creating it**
 *    (`bug-084-dna-key-alias-writes-unschemad-keys`; `dl-081`'s ratification makes this a precondition
 *    of the surface). A refusal is a logic error (`VALIDATION` → exit 1, `spec-005` §1 as ruled on
 *    `bug-076`), returned not thrown, and nothing is written.
 * 6. **Produce the new bytes.** The PRIMARY path is `src/dna`'s `applyDnaEditInText`: a minimal
 *    in-place textual edit, so every comment survives — including the inline `[SPEC]`/`[AUTHORING]`
 *    field-provenance annotations a whole-file re-serialization deletes
 *    (bug-004-dna-set-strips-yaml-comments, task-063). When no provably-minimal edit exists it returns
 *    `undefined` and this FALLS BACK to `dump(dna, { lineWidth: -1 })` — correct, but comment-stripping.
 *    Both paths are deterministic (REQ-SYS-07).
 * 7. **Re-validate the written bytes** against `DnaYaml` (spec-002) BEFORE persisting — re-parsing the
 *    serialized form, not the in-memory object, so the check honours YAML's own scalar coercion and
 *    validates the exact bytes about to be written (`dna set version 2` writes `version: '2'` and
 *    still fails `z.number()` on read-back). It is also what enforces the cross-field rules the verbs
 *    do not duplicate: a member naming a role absent from `team.roles` fails here (REQ-SYS-08,
 *    `Team.superRefine`), which is why `dl-081` records that referential integrity needs no new check.
 * 8. **Persist + commit** through the single storage primitives (task-018) — `writeDocument` then
 *    `commitPaths` on the ONE scoped path `.wingfoil/dna.yaml`; the returned sha rides
 *    `CoreResult.commit`. Writing the bytes already on disk is an idempotent no-op: no write, no
 *    empty commit.
 * 9. **`committedScopeError` post-condition** (task-092) — assert the commit carries exactly the
 *    bytes this operation wrote at that one path and nothing else. An alarm rather than a rollback:
 *    with the step-3 guard in place no argument can reach it, but a repository-local `pre-commit`
 *    hook that rewrites and re-stages the file still can.
 */
async function runDnaMutation(
  root: string,
  request: DnaMutationRequest,
  subject: string = dnaCommitSubject(request),
  scalarOnly = false,
): Promise<CoreResult<{ key: string; value?: string }>> {
  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;

  const unmodified = requireUnmodifiedTarget(root, DNA_YAML_PATH);
  if (!unmodified.ok) return unmodified;

  const loaded: CoreResult<DnaYaml> = loadOrError(() => loadDnaYaml(root));
  if (!loaded.ok) return loaded;

  if (scalarOnly) {
    const resolved = resolveDnaPath(loaded.value as Record<string, unknown>, request.field);
    if (!resolved.ok) return coreErr({ code: 'VALIDATION', message: resolved.message });
    if (resolved.target.kind !== 'scalar') {
      return coreErr({
        code: 'VALIDATION',
        message: `'${request.field}' does not hold a single value: reach it with \`dna add|remove|update ${request.field} --value <v>\` (dl-081)`,
      });
    }
  }

  const applied = applyDnaMutation(loaded.value as Record<string, unknown>, request);
  if (!applied.ok) return coreErr({ code: 'VALIDATION', message: applied.message });

  const dnaPath = join(root, DNA_YAML_PATH);
  const current = readDocument(dnaPath);
  const serialized = applyDnaEditInText(current, applied.edit, applied.dna) ?? dump(applied.dna, { lineWidth: -1 });

  const parsed = DnaYaml.safeParse(parseYaml(serialized, dnaPath));
  if (!parsed.success) {
    const validationError = toValidationError(parsed.error, dnaPath);
    return coreErr({ code: 'VALIDATION', message: validationError.message, details: { issues: validationError.issues } });
  }

  const outcome = { key: request.field, value: request.value };
  if (current === serialized) return coreOk(outcome);

  writeDocument(dnaPath, serialized);
  const sha = commitPaths(root, [DNA_YAML_PATH], subject);
  const leaked = committedScopeError(root, sha, DNA_YAML_PATH, serialized);
  if (leaked) return leaked;
  return coreOk(outcome, { sha, message: subject });
}

/**
 * The one-line commit subject a DNA mutation writes: `wf(dna): {verb} {field} [{value}]`, extending
 * `dna set`'s established `wf(dna): set {key}` (task-025) with the payload, because for `add` and
 * `remove` the value IS which entry was touched and a subject without it reads as if the whole
 * collection changed. Deterministic — a pure function of the request (REQ-SYS-07).
 */
function dnaCommitSubject(request: DnaMutationRequest): string {
  return `wf(dna): ${request.verb} ${request.field}${request.value === undefined ? '' : ` ${request.value}`}`;
}

/**
 * The dotted path every DNA verb acts on, read from `positionals[0]` — the ONE place the four verbs
 * agree on where their target comes from (`dl-082-cli-parameter-shape`: a positional carries the
 * identity of the target).
 *
 * Three usage errors, in the order they are checked, and the order is load-bearing:
 *
 * 1. **Missing** — nothing to act on.
 * 2. **Unparseable** — whatever `splitDnaPath` (`src/dna/set.ts`) refuses, reported with **its own**
 *    message rather than a flat one, because the three cases are not the same complaint: an empty
 *    segment (the BDD's `..language`) is malformed, an unterminated quote is a typo in the
 *    delimiters, and a `"` no delimiter can account for means the *name* has no spelling at all
 *    (`dl-083-dotted-entry-names-in-paths`, task-099). Checked BEFORE the extra-positional rule below
 *    so that `dna set ..language python`, which is `P2.1-dna-set.feature`'s third scenario verbatim,
 *    keeps reporting `invalid key path: '..language'` rather than the migration hint. A stale
 *    invocation that is also malformed is malformed first.
 * 3. **Extra positionals** — the old `dna set <key> <value>` spelling, and any slip of the same
 *    shape on the three new verbs. It gets a named message rather than being ignored, because
 *    `dl-082` is a breaking change to a shipped command and silently dropping the second word would
 *    make `dna set project.license MIT` look like it worked (`--value` absent, the write refused for
 *    a reason that names neither the second word nor the new grammar). Since task-129 the registrar
 *    refuses a surplus operand for every other command before the root is resolved; the four DNA
 *    path verbs declare `refusesExtraItself` so that rule 2 keeps coming first, and word the refusal
 *    with the same `extraOperandsReason` plus the migration hint.
 *
 * All three are exit `2` (`UsageError` → `exitCodeForThrow`, `spec-005-cli-command-contract` §1).
 */
function dnaPathPositional(verb: string, positionals: readonly string[] | undefined): string {
  const path = positionals?.[0];
  if (path === undefined) {
    throw new UsageError(`missing required argument: wingfoil dna ${verb} <path> --value <value>`);
  }
  const split = splitDnaPath(path);
  if (!split.ok) {
    throw new UsageError(split.message);
  }
  if ((positionals?.length ?? 0) > 1) {
    throw new UsageError(extraOperandsReason(`dna ${verb}`, 'path', positionals!.length, 'the value travels in --value'));
  }
  return path;
}

/**
 * `dna set <path> --value <v>` `CoreOperation.fn` (P2.1) — kept, and still the scalar spelling
 * (`spec-002`, `spec-005` §4). Since task-093 it is **`update` restricted to a single value**: the
 * same resolver, the same write path, one spelling for the scalar case and
 * `dna update <path> --value …` for everything structured (`dl-081` AC9 — `update` does not subsume
 * `set`, and `set` does not grow a second mechanism).
 *
 * Its **second positional became `--value`** in this task (`dl-082-cli-parameter-shape`): the key was
 * the target and stays positional, the value was an attribute wearing a positional's clothes. That is
 * a breaking change to a shipped command, tracked as such — `P2.1-dna-set.feature` still shows the
 * old spelling and is rewritten by `bug-089`, and `CHANGELOG.md` by the `user-docs` phase.
 *
 * A path that names a collection or a list is refused here with the verb that does reach it, rather
 * than with the schema re-validation's `expected array, received string` — which is
 * `bug-083-dna-set-cannot-write-array-valued-fields`'s headline symptom and says nothing about how to
 * write the field.
 */
const dnaSetFn: CoreFn<unknown, { key: string; value?: string }> = async (params) => {
  const { root, positionals, options } = params as DnaSetParams;

  const keyPath = dnaPathPositional('set', positionals);
  const value = options?.value;
  if (value === undefined) {
    throw new UsageError('missing required argument: --value');
  }

  // `wf(dna): set <key>` — the subject `dna set` has always written (task-025), kept verbatim so a
  // reader (and `git log --grep`) sees the command that was run, not the verb it delegates to. The
  // scalar-only restriction, `dl-080`(B)'s dirty-target guard (task-092) and the committed-tree
  // post-condition all live in the shared pipeline now, on the one document it loads.
  return runDnaMutation(root, { verb: 'update', field: keyPath, value }, `wf(dna): set ${keyPath}`, true);
};

/**
 * `dna add|remove|update` params (task-093). The **path** is `positionals[0]` — it identifies the
 * target, and `dl-082-cli-parameter-shape` is the rule that puts a target in a positional. Everything
 * else rides the value-bearing option seam `memory add --type … --title …` established
 * (`ParamsContext.options`, `core/registry.ts`): `--value` is the payload, and every remaining option
 * is a field of the entry the path names. Identical in shape to {@link DnaSetParams}, which is the
 * point — all four DNA verbs state their parameters the same way, and the same way the other nine
 * `memory`/`paths` commands already did (`dl-082` E2).
 */
export interface DnaMutationParams {
  readonly root: string;
  readonly positionals?: readonly string[];
  readonly options?: Readonly<Record<string, string>>;
}

/** Split a verb's invocation into the positional `<path>`, `--value` and the per-entry `--entry-<field>` values. */
function dnaMutationRequest(
  verb: DnaMutationVerb,
  positionals: readonly string[] | undefined,
  options: Readonly<Record<string, string>> | undefined,
): DnaMutationRequest {
  const field = dnaPathPositional(verb, positionals);
  if (verb === 'add' && options?.value === undefined) throw new UsageError('missing required argument: --value');

  // Every remaining option is an entry field, carried under its `--entry-<field>` name (see
  // `DNA_ENTRY_OPTION_PREFIX`); it is stripped back to the schema's own field name here, which is what
  // `applyDnaMutation` matches against the entry schema. Sorted so the request — and therefore the
  // batch of text edits it produces — is a deterministic function of the invocation (REQ-SYS-07).
  const fields: Record<string, string> = {};
  for (const name of Object.keys(options ?? {}).sort()) {
    if (name === 'value') continue;
    const entryField = dnaEntryFieldOfOption(name);
    // Strict, and deliberately so: the CLI can only send names this operation declares (Commander
    // refuses the rest), so accepting a BARE `version` here would mean the core layer speaks a
    // vocabulary the CLI layer cannot produce — which is how a test at this layer went green while
    // the real command line silently did nothing. The MCP surface, whose Tool arguments are arbitrary
    // JSON, is the caller that can actually reach this, and it gets a named refusal.
    if (entryField === undefined) {
      throw new UsageError(`unknown option: --${name} (entry fields are passed as --${DNA_ENTRY_OPTION_PREFIX}<field>)`);
    }
    fields[entryField] = options![name]!;
  }
  return { verb, field, value: options?.value, fields };
}

/** `dna add` — create an entry, or append to a list (`dl-081` option (E); spec-006 §3, Tool `dna.add`). */
const dnaAddFn: CoreFn<unknown, { key: string; value?: string }> = async (params) => {
  const { root, positionals, options } = params as DnaMutationParams;
  return runDnaMutation(root, dnaMutationRequest('add', positionals, options));
};

/** `dna remove` — drop an entry, a value from a list, or an optional field (Tool `dna.remove`). */
const dnaRemoveFn: CoreFn<unknown, { key: string; value?: string }> = async (params) => {
  const { root, positionals, options } = params as DnaMutationParams;
  return runDnaMutation(root, dnaMutationRequest('remove', positionals, options));
};

/** `dna update` — change a value, a list, or the fields of one entry (Tool `dna.update`). */
const dnaUpdateFn: CoreFn<unknown, { key: string; value?: string }> = async (params) => {
  const { root, positionals, options } = params as DnaMutationParams;
  return runDnaMutation(root, dnaMutationRequest('update', positionals, options));
};

/**
 * The `--entry-<field>` namespace, re-exported from the DNA pillar (`src/dna/path.ts`), which owns it
 * because it owns the derivation: the option set is read off `spec-002`'s entry schemas, and the
 * refusal messages `src/dna/mutate.ts` writes have to spell those options the same way this module
 * registers them. Re-exported rather than moved-and-forgotten so `src/core`'s public surface is
 * unchanged (`spec-006` §1: the pillar is a leaf, and `src/core` is what both adapters import).
 */
export { DNA_ENTRY_OPTION_PREFIX, dnaEntryOptionName, dnaEntryFieldOfOption } from '../dna/path';

/**
 * The options the DNA verbs declare beside their positional `<path>`: `--value` on all four, plus —
 * for `add`/`update` — one `--entry-<field>` option per field the collection entry schemas declare,
 * derived from `DnaYaml` rather than hand-listed (`dnaEntryOptionNames`, `src/dna/path.ts`), so a
 * collection added to `spec-002` becomes writable without editing this file.
 *
 * `--value`'s description carries `dl-081`'s one stated convention, because the ratification records
 * it as a convention rather than something the grammar shows: it is the new entry's IDENTITY when the
 * path ends at a collection and the new VALUE when it ends at a leaf (task-093 AC6). `dna set` gets
 * its own, narrower description: it is the scalar verb, so `--value` there has only the second
 * meaning and advertising the first would describe a case the verb refuses.
 */
const DNA_VALUE_OPTION: CoreOption = {
  name: 'value',
  description: "the new entry's identity when <path> ends at a collection; the new value when it ends at a leaf (comma-separated for a list of values)",
};
const DNA_SET_VALUE_OPTION: CoreOption = {
  name: 'value',
  required: true,
  description: 'the new value for <path> (scalar fields only — use dna update for collections and lists)',
};
const DNA_ENTRY_OPTIONS: readonly CoreOption[] = dnaEntryOptionNames().map((field) => ({
  name: dnaEntryOptionName(field),
  description: `'${field}' of the entry <path> names, where that collection declares it`,
}));

/**
 * `wingfoil memory add` params (P1.3, task-020-implement-memory-add) — the FIRST Memory-document
 * mutation. `options` is the value-bearing-option seam this task establishes
 * (`ParamsContext.options`, `core/registry.ts`), read as `--type`/`--title`/`--tags` and the repeatable
 * `--set <name>=<value>` (task-110, `spec-008-cli-grammar` §10), which arrives as a string array. The
 * MCP surface never populates it (task-030 wires the Tool input schema); a call with no options simply
 * has all of them absent, which the required checks below reject as usage errors.
 */
export interface MemoryAddParams {
  readonly root: string;
  readonly options?: Readonly<Record<string, string | readonly string[]>>;
}

/** A single-valued option of {@link MemoryAddParams.options}: a repeated occurrence keeps the last. */
function singleOption(options: MemoryAddParams['options'], name: string): string | undefined {
  const value = options?.[name];
  return typeof value === 'string' || value === undefined ? value : value[value.length - 1];
}

/**
 * `memory add` `CoreOperation.fn` (P1.3, `mutates: true` — the first Memory-document mutation and the
 * pattern for all Memory CRUD; spec-006-core-domain-api §3 memory table). Follows `dna set`'s
 * mutating-op template (task-025) exactly, over the Memory store instead of `dna.yaml`:
 *
 * 1. **Argument validation** — a missing `--type`/`--title` is a usage error: `throw new UsageError`
 *    → exit **2** with the exact `missing required argument: --<name>` message
 *    (spec-008-cli-grammar §5, mapped by `exitCodeForThrow`), same classification as `dna set`'s
 *    missing positional. So is every spelling fault of `--set` (`spec-008` §10: no `=`, a name that
 *    is not a field name, a reserved name, a blank value, a name given twice — task-110). It runs
 *    first, so a malformed invocation exits 2 whatever the git identity (task-125, `bug-172`).
 * 2. **`requireGitIdentity` pre-flight** (REQ-SEC-01, task-014) — refuse before any read/write when
 *    the git identity is unset, returning its `CoreResult.error` unchanged (exit 1).
 * 3. **Resolve `--type` against the `memory.yaml` committed at `HEAD`** (spec-001-memory-yaml-schema)
 *    via {@link resolveAddType} — the type registry, the type's `path` and its `template` scaffold
 *    all resolve against the repository as committed, never against the working tree (task-095,
 *    `bug-085`, `dl-080` option (B)). That step takes no parsed `MemoryYaml` and this function holds
 *    none, so no call path can reach the decision with a working-tree registry. An unknown type is a
 *    domain `NOT_FOUND` (exit 1) with the exact P1.3 message
 *    `unknown memory type '<t>' (not defined in memory.yaml)`, returned BEFORE any write.
 * 4. **Generate the id** deterministically from the type's committed `id_pattern` (task-002's
 *    `generateId`, REQ-SYS-07), in `spec-001`'s fixed order (task-110, `dl-107` S2): first every
 *    frontmatter/context token from `--set` (a `--set` name the committed `id_pattern` and `path` do
 *    not contain is refused, exit 1; a token with no value names the option that supplies it), then
 *    the `{slug}` from the title, and — only for a `{n}`-token pattern — a sequence counter matched
 *    against the already-materialized pattern (`src/memory/add.ts`; no wall-clock/random): the
 *    highest number any local branch, remote-tracking ref, `HEAD` or the working tree holds, across
 *    every folder the committed `path` pattern can resolve to, plus one (task-128, `dl-101` §2 (a),
 *    `bug-087`, `bug-162`). That read is wider than `HEAD` on purpose — it can only raise the number —
 *    and is the declared baseline `command-baseline` records for it.
 * 5. **Fill the committed scaffold's bytes** with only the `id`/`status: draft`/`--title`/`--tags`
 *    skeleton (P1.3; spec-010-memory-frontmatter-schema) plus the `--set` fields (a context token only
 *    where the scaffold declares it), then **write + commit** through task-022's
 *    confined `writeMemoryEntry` (REQ-SEC-06 refuse-before-write + one scoped commit
 *    `wf(<type>): add <id>`); the returned sha rides `CoreResult.commit`.
 *
 * A thrown `StorageError` (e.g. a confinement violation, an unresolved path placeholder for a
 * workflow-seeded type) or a `ValidationError` (a malformed `id_pattern`) is a logic error mapped to a
 * `CoreResult.error` (exit 1) so nothing escapes as an uncaught throw — the usage errors above are the
 * only exit-2 path and are thrown before this try.
 */
const memoryAddFn: CoreFn<unknown, { id: string; path: string }> = async (params) => {
  const { root, options } = params as MemoryAddParams;

  const type = singleOption(options, 'type');
  if (type === undefined) throw new UsageError('missing required argument: --type');
  const title = singleOption(options, 'title');
  if (title === undefined) throw new UsageError('missing required argument: --title');
  const tags = parseTags(singleOption(options, 'tags'));
  const set = parseSetOptions(options?.set);
  if (!set.ok) throw new UsageError(set.message);

  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;

  // task-095 / `bug-085`: the registry, the `path` and the scaffold all resolve at HEAD, inside a
  // function that accepts no parsed `MemoryYaml` — so this verb cannot decide any of the three from
  // a working-tree copy, in the same way task-091 made that true of the four transition verbs.
  const resolved = resolveAddType(root, type);
  if (!resolved.ok) return resolved;
  const { pathPattern, idPattern, scaffold } = resolved.value;

  const unknown = unknownSetNames(set.values, idPattern, pathPattern);
  if (unknown.length > 0) {
    return coreErr({
      code: 'VALIDATION',
      message: unknown
        .map((name) => `--set ${name}: memory type '${type}' has no token {${name}} in its id_pattern or path`)
        .join('; '),
    });
  }

  try {
    // spec-001's order: {date} → {author} → field/context tokens → {slug} → {n}, so the counter sees
    // the materialized prefix. {date} is read ONCE, from the author date git records for this add's
    // commit, and the commit is pinned to it below, as it is to the author {author} slugs (task-163).
    const date = patternTokens(idPattern).includes('date') ? readAuthorDate(root, identity.value) : undefined;
    const materialized = expandFieldTokens(idPattern, set.values, { date, authorName: identity.value.name });
    const sequence = hasNumericToken(materialized)
      ? nextSequenceNumber(root, pathPattern, materialized)
      : 0;
    const id = generateId(materialized, { slug: slugifyTitle(title), n: sequence });
    const content = renderAddDocument(scaffold, { id, title, tags, fields: writtenFields(scaffold, set.values) });
    const pathValues = { ...set.values, id };
    const message = `wf(${type}): add ${id}`;

    // dl-080 (B) / bug-078, AC3: this verb CREATES, so the rule is absence rather than cleanliness.
    // Since task-128 a `{n}` id is above every number any baseline holds, but a slug-only id
    // (`note-{slug}`) still lands on an occupied path whenever the title repeats, and a `{n}` id can
    // land on a git-ignored file (no baseline the counter reads holds it). The write below
    // is unconditional, which would turn `wf(<type>): add <id>` into a commit that overwrites (or
    // deletes lines from) an existing element. The path is resolved here rather than taken from
    // `writeMemoryEntry`'s return value because the guard must run BEFORE the write; the resolution
    // is pure, so doing it twice is free of side effects and keeps that throwing storage primitive's
    // contract untouched. A confinement escape still throws `StorageError` from this same call.
    const targetPath = relative(root, resolveConfinedMemoryPath(root, pathPattern, pathValues)).split(sep).join('/');
    const absent = requireAbsentTarget(root, targetPath);
    if (!absent.ok) return absent;

    const { path, sha } = writeMemoryEntry(root, pathPattern, pathValues, content, message, {
      author: identity.value,
      // `@`: git reads a bare `<seconds> <offset>` as a timestamp only from 9 digits of seconds up
      // (`0 +0000` is "invalid date format"); `@<seconds> <offset>` is a timestamp at any width.
      ...(date === undefined ? {} : { env: { GIT_AUTHOR_DATE: `@${date}` } }),
    });
    const leaked = committedScopeError(root, sha, targetPath, content);
    if (leaked) return leaked;
    return coreOk({ id, path: relative(root, path) }, { sha, message });
  } catch (error) {
    if (error instanceof StorageError) {
      // One rule, one code (task-130, `bug-123`, `spec-005` §3): a confinement refusal is `VALIDATION`
      // here as it is from the transition verbs' guard — the request named a target REQ-SEC-06
      // forbids. Every other storage failure (a git read, an unresolved path token) stays `IO`.
      const confinement = error.code === E_PATH_ESCAPES_ROOT || error.code === E_TARGET_IS_SYMLINK;
      return coreErr({ code: confinement ? 'VALIDATION' : 'IO', message: error.message });
    }
    if (error instanceof ValidationError) {
      const reason = error.issues.length > 0 ? error.issues.map((issue) => issue.message).join('; ') : error.message;
      return coreErr({ code: 'VALIDATION', message: reason });
    }
    throw error;
  }
};

/**
 * `wingfoil memory search [keyword]` params (P1.5, task-021-implement-memory-search) — reuses
 * task-026's generic bare `ParamsContext.positional` seam for the free-text keyword (mirroring
 * `dna show`'s `section`/`paths`'s `category`) and task-020's value-bearing `ParamsContext.options`
 * seam for the `--tag`/`--status`/`--type` metadata filters (mirroring `memoryAdd`'s `--type`/
 * `--title`/`--tags`). The MCP surface's mechanical zero-argument `wingfoil://memory/search` Resource
 * (spec-006 §3) never populates either field (see `ParamsContext.positional`/`.options`'s own doc
 * comments) — reading it degenerates to the "browse everything, no filter" call {@link memorySearchFn}
 * already treats an omitted keyword as; see this task's Execution Notes for why that is the correct
 * reading of spec-006's already-approved `memorySearch` row, not a workaround.
 */
export interface MemorySearchParams {
  readonly root: string;
  readonly positional?: string;
  readonly options?: Readonly<Record<string, string>>;
}

/**
 * One `wingfoil memory search` result entry — the fields a CLI/MCP consumer needs to identify and
 * open the matched document, without re-reading the file (P1.5; spec-010-memory-frontmatter-schema's
 * base fields). Deliberately drops `searchMemoryDocuments`'s internal `metadataMatch`/`bodyMatch`
 * ranking flags: those exist to DRIVE this task's ordering (REQ-SYS-07), not to be part of its public
 * result shape.
 */
export interface MemorySearchResultItem {
  readonly path: string;
  readonly id?: string;
  readonly title?: string;
  readonly type?: string;
  readonly status?: string;
  readonly tags: readonly string[];
}

/**
 * `memory search` success shape: always the resolved `query` + the ranked `matches`, plus a `message`
 * ONLY when `matches` is empty (P1.5 BDD "Error - query with no matches": zero results is still
 * `coreOk` — exit 0, never a `CoreResult.error` — carrying the exact message "no documents matched the
 * query"). A non-empty result carries no `message` field at all (not an empty string), so a
 * `json`/`yaml` consumer can branch on its mere presence.
 */
export interface MemorySearchResult {
  readonly query: string;
  readonly matches: readonly MemorySearchResultItem[];
  readonly message?: string;
}

const NO_MEMORY_SEARCH_MATCHES_MESSAGE = 'no documents matched the query';

/**
 * `memory search` `CoreOperation.fn` (P1.5, `mutates: false` — the FIRST Memory-document READ
 * operation registered in `CORE_MODULES`; spec-006-core-domain-api §3 memory table pins its MCP
 * exposure to the mechanical zero-argument Resource `wingfoil://memory/search` verbatim, so no gap
 * exists to fill with a richer Resource template — see this task's Execution Notes). Wraps
 * task-008/023's `src/memory/query.ts` primitives — no scan/ranking/validation logic is
 * reimplemented here:
 *
 * 1. **Empty-query guard** ({@link validateSearchQuery}, task-023/P1.12) runs ONLY when the caller
 *    actually supplied a keyword positional (`positional !== undefined`): an explicit empty or
 *    whitespace-only string (e.g. `wingfoil memory search ""`) throws `ValidationError.semantic`
 *    (exit 2, message "empty search query" — `exitCodeForThrow` maps its `exitCode: 2` straight
 *    through, the same throw-path precedent `dnaSetFn`'s `UsageError` set). An OMITTED keyword
 *    (`wingfoil memory search --tag architecture`, P1.5 BDD Scenario "Filter results by metadata
 *    tag") is a DIFFERENT, legitimate case — a tag-only browse, per `searchMemoryDocuments`'s own doc
 *    comment ("browse by tag alone, no keyword" is not an empty query) — so it never reaches the
 *    guard at all, and resolves to `''` below.
 * 2. **Load `memory.yaml`** via the same `loadOrError` + `loadMemoryYaml` path every other read op uses.
 * 3. **Scan + rank** via {@link searchMemoryDocuments} (task-008: deterministic metadata-before-body
 *    ranking, REQ-SYS-07), narrowed by `--tag` through its own `MemorySearchOptions.tag` — the ONE
 *    filter the scan primitive itself understands.
 * 4. **`--type`/`--status` narrow the already-ranked result** — a plain array filter, not a second
 *    scan pass: both are base frontmatter fields every Memory document carries
 *    (spec-010-memory-frontmatter-schema), and `searchMemoryDocuments` already projects both onto
 *    each match (task-021 added `type` alongside the pre-existing `status`), so no extra file read is
 *    needed.
 * 5. **Zero matches is `coreOk`, never `coreErr`** (P1.5 BDD "Error - query with no matches" — the
 *    scenario's own title says "Error" but its assertion is exit `0`, so this is deliberately a
 *    successful, empty result carrying the exact message, per spec-005-cli-command-contract §1: a
 *    read-only command can only exit `0`/`1`).
 *
 * **REQ-STATE-06 (task-038; archived set widened by `dl-028-archived-states-excluded-from-context`):**
 * `searchMemoryDocuments` excludes archived documents — `status: deprecated` or `superseded` — by
 * default (the "default … `memory search` results" half of the Fit Criterion). This function passes
 * `includeArchived: true` through to the scan ONLY when the caller's own `--status` narrow names an
 * archived status (`isArchivedStatus`), so that intentional request still resolves; every other query
 * (no `--status`, or a `--status` naming a live state such as `draft`) stays under the default
 * exclusion.
 */
const memorySearchFn: CoreFn<unknown, MemorySearchResult> = async (params) => {
  const { root, positional, options } = params as MemorySearchParams;

  if (positional !== undefined) validateSearchQuery(positional);
  const query = positional ?? '';

  const loaded: CoreResult<MemoryYaml> = loadOrError(() => loadMemoryYaml(root));
  if (!loaded.ok) return loaded;

  const tag = options?.tag;
  const type = options?.type;
  const status = options?.status;

  const scanned = searchMemoryDocuments(root, loaded.value, query, {
    ...(tag !== undefined ? { tag } : {}),
    ...(isArchivedStatus(status) ? { includeArchived: true } : {}),
  });
  const matches: MemorySearchResultItem[] = scanned
    .filter((match) => (type === undefined || match.type === type) && (status === undefined || match.status === status))
    .map(({ path, id, title, type: docType, status: docStatus, tags }) => ({ path, id, title, type: docType, status: docStatus, tags }));

  return matches.length === 0
    ? coreOk({ query, matches, message: NO_MEMORY_SEARCH_MATCHES_MESSAGE })
    : coreOk({ query, matches });
};

/**
 * `wingfoil memory history <id>` params (P1.10, task-049-memory-history). The document id rides the
 * generic bare `ParamsContext.positional` seam (task-026) — spec-008-cli-grammar §7: a command whose
 * noun already scopes the type takes the **bare `<id>`**, never a `<type>:<id>` element-ref, because
 * ids are globally unique per `memory.yaml`'s `id_pattern`. Optional in the type only because the
 * seam itself is: {@link memoryHistoryFn} rejects an absent id as a usage error (exit 2).
 */
export interface MemoryHistoryParams {
  readonly root: string;
  readonly positional?: string;
}

/**
 * One entry of a document's audit trail as `wingfoil memory history` renders it — exactly the four
 * things `P1.10-memory-history.feature` requires of every entry ("author, ISO-8601 timestamp, state
 * change, and reason"), plus the `sha`/`subject`/`operation` that identify the commit it came from.
 *
 * Every field is derived, never stored: `author`/`timestamp` come from git's own `%an`/`%ae`/`%aI`
 * (ADR-007 / P1.2 — the commit supplies the date, never file content), `from`/`to` from the
 * document's own frontmatter `status:` at each commit, and `approver`/`reason` from the commit body's
 * CLAUDE.md §5.1 trailers. `author` and `approver` are rendered in that same trailer notation
 * (`Name <email>`, `Name <email> (role)`) because P1.10 exists to read exactly that convention back.
 *
 * Two independently-nullable fields, and neither is ever filled in by inference:
 *
 * - `approver` is `null` unless the commit carries a well-formed `Approver:` line — so it is null on
 *   `add`/`submit` (subject-only by convention) and on `deprecate` (not an approval gate).
 * - `reason` is `null` unless the commit carries a `Reason:` line, read independently of `Approver:`
 *   (`parseCommitReason`) so a `deprecate` reason is not lost with the missing approver.
 *
 * `from` is `null` only on the element's creation entry (no prior state to name) — which is what
 * "1 entry describing the creation" in the feature's edge scenario looks like. `to` is `null` only
 * when the commit genuinely has no document to read — before the element's creation, or after a
 * deletion. It used to be `null` at every commit older than a rename too, which was
 * `bug-080-read-status-at-reads-the-current-path-at-pre-rename-commits` and is fixed: the walk now
 * carries each commit's own path and `reconstructMemoryTransitions` reads at it.
 */
export interface MemoryHistoryEntryView {
  readonly sha: string;
  /** `Name <email>` — git's own author identity for this commit (`%an`/`%ae`). */
  readonly author: string;
  /** ISO-8601 author date (`%aI`), sourced from git, never from the document. */
  readonly timestamp: string;
  /** The CLAUDE.md §5.1 verb this commit's subject declares, or `null` if the subject is not in that shape. */
  readonly operation: string | null;
  /** The state before this commit; `null` on the creation entry. */
  readonly from: string | null;
  /** The state this commit put the document in, read from its frontmatter at that commit. */
  readonly to: string | null;
  /** `Name <email> (role)` from the commit's `Approver:` line, or `null` when it carries none. */
  readonly approver: string | null;
  /** The commit's `Reason:` line, or `null` when it carries none. */
  readonly reason: string | null;
  readonly subject: string;
}

/** `memory history` success shape: the resolved document (`id` + root-relative `path`) and its full
 * audit trail, oldest first ("the output lists N entries in chronological order"). */
export interface MemoryHistoryResult {
  readonly id: string;
  readonly path: string;
  readonly entries: readonly MemoryHistoryEntryView[];
}

/**
 * `memory history` `CoreOperation.fn` (P1.10, `mutates: false`; spec-006-core-domain-api §3 memory
 * table). Composes two existing primitives and reimplements neither — the git walk, the commit-body
 * parse and the per-commit frontmatter read all belong to `src/memory`:
 *
 * 1. **Argument validation** — an absent (or blank) `<id>` is a usage error: `throw new UsageError`
 *    → exit **2** (spec-008-cli-grammar §4/§5, mapped by `exitCodeForThrow`), the same classification
 *    `dna set`'s missing positional gets. Blank is folded in with absent deliberately: `memory
 *    history ""` supplies a positional that names no document, so reporting it as "not found" would
 *    dress a malformed invocation up as a domain outcome (and print an id-less message).
 * 2. **Load `memory.yaml`** through the same `loadOrError` + `loadMemoryYaml` path every read op uses
 *    — it declares the type `path` patterns that bound the id scan (spec-011: no full-repo walk).
 * 3. **Resolve the id to a document** with task-009's {@link findMemoryDocumentById} — an EXACT
 *    frontmatter-`id` match over the deterministically-sorted document set, never a substring (that
 *    is `memory search`'s job). No match is a domain `NOT_FOUND` (exit 1) with the exact P1.10 message
 *    `document not found: <id>`, returned rather than thrown. Archived documents are deliberately NOT
 *    excluded: REQ-STATE-06 scopes its exclusion to default *search* results, and explicitly
 *    guarantees an archived element remains "present on disk and in git history" — which is precisely
 *    what this command reads.
 * 4. **Reconstruct + project the trail** with task-015's `reconstructMemoryTransitions` (`git log
 *    --follow` oldest-first + a `git show` per commit for that commit's frontmatter `status`, plus the
 *    `Approver:`/`Reason:` body parse). This function only renames those fields into
 *    {@link MemoryHistoryEntryView}'s user-facing shape; it derives no state, parses no body, and
 *    reads no clock of its own (REQ-SYS-07 — the whole result is a pure function of the repository).
 *
 * A document that exists on disk but has never been committed yields `entries: []` — correctly, not
 * as an error: per ADR-007 git history IS the audit trail, so an uncommitted document has none yet.
 * A git read that fails — a tree git cannot read, an answer past the read buffer — is a `CoreError`
 * `IO` (exit `1`) carrying git's message, never an empty trail (task-142, `bug-072`).
 */
const memoryHistoryFn: CoreFn<unknown, MemoryHistoryResult> = async (params) => {
  const { root, positional: id } = params as MemoryHistoryParams;
  if (id === undefined || id.trim().length === 0) {
    throw new UsageError('missing required argument: memory history <id>');
  }

  const loaded: CoreResult<MemoryYaml> = loadOrError(() => loadMemoryYaml(root));
  if (!loaded.ok) return loaded;

  const found = findMemoryDocumentById(root, loaded.value, id);
  if (!found) {
    return coreErr({ code: 'NOT_FOUND', message: `document not found: ${id}` });
  }

  let transitions: ReturnType<typeof reconstructMemoryTransitions>;
  try {
    transitions = reconstructMemoryTransitions(root, found.path);
  } catch (error) {
    // A git read that failed is `IO`, never an empty trail (task-142, `bug-072`): the walk throws
    // rather than answering "no history" for a history it could not read.
    if (error instanceof StorageError) return coreErr({ code: 'IO', message: error.message });
    throw error;
  }
  const entries: MemoryHistoryEntryView[] = transitions.map((transition) => ({
    sha: transition.sha,
    author: `${transition.authorName} <${transition.authorEmail}>`,
    timestamp: transition.date,
    operation: transition.operation,
    from: transition.fromState,
    to: transition.toState,
    approver: transition.approval
      ? `${transition.approval.approverName} <${transition.approval.approverEmail}> (${transition.approval.approverRole})`
      : null,
    reason: transition.reason,
    subject: transition.subject,
  }));

  return coreOk({ id, path: found.path, entries });
};

/**
 * `wingfoil memory submit <id>` params (P1.6, task-045-memory-submit). The document id rides the bare
 * `ParamsContext.positional` seam, per spec-008-cli-grammar §7 (a command whose noun scopes the type
 * takes the bare `<id>`). Optional only because the seam is; an absent id is a usage error.
 */
export interface MemorySubmitParams {
  readonly root: string;
  readonly positional?: string;
}

/** `memory submit` success shape: the document and the transition it went through. */
export interface MemorySubmitResult {
  readonly id: string;
  /** Root-relative path of the submitted document. */
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

/**
 * `memory submit` `CoreOperation.fn` (P1.6, `mutates: true`; spec-006-core-domain-api §3). Submit is
 * "the content is written — move it forward": it commits the document as the author left it, with
 * `status` advanced. Order, every refusal before the single write:
 *
 * 1. **`<id>`** absent or blank → `UsageError` (exit 2), as `memory history` — before the identity
 *    check, so the exit code does not depend on the machine (task-125, `bug-172`).
 * 2. **`requireGitIdentity`** (REQ-SEC-01) — exit 1. Steps 2 and 3 are {@link beginMemoryTransition},
 *    the preamble every transition verb shares (task-132, `bug-142`; `spec-006` §7).
 * 3. **{@link prepareMemoryTransition}** — it resolves the `memory.yaml` and the document committed at
 *    `HEAD` itself (task-091, `dl-080` (B); task-247, `bug-187`); no committed machine, an unreadable one, not found, unknown type,
 *    invalid state, or an illegal transition, each a `CoreResult.error` (exit 1); an illegal one
 *    carries the pinned `illegal transition <from> -> <to> for type '<type>'` (`dl-032`, P1.6 sc.2).
 * 5. **Required fields** (spec-010 validation rules) — `title` and every `template.frontmatter.required`
 *    field must be non-empty, else `VALIDATION` `missing required field on submit: <fields>` (exit 1).
 *    A field the type lists in `template.frontmatter.not_applicable_allowed` may hold
 *    `"n/a — <reason>"`; a not-applicable value anywhere else, or one with no reason, is `VALIDATION`
 *    `not-applicable value on submit: …` naming the field (`dl-124`, task-168, {@link requireRequiredFields}).
 * 6. **Edit + commit** — `status` set to the target and `rejection_reason` removed (spec-010 field-write
 *    ownership; every other byte kept), then one commit scoped to that file, subject
 *    `wf(<type>): submit <id>` with no bracket and no body (spec-004 §4.3). The rendered document is
 *    re-parsed first (`commitMemoryTransition`'s post-condition: `status` is the target, no
 *    `rejection_reason`, nothing else changed); a failure is `VALIDATION` (exit 1) with nothing written. No `--reason`: spec-008 §2
 *    requires it only on the approval gates (`dl-027`).
 */
const memorySubmitFn: CoreFn<unknown, MemorySubmitResult> = async (params) => {
  const { root, positional: id } = params as MemorySubmitParams;

  if (id === undefined || id.trim().length === 0) {
    throw new UsageError('missing required argument: memory submit <id>');
  }

  const prepared = beginMemoryTransition(root, id, 'submit');
  if (!prepared.ok) return prepared;
  const { type, path, frontmatter, content, from, to } = prepared.value;

  const fieldsFilled = requireRequiredFields(prepared.value.memoryYaml, type, frontmatter, 'submit');
  if (!fieldsFilled.ok) return fieldsFilled;

  const message = formatMemoryCommitMessage({ type, op: 'submit', ids: [id] });
  const rendered = renderSubmitDocument(content, to);
  // `carries-content`: submit is the ONE verb entitled to bring the author's body and required fields
  // into its commit (spec-010's field-write ownership row), so it is not guarded against a modified
  // working tree and its commit need not differ from HEAD~1 by `status` alone (task-088, bug-076 AC4).
  const committed = commitMemoryTransition(root, prepared.value, rendered, message, { [REJECTION_REASON_FIELD]: undefined }, 'carries-content');
  if (!committed.ok) return committed;
  return coreOk({ id, path, from, to }, { sha: committed.value, message });
};

/**
 * `wingfoil memory approve <id> --reason <text>` params (P1.7, task-046-memory-approve). The document
 * id rides the bare `ParamsContext.positional` seam (spec-008-cli-grammar §7) and `--reason` the
 * value-bearing `options` seam (`./registry.ts`), the same one `memory add` reads `--type`/`--title`
 * from. Both are optional only because the seams are; {@link memoryApproveFn} refuses either absent.
 */
export interface MemoryApproveParams {
  readonly root: string;
  readonly positional?: string;
  readonly options?: Readonly<Record<string, string>>;
}

/** `memory approve` success shape: the document and the transition it went through. */
export interface MemoryApproveResult {
  readonly id: string;
  /** Root-relative path of the approved document. */
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

/**
 * `memory approve` `CoreOperation.fn` (P1.7, `mutates: true`; spec-006-core-domain-api §3). Approve is
 * the approval gate: it advances `status` across a `gates` edge and records **who** approved, **when**
 * and **why** — identity and reason in the commit body, the ISO-8601 timestamp supplied by git itself
 * (P1.2/P1.10), never written into the message. Order, every refusal before the single write, so
 * "the state is unchanged" (P1.7 sc.2/sc.3) holds by construction:
 *
 * 1. **`<id>`** absent or blank → `UsageError` (exit 2), as `memory submit`/`memory history`.
 * 2. **`requireReason`** (REQ-SEC-04, task-041) → `UsageError` `missing required argument: --reason`
 *    (exit 2, P1.7 sc.2). Placed before any file is read, so an omitted reason touches nothing. Both
 *    usage checks precede the identity check (task-125, `bug-172`).
 * 3. **`requireGitIdentity`** (REQ-SEC-01) — exit 1. Steps 3 and 4 are {@link beginMemoryTransition}
 *    (task-132, `bug-142`; `spec-006` §7), which reads the identity ONCE: step 6 authorizes it, the
 *    `Approver:` line names it, and the commit is authored as it (`--author`), so the three can never
 *    name different principals (`bug-149`).
 * 4. **{@link prepareMemoryTransition}** — it resolves the `memory.yaml` and the document committed at
 *    `HEAD` itself (task-091, `dl-080` (B); task-247, `bug-187`); no committed machine, an unreadable one, not found, unknown type,
 *    invalid state, or an illegal transition, each a `CoreResult.error` (exit 1); an illegal one
 *    carries the pinned `illegal transition <from> -> <to> for type '<type>'` (`dl-032`), whose `<to>`
 *    is `approve`'s own next legal edge (`dl-053`).
 * 6. **`requireApprovalAuthority`** (REQ-SEC-03, task-040) — exit 1 with
 *    `user not authorized to approve type '<type>'` (P1.7 sc.3). It runs after step 5 because its
 *    message interpolates the document's type, which is only knowable once the document is located,
 *    and `findMemoryDocumentByIdAtRev` at `HEAD` is a full scan of the registered content roots —
 *    resolving the type twice would double the cost of every approve. Nothing is weakened by the order: the authority
 *    *decision* depends on nothing step 5 computes (adr-006 fixes one uniform `approver` role, keyed
 *    on the git identity), and step 5 writes nothing. It reads the roles from the **committed**
 *    `.wingfoil/dna.yaml` and resolves that file itself (task-090, `bug-079`) — which is why no
 *    `loadDnaYaml` call precedes it here: an uncommitted grant must not be able to reach this
 *    decision, and the way to guarantee that is to leave the caller nothing to pass.
 * 7. **Edit + commit** — `status` set to the target and **nothing else** (spec-010 field-write
 *    ownership: approve changes only `status`; approver and reason live in the commit message). One
 *    commit scoped to that file, subject `wf(<type>): approve <id> [<from> → <to>]` with the mandatory
 *    `Approver:` / `Reason:` body (CLAUDE.md §5.1; `dl-054` confines the bracket to the
 *    approver-gated verbs, which is why `memory submit` has none). `commitMemoryTransition` re-parses
 *    the rendered frontmatter first and refuses (exit 1, nothing written) unless `status` is the
 *    target and no other field's value moved — which is exactly spec-010's "only `status`" rule, so
 *    no extra `expected` entry is needed here.
 */
const memoryApproveFn: CoreFn<unknown, MemoryApproveResult> = async (params) => {
  const { root, positional: id, options } = params as MemoryApproveParams;

  if (id === undefined || id.trim().length === 0) {
    throw new UsageError('missing required argument: memory approve <id>');
  }
  const reason = requireReason(options);

  const prepared = beginMemoryTransition(root, id, 'approve');
  if (!prepared.ok) return prepared;
  const { type, path, content, from, to } = prepared.value;

  const authorized = requireApprovalAuthority(root, type, prepared.value.identity);
  if (!authorized.ok) return authorized;

  const { name, email } = prepared.value.identity;
  const message = formatMemoryCommitMessage({
    type,
    op: 'approve',
    ids: [id],
    transition: { from, to },
    approver: { name, email, role: APPROVER_ROLE },
    reason,
  });
  const committed = commitMemoryTransition(root, prepared.value, setFrontmatterField(content, 'status', to), message);
  if (!committed.ok) return committed;
  return coreOk({ id, path, from, to }, { sha: committed.value, message });
};

/**
 * `wingfoil memory reject <id> --reason <text>` params (P1.8, task-047-memory-reject). The id rides
 * the bare `ParamsContext.positional` seam (spec-008-cli-grammar §7 names
 * `memory reject <id> --reason ...` explicitly); the reason rides task-020's value-bearing
 * `ParamsContext.options` seam, exactly as `memory add`'s `--type`/`--title` do. Both are optional
 * here only because the seams are — {@link memoryRejectFn} refuses either absence as a usage error
 * (exit `2`).
 */
export interface MemoryRejectParams {
  readonly root: string;
  readonly positional?: string;
  readonly options?: Readonly<Record<string, string>>;
}

/** `memory reject` success shape: the document, the transition it went through, and the reason recorded. */
export interface MemoryRejectResult {
  readonly id: string;
  /** Root-relative path of the rejected document. */
  readonly path: string;
  readonly from: string;
  readonly to: string;
  /** The `--reason` text, exactly as given — the same string written to frontmatter and to the commit body. */
  readonly reason: string;
}

/**
 * `memory reject` `CoreOperation.fn` (P1.8, `mutates: true`; spec-006-core-domain-api §3) — the FIRST
 * approver-gated verb, so the first operation that enforces REQ-SEC-03 (role authority) and REQ-SEC-04
 * (mandatory reason) and the first to emit a commit with a `[from → to]` subject bracket and an
 * `Approver:`/`Reason:` body (`dl-054-submit-commit-subject-bracket`, CLAUDE.md §5.1). Order, every
 * refusal before the single write:
 *
 * 1. **`<id>`** absent or blank → `UsageError` (exit `2`), as `memory submit`.
 * 2. **`requireReason`** (REQ-SEC-04, task-041-mandatory-reason-on-verbs) → `UsageError`
 *    `missing required argument: --reason` (exit `2`, P1.8 sc.3). Both usage checks precede the
 *    identity check (task-125, `bug-172`).
 * 3. **`requireGitIdentity`** (REQ-SEC-01) — exit `1`. Steps 3 and 4 are {@link beginMemoryTransition}
 *    (task-132, `bug-142`; `spec-006` §7).
 * 4. **{@link prepareMemoryTransition}** with op `reject`, against the `memory.yaml` and the document
 *    committed at `HEAD` (task-091, `dl-080` (B); task-247, `bug-187`) — no committed machine, an unreadable one, not found,
 *    unknown type, invalid state, or an illegal transition (the document is in no `gates`
 *    state), each a `CoreResult.error` at exit `1` carrying `dl-032`'s pinned contract message. The
 *    target is the type's `gates.<from>.reject` value, taken verbatim (`spec-001`), so it need not be
 *    a `sequence` member.
 * 5. **{@link requireApprovalAuthority}** (REQ-SEC-03) — exit `1` with
 *    `user not authorized to approve type '<type>'`. It runs AFTER step 4 because that message names
 *    the element **type**, which is a fact of the document and is known only once the document has
 *    been located; nothing is written in steps 1-5, so "the state is unchanged" holds either way. The
 *    roles come from the **committed** `.wingfoil/dna.yaml`, which that function resolves itself
 *    (task-090, `bug-079`): `reject` is an approval gate and records the same `Approver:` line, so it
 *    takes the same baseline as `approve`, by construction rather than by remembering to.
 * 6. **Edit + commit** — `status` set to the reject target and `rejection_reason` to the reason
 *    verbatim (spec-010 field-write ownership: reject is the one verb that writes two fields), then
 *    one commit scoped to that file. `commitMemoryTransition`'s post-condition re-parses the rendered
 *    document and refuses (`VALIDATION`, exit `1`, nothing written) unless `status` AND
 *    `rejection_reason` hold their expected values and no other field moved.
 *
 * The `Approver:` identity is the one step 3 resolved — the same value step 5 checked and the commit
 * is authored as (`--author`, task-132, `bug-149`), so the body line can never disagree with the
 * attribution (adr-001/adr-006) — under the `APPROVER_ROLE` the authority was exercised as.
 */
const memoryRejectFn: CoreFn<unknown, MemoryRejectResult> = async (params) => {
  const { root, positional: id, options } = params as MemoryRejectParams;

  if (id === undefined || id.trim().length === 0) {
    throw new UsageError('missing required argument: memory reject <id>');
  }
  const reason = requireReason(options);

  const prepared = beginMemoryTransition(root, id, 'reject');
  if (!prepared.ok) return prepared;
  const { type, path, from, to, content } = prepared.value;

  const authorized = requireApprovalAuthority(root, type, prepared.value.identity);
  if (!authorized.ok) return authorized;

  const { name, email } = prepared.value.identity;
  const message = formatMemoryCommitMessage({
    type,
    op: 'reject',
    ids: [id],
    transition: { from, to },
    approver: { name, email, role: APPROVER_ROLE },
    reason,
  });
  const rendered = renderRejectDocument(content, to, reason);
  const committed = commitMemoryTransition(root, prepared.value, rendered, message, { [REJECTION_REASON_FIELD]: reason });
  if (!committed.ok) return committed;
  return coreOk({ id, path, from, to, reason }, { sha: committed.value, message });
};

/**
 * `wingfoil memory deprecate <id> [--reason <text>]` params (P1.9, task-048-memory-deprecate). The id
 * rides the bare `ParamsContext.positional` seam (`spec-008-cli-grammar` §7 names
 * `memory deprecate <id>` explicitly); the reason rides task-020's value-bearing
 * `ParamsContext.options` seam. Unlike `memory reject`'s, this `--reason` is genuinely OPTIONAL —
 * `spec-008` §2 ("optional elsewhere (e.g. `memory deprecate`)") and
 * `dl-027-req-sec-04-deprecate-reason-scope` option (a), which narrowed REQ-SEC-04 to the approval
 * gates — so {@link memoryDeprecateFn} reads it directly and never calls `requireReason`.
 */
export interface MemoryDeprecateParams {
  readonly root: string;
  readonly positional?: string;
  readonly options?: Readonly<Record<string, string>>;
}

/** `memory deprecate` success shape: the document, the edge it took, and the reason if one was given. */
export interface MemoryDeprecateResult {
  readonly id: string;
  /** Root-relative path of the deprecated document — still present in the repository (P1.9 sc.1). */
  readonly path: string;
  readonly from: string;
  readonly to: string;
  /** The `--reason` text exactly as given, or `undefined` when the optional flag was omitted. */
  readonly reason?: string;
}

/**
 * `memory deprecate` `CoreFn` (P1.9, `mutates: true`; spec-006-core-domain-api §3) — the retire verb.
 * It rides `spec-001-memory-yaml-schema`'s **implicit wildcard edge**: `deprecated` is "a built-in
 * wildcard edge from *any* state to a reserved `deprecated` state, always legal", never declared in a
 * type's `sequence`/`gates`/`waiting`. The target therefore comes from the engine
 * (`prepareMemoryTransition` → `resolveTypeTransition`, itself resolved from `memory.yaml`), never
 * from a literal here — so this one function retires a `task` sitting in a `waiting` state, an
 * `accepted` `adr`, a terminal `decision-log`, and a type that falls back to `defaults.states`, with
 * no per-type branch. (`adr`/`tech-spec`'s `superseded` is NOT this verb's target: it is a `waiting`
 * edge fired by a later element's `supersedes:` field — see `SUPERSEDED_STATE` in
 * `src/memory/state-machine.ts` and this task's Execution Notes, decision D1.)
 *
 * Order, every refusal before the single write:
 *
 * 1. **`<id>`** absent or blank → `UsageError` (exit `2`), as `memory submit`/`memory reject`; so is a
 *    `--reason` that is given but blank, carrying a control character other than tab or newline, or
 *    trailer-shaped (`optionalReason`). Both precede the identity check (task-125, `bug-172`).
 * 2. **`requireGitIdentity`** (REQ-SEC-01) — exit `1`. Steps 2 and 3 are {@link beginMemoryTransition}
 *    (task-132, `bug-142`; `spec-006` §7).
 * 3. **{@link prepareMemoryTransition}** with op `deprecate`, against the `memory.yaml` and the
 *    document committed at `HEAD` (task-091, `dl-080` (B); task-247, `bug-187`) — no committed machine, an unreadable one, not found,
 *    unknown type, or a `status` that is not a state of the type, each a
 *    `CoreResult.error` (exit `1`). There is no illegal-transition branch: the wildcard edge is legal
 *    from every state.
 * 4. **Already-deprecated guard** (P1.9 sc.3) — `VALIDATION` `document already deprecated: <id>`
 *    (exit `1`), state unchanged. It lives here rather than in the state machine because the engine
 *    must keep the edge legal from *any* state; the condition is expressed as "the document is
 *    already AT the resolved target", so it never hard-codes a state name.
 * 5. **Edit + commit** — `status` set to the target and **nothing else** (spec-010 field-write
 *    ownership: this verb is `status`-only, so `rejection_reason` and every other field survive
 *    untouched — enforced, not assumed, by `commitMemoryTransition`'s re-parse post-condition, which
 *    refuses the write if any unowned field moved). One commit scoped to that file, subject
 *    `wf(<type>): deprecate <id> [<from> → deprecated]` (`dl-054` / `spec-004` §4.3: the bracket
 *    belongs to `approve`/`reject`/`deprecate`), with a `Reason:` body line **only** when `--reason`
 *    was given.
 *
 * Deliberately absent: no `Approver:` line and no `requireApprovalAuthority` call. `deprecate` is not
 * an approval gate — REQ-SEC-03's Fit Criterion is scoped to an *approve* attempt, and REQ-SEC-04's
 * own Traceability line (as amended by `dl-027`) says so in as many words: "`memory deprecate` is not
 * an approval gate (no `Approver:` line, no authority check)". `memory history` (P1.10) already reads
 * that shape back — it parses `Reason:` independently of `Approver:` for exactly this verb.
 */
const memoryDeprecateFn: CoreFn<unknown, MemoryDeprecateResult> = async (params) => {
  const { root, positional: id, options } = params as MemoryDeprecateParams;

  if (id === undefined || id.trim().length === 0) {
    throw new UsageError('missing required argument: memory deprecate <id>');
  }
  // `--reason` is optional here (`dl-027`), but a reason that IS given must be recordable in the
  // trailer — blank, carrying a control character other than tab or newline, or trailer-shaped is a
  // usage error at exit 2, before anything is read or written (`dl-067` clauses 1 and 4 as amended;
  // `bug-042` F2/F3, whose amendment makes THIS verb the exploitable one).
  const reason = optionalReason(options);

  const prepared = beginMemoryTransition(root, id, 'deprecate');
  if (!prepared.ok) return prepared;
  const { type, path, from, to, content } = prepared.value;
  if (from === to) {
    return coreErr({ code: 'VALIDATION', message: `document already deprecated: ${id}` });
  }

  const message = formatMemoryCommitMessage({ type, op: 'deprecate', ids: [id], transition: { from, to }, reason });
  const rendered = setFrontmatterField(content, 'status', to);
  const committed = commitMemoryTransition(root, prepared.value, rendered, message);
  if (!committed.ok) return committed;
  return coreOk({ id, path, from, to, reason }, { sha: committed.value, message });
};

/**
 * `wingfoil memory amend <id> --reason <text>` params (task-127, `dl-108`). The id rides the bare
 * `ParamsContext.positional` seam (`spec-008-cli-grammar` §7) and `--reason` the value-bearing
 * `options` seam, as on `memory approve`. Both are optional only because the seams are;
 * {@link memoryAmendFn} refuses either absent.
 */
export interface MemoryAmendParams {
  readonly root: string;
  readonly positional?: string;
  readonly options?: Readonly<Record<string, string>>;
}

/** `memory amend` success shape: the document and its unchanged state, as the `[s → s]` bracket records it. */
export interface MemoryAmendResult {
  readonly id: string;
  /** Root-relative path of the amended document. */
  readonly path: string;
  readonly from: string;
  /** Always equal to `from`: an amendment moves no state. */
  readonly to: string;
}

/**
 * `memory amend` `CoreOperation.fn` (task-127, `mutates: true`; `dl-108` A1 (a), A2 (i), A3). It
 * records the author's uncommitted edit of one document as an amendment: one commit, that file only,
 * `status` untouched, under an approver's name. It is the verb for a correction to an element no
 * transition verb can move (an `approved` tech-spec, a `ready` decision-log). Order, every refusal
 * before the single write:
 *
 * 1. **`<id>`** absent or blank, then **`requireReason`** (`dl-067`) → `UsageError` (exit `2`), before
 *    anything is read. Both precede the identity check (task-125, `bug-172`), as on `approve`.
 * 2. **`requireGitIdentity`** (REQ-SEC-01) — exit `1`. Step 2 and the lookup in step 3 are
 *    {@link beginMemoryTransition} (task-132, `bug-142`; `spec-006` §7); the identity it returns is
 *    the one step 4 authorizes, the `Approver:` line names and the commit is authored as.
 * 3. **{@link prepareMemoryTransition}** with op `amend` — the document located at `HEAD`, its type and
 *    state resolved against the `memory.yaml` committed there (`dl-080` (B); task-247, `bug-187`), its
 *    content taken from the working tree; its target is its own
 *    state, so no illegal-transition refusal exists for this verb. Then
 *    {@link requireConfinedWriteTarget} (REQ-SEC-06): a document outside the project, or one that is
 *    itself a symbolic link, is refused before any question about its content.
 * 4. **{@link requireApprovalAuthority}** (REQ-SEC-03, `dl-108` A2 (i)) — the same check and message
 *    as `approve`, from the committed `dna.yaml`; exit `1`. It runs as soon as the type is known
 *    (step 3), the same place `approve` runs it, so a caller without authority learns nothing about
 *    the edit (task-127 review F6).
 * 5. **{@link requireAmendableType}** — the committed entry must declare `amendable: true`
 *    (`dl-108` A3, `spec-001`); exit `1`.
 * 6. **{@link requireAmendableEdit}** — the document must be committed at `HEAD`, carry a change, and
 *    leave every field the type's {@link amendReservedFields} lists as committed (`spec-010` §
 *    Field-write ownership: `release` only where the committed scaffold declares it, task-170);
 *    exit `1`, naming the field. Then {@link requireRequiredFieldsKept}: past the initial
 *    state, `title` and the type's required fields must stay non-empty (`spec-010` § Validation
 *    rules); exit `1`, naming the field.
 * 7. **Commit** — {@link commitMemoryTransition} under `carries-content`, the scope `memory submit`
 *    uses: the working-tree bytes are the content of record, so they are written back unchanged and
 *    committed as that one path. `commitPaths` stages only that path, so other modified or staged
 *    files stay where they are (`bug-027`); the post-condition checks that the commit holds only that
 *    path and that `status` is the unchanged state (`bug-076`). Subject
 *    `wf(<type>): amend <id> [<s> → <s>]` with the `Approver:` / `Reason:` body (`spec-008` §2).
 */
const memoryAmendFn: CoreFn<unknown, MemoryAmendResult> = async (params) => {
  const { root, positional: id, options } = params as MemoryAmendParams;

  if (id === undefined || id.trim().length === 0) {
    throw new UsageError('missing required argument: memory amend <id>');
  }
  const reason = requireReason(options);

  const prepared = beginMemoryTransition(root, id, 'amend');
  if (!prepared.ok) return prepared;
  const { memoryYaml, type, path, content, frontmatter, from, to } = prepared.value;

  // Before any question about the edit: is this file the project's to write at all (REQ-SEC-06,
  // `bug-117`/`bug-120`)? The other verbs ask it first inside `commitMemoryTransition`; `amend` asks
  // it here too, because its own checks read the document against `HEAD`, and a symlinked document
  // would otherwise be refused for a field change it never made.
  const confined = requireConfinedWriteTarget(root, path, 'write');
  if (!confined.ok) return confined;
  const authorized = requireApprovalAuthority(root, type, prepared.value.identity);
  if (!authorized.ok) return authorized;

  const amendable = requireAmendableType(memoryYaml, type);
  if (!amendable.ok) return amendable;
  const edit = requireAmendableEdit(root, id, path, content, amendReservedFields(root, memoryYaml, type));
  if (!edit.ok) return edit;
  const filled = requireRequiredFieldsKept(memoryYaml, type, from, frontmatter);
  if (!filled.ok) return filled;

  const { name, email } = prepared.value.identity;
  const message = formatMemoryCommitMessage({
    type,
    op: 'amend',
    ids: [id],
    transition: { from, to },
    approver: { name, email, role: APPROVER_ROLE },
    reason,
  });
  const committed = commitMemoryTransition(root, prepared.value, content, message, {}, 'carries-content');
  if (!committed.ok) return committed;
  return coreOk({ id, path, from, to }, { sha: committed.value, message });
};

/**
 * `wingfoil directive create --name <name>` params (P3.1, task-050-directive-create). The name rides
 * task-020's value-bearing `ParamsContext.options` seam (`core/registry.ts`), read as `--name` —
 * NOT the bare positional seam: `X_cli-cmds.md` and the P3.1 BDD both spell the invocation
 * `wingfoil directive create --name <NAME>`. `options` is optional only because the seam itself is;
 * {@link directiveCreateFn} rejects an absent `--name` as a usage error (exit 2).
 */
export interface DirectiveCreateParams {
  readonly root: string;
  readonly options?: Readonly<Record<string, string>>;
}

/**
 * `wingfoil directives list [--role <role>]` params (P3.4, task-053-directives-list). Reuses
 * task-020's value-bearing `ParamsContext.options` seam for the optional `--role` filter, exactly as
 * `memorySearch`'s `--tag`/`--status`/`--type` do. The MCP surface's mechanical zero-argument
 * `wingfoil://directives/list` Resource never populates it (see `ParamsContext.options`), which
 * degenerates to the unfiltered listing — the right default for a Resource that has no per-request
 * parameter.
 */
export interface DirectivesListParams {
  readonly root: string;
  readonly options?: Readonly<Record<string, string>>;
}

/**
 * `directive create` `CoreOperation.fn` (P3.1, `mutates: true` — the FIRST Directives-pillar mutation
 * and the pillar's first CLI verb; spec-006-core-domain-api §3 directives table). Follows `dna set`'s
 * mutating-op template (task-025) exactly, over the Directives pillar instead of `dna.yaml`:
 *
 * 1. **Argument validation** — both failures are usage errors (`throw new UsageError` → exit **2**,
 *    mapped by `exitCodeForThrow`): an absent `--name` uses spec-008-cli-grammar §4's exact
 *    `missing required argument: --<name>` wording (same as `memoryAdd`), and a non-kebab-case name
 *    uses P3.1's exact `invalid directive name (use kebab-case)` message
 *    ({@link INVALID_DIRECTIVE_NAME_MESSAGE}). Because {@link isValidDirectiveName} runs before any
 *    path is built, a traversal-shaped name (`../x`, `a/b`, `/etc/passwd`) can never reach the write.
 *    It runs before the identity check, so the exit code does not depend on the machine (task-125,
 *    `bug-172`).
 * 2. **`requireGitIdentity` pre-flight** (REQ-SEC-01, task-014) — refuse before any read/write when
 *    the git identity is unset, returning its `CoreResult.error` unchanged (exit 1).
 * 3. **Already-exists check** — a file at `.wingfoil/directives/custom/<name>.md` makes this a domain
 *    `CONFLICT` (the input is well-formed; the target is taken), returned NOT thrown, with P3.1's exact
 *    `directive already exists: <name>` message → exit 1 via `exitCodeForError`. Nothing is written, so
 *    the BDD's "no file is overwritten" holds by construction. The check is scoped to `custom/` only,
 *    per `X_cli-cmds.md`'s "Unique within custom directives" — `built-in/` holds package-shipped
 *    templates a user does not author against (spec-011's built-in/custom split).
 * 4. **Render + persist + commit** — {@link renderCustomDirective} produces the whole document as a
 *    pure function of `name` (REQ-SYS-07: no clock, no randomness, so two runs are byte-identical),
 *    satisfying `DirectiveFrontmatter` (spec-013) so the new file loads through `loadDirectives`
 *    alongside the ten `wingfoil init` scaffolds. Then `writeDocument` + `commitPaths` on the ONE
 *    scoped path — exactly one commit, `wf(directive): create <name>` — and the sha rides
 *    `CoreResult.commit`, the same shape `dnaSet` returns for `wf(dna): set <key>`.
 */
const directiveCreateFn: CoreFn<unknown, { name: string; path: string }> = async (params) => {
  const { root, options } = params as DirectiveCreateParams;

  const name = options?.name;
  if (name === undefined) throw new UsageError('missing required argument: --name');
  if (!isValidDirectiveName(name)) throw new UsageError(INVALID_DIRECTIVE_NAME_MESSAGE);

  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;

  // One spelling of the location, reused for the existence check, the write and the commit scope, so
  // the three can never drift apart. `join` normalizes the separators, so the POSIX form is also the
  // correct absolute path on Windows; the root-relative form is what `commitPaths` stages.
  const relativePath = `.wingfoil/directives/custom/${name}.md`;
  const absolutePath = join(root, relativePath);
  if (documentExists(absolutePath)) {
    return coreErr({ code: 'CONFLICT', message: `directive already exists: ${name}` });
  }
  // dl-080 (B) / bug-078: the existence check above only sees the WORKING TREE, so a file deleted but
  // not committed leaves this path "free" while `HEAD` still carries it — and the create then commits
  // a diff that REMOVES the old content under a subject saying "create". Refuse instead.
  const unmodified = requireUnmodifiedTarget(root, relativePath);
  if (!unmodified.ok) return unmodified;

  const content = renderCustomDirective(name);
  writeDocument(absolutePath, content);
  const message = `wf(directive): create ${name}`;
  const sha = commitPaths(root, [relativePath], message);
  const leaked = committedScopeError(root, sha, relativePath, content);
  if (leaked) return leaked;
  return coreOk({ name, path: relativePath }, { sha, message });
};

/**
 * `wingfoil directive assign --directive <id>[,<id>...] --role <role>` params (P3.2,
 * task-051-directive-assign; the comma-separated list is P3.7,
 * task-056-role-based-directive-assignment). Both values ride the value-bearing
 * `ParamsContext.options` seam, as `directive create`'s `--name` does — the list travels *inside* the
 * `--directive` value rather than as a repeated flag, because that seam carries one `string` per
 * option name; {@link directiveAssignFn} rejects an absent or id-less one as a usage error (exit 2).
 */
export interface DirectiveAssignParams {
  readonly root: string;
  readonly options?: Readonly<Record<string, string>>;
  /** `--force` (task-169, `dl-062` Q1 option 3): authorize the whole-file rewrite of `roles.yaml`. */
  readonly force?: boolean;
}

/**
 * `directive assign` success shape: the binding requested and the role's resulting assignment list.
 *
 * `directives` is always a **list** — the ids `--directive` named, trimmed, de-duplicated, in
 * argument order — even for a single-id request. It was `directive: string` while only P3.2 existed
 * (task-051); P3.7 (task-056) widened it rather than varying the payload's shape with the number of
 * ids, which would be hostile to `--format json` consumers and to REQ-SYS-07's "output is a pure
 * function of the input". `[AUTHORING]`: no spec pins this payload — spec-006 §3's row names the
 * operation, not its result type.
 */
export interface DirectiveAssignResult {
  readonly directives: readonly string[];
  readonly role: string;
  readonly assignments: readonly string[];
}

/**
 * `directive assign` `CoreOperation.fn` (P3.2 **and P3.7**, `mutates: true`; spec-006 §3 row
 * `directiveAssign`, module `directive` per dl-041). P3.7 (US-4-06, "bind multiple directives to one
 * role") registers **no operation of its own** — spec-006 §3 has three `directive` rows and none for
 * it, and `spec-008` §1 / `X_cli-cmds.md` list no fourth directive verb — so it is this operation
 * with a list-valued `--directive`. Same mutating-op order as {@link directiveCreateFn}:
 *
 * 1. `--directive` then `--role` presence — `UsageError`, spec-008 §4 wording, exit 2. A `--directive`
 *    value that parses to **no ids** (`""`, `"  "`, `","`) counts as absent, the same reading
 *    `parseTags` takes of an empty `--tags` (`[AUTHORING]`, task-056 D3: before P3.7 such a value
 *    reached step 3 and failed with an empty id in the message, `unknown directive: `).
 * 2. `requireGitIdentity` pre-flight (REQ-SEC-01), after the usage checks (task-125, `bug-172`).
 * 3. `checkAssignable` — which resolves **both** of its baselines from the repository as committed at
 *    `HEAD` itself, the role catalogue (task-091, `bug-082`) and the directive inventory (task-096,
 *    `bug-086`), per `dl-080` (B) — returns P3.2's exact
 *    `unknown role '<role>' (not defined in dna.yaml)` / `unknown directive: <id>` as `NOT_FOUND`
 *    (exit 1), role first and then each id in argument order. It validates **every** id before
 *    anything is written, which is P3.7 Sc.3's "no partial assignment is persisted": one unknown id
 *    leaves `roles.yaml` byte-identical and commits nothing. There is no working-tree pre-load to
 *    pass it: an untracked directive file used to be bindable, and the committed `roles.yaml` then
 *    named a directive no clone would have.
 * 4. `updateRoleAssignments` appends the ids (`withAssignedDirectives`: idempotent, order-preserving,
 *    never sorting) through the comment-preserving `roles.yaml` writer and makes ONE commit,
 *    `wf(directive): assign <id1>, <id2> to <role>`, staging only `.wingfoil/roles.yaml`. A request
 *    whose ids are all already bound is a success with no write and no commit (P3.7 Sc.2 "Binding is
 *    idempotent"); a partially overlapping one appends only what is missing. A file the in-place
 *    editor cannot edit is refused (`CONFLICT`, exit 1) unless `--force` authorizes the whole-file
 *    rewrite, whose success then carries a warning the CLI prints on stderr (task-169, `dl-062`).
 */
const directiveAssignFn: CoreFn<unknown, DirectiveAssignResult> = async (params) => {
  const { root, options, force } = params as DirectiveAssignParams;

  const directive = options?.directive;
  if (directive === undefined) throw new UsageError('missing required argument: --directive');
  const directives = parseDirectiveIds(directive);
  if (directives.length === 0) throw new UsageError('missing required argument: --directive');
  const role = options?.role;
  if (role === undefined) throw new UsageError('missing required argument: --role');

  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;

  const invalid = checkAssignable(root, role, directives);
  if (invalid) return coreErr(invalid);

  const message = `wf(directive): assign ${directives.join(', ')} to ${role}`;
  const updated = updateRoleAssignments(root, role, (current) => withAssignedDirectives(current, directives), message, {
    force: force === true,
  });
  if (!updated.ok) return updated;
  return coreOk({ directives, role, assignments: updated.value.assignments }, updated.commit, updated.warnings);
};

/**
 * `wingfoil directive remove <name>` params (P3.3, task-052-directive-remove). Unlike `directive
 * create`/`directive assign`, the name rides the generic bare `positional` seam (task-026's
 * `ParamsContext.positional`), not `--name`: `X_cli-cmds.md` and the P3.3 BDD both spell the
 * invocation `wingfoil directive remove <NAME>`, and spec-008-cli-grammar §7's bare-`<id>` rule
 * applies — the noun already scopes what the argument is.
 */
export interface DirectiveRemoveParams {
  readonly root: string;
  readonly positional?: string;
}

/** `directive remove` success shape: the name removed and the root-relative path that was deleted. */
export interface DirectiveRemoveResult {
  readonly name: string;
  readonly path: string;
}

/**
 * `directive remove` `CoreOperation.fn` (P3.3, `mutates: true`; spec-006 §3 row `directiveRemove`,
 * module `directive` per dl-041 B). The first operation in the system that DELETES a file, and the
 * one that completes **REQ-SEC-07**: `task-042-immutable-builtin-assets` shipped clause (a) as the
 * `requireCustomAsset` primitive, and `dl-030-req-sec-07-referenced-asset-ownership` (`ready`,
 * option (b)) assigns clause (b)'s directive half here. Both are enforced, in this order, and both
 * strictly **before** anything on disk changes:
 *
 * 1. `<name>` presence — a missing or blank positional is a `UsageError` → exit **2**
 *    (`missing required argument: directive remove <name>`, the `memory submit <id>` precedent).
 * 2. `requireGitIdentity` pre-flight (REQ-SEC-01), after the usage check (task-125, `bug-172`).
 * 3. **Resolve the name to a real file**, never to a constructed path. `loadDirectives` reads every
 *    installed directive and {@link selectDirectivesById} picks the winner for that id under
 *    `dl-037`'s custom-wins precedence (`src/core/context.ts` — the same primitive `directives list`
 *    and context assembly use, so the rule is implemented once). No match is a domain `NOT_FOUND`
 *    with P3.2's wording, reused: `unknown directive: <name>`. Because the path comes from a file
 *    that was just read, a traversal-shaped argument can never reach the filesystem — it simply
 *    resolves to nothing.
 *
 *    This read stays on the **working tree**, deliberately (task-096 AC4). It answers *which file on
 *    disk am I being asked to delete* — the asset itself, not a gate on it — and step 7's write guard
 *    (`requireUnmodifiedTarget`, task-092) then decides whether that file may be deleted at all. Resolving it at `HEAD` instead would
 *    answer an **untracked** directive file with `unknown directive: <id>`, which is false to the
 *    user's screen, where the file plainly is; the refusal they need is the write guard's, which
 *    names the file and its `git status` code. Deleting a file that exists in no commit is not this
 *    verb's act anyway: its contract is to produce one commit that *records* the deletion, and there
 *    is nothing there to record.
 * 4. **REQ-SEC-07 clause (a)** — `requireCustomAsset('directive', <that file's path>)`. Passing the
 *    RESOLVED path rather than the bare name is what makes P3.3's pinned
 *    `built-in directives cannot be removed` fire instead of the primitive's generic refusal; task-042's
 *    reviewer recorded that name→path gap as this task's hand-off. Since `task-057` a fresh project
 *    really does carry six built-ins, so the scenario is exercised against the real scaffold.
 * 5. **REQ-SEC-06** — {@link requireConfinedTarget}, step 4's filesystem-level companion
 *    (`task-102`, `bug-044`). `requireCustomAsset` judges the path's *shape* and is right to pass
 *    `directives/custom/<name>.md`; only `realpath` knows that a symlinked `custom/` puts that file
 *    outside the project entirely. Before this ran, the verb unlinked the outside file for real and
 *    then failed on `git add` with a raw `Command failed: git …` — a destroyed file, an unmapped
 *    error, and nothing recorded. The check is here, ahead of every mutation, because the order
 *    *is* the property: a refusal issued after the deletion is a report, not a guard.
 * 6. **REQ-SEC-07 clause (b)** — {@link checkUnreferenced} over the `roles.yaml` committed at `HEAD`:
 *    a role (or `global`) that still binds the id refuses the removal, naming the referrer. It
 *    resolves that baseline itself (task-096, `bug-086`, `dl-080` (B)); there is no working-tree
 *    pre-load to pass it, because an **uncommitted** deletion of the reference used to be enough to
 *    destroy a file the committed `roles.yaml` still bound. A `roles.yaml` absent from `HEAD` still
 *    means "no bindings yet" (task-051/053), not a failure. Note the interaction with step 4: a custom
 *    file SHADOWING a built-in is removable, so removing it changes which file wins resolution — that
 *    is dl-037's precedence working as specified, and the built-in is left byte-identical.
 * 7. **Delete + commit** — `removeDocument` then `commitPaths` on the ONE scoped path, producing
 *    exactly one commit `wf(directive): remove <name>`; the sha rides `CoreResult.commit`, the same
 *    shape every other mutating op returns. `commitPaths` stages with `git add -- <path>`, which
 *    records the deletion, and commits with `git commit --only -- <path>` (bug-027), so nothing else
 *    a caller had staged is swept in.
 *
 * `roles.yaml` is never written: P3.3 refuses a still-assigned directive rather than unbinding it, so
 * this operation has no interaction with the comment-preserving `roles.yaml` writer at all.
 */
const directiveRemoveFn: CoreFn<unknown, DirectiveRemoveResult> = async (params) => {
  const { root, positional: name } = params as DirectiveRemoveParams;

  if (name === undefined || name.trim().length === 0) {
    throw new UsageError('missing required argument: directive remove <name>');
  }

  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity;

  const inventory = loadOrError(() => loadDirectiveInventory(root));
  if (!inventory.ok) return inventory;
  const target = selectDirectivesById(inventory.value.files, new Set([name])).byId.get(name);
  if (target === undefined) {
    // task-143: the entry asked for may be one the loader skipped (a dangling link, an unreadable
    // file), so its warnings ride this refusal's `details` — the channel both surfaces render
    // (task-130) — rather than a stderr line from core, which `--format json` cannot carry.
    const { warnings } = inventory.value;
    return coreErr({
      code: 'NOT_FOUND',
      message: `unknown directive: ${name}`,
      ...(warnings.length > 0 ? { details: { issues: warnings.map((detail) => ({ detail })) } } : {}),
    });
  }

  const custom = requireCustomAsset('directive', target.path);
  if (!custom.ok) return custom;

  // `DirectiveFile.path` is built with the PLATFORM separator (`join('directives', …)` in
  // `./loaders.ts`), so re-spell it with `/` for the value we return and the path we stage — git
  // speaks POSIX separators, and the payload must not differ by platform (REQ-SYS-07).
  const relativePath = ['.wingfoil', ...target.path.split(/[\\/]/)].join('/');
  // REQ-SEC-06 / bug-044: `requireCustomAsset` above judged the SHAPE of that path and passed it,
  // correctly — every segment is inside the project. Only the filesystem knows that a symlinked
  // `custom/` puts the file itself outside. This is the companion clause, and it stands here, next
  // to its string-level sibling and ahead of every mutation, because the bug was order: the shipped
  // verb unlinked the outside file and reported afterwards.
  const confined = requireConfinedTarget(root, relativePath, 'remove');
  if (!confined.ok) return confined;

  const referrer = checkUnreferenced(root, name);
  if (referrer) return coreErr(referrer);

  // dl-080 (B) / bug-078: staging a deletion discards the working-tree blob, so an uncommitted edit
  // to the directive being removed does not ride into the commit — it is DESTROYED, reaching no
  // commit anywhere. Different harm, same rule: the target carries modifications this operation does
  // not own, so refuse and let the author decide what to do with them.
  const unmodified = requireUnmodifiedTarget(root, relativePath);
  if (!unmodified.ok) return unmodified;

  removeDocument(join(root, relativePath));
  const message = `wf(directive): remove ${name}`;
  const sha = commitPaths(root, [relativePath], message);
  const leaked = committedScopeError(root, sha, relativePath, null);
  if (leaked) return leaked;
  return coreOk({ name, path: relativePath }, { sha, message });
};

/**
 * `directives list` `CoreOperation.fn` (P3.4, `mutates: false` — spec-006 §3 directives table). Wraps
 * `loadDirectiveListing` (`./directives-list.ts`, which carries the annotation rules and the
 * rationale for not deduplicating shadowed ids) in the same `loadOrError` mapping every read-only
 * pillar query uses, so a schema-invalid directive file or `roles.yaml` is a `VALIDATION` domain
 * failure (exit 1), never a throw.
 *
 * This replaces the bare `wrapReadOnly(loadDirectives)` registration task-006 wired in: the payload
 * keeps every field that registration returned (`path`, `frontmatter`, per entry, unchanged) and adds
 * the role annotation P3.4 requires. Since task-055 (dl-042) the value is `{ entries, warnings }`.
 */
const directivesListFn: CoreFn<unknown, DirectiveListing> = async (params) => {
  const { root, options } = params as DirectivesListParams;
  // task-143 (bug-154): with no `.wingfoil/` the loaders read nothing and the listing came back empty,
  // exit 0 — under `--role`, with a "no directives assigned" warning nothing was read to establish.
  const initialized = requireInitializedProject(root);
  if (!initialized.ok) return initialized;
  return loadOrError(() => loadDirectiveListing(root, options?.role));
};

/**
 * The production `CoreModule` registry (spec-006 §2, §4). `src/cli`'s command registrar and
 * `src/mcp`'s Tool/Resource registrar both import this exact array — see spec-006 §4.1: "no
 * duplicated or hand-copied operation list in either surface module".
 *
 * SCOPE (task-006-dual-interface-shared-core, see the task's Execution Notes for the full
 * rationale): only the core functions that already legitimately exist are wired in here today —
 * task-004's three read-only per-pillar loaders that have a natural spec-006 §3 counterpart
 * (`dnaShow`, `directivesList`, `workflowList` — all `mutates: false`), plus
 * task-028-implement-paths-category's `paths` (P2.5, `wingfoil paths [category]`) — the first FLAT,
 * no-verb command (`deriveVerb('paths', 'paths') === ''`, spec-008-cli-grammar §1) and the first to
 * declare a `--list` flag (`CoreOperation.flags`, `./registry.ts`); its `category` rides the same
 * generic bare-positional seam `dna show`'s `section` does (task-026's `ParamsContext.positional`),
 * so no per-operation positional metadata is needed here. `loadMemoryYaml`
 * is deliberately NOT registered as a `memory` module operation: it loads the Memory *pillar's own
 * config* (`memory.yaml`'s types/state-machines), a different concept from spec-006 §3's `memory`
 * module (which operates on Memory *documents* — `memoryAdd`, `memorySearch`, ...); registering it
 * under a `memoryXxx` name would misrepresent it as the latter. As of
 * task-025-implement-dna-set the registry has its FIRST mutating operation — `dna.dnaSet`
 * (`mutates: true`, P2.1); `memory.memoryAdd` (P1.3, task-020), `directive.directiveCreate`
 * (P3.1, task-050), `directive.directiveAssign` (P3.2, task-051) and `memory.memorySubmit` (P1.6,
 * task-045) have since joined it, and the remaining spec-006 §3 mutating functions
 * (`memoryApprove`, `directiveRemove`, `workflowStart`, ...) are still later tasks' scope. The
 * REQ-SYS-05 parity test in `test/core/parity.test.ts` runs against this exact array, so it is now a
 * live regression guard: each of those mutating ops must appear as both a CLI command and an MCP
 * Tool, or the diff fails.
 */
export const CORE_MODULES: readonly CoreModule[] = [
  {
    name: 'dna',
    description: "read and change dna.yaml, the project's structural map",
    operations: {
      // The DNA mutation surface (task-093, `dl-081-dna-mutation-surface-shape` option (E)): three
      // verbs carrying the collection in their argument rather than in the verb name, so the verb
      // count stays constant as `spec-002`'s schema grows and spec-006 §3's one-Tool-per-function rule
      // costs three Tools (`dna.add`, `dna.remove`, `dna.update`) instead of the dozen a
      // per-collection verb set would need. The path itself is the POSITIONAL `<path>` every command
      // in this CLI uses for its target (`dl-082-cli-parameter-shape`): each verb declares it as its
      // `positional` (task-120, what `--help` names), which is why no option declares it here.
      dnaAdd: {
        name: 'dnaAdd',
        mutates: true,
        description: 'add an entry to a collection, or values to a list',
        positional: { name: 'path', required: true, description: 'the collection (e.g. team.members) or list (e.g. paths.sources) to add to', refusesExtraItself: true },
        options: [DNA_VALUE_OPTION, ...DNA_ENTRY_OPTIONS],
        example: 'wingfoil dna add team.members --value "Ada Lovelace" --entry-email ada@example.com --entry-roles approver',
        fn: dnaAddFn,
      },
      // `remove` declares no entry-field options: it takes what to drop, never what to write.
      dnaRemove: {
        name: 'dnaRemove',
        mutates: true,
        description: 'remove a collection entry, or values from a list',
        positional: { name: 'path', required: true, description: 'the entry to remove (<collection>.<name>), or the list to remove the --value values from', refusesExtraItself: true },
        options: [DNA_VALUE_OPTION],
        example: 'wingfoil dna remove paths.docs --value README.md',
        fn: dnaRemoveFn,
      },
      // The FIRST `mutates: true` operation in production (spec-006 §3 dna table) — by construction an
      // MCP Tool (`dna.set`) + CLI command (`wingfoil dna set`), and the op the REQ-SYS-05 parity test
      // now actually guards (task-025-implement-dna-set). Its second positional became `--value` in
      // task-093 (`dl-082`) — a breaking change to a shipped command, made before `minor-v0.2` ships.
      dnaSet: {
        name: 'dnaSet',
        mutates: true,
        description: 'set one scalar field',
        positional: { name: 'path', required: true, description: 'the dotted path of the scalar field, e.g. project.name (double-quote a segment that contains a dot)', refusesExtraItself: true },
        options: [DNA_SET_VALUE_OPTION],
        example: 'wingfoil dna set project.name --value "My Project"',
        fn: dnaSetFn,
      },
      dnaShow: {
        name: 'dnaShow',
        mutates: false,
        description: 'print dna.yaml, or one top-level section of it',
        positional: { name: 'section', description: 'a top-level key: project, modules, stacks, team or paths (omit it for the whole file)' },
        example: 'wingfoil dna show project',
        fn: dnaShowFn,
      },
      dnaUpdate: {
        name: 'dnaUpdate',
        mutates: true,
        description: 'change fields of an existing collection entry',
        positional: { name: 'path', required: true, description: 'the entry (<collection>.<name>), or one of its fields (<collection>.<name>.<field>) with --value', refusesExtraItself: true },
        options: [DNA_VALUE_OPTION, ...DNA_ENTRY_OPTIONS],
        example: 'wingfoil dna update modules.api --entry-description "Public HTTP API"',
        fn: dnaUpdateFn,
      },
    },
  },
  {
    name: 'memory',
    description: 'create Memory documents, move them through their state machine, and read them back',
    operations: {
      // The FIRST Memory-document mutation (P1.3, spec-006 §3 memory table) — `mutates: true`, so by
      // construction an MCP Tool (`memory.add`) + CLI command (`wingfoil memory add`), and the second
      // op the REQ-SYS-05 parity test now guards (alongside `dna.set`). It declares the value-bearing
      // `--type`/`--title`/`--tags` options (task-020's `CoreOperation.options` seam, reused by
      // task-021). `loadMemoryYaml` (the Memory *pillar config* loader) is deliberately NOT registered
      // here — it is a different concept from this `memory` module, which operates on Memory *documents*.
      memoryAdd: {
        name: 'memoryAdd',
        mutates: true,
        description: "create a document in its type's initial state (draft) from the type's template",
        options: [
          { name: 'type', required: true, valueName: 'type', description: 'the Memory type, as the committed memory.yaml declares it' },
          { name: 'title', required: true, valueName: 'title', description: 'the document title; also the source of the {slug} token' },
          { name: 'tags', valueName: 't1,t2', description: 'comma-separated tags, written as the tags list' },
          // task-110, `spec-008-cli-grammar` §10 (`dl-107` S2): the value of an id_pattern/path token,
          // written into the frontmatter field of that name. One declared option — not one derived
          // option per field, whose first member, `--version`, is a global action flag.
          {
            name: 'set',
            repeatable: true,
            valueName: 'name=value',
            description:
              'fill the id_pattern/path token {name} and write the frontmatter field of that name (repeatable)',
          },
        ],
        example: 'wingfoil memory add --type task --title "My first task" --tags demo,quickstart',
        fn: memoryAddFn,
      },
      // P1.10 (task-049-memory-history) — `mutates: false`, so by construction an MCP Resource +
      // CLI command (`wingfoil memory history <id>`). It declares no flags and no value options: the
      // document id rides the generic bare `positional` seam (task-026), per spec-008-cli-grammar §7's
      // bare-`<id>` rule for a command whose noun already scopes the type.
      memoryHistory: {
        name: 'memoryHistory',
        mutates: false,
        description: "print a document's audit trail, reconstructed from git",
        positional: { name: 'id', required: true, description: 'the document id, e.g. task-001-my-first-task' },
        example: 'wingfoil memory history task-001-my-first-task',
        fn: memoryHistoryFn,
      },
      // The FIRST Memory-document READ operation (P1.5, spec-006 §3 memory table) — `mutates: false`,
      // so by construction an MCP Resource (`wingfoil://memory/search`, the mechanical zero-argument
      // form spec-006 §3 pins verbatim) + CLI command (`wingfoil memory search`). Its keyword rides the
      // generic bare `positional` seam (task-026); `--tag`/`--status`/`--type` are OPTIONAL value
      // options (task-020's seam) — none is `required`, since the AC/BDD only mandate the bare keyword
      // form and the `--tag` filter (task-021-implement-memory-search's Execution Notes).
      memorySearch: {
        name: 'memorySearch',
        mutates: false,
        description: 'find documents by keyword and/or metadata',
        positional: { name: 'keyword', description: 'a case-insensitive substring matched against title, id, tags and body (omit it to filter by metadata alone)' },
        options: [
          { name: 'tag', valueName: 'tag', description: 'keep documents carrying this tag' },
          { name: 'status', valueName: 'status', description: 'keep documents in this state' },
          { name: 'type', valueName: 'type', description: 'keep documents of this Memory type' },
        ],
        example: 'wingfoil memory search --status approved --type task',
        fn: memorySearchFn,
      },
      // P1.6 (task-045-memory-submit) — `mutates: true`: CLI `wingfoil memory submit <id>` + MCP Tool
      // `memory.submit`. The id rides the bare `positional` seam (spec-008 §7); no flags, no options.
      memorySubmit: {
        name: 'memorySubmit',
        mutates: true,
        description: "move a document one step forward along its type's sequence — for the default machine, draft → pending",
        positional: { name: 'id', required: true, description: 'the document id, e.g. task-001-my-first-task' },
        example: 'wingfoil memory submit task-001-my-first-task',
        fn: memorySubmitFn,
      },
      // P1.7 (task-046-memory-approve) — `mutates: true`: CLI `wingfoil memory approve <id> --reason
      // <text>` + MCP Tool `memory.approve`. The id rides the bare `positional` seam (spec-008 §7);
      // `--reason` is the one declared value option, `required` per spec-008 §2 / REQ-SEC-04 (the
      // declaration is metadata — `memoryApproveFn` does the enforcing, via `requireReason`).
      memoryApprove: {
        name: 'memoryApprove',
        mutates: true,
        description: 'pass a gate: move a document forward from a gated state (default machine: pending → approved)',
        positional: { name: 'id', required: true, description: 'the document id, e.g. task-001-my-first-task' },
        options: [{ name: 'reason', required: true, valueName: 'text', description: "why you approve it, recorded as the commit's Reason:; needs the approver role" }],
        example: 'wingfoil memory approve task-001-my-first-task --reason "Scope and acceptance criteria are clear."',
        fn: memoryApproveFn,
      },
      // P1.8 (task-047-memory-reject) — `mutates: true`: CLI `wingfoil memory reject <id> --reason
      // <text>` + MCP Tool `memory.reject`. The FIRST approver-gated operation (REQ-SEC-03) and the
      // first with a `required` value option: `required` is declarative metadata only (Commander
      // registers every declared option the same way), so `memoryRejectFn` enforces it via
      // `requireReason` (REQ-SEC-04, task-041). The id rides the bare `positional` seam (spec-008 §7).
      memoryReject: {
        name: 'memoryReject',
        mutates: true,
        description: "send a gated document back to its gate's reject target (default machine: pending → draft)",
        positional: { name: 'id', required: true, description: 'the document id, e.g. task-001-my-first-task' },
        options: [{ name: 'reason', required: true, valueName: 'text', description: "what must change before resubmitting, recorded as the commit's Reason: and as rejection_reason; needs the approver role" }],
        example: 'wingfoil memory reject task-001-my-first-task --reason "Add acceptance criteria before resubmitting."',
        fn: memoryRejectFn,
      },
      // P1.9 (task-048-memory-deprecate) — `mutates: true`: CLI `wingfoil memory deprecate <id>
      // [--reason <text>]` + MCP Tool `memory.deprecate`. `--reason` is declared WITHOUT `required`,
      // unlike `memoryReject`'s: `spec-008` §2 and `dl-027-req-sec-04-deprecate-reason-scope`
      // (option (a), already applied to REQ-SEC-04) make it optional on this verb, which is not an
      // approval gate. The id rides the bare `positional` seam (spec-008 §7).
      memoryDeprecate: {
        name: 'memoryDeprecate',
        mutates: true,
        description: 'retire a document, from any state, to deprecated',
        positional: { name: 'id', required: true, description: 'the document id, e.g. task-001-my-first-task' },
        options: [{ name: 'reason', valueName: 'text', description: "why the document is retired, recorded as the commit's Reason: (not blank when given)" }],
        example: 'wingfoil memory deprecate dl-001-use-postgresql --reason "Superseded by the hosted-DB decision."',
        fn: memoryDeprecateFn,
      },
      // task-127 (`dl-108`) — `mutates: true`: CLI `wingfoil memory amend <id> --reason <text>` + MCP
      // Tool `memory.amend`. Approver-gated like `memoryApprove`, so `--reason` is `required`
      // (metadata; `memoryAmendFn` enforces it via `requireReason`). The id rides the bare
      // `positional` seam (spec-008 §7), which also gives it task-129's surplus-operand refusal.
      memoryAmend: {
        name: 'memoryAmend',
        mutates: true,
        description: 'record an uncommitted correction to a document as an amendment, leaving its state unchanged',
        positional: { name: 'id', required: true, description: 'the document id, e.g. spec-001-storage-layout' },
        options: [
          {
            name: 'reason',
            required: true,
            valueName: 'text',
            description: "why the document is corrected, recorded as the commit's Reason:; needs the approver role",
          },
        ],
        example: 'wingfoil memory amend spec-001-storage-layout --reason "Later measurements corrected the §2 figures."',
        fn: memoryAmendFn,
      },
    },
  },
  {
    name: 'directives',
    description: 'list the directives and the roles they apply to',
    operations: {
      directivesList: {
        name: 'directivesList',
        mutates: false,
        description: 'list directives with the roles each is assigned to',
        options: [{ name: 'role', valueName: 'role', description: 'keep only the directives that apply to this role, globals included' }],
        example: 'wingfoil directives list --role developer',
        fn: directivesListFn,
      },
    },
  },
  {
    name: 'paths',
    operations: {
      // Self-named (operation name === module name) — the flat/no-verb `wingfoil paths [category]`
      // form (see `deriveVerb`, `./registry.ts`), not `wingfoil paths paths`. `category` rides the
      // generic bare positional (task-026's seam), declared as `positional` so `--help` names it.
      paths: {
        name: 'paths',
        mutates: false,
        description: 'print the resource paths declared in dna.yaml paths:',
        positional: { name: 'category', description: 'sources, tests, docs, config, governance or runs (omit it for the whole map)' },
        flags: [{ name: 'list', description: 'accepted for the planned drill-down view; it does not change the output yet' }],
        example: 'wingfoil paths sources',
        fn: pathsFn,
      },
    },
  },
  {
    name: 'workflow',
    description: 'read the workflows the project declares (there is no workflow engine yet)',
    operations: {
      workflowList: {
        name: 'workflowList',
        mutates: false,
        description: 'print the workflow manifest (workflows.yaml) and every workflow it includes, with their phases',
        example: 'wingfoil workflow list',
        fn: wrapReadOnly<WorkflowsLoadResult>(loadWorkflowsYaml),
      },
    },
  },
  // task-050-directive-create (P3.1). A `directive` (SINGULAR) module, DISTINCT from the `directives`
  // module above, because `CoreModule.name` IS the wire-visible `wingfoil <noun>` segment
  // (`buildCliCommands`, `src/cli/registrar.ts`) and the `{module}.{verb}` MCP Tool name
  // (`deriveMcpToolName`, `src/mcp/registrar.ts`) — and the P3 pillar deliberately exposes TWO nouns:
  // `wingfoil directive create|assign|remove` (BDD P3.1/P3.2/P3.3; spec-008-cli-grammar §1 lists the
  // noun as singular `directive`) alongside `wingfoil directives list` (BDD P3.4). spec-006 §3's own
  // directives table pins both spellings on adjacent rows (`wingfoil directive create` + Tool
  // `directive.create`; `wingfoil directives list` + Resource `wingfoil://directives/list`). Filing
  // `directiveCreate` under the plural module would instead derive `wingfoil directives
  // directive-create` (`deriveVerb` kebab-cases the whole name when it does not start with the module
  // name), contradicting all of the above — so a second module is what realizes the approved contract
  // without touching `deriveVerb` or either registrar. Placed last purely to keep this task's diff off
  // the concurrently-edited `directives` block; `enumerateOperations` sorts, so position is inert.
  {
    name: 'directive',
    description: 'create, assign and remove custom directives',
    operations: {
      // The FIRST Directives-pillar mutation (P3.1) — `mutates: true`, so by construction an MCP Tool
      // (`directive.create`) + CLI command (`wingfoil directive create`), and the third op the
      // REQ-SYS-05 parity test guards (alongside `dna.set` and `memory.add`). `--name` is declared
      // `required` as metadata; `directiveCreateFn` itself enforces it (throwing a `UsageError` →
      // exit 2), matching `memoryAdd`'s `--type`/`--title` precedent.
      directiveCreate: {
        name: 'directiveCreate',
        mutates: true,
        description: 'create a custom directive from a scaffold',
        options: [{ name: 'name', required: true, valueName: 'name', description: 'the new directive, written to .wingfoil/directives/custom/<name>.md' }],
        example: 'wingfoil directive create --name api-style',
        fn: directiveCreateFn,
      },
      // P3.2 (task-051-directive-assign) — on this SINGULAR module per dl-041 B, so `deriveVerb` yields
      // `assign`: CLI `wingfoil directive assign`, Tool `directive.assign`.
      directiveAssign: {
        name: 'directiveAssign',
        mutates: true,
        description: 'assign one or more directives to a role in roles.yaml',
        options: [
          { name: 'directive', required: true, valueName: 'name[,name...]', description: 'the directive(s) to assign, comma-separated' },
          { name: 'role', required: true, valueName: 'role', description: 'the role to assign them to, as the committed dna.yaml declares it' },
        ],
        // task-169 (`dl-062` Q1 option 3): the opt-in to the whole-file rewrite the in-place editor
        // would otherwise refuse. A per-command flag, documented in spec-008 §12, not §2.
        flags: [{ name: 'force', description: 'rewrite the whole roles.yaml when it cannot be edited in place (comments and formatting are not kept)' }],
        example: 'wingfoil directive assign --directive api-style --role developer',
        fn: directiveAssignFn,
      },
      // P3.3 (task-052-directive-remove) — on this SINGULAR module per dl-041 B, so `deriveVerb`
      // yields `remove`: CLI `wingfoil directive remove <name>`, Tool `directive.remove`. It declares
      // no flags and no value options: the name rides the bare `positional` seam (spec-008 §7), like
      // `memory submit <id>`. Completes REQ-SEC-07 for the directive surface (clause (a) via
      // task-042's `requireCustomAsset`, clause (b) via `checkUnreferenced` — dl-030).
      directiveRemove: {
        name: 'directiveRemove',
        mutates: true,
        description: 'delete a custom directive',
        positional: { name: 'name', required: true, description: 'the custom directive to delete (built-in directives cannot be removed)' },
        example: 'wingfoil directive remove api-style',
        fn: directiveRemoveFn,
      },
    },
  },
];
