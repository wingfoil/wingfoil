/**
 * task-251 (`dl-149`) — every WingFoil file kind's loader reads the `format:` key.
 *
 * - AC 1: an optional integer; absent reads as format 1 and loads exactly as before, and `format: 1`
 *   loads without spec-009's unknown-field warning.
 * - AC 2: a format newer than the build reads is refused before the structural pass — the one issue,
 *   `E_INVALID_FORMAT` on `format`, naming the file, its format, the highest supported one and
 *   "upgrade WingFoil", at exit 1 (`spec-005` §1 "validation failure"; `spec-009` §3).
 * - AC 3: a non-integer or non-positive `format` is a structural (schema) error on the `format` field.
 *
 * Each kind is driven through its working-tree loader and its committed-baseline (`HEAD`) loader.
 * Determinism (REQ-SYS-07): fixed fixture texts, fixed step order.
 */
import { join } from 'path';

import { exitCodeForResult } from '../../src/core/exit-code';
import {
  loadDirectives,
  loadDirectivesAtHead,
  loadDnaYaml,
  loadDnaYamlAtHead,
  loadMemoryYaml,
  loadMemoryYamlAtHead,
  loadRolesYaml,
  loadRolesYamlAtHead,
  loadWorkflowsYaml,
  loadWorkflowsYamlAtRev,
} from '../../src/core/loaders';
import { resolveAddType } from '../../src/core/memory-add-type';
import { ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** `format:` line for a fixture: `null` leaves the key out. */
type FormatLine = string | null;
const line = (format: FormatLine): string => (format === null ? '' : `format: ${format}\n`);

/** One file kind: where it lives, its text (valid, or broken for today's schema), and its two loaders. */
interface Kind {
  readonly name: string;
  readonly path: string;
  readonly text: (format: FormatLine, broken?: boolean) => string;
  readonly load: (repo: string) => unknown;
  readonly loadAtHead: (repo: string) => unknown;
  /** The `file` an issue of this kind names: absolute on disk, `HEAD:`-prefixed at HEAD, `.wingfoil/`-relative for workflows. */
  readonly file: (repo: string, atHead: boolean) => string;
}

const onDisk = (relative: string) => (repo: string, atHead: boolean) => (atHead ? `HEAD:${relative}` : join(repo, relative));

const KINDS: readonly Kind[] = [
  {
    name: 'dna.yaml',
    path: '.wingfoil/dna.yaml',
    text: (format, broken) =>
      `version: 1.1\n${line(format)}${broken ? '' : 'modules:\n  - name: core\n'}stacks:\n  technologies: []\n  methodologies: []\n` +
      'team:\n  members: []\n  roles:\n    - name: developer\npaths:\n  sources: [ src/ ]\n',
    load: loadDnaYaml,
    loadAtHead: loadDnaYamlAtHead,
    file: onDisk('.wingfoil/dna.yaml'),
  },
  {
    name: 'memory.yaml',
    path: '.wingfoil/memory.yaml',
    text: (format, broken) =>
      `version: 1\n${line(format)}${broken ? 'types: []\n' : 'types:\n  task:\n    path: "docs/{id}.md"\n    id_pattern: "task-{n}-{slug}"\n'}`,
    load: loadMemoryYaml,
    loadAtHead: loadMemoryYamlAtHead,
    file: onDisk('.wingfoil/memory.yaml'),
  },
  {
    name: 'roles.yaml',
    path: '.wingfoil/roles.yaml',
    text: (format, broken) => `version: 1\n${line(format)}${broken ? '' : 'assignments:\n  developer: [ sample ]\n'}global: []\n`,
    load: loadRolesYaml,
    loadAtHead: loadRolesYamlAtHead,
    file: onDisk('.wingfoil/roles.yaml'),
  },
  {
    name: 'directive frontmatter',
    path: '.wingfoil/directives/custom/sample.md',
    text: (format, broken) =>
      `---\nid: sample\n${broken ? '' : 'name: sample\n'}type: directive\nkind: custom\ntitle: "Sample"\n${line(format)}---\n\n# Sample\n`,
    load: loadDirectives,
    loadAtHead: loadDirectivesAtHead,
    file: onDisk('.wingfoil/directives/custom/sample.md'),
  },
  {
    name: 'workflows.yaml',
    path: '.wingfoil/workflows.yaml',
    text: (format, broken) =>
      `version: 1\n${line(format)}${broken ? 'include: 7\n' : 'include:\n  - workflows/custom/main.yaml\n  - workflows/custom/sub.yaml\n'}`,
    load: loadWorkflowsYaml,
    loadAtHead: (repo) => loadWorkflowsYamlAtRev(repo, 'HEAD'),
    file: () => 'workflows.yaml',
  },
  {
    name: 'a workflow file',
    path: '.wingfoil/workflows/custom/sub.yaml',
    text: (format, broken) => `name: sub\nkind: ${broken ? 'bogus' : 'sub'}\nversion: 1.0\n${line(format)}phases:\n  - name: step\n`,
    load: loadWorkflowsYaml,
    loadAtHead: (repo) => loadWorkflowsYamlAtRev(repo, 'HEAD'),
    file: () => 'workflows/custom/sub.yaml',
  },
];

/** Every kind's file in its valid, format-less form, so that each kind's loader has what it reads. */
function seed(repo: string): void {
  for (const kind of KINDS) writeFixtureFile(repo, kind.path, kind.text(null));
  writeFixtureFile(repo, '.wingfoil/workflows/custom/main.yaml', 'name: main\nkind: main\nphases:\n  - name: go\n');
}

/** Run `fn`, returning what it threw (or failing when it did not). */
function thrownBy(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error as ValidationError;
  }
  throw new Error('expected the load to throw');
}

