/**
 * The one CLI renderer for warnings (task-169, `dl-062` Q1 option 3; the shape is `spec-016` §3.4's,
 * pinned for every command in `spec-008` §6).
 *
 * A warning is **stderr only**, under every `--format`, so the payload on stdout is the same with and
 * without it (`spec-005` §2: stdout carries only the payload). Its shape follows the format, as an
 * error's does (`./error.ts`):
 *
 * - `console`: `warning: <text>`, beside the `error: ` prefix. A continuation line of a multi-line
 *   warning is indented, so no line of it can begin with the greppable `warning: ` or `error: `.
 * - `json`: one `{"warning": "<text>"}` document per line.
 * - `yaml`: one `warning: <text>` YAML document per warning, opened by `---` and closed by `...`, so
 *   every warning is a self-delimiting document: several warnings, or warnings followed by an error
 *   (`./error.ts`, whose bytes are unchanged), read as separate documents of one stream and never
 *   merge into a single mapping (task-169 review).
 *
 * Every warning on the CLI goes through here: the success-warning channel the registrar renders
 * (`CoreResult.warnings`), and any warning a command prints while it runs (`spec-016` §3.4's
 * `ExecutionContext.warnings`, task-218).
 */
import { dump as yamlDump } from 'js-yaml';

import type { OutputFormat } from './output';

/** Write one warning to stderr in the active `--format`'s shape (see the module doc). Writes only. */
export function emitWarning(text: string, opts: { format: OutputFormat }): void {
  if (opts.format === 'json') {
    process.stderr.write(JSON.stringify({ warning: text }) + '\n');
  } else if (opts.format === 'yaml') {
    process.stderr.write('---\n' + yamlDump({ warning: text }) + '...\n');
  } else {
    process.stderr.write(`warning: ${text.replace(/\n/g, '\n  ')}\n`);
  }
}

/** Write each of `warnings` to stderr, in order, through {@link emitWarning}. Writes nothing for none. */
export function emitWarnings(warnings: readonly string[] | undefined, opts: { format: OutputFormat }): void {
  for (const warning of warnings ?? []) emitWarning(warning, opts);
}

/**
 * Write one notice (task-228, `reportNotice`: `agent execute`'s launch banner, `spec-016` §3.3 step 13) to
 * stderr in the active `--format`'s shape: the bare line for `console`, `{"notice": "<text>"}` for
 * `json`, one self-delimiting YAML document for `yaml` — the shapes {@link emitWarning} uses.
 */
export function emitNotice(text: string, opts: { format: OutputFormat }): void {
  emitStderrDocument({ notice: text }, text, opts);
}

/**
 * Write one stderr message: `document` as one JSON line (`json`) or one `---`/`...` YAML document
 * (`yaml`), `consoleLine` as is (`console`). The success report of a command that writes nothing on
 * stdout (`CoreOperation.renderToStderr`, `spec-016` §3.4) goes through here too.
 */
export function emitStderrDocument(document: Readonly<Record<string, unknown>>, consoleLine: string, opts: { format: OutputFormat }): void {
  if (opts.format === 'json') process.stderr.write(JSON.stringify(document) + '\n');
  else if (opts.format === 'yaml') process.stderr.write('---\n' + yamlDump(document) + '...\n');
  else process.stderr.write(`${consoleLine}\n`);
}
