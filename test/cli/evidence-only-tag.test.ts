/**
 * task-282 AC 4 (`bug-312`, `dl-099` §1, task-219 D2; approver rulings D2 (a), D3): a bound pre-check of
 * `release-publishing`'s `tag` that the commits between the rehearsed candidate and the branch tip change
 * only evidence paths.
 *
 * `node scripts/publish-staging.cjs --check-evidence-only <transcript> --evidence <prefix/> [...]` reads the
 * candidate from the rehearsal transcript (`checkTranscript`), refuses a candidate that is not an ancestor
 * of `HEAD`, and runs `git diff --name-only --no-renames -z <candidate>..HEAD`: every path must start with
 * one of the `--evidence` prefixes, otherwise it fails naming the paths that require a re-cut. The evidence
 * paths are declared only in the binding's arguments (D2 (a)).
 *
 * Deterministic: temp git repositories with a fixed local identity, no clock, no network.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { LOG_PREFIX, checkEvidenceOnly, outsideEvidence, parseArgs, stagingPassedLine } from '../../scripts/publish-staging.cjs';
import type { StagingGit } from '../../scripts/publish-staging.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'publish-staging.cjs');
const EVIDENCE = ['docs/04_memory/', 'docs/05_plans/', 'docs/07_gates/'];
const TRANSCRIPT_PATH = 'docs/07_gates/rl-{release.release-line}/rel-{release.version}-staging-rehearsal.md';
const PKG = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { name: string; version: string };
const FIXTURE_PKG = { name: 'wingfoil', version: '0.3.0' };

/** A passing rehearsal transcript for `pkg`, whose smoke checked `commit`. */
function transcript(pkg: { name: string; version: string }, commit: string): string {
  return [
    'Verdaccio up on http://localhost:4873/',
    `  ok   wingfoil --version = ${pkg.version} (${commit}) — match`,
    stagingPassedLine(pkg.name, pkg.version),
  ]
    .map((line) => `${LOG_PREFIX}${line}`)
    .join('\n')
    .concat('\n');
}

/** The git runner the check takes, in `repo`. */
const gitIn =
  (repo: string): StagingGit =>
  (args) => {
    const run = spawnSync('git', [...args], { cwd: repo, encoding: 'utf-8' });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  };

/** Commit everything as `message`; returns the new HEAD. */
function commitAll(repo: string, message: string): string {
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

/** A repository whose HEAD is the candidate C: `src/a.ts` and one Memory file. */
function makeCandidateRepo(): { repo: string; candidate: string } {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, 'src/a.ts', 'export const a = 1;\n');
  writeFixtureFile(repo, 'docs/04_memory/seed.md', '# Seed\n');
  return { repo, candidate: commitAll(repo, 'candidate') };
}

describe('task-282 AC 4 — outsideEvidence', () => {
  it('returns the paths under no evidence prefix, sorted', () => {
    expect(outsideEvidence(['docs/04_memory/a.md', 'src/b.ts', 'docs/07_gates/c.md'], EVIDENCE)).toEqual(['src/b.ts']);
    expect(outsideEvidence(['src/z.ts', 'README.md', 'docs/05_plans/p.md'], EVIDENCE)).toEqual(['README.md', 'src/z.ts']);
  });
});

