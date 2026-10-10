/**
 * task-269 (`dl-163` S3b, configuration half) — a consumer repository is registered as a `service` of
 * kind `repository`, with an optional `feedback_inbox`: the folder, in that repository, where the
 * consumer keeps its notes about WingFoil (`dl-163` R1).
 *
 * `memory.yaml` and the scaffold are read **as committed at `HEAD`** (`loadMemoryYamlAtHead`,
 * `resolveAddType`), the baseline `memory add` itself reads; the Workflow pillar through
 * `loadWorkflowsYaml`, the loader `workflow list` uses; the two configuration guides and the service
 * documents from the working tree, as a reader opens them.
 *
 * - **AC 1 (red-first).** The scaffold declares `repository` among the kinds and an optional
 *   `feedback_inbox`, with a bumped `tmpl_version`; `memory.yaml`'s `service` declaration names both;
 *   a `feedback_inbox` that is absolute or contains `..` is refused (`feedbackInboxProblems`), and
 *   every committed service passes.
 * - **AC 2 (red-first, reclassified at design).** `service-ingest`'s description, `.wingfoil/README.md`
 *   and `.wingfoil/WORKFLOW.md` list the new kind.
 * - **AC 3 (red-first, reclassified at design).** The scaffold's Verification comment gives a
 *   repository service's `verify` shape.
 *
 * Determinism (REQ-SYS-07): fixed expectations; service documents are read in sorted order.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { loadMemoryYamlAtHead, loadWorkflowsYaml } from '../../src/core/loaders';
import { resolveAddType } from '../../src/core/memory-add-type';
import { splitFrontmatter } from '../../src/storage';
import { feedbackInboxProblems, REPOSITORY_KIND } from './helpers/service-fields';

const REPO_ROOT = join(__dirname, '..', '..');
const SERVICES_DIR = join(REPO_ROOT, 'docs', '04_memory', 'services');

/** `dl-088`'s six kinds, then `dl-163` S3b's seventh, in the order the scaffold lists them. */
const KINDS = ['account', 'credential', 'listing', 'setting', 'domain', 'handle', REPOSITORY_KIND];

/** `tmpl_version` of the service scaffold before this task (pre-batch main `b56e8721`). */
const PREVIOUS_TMPL_VERSION = 261006;

/** The two read-only commands a repository service's `verify` runs (`dl-163` S3b, Verify). */
const VERIFY_SHAPE = [
  '`git ls-remote <url> refs/heads/main`',
  '`gh api repos/<owner>/<repo>/contents/<feedback_inbox>README.md --jq .sha`',
];

function scaffold(): string {
  const result = resolveAddType(REPO_ROOT, 'service');
  if (!result.ok) throw new Error(`service scaffold does not resolve: ${result.error.message}`);
  return result.value.scaffold;
}

function frontmatterLine(content: string, field: string): string | undefined {
  return (splitFrontmatter(content).frontmatter ?? '').split('\n').find((line) => line.startsWith(`${field}:`));
}

/** The kinds a `kind:` line's comment enumerates (`# REQUIRED — a | b | …`). */
function declaredKinds(content: string): string[] {
  const comment = (frontmatterLine(content, 'kind') ?? '').split('—')[1] ?? '';
  return comment.split('|').map((kind) => kind.trim());
}

/** Whitespace-normalized text, so a phrase wrapped over two lines still matches. */
function normalized(text: string): string {
  return text.replace(/\s+/g, ' ');
}

