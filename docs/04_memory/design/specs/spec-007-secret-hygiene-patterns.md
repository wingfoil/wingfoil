---
id: spec-007-secret-hygiene-patterns
type: tech-spec
title: "Secret-hygiene scan patterns and procedure"
status: approved
scope: ".wingfoil/directives/custom/security-secrets.md"
supersedes: ""
tmpl_version: 260703
---

## Context

The `security-secrets` directive (`.wingfoil/directives/custom/security-secrets.md`) states
the rule — "never commit credentials, tokens, or secrets to git" — but a directive is prose, not a
checkable artefact. REQ-SEC-08 requires that "a scan of committed `.wingfoil/` content matches 0 known
secret patterns"; REQ-SEC-10 requires built-in templates be integrity/schema-checked before installation
during `init`, aborting on failure. Neither requirement is enforceable without one shared, versioned
pattern set and one shared scan procedure. Without this spec, every future call site (init's integrity
check, a future `wingfoil audit` command, a pre-commit hook) would be tempted to re-implement its own
regex list, and the patterns would drift — defeating the "0 known secret patterns" fit criterion, which
presumes a single canonical list to match against.

This spec defines that canonical pattern set and the procedure that applies it. It is the technical
backing for the `security-secrets` directive and does not add obligations beyond what that directive and
REQ-SEC-08/REQ-SEC-10 already prescribe.

## Specification

### 1. Scan surface

The secret-hygiene scan (hereafter "the scan") walks every **text file** tracked or staged under:

- `.wingfoil/` (repo-root, once `init` exists) — DNA, directives, workflows, memory documents.
- `docs/04_memory/` — this repository's own Memory documents, which live outside `.wingfoil/`
  under the `path` patterns of its `memory.yaml`: same rule, applied by analogy.

Binary files (detected via a null-byte sniff on the first 8KB, consistent with `git diff --numstat`
binary detection) are skipped — they are out of scope for this spec.

**What a clean scan claims** (`dl-073` (C) and S1). A scan with 0 blocking findings claims **0
findings on the configuration store**, the roots above, and nothing more. It is not a pre-publication
check: it does not say that the repository holds no secret, nor that a remote's push protection will
accept a push, since such a remote reads every pushed file and `test/`, `src/` and `docs/` outside
`docs/04_memory/` are not on this surface. Publishing is governed separately: `package.json` `files`
sets what the npm package contains, and `spec-015` §5 how the publish authenticates. REQ-SEC-08 is
unchanged (`dl-073` S2): it is about `.wingfoil/` content, which this surface covers.

**The fixture rule's check is not this surface.** The `security-secrets` directive's rule S1
(`dl-122`) — a fixture that must match a pattern is built at runtime — is checked by running this
spec's procedure (§4) over the tracked files under `test/`, in the project's own suite. That run uses
§2 and §3 unchanged; it does not widen the surface of this section (`dl-073` (A), declined until
measured).

### 2. Pattern set

Each pattern is a named rule: `{id, regex, description, severity}`. `severity` is `block` (fails the
scan) or `warn` (reported, does not fail). All regexes are case-insensitive unless noted, anchored to
match anywhere in a line (not full-line anchored), and run per-line so a match can be reported with a
file:line location.

