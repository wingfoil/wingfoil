/**
 * The two refusals that are `memory amend`'s own (task-127, `dl-108` A1 (a) and A3). The rest of the
 * verb — usage checks, git identity, locating the document, approval authority, the one-file commit —
 * is shared with the transition verbs; see `memoryAmendFn` in `./index.ts`.
 *
 * An amendment is the one Memory operation whose content comes from the author rather than from the
 * verb: the author edits the document, then `amend` records that edit under an approver's name. So
 * the questions are about the edit — is there one, is the type open to one, and does it stay inside
 * what an amendment owns (`spec-010` § Field-write ownership: the body and every frontmatter field
 * except those in {@link AMEND_RESERVED_FIELDS}).
 */
import { describeDocumentChanges, resolveStateMachine, type MemoryYaml } from '../memory';
import { readPathAtRev, WINGFOIL_DIR } from '../storage';

import { readTemplateFrontmatter } from './memory-add-type';
import { requireRequiredFields } from './required-fields';
import { coreErr, coreOk, type CoreResult } from './types';

/**
 * The frontmatter fields an amendment may not change. A refusal names them in sorted order
 * (`describeDocumentChanges`). Each has another owner:
 * - `status` belongs to the transition verbs;
 * - `id` and `type` locate the element and select its path and machine, so changing either is a new
 *   element, not a correction to this one;
 * - `release` belongs to `assign` (`element.set_release`, approver ruling 2026-10-01) — but only on a
 *   type whose committed scaffold declares it; see {@link amendReservedFields};
 * - `rejection_reason` belongs to `reject` (and is cleared by `submit`);
 * - `supersedes` is the trigger of the `superseded` edge, read when the element is approved
 *   (`src/core/memory-supersede.ts`, task-162).
 * The last three are the approver's ruling (b) at `task-127`'s review, 2026-10-01; the condition on
 * `release` is the approver's ruling of 2026-10-01 at `task-170` (`bug-166`, option (A)).
 */
export const AMEND_RESERVED_FIELDS: readonly string[] = ['id', 'rejection_reason', 'release', 'status', 'supersedes', 'type'];

/** The one reserved field whose reservation depends on the type: see {@link amendReservedFields}. */
const ASSIGN_OWNED_FIELD = 'release';

/**
 * The frontmatter of the type's scaffold as committed at `HEAD`, read by the reader `memory add` uses
 * ({@link readTemplateFrontmatter}, task-257, `bug-243`): `null` when there is no scaffold to read — no
 * `template.file`, not committed, or no parseable frontmatter mapping — and the `dl-149` refusal when
 * it declares a `format` this build does not read.
 */
function committedScaffoldFrontmatter(root: string, memoryYaml: MemoryYaml, type: string): CoreResult<Record<string, unknown> | null> {
  const file = memoryYaml.types[type]?.template?.file;
  if (file === undefined) return coreOk(null);
  const path = `${WINGFOIL_DIR}/${file}`;
  const scaffold = readPathAtRev(root, 'HEAD', path);
  if (scaffold === null) return coreOk(null);
  return readTemplateFrontmatter(type, scaffold, `HEAD:${path}`);
}

/**
 * Whether the type's scaffold, as committed at `HEAD`, declares a `release` frontmatter field. `null`
 * when there is no scaffold to read, or it cannot be read ({@link requireReadableScaffold} refuses
 * that case before this answer is used).
 */
function committedScaffoldDeclaresRelease(root: string, memoryYaml: MemoryYaml, type: string): boolean | null {
  const fields = committedScaffoldFrontmatter(root, memoryYaml, type);
  if (!fields.ok || fields.value === null) return null;
  return Object.prototype.hasOwnProperty.call(fields.value, ASSIGN_OWNED_FIELD);
}

/**
 * Refuse a type whose scaffold, as committed at `HEAD`, `memory add` would refuse to read: a `format`
 * newer than this build reads (`E_INVALID_FORMAT`) or not a positive integer (`dl-149`; task-257,
 * `bug-243`) — `VALIDATION`, exit `1`, with `memory add`'s own message, before anything is written.
 * `amend` reads that scaffold to decide which fields it owns ({@link amendReservedFields}), and does
 * not apply today's rule to a template shape this build may not understand. No scaffold to read is
 * not a refusal: `release` then stays reserved.
 */
export function requireReadableScaffold(root: string, memoryYaml: MemoryYaml, type: string): CoreResult<undefined> {
  const fields = committedScaffoldFrontmatter(root, memoryYaml, type);
  return fields.ok ? coreOk(undefined) : fields;
}

