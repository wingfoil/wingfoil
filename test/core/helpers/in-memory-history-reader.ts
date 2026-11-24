/**
 * task-365 (`spec-020` §4.13, AC-8; design item 1, D1 (a)) — an in-memory {@link HistoryReader}: a model of a linear
 * repository history, so `test/core/governance-check.test.ts` drives every check of `src/core/governance-check.ts` with
 * no repository at all.
 *
 * The model is a list of commits, each with its author, subject, body and the full tree it records (path → text). Every
 * answer of the reader is derived from that model, the way the git reader derives it from a repository:
 *
 * - `commits()` — the commits after {@link HistoryModel.markBase} (the range), oldest first;
 * - `touchedPaths` / `fileChanges` — the difference between a commit's tree and its first parent's (a root commit
 *   against the empty tree); a merge has none (`git log --name-only` lists no path for a merge); a declared rename is a
 *   `{ from, to }` change in `fileChanges` and two paths in `touchedPaths` (`--no-renames`);
 * - `blob(rev, path)` — the text at `<rev>`, a full sha, `HEAD`, or `<sha>^`, `<sha>^1`, `<sha>~`, `<sha>~1` (the first
 *   parent); `null` when the revision or the path is absent;
 * - `memoryYamlAt` / `dnaYamlAt` — `null` for a `null` revision or an absent file; otherwise the committed text parsed and
 *   validated against the schema only (`MemoryYaml` / `DnaYaml`, `spec-020` §4.1), `{ ok: false, error }` carrying the
 *   first issue's message, the text `spec-020` §4.4 / §4.5 interpolate as `<first issue>` / `<issue>`;
 * - `transitions(path)` — the walk `reconstructMemoryTransitions` returns, on the fields its pinned tests read (`sha`,
 *   `subject`, `operation`, `fromState`, `toState`, `reason`, `approval`), from-state read at the first parent;
 * - `transitionFindings(path)` — the canned answer a case declares ({@link ReaderOptions.transitionFindings}), else none
 *   for a Markdown path; any other path is an unexpected call and throws;
 * - `isRejectCommit(token)` — a hex token of 7 to 40 characters that prefixes a known commit whose subject reads as a
 *   `reject`;
 * - `headDocumentStatus(id)` — the `status:` of the document whose frontmatter `id` is `id` at `HEAD` (`null` without a
 *   status), `undefined` when no document has that id;
 * - `carriesLineBefore(sha)` (task-378, `spec-020` §4.14) — whether a proper ancestor of `sha` (any parent, recursively)
 *   has a body line starting exactly `Carries content: `.
 *
 * Deterministic: shas are derived from the commit's position, never random. Not a `.test.ts` file.
 */
import type { HistoryCommit, HistoryReader } from '../../../src/core/governance-check';
import { DnaYaml } from '../../../src/dna/schema';
import { MemoryYaml } from '../../../src/memory/schema';
import { parseYaml } from '../../../src/validation';

/** A commit author. */
export interface Person {
  readonly name: string;
  readonly email: string;
}

export const APPROVER: Person = { name: 'Ada Approver', email: 'approver@example.invalid' };
export const DEVELOPER: Person = { name: 'Dev Eloper', email: 'developer@example.invalid' };
export const STRANGER: Person = { name: 'Stranger', email: 'stranger@example.invalid' };

/**
 * The `memory.yaml` of the fixture: the `task` machine of `test/cli/check-governance-parent-state.test.ts`, copied, with
 * the `returns` edge `spec-020` T-12 names, and an `adr` machine whose `accepted` is a `waiting` state that leads to
 * `superseded` (the supersede pair of T-16, the shape of `test/cli/check-governance-enforcement.test.ts`).
 */
export const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
      returns: { in-progress: backlog }
  adr:
    path: "docs/memory/adr/{id}.md"
    states:
      sequence: [draft, pending, accepted, superseded]
      gates:
        pending: { reject: draft }
      waiting: [accepted]
`;

/** A `dna.yaml` with the given members (the shape of `test/cli/check-governance-parent-state.test.ts`'s `DNA`). */
export function dnaYaml(members: readonly (Person & { readonly roles: readonly string[] })[]): string {
  const entries = members.map((member) => `    - name: ${member.name}\n      email: ${member.email}\n      roles: [ ${member.roles.join(', ')} ]\n`).join('');
  return `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