describe('AC 1: the `service` type accepts `kind: repository` and an optional `feedback_inbox` (task-269, dl-163 S3b)', () => {
  it('the scaffold lists `repository` as the seventh kind', () => {
    expect(declaredKinds(scaffold())).toEqual(KINDS);
  });

  it('the scaffold declares `feedback_inbox` as an optional, repository-relative folder, for kind repository only', () => {
    const fields = load(splitFrontmatter(scaffold()).frontmatter ?? '') as Record<string, unknown>;
    expect(fields).toHaveProperty('feedback_inbox', '');
    const line = frontmatterLine(scaffold(), 'feedback_inbox');
    expect(line).toMatch(/# optional/);
    expect(line).toContain('kind: repository');
    expect(line).toContain('repository-relative');
    expect(line).toContain('ending in `/`');
    expect(line).toContain('docs/wingfoil-feedback/');
    expect(line).toContain('dl-163');
  });

  it('the scaffold\'s `tmpl_version` is bumped', () => {
    const fields = load(splitFrontmatter(scaffold()).frontmatter ?? '') as Record<string, unknown>;
    expect(typeof fields.tmpl_version).toBe('number');
    expect(fields.tmpl_version as number).toBeGreaterThan(PREVIOUS_TMPL_VERSION);
  });

  it('`memory.yaml`\'s `service` declaration names the repository kind and its feedback inbox', () => {
    const memoryYaml = loadMemoryYamlAtHead(REPO_ROOT);
    const description = memoryYaml?.types.service?.description ?? '';
    expect(description).toContain('domain, handle, repository');
    expect(description).toContain('feedback_inbox');
    expect(description).toContain('dl-163');
    // `feedback_inbox` is optional: the required list is dl-088's five, unchanged.
    expect(memoryYaml?.types.service?.template?.frontmatter?.required).toEqual(['title', 'provider', 'kind', 'owner_role', 'verify']);
  });

  describe('feedbackInboxProblems', () => {
    it.each([
      ['absent', { kind: 'listing' }],
      ['empty, on any kind', { kind: 'listing', feedback_inbox: '' }],
      ['the dl-163 R1 folder', { kind: REPOSITORY_KIND, feedback_inbox: 'docs/wingfoil-feedback/' }],
      ['a top-level folder', { kind: REPOSITORY_KIND, feedback_inbox: 'feedback/' }],
    ])('accepts %s', (_label, fields) => {
      expect(feedbackInboxProblems(fields)).toEqual([]);
    });

    it.each([
      ['a POSIX absolute path', '/docs/wingfoil-feedback/', 'feedback_inbox must be repository-relative, not absolute'],
      ['a home-relative path', '~/wingfoil-feedback/', 'feedback_inbox must be repository-relative, not absolute'],
      ['a drive-letter path', 'C:/wingfoil-feedback/', 'feedback_inbox must be repository-relative, not absolute'],
      ['a UNC path', '\\\\host\\share\\', 'feedback_inbox must be repository-relative, not absolute'],
      ['a leading ..', '../wingfoil-feedback/', 'feedback_inbox must not contain a .. segment'],
      ['an inner ..', 'docs/../wingfoil-feedback/', 'feedback_inbox must not contain a .. segment'],
      ['a trailing ..', 'docs/../', 'feedback_inbox must not contain a .. segment'],
      ['a backslash separator', 'docs\\wingfoil-feedback/', 'feedback_inbox must use / as its separator'],
      ['a file, not a folder', 'docs/wingfoil-feedback', 'feedback_inbox must name a folder, ending in /'],
      ['an empty segment', 'docs//wingfoil-feedback/', 'feedback_inbox must not contain an empty or . segment'],
      ['a . segment', './docs/wingfoil-feedback/', 'feedback_inbox must not contain an empty or . segment'],
    ])('refuses %s', (_label, value, problem) => {
      expect(feedbackInboxProblems({ kind: REPOSITORY_KIND, feedback_inbox: value })).toContain(problem);
    });

    it('refuses a value that is not a string', () => {
      expect(feedbackInboxProblems({ kind: REPOSITORY_KIND, feedback_inbox: ['docs/'] })).toEqual(['feedback_inbox must be a string']);
    });

    it('refuses an inbox on a service that is not a repository', () => {
      expect(feedbackInboxProblems({ kind: 'account', feedback_inbox: 'docs/wingfoil-feedback/' })).toEqual([
        `feedback_inbox is allowed only on a kind: ${REPOSITORY_KIND} service`,
      ]);
    });
  });

  it('every committed service has a declared kind and an accepted feedback inbox', () => {
    const files = readdirSync(SERVICES_DIR).filter((name) => name.endsWith('.md')).sort();
    expect(files.length).toBeGreaterThan(0);
    const problems = files.flatMap((name) => {
      const fields = load(splitFrontmatter(readFileSync(join(SERVICES_DIR, name), 'utf-8')).frontmatter ?? '') as Record<string, unknown>;
      const kindProblem = KINDS.includes(String(fields.kind)) ? [] : [`kind '${String(fields.kind)}' is not declared`];
      return [...kindProblem, ...feedbackInboxProblems(fields)].map((problem) => `${name}: ${problem}`);
    });
    expect(problems).toEqual([]);
  });
});

describe('AC 2: the configuration guides list the new kind (task-269)', () => {
  it('`service-ingest`\'s description lists it', () => {
    const workflow = loadWorkflowsYaml(REPO_ROOT).workflows.find((candidate) => candidate.name === 'service-ingest');
    expect(workflow?.description).toContain('domain, handle, repository');
  });

  it.each(['.wingfoil/README.md', '.wingfoil/WORKFLOW.md'])('%s lists it beside dl-088\'s kinds', (path) => {
    expect(normalized(readFileSync(join(REPO_ROOT, path), 'utf-8'))).toContain('setting, domain, handle, repository');
  });
});

describe('AC 3: the scaffold documents a repository service\'s `verify` shape (task-269)', () => {
  it('the Verification comment gives both read-only commands, the inbox\'s README included', () => {
    const { body } = splitFrontmatter(scaffold());
    const verification = normalized(body.split('## Verification')[1]?.split('\n## ')[0] ?? '');
    expect(verification).toContain('kind: repository');
    for (const command of VERIFY_SHAPE) expect(verification).toContain(command);
  });
});
