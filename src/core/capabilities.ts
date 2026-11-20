/**
 * The capabilities query (`spec-019`, `dl-177`; task-362, feature P5.1.5): the document `wingfoil capabilities`
 * prints and `wingfoil://capabilities` serves — the file formats a build reads, the commands it ships and the
 * capabilities it provides — so that a pack can declare what it requires and a resolver can match it before
 * installing anything.
 *
 * The document is a function of the build alone (`spec-019` §3.2, REQ-SYS-07): its inputs are the module list the
 * caller passes (`CORE_MODULES`, at call time), {@link BOOTSTRAP_COMMANDS}, `FILE_KIND_FORMATS`, {@link CAPABILITIES},
 * {@link CAPABILITIES_DOCUMENT_FORMAT} and the build identity; no clock, no environment, no current directory, no
 * project. Every list is sorted in ascending UTF-16 code-unit order, never with `localeCompare`, whose order depends
 * on the runtime's ICU data.
 *
 * This module imports `./registry` and `../validation/format` only, never `./index`, which registers the operation:
 * the module list is a parameter of {@link buildCapabilitiesDocument}, so there is no import cycle (task-354) and a
 * test can pass a reduced list (`spec-019` §9 T-7).
 */
import { FILE_KIND_FORMATS } from '../validation/format';

import { deriveVerb, enumerateOperations, type CoreModule } from './registry';

/** The format of the capabilities document itself (`spec-019` §3.1, §5): bumped only by a change a reader cannot absorb. */
export const CAPABILITIES_DOCUMENT_FORMAT = 1 as const;

/**
 * The commands `buildProgram` wires outside `CORE_MODULES` (`spec-019` §3.3, `spec-008` §1, `dl-046` A(a)): they join
 * the document's `commands` beside the derived ones.
 */
export const BOOTSTRAP_COMMANDS: readonly string[] = Object.freeze(['init', 'mcp']);

/** One capability of the closed vocabulary (`spec-019` §4.2): its name, and the commands a build must ship to provide it. */
export interface CapabilityEntry {
  /** The kebab-case name, owned by WingFoil. */
  readonly name: string;
  /** The commands (as the document's `commands` names them) every one of which must be present. */
  readonly requires: readonly string[];
}

/** One frozen {@link CapabilityEntry}. */
function capability(name: string, requires: readonly string[]): CapabilityEntry {
  return Object.freeze({ name, requires: Object.freeze([...requires]) });
}

/**
 * The closed capability vocabulary (`spec-019` §4.2), its only code form: one entry per row, in code-unit order of
 * the name. A name joins only by a revision of `spec-019` (§4.4) and leaves only with a bump of
 * {@link CAPABILITIES_DOCUMENT_FORMAT} (§5).
 */
export const CAPABILITIES: readonly CapabilityEntry[] = Object.freeze([
  capability('agent-execute', ['agent execute']),
  capability('directive-verbs', ['directive create', 'directive assign', 'directive remove', 'directives list']),
  capability('dna-verbs', ['dna show', 'dna set', 'dna add', 'dna update', 'dna remove']),
  capability('mcp-server', ['mcp']),
  capability('memory-verbs', [
    'memory add',
    'memory submit',
    'memory approve',
    'memory reject',
    'memory deprecate',
    'memory amend',
    'memory park',
    'memory history',
    'memory search',
  ]),
  capability('workflow-tracking', [
    'workflow list',
    'workflow show',
    'workflow start',
    'workflow next',
    'workflow status',
    'workflow finalize',
    'workflow end',
    'workflow adopt',
    'workflow rekey',
    'workflow create',
    'workflow remove',
  ]),
]);

/**
 * The names `spec-019` §4.3 reserves: no build reports them until the task that ships their command adds them to
 * {@link CAPABILITIES} by a revision of the spec.
 */
export const RESERVED_CAPABILITY_NAMES: readonly string[] = Object.freeze(['migrate', 'pack-install', 'workflow-engine']);

