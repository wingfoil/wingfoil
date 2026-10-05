/**
 * Secret/credential hygiene scan (task-043-secret-credential-hygiene, REQ-SEC-08), built to
 * `spec-007-secret-hygiene-patterns` — the single canonical pattern set and scan procedure spec-007
 * requires so no future call site (a commit-time gate, `task-044`'s `init` integrity check, a future
 * `wingfoil audit`) re-implements its own regex list and lets the patterns drift.
 *
 * `SECRET_PATTERNS` reproduces spec-007 §2's ten named rules; each JS `RegExp` below carries a
 * comment quoting the exact spec-007 YAML `regex:` string it implements. Four of spec-007's patterns
 * use the PCRE inline mode-modifier syntax `(?i)`/`(?im)` in their YAML text — JS `RegExp` has no
 * such inline syntax on Node 22 (`new RegExp('(?i)...')` throws `SyntaxError`) — so that flag is
 * moved to the equivalent JS `i` flag instead, except on `generic-api-key-assignment`, whose YAML
 * also holds a case-sensitive `(?-i:…)` group: there the key words are case-folded letter by letter
 * (`caseless`) and no flag is set. This is a mechanical syntax translation, not a semantic rewrite:
 * the matched shape is unchanged, so it satisfies spec-007's Consequences-section instruction to
 * "reproduce the pattern table in §2 verbatim (or import it as data)" rather than hand-roll
 * alternative regexes.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** A finding's severity (spec-007 §2): `block` fails the scan, `warn` is reported only. */
export type SecretSeverity = 'block' | 'warn';

/** One canonical secret-hygiene rule (spec-007 §2): `{id, regex, description, severity}`. */
export interface SecretPattern {
  /** Stable rule name, e.g. `private-key-pem` — also {@link SecretFinding.patternId}. */
  readonly id: string;
  /** Human-readable description of what the pattern targets. */
  readonly description: string;
  /** `block` fails the scan; `warn` is reported for human review only (spec-007 §2). */
  readonly severity: SecretSeverity;
  /** The compiled detection regex (case sensitivity mirrors spec-007's per-pattern `(?i)` marker). */
  readonly regex: RegExp;
}

/**
 * Case-fold the letters of a regex source fragment (`token` → `[Tt][Oo][Kk][Ee][Nn]`), leaving every
 * other character as written. It stands in for spec-007's PCRE `(?i)` on a pattern that also needs a
 * case-sensitive part, which a JS `i` flag cannot express (bug-228).
 */
function caseless(source: string): string {
  return source.replace(/[a-z]/gi, (ch) => `[${ch.toUpperCase()}${ch.toLowerCase()}]`);
}

