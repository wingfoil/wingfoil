/**
 * Machine-readable output formats (spec-005-cli-command-contract §2, REQ-INT-05). `console` is the
 * default when `--format` is omitted.
 */
import { dump as yamlDump } from 'js-yaml';

/** The accepted `--format` values (spec-005 §2); `console` is the default when the flag is omitted. */
export type OutputFormat = 'console' | 'json' | 'yaml';

/** Type guard: `true` (narrowing to {@link OutputFormat}) when `value` is one of the accepted `--format` values. */
export function isValidFormat(value: string): value is OutputFormat {
  return value === 'console' || value === 'json' || value === 'yaml';
}

/**
 * The reason an unrecognised `--format` value is refused with (spec-005 §2), without the `error: `
 * prefix: one composer for every command, the derived ones (`./registrar.ts`) and the bootstrap ones
 * (`./program.ts`, `./init-command.ts`), so the line cannot drift between them (task-179, `bug-226`).
 */
export function invalidFormatReason(value: string): string {
  return `invalid --format value "${value}", expected one of: console, json, yaml`;
}

/**
 * Render a successful `CoreResult.value` to stdout text, per the envelope rules in spec-005 §2:
 * `json`/`yaml` carry only the structured payload (no banners/colour). `console` has no human
 * rendering yet: it prints `json`'s payload indented by two spaces, with no colour, as spec-008 §2
 * declares, until P5.1.4 gives it one (`dl-043`, v0.4; task-156, `bug-152`). That change is meant to
 * be visible: `test/cli/console-format-fallback.integration.test.ts` pins today's bytes.
 */
export function renderSuccess(value: unknown, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(value) + '\n';
  if (format === 'yaml') return yamlDump(value);
  return JSON.stringify(value, null, 2) + '\n';
}
