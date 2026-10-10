/**
 * Name resolvability — the engine of `test/docs/name-resolvability.test.ts`
 * (`task-151-check-backticked-name-specs-adrs-requirements-resolves-head`, `dl-116` Q1 (B)).
 *
 * A document names something the code or the configuration defines by putting it between backticks.
 * This module reads those inline code spans, keeps the ones whose shape says which kind of name they
 * are, and looks each one up in an index built from the repository's tracked files. What it cannot
 * find is a finding. Five classes are checked, in this order (the first that matches wins):
 *
 * - `command` — a span that starts with `wingfoil `: its words must be a command the CLI ships, and
 *   each `--flag` in it an option of that command or of the program.
 * - `element` — a Memory element id (`task-`, `bug-`, `dl-`, `adr-`, `spec-`, `svc-` + three digits,
 *   with or without the slug; a release or release-line id; a plan id ending `-plan`) or a SARD
 *   requirement id (`REQ-SYS-03`): the element's file, or the requirement's heading, must exist.
 * - `path` — a repository path whose first segment is a tracked top-level directory, or a bare file
 *   name with a known extension: the file (or directory) must be tracked.
 * - `symbol` — a code identifier: camelCase, PascalCase with two humps or more, UPPER_SNAKE, or a
 *   dotted chain with one of those in it, optionally called (`()`): every segment must occur as a
 *   word in the tracked `src/`, `scripts/` or `.github/` sources, or the whole chain must be a
 *   configuration key path (below).
 * - `config` — a lowercase dotted key path (`template.frontmatter.required`, `bug.sync_state`): it
 *   must be a chain of keys in a tracked configuration file (`.wingfoil/` and `.github/` YAML,
 *   `package.json`; a list item's `name` counts as a key, so `dev-loop.review` is one), a Memory
 *   type's template field (`task.release`), or occur verbatim in a `.wingfoil/` YAML file or in
 *   `src/` (an action name such as `memory.add`).
 *
 * The lookups are heuristics, chosen to be cheap and to err towards resolving: a `symbol` resolves
 * when its words occur anywhere in the code, comments and string literals included, so a name kept
 * only in a comment still resolves; a `config` name resolves when it occurs verbatim in a source.
 * "The repository" is the working-tree content of the files git tracks (`git ls-files`): an untracked
 * file never makes a name resolve, an uncommitted edit to a tracked file does.
 *
 * Spans with placeholders (`{id}`, `<type>`, `*`, `…`) are patterns, not names, and are skipped, as are
 * fenced code blocks. Everything is deterministic: inputs are read in sorted order and findings come
 * back sorted by document, class and name, with duplicates removed — a finding is keyed by name, never
 * by line offset (`dl-075`), so it does not move when the text above it does.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, posix } from 'node:path';

import { load } from 'js-yaml';

/** The kinds of name the check recognizes, in classification order. */
export type NameClass = 'command' | 'element' | 'path' | 'symbol' | 'config';

/** One backticked name a document uses that the index cannot resolve. */
export interface Finding {
  /** Repository-relative path of the document. */
  document: string;
  nameClass: NameClass;
  /** The name as the document writes it, trimmed. */
  name: string;
}

/** A document to scan: its repository-relative path and its Markdown text. */
export interface Document {
  path: string;
  text: string;
}

/** What names resolve against — every field derived from the repository's tracked files. */
export interface NameIndex {
  /** Every tracked file, repository-relative. */
  files: ReadonlySet<string>;
  /** Every directory that contains a tracked file, repository-relative, without trailing slash. */
  dirs: ReadonlySet<string>;
  /** The base name of every tracked file. */
  basenames: ReadonlySet<string>;
  /** Base names (no `.md`) of every Memory element and plan file. */
  elementFiles: readonly string[];
  /** Every `REQ-*` id a SARD heading defines. */
  requirementIds: ReadonlySet<string>;
  /** Every identifier-shaped word in the tracked code. */
  codeWords: ReadonlySet<string>;
  /** Every lowercase dotted word in the tracked configuration files and `src/` sources. */
  dottedWords: ReadonlySet<string>;
  /** Every contiguous chain of keys in the tracked configuration files, plus `<type>.<field>` per Memory template. */
  configKeyPaths: ReadonlySet<string>;
  /** Shipped command path (`memory add`, `init`, and each noun alone) → its option flags. */
  commands: ReadonlyMap<string, ReadonlySet<string>>;
  /** Option flags the program itself declares (`--format`, `--help`, …). */
  globalFlags: ReadonlySet<string>;
}

