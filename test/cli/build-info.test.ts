/**
 * task-192 — the build record `dl-111` Q2 (a) ratified, and the compiled CLI that reads it.
 *
 * `scripts/write-build-info.cjs` writes `dist/build-info.json` (`{version, commit}`) and is run by the
 * `build` script, not by `prepack`: `publish.yml` packs with `npm pack --ignore-scripts`, so a
 * `prepack` step would never run in the pipeline, while `prepublishOnly` runs `npm run build`. The
 * record carries no timestamp, so two builds of one clean commit are byte-identical; a tree with
 * changes to a build input (approver ruling D4 (c)) is stamped `<sha>-dirty`.
 *
 * The second half drives `dist/` — built once by `test/global-setup.cjs`, which composes the two steps
 * of the `build` script (`tsc`, then the record) into `.jest-dist.next` and then swaps the result in, so
 * with the record — and checks that the compiled CLI stamps that record: `--version`, the trailer of
 * a commit it writes, and the `wingfoil` field `memory history` reads back from it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const WRITER = join(REPO_ROOT, 'scripts', 'write-build-info.cjs');
const DIST_CLI = join(REPO_ROOT, 'dist', 'cli.js');
const PKG = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as {
  version: string;
  scripts: Record<string, string>;
};

/** Run the writer against `root`, as `npm run build` runs it against the package root. */
function writeBuildInfo(root: string, env: NodeJS.ProcessEnv = {}): Buffer {
  execFileSync(process.execPath, [WRITER, '--root', root], { stdio: 'pipe', env: { ...process.env, ...env } });
  return readFileSync(join(root, 'dist', 'build-info.json'));
}

/** A committed package: a manifest and an ignored `dist/`, as this repository has. */
function makePackageRepo(): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, 'package.json', JSON.stringify({ name: 'fixture', version: '4.5.6' }, null, 2));
  writeFixtureFile(repo, '.gitignore', 'dist/\n');
  writeFixtureFile(repo, 'src/index.ts', 'export {};\n');
  writeFixtureFile(repo, 'tsconfig.json', '{}\n');
  writeFixtureFile(repo, 'docs/spec.md', '# Spec\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'seed']);
  return repo;
}

