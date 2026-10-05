/**
 * `memory add`'s type resolution, against the repository **as committed at `HEAD`**
 * (task-095-memory-add-resolves-its-type-at-head, `bug-085`,
 * `dl-080-which-baseline-each-command-reads` option (B): *a read that gates an operation resolves
 * against the repository as committed at `HEAD`*).
 *
 * `memory add` asks three questions of its configuration before it writes anything — does this type
 * exist, where do its files land, and which scaffold does it copy — and every one of them used to be
 * answered from the working tree. An uncommitted `types:` entry was therefore enough to produce a
 * *committed* element of a type no commit defines, and that element is **unreachable** afterwards:
 * `memory submit` and `memory deprecate` both answer `document not found` and `memory search --type`
 * finds nothing, which is indistinguishable from the element never having been created while the
 * commit sits in the history.
 *
 * The shape follows `task-091`'s, by the one move this call site allows. That task removed the
 * `MemoryYaml` **parameter** from `prepareMemoryTransition` and `checkAssignable`, so no caller could
 * hand either a working-tree document even by accident. `memoryAddFn` had no such parameter to
 * remove — the working-tree copy arrived through a `loadMemoryYaml(root)` call the verb made itself
 * — so the equivalent is to move the whole decision **behind** {@link resolveAddType}, which takes a
 * root and a type name and nothing else. The verb now holds no `MemoryYaml` at all, and there is no
 * argument through which a working-tree registry could reach the decision. That property is enforced
 * by the type checker rather than by a precondition someone must remember to run.
 *
 * @see `src/core/memory-transition.ts` for the same rule on the four state-transition verbs.
 */
import { join } from 'path';

import { MemoryTemplateFrontmatter, type MemoryYaml, type TemplateConfig } from '../memory';
import { documentExists, extractFrontmatter, readPathAtRev } from '../storage';
import { parseYaml, toValidationError, ValidationError } from '../validation';
import { MEMORY_TEMPLATE_FORMAT, refuseNewerFormat } from '../validation/format';

import { loadMemoryYaml, loadMemoryYamlAtHead, MEMORY_YAML_PATH } from './loaders';
import { coreErr, coreOk, type CoreResult } from './types';

/** Everything `memory add` needs about a type, all of it resolved from the same committed baseline. */
export interface ResolvedAddType {
  /** The requested type name, as registered in the committed `memory.yaml`. */
  readonly type: string;
  /** The type's `path` pattern (e.g. `docs/memory/adr/{id}.md`), from `HEAD`. */
  readonly pathPattern: string;
  /** The type's `id_pattern` (e.g. `adr-{n}-{slug}`), from `HEAD`. */
  readonly idPattern: string;
  /** The type's `template` block, from `HEAD` — its `frontmatter.required` included. */
  readonly template: TemplateConfig;
  /** Root-relative POSIX path of `template.file`, the form git wants for a revision read. */
  readonly templatePath: string;
  /** The scaffold's bytes **as committed at `HEAD`**, the text `renderAddDocument` fills in. */
  readonly scaffold: string;
}

/** The directory every `template.file` path is relative to, matching `MEMORY_YAML_PATH`'s prefix. */
const WINGFOIL_DIR = '.wingfoil' as const;

/**
 * The working tree's entry for `type`, or `undefined` — the **diagnostic** half of this module, never
 * the deciding half.
 *
 * Under a committed baseline a refusal can contradict the file open in the author's editor, and
 * `memory.yaml` is precisely the file one edits while designing a new type. So when the two copies
 * genuinely disagree *about this type*, say which one decided (`task-091`'s D5, `task-090`'s
 * `workingTreeWouldGrant`). Any failure to read or parse the working-tree file is simply "no
 * disagreement", so this can never change an outcome owned by `HEAD`.
 *
 * Note it is keyed on the type, not on the file being dirty: `memory.yaml` carrying an unrelated
 * uncommitted edit adds nothing to the message.
 */
function workingTreeEntry(root: string, type: string): { id_pattern?: string; template?: TemplateConfig } | undefined {
  try {
    return loadMemoryYaml(root).types[type];
  } catch {
    return undefined;
  }
}

/** Whether the scaffold `template.file` names is present on disk — the same disagreement test. */
function workingTreeHasScaffold(root: string, templatePath: string): boolean {
  try {
    return documentExists(join(root, templatePath));
  } catch {
    return false;
  }
}

