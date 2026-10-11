/**
 * README badges and the reproducible terminal demo (`task-224-add-readme-badges-reproducible-terminal-demo-drives-example`,
 * `dl-128-user-facing-presentation` items 1–2, Q1 (a) VHS, Q2 (a) committed, Q3 (a)).
 *
 * `dl-128` adds two presentation artefacts to the README, each derived from something already checked, so
 * that neither becomes a second source of truth:
 *
 * - **badges** for the npm version, the licence, the Node engine floor and the status of `publish.yml`.
 *   Each is rendered from the registry or from the workflow run, never typed in: a static
 *   `img.shields.io/badge/…` badge states a value the repository cannot check, and is refused here;
 * - **a demo**: a VHS tape next to `docs/examples/01-first-project/` that runs that example's `run.sh`
 *   and waits for its own `OK:` line, so a tool that no longer matches the example fails the recording
 *   instead of leaving a stale animation. The rendered GIF is committed under `docs/assets/` (Q2 (a))
 *   and the README shows it. The recorder is a separate binary, never an npm dependency
 *   (`dl-010-minimal-dependencies`).
 *
 * `user-docs`' `align-user-docs` phase produces both, and its `checks.post` covers them through two
 * checks: this suite (`presentation.current`, bound) and the recording itself (`demo.rendered`), a manual
 * step by the approver's ruling of 2026-10-10 — no binding, and a note that says how to install the tools,
 * render, and check the result, linked from the check.
 *
 * Offline and deterministic: every file is read from the working tree; nothing is fetched from
 * shields.io, npm or GitHub (what a badge displays is the service's view, not the repository's).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

const repoRoot = join(__dirname, '..', '..');

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

const TAPE = 'docs/examples/01-first-project/demo.tape';
const EXAMPLE = 'docs/examples/01-first-project/run.sh';
const GIF = 'docs/assets/wingfoil-demo-first-project.gif';

const pkg = JSON.parse(read('package.json')) as {
  name: string;
  license: string;
  engines: { node: string };
  repository: { url: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** `owner/repo` of the GitHub repository package.json declares. */
function githubRepository(): string {
  const match = /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/.exec(pkg.repository.url);
  if (!match) throw new Error(`package.json repository.url is not a GitHub URL: ${pkg.repository.url}`);
  return match[1]!;
}