/**
 * The canonical secret-hygiene pattern set (spec-007 §2), in the fixed declaration order every scan
 * must evaluate patterns in (determinism, REQ-SYS-07, spec-007 §4 step 3). Adding, removing, or
 * re-classifying a pattern is a revision to spec-007's §2 table, not a call-site code change.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: 'private-key-pem',
    description: 'PEM-encoded private key header',
    severity: 'block',
    // spec-007 §2: '-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----'
    regex: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    id: 'generic-api-key-assignment',
    description: 'Variable assignment that looks like an API key/secret/token',
    severity: 'block',
    // spec-007 §2 (case-insensitive key words per its `(?i)` marker; the `(?-i:…)` group is
    // case-SENSITIVE, bug-228):
    // '(?i)(api[_-]?key|secret|token|passwd|password)\s*[:=]\s*["\']?(?-i:(?![a-z]+(?:-[a-z]+)+(?![A-Za-z0-9_\-\/+=])))[A-Za-z0-9_\-\/+=]{16,}["\']?'
    // The lookahead refuses a value made only of lower-case words joined by hyphens — prose such as
    // a hyphenated name after a colon, not a key. JS has no `(?-i:…)` group on Node 22, so instead of
    // the `i` flag the key words are case-folded one letter at a time (`caseless`): the matched
    // shape is the spec's, and only the lookahead stays case-sensitive.
    regex: new RegExp(
      `(${['api[_-]?key', 'secret', 'token', 'passwd', 'password'].map(caseless).join('|')})` +
        `\\s*[:=]\\s*["']?(?![a-z]+(?:-[a-z]+)+(?![A-Za-z0-9_\\-/+=]))[A-Za-z0-9_\\-/+=]{16,}["']?`,
    ),
  },
  {
    id: 'aws-access-key-id',
    description: 'AWS access key ID shape',
    severity: 'block',
    // spec-007 §2: '\b(AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[0-9A-Z]{16}\b'
    regex: /\b(AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[0-9A-Z]{16}\b/,
  },
  {
    id: 'aws-secret-access-key',
    description: "AWS secret access key assignment (40-char base64-ish, near 'aws' or 'secret')",
    severity: 'block',
    // spec-007 §2 (case-insensitive per its `(?i)` marker):
    // 'aws.{0,20}(secret|key).{0,5}[:=]\s*["\']?[A-Za-z0-9\/+=]{40}["\']?'
    regex: /aws.{0,20}(secret|key).{0,5}[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/i,
  },
  {
    id: 'gcp-service-account-key',
    description: 'GCP service-account JSON key fragment',
    severity: 'block',
    // spec-007 §2: '"type"\s*:\s*"service_account"|"private_key_id"\s*:\s*"[0-9a-f]{40}"'
    regex: /"type"\s*:\s*"service_account"|"private_key_id"\s*:\s*"[0-9a-f]{40}"/,
  },
  {
    id: 'github-token',
    description: 'GitHub personal access / app / fine-grained token',
    severity: 'block',
    // spec-007 §2: '\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{36,}\b'
    regex: /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{36,}\b/,
  },
  {
    id: 'slack-token',
    description: 'Slack bot/user/app token',
    severity: 'block',
    // spec-007 §2: '\bxox[baprs]-[A-Za-z0-9-]{10,}\b'
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    id: 'jwt-like',
    description: 'JSON Web Token shape (header.payload.signature, base64url segments)',
    // promoted warn → block by dl-036-secret-scan-warn-severity-vs-req-sec-08 (spec-007 §2 amended)
    severity: 'block',
    // spec-007 §2: '\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b'
    regex: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/,
  },
  {
    id: 'generic-high-entropy-string',
    description: 'Long contiguous base64/hex-alphabet token assigned to a suspicious key name',
    severity: 'warn',
    // spec-007 §2 (case-insensitive per its `(?i)` marker):
    // '(auth|credential|bearer)\s*[:=]\s*["\']?[A-Za-z0-9_\-\/+=]{24,}["\']?'
    regex: /(auth|credential|bearer)\s*[:=]\s*["']?[A-Za-z0-9_\-/+=]{24,}["']?/i,
  },
  {
    id: 'dotenv-style-secret-line',
    description: '.env-style KEY=VALUE line where KEY names a credential',
    // promoted warn → block by dl-036-secret-scan-warn-severity-vs-req-sec-08 (spec-007 §2 amended)
    severity: 'block',
    // spec-007 §2 (case-insensitive per its `(?im)` marker; the `m` is a no-op here because the
    // scan procedure already evaluates one line at a time, so `^`/`$` anchor to that line either way).
    // The optional prefix — indentation, an `export` keyword, a `-`/`*` list marker — is
    // bug-037's amendment (task-135): a column-0 anchor let those lines through. bug-190's (task-182)
    // adds a `#` comment, a list marker before the keyword, `readonly` and `declare` (with flags such
    // as `-x`), and PowerShell's `$env:` scope.
    // '^\s*(?:#+\s*)?(?:[-*]\s+)?(?:(?:export|readonly|declare)(?:\s+-[A-Za-z]+)*\s+)?(?:\$env:)?[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*\S+'
    regex:
      /^\s*(?:#+\s*)?(?:[-*]\s+)?(?:(?:export|readonly|declare)(?:\s+-[A-Za-z]+)*\s+)?(?:\$env:)?[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*\S+/i,
  },
];

/** Why a would-be finding was downgraded to {@link ScanResult.info} instead of failing the scan. */
export type ExemptReason = 'fenced-example' | 'placeholder-value' | 'ignore-path';