/**
 * Resolve `type` against the `memory.yaml` **committed at `HEAD`** and return its `path`,
 * `id_pattern`, `template` and the scaffold's committed bytes.
 *
 * Refusals, all returned (never thrown) and all exit `1` (`spec-005-cli-command-contract` § 1, as
 * ruled on `bug-076`: a well-formed invocation failing a repository-state precondition is `1`, never
 * `2`). Every one of them happens **before** anything is written, so "no file is created"
 * (P1.3 sc.2) holds by construction:
 *
 * - `HEAD` holds no `memory.yaml` → `VALIDATION`, **fail-closed**. With no committed registry there
 *   is no `path` and no scaffold to create against, and the only fail-open available is the working
 *   tree, which is the defect. `wingfoil init` commits the registry *and* every scaffold it names in
 *   the scaffold commit, so no legitimate flow reaches this;
 * - the committed `memory.yaml` does not parse or validate → `VALIDATION`, same reasoning;
 * - the type is not registered → `NOT_FOUND` with P1.3 sc.2's pinned sentence
 *   `unknown memory type '<t>' (not defined in memory.yaml)`, verbatim and first;
 * - the registered type declares no `id_pattern`/`template` → `VALIDATION`, unchanged wording;
 * - `template.file` is not committed at `HEAD` → `VALIDATION`. An element copies a scaffold; copying
 *   one that exists in no commit is how `bug-085` put bytes from an untracked file into a permanent
 *   commit.
 *
 * The last three may carry a second sentence, appended only when the working tree and `HEAD` actually
 * disagree about *this type* ({@link workingTreeEntry}).
 */
export function resolveAddType(root: string, type: string): CoreResult<ResolvedAddType> {
  let committed: MemoryYaml | null;
  try {
    committed = loadMemoryYamlAtHead(root);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot resolve the memory type registry: the committed '${MEMORY_YAML_PATH}' (at HEAD) is not readable as a ` +
        `Memory configuration: ${error.message}. An element is created against the types the repository records ` +
        '(dl-080), so the committed file must be valid; fix it and commit the fix, then retry.',
      details: { issues: error.issues },
    });
  }
  if (committed === null) {
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot resolve the memory type registry: '${MEMORY_YAML_PATH}' is not committed at HEAD. An element is ` +
        'created against a type the repository records, not one a working tree holds (dl-080); commit ' +
        `'${MEMORY_YAML_PATH}' first, then retry.`,
    });
  }

  const entry = committed.types[type];
  if (!entry) {
    const uncommittedType =
      workingTreeEntry(root, type) !== undefined
        ? ` — the working tree's '${MEMORY_YAML_PATH}' defines it, but that change is not committed, and an element ` +
          `is created against the committed registry (dl-080); commit '${MEMORY_YAML_PATH}' first, then retry`
        : '';
    return coreErr({
      code: 'NOT_FOUND',
      message: `unknown memory type '${type}' (not defined in memory.yaml)${uncommittedType}`,
    });
  }

  const { path: pathPattern, id_pattern: idPattern, template } = entry;
  if (idPattern === undefined || template === undefined) {
    const live = workingTreeEntry(root, type);
    const uncommittedShape =
      live !== undefined && live.id_pattern !== undefined && live.template !== undefined
        ? ` — the working tree's '${MEMORY_YAML_PATH}' gives it both, but that change is not committed; commit ` +
          `'${MEMORY_YAML_PATH}' first, then retry`
        : '';
    return coreErr({
      code: 'VALIDATION',
      message: `memory type '${type}' has no id_pattern/template in memory.yaml${uncommittedShape}`,
    });
  }

  const templatePath = `${WINGFOIL_DIR}/${template.file}`;
  const scaffold = readPathAtRev(root, 'HEAD', templatePath);
  if (scaffold === null) {
    const tail = workingTreeHasScaffold(root, templatePath)
      ? `; the working tree holds it, but that file is in no commit — commit '${templatePath}' first, then retry`
      : `; add '${templatePath}' and commit it, then retry`;
    return coreErr({
      code: 'VALIDATION',
      message:
        `cannot read the scaffold for memory type '${type}': '${templatePath}' is not committed at HEAD. An element ` +
        `copies the scaffold the repository records, not one a working tree holds (dl-080)${tail}.`,
    });
  }

  const unreadable = templateFormatRefusal(type, scaffold, `HEAD:${templatePath}`);
  if (unreadable) return unreadable;

  return coreOk({ type, pathPattern, idPattern, template, templatePath, scaffold });
}

/**
 * The template's `format` check (`dl-149`, task-251), or `null` when the scaffold may be copied: a
 * format newer than this build reads is refused for its format alone (`E_INVALID_FORMAT`), and a
 * `format` that is not a positive integer is refused as a schema error naming the field — both
 * `VALIDATION`, exit 1, before anything is written. A scaffold with no frontmatter, or one that is not
 * YAML, is left as it was before the key existed: `renderAddDocument` refuses the first, and the second
 * is copied as text.
 */
function templateFormatRefusal(type: string, scaffold: string, label: string): CoreResult<never> | null {
  const frontmatter = extractFrontmatter(scaffold);
  if (frontmatter === null) return null;
  let data: unknown;
  try {
    data = parseYaml(frontmatter, label);
  } catch {
    return null;
  }
  try {
    refuseNewerFormat(data, MEMORY_TEMPLATE_FORMAT, label);
    const parsed = MemoryTemplateFrontmatter.safeParse(data ?? {});
    if (!parsed.success) throw toValidationError(parsed.error, label);
  } catch (error) {
    const refusal = error as ValidationError;
    return coreErr({
      code: 'VALIDATION',
      message: `cannot read the scaffold for memory type '${type}': ${refusal.message}`,
      details: { issues: refusal.issues },
    });
  }
  return null;
}
