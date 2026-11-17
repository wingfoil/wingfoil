/**
 * Import-graph gate — task-354 AC2 (`bug-345` Expected; the `architecture` directive; `spec-006` §1): no
 * runtime import cycle in `src/`, and no surface module importing past `src/core` except where a Memory
 * element records the deviation.
 *
 * The graph is read from the TypeScript AST (the `typescript` devDependency, task-354 D7), over every
 * `src/**\/*.ts` of the working tree in byte order, with release-health Q07's import rules
 * (`scripts/release-health/measure.cjs`, `importsOf`): import and export declarations, `import x = require()`,
 * `require()`, `import()` and `import('x').T`; an import is type-only when its clause is `import type` (or
 * `export type`) or every named binding is `type`, and `import('x').T` is type-only.
 *
 * What is asserted:
 * 1. **Cycles.** The runtime graph — the relative imports that are not type-only, resolved to a file of the set —
 *    has no strongly connected component with a cycle (Tarjan over sorted nodes and sorted edges; a component
 *    is listed as its sorted files joined by a space). File-level, not directory-level (task-354 D8).
 * 2. **Bypasses.** No import, type-only included, from `src/cli.ts`, `src/cli/**` or `src/mcp/**` reaches
 *    `src/storage`, `src/memory`, `src/dna`, `src/directives` or `src/workflow`, except an entry of
 *    {@link RECORDED_DEVIATIONS} — an explicit list whose every entry names an existing `docs/04_memory`
 *    document (task-354 D1 (a)). The list is empty. Each bypass is listed as `<file> imports <spec> (<module>)`.
 * 3. **The analysis can say red.** The same functions, run over planted in-memory sources, find a planted
 *    runtime cycle and a planted bypass (type-only included), and ignore a type-only cycle.
 *
 * Deterministic: a sorted walk of a fixed source tree, a pure AST walk, sorted nodes and edges; no clock, no
 * subprocess.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import * as ts from 'typescript';

const REPO_ROOT = join(__dirname, '..', '..');

/** The surface modules (`spec-006` §1): the CLI and the MCP server. */
const isSurface = (file: string): boolean => file === 'src/cli.ts' || file.startsWith('src/cli/') || file.startsWith('src/mcp/');

/** The modules a surface reaches only through `src/core`. */
const UNDERNEATH_CORE: readonly string[] = ['src/storage', 'src/memory', 'src/dna', 'src/directives', 'src/workflow'];

/** A surface import past `src/core` that a Memory element records as a deviation (task-354 D1 (a)). */
interface RecordedDeviation {
  /** The importing file, repository-relative (`src/mcp/prompt.ts`). */
  readonly file: string;
  /** The module it reaches, one of {@link UNDERNEATH_CORE}. */
  readonly module: string;
  /** The id of the `docs/04_memory` document that records it. */
  readonly element: string;
}

/** The recorded deviations: none (task-354 D1 (a), D3 (a)). */
const RECORDED_DEVIATIONS: readonly RecordedDeviation[] = [];

interface ImportRef {
  readonly spec: string;
  readonly typeOnly: boolean;
}

const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every module `text` (the source of `file`) imports, by Q07's rules (see the module comment). */
function importsOf(file: string, text: string): ImportRef[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: ImportRef[] = [];
  const allTypes = (elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>): boolean =>
    elements.length > 0 && elements.every((element) => element.isTypeOnly);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (!clause.name && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && allTypes(clause.namedBindings.elements)));
      out.push({ spec: node.moduleSpecifier.text, typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = node.isTypeOnly || (node.exportClause !== undefined && ts.isNamedExports(node.exportClause) && allTypes(node.exportClause.elements));
      out.push({ spec: node.moduleSpecifier.text, typeOnly });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      out.push({ spec: node.moduleReference.expression.text, typeOnly: node.isTypeOnly });
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0]!) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      out.push({ spec: (node.arguments[0] as ts.StringLiteralLike).text, typeOnly: false });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      out.push({ spec: node.argument.literal.text, typeOnly: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** A relative import's target: the file it resolves to among `files`, else the normalized path; `null` for a package. */
function resolveImport(from: string, spec: string, files: ReadonlySet<string>): string | null {
  if (!spec.startsWith('.')) return null;
  const target = posix.normalize(posix.join(posix.dirname(from), spec));
  const bare = target.replace(/\.[cm]?js$/, '');
  const candidates = [target, ...['.ts', '.tsx', '.cts', '.mts', '.js', '.cjs', '.mjs'].map((ext) => `${bare}${ext}`), `${bare}/index.ts`, `${bare}/index.js`];
  return candidates.find((candidate) => files.has(candidate)) ?? target;
}

interface ImportGraph {
  /** Each file's runtime import targets inside the set, sorted. */
  readonly runtime: ReadonlyMap<string, readonly string[]>;
  /** Every surface import past `src/core`, as `<file> imports <spec> (<module>)`, with its file and module. */
  readonly bypasses: readonly { readonly file: string; readonly spec: string; readonly module: string }[];
}

/** The runtime graph and the surface bypasses of `sources` (path → text), read in byte order of the path. */
function analyse(sources: ReadonlyMap<string, string>): ImportGraph {
  const files = new Set(sources.keys());
  const runtime = new Map<string, readonly string[]>();
  const bypasses: { file: string; spec: string; module: string }[] = [];
  for (const file of [...files].sort(byteOrder)) {
    const targets = new Set<string>();
    for (const { spec, typeOnly } of importsOf(file, sources.get(file)!)) {
      const target = resolveImport(file, spec, files);
      if (target === null) continue;
      if (!typeOnly && files.has(target)) targets.add(target);
      const module = isSurface(file) ? UNDERNEATH_CORE.find((dir) => target === dir || target.startsWith(`${dir}/`)) : undefined;
      if (module !== undefined) bypasses.push({ file, spec, module });
    }
    runtime.set(file, [...targets].sort(byteOrder));
  }
  return { runtime, bypasses };
}

/** The strongly connected components of `graph` with a cycle, each as its sorted files joined by a space, sorted. */
function cyclicComponents(graph: ReadonlyMap<string, readonly string[]>): string[] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;
  const connect = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component.sort(byteOrder));
    }
  };
  for (const v of [...graph.keys()].sort(byteOrder)) if (!index.has(v)) connect(v);
  return components
    .filter((component) => component.length > 1 || (graph.get(component[0]!) ?? []).includes(component[0]!))
    .map((component) => component.join(' '))
    .sort(byteOrder);
}