describe.each(KINDS)('$name — the format key', (kind) => {
  let repo: string;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    repo = makeTempGitRepo();
    seed(repo);
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    stderr.mockRestore();
    removeTempDir(repo);
  });

  /** The unknown-field warnings spec-009 §2 printed during the load. */
  const warnings = (): string[] => stderr.mock.calls.map(([chunk]) => String(chunk)).filter((text) => text.includes('unknown field'));

  describe.each([
    ['working tree', false],
    ['HEAD', true],
  ])('read from the %s', (_label, atHead) => {
    const loadWith = (format: FormatLine, broken = false): unknown => {
      writeFixtureFile(repo, kind.path, kind.text(format, broken));
      if (!atHead) return kind.load(repo);
      commitAll(repo, 'fixture');
      return kind.loadAtHead(repo);
    };

    it('AC 1 — no format key: loads as before, with no warning', () => {
      expect(loadWith(null)).toBeTruthy();
      expect(warnings()).toEqual([]);
    });

    it('AC 1 — `format: 1`: loads, and `format` is a known field (no unknown-field warning)', () => {
      expect(loadWith('1')).toBeTruthy();
      expect(warnings()).toEqual([]);
    });

    it('AC 2 — a newer format is refused: file, format, highest, "upgrade WingFoil", exit 1', () => {
      const error = thrownBy(() => loadWith('2'));
      expect(error.exitCode).toBe(1);
      const issue = error.issues[0]!;
      expect(issue.code).toBe('E_INVALID_FORMAT');
      expect(issue.path).toBe('format');
      expect(issue.file).toBe(kind.file(repo, atHead));
      expect(issue.message).toBe('this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil');
      expect(error.message).toContain(kind.file(repo, atHead));
    });

    it('AC 2 — the format is checked before the structure: a newer file is refused for its format alone', () => {
      const error = thrownBy(() => loadWith('2', true));
      const errors = error.issues.filter((issue) => (issue as { severity?: string }).severity !== 'warning');
      expect(errors.map((issue) => `${issue.code} ${issue.path}`)).toEqual(['E_INVALID_FORMAT format']);
    });

    it.each([['1.5'], ['0'], ['-1'], ['"1"']])('AC 3 — `format: %s` is a schema error naming the field', (format) => {
      const error = thrownBy(() => loadWith(format));
      expect(error.exitCode).toBe(1);
      const issue = error.issues.find((candidate) => candidate.path === 'format');
      expect(issue).toBeDefined();
      expect(issue!.code).not.toBe('E_INVALID_FORMAT');
      expect(error.message).toContain('format');
    });
  });
});

describe('Memory template frontmatter — the format key, read by memory add (resolveAddType)', () => {
  const TEMPLATE = '.wingfoil/memory/templates/adr.md';
  const REGISTRY =
    'version: 1\ntypes:\n  adr:\n    path: "docs/adr/{id}.md"\n    id_pattern: "adr-{n}-{slug}"\n' +
    '    template:\n      file: "memory/templates/adr.md"\n      frontmatter:\n        required: [id, type, title, status]\n';
  const scaffold = (format: FormatLine): string => `---\nid: ""\ntype: adr\ntitle: ""\nstatus: draft\n${line(format)}---\n\nbody\n`;
  let repo: string;

  const resolveWith = (format: FormatLine) => {
    writeFixtureFile(repo, '.wingfoil/memory.yaml', REGISTRY);
    writeFixtureFile(repo, TEMPLATE, scaffold(format));
    commitAll(repo, 'fixture');
    return resolveAddType(repo, 'adr');
  };

  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it.each([[null], ['1']])('AC 1 — `format: %s` resolves', (format) => {
    expect(resolveWith(format).ok).toBe(true);
  });

  it('AC 2 — a newer format is refused before anything is written: the file, its format, the highest, exit 1', () => {
    const result = resolveWith('2');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain(`HEAD:${TEMPLATE}`);
    expect(result.error.message).toContain('this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil');
  });

  it.each([['1.5'], ['0'], ['"1"']])('AC 3 — `format: %s` is refused as a schema error naming the field', (format) => {
    const result = resolveWith(format);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toMatch(/E_VALIDATION format \(HEAD:\.wingfoil\/memory\/templates\/adr\.md\)/);
  });
});
