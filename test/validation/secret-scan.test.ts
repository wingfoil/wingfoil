/**
 * task-043-secret-credential-hygiene (REQ-SEC-08) — secret/credential hygiene scan, built to
 * spec-007-secret-hygiene-patterns: the canonical pattern set (§2), exclusions (§3), and scan
 * procedure (§4). Every fixture "secret" below is an obviously-fake value (per the global
 * security-secrets directive) — none are real credentials — and every one that a pattern matches is
 * assembled at runtime (`./helpers/secret-fixtures`, directive rule S1, dl-122): this file holds no
 * secret-shaped source literal (`bug-055`), which the "dl-122 S1" block below checks.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  SECRET_PATTERNS,
  isBinaryContent,
  scanText,
  scanProjectSurface,
  loadIgnoreGlobs,
  matchesIgnoreGlob,
} from '../../src/validation/secret-scan';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import {
  FAKE_API_KEY_ASSIGNMENT,
  FAKE_AWS_ACCESS_KEY_ID,
  FAKE_AWS_SECRET_ACCESS_KEY,
  FAKE_GCP_SERVICE_ACCOUNT_TYPE,
  FAKE_GITHUB_TOKEN,
  FAKE_JWT,
  FAKE_NPM_TOKEN_LINE,
  FAKE_PEM_RSA_HEADER,
  FAKE_SLACK_TOKEN,
} from './helpers/secret-fixtures';

describe('SECRET_PATTERNS — canonical pattern set (spec-007 §2)', () => {
  it('declares exactly the 10 named rules from spec-007 §2, in declared order', () => {
    expect(SECRET_PATTERNS.map((p) => p.id)).toEqual([
      'private-key-pem',
      'generic-api-key-assignment',
      'aws-access-key-id',
      'aws-secret-access-key',
      'gcp-service-account-key',
      'github-token',
      'slack-token',
      'jwt-like',
      'generic-high-entropy-string',
      'dotenv-style-secret-line',
    ]);
  });

  it('classifies each pattern block/warn severity exactly as spec-007 §2 (dl-036: jwt-like, dotenv promoted)', () => {
    const bySeverity = Object.fromEntries(SECRET_PATTERNS.map((p) => [p.id, p.severity]));
    expect(bySeverity['private-key-pem']).toBe('block');
    expect(bySeverity['generic-api-key-assignment']).toBe('block');
    expect(bySeverity['aws-access-key-id']).toBe('block');
    expect(bySeverity['aws-secret-access-key']).toBe('block');
    expect(bySeverity['gcp-service-account-key']).toBe('block');
    expect(bySeverity['github-token']).toBe('block');
    expect(bySeverity['slack-token']).toBe('block');
    expect(bySeverity['jwt-like']).toBe('block');
    expect(bySeverity['generic-high-entropy-string']).toBe('warn');
    expect(bySeverity['dotenv-style-secret-line']).toBe('block');
  });
});

describe('scanText — block-severity pattern shapes (spec-007 §2)', () => {
  it('flags a PEM private-key header', () => {
    const result = scanText(`${FAKE_PEM_RSA_HEADER}\nMIIFAKEfake==\n`, 'fixture.txt');
    expect(result.blocking.map((f) => f.patternId)).toContain('private-key-pem');
  });

  it('flags a generic api-key assignment', () => {
    const result = scanText(`${FAKE_API_KEY_ASSIGNMENT}\n`, 'fixture.txt');
    expect(result.blocking.map((f) => f.patternId)).toContain('generic-api-key-assignment');
  });

  it('flags an AWS access key ID shape', () => {
    const result = scanText(`aws_access_key_id = ${FAKE_AWS_ACCESS_KEY_ID}\n`, 'fixture.txt');
    expect(result.blocking.map((f) => f.patternId)).toContain('aws-access-key-id');
  });

  it('flags an AWS secret access key assignment', () => {
    const result = scanText(
      `aws_secret_key: "${FAKE_AWS_SECRET_ACCESS_KEY}"\n`,
      'fixture.txt',
    );
    expect(result.blocking.map((f) => f.patternId)).toContain('aws-secret-access-key');
  });

  it('flags a GCP service-account JSON key fragment', () => {
    const result = scanText(`  ${FAKE_GCP_SERVICE_ACCOUNT_TYPE},\n`, 'fixture.json');
    expect(result.blocking.map((f) => f.patternId)).toContain('gcp-service-account-key');
  });

  it('flags a GitHub personal access token', () => {
    const result = scanText(`${FAKE_GITHUB_TOKEN}\n`, 'fixture.txt');
    expect(result.blocking.map((f) => f.patternId)).toContain('github-token');
  });

  it('flags a Slack bot token', () => {
    const result = scanText(`${FAKE_SLACK_TOKEN}\n`, 'fixture.txt');
    expect(result.blocking.map((f) => f.patternId)).toContain('slack-token');
  });
});

describe('scanText — patterns promoted warn → block by dl-036 (spec-007 §2)', () => {
  it('blocks on a JWT-shaped string', () => {
    const result = scanText(`token = ${FAKE_JWT}\n`, 'fixture.txt');
    expect(result.blocking.map((f) => f.patternId)).toContain('jwt-like');
    expect(result.warnings.map((f) => f.patternId)).not.toContain('jwt-like');
  });

  it('blocks on a .env-style credential line (the NPM_TOKEN leak dl-036 names)', () => {
    const result = scanText(`${FAKE_NPM_TOKEN_LINE}\n`, '.env.fixture');
    expect(result.blocking.map((f) => f.patternId)).toContain('dotenv-style-secret-line');
    expect(result.warnings.map((f) => f.patternId)).not.toContain('dotenv-style-secret-line');
  });
});

/**
 * task-135 / `bug-037-dotenv-secret-pattern-misses-prefixed-lines`: `dotenv-style-secret-line` was
 * anchored at column 0, so a credential assignment behind indentation, an `export` keyword or a
 * Markdown list marker went unseen. The other block patterns catch the same lines only when the value
 * is 16+ characters long (`generic-api-key-assignment`), so every value below is SHORT on purpose:
 * it is the dotenv pattern, and only it, that has to catch them.
 */