/** One pattern match (spec-007 §4): `{pattern_id, severity, file, line, column, excerpt}`. */
export interface SecretFinding {
  /** {@link SecretPattern.id} of the rule that matched. */
  readonly patternId: string;
  /** The matching pattern's severity at declaration time (before any exclusion is applied). */
  readonly severity: SecretSeverity;
  /** Path of the file the finding was found in, as given to the scan call. */
  readonly file: string;
  /** 1-based line number. */
  readonly line: number;
  /** 1-based column of the match start. */
  readonly column: number;
  /** The matched substring. */
  readonly excerpt: string;
}

/** A {@link SecretFinding} downgraded by one of spec-007 §3's exclusions — still reported, not failed. */
export interface ExemptFinding extends SecretFinding {
  /** Which §3 exclusion downgraded this finding. */
  readonly exemptReason: ExemptReason;
}

/**
 * The outcome of a scan (spec-007 §4): `blocking.length === 0` is required for a caller to proceed;
 * `warnings` and `info` are always returned for display regardless of outcome (spec-007 §4 step 6).
 */
export interface ScanResult {
  /** `block`-severity findings that survived exclusion — fail the scan. */
  readonly blocking: readonly SecretFinding[];
  /** `warn`-severity findings that survived exclusion — reported, do not fail the scan. */
  readonly warnings: readonly SecretFinding[];
  /** Findings downgraded by a spec-007 §3 exclusion — still listed, never fail the scan. */
  readonly info: readonly ExemptFinding[];
  /**
   * How many files' text this result covers — `1` from {@link scanText}, the number of non-binary
   * indexed files actually read from {@link scanProjectSurface} (binaries skipped per spec-007 §1
   * are not counted, because their content was never examined).
   *
   * Without it an empty `blocking` list is ambiguous: a caller — or an assertion — cannot tell
   * "every file was read and all were clean" from "no file was read at all" (a missing surface
   * root, an empty index, a wrong `root`). Callers gating on `blocking.length === 0` should check
   * that this is non-zero before trusting a clean verdict.
   */
  readonly filesScanned: number;
}

/** Options for {@link scanText}. */
export interface ScanTextOptions {
  /**
   * When `true`, every finding in this file is downgraded to `info` with `exemptReason:
   * 'ignore-path'` (spec-007 §3's `security-ignore` glob exclusion) — the file itself still gets
   * scanned so the exemption is auditable rather than a silent skip.
   */
  readonly pathIgnored?: boolean;
}