/**
 * The fields an amendment of a `type` document may not change: {@link AMEND_RESERVED_FIELDS}, except
 * `release` when the type's scaffold committed at `HEAD` (`template.file` of the committed
 * `memory.yaml`, `command-baseline`) does not declare a `release` field.
 *
 * `release` is reserved because `assign` owns it, and `assign` owns it only on the types that carry it
 * with the `traceability` directive's meaning, the release the element's implementation is assigned
 * to. The scaffold is where a type declares the fields its documents carry. A type whose scaffold has
 * no `release` (`service`, since `task-170` named its set-up release `set_up_in`) has no assign-owned
 * `release`, so a `release` key left on one of its documents is a leftover an amendment may remove.
 * With no readable committed scaffold nothing shows the field is unowned, and it stays reserved.
 * Sorted, as {@link AMEND_RESERVED_FIELDS} is (REQ-SYS-07).
 */
export function amendReservedFields(root: string, memoryYaml: MemoryYaml, type: string): readonly string[] {
  if (committedScaffoldDeclaresRelease(root, memoryYaml, type) !== false) return AMEND_RESERVED_FIELDS;
  return AMEND_RESERVED_FIELDS.filter((field) => field !== ASSIGN_OWNED_FIELD);
}

/**
 * Refuse a type whose committed `memory.yaml` entry does not declare `amendable: true` (`dl-108` A3,
 * `spec-001`). `memoryYaml` is the copy committed at `HEAD` that `prepareMemoryTransition` resolved
 * (`command-baseline`): an uncommitted `amendable: true` cannot open a type to amendment.
 */
export function requireAmendableType(memoryYaml: MemoryYaml, type: string): CoreResult<undefined> {
  const declared = memoryYaml.types[type]?.amendable;
  if (declared === true) return coreOk(undefined);
  const why = declared === false ? 'declares amendable: false' : 'does not declare amendable: true';
  return coreErr({ code: 'VALIDATION', message: `type '${type}' is not amendable: its memory.yaml entry ${why}` });
}

/**
 * Refuse a working-tree document that is not an amendment of its committed self: no commit holds it,
 * it carries no change, or the change touches a field in `reserved` (the type's
 * {@link amendReservedFields}). `content` is the document as read from the working tree, which is
 * what the commit will record.
 *
 * The comparison is against `HEAD`, the committed baseline. That is also what keeps the subject's
 * `[s → s]` bracket true: `status` is the same on both sides, so the state the bracket names is the
 * committed one.
 */
export function requireAmendableEdit(
  root: string,
  id: string,
  path: string,
  content: string,
  reserved: readonly string[],
): CoreResult<undefined> {
  const committed = readPathAtRev(root, 'HEAD', path);
  if (committed === null) {
    return coreErr({
      code: 'VALIDATION',
      message:
        `nothing to amend: ${path} is not committed at HEAD — an amendment corrects a recorded document; ` +
        'a new one is recorded by memory add and memory submit',
    });
  }
  if (committed === content) {
    return coreErr({ code: 'VALIDATION', message: `nothing to amend: ${path} carries no uncommitted change` });
  }
  const owned = new Set(reserved.map((field) => `frontmatter field '${field}'`));
  const touched = describeDocumentChanges(committed, content).filter((change) => owned.has(change));
  if (touched.length > 0) {
    return coreErr({
      code: 'VALIDATION',
      message:
        `refusing to amend ${id}: the working-tree edit changes ${touched.join(', ')}, which an amendment does not ` +
        'own — status is a transition verb\'s, release is assign\'s, rejection_reason is reject\'s, supersedes is ' +
        'the supersede trigger\'s, and a new id or type is a new element; undo that change, then retry',
    });
  }
  return coreOk(undefined);
}

/**
 * Refuse an amendment that would leave a non-draft document violating `spec-010` § Validation rules:
 * `title` and every `template.frontmatter.required` field must be non-empty once `status` is past the
 * type's initial state (task-127 review F1). The rule is `memory submit`'s own
 * (`requireRequiredFields`, declared not-applicable values included — task-168), applied to the
 * edited frontmatter, because an amendment is the one other
 * verb that writes those fields. "Draft" is read as the machine's initial state (`sequence[0]`),
 * which is `draft` for every type `spec-001` declares.
 */
export function requireRequiredFieldsKept(
  memoryYaml: MemoryYaml,
  type: string,
  state: string,
  frontmatter: Readonly<Record<string, unknown>>,
): CoreResult<undefined> {
  if (state === resolveStateMachine(memoryYaml, type).sequence[0]) return coreOk(undefined);
  return requireRequiredFields(memoryYaml, type, frontmatter, 'amend');
}
