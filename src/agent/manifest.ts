/**
 * Parsing one adapter manifest (`spec-016` §2.1–§2.3, task-177) through `spec-009`'s two-pass entry:
 * the YAML parse, Pass 1 the strict {@link AdapterManifest} schema, Pass 2 the rules that read several
 * fields at once — the file basename, §2.2's "required with" column, and §2.3's placeholders.
 */
import type { z } from 'zod';

import { parseYaml, runValidation, ValidationError, type ValidationIssue } from '../validation';
import { refuseNewerFormat } from '../validation/format';

import { placeholderIssues, requiredPlaceholderIssues } from './placeholders';
import { ADAPTER_MANIFEST_FORMAT, AdapterManifest } from './schema';

/** Where an adapter is declared: `built-in/` ships with the package, `custom/` is the project's (§2.1). */
export type AdapterKind = 'built-in' | 'custom';

/** The `E_*` code of a cross-field rule the manifest breaks (`spec-009` §3). */
export const E_ADAPTER_MANIFEST = 'E_ADAPTER_MANIFEST';

/** What a manifest is checked against besides its own bytes. */
export interface AdapterSource {
  /** The adapter's name — its file basename, which the manifest's `name` must equal (§2.1). */
  readonly name: string;
  /** The directory it was found in; a built-in must carry `verified_with` (§2.2). */
  readonly kind: AdapterKind;
  /** The label every issue carries, e.g. `HEAD:.wingfoil/agents/custom/fake.yaml`. */
  readonly file: string;
}

/** The manifest as Pass 1 accepted it. */
type ManifestInput = z.input<typeof AdapterManifest>;

/**
 * §2.1's basename rule and §2.2's "Req." column where it depends on another value: `mcp.template` with
 * `mcp.via: config-file`; `session.assign_args` with `session.id: assign`; `session.lookup_args` with
 * `lookup` and `session.field` with `output` or `lookup`; the same pair under `usage.from`
 * (`usage.lookup_args`, `usage.fields`); `verified_with` on a built-in. Then §2.2's one exclusion,
 * `prompt.via: stdin` beside an interactive launch.
 */
function crossFieldIssues(manifest: ManifestInput, source: AdapterSource): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ code: E_ADAPTER_MANIFEST, path, file: source.file, message });
  };
  const required = (present: boolean, path: string, when: string): void => {
    if (!present) issue(path, `required with ${when} (spec-016 §2.2)`);
  };

  if (manifest.name !== source.name) {
    issue('name', `must equal the file basename '${source.name}' (spec-016 §2.1); it is '${manifest.name}'`);
  }
  if (source.kind === 'built-in') {
    required(manifest.verified_with !== undefined, 'verified_with', 'a built-in adapter: the agent CLI version it was checked against by hand');
  }
  // Every format-1 manifest declares `launch.interactive` (it is required), and an interactive agent
  // owns stdin, so `stdin` is refused here; it becomes reachable only if a headless-only launch is.
  if (manifest.prompt.via === 'stdin') {
    issue('prompt.via', "'stdin' is legal only for a headless launch: an interactive agent owns stdin, and launch.interactive is declared (spec-016 §2.2)");
  }
  if (manifest.mcp.via === 'config-file') required(manifest.mcp.template !== undefined, 'mcp.template', 'mcp.via: config-file');

  const session = manifest.session;
  if (session.id === 'assign') required(session.assign_args !== undefined, 'session.assign_args', 'session.id: assign');
  if (session.id === 'lookup') required(session.lookup_args !== undefined, 'session.lookup_args', 'session.id: lookup');
  if (session.id === 'output' || session.id === 'lookup') {
    required(session.field !== undefined, 'session.field', `session.id: ${session.id}`);
  }
  // Resume is read from v0.4 (§7), but a manifest that declares it supported must say how (bug-234).
  if (session.resume.supported) required(session.resume.args !== undefined, 'session.resume.args', 'session.resume.supported: true');

  const usage = manifest.usage;
  if (usage.from === 'lookup') required(usage.lookup_args !== undefined, 'usage.lookup_args', 'usage.from: lookup');
  if (usage.from === 'output' || usage.from === 'lookup') {
    required(usage.fields !== undefined, 'usage.fields', `usage.from: ${usage.from}`);
  }
  return issues;
}

/**
 * Parse and validate one adapter manifest's text (`spec-016` §2.2–§2.3).
 *
 * A manifest written in a newer format than {@link ADAPTER_MANIFEST_FORMAT} is refused for its format
 * alone, before the structural pass, as the one issue `E_INVALID_FORMAT` on `format` with `dl-149`'s
 * upgrade-WingFoil message (task-200, `bug-242`) — not as whatever of its content today's schema
 * misreads. `format` stays required: an absent one is a structural error.
 *
 * @param text - The manifest's YAML, as read from the baseline the caller chose.
 * @param source - Its name, kind and file label (see {@link AdapterSource}).
 * @returns The validated manifest, `launch.interactive.terminal` defaulted to `required`.
 * @throws `ValidationError` — a YAML parse error, every Pass-1 issue, or every Pass-2 issue, each
 *   carrying `source.file`.
 */
export function parseAdapterManifest(text: string, source: AdapterSource): AdapterManifest {
  const raw = parseYaml(text, source.file);
  refuseNewerFormat(raw, ADAPTER_MANIFEST_FORMAT, source.file);
  return runValidation(AdapterManifest, raw, source.file, {
    semanticChecks: [
      () => {
        // Pass 1 has accepted `raw`, so it has the input shape.
        const manifest = raw as ManifestInput;
        const issues = [
          ...crossFieldIssues(manifest, source),
          ...placeholderIssues(manifest, source.file),
          ...requiredPlaceholderIssues(manifest, source.file),
        ];
        if (issues.length > 0) throw new ValidationError(issues);
      },
    ],
  });
}