const ELEMENT_ID = /^(?:(?:task|bug|dl|adr|spec|svc|cp)-\d{3}(?:-[a-z0-9]+)*|(?:minor|patch|major)-v\d+(?:\.\d+)*|rl-v\d+|[a-z0-9]+(?:-[a-z0-9.]+)*-plan)$/;
const SHORT_ELEMENT_ID = /^(?:task|bug|dl|adr|spec|svc|cp)-\d{3}$/;
const REQUIREMENT_ID = /^REQ-[A-Z]+-\d+$/;
const FILE_NAME = /^[\w.-]+\.(?:ts|cjs|mjs|js|json|ya?ml|md|feature)$/;
/** A technology written the way its project spells it (`Node.js`, `Commander.js`), not a file. */
const TECHNOLOGY_NAME = /^[A-Z][A-Za-z]*\.js$/;
const PATH = /^\.?[\w@-][\w.@-]*(?:\/[\w.@-]+)*\/?$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const SYMBOL_SEGMENT = /^(?:[a-z_$][a-z0-9_$]*[A-Z][\w$]*|[A-Z][a-z0-9]+[A-Z][\w$]*|[A-Z][A-Z0-9]*_[A-Z0-9_]+)$/;
const CONFIG_PATH = /^[a-z_][a-z0-9_-]*(?:\.[a-z_][a-z0-9_-]*)+$/;
const NOT_CONFIG_SUFFIX = /\.(?:com|org|io|dev|net|sh|txt|lock)$/;
const PLACEHOLDER = /[{}<>*…|]/;

/**
 * The inline code spans of a Markdown text, fenced code blocks excluded. Following CommonMark, a span
 * opens with a run of backticks and closes at the next run of the same length within the same
 * paragraph (it may wrap onto the next line, never across a blank line), so a stray backtick hides
 * nothing beyond its paragraph; and a fence that is never closed runs to the end of the document.
 * Each span's content is trimmed, inner whitespace runs collapsed to one space.
 */