${entries}  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;
}

/** The copied `DNA`: one approver (who is also a developer) and one developer. */
export const DNA = dnaYaml([
  { ...APPROVER, roles: ['approver', 'developer'] },
  { ...DEVELOPER, roles: ['developer'] },
]);

/** A `dna.yaml` that parses as YAML and does not validate (`modules` missing). */
export const INVALID_DNA = 'version: 1.1\nteam: 3\n';
/** A `memory.yaml` that parses as YAML and does not validate (`types` is no record). */
export const INVALID_MEMORY_YAML = 'version: 1\ntypes: 3\n';

export const TASK = (id: string): string => `docs/memory/task/${id}.md`;
export const ADR = (id: string): string => `docs/memory/adr/${id}.md`;

/** The copied `taskDoc`, with the id as a parameter (`t-1` by default, as there). */
export function taskDoc(status: string, extra = '', id = 't-1'): string {
  return ['---', `id: "${id}"`, 'type: task', `title: "Task ${id}"`, `status: ${status}`, '---', '', 'Body.', ...(extra ? [extra] : []), ''].join('\n');
}

/** An `adr` document, with an optional `supersedes:`. */
export function adrDoc(id: string, status: string, supersedes = ''): string {
  return ['---', `id: "${id}"`, 'type: adr', `title: "ADR ${id}"`, `status: ${status}`, ...(supersedes ? [`supersedes: ${supersedes}`] : []), '---', '', 'Body.', ''].join('\n');
}

/** The `Approver:` line of `who` with `role`. */
export function approverLine(who: Person = APPROVER, role = 'approver'): string {
  return `Approver: ${who.name} <${who.email}> (${role})`;
}

/** A well-formed approval body: the `Approver:` line, then the `Reason:` line. */
export function approvalBody(reason = 'Ready.', who: Person = APPROVER, role = 'approver'): string {
  return `${approverLine(who, role)}\nReason: ${reason}`;
}

/** What one commit of the model records. */
export interface CommitSpec {
  readonly subject: string;
  readonly body?: string;
  readonly author?: Person;
  /** Files written (text) or deleted (`null`), on top of the first parent's tree. */
  readonly files?: Readonly<Record<string, string | null>>;
  /** Renames `from → to`, applied before {@link files}. */
  readonly renames?: Readonly<Record<string, string>>;
  /** Explicit parents (a merge); by default the current tip, or none for the first commit. */
  readonly parents?: readonly string[];
  /** A commit that does not move the tip (a side branch's commit, to merge later). */
  readonly detached?: boolean;
}

interface ModelCommit {
  readonly commit: HistoryCommit;
  readonly tree: Readonly<Record<string, string>>;
  readonly renames: Readonly<Record<string, string>>;
}

/** Canned answers of the walks a case declares. */
export interface ReaderOptions {
  readonly transitionFindings?: Readonly<Record<string, ReturnType<HistoryReader['transitionFindings']>>>;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
/** A body line starting exactly `Carries content: ` (`spec-020` §4.14: what `carriesLineBefore` looks for, case kept). */
const CARRIES_LINE_RE = /^Carries content: /m;
const CONFIGURATION_SCOPES = new Set(['dna', 'directive', 'workflow']);
const DECLARED_VERBS = new Set(['add', 'submit', 'approve', 'reject', 'deprecate', 'start', 'finalize', 'sync', 'amend', 'park', 'assign']);

function frontmatterField(text: string | null | undefined, field: string): string | null {
  if (text === null || text === undefined) return null;
  const block = FRONTMATTER_RE.exec(text)?.[1];
  if (block === undefined) return null;
  const match = new RegExp(`^${field}:\\s*(.*)$`, 'm').exec(block);
  if (match === null) return null;
  return (match[1] as string).trim().replace(/^"(.*)"$/, '$1');
}

/** The full sha of the commit at `index` (40 hex digits; distinct prefixes). */
export function shaAt(index: number): string {
  return (index + 1).toString(16).padStart(4, '0').repeat(10);
}

/** A linear history, built commit by commit, and the readers over it. */
export class HistoryModel {
  private readonly commits: ModelCommit[] = [];
  private tip: string | null = null;
  private baseIndex = 0;