const FENCE_DELIMITER_RE = /^`{3,}/;
const FENCE_EXEMPT_MARKERS = new Set(['<!-- example -->', '<!-- placeholder -->']);

/** Literal placeholder values spec-007 §3 exempts outright (case-insensitive, whole-value match). */
const PLACEHOLDER_LITERALS = new Set(['REDACTED', 'PLACEHOLDER', 'EXAMPLE', 'XXXXXXXXXXXXXXXX']);

/** True for a value that is entirely `x`/`X`/`*` repeats, or one of spec-007 §3's literal strings. */
function isPlaceholderValue(value: string): boolean {
  if (value.length === 0) return false;
  if (/^[xX*]+$/.test(value)) return true;
  return PLACEHOLDER_LITERALS.has(value.toUpperCase());
}

/**
 * Best-effort extraction of the "value" side of a `key: value` / `key=value` match, for the
 * placeholder-value exclusion (spec-007 §3). Takes everything after the match's last `:`/`=` (the
 * separator every value-shaped pattern in §2 requires), trims whitespace, and strips one layer of
 * surrounding quotes. Falls back to the whole match when no separator is present (vendor-prefixed
 * shapes like `aws-access-key-id`/`github-token` have no separate value to isolate — the placeholder
 * exclusion legitimately does not apply to those; the fenced-example / ignore-path exclusions do).
 */
function extractCandidateValue(matchText: string): string {
  const lastEquals = matchText.lastIndexOf('=');
  const lastColon = matchText.lastIndexOf(':');
  const sepIndex = Math.max(lastEquals, lastColon);
  const raw = sepIndex >= 0 ? matchText.slice(sepIndex + 1) : matchText;
  return raw.trim().replace(/^["']/, '').replace(/["']$/, '');
}

/** Every match of `pattern.regex` on a single `line`, as unexempt {@link SecretFinding}s. */
function matchLine(
  line: string,
  pattern: SecretPattern,
  lineNumber: number,
  filePath: string,
): SecretFinding[] {
  const flags = pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`;
  const global = new RegExp(pattern.regex.source, flags);
  const findings: SecretFinding[] = [];
  let match: RegExpExecArray | null;
  while ((match = global.exec(line)) !== null) {
    findings.push({
      patternId: pattern.id,
      severity: pattern.severity,
      file: filePath,
      line: lineNumber,
      column: match.index + 1,
      excerpt: match[0],
    });
    if (match[0].length === 0) global.lastIndex += 1; // guard a zero-length match's infinite loop
  }
  return findings;
}

/**
 * Scan one file's already-decoded text content (spec-007 §4): evaluate {@link SECRET_PATTERNS} in
 * declared order against every line, apply the §3 exclusions, and classify each surviving finding by
 * severity. This is the seam spec-007 §4 step 5's callers use per file about to be written or
 * committed: `init`'s pre-write pass over the built-in templates calls it (`verifyBuiltinTemplates`,
 * `src/core/builtin-integrity.ts`, task-135), and a future commit-time gate would.
 */
export function scanText(content: string, filePath: string, options: ScanTextOptions = {}): ScanResult {
  const lines = content.split(/\r\n|\r|\n/);
  const blocking: SecretFinding[] = [];
  const warnings: SecretFinding[] = [];
  const info: ExemptFinding[] = [];

  let inFence = false;
  let fenceExempt = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (FENCE_DELIMITER_RE.test(line.trim())) {
      if (!inFence) {
        const prevLine = i > 0 ? (lines[i - 1] ?? '').trim().toLowerCase() : '';
        fenceExempt = FENCE_EXEMPT_MARKERS.has(prevLine);
        inFence = true;
      } else {
        inFence = false;
        fenceExempt = false;
      }
      continue;
    }

    for (const pattern of SECRET_PATTERNS) {
      for (const finding of matchLine(line, pattern, i + 1, filePath)) {
        const valueExempt = isPlaceholderValue(extractCandidateValue(finding.excerpt));
        if (fenceExempt || valueExempt || options.pathIgnored) {
          const exemptReason: ExemptReason = fenceExempt
            ? 'fenced-example'
            : valueExempt
              ? 'placeholder-value'
              : 'ignore-path';
          info.push({ ...finding, exemptReason });
        } else if (finding.severity === 'block') {
          blocking.push(finding);
        } else {
          warnings.push(finding);
        }
      }
    }
  }

  return { blocking, warnings, info, filesScanned: 1 };
}

/** Concatenate {@link ScanResult}s (file iteration order — deterministic when the caller's is). */
function mergeScanResults(results: readonly ScanResult[]): ScanResult {
  return {
    blocking: results.flatMap((r) => r.blocking),
    warnings: results.flatMap((r) => r.warnings),
    info: results.flatMap((r) => r.info),
    filesScanned: results.reduce((total, r) => total + r.filesScanned, 0),
  };
}

/** Null-byte sniff on the first 8KB (spec-007 §1) — binary files are out of scan scope. */
export function isBinaryContent(buf: Buffer): boolean {
  const head = buf.subarray(0, 8192);
  return head.includes(0);
}

