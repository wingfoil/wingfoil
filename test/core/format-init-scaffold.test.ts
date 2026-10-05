/**
 * task-251 (`dl-149`) AC 4 — `wingfoil init` writes `format: <current>` in every configuration file,
 * workflow file, directive and Memory template it scaffolds, and the scaffold round-trips its own
 * loaders: every pillar loads (working tree and `HEAD`) with no unknown-field warning, and every
 * scaffolded Memory type resolves for `memory add`.
 *
 * AC 1's "every configuration file and `init` scaffold loads unchanged" half: this repository's own
 * configuration, the scaffold with its `format:` lines removed, and the 0.2.2 fixture
 * (`test/core/fixtures/init-0.2.2`) all load as format 1.
 */
import { readdirSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

import { initWingfoilProject } from '../../src/core/init';
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
import { TEMPLATES, extractFrontmatter, templateScaffold } from '../../src/storage';
import {
  DIRECTIVE_FORMAT,
  DNA_YAML_FORMAT,
  MEMORY_TEMPLATE_FORMAT,
  MEMORY_YAML_FORMAT,
  ROLES_YAML_FORMAT,
  WORKFLOW_FORMAT,
  WORKFLOWS_YAML_FORMAT,
} from '../../src/validation/format';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** The format a scaffolded path must declare, by file kind; `undefined` for a path that is no kind. */
function expectedFormat(path: string): number | undefined {
  if (path === '.wingfoil/dna.yaml') return DNA_YAML_FORMAT;
  if (path === '.wingfoil/memory.yaml') return MEMORY_YAML_FORMAT;
  if (path === '.wingfoil/roles.yaml') return ROLES_YAML_FORMAT;
  if (path === '.wingfoil/workflows.yaml') return WORKFLOWS_YAML_FORMAT;
  if (/^\.wingfoil\/workflows\/.+\.yaml$/.test(path)) return WORKFLOW_FORMAT;
  if (/^\.wingfoil\/directives\/.+\.md$/.test(path)) return DIRECTIVE_FORMAT;
  if (/^\.wingfoil\/memory\/templates\/.+\.md$/.test(path)) return MEMORY_TEMPLATE_FORMAT;
  return undefined;
}

/** The `format` a scaffolded file declares: top-level YAML key, or frontmatter key for a `.md`. */
function declaredFormat(path: string, content: string): unknown {
  const yaml = path.endsWith('.md') ? (extractFrontmatter(content) ?? '') : content;
  return (load(yaml) as Record<string, unknown>).format;
}

describe.each(TEMPLATES.map((def) => [def.name, def] as const))('init scaffold (%s template) — the format key', (_name, def) => {
  const files = templateScaffold(def);

  it('every scaffolded file is a known kind, or a .gitkeep', () => {
    const unclassified = files.filter((file) => expectedFormat(file.path) === undefined && !file.path.endsWith('.gitkeep'));
    expect(unclassified.map((file) => file.path)).toEqual([]);
  });

  it.each(files.filter((file) => expectedFormat(file.path) !== undefined).map((file) => [file.path, file] as const))(
    '%s declares the current format of its kind',
    (path, file) => {
      expect(declaredFormat(path, file.content)).toBe(expectedFormat(path));
    },
  );
});

/** Every pillar's loaders, run on one root, with the unknown-field warnings they printed. */
function loadEverything(root: string): string[] {
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    loadDnaYaml(root);
    loadMemoryYaml(root);
    loadRolesYaml(root);
    loadWorkflowsYaml(root);
    loadDirectives(root);
    return stderr.mock.calls.map(([chunk]) => String(chunk)).filter((text) => text.includes('unknown field'));
  } finally {
    stderr.mockRestore();
  }
}

describe.each(TEMPLATES.map((def) => def.name))('init scaffold (%s template) — round-trips its own loaders', (name) => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    expect(initWingfoilProject(repo, name).ok).toBe(true);
  });
  afterAll(() => removeTempDir(repo));

  it('every pillar loads from the working tree with no unknown-field warning', () => {
    expect(loadEverything(repo)).toEqual([]);
  });

  it('every pillar loads at HEAD', () => {
    expect(loadDnaYamlAtHead(repo)).not.toBeNull();
    expect(loadMemoryYamlAtHead(repo)).not.toBeNull();
    expect(loadRolesYamlAtHead(repo)).not.toBeNull();
    expect(loadWorkflowsYamlAtRev(repo, 'HEAD').manifest).not.toBeNull();
    expect(loadDirectivesAtHead(repo).length).toBeGreaterThan(0);
  });

  it('every scaffolded Memory type resolves for memory add (its template read and checked)', () => {
    for (const type of Object.keys(loadMemoryYaml(repo).types)) {
      const resolved = resolveAddType(repo, type);
      expect(resolved.ok ? type : `${type}: ${resolved.error.message}`).toBe(type);
    }
  });
});

describe('AC 1 — configuration written before the format key loads unchanged', () => {
  it('this repository’s own configuration loads with no unknown-field warning', () => {
    expect(loadEverything(join(__dirname, '..', '..'))).toEqual([]);
  });

  it('the init scaffold with every `format:` line removed loads unchanged (absent reads as format 1)', () => {
    const repo = makeTempGitRepo();
    try {
      for (const file of templateScaffold(TEMPLATES[0]!)) {
        writeFixtureFile(repo, file.path, file.content.replace(/^format: .*\n/m, ''));
      }
      commitAll(repo, 'a scaffold written before the format key');
      expect(readdirSync(join(repo, '.wingfoil')).length).toBeGreaterThan(0);
      expect(loadEverything(repo)).toEqual([]);
      for (const type of Object.keys(loadMemoryYaml(repo).types)) expect(resolveAddType(repo, type).ok).toBe(true);
    } finally {
      removeTempDir(repo);
    }
  });

  it('the 0.2.2 roles.yaml and directives (test/core/fixtures/init-0.2.2) load with no unknown-field warning', () => {
    const fixture = join(__dirname, 'fixtures', 'init-0.2.2');
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      loadRolesYaml(fixture);
      expect(loadDirectives(fixture).length).toBeGreaterThan(0);
      expect(stderr.mock.calls.map(([chunk]) => String(chunk)).filter((text) => text.includes('unknown field'))).toEqual([]);
    } finally {
      stderr.mockRestore();
    }
  });
});
});
