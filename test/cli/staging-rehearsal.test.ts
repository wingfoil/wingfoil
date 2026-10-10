/**
 * task-219 AC 1–2 (`dl-099` §1–§2, Actions 2) — the staging rehearsal is a declared phase of
 * `release-publishing.yaml`, run on the release candidate, and a re-cut candidate re-enters both checks.
 *
 * - `npm run publish:staging -- --transcript <path>` records the run's own log lines, on a failure too;
 * - `--check-transcript <path>` is the phase's `checks.post` (`staging-rehearsal-passed`): it passes only when
 *   the transcript's closing line is the success line for `package.json`'s `name@version`, and the smoke's
 *   `--version` check named the commit it was given (`--expect-commit`) — that commit is the candidate the
 *   rehearsal proved, and the one `tag` tags;
 * - the workflow: `release-commit` → `staging-rehearsal` (role `qa`) → `tag` → `publish` → `mark-released`; the
 *   rehearsal produces its transcript beside the e2e-smoke report and checks it; `tag` re-checks it first;
 * - `release-cycle.yaml` states the candidate and the re-cut re-entry into `e2e-smoke` and `staging-rehearsal`.
 *
 * Deterministic: fixed transcripts, no clock, no network; the CLI runs in a temp directory.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'publish-staging.cjs');
const SHA = 'a'.repeat(40);
const TRANSCRIPT_PATH = 'docs/07_gates/rl-{release.release-line}/rel-{release.version}-staging-rehearsal.md';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const staging = require('../../scripts/publish-staging.cjs') as {
  LOG_PREFIX: string;
  stagingPassedLine: (name: string, version: string) => string;
  checkTranscript: (text: string, pkg: { name: string; version: string }) => { ok: true; commit: string } | { ok: false; reason: string };
  parseArgs: (argv: readonly string[]) => Record<string, string | undefined>;
};

const PKG = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { name: string; version: string };

/** A transcript as `--transcript` writes it: every line with the script's prefix, the smoke's lines indented. */
function transcript(version: string, closing: string, versionLine = `ok   wingfoil --version = ${version} (${SHA}) — match`): string {
  return [
    'Verdaccio up on http://localhost:4873/',
    `  ok   wingfoil --help — exit 0`,
    ...(versionLine === '' ? [] : [`  ${versionLine}`]),
    '  ok   [Scrum] wingfoil init --template Scrum — exit 0, tree clean',
    closing,
  ]
    .map((line) => `${staging.LOG_PREFIX}${line}`)
    .join('\n')
    .concat('\n');
}

describe('task-219 — the rehearsal transcript and its check', () => {
  it('the success line is the one runStaging logs last', () => {
    expect(staging.stagingPassedLine('wingfoil', '0.3.0')).toBe('staged wingfoil@0.3.0 and smoke passed');
    expect(staging.LOG_PREFIX).toBe('[publish:staging] ');
  });

  it('passes a transcript that closes on the success line and names the commit the smoke checked', () => {
    const pkg = { name: 'wingfoil', version: '0.3.0' };
    expect(staging.checkTranscript(transcript('0.3.0', staging.stagingPassedLine('wingfoil', '0.3.0')), pkg)).toEqual({ ok: true, commit: SHA });
  });

  it('fails a failed run, a run for another version, a run with no --expect-commit, and an empty transcript', () => {
    const pkg = { name: 'wingfoil', version: '0.3.0' };
    const failed = staging.checkTranscript(transcript('0.3.0', 'staging smoke FAILED — the build must not be promoted'), pkg);
    expect(failed).toEqual({ ok: false, reason: expect.stringContaining('closing line') });
    const other = staging.checkTranscript(transcript('0.2.2', staging.stagingPassedLine('wingfoil', '0.2.2')), pkg);
    expect(other).toEqual({ ok: false, reason: expect.stringContaining('wingfoil@0.3.0') });
    const unchecked = staging.checkTranscript(
      transcript('0.3.0', staging.stagingPassedLine('wingfoil', '0.3.0'), "no --expect-commit: the build stamp's commit is not checked"),
      pkg,
    );
    expect(unchecked).toEqual({ ok: false, reason: expect.stringContaining('--expect-commit') });
    expect(staging.checkTranscript('', pkg)).toEqual({ ok: false, reason: expect.stringContaining('closing line') });
  });

  it('parses --transcript beside the run options, and --check-transcript alone', () => {
    expect(staging.parseArgs(['--expect-commit', SHA, '--transcript', 'docs/07_gates/x.md'])).toEqual({ expectCommit: SHA, transcript: 'docs/07_gates/x.md' });
    expect(staging.parseArgs(['--check-transcript', 'docs/07_gates/x.md'])).toEqual({ checkTranscript: 'docs/07_gates/x.md' });
    expect(() => staging.parseArgs(['--check-transcript', 'x.md', '--expect-commit', SHA])).toThrow('--check-transcript');
    expect(() => staging.parseArgs(['--transcript'])).toThrow('--transcript');
  });

  describe('the CLI check, as the binding runs it', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'wf-staging-transcript-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));
    const check = (path: string): { status: number | null; stdout: string; stderr: string } =>
      spawnSync(process.execPath, [SCRIPT, '--check-transcript', path], { cwd: dir, encoding: 'utf-8' });

    it('exit 0 on package.json\'s version, naming the candidate commit', () => {
      writeFileSync(join(dir, 't.md'), transcript(PKG.version, staging.stagingPassedLine(PKG.name, PKG.version)));
      const run = check('t.md');
      expect(run.status).toBe(0);
      expect(run.stdout).toContain(SHA);
    });

    it('exit 1 on a failed transcript and on a missing one, with the reason on stderr', () => {
      writeFileSync(join(dir, 't.md'), transcript(PKG.version, 'staging FAILED: boom'));
      const failed = check('t.md');
      expect(failed.status).toBe(1);
      expect(failed.stderr).toMatch(/^error: /);
      const missing = check('absent.md');
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain('absent.md');
    });
  });
});

