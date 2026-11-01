/**
 * The resolution of a short element reference (task-332, `spec-008-cli-grammar` §7): the one pure function every
 * command-line lookup of an element by id resolves through. A user types `dl-001` or `dl-001-pick` for
 * `dl-001-pick-a-storage-layout-for-exports`; the lookups of the Memory verbs and of `--element` pass the
 * documents they read today and use the answer, so the reference never reaches an output (the full id does).
 *
 * The rule, in order, over the given documents (archived ones are candidates, the same as the exact lookups):
 *
 * 1. **exact** — a document whose frontmatter `id` equals the reference; a full id never changes meaning;
 * 2. **number** — the reference is `<literal><digits>` where `<literal>` is the head of a type's `id_pattern`
 *    that begins `<literal>{n}`: the candidates are the documents of that type whose id matches the pattern
 *    with a first numeric token equal *by value* to `<digits>` (`task-12` = `task-012`). A reference of this
 *    shape is decided by this rule alone and never falls through to rule 3 (`task-33` is not `task-330`);
 * 3. **prefix** — otherwise, the documents whose `id` starts with the reference.
 *
 * Case-sensitive (ids are `[a-z0-9-.]`). Candidates are ordered by id, then path, so the answer never depends on
 * the order the documents are given in (REQ-SYS-07).
 */
import { patternToSource } from '../validation';
import type { CoreError } from '../core/types';
import type { MemoryDocumentSummary } from './query';
import type { MemoryYaml } from './schema';

/** What {@link resolveElementReference} found. */
export type ElementReferenceResolution =
  | { readonly kind: 'found'; readonly rule: 'exact' | 'number' | 'prefix'; readonly document: MemoryDocumentSummary }
  | { readonly kind: 'ambiguous'; readonly rule: 'number' | 'prefix'; readonly candidates: readonly MemoryDocumentSummary[] }
  | { readonly kind: 'missing' };

/** Options of {@link resolveElementReference}. */
export interface ElementReferenceOptions {
  /** Resolve among the documents of this `memory.yaml` type only (`--element <type>:<ref>`). */
  readonly type?: string;
}

/** A type whose `id_pattern` begins `<literal>{n}`: its leading literal and the anchored, capturing id matcher. */
interface NumberedFamily {
  readonly type: string;
  readonly literal: string;
  readonly matcher: RegExp;
}

function compareText(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

function idOf(document: MemoryDocumentSummary): string | undefined {
  const id = document.frontmatter['id'];
  return typeof id === 'string' ? id : undefined;
}

function byIdThenPath(a: MemoryDocumentSummary, b: MemoryDocumentSummary): number {
  return compareText(idOf(a) ?? '', idOf(b) ?? '') || compareText(a.path, b.path);
}

/** The types of `memoryYaml` whose committed `id_pattern` is `<literal>{n}…` with a non-empty literal, in type-name order. */
function numberedFamilies(memoryYaml: MemoryYaml): NumberedFamily[] {
  const families: NumberedFamily[] = [];
  for (const type of Object.keys(memoryYaml.types).sort(compareText)) {
    const pattern = memoryYaml.types[type]?.id_pattern;
    if (pattern === undefined) continue;
    const head = /^([a-z0-9.-]+)\{(?:n+|n:[1-9][0-9]*)\}/.exec(pattern);
    if (head === null || head[1] === undefined) continue;
    families.push({ type, literal: head[1], matcher: new RegExp(`^${patternToSource(pattern, { captureNumeric: true })}$`) });
  }
  return families;
}

function outcome(rule: 'number' | 'prefix', candidates: MemoryDocumentSummary[]): ElementReferenceResolution {
  if (candidates.length === 0) return { kind: 'missing' };
  const sorted = [...candidates].sort(byIdThenPath);
  return sorted.length === 1 ? { kind: 'found', rule, document: sorted[0] as MemoryDocumentSummary } : { kind: 'ambiguous', rule, candidates: sorted };
}

/**
 * Resolve `reference` among `documents`, using `memoryYaml`'s committed `id_pattern`s for the number rule.
 * Pure: it reads nothing, writes nothing and throws nothing.
 */
export function resolveElementReference(
  documents: Iterable<MemoryDocumentSummary>,
  memoryYaml: MemoryYaml,
  reference: string,
  options: ElementReferenceOptions = {},
): ElementReferenceResolution {
  const scoped = [...documents]
    .filter((document) => options.type === undefined || document.frontmatter['type'] === options.type)
    .sort(byIdThenPath);

  const exact = scoped.find((document) => idOf(document) === reference);
  if (exact !== undefined) return { kind: 'found', rule: 'exact', document: exact };

  // The number shape is judged against every type's family, whatever `options.type` scopes the candidates to:
  // `task-12` among decision-logs is missing, not a prefix.
  const digits = /\d+$/.exec(reference)?.[0];
  if (digits !== undefined) {
    const literal = reference.slice(0, reference.length - digits.length);
    const families = numberedFamilies(memoryYaml).filter((family) => family.literal === literal);
    if (families.length > 0) {
      const wanted = BigInt(digits);
      const matches = scoped.filter((document) => {
        const id = idOf(document);
        if (id === undefined) return false;
        return families.some((family) => {
          if (document.frontmatter['type'] !== family.type) return false;
          const number = family.matcher.exec(id)?.[1];
          return number !== undefined && BigInt(number) === wanted;
        });
      });
      return outcome('number', matches);
    }
  }

  return outcome('prefix', scoped.filter((document) => (idOf(document) ?? '').startsWith(reference)));
}

/**
 * The refusal of an ambiguous reference (`spec-008` §6, design D7): `CONFLICT`, the message naming the reference and
 * the number of elements, a hint, and every candidate's full id in id order — in `details.candidates` and as one
 * `details.issues` entry each (`{ detail: <id> }`), which the CLI prints one per line. Shared by every lookup that
 * resolves a reference, so the wording cannot drift between them.
 */
export function ambiguousReferenceError(reference: string, candidates: readonly MemoryDocumentSummary[]): CoreError {
  const ids = candidates.map((candidate) => idOf(candidate) ?? candidate.path);
  return {
    code: 'CONFLICT',
    message: `ambiguous reference: ${reference} matches ${ids.length} elements`,
    hint: 'give the full id, or a longer prefix of it',
    details: { candidates: ids, issues: ids.map((detail) => ({ detail })) },
  };
}
