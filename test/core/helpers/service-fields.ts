/**
 * The repository-level checks on a `service` element's fields that no product code enforces yet
 * (`task-269`, `dl-163` S3b).
 *
 * `dl-163` R8 keeps the consumer feedback loop out of the product in v0.3: it runs through
 * configuration and repository tests, and declared value sets are enforced by the product only from
 * v0.4 (`bug-195`). Until then these functions are the check, applied to every committed `service`
 * document by `test/core/service-repository-kind.test.ts`. A later repository test (`dl-163` S3c, the
 * `reported_by:` check) can reuse them to tell whether a service has a valid feedback inbox.
 *
 * Pure functions: no file system, no git, no clock (REQ-SYS-07).
 */

/** The `kind` a service with a feedback inbox must have (`dl-163` S3b: one service per repository). */
export const REPOSITORY_KIND = 'repository';

/**
 * Why a `service`'s `feedback_inbox` value is refused, in a fixed order; `[]` when it is accepted.
 *
 * The field is optional: absent or `""` is accepted on every kind. A value is accepted only on a
 * `kind: repository` service, and only as a repository-relative folder path (`dl-163` R1, e.g.
 * `docs/wingfoil-feedback/`): `/` separators, no leading `/`, `\`, `~` or drive letter, no empty, `.`
 * or `..` segment, and a trailing `/`.
 *
 * @param fields - The service document's frontmatter, as parsed YAML.
 */
export function feedbackInboxProblems(fields: Readonly<Record<string, unknown>>): string[] {
  const value = fields.feedback_inbox;
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') return ['feedback_inbox must be a string'];
  const problems: string[] = [];
  if (fields.kind !== REPOSITORY_KIND) problems.push(`feedback_inbox is allowed only on a kind: ${REPOSITORY_KIND} service`);
  if (/^([/\\~]|[A-Za-z]:)/.test(value)) problems.push('feedback_inbox must be repository-relative, not absolute');
  if (value.includes('\\')) problems.push('feedback_inbox must use / as its separator');
  if (!value.endsWith('/')) problems.push('feedback_inbox must name a folder, ending in /');
  const segments = value.replace(/\/$/, '').split(/[/\\]/);
  if (segments.includes('..')) problems.push('feedback_inbox must not contain a .. segment');
  if (segments.some((segment) => segment === '' || segment === '.')) {
    problems.push('feedback_inbox must not contain an empty or . segment');
  }
  return problems;
}
