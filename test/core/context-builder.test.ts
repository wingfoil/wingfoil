/**
 * `assembleExecutionContext` as `spec-012`'s single public entry (task-176): a `ContextRequest
 * {role, element, stateRef, limits}` read entirely at `stateRef` through task-137's `…AtRev`
 * readers, DNA selected per §4, Memory ranked per §6, directives resolved per §5, validated (P5.4.4
 * sc. 3) and serialized into §7's canonical Markdown payload.
 *
 * Acceptance traced here: P5.4.4 sc. 1–3 (`p5-interaction/P5.4.4-execution-context.feature`), P5.3.3
 * sc. 1–3 (`P5.3.3-relevance-filtering.feature`), P5.4.2 sc. 1–2 (`P5.4.2-role-directives-binding.feature`),
 * `spec-012` §4/§5.1/§7/§8, REQ-PERF-05.
 */
import { hostname } from 'os';

import {
  assembleExecutionContext,
  serializeExecutionContext,
  validateExecutionContext,
  type ContextRequest,
} from '../../src/core/context';
import { DEFAULT_CONTEXT_LIMITS, NO_RELEVANT_MEMORY_NOTE } from '../../src/core/relevance';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
    id_pattern: "adr-{n}-{slug}"
`;

/** `paths` is declared BEFORE `modules` and `team` on purpose: the schema's own key order differs,
 * so a selection that follows the parsed object instead of the file would fail the order test. */
const DNA_YAML = `
version: 1.1
project:
  name: Fixture
paths:
  sources: [ src/ ]
  tests: [ test/ ]
  docs: [ docs/ ]
  config: [ package.json ]
  governance: [ .wingfoil/ ]
  runs: [ .wingfoil/runs/ ]
modules:
  - name: core
    path: src/core
  - name: memory
    path: src/memory
  - name: cli
    path: src/cli
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
    - name: reviewer
`;

const ROLES_YAML = `
version: 1.0
assignments:
  developer:
    - testing
  reviewer:
    - code-review
global:
  - doc-versioning
`;

function directiveMd(id: string, body = `Rule body of ${id}.`): string {
  return `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n\n${body}\n`;
}

function writeConfig(root: string, roles = ROLES_YAML): void {
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', roles);
  for (const id of ['testing', 'code-quality', 'code-review', 'doc-versioning']) {
    writeFixtureFile(root, `.wingfoil/directives/custom/${id}.md`, directiveMd(id));
  }
}

/** A task document; `extra` lines go into the frontmatter verbatim. */
function writeTask(
  root: string,
  id: string,
  fields: { release?: string; status?: string; tags?: string[]; extra?: string[]; body?: string } = {},
): void {
  // No `title:`: spec-012 §6 T4 matches title tokens, and a shared word would make every document relevant.
  const { release = 'v0.2', status = 'backlog', tags = [], extra = [], body = `Body of ${id}.` } = fields;
  const lines = ['---', `id: ${id}`, 'type: task', `release: "${release}"`, `status: ${status}`];
  lines.push(`tags: [${tags.join(', ')}]`, ...extra, '---', '', body, '');
  writeFixtureFile(root, `docs/04_memory/${release}/${id}.md`, lines.join('\n'));
}

function headSha(root: string): string {
  return git(root, ['rev-parse', 'HEAD']).trim();
}

const ELEMENT_ID = 'task-001-active';

function request(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD', ...overrides };
}

function build(root: string, overrides: Partial<ContextRequest> = {}) {
  const result = assembleExecutionContext(root, request(overrides));
  if (!result.ok) throw new Error(`expected a context, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** The text of one `## n.` section of the payload, heading included, up to the next `## ` heading. */
function section(payload: string, heading: string): string {
  const start = payload.indexOf(`\n${heading}`);
  if (start < 0) throw new Error(`no section ${heading}`);
  const next = payload.indexOf('\n## ', start + 1);
  return payload.slice(start + 1, next < 0 ? undefined : next + 1);
}

function subHeadings(text: string): string[] {
  return text.split('\n').filter((line) => line.startsWith('### ')).map((line) => line.slice(4));
}