  /** Add a commit; returns it. */
  commit(spec: CommitSpec): HistoryCommit {
    const parents = spec.parents ?? (this.tip === null ? [] : [this.tip]);
    const parentTree = parents.length === 0 ? {} : this.treeOf(parents[0] as string);
    const tree: Record<string, string> = { ...parentTree };
    for (const [from, to] of Object.entries(spec.renames ?? {})) {
      const text = tree[from];
      if (text === undefined) throw new Error(`fixture bug: rename of absent ${from}`);
      delete tree[from];
      tree[to] = text;
    }
    for (const [path, text] of Object.entries(spec.files ?? {})) {
      if (text === null) delete tree[path];
      else tree[path] = text;
    }
    const author = spec.author ?? DEVELOPER;
    const commit: HistoryCommit = {
      sha: shaAt(this.commits.length),
      parents: [...parents],
      authorName: author.name,
      authorEmail: author.email,
      subject: spec.subject,
      body: (spec.body ?? '').replace(/\s+$/, ''),
    };
    this.commits.push({ commit, tree, renames: { ...(spec.renames ?? {}) } });
    if (spec.detached !== true) this.tip = commit.sha;
    return commit;
  }

  /** Every commit added from now on is in the range; the ones before are reachable from it and outside it. */
  markBase(): string {
    this.baseIndex = this.commits.length;
    return this.tip as string;
  }

