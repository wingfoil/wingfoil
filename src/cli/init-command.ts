/**
 * `wingfoil init` command handler (task-029-implement-wingfoil-init, P5.1.1, spec-008-cli-grammar §4,
 * spec-005-cli-command-contract §1). `init` is a SPECIAL bootstrap command: it runs BEFORE any config
 * exists, so it is not a standard noun-verb `CORE_MODULES` operation that loads config first — it is
 * wired directly onto the program (see ./program.ts) and drives the `initWingfoilProject` core flow.
 *
 * `runInit` owns the spec-008 §4 prompt matrix (present/missing template x TTY/non-TTY x
 * `--interactive`) and the spec-005 §1 exit-code contract, and takes its side-effecting pieces —
 * the resolved `root`, TTY detection, the wizard `prompt`, and the `init` core function — as injected
 * `deps` so the whole matrix is unit-testable without a real TTY, readline, or git repo. The only
 * un-injected concern (a real readline prompt) lives in {@link createReadlinePrompt}, mirroring how
 * ./program.ts's `commander` wiring is the one un-unit-tested mechanical seam.
 */
import { createInterface } from 'node:readline';

import { exitCodeForResult, initWingfoilProject, type InitProjectValue } from '../core';
import { errorDetails } from '../core/error-details';
import type { CoreResult } from '../core/types';
import {
  DEFAULT_TEMPLATE,
  TEMPLATE_NAMES,
  resolveTemplate,
} from '../storage';

import { emitError } from './error';
import { exitWith } from './exit';
import { invalidFormatReason, isValidFormat, renderSuccess, type OutputFormat } from './output';

/** The parsed flag surface `runInit` acts on (global `--format`/`--interactive` + local `--template`). */
export interface InitCliOptions {
  /** `--template <name>` value, or `undefined` when the flag was omitted. */
  readonly template?: string;
  /** The negatable global `--interactive` (default `true`; `false` when `--no-interactive` was passed). */
  readonly interactive: boolean;
  /** The global `--format` value, still unvalidated (validated here, per registrar's contract). */
  readonly format: string;
}

/** Injected, side-effecting dependencies — the seam that keeps `runInit` fully unit-testable. */
export interface InitCliDeps {
  /** The resolved project (git) root the layout is written under. */
  readonly root: string;
  /** Whether stdout is a TTY (drives the spec-008 §4 prompt-vs-fail decision). */
  readonly isTTY: boolean;
  /** Ask the user one question and resolve their (raw) answer — injected so no real TTY is needed. */
  readonly prompt: (question: string) => Promise<string>;
  /** The core init flow; defaults to {@link initWingfoilProject} (overridden in tests). */
  readonly init?: (root: string, template: string) => CoreResult<InitProjectValue>;
}

/** The wizard question, listing the available templates and the default (spec-008 §4). */
function templateQuestion(): string {
  return `Select a methodology template [${TEMPLATE_NAMES.join(', ')}] (default: ${DEFAULT_TEMPLATE}): `;
}

/**
 * Decide the canonical template name to initialize with, applying the spec-008 §4 matrix. Returns the
 * canonical name on success, or `null` after it has already emitted the usage error and exited `2`
 * (the caller must stop) — so a `null` return is a terminal, already-handled state.
 */
async function selectTemplate(options: InitCliOptions, deps: InitCliDeps, format: OutputFormat): Promise<string | null> {
  // 1. --template present: resolve it (an unknown value is a usage error, exit 2).
  if (options.template !== undefined && options.template.trim() !== '') {
    const def = resolveTemplate(options.template);
    if (!def) {
      emitError(`unknown template "${options.template}", expected one of: ${TEMPLATE_NAMES.join(', ')}`, { format });
      exitWith(2);
      return null;
    }
    return def.name;
  }

  // 2. --template absent + (non-interactive OR not a TTY): fail immediately (spec-008 §4).
  if (!options.interactive || !deps.isTTY) {
    // bug-140: name the legal values, read from the registry so a new template needs no edit here.
    emitError(`missing required argument: --template (one of: ${TEMPLATE_NAMES.join(', ')})`, { format });
    exitWith(2);
    return null;
  }

  // 3. Interactive TTY: run the wizard. Empty answer -> the default template.
  const answer = (await deps.prompt(templateQuestion())).trim();
  if (answer === '') return DEFAULT_TEMPLATE;
  const def = resolveTemplate(answer);
  if (!def) {
    emitError(`unknown template "${answer}", expected one of: ${TEMPLATE_NAMES.join(', ')}`, { format });
    exitWith(2);
    return null;
  }
  return def.name;
}

/**
 * Execute `wingfoil init`. Terminates through the single spec-005 §1 exit path (`exitWith`) exactly
 * once: `2` on any usage error (invalid `--format`, unknown/omitted-required `--template`), otherwise
 * the code the core `CoreResult` maps to (`0` success / `1` already-initialized or other logic error).
 */
export async function runInit(options: InitCliOptions, deps: InitCliDeps): Promise<void> {
  // Usage error first (pre-core), same as the registrar: an invalid --format never reaches core.
  if (!isValidFormat(options.format)) {
    exitWith(2, `error: ${invalidFormatReason(options.format)}`);
    return;
  }
  const format: OutputFormat = options.format;

  const template = await selectTemplate(options, deps, format);
  if (template === null) return; // usage error already emitted + exited (2)

  const init = deps.init ?? initWingfoilProject;
  const result = init(deps.root, template);
  if (result.ok) {
    process.stdout.write(renderSuccess(result.value, format));
  } else {
    // `details` too, as every derived command does (task-130 review, spec-005 §3.1).
    emitError(result.error.message, { format, details: errorDetails(result.error) });
  }
  exitWith(exitCodeForResult(result));
}

/**
 * A real readline-backed wizard prompt (used by ./program.ts's `init` command; not unit-tested — the
 * same seam as `commander` wiring). Reads one line from stdin, resolves it, and closes the interface.
 */
export function createReadlinePrompt(): (question: string) => Promise<string> {
  return (question: string) =>
    new Promise<string>((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
}