```yaml
# Canonical secret-hygiene pattern set (informative YAML; the authoritative shape is the table below)
patterns:
  - id: private-key-pem
    description: "PEM-encoded private key header"
    severity: block
    regex: '-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----'

  - id: generic-api-key-assignment
    description: "Variable assignment that looks like an API key/secret/token"
    severity: block
    regex: '(?i)(api[_-]?key|secret|token|passwd|password)\s*[:=]\s*["'']?(?-i:(?![a-z]+(?:-[a-z]+)+(?![A-Za-z0-9_\-\/+=])))[A-Za-z0-9_\-\/+=]{16,}["'']?'

  - id: aws-access-key-id
    description: "AWS access key ID shape"
    severity: block
    regex: '\b(AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[0-9A-Z]{16}\b'

  - id: aws-secret-access-key
    description: "AWS secret access key assignment (40-char base64-ish, near 'aws' or 'secret')"
    severity: block
    regex: '(?i)aws.{0,20}(secret|key).{0,5}[:=]\s*["'']?[A-Za-z0-9\/+=]{40}["'']?'

  - id: gcp-service-account-key
    description: "GCP service-account JSON key fragment"
    severity: block
    regex: '"type"\s*:\s*"service_account"|"private_key_id"\s*:\s*"[0-9a-f]{40}"'

  - id: github-token
    description: "GitHub personal access / app / fine-grained token"
    severity: block
    regex: '\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{36,}\b'

  - id: slack-token
    description: "Slack bot/user/app token"
    severity: block
    regex: '\bxox[baprs]-[A-Za-z0-9-]{10,}\b'

  - id: jwt-like
    description: "JSON Web Token shape (header.payload.signature, base64url segments)"
    severity: block
    regex: '\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b'

  # dl-037 note: `jwt-like` and `dotenv-style-secret-line` were promoted warn -> block by
  # dl-036-secret-scan-warn-severity-vs-req-sec-08. `generic-high-entropy-string` below stays `warn`
  # deliberately: its value alphabet includes `/` and `-`, so an ordinary long path or identifier
  # after an `auth:` key matches, and promoting it would fire on prose until the gate was disabled.
  - id: generic-high-entropy-string
    description: "Long contiguous base64/hex-alphabet token assigned to a suspicious key name"
    severity: warn
    regex: '(?i)(auth|credential|bearer)\s*[:=]\s*["'']?[A-Za-z0-9_\-\/+=]{24,}["'']?'

  - id: dotenv-style-secret-line
    description: ".env-style KEY=VALUE line where KEY names a credential"
    severity: block
    regex: '(?im)^\s*(?:#+\s*)?(?:[-*]\s+)?(?:(?:export|readonly|declare)(?:\s+-[A-Za-z]+)*\s+)?(?:\$env:)?[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*\S+'
```

Notes on the set:

- `block` patterns are unambiguous secret *shapes* (vendor-specific prefixes, PEM headers) — a match is
  treated as a real finding with no tunable threshold.
- The one `warn` pattern, `generic-high-entropy-string`, is heuristic — reported for human review but
  does not by itself abort a scan, to bound false-positive noise on identifiers that merely look like
  tokens (e.g. long UUIDs, content hashes). `jwt-like` was promoted to `block` by `dl-036` (§4 step 6).
- `dotenv-style-secret-line` is anchored at the start of the line but tolerates a prefix: leading
  whitespace, a `#` comment marker, a `-`/`*` list marker, an `export`, `readonly` or `declare`
  keyword (with flags such as `-x`), and PowerShell's `$env:` scope — the ordinary shapes of shell
  profiles, `.envrc` files, commented-out `.env` lines, indented examples and bulleted documentation.
  The price is a known false-positive
  shape: an indented code assignment whose name contains a credential word (a `token` variable
  assigned a function call, a `max_tokens` setting, a CI step passing a token from a secrets store)
  matches too, and so does a commented-out line of that kind, such as a shell comment that shows a
  credential variable assigned from a command. Such lines belong in an example fence marked
  `<!-- example -->` or, for a file that must carry them, under a `.wingfoil/security-ignore` entry
  (§3). Other assignment syntaxes (`set` in the Windows command prompt, `local`, a `//` comment) are
  not covered.
- `generic-api-key-assignment` refuses a value made only of lower-case words joined by hyphens: the
  `(?-i:…)` lookahead is case-sensitive while the key words stay case-insensitive. Such a value is
  prose (a hyphenated name after a colon, as in a sentence that calls something secret and then names
  a tool), not a key. The price is a known false-negative shape: a real lower-case hyphenated
  passphrase after a key word. A value with a digit, an upper-case letter, an underscore or any other
  value character, or a lower-case run with no hyphen, still matches.
- The generic high-entropy rule intentionally uses a *named-key proximity* heuristic (`auth|credential|
  bearer` near the value) rather than raw Shannon-entropy scoring, to keep the check regex-only,
  deterministic, and dependency-free (no entropy-calculation library), consistent with the project's
  determinism principle (REQ-SYS-07).
- The pattern set is versioned as data (the YAML block above); adding, removing, or re-classifying a
  pattern is a revision to this spec, not a code change scattered across call sites.

### 3. Exclusions

A line is exempt from `block` failure (but still eligible to be listed as `info`) if either:

- It sits inside a fenced code block explicitly labelled as an example/placeholder, i.e. immediately
  preceded by an HTML comment `<!-- example -->` or `<!-- placeholder -->` on its own line; or
  It matches a placeholder shape: the captured value is entirely `x`/`X`/`*` repeats, or one of the
  literal strings `REDACTED`, `PLACEHOLDER`, `EXAMPLE`, `xxxxxxxxxxxxxxxx` (case-insensitive).
- The file path matches a configured ignore list (`.wingfoil/security-ignore` — one glob per line, git
  attribute-style), for genuinely public fixtures (e.g. a BDD `.feature` file that fixture-tests the
  scanner itself with a known-fake key). Ignoring a path is itself an auditable, versioned decision
  (the ignore file lives in git).

### 4. Scan procedure

```
scan(paths) -> ScanResult { blocking: Finding[], warnings: Finding[] }

Finding = { pattern_id, severity, file, line, column, excerpt }
```

1. Resolve `paths` to the scan surface (§1) — either "all tracked+staged files under the configured
   roots" (full scan) or a caller-supplied file list (incremental scan, e.g. only files touched by the
   current commit/task).
2. For each file: skip if binary (§1); otherwise read line by line.
3. For each line, evaluate every pattern in the set (§2) in the fixed order they are declared —
   deterministic iteration, no set/map ordering (per REQ-SYS-07/determinism directive).
4. Apply exclusions (§3); a line surviving exclusion that matches a `block` pattern becomes a
   `blocking` Finding, a `warn` pattern becomes a `warnings` Finding.
5. Return `ScanResult`. The caller decides disposition:
   - **`init` integrity check (REQ-SEC-10):** run the scan over the built-in directive/workflow
     templates about to be installed *before* writing any file. Any `blocking` finding aborts `init`
     before writing partial assets, with a message naming the failing template and `pattern_id`
     (mirrors the "corrupted template" abort behaviour REQ-SEC-10 already requires for schema checks —
     this scan is an additional integrity gate run in the same pre-write pass).
   - **Future `wingfoil audit` / `memory.submit` pre-commit gate (REQ-SEC-08):** run the scan over the
     file(s) about to be committed. Any `blocking` finding fails the operation before the commit is
     created — an operation that cannot complete cleanly writes nothing. `warnings` findings are
     surfaced to the operator but do not block.
6. **Severity is per-pattern, and the split is deliberate** (`dl-036-secret-scan-warn-severity-vs-req-sec-08`).
   Seven patterns `block`; `jwt-like` and `dotenv-style-secret-line` were promoted to `block` because
   their triggers are structural and rarely ambiguous on a curated documentation surface (the
   dotenv pattern's indented-code-assignment shape, §2 notes, is the known exception, handled by the
   §3 escape hatches);
   `generic-high-entropy-string` remains `warn` because its trigger is loose enough to match prose.
   REQ-SEC-08's "matches 0 known secret patterns" is therefore enforced as "0 blocking matches" — the
   one remaining warn-only pattern is surfaced for review rather than failing the gate.
7. Exit/return contract: `blocking.length === 0` is required for the caller to proceed; `warnings` are
   always returned for display regardless of outcome.

### 5. Non-goals

- This spec does not define secret *rotation* or *revocation* procedures — only detection before
  persistence.
- It does not scan runtime process environment or `.env` file *values* proactively outside a scan
  invocation — there is no background watcher, only on-demand scans at the call sites in §4 step 5.
- It does not replace `.gitignore`-based exclusion of files that should never be tracked at all (e.g.
  a real `.env`); it is a defense-in-depth check on what *is* about to be tracked/committed.

## Consequences