describe('task-282 AC 4 — checkEvidenceOnly against a temp repository', () => {
  let repo: string;
  let candidate: string;
  beforeEach(() => {
    ({ repo, candidate } = makeCandidateRepo());
  });
  afterEach(() => removeTempDir(repo));

  const check = (text = transcript(FIXTURE_PKG, candidate)) => checkEvidenceOnly(text, FIXTURE_PKG, gitIn(repo), EVIDENCE);

  it('passes when only evidence paths changed after the candidate, naming the candidate and the tip', () => {
    writeFixtureFile(repo, 'docs/07_gates/t.md', '# transcript\n');
    writeFixtureFile(repo, 'docs/04_memory/x.md', '# x\n');
    const tip = commitAll(repo, 'evidence');
    expect(check()).toEqual({ ok: true, commit: candidate, tip, paths: ['docs/04_memory/x.md', 'docs/07_gates/t.md'] });
  });

  it('fails when a commit after the candidate changes src/, naming the path and the re-cut', () => {
    writeFixtureFile(repo, 'docs/07_gates/t.md', '# transcript\n');
    writeFixtureFile(repo, 'src/a.ts', 'export const a = 2;\n');
    commitAll(repo, 'a code change');
    const verdict = check();
    expect(verdict.ok).toBe(false);
    const reason = verdict.ok ? '' : verdict.reason;
    expect(reason).toContain('must be re-cut');
    expect(reason).toContain('src/a.ts');
    expect(reason).not.toContain('docs/07_gates/t.md');
  });

  it('a move out of src/ into an evidence path is refused, naming its source path (--no-renames)', () => {
    git(repo, ['mv', 'src/a.ts', 'docs/04_memory/a.ts']);
    commitAll(repo, 'move');
    const verdict = check();
    expect(verdict).toEqual({ ok: false, reason: expect.stringContaining('src/a.ts') });
  });

  it('a non-ASCII path with a space under an evidence prefix passes (paths are read unquoted)', () => {
    writeFixtureFile(repo, 'docs/04_memory/é note.md', '# é\n');
    commitAll(repo, 'note');
    expect(check()).toMatchObject({ ok: true, commit: candidate, paths: ['docs/04_memory/é note.md'] });
  });

  it('passes with no paths when the tip is the candidate', () => {
    expect(check()).toEqual({ ok: true, commit: candidate, tip: candidate, paths: [] });
  });

  it('refuses a candidate that is not an ancestor of the tip (a sibling branch)', () => {
    git(repo, ['checkout', '--quiet', '-b', 'side']);
    writeFixtureFile(repo, 'docs/04_memory/side.md', '# side\n');
    const sibling = commitAll(repo, 'side');
    git(repo, ['checkout', '--quiet', 'main']);
    writeFixtureFile(repo, 'docs/04_memory/main.md', '# main\n');
    commitAll(repo, 'main');
    expect(check(transcript(FIXTURE_PKG, sibling))).toEqual({ ok: false, reason: expect.stringContaining('not an ancestor') });
  });

  it("a failing transcript fails with checkTranscript's reason", () => {
    const failed = [`${LOG_PREFIX}staging smoke FAILED — the build must not be promoted`].join('\n');
    expect(check(failed)).toEqual({ ok: false, reason: expect.stringContaining('closing line') });
  });
});

describe('task-282 AC 4 — parseArgs for --check-evidence-only', () => {
  it('takes the transcript and the --evidence prefixes, alone', () => {
    expect(parseArgs(['--check-evidence-only', 't.md', '--evidence', 'docs/04_memory/'])).toEqual({ checkEvidenceOnly: 't.md', evidence: ['docs/04_memory/'] });
    expect(parseArgs(['--check-evidence-only', 't.md', '--evidence', 'docs/04_memory/', '--evidence', 'docs/07_gates/'])).toEqual({
      checkEvidenceOnly: 't.md',
      evidence: ['docs/04_memory/', 'docs/07_gates/'],
    });
  });

  it.each([
    ['no --evidence', ['--check-evidence-only', 't.md']],
    ['an absolute prefix', ['--check-evidence-only', 't.md', '--evidence', '/abs/']],
    ['a prefix without a trailing slash', ['--check-evidence-only', 't.md', '--evidence', 'docs']],
    ['a prefix with ..', ['--check-evidence-only', 't.md', '--evidence', '../x/']],
    ['another option beside it', ['--check-evidence-only', 't.md', '--evidence', 'docs/04_memory/', '--expect-commit', 'a'.repeat(40)]],
  ])('throws on %s', (_case, argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });
});