/** The bypasses no {@link RecordedDeviation} covers, as sorted unique `<file> imports <spec> (<module>)` lines. */
function unrecordedBypasses(graph: ImportGraph, recorded: readonly RecordedDeviation[]): string[] {
  const covered = (b: { file: string; module: string }): boolean => recorded.some((d) => d.file === b.file && d.module === b.module);
  const lines = graph.bypasses.filter((b) => !covered(b)).map((b) => `${b.file} imports ${b.spec} (${b.module})`);
  return [...new Set(lines)].sort(byteOrder);
}

/** Every `*.ts` under `src/` of the working tree, repository-relative with `/`, mapped to its text. */
function srcSources(): Map<string, string> {
  const walk = (dir: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...walk(full));
      else if (entry.isFile() && entry.name.endsWith('.ts')) found.push(relative(REPO_ROOT, full).split(sep).join('/'));
    }
    return found;
  };
  const files = walk(join(REPO_ROOT, 'src')).sort(byteOrder);
  return new Map(files.map((file) => [file, readFileSync(join(REPO_ROOT, file), 'utf-8')]));
}

/** Whether a `docs/04_memory` Markdown document is named `<element>.md` (the element's full id). */
function memoryDocumentExists(element: string): boolean {
  const walk = (dir: string): boolean =>
    readdirSync(dir, { withFileTypes: true }).some((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : entry.isFile() && entry.name === `${element}.md`,
    );
  const root = join(REPO_ROOT, 'docs', '04_memory');
  return existsSync(root) && walk(root);
}

describe('import-graph gate — task-354 AC2 (bug-345, spec-006 §1)', () => {
  let graph: ImportGraph;

  beforeAll(() => {
    graph = analyse(srcSources());
  });

  it('reads the source tree: the walk sees src/cli.ts and src/core/index.ts and their imports', () => {
    expect(graph.runtime.has('src/cli.ts')).toBe(true);
    expect(graph.runtime.get('src/core/index.ts')?.length ?? 0).toBeGreaterThan(0);
  });

  it('no runtime import cycle remains in src/ (file level, D8)', () => {
    expect(cyclicComponents(graph.runtime)).toEqual([]);
  });

  it('no surface module (src/cli.ts, src/cli/**, src/mcp/**) imports past src/core outside a recorded deviation', () => {
    expect(unrecordedBypasses(graph, RECORDED_DEVIATIONS)).toEqual([]);
  });

  it('every recorded deviation names an existing docs/04_memory document and a module underneath src/core, and none is recorded (D1 (a))', () => {
    for (const deviation of RECORDED_DEVIATIONS) {
      expect(UNDERNEATH_CORE).toContain(deviation.module);
      expect(memoryDocumentExists(deviation.element)).toBe(true);
    }
    expect(RECORDED_DEVIATIONS).toEqual([]);
  });

  describe('the analysis says red when it should (planted sources)', () => {
    const planted = new Map<string, string>([
      ['src/a.ts', "import { b } from './b';\nexport const a = b;\n"],
      ['src/b.ts', "import { a } from './a';\nexport const b = 1; export const c = () => a;\n"],
      ['src/t1.ts', "import type { T2 } from './t2';\nexport type T1 = T2;\n"],
      ['src/t2.ts', "import { type T1 } from './t1';\nexport type T2 = T1 | number;\n"],
      ['src/cli/x.ts', "import type { S } from '../storage';\nexport const x: S | null = null;\n"],
      ['src/mcp/y.ts', "const q = require('../memory/query');\nexport const y = q;\n"],
      ['src/mcp/z.ts', "import { core } from '../core';\nexport const z = core;\n"],
      ['src/storage/index.ts', 'export type S = string;\n'],
      ['src/memory/query.ts', 'export const query = 1;\n'],
      ['src/core/index.ts', 'export const core = 1;\n'],
    ]);

    it('finds a planted runtime cycle and ignores a type-only one', () => {
      expect(cyclicComponents(analyse(planted).runtime)).toEqual(['src/a.ts src/b.ts']);
    });

    it('finds a planted bypass, type-only and require() included, and passes an import of src/core', () => {
      expect(unrecordedBypasses(analyse(planted), [])).toEqual([
        'src/cli/x.ts imports ../storage (src/storage)',
        'src/mcp/y.ts imports ../memory/query (src/memory)',
      ]);
    });

    it('a recorded deviation covers its file and module only', () => {
      const recorded: RecordedDeviation[] = [{ file: 'src/cli/x.ts', module: 'src/storage', element: 'bug-345' }];
      expect(unrecordedBypasses(analyse(planted), recorded)).toEqual(['src/mcp/y.ts imports ../memory/query (src/memory)']);
    });
  });
});