/** The build a document describes (`spec-019` §3.1 `wingfoil`): the `package.json` version and the recorded commit. */
export interface BuildIdentity {
  /** The `package.json` version, a semver string. */
  readonly version: string;
  /** The commit `dist/build-info.json` records (hex, possibly `-dirty`), or `unknown`. */
  readonly commit: string;
}

/** The capabilities document (`spec-019` §3.1), its keys in this order. */
export interface CapabilitiesDocument {
  /** {@link CAPABILITIES_DOCUMENT_FORMAT}. */
  readonly format: number;
  /** The build, `version` then `commit`. */
  readonly wingfoil: BuildIdentity;
  /** Each file kind the build reads, mapped to its range, `lowest` then `highest`, keys in code-unit order. */
  readonly formats: Readonly<Record<string, { readonly lowest: number; readonly highest: number }>>;
  /** Every command the build ships, without the `wingfoil ` prefix, in code-unit order. */
  readonly commands: readonly string[];
  /** Every capability the build provides, in code-unit order. */
  readonly capabilities: readonly string[];
}

/** Ascending UTF-16 code-unit order (`spec-019` §3.2). */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Build the capabilities document of `modules` and `build` (`spec-019` §3): `formats` from `FILE_KIND_FORMATS`,
 * `commands` the union of every operation of `modules` (`"<module> <verb>"`, or `"<module>"` for a self-named one)
 * and {@link BOOTSTRAP_COMMANDS}, and `capabilities` every {@link CAPABILITIES} name whose required commands are all
 * in `commands`. Pure: the same inputs give the same document, keys in §3.2's insertion order.
 */
export function buildCapabilitiesDocument(modules: readonly CoreModule[], build: BuildIdentity): CapabilitiesDocument {
  const formats: Record<string, { lowest: number; highest: number }> = {};
  for (const entry of [...FILE_KIND_FORMATS].sort((a, b) => byCodeUnit(a.kind, b.kind))) {
    formats[entry.kind] = { lowest: entry.lowest, highest: entry.highest };
  }
  const derived = enumerateOperations(modules).map(({ module, operation }) => {
    const verb = deriveVerb(module.name, operation.name);
    return verb === '' ? module.name : `${module.name} ${verb}`;
  });
  const commands = [...new Set([...derived, ...BOOTSTRAP_COMMANDS])].sort(byCodeUnit);
  const shipped = new Set(commands);
  const capabilities = CAPABILITIES.filter((entry) => entry.requires.every((command) => shipped.has(command)))
    .map((entry) => entry.name)
    .sort(byCodeUnit);
  return {
    format: CAPABILITIES_DOCUMENT_FORMAT,
    wingfoil: { version: build.version, commit: build.commit },
    formats,
    commands,
    capabilities,
  };
}

/** A section of the console text: its heading, then one two-space-indented line per item. */
function section(heading: string, items: readonly string[]): string[] {
  return ['', heading, ...items.map((item) => `  ${item}`)];
}

/**
 * The `--format console` text of `document` (`spec-019` §3.5): a header line, then the formats, commands and
 * capabilities sections, each after one blank line, one item per line indented by two spaces, in the document's
 * order; a section with no item prints its heading with `(0)`. Ends with one `\n`. Pure.
 */
export function renderCapabilitiesConsole(document: CapabilitiesDocument): string {
  const lines = [
    `wingfoil ${document.wingfoil.version} (${document.wingfoil.commit}), capabilities document format ${document.format}`,
    ...section(
      'formats read (kind: lowest..highest):',
      Object.entries(document.formats).map(([kind, range]) => `${kind}: ${range.lowest}..${range.highest}`),
    ),
    ...section(`commands (${document.commands.length}):`, document.commands),
    ...section(`capabilities (${document.capabilities.length}):`, document.capabilities),
  ];
  return `${lines.join('\n')}\n`;
}