export function inlineCodeSpans(markdown: string): string[] {
  const paragraphs: string[] = [];
  let paragraph: string[] = [];
  let fence: { char: string; length: number } | undefined;
  const flush = (): void => {
    if (paragraph.length > 0) paragraphs.push(paragraph.join('\n'));
    paragraph = [];
  };
  for (const line of markdown.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence.char && marker.length >= fence.length && /^ {0,3}[`~]+\s*$/.test(line)) {
        fence = undefined;
      }
      continue;
    }
    if (marker !== undefined) {
      flush();
      fence = { char: marker[0] ?? '`', length: marker.length };
    } else if (line.trim() === '') {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return paragraphs.flatMap(paragraphSpans);
}

/** The inline code spans of one paragraph (no blank line inside). */
function paragraphSpans(text: string): string[] {
  const spans: string[] = [];
  const opener = /`+/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(text)) !== null) {
    const run = match[0];
    const start = match.index + run.length;
    const closer = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
    closer.lastIndex = start;
    const end = closer.exec(text);
    if (end === null) continue;
    spans.push(text.slice(start, end.index).replace(/\s+/g, ' ').trim());
    opener.lastIndex = end.index + run.length;
  }
  return spans;
}

/** The class of a backticked name, or `undefined` when its shape is none of the five. */
export function classifyName(name: string, topLevelDirs: ReadonlySet<string>): NameClass | undefined {
  if (/^wingfoil(?: |$)/.test(name)) return 'command';
  if (PLACEHOLDER.test(name) || /\s/.test(name)) return undefined;
  if (ELEMENT_ID.test(name) || REQUIREMENT_ID.test(name)) return 'element';
  const bare = name.replace(/:\d+(?:-\d+)?$/, '');
  if (bare.includes('/') && PATH.test(bare) && topLevelDirs.has(bare.split('/')[0] ?? '')) return 'path';
  if (!bare.includes('/') && FILE_NAME.test(bare) && !TECHNOLOGY_NAME.test(bare)) return 'path';
  const chain = name.replace(/\(\)$/, '').split('.');
  if (chain.every((segment) => IDENTIFIER.test(segment)) && chain.some((segment) => SYMBOL_SEGMENT.test(segment))) {
    return 'symbol';
  }
  if (CONFIG_PATH.test(name) && !NOT_CONFIG_SUFFIX.test(name)) return 'config';
  return undefined;
}

/** Whether `name`, already classified as `nameClass`, resolves against `index`. */
export function resolves(name: string, nameClass: NameClass, index: NameIndex): boolean {
  switch (nameClass) {
    case 'command':
      return resolvesCommand(name, index);
    case 'element':
      if (REQUIREMENT_ID.test(name)) return index.requirementIds.has(name);
      if (SHORT_ELEMENT_ID.test(name)) return index.elementFiles.some((file) => file === name || file.startsWith(`${name}-`));
      return index.elementFiles.includes(name);
    case 'path': {
      const bare = name.replace(/:\d+(?:-\d+)?$/, '').replace(/\/$/, '');
      if (!bare.includes('/')) return index.basenames.has(bare) || index.dirs.has(bare);
      return index.files.has(bare) || index.dirs.has(bare);
    }
    case 'symbol': {
      // A camelCase key of a configuration file (`mcpName` in `package.json`) is a name too.
      const chain = name.replace(/\(\)$/, '');
      return index.configKeyPaths.has(chain) || chain.split('.').every((segment) => index.codeWords.has(segment));
    }
    case 'config':
      return index.configKeyPaths.has(name) || index.dottedWords.has(name);
  }
}

function resolvesCommand(name: string, index: NameIndex): boolean {
  const words = name.split(' ').slice(1);
  const positional = words.filter((word) => /^[a-z][a-z-]*$/.test(word));
  // The command path is the longest prefix of leading lowercase words the CLI ships.
  let path = '';
  for (const word of words) {
    if (!/^[a-z][a-z-]*$/.test(word)) break;
    const next = path === '' ? word : `${path} ${word}`;
    if (!index.commands.has(next)) break;
    path = next;
  }
  if (path === '' && positional.length > 0) return false;
  if (path !== '' && path.split(' ').length === 1 && words.length > 1) {
    // A noun followed by a word that is not one of its verbs names a command that does not ship.
    const second = words[1] ?? '';
    const nounHasVerbs = [...index.commands.keys()].some((key) => key.startsWith(`${path} `));
    if (nounHasVerbs && /^[a-z][a-z-]*$/.test(second)) return false;
  }
  const flags = index.commands.get(path) ?? new Set<string>();
  return words
    .filter((word) => /^--[a-z][a-z-]*/.test(word))
    .map((word) => word.replace(/=.*$/, ''))
    .every((flag) => flags.has(flag) || index.globalFlags.has(flag));
}

/** Every finding in `documents` against `index`, sorted by document, class and name, deduplicated. */
export function findUnresolvedNames(documents: readonly Document[], index: NameIndex): Finding[] {
  const topLevelDirs = new Set([...index.dirs].map((dir) => dir.split('/')[0] ?? '').filter((dir) => dir !== ''));
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const document of documents) {
    for (const name of inlineCodeSpans(document.text)) {
      const nameClass = classifyName(name, topLevelDirs);
      if (nameClass === undefined || resolves(name, nameClass, index)) continue;
      const key = findingKey({ document: document.path, nameClass, name });
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ document: document.path, nameClass, name });
    }
  }
  return findings.sort(compareFindings);
}

/** A finding's identity, `document|class|name` — the key the baseline and the allowlist use. */
export function findingKey(finding: Finding): string {
  return `${finding.document}|${finding.nameClass}|${finding.name}`;
}

/** Total order on findings: document, then class, then name (code-unit order, locale-independent). */
export function compareFindings(a: Finding, b: Finding): number {
  const left = findingKey(a);
  const right = findingKey(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** A finding that is unresolved on purpose, or not fixed yet, with the reason why. */
export interface AllowlistEntry extends Finding {
  /** Why the name does not resolve: never empty. */
  reason: string;
  /**
   * For a `planned` entry only: the short ids (`task-217`) of the tasks that name it and were not
   * `done` when the entry was written. Once every one is `done`, the plan is spent (see {@link planProblems}).
   */
  plannedBy?: readonly string[];
}

/** Findings split by an allowlist, each list in the order it came in. */
export interface AllowlistResult {
  /** Findings no entry lists — what the gate fails on. */
  unlisted: Finding[];
  /** Entries that match a finding. */
  listed: AllowlistEntry[];
  /** Entries that match no finding: the name was fixed, or now resolves. */
  stale: AllowlistEntry[];
}

/** Split `findings` by `allowlist`, matching on {@link findingKey}. */
export function applyAllowlist(findings: readonly Finding[], allowlist: readonly AllowlistEntry[]): AllowlistResult {
  const found = new Set(findings.map(findingKey));
  const allowed = new Set(allowlist.map(findingKey));
  return {
    unlisted: findings.filter((finding) => !allowed.has(findingKey(finding))),
    listed: allowlist.filter((entry) => found.has(findingKey(entry))),
    stale: allowlist.filter((entry) => !found.has(findingKey(entry))),
  };
}

/** What is wrong with the `planned` entries of an allowlist, against the tasks' current statuses. */
export interface PlanProblems {
  /** Entries whose cited tasks are all `done` — the name was planned and did not arrive. */
  exhausted: AllowlistEntry[];
  /** `document|class|name: task-id` for every cited task that does not exist. */
  unknownTasks: string[];
}

/** Check each entry's `plannedBy` against `statuses` (short task id → status), in entry order. */
export function planProblems(entries: readonly AllowlistEntry[], statuses: ReadonlyMap<string, string>): PlanProblems {
  const exhausted: AllowlistEntry[] = [];
  const unknownTasks: string[] = [];
  for (const entry of entries) {
    const cited = entry.plannedBy ?? [];
    if (cited.length === 0) continue;
    for (const task of cited) if (!statuses.has(task)) unknownTasks.push(`${findingKey(entry)}: ${task}`);
    if (cited.every((task) => statuses.get(task) === 'done')) exhausted.push(entry);
  }
  return { exhausted, unknownTasks };
}

/** Short task id (`task-151`) → frontmatter `status`, for every tracked task file under `docs/04_memory/`, sorted by id. */
export function taskStatuses(repoRoot: string): Map<string, string> {
  const entries: [string, string][] = [];
  for (const file of trackedFiles(repoRoot)) {
    const id = /^docs\/04_memory\/.*\/(task-\d{3})-[^/]*\.md$/.exec(file)?.[1];
    if (id === undefined) continue;
    const status = /^status:\s*"?([a-z-]+)"?\s*$/m.exec(readFileSync(join(repoRoot, file), 'utf8'))?.[1];
    if (status !== undefined) entries.push([id, status]);
  }
  return new Map(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Every repository file git tracks, sorted. */
export function trackedFiles(repoRoot: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((file) => file !== '')
    .sort();
}

/** The `name` a YAML mapping carries (a workflow, a phase, a step), when it is a plain lowercase word. */
function declaredName(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const name = (value as Record<string, unknown>)['name'];
  return typeof name === 'string' && /^[a-z][a-z0-9_-]*$/.test(name) ? name : undefined;
}

/**
 * Every contiguous chain of mapping keys in a parsed YAML or JSON value, dot-joined, added to `out`.
 * A sequence is transparent, except that an item carrying a `name` contributes that name as a
 * segment, both after the sequence's key and in its place — which is how prose names a phase:
 * `dev-loop.review`, `refactor.checks.post`.
 */
function keyChains(value: unknown, prefix: readonly string[], out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = declaredName(item);
      if (name === undefined) {
        keyChains(item, prefix, out);
      } else {
        keyChains(item, [...prefix, name], out);
        keyChains(item, [...prefix.slice(0, -1), name], out);
      }
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (let start = 0; start < prefix.length; start++) out.add(prefix.slice(start).join('.'));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const chain = [...prefix, key];
    for (let start = 0; start < chain.length; start++) out.add(chain.slice(start).join('.'));
    keyChains(child, chain, out);
  }
}

/**
 * Build the index from the repository's tracked files. `commands` and `globalFlags` come from the
 * caller, which derives them from the Commander program the CLI builds; everything else is read here.
 */
export function buildNameIndex(
  repoRoot: string,
  commands: ReadonlyMap<string, ReadonlySet<string>>,
  globalFlags: ReadonlySet<string>,
): NameIndex {
  const files = trackedFiles(repoRoot);
  const dirs = new Set<string>();
  for (const file of files) {
    let dir = posix.dirname(file);
    while (dir !== '.' && !dirs.has(dir)) {
      dirs.add(dir);
      dir = posix.dirname(dir);
    }
  }
  const elementFiles = files
    .filter((file) => /^docs\/(?:04_memory|05_plans)\/.*\.md$/.test(file))
    .map((file) => basename(file, '.md'));
  const requirementIds = new Set<string>();
  for (const file of files.filter((f) => f.startsWith('docs/02_requirements/03_sard/') && f.endsWith('.md'))) {
    for (const [, id] of readFileSync(join(repoRoot, file), 'utf8').matchAll(/^#+ +(REQ-[A-Z]+-\d+)\b/gm)) {
      if (id) requirementIds.add(id);
    }
  }
  const codeWords = new Set<string>();
  const dottedWords = new Set<string>();
  const configKeyPaths = new Set<string>();
  for (const file of files) {
    const isCode = /^(?:src\/.*\.ts|scripts\/.*\.(?:cjs|mjs|js)|\.github\/.*\.ya?ml)$/.test(file);
    const isConfig = /^(?:\.wingfoil\/.*\.ya?ml|\.github\/.*\.ya?ml|package\.json)$/.test(file);
    const template = /^\.wingfoil\/memory\/templates\/([a-z-]+)\.md$/.exec(file)?.[1];
    if (template !== undefined) {
      // A Memory type's fields are its template's frontmatter keys, named in prose as `task.release`.
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(repoRoot, file), 'utf8'))?.[1] ?? '';
      for (const [, key] of frontmatter.matchAll(/^([a-z_][a-z0-9_-]*):/gm)) configKeyPaths.add(`${template}.${key}`);
    }
    if (!isCode && !isConfig) continue;
    const text = readFileSync(join(repoRoot, file), 'utf8');
    if (isCode) for (const [word] of text.matchAll(/[A-Za-z_$][\w$]*/g)) codeWords.add(word);
    if (isConfig || file.startsWith('src/')) {
      for (const [word] of text.matchAll(/[a-z_][a-z0-9_-]*(?:\.[a-z_][a-z0-9_-]*)+/g)) dottedWords.add(word);
    }
    if (isConfig) {
      try {
        const parsed: unknown = file.endsWith('.json') ? JSON.parse(text) : load(text);
        const name = declaredName(parsed);
        keyChains(parsed, name === undefined ? [] : [name], configKeyPaths);
      } catch {
        // A malformed YAML file is the validation suites' finding, not this one's.
      }
    }
  }
  return {
    files: new Set(files),
    dirs,
    basenames: new Set(files.map((file) => posix.basename(file))),
    elementFiles,
    requirementIds,
    codeWords,
    dottedWords,
    configKeyPaths,
    commands,
    globalFlags,
  };
}
