/**
 * task-271-add-a-reported-by-field-citing-a-consumer-feedback-note-as-pinned-provenance-checked-by-a-test
 * (`dl-163` S3c, R2) — an optional `reported_by:` list records which consumer feedback note an element
 * answers, as provenance only: `<service id>/F-<nnn>@<sha>`.
 *
 * `memory.yaml` and the scaffolds are read **as committed at `HEAD`** (`loadMemoryYamlAtHead`,
 * `resolveAddType`), the baseline `memory add` itself reads; the Memory documents from the working tree,
 * as a reader opens them.
 *
 * - **AC 1 (red-first).** The `bug`, `decision-log`, `adr`, `tech-spec` and `change-proposal` scaffolds
 *   declare `reported_by: []` with a bumped `tmpl_version`, and no other type's does; `memory.yaml`
 *   names the field on exactly those five types; `memory add` copies it and `memory submit` keeps a
 *   filled value, walked with the REAL registered operations in a throwaway repository seeded with the
 *   committed configuration.
 * - **AC 2 (red-first for the declaration it reads; the refusals characterize the new checker).** The
 *   check (`test/docs/support/reported-by.ts`) refuses an entry that is not `<service id>/F-<nnn>@<sha>`,
 *   or that names a service that is not `active` with a `feedback_inbox` — one fixture per refusal —
 *   and passes on this repository.
 *
 * Determinism (REQ-SYS-07): fixed fixtures and expectations; documents read in sorted order.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import { resolveAddType } from '../../src/core/memory-add-type';
import { splitFrontmatter } from '../../src/storage';
import { readPathAtRev } from '../../src/storage/commit';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import {
  documentProblems,
  entryProblems,
  parseFields,
  readMemoryTree,
  REPORTED_BY,
  reportedByProblems,
  servicesById,
  type ReportedByContext,
} from './support/reported-by';

const REPO_ROOT = join(__dirname, '..', '..');
const MEMORY_YAML_PATH = '.wingfoil/memory.yaml';
const MEMORY_DIR = 'docs/04_memory';

/** The five types `dl-163` S3c declares the field on, with their scaffold's `tmpl_version` before this task. */
const PREVIOUS_TMPL_VERSION: Record<string, number> = {
  bug: 261007,
  'decision-log': 261006,
  adr: 261006,
  'tech-spec': 261006,
  'change-proposal': 261009,
};
const DECLARING_TYPES = Object.keys(PREVIOUS_TMPL_VERSION);

/** A full, lowercase object name for fixtures. */
const SHA = '0123456789abcdef0123456789abcdef01234567';

/** `makeTempGitRepo`'s local identity; no operation walked here needs a role. */
const DNA_YAML = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ approver ]
  roles:
    - name: approver
paths:
  sources: [ src/ ]
