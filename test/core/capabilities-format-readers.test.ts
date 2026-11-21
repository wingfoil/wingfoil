/**
 * task-362 AC 4 (red-first; `spec-019` §3.1, §9 T-2) — `FILE_KIND_FORMATS` states what each kind's reader actually
 * accepts.
 *
 * One reader probe per file kind, each a minimal valid file declaring `format: f`, read by the kind's own reader:
 * the working-tree loaders and fixture texts of `test/core/format-key.test.ts` (copied, not imported: importing a
 * test file would run its suites) for the seven configuration kinds, `resolveAddType` for `memory-template` (that
 * file's template case), and `parseAdapterManifest` over the fake adapter (`test/fixtures/agents/custom/fake.yaml`,
 * as `test/agent/manifest.test.ts` reads it) for `agent-adapter`. For each entry of `FILE_KIND_FORMATS`:
 *
 * - every `f` in `lowest..highest` is accepted;
 * - `highest + 1` is refused for its format: the issue `E_INVALID_FORMAT` on `format` (the template, through
 *   `resolveAddType`'s result, with the "upgrade WingFoil" message `format-key.test.ts` pins for it);
 * - `lowest - 1`, when it is at least 1, is refused;
 * - an absent key is refused for `agent-adapter` (its schema requires the key) and accepted for the eight others.
 *
 * The probe table's kinds equal `FILE_KIND_FORMATS`' kinds, so a kind added without a probe fails here.
 * Expected red: `FILE_KIND_FORMATS` is not exported (TS2305; at runtime it is `undefined`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dump, load } from 'js-yaml';

import { parseAdapterManifest } from '../../src/agent/manifest';
import { loadDirectives, loadDnaYaml, loadMemoryYaml, loadRolesYaml, loadWorkflowsYaml } from '../../src/core/loaders';
import { resolveAddType } from '../../src/core/memory-add-type';
import { ValidationError, type ValidationIssue } from '../../src/validation';
import { FILE_KIND_FORMATS } from '../../src/validation/format';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** What a probe saw: accepted, or the issues the reader refused the file with. */
type Outcome = { readonly accepted: true } | { readonly accepted: false; readonly issues: readonly ValidationIssue[]; readonly message: string };

/** A kind's reader, driven on a file declaring `format: <format>` (`null`: no key). */
type Probe = (format: number | null) => Outcome;

const line = (format: number | null): string => (format === null ? '' : `format: ${format}\n`);

/** Run a loader that throws a `ValidationError` on refusal. */
function outcomeOf(read: () => unknown): Outcome {
  try {
    read();
    return { accepted: true };
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return { accepted: false, issues: error.issues, message: error.message };
  }
}

/** The configuration kinds of `test/core/format-key.test.ts`: the file, its valid text, and its working-tree loader. */
interface ConfigKind {
  readonly path: string;
  readonly text: (format: number | null) => string;
  readonly load: (repo: string) => unknown;
}

const CONFIG_KINDS: Readonly<Record<string, ConfigKind>> = {
  dna: {
    path: '.wingfoil/dna.yaml',
    text: (format) =>
      `version: 1.1\n${line(format)}modules:\n  - name: core\nstacks:\n  technologies: []\n  methodologies: []\n` +
      'team:\n  members: []\n  roles:\n    - name: developer\npaths:\n  sources: [ src/ ]\n',
    load: loadDnaYaml,
  },
  memory: {
    path: '.wingfoil/memory.yaml',
    text: (format) => `version: 1\n${line(format)}types:\n  task:\n    path: "docs/{id}.md"\n    id_pattern: "task-{n}-{slug}"\n`,
    load: loadMemoryYaml,
  },
  roles: {
    path: '.wingfoil/roles.yaml',
    text: (format) => `version: 1\n${line(format)}assignments:\n  developer: [ sample ]\nglobal: []\n`,
    load: loadRolesYaml,
  },
  directive: {
    path: '.wingfoil/directives/custom/sample.md',
    text: (format) => `---\nid: sample\nname: sample\ntype: directive\nkind: custom\ntitle: "Sample"\n${line(format)}---\n\n# Sample\n`,
    load: loadDirectives,
  },
  workflows: {
    path: '.wingfoil/workflows.yaml',
    text: (format) => `version: 1\n${line(format)}include:\n  - workflows/custom/main.yaml\n  - workflows/custom/sub.yaml\n`,
    load: loadWorkflowsYaml,
  },
  workflow: {
    path: '.wingfoil/workflows/custom/sub.yaml',
    text: (format) => `name: sub\nkind: sub\nversion: 1.0\n${line(format)}phases:\n  - name: step\n`,
    load: loadWorkflowsYaml,
  },
  bindings: {
    path: '.wingfoil/workflows/bindings.yaml',
    text: (format) => `version: 1\n${line(format)}checks:\n  lint.clean: { run: [npm, run, lint] }\n`,
    load: loadWorkflowsYaml,
  },
};