/** The README's Markdown image links `[![alt](image)](target)`, in order. */
function badges(readme: string): { alt: string; image: string; target: string }[] {
  return [...readme.matchAll(/\[!\[([^\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g)].map((match) => ({
    alt: match[1]!,
    image: match[2]!,
    target: match[3]!,
  }));
}

/** The tape's commands, one per non-blank, non-comment line: `[command, rest of the line]`. */
function tapeCommands(): [string, string][] {
  return read(TAPE)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const space = line.indexOf(' ');
      return space < 0 ? [line, ''] : [line.slice(0, space), line.slice(space + 1).trim()];
    });
}

describe('AC 1 — README badges, each derived from the registry, package.json or the run (dl-128 item 1)', () => {
  const readme = read('README.md');
  const repository = githubRepository();

  it('package.json declares what the badges are derived from', () => {
    expect(pkg.name).toBe('wingfoil');
    expect(pkg.license).toBe('MIT');
    expect(pkg.engines.node).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(existsSync(join(repoRoot, '.github', 'workflows', 'publish.yml'))).toBe(true);
  });

  it('shows the four badges, in order, each rendered from its source and linking to it', () => {
    const npmPage = `https://www.npmjs.com/package/${pkg.name}`;
    expect(badges(readme).map(({ image, target }) => [image, target])).toEqual(
      expect.arrayContaining([
        // The version the registry serves as `latest`.
        [`https://img.shields.io/npm/v/${pkg.name}`, npmPage],
        // The `license` of the published package.json, as the registry serves it.
        [`https://img.shields.io/npm/l/${pkg.name}`, `https://github.com/${repository}/blob/main/LICENSE`],
        // The `engines.node` of the published package.json, as the registry serves it.
        [`https://img.shields.io/node/v/${pkg.name}`, npmPage],
        // The status of the latest publish.yml run, as GitHub Actions serves it.
        [
          `https://github.com/${repository}/actions/workflows/publish.yml/badge.svg`,
          `https://github.com/${repository}/actions/workflows/publish.yml`,
        ],
      ]),
    );
    const order = [`npm/v/${pkg.name}`, `npm/l/${pkg.name}`, `node/v/${pkg.name}`, 'publish.yml/badge.svg'].map((key) =>
      badges(readme).findIndex(({ image }) => image.includes(key)),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('the licence badge links to a LICENSE file the repository carries', () => {
    expect(existsSync(join(repoRoot, 'LICENSE'))).toBe(true);
  });

  it('no badge is static: a value typed into the URL is a fact the repository cannot check', () => {
    expect(readme).not.toMatch(/img\.shields\.io\/badge\//);
  });
});

describe('AC 2 — a VHS tape drives docs/examples/01-first-project/run.sh, rendered to a committed GIF (dl-128 item 2)', () => {
  it('the tape sits next to the example it drives', () => {
    expect(existsSync(join(repoRoot, TAPE))).toBe(true);
    expect(existsSync(join(repoRoot, EXAMPLE))).toBe(true);
  });

  it('renders exactly one output: the GIF under docs/assets/', () => {
    const outputs = tapeCommands().filter(([command]) => command === 'Output');
    expect(outputs).toEqual([['Output', GIF]]);
  });

  it('types the command that runs the example, from the repository root', () => {
    const typed = tapeCommands()
      .filter(([command]) => command === 'Type')
      .map(([, text]) => text);
    expect(typed).toContainEqual(expect.stringContaining(`bash ${EXAMPLE}`));
  });

  it('runs the example against the build of the commit being recorded, not whatever wingfoil is on PATH', () => {
    const typed = tapeCommands()
      .filter(([command]) => command === 'Type')
      .map(([, text]) => text);
    expect(typed).toContainEqual(expect.stringContaining('WINGFOIL="node $PWD/dist/cli.js"'));
  });

  // The render of 2026-10-10 timed out on `Wait+Screen /OK: first project/`: VHS's screen scope reads rows
  // 0..term.rows of xterm's buffer (`Buffer()` in VHS's testing.go), the TOP of a scrolled buffer, so the closing
  // `OK:` line was never in it. The line scope reads the cursor's row in the viewport (`CurrentLine()`), so the
  // tape waits there for the prompt to come back, and a failing example exits the shell so it never does.
  it('the shell exits if the example fails, so the prompt never returns and VHS renders nothing', () => {
    const typed = tapeCommands()
      .filter(([command]) => command === 'Type')
      .map(([, text]) => text);
    expect(typed).toContainEqual(expect.stringMatching(new RegExp(`bash ${EXAMPLE.replace(/[.]/g, '\\.')} \\|\\| exit 1`)));
  });

  it('waits on the cursor line for the returning prompt, never on the screen scope', () => {
    const done = /^done_ok "(.+)"$/m.exec(read(EXAMPLE));
    expect(done).not.toBeNull();
    const waits = tapeCommands().filter(([command]) => command.startsWith('Wait'));
    expect(waits).toHaveLength(1);
    const [command, pattern] = waits[0]!;
    // Line scope (the default, or `+Line`); the `@` timeout makes VHS return an error, and render nothing, when it lapses.
    expect(command).toMatch(/^Wait(?:\+Line)?@\d+(?:ms|s|m)$/);
    const regex = /^\/(.+)\/$/.exec(pattern);
    expect(regex).not.toBeNull();
    const prompt = new RegExp(regex![1]!);
    // VHS's bash prompt is `> ` (PS1 in its shell.go), read back trimmed.
    expect(prompt.test('>')).toBe(true);
    // No line the example prints satisfies it: neither its closing lines nor an identity ending in `>`.
    for (const line of [`OK: ${done![1]!}`, 'FAIL: history operations', '  "approver": "Ada Lovelace <ada@example.com>', '$ wingfoil init --template Scrum']) {
      expect(prompt.test(line)).toBe(false);
    }
  });

  it('requires the tools the example needs, so a machine without them fails before recording', () => {
    const required = tapeCommands()
      .filter(([command]) => command === 'Require')
      .map(([, program]) => program);
    expect(required).toEqual(expect.arrayContaining(['bash', 'git', 'node']));
  });

  it('the recorder is not an npm dependency (dl-010)', () => {
    const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(declared.filter((name) => /(^|\/)vhs$/.test(name))).toEqual([]);
  });

  it('the rendered GIF is committed under docs/assets/', () => {
    expect(existsSync(join(repoRoot, GIF))).toBe(true);
    const header = readFileSync(join(repoRoot, GIF)).subarray(0, 6).toString('latin1');
    expect(['GIF87a', 'GIF89a']).toContain(header);
  });

  it('the README shows the GIF and names the tape it is rendered from', () => {
    const readme = read('README.md');
    expect(readme).toContain(`](${GIF})`);
    expect(readme).toContain(TAPE);
  });

  it('docs/assets/README.md lists the GIF with the command that regenerates it', () => {
    const assets = read('docs/assets/README.md');
    expect(assets).toContain(`\`${GIF.replace('docs/assets/', '')}\``);
    expect(assets).toContain(`vhs ${TAPE}`);
  });
});

describe('AC 3 — align-user-docs produces the tape and the GIF, and checks.post covers them (dl-128 Action 2)', () => {
  const userDocs = load(read('.wingfoil/workflows/custom/user-docs.yaml')) as {
    version: number;
    phases: { name: string; produces?: string[]; checks?: { post?: string[] } }[];
  };
  const phase = userDocs.phases.find((candidate) => candidate.name === 'align-user-docs')!;
  const bindings = load(read('.wingfoil/workflows/bindings.yaml')) as {
    checks: Record<string, { run?: string[] }>;
  };

  it.each([TAPE, GIF])('produces lists %s', (path) => {
    expect(phase.produces).toContain(path);
  });

  it('checks.post keeps the alignment prose and adds the two presentation checks', () => {
    expect(phase.checks?.post).toEqual([
      "user-facing docs aligned with the release's shipped CLI/feature surface",
      'presentation.current',
      'demo.rendered',
    ]);
  });

  it('presentation.current runs this suite; demo.rendered is manual, so it has no binding', () => {
    expect(bindings.checks['presentation.current']?.run).toEqual(['npm', 'test', '--', 'test/docs/presentation.test.ts']);
    expect(bindings.checks['demo.rendered']).toBeUndefined();
  });

  it('the demo.rendered check links the note that says how to render the GIF by hand', () => {
    const line = read('.wingfoil/workflows/custom/user-docs.yaml')
      .split('\n')
      .find((candidate) => /^\s+- demo\.rendered\b/.test(candidate));
    expect(line).toContain('docs/assets/README.md');
  });

  it('the note covers installing the tools on Ubuntu/Debian, the render command, and the checks afterwards', () => {
    const assets = read('docs/assets/README.md');
    const start = assets.indexOf('## Regenerating the demo GIF');
    expect(start).toBeGreaterThanOrEqual(0);
    const next = assets.indexOf('\n## ', start + 1);
    const note = assets.slice(start, next < 0 ? undefined : next);
    // VHS from Charm's apt repository, plus ttyd and ffmpeg.
    expect(note).toContain('https://repo.charm.sh/apt/');
    expect(note).toMatch(/apt install[^\n]*\bvhs\b/);
    expect(note).toMatch(/apt install[^\n]*\bttyd\b/);
    expect(note).toMatch(/apt install[^\n]*\bffmpeg\b/);
    // The render command, from the repository root.
    expect(note).toContain(`npm run build && vhs ${TAPE}`);
    expect(note).toMatch(/repository root/);
    // What to check afterwards.
    expect(note).toContain('git diff --stat');
    expect(note).toContain('npx jest test/docs/presentation.test.ts');
  });

  it('the workflow version moved past 1.4', () => {
    expect(userDocs.version).toBeGreaterThan(1.4);
  });
});