/**
 * Default scan-surface roots (spec-007 §1): `.wingfoil/` once `init` exists, plus `docs/04_memory/`,
 * this repository's own Memory folder — spec-007 §1's self-hosted analog, which followed the
 * configuration to the repository root in `task-111-configuration-moves-to-the-repository-root`
 * (before it, the analog named the nested dogfooding copies of both folders). A root with no indexed
 * files contributes nothing, so {@link scanProjectSurface} is safe to call before `init` has ever run,
 * and on a project whose Memory lives elsewhere.
 */
export const SCAN_SURFACE_ROOTS = ['.wingfoil', 'docs/04_memory'] as const;

/** Default path (root-relative) of the `security-ignore` glob list (spec-007 §3). */
export const DEFAULT_IGNORE_FILE = '.wingfoil/security-ignore';

/** One index entry under the scan surface: its root-relative path and the blob id staged for it. */
interface IndexedBlob {
  readonly path: string;
  readonly blob: string;
}

/** `git ls-files -s` mode of a gitlink (submodule commit) — not a blob, nothing to read. */
const GITLINK_MODE = '160000';

/** One `git ls-files -s -z` record: mode, object id, stage, then a tab and the raw path. */
const INDEX_RECORD_RE = /^(\d+) ([0-9a-f]+) \d\t([\s\S]+)$/;

/**
 * List every indexed (tracked or staged, spec-007 §1) blob under `surfaceRoots`, in git's path order.
 * `-z` keeps paths unquoted; gitlinks are skipped. An unmerged path contributes one entry per conflict
 * stage — each is content that could be committed. A surface root absent from the index yields no
 * entries (git accepts an unmatched pathspec), so there is no on-disk existence check: the index is
 * the only source. Mirrors `src/storage/commit.ts`'s `execFileSync('git', ['-C', root, ...])` style.
 */
function listIndexedBlobs(root: string, surfaceRoots: readonly string[]): IndexedBlob[] {
  if (surfaceRoots.length === 0) return [];
  const out = execFileSync('git', ['-C', root, 'ls-files', '-s', '-z', '--', ...surfaceRoots], {
    encoding: 'utf-8',
    env: process.env,
  });
  const entries: IndexedBlob[] = [];
  for (const record of out.split('\0')) {
    // `<mode> <object id> <stage>\t<path>`; the trailing empty record after the last NUL never matches
    const match = INDEX_RECORD_RE.exec(record);
    if (match === null || match[1] === GITLINK_MODE) continue;
    entries.push({ path: match[3] as string, blob: match[2] as string });
  }
  return entries;
}

/**
 * Read every entry's staged bytes from the object store in ONE `git cat-file --batch` call, preserving
 * `entries` order. Each response is `<id> blob <size>\n<size bytes>\n`; any other header (e.g.
 * `<id> missing`) means the index names an object the repository does not have, which is corruption,
 * not a scan result — it throws.
 */
function readIndexedBlobs(
  root: string,
  entries: readonly IndexedBlob[],
): { readonly path: string; readonly content: Buffer }[] {
  if (entries.length === 0) return [];
  const out = execFileSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: `${entries.map((entry) => entry.blob).join('\n')}\n`,
    env: process.env,
    maxBuffer: Number.POSITIVE_INFINITY,
  });
  let offset = 0;
  return entries.map(({ path, blob }) => {
    const headerEnd = out.indexOf(0x0a, offset);
    const header = out.subarray(offset, headerEnd).toString('utf-8');
    const match = /^([0-9a-f]+) blob (\d+)$/.exec(header);
    if (match === null || match[1] !== blob) {
      throw new Error(`git cat-file could not read the indexed blob of ${path}: "${header}"`);
    }
    const start = headerEnd + 1;
    const end = start + Number(match[2]);
    offset = end + 1; // skip the LF that terminates each object's content
    return { path, content: out.subarray(start, end) };
  });
}

