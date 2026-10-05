/**
 * ID-generation engine (task-002-validation-id-engine, acceptance criteria 5).
 *
 * Generates a concrete Memory-element ID from a type's `id_pattern` (declared in
 * `.wingfoil/memory.yaml`, e.g. `task-{n}-{slug}`) plus values for its `{placeholder}`
 * tokens. It enforces the shared ID character class `[a-z0-9-.]` that spec-009-validation-strategy
 * §1 frames as a Pass-2 rule owned by "the shared ID constants":
 *
 *  - Every literal character of the pattern (outside `{...}` tokens) must be in `[a-z0-9-.]`;
 *    otherwise `E_INVALID_ID_PATTERN_CHARS` (integrity failure, exit 2 — the pattern itself is
 *    malformed).
 *  - Every rendered value must keep the produced ID inside `[a-z0-9-.]`; otherwise `E_INVALID_ID`
 *    (field-level failure, exit 1).
 *
 * It lives under `src/validation` (not `src/core`) because spec-009 §1 co-locates the id-character
 * rule with the validation module, and `runValidation`'s Pass-2 id-pattern check consumes the same
 * character class exported here — keeping one source of truth for what a legal ID looks like.
 */
import { ValidationError, ValidationIssue } from './errors';

/** The shared ID character class (spec-009 §1): lowercase alphanumerics, `-`, and `.`. */
export const ID_CHAR_CLASS = 'a-z0-9-.';

/** A rendered ID (or ID piece) must match this end-to-end. `-` is placed last to avoid a range. */
const ID_PIECE_RE = /^[a-z0-9.-]+$/;

/** A literal pattern segment: every character must be a member of the ID character class. */
const LITERAL_RE = /^[a-z0-9.-]+$/;

/**
 * A numeric token: one written purely as `n` (`{n}`, `{nn}`, `{nnn}`), or `{n:N}` with a width
 * `N >= 1` (`spec-001`'s placeholder table; task-163, `bug-176`).
 */
const NUMERIC_TOKEN_RE = /^(?:n+|n:[1-9][0-9]*)$/;

/** Minimum zero-pad width for numeric tokens (observed convention: task-001, adr-005, spec-009). */
const DEFAULT_PAD_WIDTH = 3;

type SegmentKind = 'literal' | 'token';
interface Segment {
  readonly kind: SegmentKind;
  readonly value: string;
}

const TOKEN_RE = /\{([^{}]+)\}/g;

/** Split a pattern into ordered literal / token segments. */
function parsePattern(pattern: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(pattern)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'literal', value: pattern.slice(lastIndex, match.index) });
    }
    segments.push({ kind: 'token', value: match[1] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < pattern.length) {
    segments.push({ kind: 'literal', value: pattern.slice(lastIndex) });
  }
  return segments;
}

/**
 * Whether `token` (a `{…}` name without its braces) is a `{n}`-family counter token: `n`, `nn`,
 * `nnn`, … or `n:N` (task-163, `bug-176`). Every such token takes the one counter value given as `n`.
 */
export function isNumericToken(token: string): boolean {
  return NUMERIC_TOKEN_RE.test(token);
}

/** Escape a literal segment for safe insertion into a RegExp source. */
function escapeLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the RegExp an ID produced from `pattern` must match: literals are matched verbatim, numeric
 * tokens as `[0-9]+`, and every other token as a hyphen-separated `[a-z0-9.]` slug.
 */
export function patternToRegExp(pattern: string): RegExp {
  return new RegExp(`^${patternToSource(pattern)}$`);
}

/**
 * The unanchored RegExp source behind {@link patternToRegExp}, for embedding an id inside a longer
 * match (`memory add`'s counter matches a whole repository path, task-128). With `captureNumeric`,
 * each `{n}`-family token is a capturing group `([0-9]+)` and nothing else captures, so group 1 is
 * the first numeric token's value.
 */
export function patternToSource(pattern: string, options: { readonly captureNumeric?: boolean } = {}): string {
  let source = '';
  for (const segment of parsePattern(pattern)) {
    if (segment.kind === 'literal') {
      source += escapeLiteral(segment.value);
    } else if (isNumericToken(segment.value)) {
      source += options.captureNumeric === true ? '([0-9]+)' : '[0-9]+';
    } else {
      source += '[a-z0-9.]+(?:-[a-z0-9.]+)*';
    }
  }
  return source;
}

