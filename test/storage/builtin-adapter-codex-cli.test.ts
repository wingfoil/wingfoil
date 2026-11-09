/**
 * task-237 — the built-in `codex-cli` adapter manifest the package ships (`spec-016` §2.1, §2.8;
 * `adr-012` point 2), the second vendor beside task-236's `claude-code`.
 *
 * AC 1 (red-first): the shipped manifest validates under the task-177 schema as a built-in, passes the
 * pre-write integrity pass (schema + secret scan), and `init` installs it beside `claude-code`. Pinned as
 * task-236 pins `claude-code`: `name`, `format`, `terminal: required` DECLARED in the raw YAML (spec-016
 * §2.8 "Each built-in declares", not the schema's default) and a non-empty `verified_with`. Deliberately
 * NOT pinned: the command's flags, the launch argv, the `mcp.template` text and the `verified_with`
 * string — they are facts of the by-hand pass (AC 2/3) and may move there.
 *
 * Nothing here pins a `codex-cli` entry or installed copy in THIS repository (approver ruling D-6).
 * No test here launches `codex` or reads `PATH`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadYaml } from 'js-yaml';

import { loadAdapter, parseAdapterManifest } from '../../src/agent';
import { verifyBuiltinTemplates } from '../../src/core/builtin-integrity';
import { initWingfoilProject } from '../../src/core/init';
import {
  BUILTIN_ADAPTERS,
  BUILTIN_ADAPTERS_DIR,
  TEMPLATES,
  builtinTemplateSources,
  templateScaffold,
  type BuiltinAdapterManifest,
} from '../../src/storage';
import { git, makeTempGitRepo, removeTempDir } from './helpers/git-fixture';

const NAME = 'codex-cli';
const INSTALLED_PATH = `${BUILTIN_ADAPTERS_DIR}/${NAME}.yaml`;
const CLAUDE_CODE_PATH = `${BUILTIN_ADAPTERS_DIR}/claude-code.yaml`;
const SCRUM = TEMPLATES[0]!;

/** The shipped entry named `name`; fails on an assertion (not a crash) while none ships. */
function shipped(name: string = NAME): BuiltinAdapterManifest {
  const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === name);
  expect({ name, shipped: entry !== undefined }).toEqual({ name, shipped: true });
  return entry!;
}

describe('AC 1 — BUILTIN_ADAPTERS ships codex-cli', () => {
  it('AC 1 (a): has exactly one entry named codex-cli, and the shipped names are sorted and duplicate-free', () => {
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

  it('AC 1 (d): the default scaffold installs codex-cli verbatim', () => {
    const entry = shipped();
    const files = templateScaffold(SCRUM);
    expect(files.find((file) => file.path === INSTALLED_PATH)?.content).toBe(entry.content);
  });
});

describe('AC 1 (e) — wingfoil init (no seam) installs claude-code and codex-cli in the init commit', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('writes both shipped manifests byte for byte, commits them in name order, and the loader loads codex-cli as a built-in', () => {
    repo = makeTempGitRepo();
    const codex = shipped();
    const claude = shipped('claude-code');
    const result = initWingfoilProject(repo, 'Scrum');

    expect(result.ok).toBe(true);
    expect(readFileSync(join(repo, INSTALLED_PATH), 'utf-8')).toBe(codex.content);
    expect(readFileSync(join(repo, CLAUDE_CODE_PATH), 'utf-8')).toBe(claude.content);
    expect(git(repo, ['rev-list', '--count', 'HEAD']).trim()).toBe('1');
    const committed = git(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter((line) => line !== '');
    expect(committed.filter((path) => path === CLAUDE_CODE_PATH || path === INSTALLED_PATH)).toEqual([CLAUDE_CODE_PATH, INSTALLED_PATH]);
    expect(loadAdapter(repo, NAME)).toMatchObject({ ok: true, value: { name: NAME, kind: 'built-in' } });
  });
});

/**
 * task-356 (red-first; `spec-016` §2.2, §2.5, §2.8 as amended at the design gate; approver rulings D1 (a), D2 (a),
 * D3) — what the by-hand checks H1 and H2 of 2026-11-09 (`codex-cli 0.145.0`, the task's design addendum) put in
 * the shipped `codex-cli`: the conflict probe `codex mcp get wingfoil` (exit 0 exactly when Codex would load a
 * `wingfoil` table), and the session id of a headless run, the `thread_id` of `codex exec --json`'s first event.
 * Resume stays unsupported (D3). Fields this task adds to the schema are read through a record, so the suite
 * type-checks before they exist.
 */
describe('task-356 — codex-cli probes for a declared wingfoil server and records a headless run’s session id', () => {
  const parsed = (name: string): ReturnType<typeof parseAdapterManifest> =>
    parseAdapterManifest(shipped(name).content, { name, kind: 'built-in', file: `${BUILTIN_ADAPTERS_DIR}/${name}.yaml` });

  it('AC 1 (c): codex-cli declares mcp.conflict_args [mcp, get, wingfoil]; claude-code declares none', () => {
    expect((parsed(NAME).mcp as Record<string, unknown>)['conflict_args']).toEqual(['mcp', 'get', 'wingfoil']);
    expect((parsed('claude-code').mcp as Record<string, unknown>)['conflict_args']).toBeUndefined();
  });

  it('AC 2 (d): the headless argv gains --json after exec, its output is jsonl', () => {
    const headless = parsed(NAME).launch.headless;
    expect(headless?.args).toEqual(['exec', '--json', '-c', '{mcp_config}', '{bootstrap}']);
    expect(headless?.output).toBe('jsonl');
  });

  it('AC 2 (d): session.id output at thread_id; resume still unsupported', () => {
    const { session } = parsed(NAME);
    expect(session.id).toBe('output');
    expect(session.field).toBe('thread_id');
    expect(session.resume.supported).toBe(false);
  });
});