`;

function memoryYaml(): NonNullable<ReturnType<typeof loadMemoryYamlAtHead>> {
  const loaded = loadMemoryYamlAtHead(REPO_ROOT);
  if (loaded === null) throw new Error(`no ${MEMORY_YAML_PATH} committed at HEAD`);
  return loaded;
}

function resolved(type: string): Extract<ReturnType<typeof resolveAddType>, { ok: true }>['value'] {
  const result = resolveAddType(REPO_ROOT, type);
  if (!result.ok) throw new Error(`${type} does not resolve at HEAD: ${result.error.message}`);
  return result.value;
}

/** The types whose scaffold committed at `HEAD` declares `reported_by:`, in `memory.yaml` order. */
function declaringTypesAtHead(): string[] {
  return Object.keys(memoryYaml().types).filter((type) => REPORTED_BY in parseFields(resolved(type).scaffold));
}

function committed(path: string): string {
  const raw = readPathAtRev(REPO_ROOT, 'HEAD', path);
  if (raw === null) throw new Error(`${path} is not committed at HEAD in ${REPO_ROOT}`);
  return raw;
}

function memoryOperation<T>(name: string): CoreFn<unknown, T> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return operation.fn as CoreFn<unknown, T>;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

describe('AC 1: `reported_by:` is declared on the five types dl-163 S3c names (task-271)', () => {
  it('exactly the bug, decision-log, adr, tech-spec and change-proposal scaffolds declare it', () => {
    expect(declaringTypesAtHead().sort()).toEqual([...DECLARING_TYPES].sort());
  });

  it.each(DECLARING_TYPES)('the %s scaffold declares it as an optional, empty list, citing dl-163', (type) => {
    const { scaffold } = resolved(type);
    expect(parseFields(scaffold)[REPORTED_BY]).toEqual([]);
    const line = (splitFrontmatter(scaffold).frontmatter ?? '').split('\n').find((candidate) => candidate.startsWith(`${REPORTED_BY}:`)) ?? '';
    expect(line).toMatch(/# optional/);
    expect(line).toContain('<service id>/F-<nnn>@<sha>');
    expect(line).toContain('dl-163');
  });

  it.each(DECLARING_TYPES)('the %s scaffold\'s `tmpl_version` is bumped', (type) => {
    const version = parseFields(resolved(type).scaffold).tmpl_version;
    expect(typeof version).toBe('number');
    expect(version as number).toBeGreaterThan(PREVIOUS_TMPL_VERSION[type] as number);
  });

  it('`memory.yaml` names the field on exactly those five types, and requires it on none', () => {
    const types = memoryYaml().types;
    const naming = Object.keys(types).filter((type) => (types[type]?.description ?? '').includes(`\`${REPORTED_BY}:\``));
    expect(naming.sort()).toEqual([...DECLARING_TYPES].sort());
    for (const type of DECLARING_TYPES) {
      expect(types[type]?.description).toContain('dl-163');
      expect(types[type]?.template?.frontmatter?.required).not.toContain(REPORTED_BY);
    }
  });

  describe('`memory add` copies it and `memory submit` keeps it', () => {
    let repo: string;

    beforeEach(() => {
      repo = makeTempGitRepo();
      writeFixtureFile(repo, MEMORY_YAML_PATH, committed(MEMORY_YAML_PATH));
      for (const type of DECLARING_TYPES) writeFixtureFile(repo, resolved(type).templatePath, committed(resolved(type).templatePath));
      writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
      commitAll(repo, 'seed: this repository\'s memory.yaml and the five scaffolds');
    });

    afterEach(() => removeTempDir(repo));

    it.each(DECLARING_TYPES)('%s', async (type) => {
      const added = await memoryOperation<{ id: string; path: string }>('memoryAdd')({
        root: repo,
        options: { type, title: 'A note a consumer filed' },
      });
      expect(added.ok ? null : added.error.message).toBeNull();
      if (!added.ok) return;
      const { id, path } = added.value;
      const absolute = join(repo, path);
      expect(parseFields(readFileSync(absolute, 'utf-8'))[REPORTED_BY]).toEqual([]);

      // The author fills the required fields (the title was set by add) and cites the note.
      const entry = `svc-001-a-consumer-repository/F-001@${SHA}`;
      let content = readFileSync(absolute, 'utf-8').replace(new RegExp(`^${REPORTED_BY}: \\[\\].*$`, 'm'), `${REPORTED_BY}: [ "${entry}" ]`);
      for (const field of resolved(type).template.frontmatter?.required ?? []) {
        content = content.replace(new RegExp(`^${field}: "".*$`, 'm'), `${field}: "filled"`);
      }
      writeFileSync(absolute, content, 'utf-8');

      const submitted = await memoryOperation('memorySubmit')({ root: repo, positional: id, positionals: [id], options: {} });
      expect(submitted.ok ? null : (submitted as { error: { message: string } }).error.message).toBeNull();
      expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(`wf(${type}): submit ${id}`);
      expect(parseFields(gitOut(repo, ['show', `HEAD:${path}`]))[REPORTED_BY]).toEqual([entry]);
    });
  });
});