describe('scanText — dotenv-style-secret-line tolerates a line prefix (bug-037, spec-007 §2)', () => {
  const blockingIds = (line: string): string[] =>
    scanText(`${line}\n`, '.envrc.fixture').blocking.map((f) => f.patternId);

  it.each([
    ['indentation', '  TOKEN=abcd1234'],
    ['a tab', '\tNPM_TOKEN=abc123'],
    ['an `export` keyword', 'export API_SECRET=fake99'],
    ['indentation and `export`', '    export DB_PASSWORD=fake99'],
    ['a `-` list marker', '- PASSWORD=fake99'],
    ['a `*` list marker', '* GH_TOKEN=fake99'],
  ])('blocks a credential line behind %s', (_prefix, line) => {
    expect(blockingIds(line)).toContain('dotenv-style-secret-line');
  });

  it('still blocks the column-0 form', () => {
    expect(blockingIds('NPM_TOKEN=abc123')).toContain('dotenv-style-secret-line');
  });

  it.each([
    ['prose naming a token', 'the token = abc123'],
    ['a code assignment', 'const token = getToken()'],
    ['a YAML colon mapping, not an assignment', '  TOKEN: abc123'],
    ['an unrelated key', '  export NODE_ENV=production'],
    ['an empty value', 'export API_SECRET='],
  ])('does not match %s', (_what, line) => {
    expect(blockingIds(line)).not.toContain('dotenv-style-secret-line');
  });

  /**
   * task-135 review: the cost of tolerating a prefix. An indented code assignment whose name contains
   * a credential word now matches too — a known false-positive shape, documented in spec-007 §2's
   * notes with its escape hatches (an `<!-- example -->` fence, a `security-ignore` entry). Pinned
   * so the trade-off is a decision on record, not a surprise.
   */
  it.each([
    ['an indented code assignment', '  token = getToken()'],
    ['an indented counter', '    tokens_used = len(x)'],
    ['an indented config value', '  max_tokens = 4096'],
  ])('BLOCKS %s (known false-positive shape, spec-007 §2 notes)', (_what, line) => {
    expect(blockingIds(line)).toContain('dotenv-style-secret-line');
  });

  it('exempts the same line inside an `<!-- example -->` fence (spec-007 §3 escape hatch)', () => {
    const result = scanText('<!-- example -->\n```\n  token = getToken()\n```\n', 'fixture.md');
    expect(result.blocking).toEqual([]);
    expect(result.info.map((f) => f.exemptReason)).toContain('fenced-example');
  });

  it('downgrades a prefixed placeholder value to info, as the column-0 form is (spec-007 §3)', () => {
    const result = scanText('export API_TOKEN=REDACTED\n', '.envrc.fixture');
    expect(result.blocking).toEqual([]);
    expect(result.info.map((f) => [f.patternId, f.exemptReason])).toContainEqual([
      'dotenv-style-secret-line',
      'placeholder-value',
    ]);
  });
});