describe('task-219 AC 1 — release-publishing declares the rehearsal on the candidate', () => {
  const workflow = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'release-publishing.yaml'), 'utf-8')) as {
    version: number;
    phases: { name: string; role?: string; description?: string; actions?: string[]; produces?: unknown[]; checks?: { pre?: string[]; post?: string[] } }[];
  };
  const bindings = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8')) as {
    checks: Record<string, { run: string[]; severity?: string; args?: Record<string, string> }>;
  };
  const phase = (name: string) => workflow.phases.find((p) => p.name === name);

  it('is past 1.3, and the rehearsal sits between the release commit and the tag', () => {
    expect(workflow.version).toBeGreaterThan(1.3);
    expect(workflow.phases.map((p) => p.name)).toEqual(['release-commit', 'staging-rehearsal', 'tag', 'publish', 'mark-released']);
    expect(phase('release-commit')?.actions).toEqual(['git.commit(message: "release {release.version}")']);
    expect(phase('tag')?.actions).toEqual(['git.tag(name: "{release.version}", on: main)']);
  });

  it('staging-rehearsal: role qa, runs npm run publish:staging, produces the transcript, checks its closing line', () => {
    const rehearsal = phase('staging-rehearsal')!;
    expect(rehearsal.role).toBe('qa');
    expect(rehearsal.actions).toHaveLength(1);
    expect(rehearsal.actions![0]).toContain('npm run publish:staging');
    expect(rehearsal.produces).toEqual([TRANSCRIPT_PATH]);
    expect(rehearsal.checks?.post).toEqual([`staging-rehearsal-passed(transcript: ${TRANSCRIPT_PATH})`]);
    // Written against the candidate and the release's integration branch, not `main` by name (dl-159 handover).
    expect(rehearsal.description).toMatch(/candidate/);
    expect(`${rehearsal.description} ${rehearsal.actions![0]}`).not.toMatch(/\bmain\b/);
  });

  it('tag re-checks the transcript first, and tags the candidate commit it names', () => {
    expect(phase('tag')?.checks?.pre).toContain(`staging-rehearsal-passed(transcript: ${TRANSCRIPT_PATH})`);
    expect(phase('tag')?.description).toMatch(/candidate/);
    // Review fix 2: `on: main` names the branch; the commit tagged is the one the check prints (D2).
    expect(phase('tag')?.description).toMatch(/`on: main` names the branch/);
  });

  it('the check is bound to the transcript check, at severity reject, with a repository-relative path pattern', () => {
    const bound = bindings.checks['staging-rehearsal-passed'];
    expect(bound?.run).toEqual(['node', 'scripts/publish-staging.cjs', '--check-transcript', '{transcript}']);
    expect(bound?.severity).toBe('reject');
    const pattern = new RegExp(bound?.args?.['transcript'] ?? '^$');
    expect(TRANSCRIPT_PATH.replace(/\{[^}]+\}/g, 'v0.3')).toMatch(pattern);
    for (const bad of ['/etc/passwd', '../x.md', 'docs/../x.md', '-rf', 'docs/x; rm -rf /']) expect(bad).not.toMatch(pattern);
  });
});

describe('task-219 AC 2 — release-cycle states the candidate and the re-cut re-entry', () => {
  const cycle = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'release-cycle.yaml'), 'utf-8')) as {
    version: number;
    description: string;
    phases: { name: string; description?: string }[];
  };

  it('is past 1.2, and says a re-cut candidate re-enters e2e-smoke and staging-rehearsal', () => {
    expect(cycle.version).toBeGreaterThan(1.2);
    const text = [cycle.description, ...cycle.phases.map((p) => p.description ?? '')].join('\n');
    expect(text).toMatch(/re-cut/);
    expect(text).toMatch(/re-enters?/);
    expect(text).toContain('e2e-smoke');
    expect(text).toContain('staging-rehearsal');
    expect(text).not.toMatch(/\bmain\b/);
  });

  it('states that the release commit does not re-cut, and what stands as the first candidate\'s e2e-smoke run (review fix 3, D3)', () => {
    const text = [cycle.description, ...cycle.phases.map((p) => p.description ?? '')].join('\n');
    expect(text).toMatch(/release commit does not re-cut/);
    expect(text).toMatch(/rehearsal's smoke \([^)]*\) stands as its e2e-smoke run/);
    expect(text).not.toMatch(/Both checks run on it/);
  });
});
