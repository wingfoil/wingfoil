/**
 * Every `git log` reader in `src/` and `scripts/` ignores `log.showSignature` (task-268 AC 2, `bug-291`;
 * the scripts are the same class: `check-governance.cjs` reads `wf()` commits the same way).
 *
 * With `log.showSignature=true` in any git configuration level, `git log` (and `git show` of a
 * commit) prints the signature status on stdout among the formatted lines, where WingFoil's parsers
 * read it as commit names. `--no-show-signature` turns the setting off for the one invocation. This
 * gate enumerates the readers textually — every `'log'` argument in a `src/` TypeScript source or a
 * `scripts/` CommonJS script — and
 * fails, with the file and line, on one whose next argument is not `'--no-show-signature'`, so a new
 * reader without the flag fails here before it reaches a user who signs.
 *
 * **Write the flag as the literal string `'--no-show-signature'`, as the argument right after `'log'`.**
 * The rule is textual: a constant (`'log', NO_SIGNATURE, …`) or a spread holding the flag is flagged as a
 * missing flag. That is safe by design — the gate can only vouch for what it can read — so authors must
 * not introduce one. Known blind spot: an argument list built dynamically (string concatenation, a
 * template literal assembling `log`, a shell command string) holds no `'log'` token and is not seen; a
 * reader written that way escapes the gate and must be avoided.
 *
 * The other ways git could print a commit are pinned too: a `'show'` must read a blob
 * (`` `${rev}:${path}` ``, which prints no signature), and the porcelain log variants
 * (`whatchanged`, `shortlog`, `reflog`) are absent. `rev-list` is not listed: it does not read
 * `log.showSignature` (`git rev-list HEAD` in a repository with the option on and signed commits
 * prints bare shas — recorded in task-268's Execution Notes), and the deduction's `rev-list` is
 * covered behaviourally by `test/core/git-log-show-signature.test.ts`.
 *
 * Textual and deterministic: a sorted walk over `src/`, comments stripped line by line, no
 * subprocess.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');

/** The trees scanned and the extension of the sources in each: `src/`, and the repository scripts. */
const SCANNED: readonly (readonly [string, string])[] = [['src', '.ts'], ['scripts', '.cjs']];

/** Every `extension` source under `dir`, sorted, depth first. */
function sources(dir: string, extension: string): readonly string[] {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sources(full, extension));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found;
}

/** `source` with comment lines (`//`, and `*` / `/**` lines of a block comment) blanked, line numbers kept. */
function code(source: string): string[] {
  return source.split('\n').map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line));
}

/** A `'log'` git argument, and what must follow it. */
const LOG_ARG = /(['"`])log\1/g;
const NO_SIGNATURE_NEXT = /^\s*,\s*'--no-show-signature'/;
/** A `'show'` git argument, and the blob read that must follow it. */
const SHOW_ARG = /(['"`])show\1/g;
const BLOB_NEXT = /^\s*,\s*`\$\{\w+\}:\$\{\w+\}`/;
/** A WingFoil command noun right before `'show'` (`dna show`, `agent show`): a CLI argument list, not git. */
const WINGFOIL_NOUN_BEFORE = /'(dna|agent|workflow|memory|directive|directives)',\s*$/;
/** git commands that print commits and have no business in a parser here. */
const PORCELAIN_LOGS = /(['"`])(whatchanged|shortlog|reflog)\1/;

interface Finding {
  readonly at: string;
  readonly problem: string;
}

/** Every reader of `source` (`path` for the report), and the findings among them. */
function scan(path: string, source: string): { readers: readonly string[]; findings: readonly Finding[] } {
  const readers: string[] = [];
  const findings: Finding[] = [];
  code(source).forEach((line, index) => {
    const at = `${path}:${index + 1}`;
    for (const match of line.matchAll(LOG_ARG)) {
      readers.push(at);
      if (!NO_SIGNATURE_NEXT.test(line.slice(match.index + match[0].length))) {
        findings.push({ at, problem: "'log' not followed by '--no-show-signature'" });
      }
    }
    for (const match of line.matchAll(SHOW_ARG)) {
      if (WINGFOIL_NOUN_BEFORE.test(line.slice(0, match.index))) continue;
      if (!BLOB_NEXT.test(line.slice(match.index + match[0].length))) findings.push({ at, problem: "'show' of something other than a <rev>:<path> blob" });
    }
    if (PORCELAIN_LOGS.test(line)) findings.push({ at, problem: 'a porcelain log command' });
  });
  return { readers, findings };
}

describe('every git log reader in src/ and scripts/ passes --no-show-signature (task-268, bug-291)', () => {
  const results = SCANNED.flatMap(([dir, extension]) => sources(join(REPO_ROOT, dir), extension)).map((file) =>
    scan(relative(REPO_ROOT, file).split(sep).join('/'), readFileSync(file, 'utf-8')),
  );

  it('no reader is missing the flag, shows a commit, or runs a porcelain log', () => {
    expect(results.flatMap((result) => result.findings)).toEqual([]);
  });

  it('enumerates the readers it guards (the scan is not vacuous)', () => {
    const files = [...new Set(results.flatMap((result) => result.readers).map((at) => at.replace(/:\d+$/, '')))];
    expect(files).toEqual([
      'src/core/agent-show.ts',
      'src/core/workflow-deduction.ts',
      'src/memory/git-log.ts',
      'src/memory/history.ts',
      'scripts/check-governance.cjs',
    ]);
  });

  it('can fail: flags a log without the flag, a commit show and a porcelain log; passes the guarded forms', () => {
    const sample = [
      "runGitRead(root, ['log', '--format=%H']);",
      "runGitRead(root, ['log', '--no-show-signature', '--format=%H']);",
      "runGitRead(root, ['-c', 'core.quotePath=false', 'log', '--no-show-signature']);",
      "runGitRead(root, ['show', sha]);",
      'runGitRead(root, [\'show\', `${rev}:${path}`]);',
      "runGitRead(root, ['shortlog']);",
      "run(['dna', 'show', '--format', 'json']);",
      " * a comment naming 'log' is not a reader",
    ].join('\n');
    const { readers, findings } = scan('x.ts', sample);
    expect(readers).toEqual(['x.ts:1', 'x.ts:2', 'x.ts:3']);
    expect(findings.map((finding) => finding.at)).toEqual(['x.ts:1', 'x.ts:4', 'x.ts:6']);
  });
});