/**
 * task-182 / `bug-190-the-dotenv-secret-pattern-misses-commented-readonly-declare-and-powershell-assignments`:
 * after bug-037 the prefix still missed a commented-out credential line (the common `.env` leak shape),
 * a list marker in front of `export`, the `readonly` and `declare` shell builtins, and PowerShell's
 * `$env:` assignment. Values stay short, as above, so only the dotenv pattern can catch them.
 */
describe('scanText — dotenv-style-secret-line covers comment, readonly, declare and $env: prefixes (bug-190, spec-007 §2)', () => {
  const blockingIds = (line: string): string[] =>
    scanText(`${line}\n`, '.envrc.fixture').blocking.map((f) => f.patternId);

  it.each([
    ['a `#` comment', '# TOKEN=abcdef123'],
    ['a `#` comment with no space', '#NPM_TOKEN=abcdef123'],
    ['a list marker and `export`', '- export TOKEN=abcdef123'],
    ['`readonly`', 'readonly API_KEY=abcdef123'],
    ['`declare` with a flag', 'declare -x DB_PASSWORD=abcdef123'],
    ['PowerShell `$env:`', '$env:API_TOKEN="abcdef123"'],
  ])('blocks a credential line behind %s', (_prefix, line) => {
    expect(blockingIds(line)).toContain('dotenv-style-secret-line');
  });

  it.each([
    ['a comment naming an unrelated key', '# NODE_ENV=production'],
    ['a comment with a YAML colon mapping', '# TOKEN: abc123'],
    ['`readonly` on an unrelated key', 'readonly NODE_ENV=production'],
    ['an empty `$env:` value', '$env:API_TOKEN='],
  ])('does not match %s', (_what, line) => {
    expect(blockingIds(line)).not.toContain('dotenv-style-secret-line');
  });
});

/**
 * task-182 / `bug-228-the-generic-api-key-assignment-secret-pattern-flags-prose-such-as-secret-scorecard-action-in-memory-documents`:
 * a sentence whose colon follows a key word and precedes a hyphenated name of 16+ characters read as
 * a key assignment. A value made only of lower-case words joined by hyphens is prose, not a key.
 * The lines that must still block are given as (key, value) halves and joined at runtime, so this
 * source file holds no secret-shaped literal (dl-122 S1).
 */
describe('scanText — generic-api-key-assignment does not read prose as a key (bug-228, spec-007 §2)', () => {
  const blockingIds = (line: string): string[] =>
    scanText(`${line}\n`, 'notes.md').blocking.map((f) => f.patternId);

  it.each([
    ['the sentence that failed the B6 gate', 'It does not make the scores secret: scorecard-action uploads them'],
    ['a decision about a token', 'The refresh token: rotation-every-release is decided'],
    ['a hyphenated passphrase in prose', 'the password: correct-horse-battery-staple'],
  ])('does not block %s', (_what, line) => {
    expect(blockingIds(line)).not.toContain('generic-api-key-assignment');
  });

  it.each([
    ['a mixed-case value', 'client_secret: ', 'abcdefGHIJKLmnopQRST'],
    ['a value with a digit', 'the password: ', 'correct-horse-battery-staple-9'],
    ['a value with an underscore', 'token: ', 'abcd_efgh_ijkl_mnop'],
    ['a lower-case run with no hyphen', 'secret: ', 'abcdefghijklmnopqrstuv'],
    ['a capitalised key word', 'Client_Secret: ', 'abcdefGHIJKLmnopQRST'],
  ])('still blocks %s', (_what, key, value) => {
    expect(blockingIds(key + value)).toContain('generic-api-key-assignment');
  });
});

