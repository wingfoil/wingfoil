/**
 * The adapter manifest's placeholders (`spec-016` §2.3, task-177): a **closed** set, each filling one
 * or more **whole** argv elements, never part of one (`dl-090` Q3 (a): "argv, no shell. … Interpolation
 * fills whole arguments only"), and each legal only in the fields §2.3 lists.
 *
 * This module only checks a manifest; it renders nothing. Rendering is `agent execute`'s (§3.3
 * step 10), a later task's.
 */
import type { z } from 'zod';

import type { ValidationIssue } from '../validation';

import type { AdapterManifest } from './schema';

/** `spec-016` §2.3's placeholder names, in the table's order. Nothing else is a placeholder. */
export const ADAPTER_PLACEHOLDERS = [
  'bootstrap',
  'bootstrap_file',
  'mcp_config_file',
  'mcp_command',
  'mcp_args',
  'session_id',
] as const;

/** One of {@link ADAPTER_PLACEHOLDERS}. */
export type AdapterPlaceholder = (typeof ADAPTER_PLACEHOLDERS)[number];

/** The `E_*` code of every placeholder issue (`spec-009` §3). */
export const E_ADAPTER_PLACEHOLDER = 'E_ADAPTER_PLACEHOLDER';

/**
 * A `{name}` token in `mcp.template`. The name class is lower-case words joined by `_`, the shape of
 * every §2.3 name, so the braces of a JSON body (`{"mcpServers": …}`) are never read as a placeholder.
 */
const TEMPLATE_TOKEN_RE = /\{([a-z][a-z0-9_]*)\}/g;

/**
 * A `{name}` token in every other field (argv elements, scalars). Wider than {@link TEMPLATE_TOKEN_RE}
 * (task-177 review F1): letters of either case, digits, `_`, `-` and spaces, so a misspelt placeholder
 * (`{Bootstrap}`, `{boot-strap}`, `{bootstrap }`) is refused as unknown instead of reaching the agent
 * as a literal argument. Quotes and colons stay outside the class: no argv field holds JSON.
 */
const FIELD_TOKEN_RE = /\{([A-Za-z0-9_\- ]+)\}/g;

/** Where each placeholder is legal, as §2.3's "Legal in" column says it — the text of a refusal. */
const LEGAL_IN: Readonly<Record<AdapterPlaceholder, string>> = {
  bootstrap: 'launch.*.args, when prompt.via is arg',
  bootstrap_file: 'launch.*.args, when prompt.via is file',
  mcp_config_file: 'launch.*.args, when mcp.via is config-file',
  mcp_command: 'mcp.template, and launch.*.args when mcp.via is args',
  mcp_args: 'mcp.template, and launch.*.args when mcp.via is args',
  session_id:
    'session.assign_args and session.resume.args, and session.lookup_args or usage.lookup_args only when session.id is assign',
};

/** The manifest as Pass 1 accepted it (defaults not yet applied; they change nothing checked here). */
type ManifestInput = z.input<typeof AdapterManifest>;

/** Every `{name}` token `pattern` finds in `text`, in order of appearance. */
function tokensOf(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1]!);
}

function isPlaceholder(name: string): name is AdapterPlaceholder {
  return (ADAPTER_PLACEHOLDERS as readonly string[]).includes(name);
}

/**
 * The issues of one string field. `legal` is the set of placeholders the field may hold;
 * `wholeElement` is true for an argv element, where a placeholder must be the entire element;
 * `template` is true for `mcp.template` only, whose JSON braces call for the narrow token class.
 */
