/**
 * Role ↔ directive binding support — the `roles.yaml`-facing half of the Directives pillar's
 * commands. It began as `wingfoil directive assign`'s support module (task-051-directive-assign,
 * P3.2), whose two pieces were built so that `directive remove` (P3.3, task-052) and
 * multi-directive assignment (P3.7, task-056) would not re-derive them; it now holds **three**
 * pieces, because P3.3 turned out to need a different one:
 *
 * **What `directive remove` actually uses.** It uses {@link checkUnreferenced} — which task-052
 * *contributed* here, it did not inherit it — and it uses **neither** of the two task-051 pieces.
 * Not {@link checkAssignable}: a removal has no role argument to validate. And, importantly, **not**
 * {@link updateRoleAssignments}: P3.3 Scenario 2 *refuses* a still-assigned directive rather than
 * unbinding it, so a removal has no `roles.yaml` write to make at all and never reaches the
 * `setRoleAssignmentsInText` → fallback path below. (Correcting task-051's original prediction, which
 * `dl-062-roles-yaml-unwritable-fallback` quotes from this doc range as evidence that P3.3 would be a
 * second consumer of that fallback decision. It is not.)
 *
 * **What P3.7 actually uses — now an observed fact, no longer a prediction.**
 * `task-056-role-based-directive-assignment` shipped multi-directive assignment (P3.7, US-4-06) as a
 * comma-separated `--directive` on the *same* `directive assign` verb — it registers no operation of
 * its own — and it reuses **both** task-051 pieces **without a single change to this file**:
 * {@link checkAssignable} already took a list and validated every id before anything was written
 * (which is exactly P3.7 Sc.3's "no partial assignment is persisted"), and
 * {@link updateRoleAssignments} already took an arbitrary `update` function. So P3.7 *is* the second
 * consumer of the fallback decision that `dl-062-roles-yaml-unwritable-fallback` is about — it reaches
 * the `setRoleAssignmentsInText` → fallback path below on exactly the same inputs `directive assign`
 * always did, no more and no fewer.
 *
 * - {@link checkAssignable} — the pre-write validation: the role must be defined in `dna.yaml`
 *   (REQ-SYS-08, via task-034's binding resolver `isRoleDefined`/`UnknownRoleError` — never the
 *   approval-authority module, dl-033) and every directive id must exist under
 *   `.wingfoil/directives/**` **as committed at `HEAD`** (built-in or custom alike: assignment binds
 *   by id and modifies no asset, dl-037/dl-030). Both halves read the committed repository since
 *   task-096 (`bug-086`); everything is checked before anything is written, so a request is applied
 *   whole or not at all.
 * - {@link checkUnreferenced} — the mirror-image pre-write validation for `directive remove` (P3.3,
 *   task-052): REQ-SEC-07 clause (b), refusing to remove a directive any role — or `global` — still
 *   binds, naming the referrer.
 * - {@link updateRoleAssignments} — the ONE read → edit → validate → write → commit path for
 *   `.wingfoil/roles.yaml`. It edits through the comment-preserving `setRoleAssignmentsInText`
 *   (`src/directives/roles-edit.ts`). When that cannot apply, the result is `CONFLICT` whether or not
 *   the file has a comment, and the whole-file `dump` runs only when the caller passes `force`
 *   (`wingfoil directive assign --force`), with a success warning naming what it normalizes. That is
 *   `dl-062` Q1 option 3 (`ready`, approve commit `4cd1876`), implemented by task-169; the refusal and
 *   the warning are pinned in `spec-008` §6. It replaced a `#`-gated split that rewrote a comment-free
 *   file silently at exit 0. A missing `roles.yaml` is still written whole without the flag: there is
 *   nothing to preserve.
 *
 * Lives in `src/core` (not `src/directives`) for the same reason `directives-list.ts` does: it
 * operates on `DirectiveFile` (`./loaders`) and returns `CoreResult`s, so a `src/directives` home
 * would need a `core → directives → core` cycle.
 */
import { join } from 'path';

import { dump } from 'js-yaml';

import { isRoleDefined, UnknownRoleError } from '../dna/roles';
import type { DnaYaml } from '../dna/schema';
import { setRoleAssignmentsInText } from '../directives/roles-edit';
import { RolesYaml } from '../directives/schema';
import { commitPaths, documentExists, readDocument, writeDocument } from '../storage';
import { parseYaml, toValidationError, ValidationError } from '../validation';