describe('scanText — warn-severity pattern shapes (spec-007 §2)', () => {
  it('warns (not blocks) on a generic high-entropy string near a credential-shaped key', () => {
    const result = scanText('auth: fakeFAKEfakeFAKEfakeFAKEfakeFAKE1234\n', 'fixture.txt');
    expect(result.warnings.map((f) => f.patternId)).toContain('generic-high-entropy-string');
    expect(result.blocking.map((f) => f.patternId)).not.toContain('generic-high-entropy-string');
  });

});

describe('scanText — deterministic ordering (REQ-SYS-07, spec-007 §4 step 3)', () => {
  it('orders same-line findings by pattern declaration order, not by match column', () => {
    // The api-key match sits at a LOWER column than the PEM-header match, yet private-key-pem is
    // declared first in SECRET_PATTERNS — the finding order must follow declaration order.
    const line = `${FAKE_API_KEY_ASSIGNMENT} ${FAKE_PEM_RSA_HEADER}`;
    const result = scanText(line, 'fixture.txt');
    expect(result.blocking.map((f) => f.patternId)).toEqual([
      'private-key-pem',
      'generic-api-key-assignment',
    ]);
  });
});

describe('scanText — exclusions (spec-007 §3)', () => {
  it('downgrades an all-X placeholder value to info, not blocking', () => {
    const result = scanText('api_key: "XXXXXXXXXXXXXXXXXXXX"\n', 'fixture.txt');
    expect(result.blocking).toHaveLength(0);
    const finding = result.info.find((f) => f.patternId === 'generic-api-key-assignment');
    expect(finding?.exemptReason).toBe('placeholder-value');
  });

  it('downgrades a literal REDACTED/PLACEHOLDER/EXAMPLE dotenv value to info, not blocking', () => {
    for (const literal of ['REDACTED', 'PLACEHOLDER', 'EXAMPLE']) {
      const result = scanText(`API_TOKEN=${literal}\n`, '.env.fixture');
      expect(result.blocking).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      const finding = result.info.find((f) => f.patternId === 'dotenv-style-secret-line');
      expect(finding?.exemptReason).toBe('placeholder-value');
    }
  });

  it('downgrades a finding inside a fence immediately preceded by <!-- example --> to info', () => {
    const content = [
      '<!-- example -->',
      '```',
      FAKE_API_KEY_ASSIGNMENT,
      '```',
    ].join('\n');
    const result = scanText(content, 'fixture.md');
    expect(result.blocking).toHaveLength(0);
    expect(result.info.some((f) => f.exemptReason === 'fenced-example')).toBe(true);
  });

  it('does NOT exempt a finding inside an unlabelled fence', () => {
    const content = ['```', FAKE_API_KEY_ASSIGNMENT, '```'].join('\n');
    const result = scanText(content, 'fixture.md');
    expect(result.blocking.some((f) => f.patternId === 'generic-api-key-assignment')).toBe(true);
  });

  it('re-arms after a fence closes — a match after the fence is still blocking', () => {
    const content = [
      '<!-- example -->',
      '```',
      'ignored content',
      '```',
      FAKE_API_KEY_ASSIGNMENT,
    ].join('\n');
    const result = scanText(content, 'fixture.md');
    expect(result.blocking.some((f) => f.patternId === 'generic-api-key-assignment')).toBe(true);
  });

  it('downgrades every finding in a path-ignored file to info via pathIgnored', () => {
    const result = scanText(`${FAKE_API_KEY_ASSIGNMENT}\n`, 'fixture.txt', {
      pathIgnored: true,
    });
    expect(result.blocking).toHaveLength(0);
    const finding = result.info.find((f) => f.patternId === 'generic-api-key-assignment');
    expect(finding?.exemptReason).toBe('ignore-path');
  });
});