describe('scripts/write-build-info.cjs — the build record (dl-111 Q2 (a))', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('two builds of one clean commit write byte-identical build-info.json, naming that commit', () => {
    repo = makePackageRepo();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();

    const first = writeBuildInfo(repo);
    const second = writeBuildInfo(repo);

    expect(second.equals(first)).toBe(true);
    expect(JSON.parse(first.toString('utf-8'))).toEqual({ version: '4.5.6', commit: head });
    expect(first.toString('utf-8')).toBe(`{\n  "version": "4.5.6",\n  "commit": "${head}"\n}\n`);
  });

  it('a modified tracked file under src/ stamps `<sha>-dirty`', () => {
    repo = makePackageRepo();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, 'src/index.ts', 'export const changed = 1;\n');

    expect(JSON.parse(writeBuildInfo(repo).toString('utf-8'))).toEqual({ version: '4.5.6', commit: `${head}-dirty` });
  });

  it('an untracked file under src/ stamps `<sha>-dirty` too: the built tree is not the commit', () => {
    repo = makePackageRepo();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, 'src/extra.ts', 'export {};\n');

    expect(JSON.parse(writeBuildInfo(repo).toString('utf-8')).commit).toBe(`${head}-dirty`);
  });

  // Approver ruling D4 (c), 2026-10-05: `-dirty` means "this dist/ does not match the sha", so only a
  // change to a build input counts — not to the documentation, the Memory or a stray note.
  it('an edit to a tracked file outside the build inputs (a doc, a spec) leaves the stamp clean', () => {
    repo = makePackageRepo();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, 'docs/spec.md', '# Spec, revised\n');

    expect(JSON.parse(writeBuildInfo(repo).toString('utf-8')).commit).toBe(head);
  });

  it('an untracked file outside the build inputs (a note at the root, a tools/ folder) leaves the stamp clean', () => {
    repo = makePackageRepo();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, 'TODOs.md', 'later\n');
    writeFixtureFile(repo, 'tools/viewer/index.html', '<p></p>\n');

    expect(JSON.parse(writeBuildInfo(repo).toString('utf-8')).commit).toBe(head);
  });

  it.each([
    ['package.json', JSON.stringify({ name: 'fixture', version: '4.5.6', private: true })],
    ['tsconfig.json', '{ "compilerOptions": {} }\n'],
    ['package-lock.json', '{}\n'],
    ['tsconfig.build.json', '{}\n'],
    ['scripts/write-build-info.cjs', '// changed\n'],
  ])('a change to the build input %s stamps `<sha>-dirty`', (path, content) => {
    repo = makePackageRepo();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, path, content);

    expect(JSON.parse(writeBuildInfo(repo).toString('utf-8')).commit).toBe(`${head}-dirty`);
  });

  // Re-review (task-192): the answer must not depend on the operator's git configuration or environment.
  it('an untracked file under src/ stamps `-dirty` even with `status.showUntrackedFiles=no` in the git config', () => {
    repo = makePackageRepo();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    git(repo, ['config', 'status.showUntrackedFiles', 'no']);
    writeFixtureFile(repo, 'src/new.ts', 'export {};\n');

    expect(JSON.parse(writeBuildInfo(repo).toString('utf-8')).commit).toBe(`${head}-dirty`);
  });

  it('`tsconfig*.json` stays a glob with `GIT_LITERAL_PATHSPECS=1` in the environment', () => {
    repo = makePackageRepo();
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    writeFixtureFile(repo, 'tsconfig.json', '{ "compilerOptions": { "strict": true } }\n');

    expect(JSON.parse(writeBuildInfo(repo, { GIT_LITERAL_PATHSPECS: '1' }).toString('utf-8')).commit).toBe(`${head}-dirty`);
  });

  it('outside a git repository the commit is `unknown`, and the record is still written (no stale one survives)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-build-info-nogit-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '4.5.6' }));
      expect(JSON.parse(writeBuildInfo(dir).toString('utf-8'))).toEqual({ version: '4.5.6', commit: 'unknown' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('`build` runs the writer after tsc, and `prepack` is not where it runs (publish.yml packs with --ignore-scripts)', () => {
    expect(PKG.scripts.build).toBe('tsc -p tsconfig.build.json && node scripts/write-build-info.cjs');
    expect(PKG.scripts.prepack ?? '').not.toContain('write-build-info');
  });
});

describe('the compiled CLI stamps the record it was built with', () => {
  const info = (): { version: string; commit: string } =>
    JSON.parse(readFileSync(join(REPO_ROOT, 'dist', 'build-info.json'), 'utf-8')) as { version: string; commit: string };

  it('dist/build-info.json names this checkout: HEAD, with `-dirty` when a build input has changes', () => {
    const head = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
    expect(info().version).toBe(PKG.version);
    expect([head, `${head}-dirty`]).toContain(info().commit);
  });

  it('`wingfoil --version` prints `<semver> (<sha>)`', () => {
    const run = spawnSync(process.execPath, [DIST_CLI, '--version'], { encoding: 'utf-8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`${PKG.version} (${info().commit})\n`);
  });

  it('a commit the compiled CLI writes carries `WingFoil-Version: <semver> (<sha>)`, and `memory history` reports it', () => {
    const repo = makeTempGitRepo();
    try {
      const cli = (...args: string[]) => spawnSync(process.execPath, [DIST_CLI, ...args], { cwd: repo, encoding: 'utf-8' });
      expect(cli('init', '--template', 'scrum').status).toBe(0);
      const stamp = `${PKG.version} (${info().commit})`;
      expect(git(repo, ['log', '-1', '--format=%(trailers:key=WingFoil-Version,valueonly)']).trim()).toBe(stamp);

      const added = cli('memory', 'add', '--type', 'bug', '--title', 'Stamped', '--format', 'json');
      expect(added.status).toBe(0);
      const id = (JSON.parse(added.stdout) as { id: string }).id;
      expect(git(repo, ['log', '-1', '--format=%(trailers:key=WingFoil-Version,valueonly)']).trim()).toBe(stamp);

      const history = cli('memory', 'history', id, '--format', 'json');
      expect(history.status).toBe(0);
      const entries = (JSON.parse(history.stdout) as { entries: { wingfoil?: string }[] }).entries;
      expect(entries.map((entry) => entry.wingfoil)).toEqual([stamp]);
    } finally {
      removeTempDir(repo);
    }
  });
});

/**
 * task-282 AC 1 (`bug-310`, task-219 D4 (c), approver ruling D4): the ONE pack-inputs list — the build
 * inputs plus the two files npm packs outside `dist/` (`LICENSE`, `README.md`) — and the status query
 * `--candidate` and the staging rehearsal's own pack read through it.
 */
describe('task-282 AC 1 — PACK_INPUTS and inputStatus (write-build-info.cjs)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const writer = require('../../scripts/write-build-info.cjs') as typeof import('../../scripts/write-build-info.cjs');

  /** Whether a packed path falls under a git pathspec of the list: a file, a folder prefix, or a `*` glob. */
  const covers = (entry: string, path: string): boolean =>
    entry.includes('*')
      ? new RegExp(`^${entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`).test(path)
      : path === entry || path.startsWith(`${entry}/`);

  it('PACK_INPUTS is BUILD_INPUTS plus LICENSE and README.md, sorted', () => {
    expect(writer.PACK_INPUTS).toEqual(['LICENSE', 'README.md', 'package-lock.json', 'package.json', 'scripts/write-build-info.cjs', 'src', 'tsconfig*.json']);
    for (const input of writer.BUILD_INPUTS) expect(writer.PACK_INPUTS).toContain(input);
  });

  it('every file npm packs outside dist/ falls under a PACK_INPUTS entry', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    const [packed] = JSON.parse(out.slice(Math.max(0, out.search(/^\[/m)))) as { files: { path: string }[] }[];
    const outside = packed!.files.map((file) => file.path).filter((path) => !path.startsWith('dist/'));
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.filter((path) => !(writer.PACK_INPUTS ?? []).some((entry) => covers(entry, path)))).toEqual([]);
  });

  describe('inputStatus(repo, PACK_INPUTS)', () => {
    let repo: string;
    beforeEach(() => {
      repo = makePackageRepo();
      writeFixtureFile(repo, 'README.md', '# Fixture\n');
      writeFixtureFile(repo, 'src/a.ts', 'export const a = 1;\n');
      writeFixtureFile(repo, 'docs/x.md', '# X\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '--quiet', '-m', 'more']);
    });
    afterEach(() => removeTempDir(repo));

    it("is '' with an untracked note and a modified doc: neither is a pack input", () => {
      writeFixtureFile(repo, 'note.txt', 'later\n');
      writeFixtureFile(repo, 'docs/x.md', '# X, revised\n');
      expect(writer.inputStatus(repo, writer.PACK_INPUTS)).toBe('');
    });

    it('names a modified tracked src/a.ts', () => {
      writeFixtureFile(repo, 'src/a.ts', 'export const a = 2;\n');
      expect(writer.inputStatus(repo, writer.PACK_INPUTS)).toContain('src/a.ts');
    });

    it('names an untracked src/new.ts', () => {
      writeFixtureFile(repo, 'src/new.ts', 'export {};\n');
      expect(writer.inputStatus(repo, writer.PACK_INPUTS)).toContain('src/new.ts');
    });

    it('names a modified README.md, which the build inputs do not cover', () => {
      writeFixtureFile(repo, 'README.md', '# Fixture, revised\n');
      expect(writer.inputStatus(repo, writer.PACK_INPUTS)).toContain('README.md');
    });
  });

  it('is null outside a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-pack-inputs-nogit-'));
    try {
      expect(writer.inputStatus(dir, writer.PACK_INPUTS)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
