/**
 * The load-order probe of `test/core/load-order.test.ts` (task-354 AC1, `bug-470`, `bug-317`), run in a child
 * `node` so that the modules load through Node's own CommonJS loader, not jest's module registry.
 *
 * Usage: `node load-order-probe.cjs <dist-dir>`. It never builds: `<dist-dir>` is the `dist/` jest's global
 * setup built. It prints one JSON object on stdout:
 *
 * - `checked`: the modules tried as the first module, as paths relative to `<dist-dir>`, in byte order —
 *   every `*.js` under `<dist-dir>` except `cli.js`, the `bin` entry, which runs the CLI when required
 *   (task-354 D6);
 * - `baselineMissingFn`: the `CORE_MODULES` operations whose `fn` is not a function when the barrel
 *   `core/index.js` loads first (expected empty: the control of the comparison);
 * - `problems`: for each first module that changes anything, `{ missingFn, shapeDiffs }` — `missingFn` the
 *   `CORE_MODULES` operations, as `<module>.<operation>`, whose `fn` is not a function once that module loaded
 *   first, then the barrel, then every module; `shapeDiffs` each `<module> <export>` whose shape differs from
 *   the barrel-first run's. A first module that loads every export as the barrel-first run does is absent.
 *
 * The shape of a value is its `typeof`, and for a plain object or an array the shapes of its own keys,
 * recursively, to depth 4 — so a `CORE_MODULES` operation whose `fn` is `undefined` differs from one whose `fn`
 * is a function. Deterministic: the files are listed and tried in byte order, and the `require.cache` entries
 * under `<dist-dir>` are cleared before each try; no clock, no randomness.
 */
'use strict';

const { readdirSync } = require('node:fs');
const { join, relative, resolve, sep } = require('node:path');

const DIST = resolve(process.argv[2] ?? '');
const BARREL = 'core/index.js';
const MAX_DEPTH = 4;

const byteOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Every `*.js` under `dir`, relative to {@link DIST} with `/` separators, in byte order. */
function jsFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...jsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) found.push(relative(DIST, full).split(sep).join('/'));
  }
  return found.sort(byteOrder);
}

function isPlain(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** The shape of `value` (see the module comment), as a JSON-comparable value. */
function shapeOf(value, depth) {
  const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (depth >= MAX_DEPTH || !(Array.isArray(value) || isPlain(value))) return kind;
  const keys = Object.keys(value).sort(byteOrder);
  return { kind, keys: Object.fromEntries(keys.map((key) => [key, shapeOf(value[key], depth + 1)])) };
}

function clearDistCache() {
  for (const key of Object.keys(require.cache)) {
    if (key === DIST || key.startsWith(`${DIST}${sep}`)) delete require.cache[key];
  }
}

/** Load `first`, then the barrel, then every module; the export shapes and the operations missing `fn`. */
function loadAll(first, modules) {
  clearDistCache();
  const exportsOf = new Map();
  const load = (module) => {
    if (exportsOf.has(module)) return;
    try {
      exportsOf.set(module, require(join(DIST, module)));
    } catch (error) {
      exportsOf.set(module, { __threw: String(error && error.message) });
    }
  };
  if (first !== null) load(first);
  load(BARREL);
  for (const module of modules) load(module);
  const shapes = new Map();
  for (const module of modules) {
    const value = exportsOf.get(module);
    const keys = Object.keys(value).sort(byteOrder);
    shapes.set(module, new Map(keys.map((key) => [key, JSON.stringify(shapeOf(value[key], 0))])));
  }
  const missingFn = [];
  const coreModules = exportsOf.get(BARREL).CORE_MODULES;
  for (const coreModule of Array.isArray(coreModules) ? coreModules : []) {
    const operations = coreModule && coreModule.operations ? coreModule.operations : {};
    for (const name of Object.keys(operations).sort(byteOrder)) {
      if (typeof operations[name].fn !== 'function') missingFn.push(`${coreModule.name}.${name}`);
    }
  }
  return { shapes, missingFn };
}

function shapeDiffs(baseline, shapes, modules) {
  const diffs = [];
  for (const module of modules) {
    const want = baseline.get(module);
    const got = shapes.get(module);
    const keys = [...new Set([...want.keys(), ...got.keys()])].sort(byteOrder);
    for (const key of keys) if (want.get(key) !== got.get(key)) diffs.push(`${module} ${key}`);
  }
  return diffs;
}

const modules = jsFiles(DIST).filter((module) => module !== 'cli.js');
const baseline = loadAll(null, modules);
const problems = {};
for (const first of modules) {
  const run = loadAll(first, modules);
  const diffs = shapeDiffs(baseline.shapes, run.shapes, modules);
  if (run.missingFn.length > 0 || diffs.length > 0) problems[first] = { missingFn: run.missingFn, shapeDiffs: diffs };
}
process.stdout.write(`${JSON.stringify({ checked: modules, baselineMissingFn: baseline.missingFn, problems })}\n`);