describe('isBinaryContent — null-byte sniff on first 8KB (spec-007 §1)', () => {
  it('is false for plain text', () => {
    expect(isBinaryContent(Buffer.from('hello world\n', 'utf-8'))).toBe(false);
  });

  it('is true when a null byte appears within the first 8KB', () => {
    const buf = Buffer.concat([Buffer.from('hello'), Buffer.from([0x00]), Buffer.from('world')]);
    expect(isBinaryContent(buf)).toBe(true);
  });

  it('ignores a null byte beyond the first 8KB', () => {
    const head = Buffer.alloc(8192, 0x61); // 'a' repeated
    const buf = Buffer.concat([head, Buffer.from([0x00])]);
    expect(isBinaryContent(buf)).toBe(false);
  });
});

describe('scanProjectSurface — the REQ-SEC-08 Fit Criterion made checkable (spec-007 §1, §4 step 5)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('scans tracked files under the configured surface roots and finds 0 blocking on clean content', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'modules: [core]\n');
    writeFixtureFile(repo, 'docs/04_memory/bugs/bug-001-clean.md', 'status: open\n');
    writeFixtureFile(repo, 'not-in-scope/outside.md', `${FAKE_API_KEY_ASSIGNMENT}\n`);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'seed']);

    const result = scanProjectSurface(repo);
    expect(result.blocking).toHaveLength(0);
  });

  it('detects a real-shaped block finding committed under the scan surface', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(
      repo,
      '.wingfoil/directives/custom/leaky.md',
      `${FAKE_API_KEY_ASSIGNMENT}\n`,
    );
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'seed']);

    const result = scanProjectSurface(repo);
    expect(result.blocking.some((f) => f.file === '.wingfoil/directives/custom/leaky.md')).toBe(
      true,
    );
  });

  it('only scans tracked/staged files, not untracked working-tree noise', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'modules: [core]\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'seed']);
    writeFixtureFile(repo, '.wingfoil/untracked-leak.md', `${FAKE_API_KEY_ASSIGNMENT}\n`);

    const result = scanProjectSurface(repo);
    expect(result.blocking).toHaveLength(0);
  });

  it('honours a .wingfoil/security-ignore glob — an ignored path is downgraded to info', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/security-ignore', '.wingfoil/fixtures/**\n');
    writeFixtureFile(
      repo,
      '.wingfoil/fixtures/known-fake.md',
      `${FAKE_API_KEY_ASSIGNMENT}\n`,
    );
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'seed']);

    const result = scanProjectSurface(repo);
    expect(result.blocking).toHaveLength(0);
    expect(result.info.some((f) => f.exemptReason === 'ignore-path')).toBe(true);
  });

  it('skips binary files under the scan surface without throwing', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'modules: [core]\n');
    writeFixtureBinaryFile(repo, '.wingfoil/blob.bin', Buffer.from([0x00, 0x01, 0x02, 0xff]));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'seed']);

    expect(() => scanProjectSurface(repo)).not.toThrow();
  });
});

/**
 * bug-015 — the scanner used to enumerate the git index but read the working tree, so the two could
 * disagree. Contract since task-061: it enumerates AND reads the index — the content the next commit
 * would contain, which is what the pre-commit / pre-publish gate spec-007 §4 step 5 names must judge.
 */
describe('scanProjectSurface — reads the git index, not the working tree (bug-015)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('does not throw when an indexed file is missing from disk, and still reports its indexed content', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'modules: [core]\n');
    writeFixtureFile(repo, '.wingfoil/leaky.md', `${FAKE_API_KEY_ASSIGNMENT}\n`);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'seed']);
    rmSync(join(repo, '.wingfoil/leaky.md')); // deleted on disk, deletion NOT staged

    const result = scanProjectSurface(repo);
    expect(result.filesScanned).toBe(2);
    expect(result.blocking.map((f) => f.file)).toEqual(['.wingfoil/leaky.md']);
  });

  it('does not list a staged deletion at all', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'modules: [core]\n');
    writeFixtureFile(repo, '.wingfoil/leaky.md', `${FAKE_API_KEY_ASSIGNMENT}\n`);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'seed']);
    git(repo, ['rm', '--quiet', '.wingfoil/leaky.md']);

    const result = scanProjectSurface(repo);
    expect(result.filesScanned).toBe(1);
    expect(result.blocking).toEqual([]);
  });

  it('judges the staged blob: a clean unstaged edit cannot hide a staged secret', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/leaky.md', `${FAKE_API_KEY_ASSIGNMENT}\n`);
    git(repo, ['add', '-A']);
    writeFixtureFile(repo, '.wingfoil/leaky.md', 'nothing to see here\n'); // unstaged

    const result = scanProjectSurface(repo);
    expect(result.blocking.map((f) => f.patternId)).toEqual(['generic-api-key-assignment']);
  });

  it('judges the staged blob: an unstaged secret edit is not what the next commit contains', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/notes.md', 'nothing to see here\n');
    git(repo, ['add', '-A']);
    writeFixtureFile(repo, '.wingfoil/notes.md', `${FAKE_API_KEY_ASSIGNMENT}\n`); // unstaged

    expect(scanProjectSurface(repo).blocking).toEqual([]);
  });

  it('scans nothing for an empty surface-root list (not the whole index)', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'outside.md', `${FAKE_API_KEY_ASSIGNMENT}\n`);
    git(repo, ['add', '-A']);

    expect(scanProjectSurface(repo, { surfaceRoots: [] })).toEqual({ blocking: [], warnings: [], info: [], filesScanned: 0 });
  });

  it('skips a gitlink (submodule) entry — a commit id, not a blob to read', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'modules: [core]\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'seed']);
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    git(repo, ['update-index', '--add', '--cacheinfo', `160000,${head},.wingfoil/vendored`]);

    expect(scanProjectSurface(repo).filesScanned).toBe(1);
  });

  it('throws on an index entry whose blob is missing from the object store (corruption, not a verdict)', () => {
    repo = makeTempGitRepo();
    const absent = '1'.repeat(40);
    git(repo, ['update-index', '--add', '--cacheinfo', `100644,${absent},.wingfoil/ghost.md`]);

    expect(() => scanProjectSurface(repo)).toThrow(/could not read the indexed blob of \.wingfoil\/ghost\.md/);
  });
});