import { requireConfinedWriteTarget } from './confinement';
import {
  DIRECTIVES_DIR_PATH,
  DNA_YAML_PATH,
  loadDirectivesAtHead,
  loadDnaYaml,
  loadDnaYamlAtHead,
  loadRolesYamlAtHead,
  ROLES_YAML_PATH,
  type DirectiveFile,
} from './loaders';
import type { CoreError, CoreResult } from './types';
import { coreErr, coreOk } from './types';
import { committedScopeError, requireUnmodifiedTarget } from './write-guard';

/**
 * The `CONFLICT` reason when `setRoleAssignmentsInText` cannot edit `roles.yaml` in place and the
 * caller did not pass `force` (task-169, `dl-062` Q1 option 3). Pinned in `spec-008` §6.
 */
export function rolesRewriteConflict(role: string): string {
  return `roles.yaml cannot be updated in place; edit assignments.${role} by hand, or pass --force to rewrite the whole file`;
}

/**
 * The warning a `force`d whole-file rewrite of an existing `roles.yaml` carries on its success
 * (task-169, `dl-062` Q1 option 3: "the stderr warning enumerating the normalizations"). Pinned in
 * `spec-008` §6. It names what a `js-yaml` `dump` of the parsed file does not keep, which `dl-062`'s
 * Context measured: comments, explicit quoting, the blank lines, CRLF line endings, and the
 * `version: 1.0` → `1` number formatting, plus flow style (the dump writes block style). It does not
 * name key order, which the dump keeps, and it says comments "are not kept" rather than "were
 * dropped", which would be false of a file that had none (task-169 review).
 */
export const ROLES_REWRITE_WARNING =
  'roles.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, ' +
  'blank lines, line endings or number formatting (1.0 becomes 1)';

/** The outcome of {@link updateRoleAssignments}: the role's list as it stands afterwards. */
export interface RoleAssignmentUpdate {
  /** `assignments.<role>` after the update (unchanged when nothing needed writing). */
  readonly assignments: readonly string[];
}

/**
 * A second sentence for the unknown-role refusal, appended **only** when the *working tree's*
 * `dna.yaml` does define the role — the same diagnostic shape as `task-090`'s `workingTreeWouldGrant`
 * (`./approval-authority.ts`): it tells a user whose editor shows the role why the tool disagrees,
 * instead of leaving them to argue with the file on their screen. Any failure to read or parse the
 * working-tree file is simply "no", so it can never change an outcome owned by `HEAD`.
 */
function workingTreeWouldDefine(root: string, role: string): boolean {
  try {
    return isRoleDefined(loadDnaYaml(root), role);
  } catch {
    return false;
  }
}

/**
 * Validate an assignment request before anything is written. The role is checked first (it is the
 * binding's target and the REQ-SYS-08 check), then each id in argument order; the first failure wins.
 *
 * **The role catalogue is read from the `dna.yaml` committed at `HEAD`**, never from the working tree
 * (task-091, `bug-082-directive-assign-validates-role-against-worktree`,
 * `dl-080-which-baseline-each-command-reads` option (B)). This function therefore takes `root`, not a
 * `DnaYaml`: a caller cannot hand it a working-tree catalogue even by accident, which is what makes
 * the committed baseline a property of the read rather than of a precondition someone must remember
 * to run. An uncommitted role used to be enough to commit a `roles.yaml` binding to a role no commit
 * of the repository defines — a dangling reference by construction, since **REQ-SYS-08** binds
 * directives by role and every other clone sees the binding without the role.
 *
 * The cost was measured and accepted at `dl-080`'s ratification: extending the catalogue becomes
 * *edit, commit, then assign*. `dl-081`/`task-093` are building the `dna` verbs that fold the first
 * two steps into one command; nothing here waits on them.
 *
 * Two fail-closed refusals come with the baseline, mirroring `requireApprovalAuthority`'s: no
 * committed `dna.yaml` at all, and a committed one that does not parse or validate.
 *
 * **The directive inventory is read the same way**, since task-096 /
 * `bug-086-directive-inventory-read-from-the-worktree` — `loadDirectivesAtHead`, the tree at `HEAD`.
 * task-091 left this half on the files on disk and offered a boundary for it (the role catalogue is
 * *governance*, the directive file is the *asset*); its reviewer showed the boundary does not hold,
 * and `bug-086` settles that what actually separated them was **cost**: reading the inventory at a
 * revision needs a directory listing at a revision, which `src/storage` did not have. It has one now
 * (`listPathsAtRev`), so the parameter is gone too and the two halves of this one function read one
 * baseline. Before that, an untracked directive file produced a committed `roles.yaml` binding to a
 * directive present in no commit.
 *
 * An absent or empty committed inventory needs no special case: no id is known, so every request is
 * refused with `unknown directive: <id>`. That is the right answer rather than a tolerated one — "may
 * this id be bound" needs the *positive* fact that a directive with it exists, and a missing record
 * cannot supply one. (Contrast {@link checkUnreferenced}, which needs the *absence* of a fact and is
 * therefore satisfied by a missing record.)
 *
 * @param root - Project root; both committed baselines are read from it.
 * @param role - The role to bind to.
 * @param ids - The directive ids to bind.
 * @returns `undefined` when assignable; otherwise an error carrying P3.2's exact message verbatim as
 *   its first sentence — `unknown role '<role>' (not defined in dna.yaml)` or
 *   `unknown directive: <id>` — or, for an absent/unreadable committed catalogue or an unreadable
 *   committed directive file, a `VALIDATION` refusal naming the baseline.
 */