describe('assembleExecutionContext — spec-012 context builder (task-176)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeConfig(repo);
    writeTask(repo, ELEMENT_ID, { tags: ['performance'], extra: ['depends_on: ["task-002-linked"]'] });
    writeTask(repo, 'task-002-linked', { release: 'v0.9' });
    writeTask(repo, 'task-003-unrelated', { release: 'v0.9', tags: ['other'] });
    commitAll(repo, 'seed');
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  describe('P5.4.4 sc. 1 — distinct, addressable sections and §7 headings as fixed literals', () => {
    it('exposes element, dna, directives and memory as distinct properties', () => {
      const { context } = build(repo);
      expect(context.element.frontmatter.id).toBe(ELEMENT_ID);
      expect(context.dna.modules.map((m) => m.name)).toEqual(['core', 'memory', 'cli']);
      expect(context.directives.map((d) => d.frontmatter.id)).toEqual(['doc-versioning', 'testing']);
      expect(context.memory.map((d) => d.id)).toEqual(['task-002-linked']);
    });

    it('carries the §7 headings in their fixed order', () => {
      const { payload } = build(repo);
      const headings = payload.split('\n').filter((line) => /^#{1,2} /.test(line));
      expect(headings).toEqual([
        '# WingFoil Agent Context',
        '## 1. Task',
        '## 2. Project DNA',
        '## 3. Directives (developer + global)',
        '## 4. Relevant Memory (1 documents)',
      ]);
    });

    it('renders `## 4. Relevant Memory (0 documents)` with an empty body when nothing is relevant', () => {
      writeTask(repo, ELEMENT_ID, { release: 'v0.2', tags: ['lonely'] });
      commitAll(repo, 'drop the link');
      const { payload, context } = build(repo);
      expect(context.memory).toEqual([]);
      expect(payload.endsWith('\n## 4. Relevant Memory (0 documents)\n')).toBe(true);
    });

    it('the header carries role, element and the resolved full sha only', () => {
      const { payload } = build(repo);
      expect(payload.split('\n').slice(0, 2)).toEqual([
        '# WingFoil Agent Context',
        `<!-- role: developer | element: task:${ELEMENT_ID} | state: ${headSha(repo)} -->`,
      ]);
    });
  });

  describe('P5.4.4 sc. 2 / spec-012 §8 — determinism and canonical form', () => {
    it('two independent builds of the same request are byte-identical', () => {
      const sha = headSha(repo);
      const first = build(repo, { stateRef: sha }).payload;
      const second = build(repo, { stateRef: sha }).payload;
      expect(second).toBe(first);
    });

    it('a build at a different stateRef whose Memory differs is not', () => {
      const before = headSha(repo);
      writeTask(repo, 'task-004-added-later', { tags: ['performance'] });
      commitAll(repo, 'add a relevant task');
      const after = headSha(repo);
      const old = build(repo, { stateRef: before }).payload;
      const now = build(repo, { stateRef: after }).payload;
      expect(now).not.toBe(old);
      expect(subHeadings(section(old, '## 4.'))).toEqual(['task:task-002-linked']);
      expect(subHeadings(section(now, '## 4.'))).toEqual(['task:task-002-linked', 'task:task-004-added-later']);
    });

    it('reads Memory at stateRef: a working-tree-only document never enters the context', () => {
      writeTask(repo, 'task-005-uncommitted', { tags: ['performance'] });
      const { context } = build(repo);
      expect(context.memory.map((d) => d.id)).not.toContain('task-005-uncommitted');
    });

    it('holds no timestamp, host or absolute path; LF only; one trailing newline; no trailing whitespace', () => {
      writeTask(repo, 'task-002-linked', { release: 'v0.9', body: 'line one   \r\nline two\r\n\r\n\r\n' });
      commitAll(repo, 'CRLF body with trailing blanks');
      const { payload } = build(repo);
      expect(payload).not.toContain(repo);
      expect(payload).not.toContain(hostname());
      expect(payload).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(payload).not.toContain('\r');
      expect(payload.endsWith('\n')).toBe(true);
      expect(payload.endsWith('\n\n')).toBe(false);
      expect(payload).not.toMatch(/[ \t]+$/m);
      expect(payload).toContain('line one\nline two\n');
    });

    it('re-emits frontmatter YAML with sorted keys, so a key-order change does not perturb the payload', () => {
      const before = build(repo).payload;
      writeFixtureFile(
        repo,
        `docs/04_memory/v0.2/${ELEMENT_ID}.md`,
        ['---', 'tags: [performance]', 'status: backlog', 'release: "v0.2"', 'type: task',
          `id: ${ELEMENT_ID}`, 'depends_on: ["task-002-linked"]', '---', '', `Body of ${ELEMENT_ID}.`, ''].join('\n'),
      );
      commitAll(repo, 'reorder frontmatter keys');
      const after = build(repo).payload;
      const withoutHeader = (text: string): string => text.split('\n').slice(2).join('\n');
      expect(withoutHeader(after)).toBe(withoutHeader(before));
      const task = section(after, '## 1. Task');
      const keys = task.split('\n').filter((line) => /^[a-z_]+:/.test(line)).map((line) => line.split(':')[0]);
      expect(keys).toEqual([...keys].sort());
      expect(keys).toEqual(['depends_on', 'id', 'release', 'status', 'tags', 'type']);
    });
  });

  describe('P5.4.4 sc. 3 — a context missing a section is refused before use', () => {
    it.each(['element', 'dna', 'directives', 'memory'])("refuses a context without '%s'", (name) => {
      const { context } = build(repo);
      const broken: Record<string, unknown> = { ...context };
      delete broken[name];
      const result = validateExecutionContext(broken);
      expect(result).toEqual({
        ok: false,
        error: { code: 'VALIDATION', message: `invalid execution context: missing '${name}' section` },
      });
    });

    it("refuses with the scenario's verbatim message when the Directives section is missing", () => {
      const { context } = build(repo);
      const result = validateExecutionContext({ ...context, directives: undefined });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe("invalid execution context: missing 'directives' section");
    });

    it('accepts a complete context unchanged', () => {
      const { context } = build(repo);
      expect(validateExecutionContext(context)).toEqual({ ok: true, value: context });
    });

    it('assembly refuses — and emits no payload — when stateRef holds no roles.yaml', () => {
      git(repo, ['rm', '--quiet', '.wingfoil/roles.yaml']);
      commitAll(repo, 'drop roles.yaml');
      const result = assembleExecutionContext(repo, request());
      expect(result).toEqual({
        ok: false,
        error: { code: 'VALIDATION', message: "invalid execution context: missing 'directives' section" },
      });
    });

    it('serializeExecutionContext refuses an invalid context rather than rendering a partial payload', () => {
      const { context } = build(repo);
      expect(() => serializeExecutionContext({ ...context, dna: undefined } as never)).toThrow(
        "invalid execution context: missing 'dna' section",
      );
    });
  });

  describe('the request itself', () => {
    it('an element stateRef does not hold is NOT_FOUND', () => {
      const result = assembleExecutionContext(repo, request({ element: { type: 'task', id: 'task-999-missing' } }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toBe(`element 'task:task-999-missing' not found at ${headSha(repo)}`);
      }
    });

    it('an archived element is refused: it never enters an execution context (REQ-STATE-06, dl-028)', () => {
      writeTask(repo, ELEMENT_ID, { status: 'deprecated' });
      commitAll(repo, 'deprecate');
      const result = assembleExecutionContext(repo, request());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toBe(`element 'task:${ELEMENT_ID}' is deprecated: an archived element never enters an execution context`);
      }
    });

    it('a draft element still assembles: draft is not archived (dl-028)', () => {
      writeTask(repo, ELEMENT_ID, { status: 'draft' });
      commitAll(repo, 'back to draft');
      expect(build(repo).context.element.frontmatter.status).toBe('draft');
    });

    it('a stateRef naming no commit is refused with the RevisionError CoreError', () => {
      const result = assembleExecutionContext(repo, request({ stateRef: 'no-such-branch' }));
      expect(result).toEqual({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'revision "no-such-branch" does not name a commit',
          details: { rev: 'no-such-branch' },
        },
      });
    });
  });

  describe('spec-012 §4 — DNA selection', () => {
    it('emits project, modules, team and paths in dna.yaml declared order (stacks and version are not selected)', () => {
      const { context, payload } = build(repo);
      expect(Object.keys(context.dna)).toEqual(['project', 'paths', 'modules', 'team']);
      expect(subHeadings(section(payload, '## 2. Project DNA'))).toEqual(['project', 'paths', 'modules', 'team']);
    });

    it('includes every paths category, runs among them', () => {
      const { context } = build(repo);
      expect(Object.keys(context.dna.paths ?? {}).sort()).toEqual(['config', 'docs', 'governance', 'runs', 'sources', 'tests']);
    });

    it('all modules when the element declares neither modules: nor scope:', () => {
      expect(build(repo).context.dna.modules.map((m) => m.name)).toEqual(['core', 'memory', 'cli']);
    });

    it("only the element's modules: entries, in dna.yaml order", () => {
      writeTask(repo, ELEMENT_ID, { extra: ['modules: [cli, core]'] });
      commitAll(repo, 'scope by modules');
      expect(build(repo).context.dna.modules.map((m) => m.name)).toEqual(['core', 'cli']);
    });

    it("the element's scope: entry, as a single string", () => {
      writeTask(repo, ELEMENT_ID, { extra: ['scope: "memory"'] });
      commitAll(repo, 'scope by scope');
      const { context, payload } = build(repo);
      expect(context.dna.modules.map((m) => m.name)).toEqual(['memory']);
      expect(section(payload, '## 2. Project DNA')).not.toContain('src/cli');
    });
  });

  describe('P5.3.3 sc. 1–3 — relevance filtering at stateRef, on a 100-document fixture', () => {
    function seedHundred(relevant: number, deprecated = 0): string[] {
      const ids: string[] = [];
      for (let n = 0; n < relevant; n += 1) {
        const id = `task-2${String(n).padStart(3, '0')}-relevant`;
        writeTask(repo, id, { tags: ['performance'], status: n < deprecated ? 'deprecated' : 'backlog' });
        if (n >= deprecated) ids.push(id);
      }
      // Already three documents (element, linked, unrelated); fill to exactly 100.
      for (let n = 0; n < 97 - relevant; n += 1) {
        writeTask(repo, `task-3${String(n).padStart(3, '0')}-noise`, { release: 'v0.5', tags: ['noise'] });
      }
      // Remove the T1 link so only the seeded documents are relevant.
      writeTask(repo, ELEMENT_ID, { tags: ['performance'] });
      commitAll(repo, 'seed 100 documents');
      return ids;
    }

    it('sc. 1 — exactly the relevant documents appear under ## 4', () => {
      const ids = seedHundred(5);
      const { payload, context } = build(repo);
      expect(subHeadings(section(payload, '## 4.'))).toEqual(ids.map((id) => `task:${id}`));
      expect(context.memory).toHaveLength(5);
      expect(payload).toContain('## 4. Relevant Memory (5 documents)');
    });

    it('sc. 2 — a deprecated relevant document is excluded', () => {
      const ids = seedHundred(5, 1);
      const { payload } = build(repo);
      expect(ids).toHaveLength(4);
      expect(subHeadings(section(payload, '## 4.'))).toEqual(ids.map((id) => `task:${id}`));
      expect(payload).not.toContain('task-2000-relevant');
    });

    it('sc. 3 — none relevant: zero documents, and the note travels in the diagnostics, not the payload', () => {
      seedHundred(0);
      writeTask(repo, ELEMENT_ID, { release: 'v0.7', tags: ['lonely'] });
      commitAll(repo, 'make the element unrelated');
      const { payload, context, notes } = build(repo);
      expect(context.memory).toEqual([]);
      expect(payload).toContain('## 4. Relevant Memory (0 documents)');
      expect(notes).toEqual([NO_RELEVANT_MEMORY_NOTE]);
      expect(payload).not.toContain(NO_RELEVANT_MEMORY_NOTE);
    });

    it('records no note when relevant Memory was found', () => {
      expect(build(repo).notes).toEqual([]);
    });
  });

  describe('P5.4.2 sc. 1–2 — bound directives auto-load under ## 3 (characterization)', () => {
    it('sc. 1 — the directive bound to developer, and the globals, appear sorted ascending', () => {
      const { payload } = build(repo);
      expect(subHeadings(section(payload, '## 3. Directives (developer + global)'))).toEqual(['doc-versioning', 'testing']);
      expect(section(payload, '## 3.')).toContain('Rule body of testing.');
    });

    it('sc. 2 — a directive bound later appears at the stateRef that binds it, not before', () => {
      const before = headSha(repo);
      writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML.replace('    - testing', '    - testing\n    - code-quality'));
      commitAll(repo, 'bind code-quality to developer');
      expect(subHeadings(section(build(repo, { stateRef: before }).payload, '## 3.'))).toEqual(['doc-versioning', 'testing']);
      expect(subHeadings(section(build(repo).payload, '## 3.'))).toEqual(['code-quality', 'doc-versioning', 'testing']);
    });
  });

  describe('ExecutionContext.warnings — spec-012 §5.1 kinds in order, never in the payload (characterization)', () => {
    it('keeps no-assignments, dangling and shadowed warnings in that order, outside the payload bytes', () => {
      writeFixtureFile(repo, '.wingfoil/roles.yaml', 'version: 1.0\nassignments: {}\nglobal:\n  - doc-versioning\n  - security-secrets\n');
      writeFixtureFile(repo, '.wingfoil/directives/built-in/doc-versioning.md', directiveMd('doc-versioning', 'Shipped default.'));
      commitAll(repo, 'unbound role, dangling global, shadowed global');
      const { context, payload } = build(repo, { role: 'intern' });
      expect(context.warnings).toEqual([
        "no directives assigned to role 'intern'",
        "directive 'security-secrets' bound to role 'intern' has no directive file",
        "directive 'doc-versioning' defined in directives/built-in/doc-versioning.md, directives/custom/doc-versioning.md; using directives/custom/doc-versioning.md",
      ]);
      for (const warning of context.warnings) expect(payload).not.toContain(warning);
      expect(payload).not.toContain('Shipped default.');
    });
  });

  describe('REQ-PERF-05 — a 1,000-document fixture stays within DEFAULT_CONTEXT_LIMITS (characterization)', () => {
    it('carries at most maxDocs documents and maxBytes body bytes', () => {
      writeTask(repo, ELEMENT_ID, { tags: ['performance'] });
      for (let n = 0; n < 60; n += 1) {
        writeTask(repo, `task-4${String(n).padStart(3, '0')}-hot`, { tags: ['performance'], body: 'x'.repeat(2000) });
      }
      for (let n = 0; n < 937; n += 1) {
        writeTask(repo, `task-5${String(n).padStart(3, '0')}-cold`, { release: 'v0.5', tags: ['noise'] });
      }
      commitAll(repo, 'seed 1,000 documents');
      const { context } = build(repo);
      const bytes = context.memory.reduce((sum, doc) => sum + Buffer.byteLength(doc.body, 'utf-8'), 0);
      expect(context.memory).toHaveLength(DEFAULT_CONTEXT_LIMITS.maxDocs);
      expect(bytes).toBeLessThanOrEqual(DEFAULT_CONTEXT_LIMITS.maxBytes);
    });

    it('honours caller-supplied limits', () => {
      writeTask(repo, 'task-006-hot', { tags: ['performance'] });
      commitAll(repo, 'second relevant doc');
      expect(build(repo, { limits: { maxDocs: 1, maxBytes: DEFAULT_CONTEXT_LIMITS.maxBytes } }).context.memory).toHaveLength(1);
    });
  });
});