/**
 * The literal REQ-SEC-08 Fit Criterion, second clause — "a scan of committed `.wingfoil/` content
 * matches **0** known secret patterns" — asserted against **this repository's own tracked content**,
 * not a temp fixture. Every other `scanProjectSurface` case above builds a `makeTempGitRepo()`
 * fixture and therefore only proves the scanner works on content the test itself wrote; none of them
 * would notice a real credential committed under `docs/04_memory/` or
 * `.wingfoil/`. This block is the standing guard that does, in the same spirit as
 * `test/lint/lint-clean.test.ts` (ESLint over the real tree) and `test/docs/api-docs.test.ts`.
 *
 * The Fit Criterion's *first* clause ("after `init`, the built-in `security` directive is present")
 * is not asserted here: it is `task-057-builtin-directive-templates`'s deliverable, asserted in
 * `test/core/builtin-directive-templates.test.ts` › "REQ-SEC-08 (a)".
 *
 * Non-vacuity: `ScanResult.filesScanned` reports how many files the scan actually read, so a broken
 * surface root, a `git ls-files` that returned nothing, or a scan pointed at the wrong directory
 * cannot masquerade as "clean". The floor below is asserted alongside every clean verdict, and the
 * last case shows what a vacuous scan looks like (`filesScanned: 0`) so the floor is a real
 * discriminator rather than a number nothing could fail. Deterministic: the verdict is a pure
 * function of this repo's indexed content and the fixed pattern set — no wall-clock, no randomness.
 */
