/**
 * The `format:` key (`dl-149`, task-251): which format a WingFoil file is written in — distinct from
 * `version:`, its content revision (`dl-047`). Every file kind has its own counter, declared once
 * below; an absent key reads as format `1`; a kind's format is bumped **only** on a
 * backward-incompatible change of that kind (an additive, optional field does not bump it).
 *
 * The constants sit in `src/validation` because both sides need them: each pillar's schema and loader,
 * and the `wingfoil init` scaffold in `src/storage`, which imports no pillar module.
 *
 * A reader of a file kind does two things with its constant:
 * - its Zod schema declares `format: formatField(<KIND>_FORMAT)` — an optional positive integer, so a
 *   non-integer or non-positive value is a structural error on the `format` field (spec-009 §1);
 * - its loader calls {@link refuseNewerFormat} (or {@link newerFormatIssue}) **before** the structural
 *   pass, so a file written by a newer WingFoil is refused for its format alone, with an actionable
 *   message, rather than for whatever of its content today's schema misreads.
 */
import { z } from 'zod';

import { EXIT_VALIDATION, ValidationError, type ValidationIssue } from './errors';

/** `.wingfoil/dna.yaml` (`spec-002`). */
export const DNA_YAML_FORMAT = 1 as const;
/** `.wingfoil/memory.yaml` (`spec-001`). */
export const MEMORY_YAML_FORMAT = 1 as const;
/** A Memory template's frontmatter, `.wingfoil/memory/templates/*.md` (`spec-001` `template.file`). */
export const MEMORY_TEMPLATE_FORMAT = 1 as const;
/** `.wingfoil/roles.yaml` (`spec-013`). */
export const ROLES_YAML_FORMAT = 1 as const;
/** A directive's frontmatter, `.wingfoil/directives/**\/*.md` (`spec-013`). */
export const DIRECTIVE_FORMAT = 1 as const;
/** `.wingfoil/workflows.yaml`, the Layer-1 manifest (`spec-003`). */
export const WORKFLOWS_YAML_FORMAT = 1 as const;
/** A workflow file the manifest includes, Layer 2 (`spec-003`). */
export const WORKFLOW_FORMAT = 1 as const;
/**
 * An agent adapter manifest (`spec-016` §2.2 `format`, task-177) — the first kind that carried the key.
 * Unlike the others it is required and read as a literal (`src/agent/schema.ts`).
 */
export const ADAPTER_MANIFEST_FORMAT = 1 as const;

/** `spec-009` §3's field-level code for a file written in a format this build does not read. */
export const E_INVALID_FORMAT = 'E_INVALID_FORMAT';

/** The refusal of a newer format: the file's format, the highest this build reads, and what to do. */
export function newerFormatMessage(format: unknown, highest: number): string {
  return `this file is written in format ${String(format)}; this WingFoil reads up to format ${highest}: upgrade WingFoil`;
}

/**
 * The `format:` field of a kind whose highest readable format is `highest`: optional (absent = 1),
 * a positive integer, and at most `highest`. The bound carries {@link newerFormatMessage}; it is the
 * backstop for the parses that run without a loader (`dna set`'s post-edit check, `directive
 * assign`'s `roles.yaml` edit, the built-in template check), where it surfaces as an `E_VALIDATION`.
 */
export function formatField(highest: number) {
  return z
    .number()
    .int()
    .positive()
    .max(highest, { error: (issue) => newerFormatMessage(issue.input, highest) })
    .optional();
}

/**
 * The loader pre-check's issue: `E_INVALID_FORMAT` on `format` when `data` is an object whose
 * `format` is a positive integer above `highest`, else `null`. Any other `format` value — absent, or
 * one the schema refuses (`1.5`, `0`, `"2"`) — is left to the structural pass, which names the field.
 *
 * "An older format this build no longer reads" (`dl-149` Loader) belongs here too, as a lower bound per
 * kind with a message naming the last release that read the format. No kind has one yet — every format
 * is still `1` — so it is not written; a migration command is a separate proposal (`dl-149` Action 3).
 */
export function newerFormatIssue(data: unknown, highest: number, file: string): ValidationIssue | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const format = (data as { format?: unknown }).format;
  if (typeof format !== 'number' || !Number.isInteger(format) || format <= highest) return null;
  return { code: E_INVALID_FORMAT, path: 'format', file, message: newerFormatMessage(format, highest) };
}

/**
 * Throw {@link newerFormatIssue}'s issue, if any, as a `ValidationError` at exit `1` — `spec-005` §1's
 * code for a validation failure: the file was understood, and the rule said no (`spec-009` §3).
 */
export function refuseNewerFormat(data: unknown, highest: number, file: string): void {
  const issue = newerFormatIssue(data, highest, file);
  if (issue !== null) throw new ValidationError([issue], EXIT_VALIDATION);
}