export function checkAssignable(root: string, role: string, ids: readonly string[]): CoreError | undefined {
  let committed: DnaYaml | null;
  try {
    committed = loadDnaYamlAtHead(root);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return {
      code: 'VALIDATION',
      message:
        `cannot resolve the role catalogue: the committed '${DNA_YAML_PATH}' (at HEAD) is not readable as DNA: ` +
        `${error.message}. A role binding is validated against the catalogue the repository records (dl-080), so the ` +
        'committed file must be valid; fix it and commit the fix, then retry.',
      details: { issues: error.issues },
    };
  }
  if (committed === null) {
    return {
      code: 'VALIDATION',
      message:
        `cannot resolve the role catalogue: '${DNA_YAML_PATH}' is not committed at HEAD. A binding must reference a ` +
        `role the repository records, not one a working tree holds (REQ-SYS-08, dl-080); commit '${DNA_YAML_PATH}' ` +
        'first, then retry.',
    };
  }

  if (!isRoleDefined(committed, role)) {
    const uncommittedRole = workingTreeWouldDefine(root, role)
      ? ` — the working tree's '${DNA_YAML_PATH}' defines it, but that change is not committed, and a binding is ` +
        `validated against the committed catalogue (REQ-SYS-08, dl-080); commit '${DNA_YAML_PATH}' first, then retry`
      : '';
    return { code: 'NOT_FOUND', message: `${new UnknownRoleError(role).message}${uncommittedRole}` };
  }

  let inventory: readonly DirectiveFile[];
  try {
    inventory = loadDirectivesAtHead(root);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return {
      code: 'VALIDATION',
      message:
        `cannot resolve the directive inventory: a file committed under '${DIRECTIVES_DIR_PATH}' (at HEAD) is not ` +
        `readable as a directive: ${error.message}. A binding is validated against the directives the repository ` +
        'records (dl-080), so the committed files must be valid; fix it and commit the fix, then retry.',
      details: { issues: error.issues },
    };
  }
  const known = new Set(inventory.map((file) => file.frontmatter.id));
  const unknown = ids.find((id) => !known.has(id));
  return unknown === undefined ? undefined : { code: 'NOT_FOUND', message: `unknown directive: ${unknown}` };
}

