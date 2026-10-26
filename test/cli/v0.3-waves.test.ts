/**
 * task-302 green (developer's own tests; the acceptance test is qa's `test/core/minor-v0.3-waves.test.ts`) —
 * `scripts/v0.3-waves.cjs`, which prepares the approver's `memory amend` batches that give `minor-v0.3` its
 * `waves:` and each v0.3 task its `wave:` (`dl-186` S3-b, `dl-175` (a); plan ruling R4; design gate D1–D4).
 *
 * - the pure parts in-process: the notes rule (only `## Implementation Notes`, the separators the real files use),
 *   the mapping and batches derived from this repository's HEAD, the argument parser, the printed commands;
 * - `main` on fixture repositories built from REAL files of this repository (`.wingfoil/`, `minor-v0.3.md`
 *   and five v0.3 tasks covering every shape: no `wave:` line, `wave: ""`, `deprecated`, `none`, the label repeated
 *   in Execution Notes), with the committed `dna.yaml`'s approver as the fixture's local identity, because
 *   `memory amend` needs the approver role — in temp repositories only: `--run` never touches this repository. The
 *   files are read at the commit before the approver's first amend once the batches are on the branch (else `HEAD`),
 *   so the fixtures start from the pre-amend shape either way.
 *
 * Deterministic: fixtures under the OS temp dir (`fixtureDirPrefix`); no clock, no network.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BATCH_SIZE,
  batches,
  commitSubject,
  deriveMapping,
  implementationNotes,
  isApplied,
  main,
  notesWave,
  parseArgs,
  printLines,
  shellQuote,
  taskReason,
} from '../../scripts/v0.3-waves.cjs';
import { parseYaml } from '../../src/validation/yaml';
import { fixtureDirPrefix, git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const TASK_DIR = 'docs/04_memory/v0.3';
const RELEASE_PATH = 'docs/04_memory/planning/rl-v1/minor-v0.3.md';
/** Five real tasks: 126 (w0, no `wave:` line), 223 (w3, deprecated), 230 (w3, label repeated outside the notes), 252 (none), 288 (w3, `wave: ""`). */
const FIXTURE_TASKS = ['task-126-', 'task-223-', 'task-230-', 'task-252-', 'task-288-'];

const atHead = (path: string): string => atRev('HEAD', path);
function atRev(rev: string, path: string): string {
  return execFileSync('git', ['show', `${rev}:${path}`], { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 1 << 26 });
}
/**
 * The revision the fixtures copy: the parent of the approver's `minor-v0.3` amend once the batches are on this
 * branch (the files as they were before any amend), else `HEAD` (before the batches). Real files either way.
 */
const SOURCE_REV = ((): string => {
  const amend = execFileSync('git', ['rev-list', '-1', '--fixed-strings', '--grep=wf(release): amend minor-v0.3 [released → released]', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  }).trim();
  return amend === '' ? 'HEAD' : `${amend}^`;
})();
const headTaskPaths = (): string[] =>
  execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', `${TASK_DIR}/`], { cwd: REPO_ROOT, encoding: 'utf-8' })
    .split('\n')
    .filter((path) => /\/task-\d+[^/]*\.md$/.test(path))
    .sort();

/** The first member the committed dna.yaml gives the approver role. */
function approverIdentity(): { name: string; email: string } {
  const dna = parseYaml(atHead('.wingfoil/dna.yaml'), '.wingfoil/dna.yaml') as { team: { members: { name: string; email: string; roles: string[] }[] } };
  const member = dna.team.members.find((m) => m.roles.includes('approver'));
  if (member === undefined) throw new Error('the committed dna.yaml names no approver');
  return { name: member.name, email: member.email };
}

interface Run {
  code: number;
  out: string;
  err: string;
}

function runMain(root: string, argv: string[]): Run {
  let out = '';
  let err = '';
  const code = main(argv, root, (t) => (out += t), (t) => (err += t));
  return { code, out, err };
}

/** A fixture repository holding HEAD's `.wingfoil/`, `minor-v0.3.md` and the five tasks, committed once. */
function makeFixture(identity: { name: string; email: string }): { repo: string; tasks: string[] } {
  const repo = mkdtempSync(fixtureDirPrefix());
  git(repo, ['init', '--quiet', '--initial-branch=main']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  git(repo, ['config', 'gc.auto', '0']);
  git(repo, ['config', 'user.name', identity.name]);
  git(repo, ['config', 'user.email', identity.email]);
  const config = execFileSync('git', ['ls-tree', '-r', '--name-only', SOURCE_REV, '--', '.wingfoil/'], { cwd: REPO_ROOT, encoding: 'utf-8' })
    .split('\n')
    .filter(Boolean);
  for (const path of config) writeFixtureFile(repo, path, atRev(SOURCE_REV, path));
  writeFixtureFile(repo, RELEASE_PATH, atRev(SOURCE_REV, RELEASE_PATH));
  const tasks = headTaskPaths().filter((path) => FIXTURE_TASKS.some((prefix) => path.includes(`/${prefix}`)));
  for (const path of tasks) writeFixtureFile(repo, path, atRev(SOURCE_REV, path));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'fixture: real files from HEAD']);
  return { repo, tasks };
}

const idOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.md'.length);
const subjects = (repo: string, range: string): string[] => git(repo, ['log', '--format=%s', range]).split('\n').filter(Boolean);

describe('task-302 — the notes rule (pure)', () => {
  it.each([
    ['- **wave:** 0 · Size: M.', 'w0'],
    ['- **kind:** fix · **wave:** 2, run in B4.', 'w2'],
    ['- **wave:** 3 · run before batch B3', 'w3'],
    ['- **kind:** fix · **wave:** none — executed inside the v0.3 `user-docs` phase', null],
  ])('%p → %p', (line, wave) => {
    expect(notesWave(`## Implementation Notes\n\n${line}\n\n## Execution Notes\n`)).toEqual({ ok: true, wave });
  });

  it('reads only ## Implementation Notes: a label in Execution Notes is ignored (task-230 at HEAD)', () => {
    const text = atHead(headTaskPaths().find((path) => path.includes('/task-230-'))!);
    expect(text.match(/\*\*wave:\*\*/g)?.length).toBe(2);
    expect(notesWave(text)).toEqual({ ok: true, wave: 'w3' });
    expect(implementationNotes('no section')).toBeNull();
  });

  it.each([
    ['no section', 'no ## Implementation Notes section'],
    ['## Implementation Notes\n\nnothing\n', '0 **wave:** lines in Implementation Notes, expected 1'],
    ['## Implementation Notes\n\n**wave:** 1 and **wave:** 2\n', '2 **wave:** lines in Implementation Notes, expected 1'],
    ['## Implementation Notes\n\n**wave:** 7\n', '**wave:** 7 is neither 0–3 nor none'],
  ])('refuses %p', (text, message) => {
    expect(notesWave(text)).toEqual({ ok: false, message });
  });
});

describe('task-302 — the mapping and batches of this repository at HEAD (pure over HEAD reads)', () => {
  const mapping = deriveMapping(headTaskPaths().map((path) => ({ path, text: atHead(path) })));

  it('derives 164 entries in task-number order, task-252 and task-289 without a wave (D1), task-223 in w3 (D2)', () => {
    if (!mapping.ok) throw new Error(mapping.message);
    expect(mapping.entries).toHaveLength(164);
    const numbers = mapping.entries.map((e) => Number(/task-(\d+)/.exec(e.id)![1]));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(mapping.entries.filter((e) => e.wave === null).map((e) => e.id.slice(0, 8))).toEqual(['task-252', 'task-289']);
    expect(mapping.entries.find((e) => e.id.startsWith('task-223-'))!.wave).toBe('w3');
  });

  it('batch 0 is minor-v0.3 alone, then 162 tasks in batches of 20: 1 + 8 × 20 + 2', () => {
    if (!mapping.ok) throw new Error(mapping.message);
    const all = batches(mapping.entries);
    expect(BATCH_SIZE).toBe(20);
    expect(all.map((b) => b.length)).toEqual([1, 20, 20, 20, 20, 20, 20, 20, 20, 2]);
    expect(all[0]).toEqual([{ id: 'minor-v0.3', path: RELEASE_PATH, kind: 'release', wave: null }]);
    expect(all[1]![0]!.id.startsWith('task-126-')).toBe(true);
    expect(all[9]!.map((item) => item.id.slice(0, 8))).toEqual(['task-287', 'task-288']);
  });

  it('refuses a document with no id', () => {
    expect(deriveMapping([{ path: 'x.md', text: '---\ntitle: x\n---\n' }])).toEqual({ ok: false, message: 'x.md: no id in the frontmatter' });
  });
});