  /** The reader over the model, `HEAD` at the tip. */
  reader(options: ReaderOptions = {}): HistoryReader {
    const head = this.tip as string;
    const model = (sha: string): ModelCommit => {
      const found = this.commits.find((entry) => entry.commit.sha === sha);
      if (found === undefined) throw new Error(`in-memory reader: unexpected call, no commit ${sha}`);
      return found;
    };
    const resolve = (rev: string): string | null => {
      const parent = /^(.+?)(?:\^1?|~1?)$/.exec(rev);
      if (parent !== null) {
        const child = resolve(parent[1] as string);
        if (child === null) return null;
        return model(child).commit.parents[0] ?? null;
      }
      if (rev === 'HEAD') return head;
      return this.commits.some((entry) => entry.commit.sha === rev) ? rev : null;
    };
    const blob = (rev: string, path: string): string | null => {
      const sha = resolve(rev);
      if (sha === null) return null;
      return model(sha).tree[path] ?? null;
    };
    const parentTree = (sha: string): Readonly<Record<string, string>> => {
      const first = model(sha).commit.parents[0];
      return first === undefined ? {} : model(first).tree;
    };
    const isMerge = (sha: string): boolean => model(sha).commit.parents.length > 1;
    const changedPaths = (sha: string): string[] => {
      const before = parentTree(sha);
      const after = model(sha).tree;
      return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path]).sort();
    };
    const configAt = <T>(rev: string | null, path: string, schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: readonly { message: string }[] } } }) => {
      if (rev === null) return null;
      const text = blob(rev, path);
      if (text === null) return null;
      let parsed: unknown;
      try {
        parsed = parseYaml(text, path);
      } catch (error) {
        return { ok: false as const, error: (error as Error).message };
      }
      const result = schema.safeParse(parsed);
      return result.success ? { ok: true as const, value: result.data } : { ok: false as const, error: result.error.issues[0]?.message ?? 'invalid' };
    };
    const range = this.commits.slice(this.baseIndex).map((entry) => entry.commit);
    const all = this.commits;
    return {
      head,
      commits: () => range,
      touchedPaths: (sha: string) => (isMerge(sha) ? [] : changedPaths(sha)),
      fileChanges: (sha: string) => {
        if (isMerge(sha)) return [];
        const renames = model(sha).renames;
        const renamed = new Set([...Object.keys(renames), ...Object.values(renames)]);
        const before = parentTree(sha);
        const after = model(sha).tree;
        const changes = changedPaths(sha)
          .filter((path) => !renamed.has(path))
          .map((path) => ({ from: path in before ? path : null, to: path in after ? path : null }));
        for (const [from, to] of Object.entries(renames)) changes.push({ from, to });
        return changes.sort((a, b) => ((a.to ?? a.from ?? '') < (b.to ?? b.from ?? '') ? -1 : 1));
      },
      pathAtHead: (path: string) => {
        let current = path;
        for (const entry of all) current = entry.renames[current] ?? current;
        return current;
      },
      existsAtHead: (path: string) => model(head).tree[path] !== undefined,
      blob,
      memoryYamlAt: (rev: string | null) => configAt(rev, '.wingfoil/memory.yaml', MemoryYaml as never),
      dnaYamlAt: (rev: string | null) => configAt(rev, '.wingfoil/dna.yaml', DnaYaml as never),
      transitionFindings: (path: string) => {
        const canned = options.transitionFindings?.[path];
        if (canned !== undefined) return canned;
        if (path.endsWith('.md')) return [];
        throw new Error(`in-memory reader: unexpected call, transitionFindings(${path})`);
      },
      transitions: (path: string) =>
        all
          .filter((entry) => entry.commit.parents.length <= 1 && changedPaths(entry.commit.sha).includes(path))
          .map((entry) => {
            const scope = /^wf\(([^)]*)\):\s*(\S+)/.exec(entry.commit.subject);
            const verb = scope !== null && !CONFIGURATION_SCOPES.has(scope[1] as string) && DECLARED_VERBS.has(scope[2] as string) ? (scope[2] as string) : null;
            const reason = /^Reason:\s*(.*)$/m.exec(entry.commit.body)?.[1] ?? null;
            return {
              sha: entry.commit.sha,
              subject: entry.commit.subject,
              operation: verb,
              fromState: frontmatterField(parentTree(entry.commit.sha)[path], 'status'),
              toState: frontmatterField(entry.tree[path], 'status'),
              reason,
              approval: null,
            };
          }) as unknown as ReturnType<HistoryReader['transitions']>,
      isRejectCommit: (token: string) => {
        if (!/^[0-9a-f]{7,40}$/.test(token)) return false;
        return all.some((entry) => entry.commit.sha.startsWith(token) && /^wf\([^)]+\): reject /.test(entry.commit.subject));
      },
      headDocumentStatus: (id: string) => {
        const tree = model(head).tree;
        for (const path of Object.keys(tree).sort()) {
          if (!path.endsWith('.md')) continue;
          if (frontmatterField(tree[path], 'id') === id) return frontmatterField(tree[path], 'status');
        }
        return undefined;
      },
      carriesLineBefore: (sha: string) => {
        const seen = new Set<string>();
        const pending = [...model(sha).commit.parents];
        while (pending.length > 0) {
          const next = pending.pop() as string;
          if (seen.has(next)) continue;
          seen.add(next);
          const ancestor = model(next).commit;
          if (CARRIES_LINE_RE.test(ancestor.body)) return true;
          pending.push(...ancestor.parents);
        }
        return false;
      },
    };
  }

  private treeOf(sha: string): Readonly<Record<string, string>> {
    const found = this.commits.find((entry) => entry.commit.sha === sha);
    if (found === undefined) throw new Error(`fixture bug: no commit ${sha}`);
    return found.tree;
  }
}

/**
 * The governed base of the unit cases: `chore: configure wingfoil` (the two configuration files), `wf(task): add t-1`
 * (`draft`), `wf(task): submit t-1` (`pending`), all by the developer; the base is marked after them.
 */
export function governedModel(options: { readonly dna?: string; readonly memoryYaml?: string } = {}): HistoryModel {
  const model = new HistoryModel();
  model.commit({ subject: 'chore: configure wingfoil', files: { '.wingfoil/memory.yaml': options.memoryYaml ?? MEMORY_YAML, '.wingfoil/dna.yaml': options.dna ?? DNA } });
  model.commit({ subject: 'wf(task): add t-1', files: { [TASK('t-1')]: taskDoc('draft') } });
  model.commit({ subject: 'wf(task): submit t-1', files: { [TASK('t-1')]: taskDoc('pending') } });
  model.markBase();
  return model;
}