describe('AC 2: every `reported_by:` entry cites a note in a registered inbox (task-271)', () => {
  const INBOX = 'docs/wingfoil-feedback/';
  const SERVICES: ReportedByContext['services'] = new Map<string, Record<string, unknown>>([
    ['svc-001-a-consumer-repository', { type: 'service', status: 'active', kind: 'repository', feedback_inbox: INBOX }],
    ['svc-002-a-pending-repository', { type: 'service', status: 'pending', kind: 'repository', feedback_inbox: INBOX }],
    ['svc-003-a-deprecated-repository', { type: 'service', status: 'deprecated', kind: 'repository', feedback_inbox: INBOX }],
    ['svc-004-a-repository-with-no-inbox', { type: 'service', status: 'active', kind: 'repository', feedback_inbox: '' }],
    ['svc-005-a-listing', { type: 'service', status: 'active', kind: 'listing', feedback_inbox: INBOX }],
    ['svc-006-an-absolute-inbox', { type: 'service', status: 'active', kind: 'repository', feedback_inbox: '/docs/wingfoil-feedback/' }],
    ['svc-007-an-account', { type: 'service', status: 'active', kind: 'account' }],
  ]);
  const CONTEXT: ReportedByContext = { declaringTypes: new Set(DECLARING_TYPES), services: SERVICES };
  const GOOD = `svc-001-a-consumer-repository/F-001@${SHA}`;

  describe('entryProblems', () => {
    it.each([
      ['a three-digit note', GOOD],
      ['a longer note number', `svc-001-a-consumer-repository/F-1234@${SHA}`],
      ['a SHA-256 object name', `svc-001-a-consumer-repository/F-001@${SHA}${SHA.slice(0, 24)}`],
    ])('accepts %s', (_label, entry) => {
      expect(entryProblems(entry, SERVICES)).toEqual([]);
    });

    it.each([
      ['no @sha', 'svc-001-a-consumer-repository/F-001'],
      ['an abbreviated sha', 'svc-001-a-consumer-repository/F-001@0123456'],
      ['an uppercase sha', `svc-001-a-consumer-repository/F-001@${SHA.toUpperCase()}`],
      ['a sha that is not hexadecimal', `svc-001-a-consumer-repository/F-001@${'g'.repeat(40)}`],
      ['a note with two digits', `svc-001-a-consumer-repository/F-01@${SHA}`],
      ['a note with no F- prefix', `svc-001-a-consumer-repository/001@${SHA}`],
      ['the note\'s file name, not its id', `svc-001-a-consumer-repository/F-001-a-slug@${SHA}`],
      ['no service', `F-001@${SHA}`],
      ['a short service id', `svc-001/F-001@${SHA}`],
      ['a path inside the inbox', `svc-001-a-consumer-repository/docs/wingfoil-feedback/F-001@${SHA}`],
      ['surrounding whitespace', ` ${GOOD}`],
    ])('refuses the shape of %s', (_label, entry) => {
      expect(entryProblems(entry, SERVICES)).toEqual([expect.stringContaining('is not <service id>/F-<nnn>@<sha>')]);
    });

    it('refuses an entry that is not a string', () => {
      expect(entryProblems({ service: 'svc-001' }, SERVICES)).toEqual([expect.stringContaining('is not a string')]);
    });

    it.each([
      ['a service that is not registered', 'svc-099-an-unknown-repository', 'names no registered service'],
      ['a pending service', 'svc-002-a-pending-repository', 'not active (status: pending)'],
      ['a deprecated service', 'svc-003-a-deprecated-repository', 'not active (status: deprecated)'],
      ['a repository with no feedback inbox', 'svc-004-a-repository-with-no-inbox', 'names a service with no feedback_inbox'],
      ['a service with no feedback_inbox key at all', 'svc-007-an-account', 'names a service with no feedback_inbox'],
      ['an inbox on a service that is not a repository', 'svc-005-a-listing', 'feedback_inbox is allowed only on a kind: repository service'],
      ['an inbox that is not repository-relative', 'svc-006-an-absolute-inbox', 'feedback_inbox must be repository-relative, not absolute'],
    ])('refuses %s', (_label, service, problem) => {
      expect(entryProblems(`${service}/F-001@${SHA}`, SERVICES)).toEqual(expect.arrayContaining([expect.stringContaining(problem)]));
    });
  });

  describe('documentProblems', () => {
    const document = (fields: Record<string, unknown>) => ({ path: 'docs/04_memory/bugs/bug-001-x.md', fields: { type: 'bug', ...fields } });

    it.each([
      ['absent', {}],
      ['null', { reported_by: null }],
      ['an empty list', { reported_by: [] }],
      ['a list of accepted entries', { reported_by: [GOOD, `svc-001-a-consumer-repository/F-002@${SHA}`] }],
    ])('accepts a field that is %s', (_label, fields) => {
      expect(documentProblems(document(fields), CONTEXT)).toEqual([]);
    });

    it('refuses a value that is not a list', () => {
      expect(documentProblems(document({ reported_by: GOOD }), CONTEXT)).toEqual([
        { path: 'docs/04_memory/bugs/bug-001-x.md', problem: 'reported_by must be a list' },
      ]);
    });

    it('refuses the field on a type that does not declare it', () => {
      expect(documentProblems(document({ type: 'task', reported_by: [GOOD] }), CONTEXT)).toEqual([
        { path: 'docs/04_memory/bugs/bug-001-x.md', problem: 'type \'task\' does not declare reported_by' },
      ]);
    });

    it('reports every refused entry, in the order the list gives them', () => {
      const problems = documentProblems(document({ reported_by: ['svc-001/F-001', GOOD, `svc-002-a-pending-repository/F-001@${SHA}`] }), CONTEXT);
      expect(problems.map((finding) => finding.problem)).toEqual([
        expect.stringContaining('\'svc-001/F-001\' is not'),
        expect.stringContaining('not active (status: pending)'),
      ]);
    });
  });

  describe('reportedByProblems over a tree', () => {
    let repo: string;

    beforeEach(() => {
      repo = makeTempGitRepo();
      const service = (id: string, status: string, inbox: string) =>
        `---\nid: ${id}\ntype: service\nstatus: ${status}\nkind: "repository"\nfeedback_inbox: "${inbox}"\n---\n`;
      const element = (type: string, entries: string[]) => `---\nid: x\ntype: ${type}\nstatus: draft\nreported_by: [ ${entries.map((e) => `"${e}"`).join(', ')} ]\n---\n`;
      writeFixtureFile(repo, `${MEMORY_DIR}/services/svc-001-a-consumer-repository.md`, service('svc-001-a-consumer-repository', 'active', INBOX));
      writeFixtureFile(repo, `${MEMORY_DIR}/services/svc-002-a-pending-repository.md`, service('svc-002-a-pending-repository', 'pending', INBOX));
      writeFixtureFile(repo, `${MEMORY_DIR}/bugs/bug-001-good.md`, element('bug', [GOOD]));
      writeFixtureFile(repo, `${MEMORY_DIR}/design/dls/dl-001-pending.md`, element('decision-log', [`svc-002-a-pending-repository/F-003@${SHA}`]));
      writeFixtureFile(repo, `${MEMORY_DIR}/bugs/bug-002-short-sha.md`, element('bug', ['svc-001-a-consumer-repository/F-004@0123456']));
      writeFixtureFile(repo, `${MEMORY_DIR}/v0.1/task-001-undeclared.md`, element('task', [GOOD]));
    });

    afterEach(() => removeTempDir(repo));

    it('finds every refused document, nested folders included, in path order', () => {
      const documents = readMemoryTree(repo, MEMORY_DIR);
      const problems = reportedByProblems(documents, { declaringTypes: new Set(DECLARING_TYPES), services: servicesById(documents) });
      expect(problems.map((finding) => finding.path)).toEqual([
        `${MEMORY_DIR}/bugs/bug-002-short-sha.md`,
        `${MEMORY_DIR}/design/dls/dl-001-pending.md`,
        `${MEMORY_DIR}/v0.1/task-001-undeclared.md`,
      ]);
    });
  });

  it('passes on this repository: every Memory document\'s `reported_by:` cites a registered inbox', () => {
    const documents = readMemoryTree(REPO_ROOT, MEMORY_DIR);
    const services = servicesById(documents);
    // The check is live: the types are declared and at least one inbox can be cited.
    expect(declaringTypesAtHead().length).toBe(DECLARING_TYPES.length);
    const citable = [...services].filter(([id]) => entryProblems(`${id}/F-001@${SHA}`, services).length === 0);
    expect(citable.length).toBeGreaterThan(0);
    expect(reportedByProblems(documents, { declaringTypes: new Set(declaringTypesAtHead()), services })).toEqual([]);
  });
});