/** A probe of a configuration kind: a fresh repository with every kind's file in its format-less form, then this kind's file at `format`. */
function configProbe(kind: ConfigKind): Probe {
  return (format) => {
    const repo = makeTempGitRepo();
    try {
      for (const other of Object.values(CONFIG_KINDS)) writeFixtureFile(repo, other.path, other.text(null));
      writeFixtureFile(repo, '.wingfoil/workflows/custom/main.yaml', 'name: main\nkind: main\nphases:\n  - name: go\n');
      writeFixtureFile(repo, kind.path, kind.text(format));
      return outcomeOf(() => kind.load(repo));
    } finally {
      removeTempDir(repo);
    }
  };
}

/** The template case of `test/core/format-key.test.ts`: `memory add`'s resolution of a type reads the scaffold's frontmatter. */
const templateProbe: Probe = (format) => {
  const repo = makeTempGitRepo();
  try {
    writeFixtureFile(
      repo,
      '.wingfoil/memory.yaml',
      'version: 1\ntypes:\n  adr:\n    path: "docs/adr/{id}.md"\n    id_pattern: "adr-{n}-{slug}"\n' +
        '    template:\n      file: "memory/templates/adr.md"\n      frontmatter:\n        required: [id, type, title, status]\n',
    );
    writeFixtureFile(repo, '.wingfoil/memory/templates/adr.md', `---\nid: ""\ntype: adr\ntitle: ""\nstatus: draft\n${line(format)}---\n\nbody\n`);
    commitAll(repo, 'fixture');
    const result = resolveAddType(repo, 'adr');
    return result.ok ? { accepted: true } : { accepted: false, issues: [], message: result.error.message };
  } finally {
    removeTempDir(repo);
  }
};

/** The fake adapter, `format` set (or the key removed), parsed by the manifest reader. */
const adapterProbe: Probe = (format) => {
  const manifest = load(readFileSync(join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml'), 'utf-8')) as Record<string, unknown>;
  if (format === null) delete manifest.format;
  else manifest.format = format;
  return outcomeOf(() => parseAdapterManifest(dump(manifest), { name: 'fake', kind: 'custom', file: 'HEAD:.wingfoil/agents/custom/fake.yaml' }));
};

const PROBES: Readonly<Record<string, Probe>> = {
  'agent-adapter': adapterProbe,
  bindings: configProbe(CONFIG_KINDS.bindings!),
  directive: configProbe(CONFIG_KINDS.directive!),
  dna: configProbe(CONFIG_KINDS.dna!),
  memory: configProbe(CONFIG_KINDS.memory!),
  'memory-template': templateProbe,
  roles: configProbe(CONFIG_KINDS.roles!),
  workflow: configProbe(CONFIG_KINDS.workflow!),
  workflows: configProbe(CONFIG_KINDS.workflows!),
};

/** The kinds whose schema requires the key (`spec-019` §3.1: `agent-adapter`). */
const KEY_REQUIRED = new Set(['agent-adapter']);

/** The refusal of a newer format: `E_INVALID_FORMAT` on `format`, or, for the template, the upgrade message in the result. */
function expectNewerFormatRefusal(kind: string, outcome: Outcome, format: number, highest: number): void {
  expect([kind, outcome.accepted]).toEqual([kind, false]);
  if (outcome.accepted) return;
  const text = `this file is written in format ${format}; this WingFoil reads up to format ${highest}: upgrade WingFoil`;
  if (kind === 'memory-template') {
    expect(outcome.message).toContain(text);
    return;
  }
  expect(outcome.issues.filter((issue) => issue.code === 'E_INVALID_FORMAT' && issue.path === 'format').map((issue) => issue.message)).toEqual([text]);
}

describe('task-362 AC 4 — T-2: each kind\'s reader accepts exactly FILE_KIND_FORMATS\' range (spec-019 §3.1)', () => {
  it('the probe table names exactly FILE_KIND_FORMATS\' kinds (a kind added without a probe fails)', () => {
    expect(FILE_KIND_FORMATS.map((entry) => entry.kind)).toEqual(Object.keys(PROBES));
  });

  it('every format from lowest to highest is accepted', () => {
    for (const { kind, lowest, highest } of FILE_KIND_FORMATS) {
      for (let format = lowest; format <= highest; format += 1) expect([kind, format, PROBES[kind]!(format).accepted]).toEqual([kind, format, true]);
    }
  });

  it('highest + 1 is refused for its format (E_INVALID_FORMAT)', () => {
    for (const { kind, highest } of FILE_KIND_FORMATS) expectNewerFormatRefusal(kind, PROBES[kind]!(highest + 1), highest + 1, highest);
  });

  it('lowest - 1 is refused wherever it is at least 1', () => {
    for (const { kind, lowest } of FILE_KIND_FORMATS) {
      if (lowest - 1 >= 1) expect([kind, PROBES[kind]!(lowest - 1).accepted]).toEqual([kind, false]);
    }
  });

  it('an absent key is refused for agent-adapter and accepted for the eight others (read as format 1)', () => {
    expect(FILE_KIND_FORMATS.length).toBeGreaterThan(0);
    for (const { kind } of FILE_KIND_FORMATS) {
      expect([kind, PROBES[kind]!(null).accepted]).toEqual([kind, !KEY_REQUIRED.has(kind)]);
    }
  });
});