- `init`'s integrity check (REQ-SEC-10) and any future audit/pre-commit gate (REQ-SEC-08) both consume
  the pattern set in §2 and the procedure in §4 rather than each defining their own regexes — a single
  place to update when a new secret shape needs coverage (e.g. a new cloud vendor's key prefix).
- Because the pattern set is versioned data, extending it (new vendor prefixes, tightening a heuristic)
  is a revision to this spec's §2 table, tracked like any other tech-spec change — not a silent code
  edit.
- The `security-ignore` file introduced in §3 is a new, small governance surface: it must itself be
  git-versioned and auditable, and any task that adds an entry to it should justify why in its commit
  message (an ignored path is a deliberate hygiene exception, not a default).
- Tasks implementing the actual scan module (once `src/` exists) must reproduce the pattern table in §2
  verbatim (or import it as data) and must not hand-roll alternative regexes — a task that finds this
  set insufficient (missing a vendor shape, too many false positives) should raise a fix against this
  spec rather than diverging locally.

## Process Notes

Authored proactively during `initial-design` (rl-v1) to give the `security-secrets` directive and
REQ-SEC-08/REQ-SEC-10 a concrete, checkable backing, since neither the directive nor the SARD requirement
itself specifies pattern content. Grounded directly in
`.wingfoil/directives/custom/security-secrets.md` and
`docs/02_requirements/03_sard/05_security-compliance.md` (REQ-SEC-08, REQ-SEC-10); no prior-art source
was available, so the pattern set and scan procedure were authored fresh, favoring well-known,
low-false-positive secret shapes (vendor-prefixed tokens, PEM headers) as `block` severity and
entropy-adjacent heuristics as `warn` severity to keep the design deterministic and dependency-free.

**Revision (2026-09-29) — §1's self-hosted analog follows the configuration to the repository root,
per `task-111-configuration-moves-to-the-repository-root` (`bug-075`).** The second bullet named the
nested dogfooding copies, `docs/self/.wingfoil/` and `docs/self/docs/04_memory/`, "until the
tool-managed root exists". That task moved both to the root with `git mv`: the first is now the
`.wingfoil/` of the first bullet, and the analog that remains is the Memory folder, `docs/04_memory/`.
`SCAN_SURFACE_ROOTS` (`src/validation/secret-scan.ts`) changed with it, to `.wingfoil` and
`docs/04_memory`. The scanned content is the same files at their new paths. Edited in place without a
supersede or a state change (the `spec-001` precedent `dl-041` cites); pending the approver's
sign-off at that task's review.

**Revision (2026-10-01) — `dotenv-style-secret-line` tolerates a line prefix, the stale `warn` note is
corrected, and §4 step 5 names the template rather than its path, per
`task-135-make-init-scan-builtin-templates-secrets-refuse-reinitialize` (`bug-037`, `bug-038`).** The
pattern was anchored at column 0, so a credential line behind indentation, `export ` or a list marker
went unseen whenever its value was shorter than the 16 characters `generic-api-key-assignment` needs;
§2's regex now allows that prefix, and `SECRET_PATTERNS` (`src/validation/secret-scan.ts`) mirrors it.
§2's "Notes on the set" still described the `warn` patterns as "generic high-entropy / JWT-shaped",
although `dl-036` had promoted `jwt-like` to `block`; the note now names the one `warn` pattern left.
§4 step 5's `init` caller now exists (`verifyBuiltinTemplates`, `src/core/builtin-integrity.ts`); a
built-in template source carries a name and a kind but no path, so the abort message names the
template as the REQ-SEC-10 schema-check messages do, `built-in <kind> template secret scan failed:
<name> (<pattern_id>, line <n>)`. Tolerating the prefix makes indented code assignments a known
false-positive shape; §2's notes name it with its escape hatches, and §4 step 6 no longer calls the
dotenv trigger near-unambiguous. Edited in place without a supersede or a state change; pending the
approver's sign-off at that task's review.

**Revision (2026-10-05) — §1 states what a clean scan claims, and §2's `dotenv-style-secret-line`
and `generic-api-key-assignment` are revised, per
`task-182-build-secret-shaped-fixtures-runtime-gate-test-scanner` (`dl-073` (C) + S1, `dl-122`,
`bug-055`, `bug-190`, `bug-228`).** §1 already named the roots `.wingfoil/` and `docs/04_memory/`
(Revision of 2026-09-29), matching `SCAN_SURFACE_ROOTS`; it now states the narrowed claim, that a
clean scan is "0 findings on the configuration store" and not a pre-publication check, that
REQ-SEC-08 is unchanged (`dl-073` S2), and that the `security-secrets` S1 check over `test/` runs this
procedure without widening the surface. In §2, `dotenv-style-secret-line`'s prefix adds a `#`
comment, a list marker before the keyword, `readonly`, `declare` with flags, and `$env:` (`bug-190`).
`generic-api-key-assignment` gains a case-sensitive lookahead that refuses a value made only of
lower-case words joined by hyphens (`bug-228`); `SECRET_PATTERNS` implements it by case-folding the
key words, because Node 22's `RegExp` has no `(?-i:…)` group. §2's notes name the new false-positive
and false-negative shapes. Edited in place without a supersede or a state change; pending the
approver's sign-off at that task's review.