describe('AC 3 (characterization): COLLABORATION.md `## Credit` states the contributor / reported_by: split once (task-271)', () => {
  /** The `## Credit` section, whitespace-normalized so a phrase wrapped over two lines still matches. */
  function credit(): string {
    const text = readFileSync(join(REPO_ROOT, 'COLLABORATION.md'), 'utf-8');
    const section = text.split(/^## /m).find((part) => part.startsWith('Credit')) ?? '';
    return section.replace(/\s+/g, ' ');
  }

  it.each([
    ['contributor says who', '`contributor:` says **who**'],
    ['reported_by: says where', '`reported_by:` says **where** it was reported'],
    ['the entry format', '`<service id>/F-<nnn>@<sha>`'],
    ['a GitHub issue uses contributor plus its URL', 'the issue URL in `credit:`'],
    ['reported_by: is only for registered inboxes', 'that field is only for notes filed in a registered consumer repository\'s inbox'],
    ['feature requests go as change-proposal through vision-change', 'is filed as a `change-proposal` through `vision-change`'],
    ['keeping the field through memory amend is a review rule', '**Review rule: `reported_by:` survives an amendment.**'],
  ])('%s', (_label, phrase) => {
    expect(credit()).toContain(phrase);
  });

  it('the rule is stated once: no other section of COLLABORATION.md names `reported_by:`', () => {
    const text = readFileSync(join(REPO_ROOT, 'COLLABORATION.md'), 'utf-8');
    const outside = text.split(/^## /m).filter((part) => !part.startsWith('Credit'));
    expect(outside.filter((part) => part.includes(REPORTED_BY))).toEqual([]);
  });
});