/**
 * Parse a `security-ignore` file (spec-007 §3): one glob per line, git-attribute-style — blank lines
 * and lines starting with `#` are ignored. Returns `[]` when `ignoreFilePath` does not exist (no
 * ignore list configured is not an error).
 */
export function loadIgnoreGlobs(ignoreFilePath: string): string[] {
  if (!existsSync(ignoreFilePath)) return [];
  return readFileSync(ignoreFilePath, 'utf-8')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** Escape one non-wildcard character for safe insertion into a glob-derived `RegExp` source. */
function escapeGlobLiteral(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/** Compile one `security-ignore` glob line (`*`, `**`, `?`) to a `RegExp` matching a full root-relative path. */
function globToRegExp(glob: string): RegExp {
  let source = '^';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        source += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1; // `**/` also swallows the following separator
      } else {
        source += '[^/]*';
      }
    } else if (ch === '?') {
      source += '[^/]';
    } else if (ch !== undefined) {
      source += escapeGlobLiteral(ch);
    }
  }
  source += '$';
  return new RegExp(source);
}

/** True when root-relative `filePath` matches any glob in `globs` (spec-007 §3 ignore-path exclusion). */
export function matchesIgnoreGlob(filePath: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(filePath));
}

/** Options for {@link scanProjectSurface}. */
export interface ScanProjectOptions {
  /** Override the default scan-surface roots ({@link SCAN_SURFACE_ROOTS}). */
  readonly surfaceRoots?: readonly string[];
  /** Root-relative path to the `security-ignore` glob list (default {@link DEFAULT_IGNORE_FILE}). */
  readonly ignoreFilePath?: string;
}

/**
 * Run the full scan procedure (spec-007 §4) over `root`'s tracked/staged content under the scan
 * surface (§1): list the indexed blobs via `git ls-files -s`, read them from the object store, skip
 * binaries (§1), apply the `security-ignore` list (§3) as a per-file `pathIgnored` flag, and scan every
 * remaining file's text with {@link scanText}.
 *
 * **Contract — the git index, not the working tree (`bug-015`).** Both the file list and the content
 * come from the index: the scan judges exactly what the next commit would contain, which is what the
 * pre-commit / pre-publish gate of spec-007 §4 step 5 must judge. So a file deleted on disk but still
 * indexed is scanned from its staged blob; a staged deletion is not listed; an unstaged edit — clean or
 * leaky — is not seen until it is staged. (Before `bug-015` the list came from the index but the bytes
 * from disk, so an unstaged deletion threw `ENOENT` and took the whole scan down.) The
 * `security-ignore` file itself is read from disk: it configures the scan, it is not scanned content.
 * `root` must be a git work tree.
 *
 * This is the concrete entry point the REQ-SEC-08 Fit Criterion ("a scan of committed `.wingfoil/`
 * content matches 0 known secret patterns") is checkable against: `scanProjectSurface(root).blocking`
 * must be empty for a hygienic project. Pair that with {@link ScanResult.filesScanned} — an empty
 * `blocking` list only means "clean" once it is known that files were actually read; `filesScanned`
 * is `0` when no surface root exists or the index is empty under it.
 */
export function scanProjectSurface(root: string, options: ScanProjectOptions = {}): ScanResult {
  const surfaceRoots = options.surfaceRoots ?? SCAN_SURFACE_ROOTS;
  const ignoreFilePath = options.ignoreFilePath ?? DEFAULT_IGNORE_FILE;
  const ignoreGlobs = loadIgnoreGlobs(join(root, ignoreFilePath));

  const results: ScanResult[] = [];
  for (const { path, content } of readIndexedBlobs(root, listIndexedBlobs(root, surfaceRoots))) {
    if (isBinaryContent(content)) continue;
    const pathIgnored = matchesIgnoreGlob(path, ignoreGlobs);
    results.push(scanText(content.toString('utf-8'), path, { pathIgnored }));
  }
  return mergeScanResults(results);
}