function fieldIssues(
  value: string,
  path: string,
  file: string,
  legal: ReadonlySet<AdapterPlaceholder>,
  wholeElement: boolean,
  template = false,
): ValidationIssue[] {
  const tokens = tokensOf(value, template ? TEMPLATE_TOKEN_RE : FIELD_TOKEN_RE);
  const issues: ValidationIssue[] = [];
  const issue = (message: string): void => {
    issues.push({ code: E_ADAPTER_PLACEHOLDER, path, file, message });
  };
  if (wholeElement && tokens.length > 0 && value !== `{${tokens[0]!}}`) {
    issue(`a placeholder fills a whole argv element, never part of one: ${JSON.stringify(value)} (spec-016 §2.3, dl-090 Q3 (a))`);
  }
  for (const token of tokens) {
    if (!isPlaceholder(token)) {
      issue(`unknown placeholder {${token}}: the set is closed, {${ADAPTER_PLACEHOLDERS.join('}, {')}} (spec-016 §2.3)`);
    } else if (!legal.has(token)) {
      issue(`placeholder {${token}} is not legal here: it is legal in ${LEGAL_IN[token]} (spec-016 §2.3)`);
    }
  }
  return issues;
}

/** The issues of an optional argv field, one element at a time (`<path>.<index>`). */
function argvIssues(
  args: readonly string[] | undefined,
  path: string,
  file: string,
  legal: ReadonlySet<AdapterPlaceholder>,
): ValidationIssue[] {
  return (args ?? []).flatMap((element, index) => fieldIssues(element, `${path}.${index}`, file, legal, true));
}

/**
 * Every §2.3 violation in `manifest`, in field order: an unknown placeholder, a placeholder concatenated
 * inside an argv element, and a placeholder used outside the fields — or under the conditions — §2.3
 * lists. Fields §2.3 does not list (`command`, `verified_with`, `version_args`, `session.field`,
 * `usage.fields`, `summary.export_args`) hold no placeholder at all.
 *
 * @param manifest - A manifest Pass 1 has accepted.
 * @param file - The label every issue carries (`<rev>:<path>`).
 */
export function placeholderIssues(manifest: ManifestInput, file: string): ValidationIssue[] {
  const none = new Set<AdapterPlaceholder>();
  const launch = new Set<AdapterPlaceholder>();
  if (manifest.prompt.via === 'arg') launch.add('bootstrap');
  if (manifest.prompt.via === 'file') launch.add('bootstrap_file');
  if (manifest.mcp.via === 'config-file') launch.add('mcp_config_file');
  if (manifest.mcp.via === 'args') {
    launch.add('mcp_command');
    launch.add('mcp_args');
  }
  const sessionId = new Set<AdapterPlaceholder>(['session_id']);
  // Under `output` or `lookup` the id is not known before the lookup runs (§2.3).
  const lookup = manifest.session.id === 'assign' ? sessionId : none;
  const template = new Set<AdapterPlaceholder>(['mcp_command', 'mcp_args']);
  const fields = manifest.usage.fields ?? {};

  return [
    ...fieldIssues(manifest.command, 'command', file, none, false),
    ...(manifest.verified_with === undefined ? [] : fieldIssues(manifest.verified_with, 'verified_with', file, none, false)),
    ...argvIssues(manifest.version_args, 'version_args', file, none),
    ...argvIssues(manifest.launch.interactive.args, 'launch.interactive.args', file, launch),
    ...argvIssues(manifest.launch.headless?.args, 'launch.headless.args', file, launch),
    ...(manifest.mcp.template === undefined ? [] : fieldIssues(manifest.mcp.template, 'mcp.template', file, template, false, true)),
    ...argvIssues(manifest.session.assign_args, 'session.assign_args', file, sessionId),
    ...argvIssues(manifest.session.lookup_args, 'session.lookup_args', file, lookup),
    ...(manifest.session.field === undefined ? [] : fieldIssues(manifest.session.field, 'session.field', file, none, false)),
    ...argvIssues(manifest.session.resume.args, 'session.resume.args', file, sessionId),
    ...argvIssues(manifest.usage.lookup_args, 'usage.lookup_args', file, lookup),
    ...(['model', 'input', 'output', 'cache_read', 'cache_write'] as const).flatMap((key) => {
      const value = fields[key];
      return value === undefined ? [] : fieldIssues(value, `usage.fields.${key}`, file, none, false);
    }),
    ...argvIssues(manifest.summary?.export_args, 'summary.export_args', file, none),
  ];
}