/** Collect, in order of first appearance, the characters of `literal` outside the ID class. */
function offendingChars(literal: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of literal) {
    if (!LITERAL_RE.test(ch) && !seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}

/** A non-numeric token name: a frontmatter field or context name (`version`, `release-line`, `tmpl_version`). */
const FIELD_TOKEN_RE = /^[a-z][a-z0-9_-]*$/;

/**
 * Whether `value` is a legal ID piece — non-empty and wholly inside the shared ID character class
 * `[a-z0-9-.]` (spec-009 §1). The same test {@link generateId} applies to every rendered token value,
 * exported so a caller that materializes a token itself (`memory add`'s field tokens,
 * task-110) refuses exactly what `generateId` would.
 */
export function isIdPiece(value: string): boolean {
  return ID_PIECE_RE.test(value);
}

/**
 * The `{token}` names of an `id_pattern` (or a `path` pattern — same brace syntax), in order of
 * appearance, duplicates kept. `{n}` family tokens are returned as written (`n`, `nnn`).
 */
export function patternTokens(pattern: string): string[] {
  return parsePattern(pattern)
    .filter((segment) => segment.kind === 'token')
    .map((segment) => segment.value);
}

/**
 * Validate an `id_pattern` on its own, without rendering it — the check a pattern declared somewhere
 * other than `memory.yaml` gets, e.g. a workflow `memory.add` action's per-action override
 * (`spec-001` "Per-action override", `dl-107` S3 (a), task-110). Returns one message per problem, in
 * pattern order; an empty array means the pattern is well-formed:
 *
 * - an empty pattern;
 * - literal characters outside `[a-z0-9-.]` — the same rule and wording as {@link generateId}'s
 *   Pass A;
 * - a token that is neither a `{n}`-family token nor a field name `[a-z][a-z0-9_-]*`. A **dotted**
 *   token (`{release.version}`) is named as such: it would read a field of an element in the
 *   workflow's `element:` chain, which is `dl-090`'s resolution and undefined until that lands.
 */
export function idPatternIssues(pattern: string): string[] {
  if (pattern.length === 0) return ['pattern is empty'];
  const issues: string[] = [];
  const segments = parsePattern(pattern);
  const badChars: string[] = [];
  for (const segment of segments) {
    if (segment.kind !== 'literal') continue;
    for (const ch of offendingChars(segment.value)) if (!badChars.includes(ch)) badChars.push(ch);
  }
  if (badChars.length > 0) {
    issues.push(`pattern contains character(s) outside [${ID_CHAR_CLASS}]: ${badChars.join(', ')}`);
  }
  for (const segment of segments) {
    if (segment.kind !== 'token') continue;
    const token = segment.value;
    if (isNumericToken(token) || FIELD_TOKEN_RE.test(token)) continue;
    const dotted = token.includes('.') && token.split('.').every((part) => FIELD_TOKEN_RE.test(part));
    issues.push(dotted ? `dotted token {${token}} is not defined until dl-090` : `malformed token {${token}}`);
  }
  return issues;
}

/**
 * Generate a concrete ID from `pattern` and `values`.
 *
 * @throws {@link ValidationError} `E_INVALID_ID_PATTERN_CHARS` (exit 2) if the pattern's literals
 *   leave the ID character class, or `E_INVALID_ID` (exit 1) if a value is missing, mistyped, or
 *   would produce an ID outside `[a-z0-9-.]`.
 */
export function generateId(pattern: string, values: Record<string, string | number>): string {
  const segments = parsePattern(pattern);

  // Pass A — pattern literals must all be inside the ID character class (integrity failure).
  const badChars = new Set<string>();
  for (const segment of segments) {
    if (segment.kind === 'literal') {
      for (const ch of offendingChars(segment.value)) badChars.add(ch);
    }
  }
  if (badChars.size > 0) {
    throw ValidationError.semantic([
      {
        code: 'E_INVALID_ID_PATTERN_CHARS',
        path: 'id_pattern',
        file: pattern,
        message: `pattern contains character(s) outside [${ID_CHAR_CLASS}]: ${[...badChars].join(', ')}`,
      },
    ]);
  }

  // Pass B — render each token, collecting value-level failures.
  const issues: ValidationIssue[] = [];
  let id = '';
  for (const segment of segments) {
    if (segment.kind === 'literal') {
      id += segment.value;
      continue;
    }
    const token = segment.value;
    // Every `{n}`-family token renders the one counter value, given as `n` (task-163, `bug-176`).
    const value = values[token] ?? (isNumericToken(token) ? values.n : undefined);
    if (value === undefined) {
      issues.push(invalidId(pattern, `missing value for token {${token}}`));
      continue;
    }
    if (isNumericToken(token)) {
      const rendered = renderNumeric(token, value);
      if (rendered === null) {
        issues.push(invalidId(pattern, `token {${token}} expects a non-negative integer, got "${String(value)}"`));
        continue;
      }
      id += rendered;
    } else {
      if (typeof value !== 'string' || !ID_PIECE_RE.test(value)) {
        issues.push(invalidId(pattern, `value for token {${token}} is not a valid [${ID_CHAR_CLASS}] piece: "${String(value)}"`));
        continue;
      }
      id += value;
    }
  }
  if (issues.length > 0) {
    throw new ValidationError(issues);
  }

  // Pass C — final safety net: the assembled ID must match the pattern and the ID character class.
  if (!ID_PIECE_RE.test(id) || !patternToRegExp(pattern).test(id)) {
    throw new ValidationError([invalidId(pattern, `generated id "${id}" does not conform to pattern`)]);
  }
  return id;
}

function invalidId(pattern: string, message: string): ValidationIssue {
  return { code: 'E_INVALID_ID', path: 'id', file: pattern, message };
}

/**
 * Render a numeric token zero-padded to its minimum width: `N` for `{n:N}`, otherwise the token's
 * width with a floor of 3 (`{n}` → `002`). Never truncates. `null` if the value is not a
 * non-negative integer.
 */
function renderNumeric(token: string, value: string | number): string | null {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (/^\d+$/.test(value)) {
    n = Number(value);
  } else {
    return null;
  }
  if (!Number.isInteger(n) || n < 0) return null;
  const width = token.startsWith('n:') ? Number(token.slice(2)) : Math.max(DEFAULT_PAD_WIDTH, token.length);
  return String(n).padStart(width, '0');
}
