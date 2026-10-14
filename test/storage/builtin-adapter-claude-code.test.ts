/**
 * task-236 — the built-in `claude-code` adapter manifest the package ships (`spec-016` §2.1, §2.8;
 * `adr-012` point 2), and this repository's agent pointed at it.
 *
 * AC 1 (red-first): the shipped manifest validates under task-177's schema as a built-in, passes the
 * pre-write integrity pass (schema + secret scan), and `init` installs it. Pinned: `name`, `format`,
 * `terminal: required` DECLARED in the raw YAML (spec-016 §2.8 "Each built-in declares", not the
 * schema's default) and a non-empty `verified_with`. Deliberately NOT pinned: the command's flags, the
 * launch argv and the `verified_with` string — they are facts of the by-hand pass (AC 2/3) and may move
 * there. No test here launches `claude` or reads `PATH`.
 *
 * AC 4, static half (red-first, approver ruling D-B 2026-10-13): this repository's `team.agents` entry
 * `Claude` names `adapter: claude-code`, and every manifest installed under this repository's
 * `.wingfoil/agents/built-in/` is byte-equal to the shipped entry of the same name (this repository
 * launches what the package ships). The `dna.yaml` version is not pinned (bug-314).
 *
 * One file per shipped adapter, so task-237 adds its own beside this one.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadYaml } from 'js-yaml';

import { loadAdapter, parseAdapterManifest } from '../../src/agent';
import { verifyBuiltinTemplates } from '../../src/core/builtin-integrity';
import { initWingfoilProject } from '../../src/core/init';
import { DnaYaml } from '../../src/dna/schema';
import {
  BUILTIN_ADAPTERS,
  BUILTIN_ADAPTERS_DIR,
  TEMPLATES,
  builtinTemplateSources,
  templateScaffold,
  type BuiltinAdapterManifest,
} from '../../src/storage';
import { git, makeTempGitRepo, removeTempDir } from './helpers/git-fixture';

const NAME = 'claude-code';
const INSTALLED_PATH = `${BUILTIN_ADAPTERS_DIR}/${NAME}.yaml`;
const SCRUM = TEMPLATES[0]!;
const repoRoot = join(__dirname, '..', '..');

/** The shipped `claude-code` entry; fails on an assertion (not a crash) while none ships. */
function shipped(): BuiltinAdapterManifest {
  const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === NAME);
  expect(entry).toBeDefined();
  return entry!;
}

describe('AC 1 — BUILTIN_ADAPTERS ships claude-code', () => {
  it('AC 1 (a): has exactly one entry named claude-code, and the shipped names are sorted and duplicate-free', () => {
    const names = BUILTIN_ADAPTERS.map((adapter) => adapter.name);
    expect(names.filter((name) => name === NAME)).toHaveLength(1);
    expect(names).toEqual([...new Set(names)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('AC 1 (b): validates under the task-177 schema as a built-in, with name, format 1, a non-empty verified_with', () => {
    const entry = shipped();
    const manifest = parseAdapterManifest(entry.content, { name: NAME, kind: 'built-in', file: INSTALLED_PATH });
    expect(manifest.name).toBe(NAME);
    expect(manifest.format).toBe(1);
    expect(manifest.launch.interactive.terminal).toBe('required');
    expect(manifest.verified_with).toMatch(/\S/);
  });

  it('AC 1 (b): declares terminal: required in the raw YAML (declared, not the schema default)', () => {
    const raw = loadYaml(shipped().content) as { launch?: { interactive?: { terminal?: unknown } } };
    expect(raw.launch?.interactive?.terminal).toBe('required');
  });

  it('AC 1 (c): the shipped list passes the pre-write integrity pass (schema + secret scan)', () => {
    shipped();
    expect(verifyBuiltinTemplates(builtinTemplateSources(templateScaffold(SCRUM)))).toBeNull();
  });

  it('AC 1 (d): the default scaffold installs claude-code verbatim and no agents/built-in/.gitkeep', () => {
    const entry = shipped();
    const files = templateScaffold(SCRUM);
    expect(files.find((file) => file.path === INSTALLED_PATH)?.content).toBe(entry.content);
    expect(files.map((file) => file.path)).not.toContain(`${BUILTIN_ADAPTERS_DIR}/.gitkeep`);
  });
});

describe('AC 1 (e) — wingfoil init (no seam) installs claude-code in the init commit', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('writes the shipped manifest, commits it, and the task-177 loader loads it as a built-in', () => {
    repo = makeTempGitRepo();
    const entry = shipped();
    const result = initWingfoilProject(repo, 'Scrum');

    expect(result.ok).toBe(true);
    expect(readFileSync(join(repo, INSTALLED_PATH), 'utf-8')).toBe(entry.content);
    const committed = git(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter((line) => line !== '');
    expect(committed).toContain(INSTALLED_PATH);
    expect(loadAdapter(repo, NAME)).toMatchObject({ ok: true, value: { name: NAME, kind: 'built-in' } });
  });
});

describe('AC 4 (static half) — this repository launches the shipped claude-code adapter', () => {
  it("AC 4: .wingfoil/dna.yaml team.agents entry 'Claude' names adapter: claude-code", () => {
    const dna = DnaYaml.parse(loadYaml(readFileSync(join(repoRoot, '.wingfoil', 'dna.yaml'), 'utf-8')));
    const claude = (dna.team.agents ?? []).find((agent) => agent.name === 'Claude');
    expect(claude).toBeDefined();
    expect(claude!.adapter).toBe(NAME);
  });

  it("AC 4: every manifest under this repository's .wingfoil/agents/built-in/ equals the shipped entry of the same name, claude-code included", () => {
    const dir = join(repoRoot, BUILTIN_ADAPTERS_DIR);
    const installed = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.yaml')).sort() : [];
    expect(installed).toContain(`${NAME}.yaml`);
    for (const file of installed) {
      const name = file.slice(0, -'.yaml'.length);
      const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === name);
      expect({ file, shipped: entry !== undefined }).toEqual({ file, shipped: true });
      expect({ file, content: readFileSync(join(dir, file), 'utf-8') }).toEqual({ file, content: entry!.content });
    }
  });
});