describe('task-282 AC 4 — the CLI check, as the binding runs it', () => {
  let repo: string;
  let candidate: string;
  beforeEach(() => {
    ({ repo, candidate } = makeCandidateRepo());
  });
  afterEach(() => removeTempDir(repo));

  const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: 'utf-8' });
  const evidenceArgs = EVIDENCE.flatMap((prefix) => ['--evidence', prefix]);

  it('exit 0 when only evidence paths changed, saying so', () => {
    writeFixtureFile(repo, 'docs/07_gates/t.md', transcript(PKG, candidate));
    commitAll(repo, 'transcript');
    const passed = run('--check-evidence-only', 'docs/07_gates/t.md', ...evidenceArgs);
    expect(passed.stdout).toContain('only evidence paths changed');
    expect(passed.status).toBe(0);
  });

  it('exit 1 when src/ changed, with `error: … must be re-cut`', () => {
    writeFixtureFile(repo, 'docs/07_gates/t.md', transcript(PKG, candidate));
    writeFixtureFile(repo, 'src/a.ts', 'export const a = 2;\n');
    commitAll(repo, 'code');
    const failed = run('--check-evidence-only', 'docs/07_gates/t.md', ...evidenceArgs);
    expect(failed.stderr).toMatch(/^error: .*must be re-cut/);
    expect(failed.status).toBe(1);
  });

  it('exit 1 on a missing transcript, naming it', () => {
    const missing = run('--check-evidence-only', 'docs/07_gates/absent.md', ...evidenceArgs);
    expect(missing.stderr).toContain('docs/07_gates/absent.md');
    expect(missing.status).toBe(1);
  });

  it('exit 2 without --evidence', () => {
    writeFixtureFile(repo, 'docs/07_gates/t.md', transcript(PKG, candidate));
    expect(run('--check-evidence-only', 'docs/07_gates/t.md').status).toBe(2);
  });
});

describe('task-282 AC 4 — the pre-check is bound and declared', () => {
  const bindingsRaw = readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8');
  const bindings = yamlLoad(bindingsRaw) as {
    version: number;
    checks: Record<string, { run: string[]; severity?: string; args?: Record<string, string> }>;
  };
  const publishingRaw = readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'release-publishing.yaml'), 'utf-8');
  const publishing = yamlLoad(publishingRaw) as {
    version: number;
    phases: { name: string; description?: string; checks?: { pre?: string[] } }[];
  };
  const guide = readFileSync(join(REPO_ROOT, '.wingfoil', 'WORKFLOW.md'), 'utf-8');

  it('bindings.yaml is at 2.2 or later with a task-282 entry, and binds evidence-only-since-candidate with the evidence prefixes', () => {
    expect(bindings.version).toBeGreaterThanOrEqual(2.2);
    expect(bindingsRaw).toMatch(/2\.2 [^;]*task-282/);
    const bound = bindings.checks['evidence-only-since-candidate'];
    expect(bound).toEqual({
      run: [
        'node',
        'scripts/publish-staging.cjs',
        '--check-evidence-only',
        '{transcript}',
        '--evidence',
        'docs/04_memory/',
        '--evidence',
        'docs/05_plans/',
        '--evidence',
        'docs/07_gates/',
      ],
      severity: 'reject',
      args: { transcript: bindings.checks['staging-rehearsal-passed']?.args?.['transcript'] },
    });
  });

  it('release-publishing.yaml is at 1.8 or later with a task-282 entry, and tag appends the pre-check after the three existing ones', () => {
    expect(publishing.version).toBeGreaterThanOrEqual(1.8);
    expect(publishingRaw).toMatch(/1\.8 [^;]*task-282/);
    const tag = publishing.phases.find((phase) => phase.name === 'tag');
    expect(tag?.checks?.pre).toEqual([
      'on-branch-is-main',
      'release-branch-merged-to-main',
      `staging-rehearsal-passed(transcript: ${TRANSCRIPT_PATH})`,
      `evidence-only-since-candidate(transcript: ${TRANSCRIPT_PATH})`,
    ]);
    expect(tag?.description).toContain('evidence-only-since-candidate');
    expect(tag?.description).toContain('git diff --name-only');
  });

  it("WORKFLOW.md's Release Publishing section names the pre-check", () => {
    const start = guide.indexOf('### Release Publishing');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = guide.indexOf('\n### ', start + 1);
    expect(guide.slice(start, end === -1 ? undefined : end)).toContain('evidence-only-since-candidate');
  });
});