describe("REQ-SEC-08 Fit Criterion — this repository's own indexed (tracked + staged) surface", () => {
  /** The worktree root: `test/validation/` → up two. */
  const repoRoot = join(__dirname, '..', '..');

  it('reads a non-trivial number of this repository\'s own tracked surface files', () => {
    // Guards the guard: without this, "0 blocking" below could mean "0 files examined".
    expect(scanProjectSurface(repoRoot).filesScanned).toBeGreaterThan(100);
  });

  it('gates on the dl-036 blocking set — every spec-007 §2 pattern except generic-high-entropy-string', () => {
    // "0 blocking" below only covers the patterns declared `block`; pin that set so a silent
    // re-classification back to `warn` cannot weaken the Fit Criterion without failing here.
    expect(SECRET_PATTERNS.filter((p) => p.severity === 'block').map((p) => p.id)).toEqual([
      'private-key-pem',
      'generic-api-key-assignment',
      'aws-access-key-id',
      'aws-secret-access-key',
      'gcp-service-account-key',
      'github-token',
      'slack-token',
      'jwt-like',
      'dotenv-style-secret-line',
    ]);
    expect(SECRET_PATTERNS.filter((p) => p.severity === 'warn').map((p) => p.id)).toEqual([
      'generic-high-entropy-string',
    ]);
  });

  it('matches 0 blocking secret patterns across this repository\'s indexed surface', () => {
    const result = scanProjectSurface(repoRoot);

    expect(result.filesScanned).toBeGreaterThan(100);
    // `toEqual([])` rather than `toHaveLength(0)`: a failure then names the offending
    // file/line/pattern instead of just reporting a count mismatch.
    expect(result.blocking).toEqual([]);
  });

  it('reports filesScanned: 0 for a surface root this repository does not have', () => {
    // Proves `filesScanned` is a real count of examined files — an empty surface scores 0, so the
    // >100 floor above cannot be satisfied by a scan that looked at nothing.
    const result = scanProjectSurface(repoRoot, { surfaceRoots: ['no-such-surface-root'] });

    expect(result.filesScanned).toBe(0);
    expect(result.blocking).toEqual([]);
  });
});

/**
 * dl-122 Q1 (b) / `security-secrets` S1 — a fixture that must match a secret pattern is built at
 * runtime, never written as one source literal. This is the rule's check: the project's own scanner,
 * run over every tracked (indexed) file under `test/`, finds no blocking match. `test/` is not the
 * production scan surface (spec-007 §1, `SCAN_SURFACE_ROOTS`, unchanged — dl-073 (A) declined); it
 * is the surface the rule applies to, chosen here. GitHub push protection rejected this repository's
 * pushes over a literal in this very file (`bug-055`): every scanner reads every file.
 *
 * Like `scanProjectSurface`, it judges the git index, so an edit is seen once it is staged. A line
 * that must stay literal uses a spec-007 §3 exclusion (an `<!-- example -->` fence, a placeholder
 * value, a `.wingfoil/security-ignore` glob).
 */
describe('dl-122 S1 — no blocking secret-shaped literal in the tracked files under test/', () => {
  const repoRoot = join(__dirname, '..', '..');
  const TEST_SCAN_ROOTS = ['test'];

  it('reads every tracked file under test/ (non-vacuity)', () => {
    expect(scanProjectSurface(repoRoot, { surfaceRoots: TEST_SCAN_ROOTS }).filesScanned).toBeGreaterThan(100);
  });

  it('matches 0 blocking secret patterns across the tracked files under test/', () => {
    // `toEqual([])` names each offending file, line and pattern on failure.
    expect(scanProjectSurface(repoRoot, { surfaceRoots: TEST_SCAN_ROOTS }).blocking).toEqual([]);
  });

  describe('the same scan on a planted literal (the clean verdict above is a real discriminator)', () => {
    let repo: string;
    afterEach(() => removeTempDir(repo));

    it('fails on a tracked test file that holds a secret-shaped literal', () => {
      repo = makeTempGitRepo();
      // The planted literal is assembled at runtime, so this file does not hold it (S1).
      writeFixtureFile(repo, 'test/planted.test.ts', `const pem = '${FAKE_PEM_RSA_HEADER}';\n`);
      writeFixtureFile(repo, 'test/clean.test.ts', 'const ok = 1;\n');
      git(repo, ['add', '-A']);

      const result = scanProjectSurface(repo, { surfaceRoots: TEST_SCAN_ROOTS });
      expect(result.filesScanned).toBe(2);
      expect(result.blocking.map((f) => [f.file, f.patternId])).toEqual([
        ['test/planted.test.ts', 'private-key-pem'],
      ]);
    });
  });
});