/**
 * REQ-SEC-07 clause (b) for the Directives surface — *"removal of a still-referenced custom asset is
 * rejected naming the referrer"* — assigned to `task-052-directive-remove` by
 * `dl-030-req-sec-07-referenced-asset-ownership` (`ready`, option (b)). The counterpart to
 * {@link checkAssignable}: that one guards a binding being *made*, this one guards an asset being
 * removed while a binding still names it. It lives here for the same reason, over the same
 * `roles.yaml` shape.
 *
 * `roles.yaml` binds by directive **`frontmatter.id`** (`src/directives/schema.ts`'s `RolesYaml`), so
 * the comparison is against the id, never the filename.
 *
 * Two referrer kinds, checked in this order:
 *
 * 1. A role whose own `assignments` entry names the id → P3.3's verbatim message
 *    `cannot remove '<id>': still assigned to role '<role>'`
 *    (`p3-directives/P3.3-directive-remove.feature`, "Error - removing a directive still referenced"
 *    — do not reword). When several roles bind it the **alphabetically first** is named: the message
 *    must be a pure function of the file's content, never of YAML mapping order (REQ-SYS-07), and
 *    `directives-list.ts` already walks role names in the same ascending order.
 * 2. `roles.yaml`'s `global` list, which binds the directive to *every* role
 *    (`spec-012-context-loader-relevance-filtering` §5) and is therefore the strongest reference of
 *    all. `[AUTHORING]`: P3.3 pins only the per-role wording, and a global binding cannot be phrased
 *    in it without naming a role the file does not name — so the message is
 *    `cannot remove '<id>': still assigned to every role via roles.yaml 'global'`. Recorded in
 *    `task-052-directive-remove`'s Execution Notes and raised for ratification, not assumed settled.
 *
 * A directive referenced from a *workflow* step is deliberately not checked: `src/workflow/schema.ts`
 * has no field that can reference a directive, so P3.3's "or workflow step" precondition is vacuous
 * today, and P4.9's workflow half of clause (b) has no owner in v0.2 per `dl-030`.
 *
 * **The bindings are read from the `roles.yaml` committed at `HEAD`**, never from the working tree
 * (task-096, `bug-086-directive-inventory-read-from-the-worktree`, `dl-080` option (B)). This
 * function therefore takes `root`, not a `RolesYaml`: a caller cannot hand it a working-tree copy
 * even by accident, which is what makes the committed baseline a property of the read. Before that,
 * deleting the two `- <id>` lines **without committing** was enough to walk past this check entirely
 * and **destroy** a file the committed `roles.yaml` still bound — on the only verb in the system that
 * deletes an artefact, and against the one clause REQ-SEC-07 (b) exists to enforce.
 *
 * A `roles.yaml` that is **not committed at all** is still "no bindings yet" (task-051/task-053's
 * reading) and permits the removal. That is not a fail-open tolerance: this check needs the *negative*
 * fact *nothing names this id*, and a record that does not exist answers it. (Contrast
 * {@link checkAssignable}, which needs a positive fact and therefore refuses when its record is
 * missing.) A committed `roles.yaml` that does not **validate** is the genuinely unanswerable case,
 * and it refuses.
 *
 * @param root - Project root; the committed `roles.yaml` is read from it (`loadRolesYamlAtHead`).
 * @param id - The directive id about to be removed.
 * @returns `undefined` when nothing references it; otherwise a `CONFLICT` error (exit 1) carrying the
 *   message above. `CONFLICT` and not `VALIDATION`: the request is well-formed and the *state*
 *   refuses it — the same distinction `directiveCreate` draws for `directive already exists: <name>`,
 *   as against `requireCustomAsset`'s `VALIDATION` for a request inadmissible on its own terms. An
 *   unreadable committed `roles.yaml` is `VALIDATION`, naming the baseline.
 */
export function checkUnreferenced(root: string, id: string): CoreError | undefined {
  let rolesYaml: RolesYaml | null;
  try {
    rolesYaml = loadRolesYamlAtHead(root);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return {
      code: 'VALIDATION',
      message:
        `cannot resolve the directive bindings: the committed '${ROLES_YAML_PATH}' (at HEAD) is not readable as ` +
        `role assignments: ${error.message}. Whether an asset may be deleted is answered from the bindings the ` +
        'repository records (REQ-SEC-07, dl-080), so the committed file must be valid; fix it and commit the fix, ' +
        'then retry.',
      details: { issues: error.issues },
    };
  }
  if (rolesYaml === null) return undefined;
  // `Object.entries` (own enumerable properties only) + an explicit ascending sort, never YAML
  // mapping order — REQ-SYS-07, and the same walk `directives-list.ts` uses.
  const [boundRole] = Object.entries(rolesYaml.assignments)
    .filter(([, ids]) => ids.includes(id))
    .map(([role]) => role)
    .sort((a, b) => (a < b ? -1 : 1));
  if (boundRole !== undefined) {
    return { code: 'CONFLICT', message: `cannot remove '${id}': still assigned to role '${boundRole}'` };
  }
  if (rolesYaml.global.includes(id)) {
    return { code: 'CONFLICT', message: `cannot remove '${id}': still assigned to every role via roles.yaml 'global'` };
  }
  return undefined;
}

function validationError(error: ValidationError): CoreResult<never> {
  return coreErr({ code: 'VALIDATION', message: error.message, details: { issues: error.issues } });
}

/** Parse and schema-check `roles.yaml` text, as a plain object (for re-serialization) plus its typed view. */
function parseRoles(text: string, filePath: string): CoreResult<{ raw: Record<string, unknown>; roles: RolesYaml }> {
  let raw: unknown;
  try {
    raw = parseYaml(text, filePath);
  } catch (error) {
    // `parseYaml` wraps every YAML syntax failure in a `ValidationError` and throws nothing else
    // (`src/validation/yaml.ts`).
    return validationError(error as ValidationError);
  }
  const parsed = RolesYaml.safeParse(raw);
  if (!parsed.success) return validationError(toValidationError(parsed.error, filePath));
  return coreOk({ raw: raw as Record<string, unknown>, roles: parsed.data });
}

