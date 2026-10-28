/**
 * task-331 (bug-445) — a release's required fields, read as the engine reads them.
 *
 * `test/workflow/release-kind-rule.test.ts` checks every release document against the `release-planning`
 * `define-scope` post-check (`frontmatter.required: [...] except kind for [...]`). Whether a field is filled is
 * the engine's verdict, not this helper's: `missingRequiredFields` and `notApplicableRefusals`
 * (`src/memory/submit.ts`) with the release type's `template.frontmatter.lists` and `not_applicable_allowed`
 * from `.wingfoil/memory.yaml`. So `features: []` is filled where `features` is a declared list (bug-147,
 * task-168), and a malformed or undeclared not-applicable value is refused as `memory submit` refuses it
 * (design gate D1 (a), D2 (a)). The check's own field list and exemption stay the input.
 */
import { missingRequiredFields, notApplicableRefusals } from '../../../src/memory';

/** The `define-scope` check, parsed: its required fields and the per-field exempt release ids. */
export interface RequiredCheck {
  readonly fields: readonly string[];
  readonly exempt: Readonly<Record<string, readonly string[]>>;
}

/** The release type's `template.frontmatter` declarations that decide how a field is read. */
export interface RequiredReading {
  readonly lists?: readonly string[];
  readonly not_applicable_allowed?: readonly string[];
}

/** Missing fields in the engine's order (`title` first, then the check's fields), then refused n/a values as `<field> (n/a: <problem>)`; [] when the release passes. */
export function missingCheckFields(
  id: string,
  data: Readonly<Record<string, unknown>>,
  check: RequiredCheck,
  reading: RequiredReading,
): string[] {
  const fields = check.fields.filter(
    (field) => !(Object.prototype.hasOwnProperty.call(check.exempt, field) && (check.exempt[field] ?? []).includes(id)),
  );
  const missing = missingRequiredFields(data, fields, reading.lists ?? []);
  const refused = notApplicableRefusals(data, fields, reading.not_applicable_allowed ?? []).map(
    (refusal) => `${refusal.field} (n/a: ${refusal.problem})`,
  );
  return [...missing, ...refused];
}