describe('matchesIgnoreGlob — security-ignore glob semantics (spec-007 §3)', () => {
  it('matches an exact path with no wildcards', () => {
    expect(matchesIgnoreGlob('.wingfoil/fixtures/known.md', ['.wingfoil/fixtures/known.md'])).toBe(
      true,
    );
    expect(matchesIgnoreGlob('.wingfoil/other.md', ['.wingfoil/fixtures/known.md'])).toBe(false);
  });

  it('treats a single `*` as a single-segment (non-separator-crossing) wildcard', () => {
    expect(matchesIgnoreGlob('.wingfoil/leak.md', ['.wingfoil/*.md'])).toBe(true);
    // A single `*` must NOT cross a `/` separator.
    expect(matchesIgnoreGlob('.wingfoil/sub/leak.md', ['.wingfoil/*.md'])).toBe(false);
  });

  it('treats `**` as a multi-segment (separator-crossing) wildcard', () => {
    expect(matchesIgnoreGlob('.wingfoil/a/b/leak.md', ['.wingfoil/**'])).toBe(true);
  });

  it('treats `?` as a single non-separator character', () => {
    expect(matchesIgnoreGlob('.wingfoil/a.md', ['.wingfoil/?.md'])).toBe(true);
    expect(matchesIgnoreGlob('.wingfoil/ab.md', ['.wingfoil/?.md'])).toBe(false);
  });

  it('returns false against an empty glob list', () => {
    expect(matchesIgnoreGlob('.wingfoil/anything.md', [])).toBe(false);
  });
});

describe('loadIgnoreGlobs — security-ignore file parsing (spec-007 §3)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('returns [] when the ignore file does not exist', () => {
    repo = makeTempGitRepo();
    expect(loadIgnoreGlobs(join(repo, '.wingfoil/security-ignore'))).toEqual([]);
  });

  it('skips blank lines and #-comments, trims each glob', () => {
    repo = makeTempGitRepo();
    writeFixtureFile(
      repo,
      '.wingfoil/security-ignore',
      ['# a comment', '', '  .wingfoil/fixtures/**  ', 'docs/04_memory/drafts/**', ''].join('\n'),
    );
    expect(loadIgnoreGlobs(join(repo, '.wingfoil/security-ignore'))).toEqual([
      '.wingfoil/fixtures/**',
      'docs/04_memory/drafts/**',
    ]);
  });
});

/** Write a binary fixture file (parent dirs created) — {@link writeFixtureFile} is utf-8-text-only. */
function writeFixtureBinaryFile(root: string, relativePath: string, content: Buffer): void {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

/**
 * dl-036 action 2 — the spec-007 §3 escape hatch must be discoverable where an author writing a memory
 * document meets it: the global `security-secrets` directive, auto-loaded for every role. Its worked
 * examples live on the scanned surface, so they must themselves pass the gate they describe — and must
 * actually exercise the hatch (land in `info`), or they would prove nothing.
 */
describe('escape hatch documented in the security-secrets directive (dl-036, spec-007 §3)', () => {
  const directivePath = '.wingfoil/directives/custom/security-secrets.md';
  const directive = readFileSync(join(__dirname, '..', '..', directivePath), 'utf-8');

  it('names all three spec-007 §3 exclusions', () => {
    expect(directive).toContain('<!-- example -->');
    expect(directive).toContain('<!-- placeholder -->');
    expect(directive).toContain('REDACTED');
    expect(directive).toContain('.wingfoil/security-ignore');
    expect(directive).toContain('spec-007');
  });

  it('its own worked examples pass the scan only because they use the hatch', () => {
    const result = scanText(directive, directivePath);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
    const reasons = new Set(result.info.map((f) => f.exemptReason));
    expect(reasons).toEqual(new Set(['fenced-example', 'placeholder-value']));
    expect(result.info.map((f) => f.patternId)).toContain('dotenv-style-secret-line');
  });
});