/**
 * Apply `update` to `assignments.<role>` in `.wingfoil/roles.yaml` and commit the result as ONE commit
 * staging only that file.
 *
 * - A missing `roles.yaml` means "no bindings yet" (task-053's reading) and is created with a
 *   deterministic `dump` — there is nothing to preserve.
 * - An unchanged list is an idempotent success: nothing is written and no commit is made.
 * - The edit goes through `setRoleAssignmentsInText`, keeping every comment and unrelated line. When it
 *   cannot apply, the result is `CONFLICT` ({@link rolesRewriteConflict}) and the file is left
 *   untouched, unless `options.force` authorizes the whole-file `dump`; that success then carries
 *   {@link ROLES_REWRITE_WARNING} (`dl-062` Q1 option 3, task-169). `force` authorizes the rewrite,
 *   it does not demand it: an edit the in-place editor can make is still made in place, unwarned.
 * - No second schema pass on the output is needed: the in-place edit is only accepted when its
 *   re-parse equals the validated input with `assignments.<role>` replaced by a string list
 *   (`setRoleAssignmentsInText`'s self-check), and the whole-file `dump` serializes exactly that object.
 *
 * Commits through `commitPaths`, which since bug-027's fix (`git commit --only -- <paths>`) records
 * exactly the path it is given and leaves anything else staged untouched.
 *
 * @param root - Project root.
 * @param role - The role whose list is updated (already validated by the caller).
 * @param update - Pure function from the current list to the desired list.
 * @param message - The commit subject.
 * @param options - `force`: authorize the whole-file rewrite when the in-place edit cannot apply.
 * @returns The role's resulting list, with the commit when one was made and the rewrite warning when
 *   `force` was used.
 * @throws whatever `git` raises inside `commitPaths`.
 */
export function updateRoleAssignments(
  root: string,
  role: string,
  update: (current: readonly string[]) => readonly string[],
  message: string,
  options: { readonly force: boolean },
): CoreResult<RoleAssignmentUpdate> {
  // dl-080 (B) / bug-078: refuse while `roles.yaml` carries modifications this operation does not
  // own — otherwise an unrelated uncommitted edit rides into `wf(directive): assign <id> to <role>`,
  // whose subject names only the binding. Before the read, so the refusal cannot depend on a value
  // the dirty copy contributed. An ABSENT `roles.yaml` is clean (porcelain reports nothing), which is
  // what keeps the first `directive assign` on a fresh project working.
  // REQ-SEC-06 / bug-121 (task-172): `writeDocument` follows a symlinked `roles.yaml`; one that leads
  // outside the project, or is itself a link, is refused before any read or write.
  const confined = requireConfinedWriteTarget(root, ROLES_YAML_PATH, 'write');
  if (!confined.ok) return confined;
  const unmodified = requireUnmodifiedTarget(root, ROLES_YAML_PATH);
  if (!unmodified.ok) return unmodified;

  const filePath = join(root, ROLES_YAML_PATH);
  const exists = documentExists(filePath);
  const text = exists ? readDocument(filePath) : '';

  let raw: Record<string, unknown> = { version: 1, assignments: {}, global: [] };
  let current: readonly string[] = [];
  if (exists) {
    const parsed = parseRoles(text, filePath);
    if (!parsed.ok) return parsed;
    raw = parsed.value.raw;
    current = Object.prototype.hasOwnProperty.call(parsed.value.roles.assignments, role)
      ? (parsed.value.roles.assignments[role] as string[])
      : [];
  }

  const next = update(current);
  if (JSON.stringify(next) === JSON.stringify(current)) return coreOk({ assignments: current });

  const wholeFile = (): string =>
    dump({ ...raw, assignments: { ...(raw.assignments as Record<string, unknown>), [role]: next } }, { lineWidth: -1 });
  let serialized = exists ? setRoleAssignmentsInText(text, role, next) : wholeFile();
  const warnings: string[] = [];
  if (serialized === undefined) {
    if (!options.force) return coreErr({ code: 'CONFLICT', message: rolesRewriteConflict(role) });
    serialized = wholeFile();
    warnings.push(ROLES_REWRITE_WARNING);
  }

  writeDocument(filePath, serialized);
  const sha = commitPaths(root, [ROLES_YAML_PATH], message);
  const leaked = committedScopeError(root, sha, ROLES_YAML_PATH, serialized);
  if (leaked) return leaked;
  return coreOk({ assignments: next }, { sha, message }, warnings);
}