describe('task-302 — arguments, applied state and printed commands (pure)', () => {
  it.each([
    [[], { ok: true, mode: 'plan', batch: null, id: null }],
    [['--batch', '3', '--print'], { ok: true, mode: 'print', batch: 3, id: null }],
    [['--check'], { ok: true, mode: 'check', batch: null, id: null }],
    [['--edit', 'task-1'], { ok: true, mode: 'edit', batch: null, id: 'task-1' }],
  ])('%p parses', (argv, parsed) => {
    expect(parseArgs(argv)).toEqual(parsed);
  });

  it.each([
    [['--run'], '--run needs --batch <n>'],
    [['--batch', 'x', '--run'], '--batch takes a number, got "x"'],
    [['--batch'], 'missing value for --batch'],
    [['--print', '--run', '--batch', '1'], 'choose one of --plan, --print, --run, --check, --edit'],
    [['--plan', '--batch', '1'], '--batch does not apply to --plan'],
    [['--nope'], 'unknown argument "--nope"'],
  ])('%p is a usage error', (argv, message) => {
    expect(parseArgs(argv)).toEqual({ ok: false, message });
  });

  it('commitSubject reads the first message line after the headers, a multi-line signature header included', () => {
    expect(commitSubject('tree t\nparent p\ngpgsig -----BEGIN-----\n x\n -----END-----\n\nwf(task): amend x [done → done]\n\nApprover: A\n')).toBe(
      'wf(task): amend x [done → done]',
    );
    expect(commitSubject('tree t')).toBe('');
  });

  it('isApplied compares the parsed frontmatter value', () => {
    expect(isApplied({ kind: 'task', wave: 'w1' }, '---\nwave: "w1"\n---\n')).toBe(true);
    expect(isApplied({ kind: 'task', wave: 'w1' }, '---\nwave: ""\n---\n')).toBe(false);
    expect(isApplied({ kind: 'release', wave: null }, '---\nwaves: [w0, w1, w2, w3]\n---\n')).toBe(true);
    expect(isApplied({ kind: 'release', wave: null }, '---\nwaves: [w0, w1]\n---\n')).toBe(false);
    expect(isApplied({ kind: 'release', wave: null }, 'no frontmatter')).toBe(false);
  });

  it('prints an edit then an amend whose reason starts with a verb and carries no reserved key or trailer', () => {
    const lines = printLines({ id: 'task-126-x', path: 'p', kind: 'task', wave: 'w0' });
    expect(lines).toEqual([
      'node scripts/v0.3-waves.cjs --edit task-126-x && \\',
      `  node dist/cli.js memory amend task-126-x --reason '${taskReason('w0')}'`,
    ]);
    expect(taskReason('w0')).toMatch(/^Record the wave this task ran in, w0, /);
    expect(lines.join('\n')).not.toMatch(/Approver:|Reason:|WingFoil-Version|Co-Authored-By|AI-Model/);
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});

describe('task-302 — main on a fixture of real files (temp repositories only)', () => {
  const approver = approverIdentity();
  const repos: string[] = [];
  afterAll(() => repos.forEach(removeTempDir));
  const fixture = (identity = approver): { repo: string; tasks: string[] } => {
    const made = makeFixture(identity);
    repos.push(made.repo);
    return made;
  };

  it('--plan lists the mapping and the batch sizes, and writes nothing', () => {
    const { repo } = fixture();
    const head = git(repo, ['rev-parse', 'HEAD']);
    const run = runMain(repo, ['--plan']);
    expect(run).toMatchObject({ code: 0, err: '' });
    expect(run.out.split('\n')[0]).toBe('minor-v0.3: waves [w0, w1, w2, w3]; 5 tasks: w0 1, w1 0, w2 0, w3 3, none 1');
    expect(run.out).toContain('batch 0: 1 amend(s), minor-v0.3 … minor-v0.3\n');
    expect(run.out).toMatch(/batch 1: 4 amend\(s\), task-126-\S+ … task-288-\S+\n/);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(git(repo, ['status', '--porcelain'])).toBe('');
  });

  it('--run commits one amend per element, each one path, with the Approver line and no AI trailer; a rerun skips; --check passes', () => {
    const { repo, tasks } = fixture();
    const base = git(repo, ['rev-parse', 'HEAD']).trim();
    expect(runMain(repo, ['--check'])).toMatchObject({ code: 1 });

    const first = runMain(repo, ['--batch', '0', '--run']);
    expect(first).toMatchObject({ code: 0, err: '' });
    expect(first.out).toMatch(/batch 0: 1 amend\(s\) committed, 0 already applied\n$/);
    const second = runMain(repo, ['--batch', '1', '--run']);
    expect(second).toMatchObject({ code: 0, err: '' });
    expect(second.out).toMatch(/batch 1: 4 amend\(s\) committed, 0 already applied\n$/);

    const waved = tasks.filter((path) => !path.includes('/task-252-'));
    expect(subjects(repo, `${base}..HEAD`).reverse()).toEqual([
      'wf(release): amend minor-v0.3 [released → released]',
      ...waved.map((path) => {
        const state = path.includes('/task-223-') ? 'deprecated' : 'done';
        return `wf(task): amend ${idOf(path)} [${state} → ${state}]`;
      }),
    ]);
    for (const sha of git(repo, ['rev-list', `${base}..HEAD`]).split('\n').filter(Boolean)) {
      expect(git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean)).toHaveLength(1);
      const body = git(repo, ['log', '-1', '--format=%B', sha]);
      expect(body).toContain(`Approver: ${approver.name} <${approver.email}> (approver)`);
      expect(body).not.toMatch(/Co-Authored-By|AI-Model/);
    }
    expect(readFileSync(join(repo, RELEASE_PATH), 'utf-8')).toMatch(/^waves: \[w0, w1, w2, w3\]$/m);
    expect(readFileSync(join(repo, tasks.find((p) => p.includes('/task-288-'))!), 'utf-8')).toMatch(/^wave: "w3" +# optional/m);
    expect(readFileSync(join(repo, tasks.find((p) => p.includes('/task-252-'))!), 'utf-8')).not.toMatch(/^wave: "w/m);

    const head = git(repo, ['rev-parse', 'HEAD']);
    const rerun = runMain(repo, ['--batch', '1', '--run']);
    expect(rerun).toMatchObject({ code: 0, err: '' });
    expect(rerun.out).toMatch(/batch 1: 0 amend\(s\) committed, 4 already applied\n$/);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(runMain(repo, ['--check'])).toEqual({ code: 0, out: 'all 5 at HEAD\n', err: '' });
    expect(git(repo, ['status', '--porcelain'])).toBe('');
  }, 120_000);

  it('--run refuses a dirty file before any write and stops there', () => {
    const { repo, tasks } = fixture();
    const dirty = tasks.find((p) => p.includes('/task-126-'))!;
    writeFileSync(join(repo, dirty), `${readFileSync(join(repo, dirty), 'utf-8')}\nlocal edit\n`, 'utf-8');
    const head = git(repo, ['rev-parse', 'HEAD']);
    const run = runMain(repo, ['--batch', '1', '--run']);
    expect(run.code).toBe(1);
    expect(run.err).toBe(
      `${idOf(dirty)}: ${dirty} has uncommitted changes; commit or discard them, then retry\n` +
        'stopped after 0 amend(s); fix the cause and run the same batch again (applied ids are skipped)\n',
    );
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(git(repo, ['status', '--porcelain']).trim()).toBe(`M ${dirty}`);
  });

  it('--run undoes the edit and stops when memory amend refuses (an identity without the approver role)', () => {
    const { repo } = fixture({ name: 'Not Approver', email: 'not-approver@example.invalid' });
    const head = git(repo, ['rev-parse', 'HEAD']);
    const run = runMain(repo, ['--batch', '0', '--run']);
    expect(run.code).toBe(1);
    expect(run.err).toMatch(/^minor-v0.3: memory amend failed \(exit 1\): .*user not authorized/s);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(git(repo, ['status', '--porcelain'])).toBe('');
  }, 60_000);

  it('--edit writes one working-tree edit and no commit; --print and --check name the batch', () => {
    const { repo, tasks } = fixture();
    const head = git(repo, ['rev-parse', 'HEAD']);
    const target = tasks.find((p) => p.includes('/task-126-'))!;
    expect(runMain(repo, ['--edit', idOf(target)])).toEqual({ code: 0, out: `edited ${target}\n`, err: '' });
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(git(repo, ['diff', '--', target])).toMatch(/^\+wave: "w0"$/m);
    expect(runMain(repo, ['--edit', idOf(target)])).toMatchObject({ code: 1 });
    expect(runMain(repo, ['--edit', 'task-252-x'])).toMatchObject({ code: 1, err: 'task-252-x is not in the mapping (no wave, or not a v0.3 task)\n' });

    const printed = runMain(repo, ['--batch', '1', '--print']);
    expect(printed.code).toBe(0);
    expect(printed.out.split('\n')[0]).toBe('# batch 1: 4 amend(s), one commit each; run from the repository root after npm run build');
    expect(printed.out.match(/memory amend /g)).toHaveLength(4);
    expect(runMain(repo, ['--batch', '0', '--check'])).toEqual({ code: 1, out: '', err: '1 of 1 not at HEAD (batch 0 1); first: minor-v0.3\n' });
    expect(runMain(repo, ['--batch', '2', '--print'])).toEqual({ code: 2, out: '', err: 'no batch 2: batches are 0–1\n' });
    expect(runMain(repo, ['--bogus'])).toMatchObject({ code: 2 });
  });
});
