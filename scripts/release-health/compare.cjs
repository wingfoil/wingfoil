#!/usr/bin/env node
/**
 * `release-health.compare` (`dl-089` §3–§5; `.wingfoil/workflows/custom/release-health.yaml`): compare a release's
 * report `release-health-<version>.json` with the previous run's and write the human-readable report
 * `release-health-<version>.md` (`docs/08_health/report-layout.md`). Not shipped in the npm package (`package.json`
 * `files`). Written by task-241.
 *
 * **Inputs.** The report (`--report`, default `<paths.health>/release-health-<release>.json`), the previous report its
 * `previous.report` names, every earlier `release-health-v*.json` under `paths.health` (the trend), the catalogue
 * `<paths.health>/metrics.yaml`; both reports are validated against `release-health.schema.json` (ajv, draft 2020-12).
 *
 * **The verdict of each metric** (`dl-089` §3), the first rule that applies:
 *  1. a `retired` catalogue metric: no verdict, flagged `retired`;
 *  2. a current entry `not-comparable` (D01/P06 on a patch): `not-comparable`, its reason flagged;
 *  3. a current entry `not-measurable`: no verdict and no floor verdict, flagged with its reason;
 *  4. `kind: info`: `info`, never compared;
 *  5. a reading taken at run time (`RUN_TIME_READINGS`: G15, Q17, E01–E05; approver ruling I, until `dl-173` puts it
 *     in the catalogue): `not-comparable`, flagged `run-time reading` — its floor is still evaluated;
 *  6. `direction: pending`: `pending`;
 *  7. no previous value (no previous report, a window named by `--previous`, the previous entry absent or not
 *     measured): `new`;
 *  8. otherwise each part `COMPONENTS` declares is compared — `share` by its absolute difference in percentage
 *     points, `relative` by |Δ| / |previous| (a previous 0: any change moves it), `boolean` true is better — and
 *     moves only when the difference is strictly more than the tolerance (the catalogue's `defaults.tolerance`, a
 *     metric's own `tolerance` overriding it). A part `null` on either side is skipped (`partial: <part>`); every
 *     part skipped is `not-comparable`. Any part regressed → `regressed`; else any improved → `improved`; else
 *     `stable`. Floors get this verdict too (approver ruling H).
 * A floor is evaluated by `FLOORS` (`held` | `breached`). Flags also name `small-sample`, P01–P05's `unchecked` and
 * P03's `unresolved` counts (shown, not redefined: `dl-173` item 4), and a toolchain entry measured off the pinned Node.
 *
 * **Findings** (`dl-089` §4): every breached floor, and every regressed `kind: trend` metric outside small-sample.
 * **Immediate** (`dl-089` §5): the catalogue's `immediate_bug` metrics, Q01 and Q02 only at a published tag.
 *
 * **Like-for-like** (`dl-089` §3): a previous report measured with an older catalogue is re-measured at its point's
 * commit (immutable, never its ref, review F3) with
 * the current catalogue (`measureRelease`); the stored report is never rewritten. When that fails, or with
 * `--no-remeasure`, a metric redefined since is `not-comparable`, an added one `new`, the rest compared as stored.
 *
 * **Propose** (`dl-089` §4, approver rulings E, F): for each finding, `wingfoil memory search <id> --format json`
 * (the code build `dist/cli.js`, at the working tree: whether it is tracked now). The search is a substring match,
 * so a match — a `bug`, `task`, `decision-log` or `change-proposal` whose status is neither its type's last
 * `sequence` state nor `deprecated` — is only a **candidate** tracker, which the propose phase (facilitator)
 * confirms or replaces with a proposal (review F1). A finding with no candidate becomes `RH-<version>-NN`: `bug` for
 * a breached floor, `decision-log` for a regressed trend, targeting the next minor. Every immediate finding is
 * named on stderr, with its proposal or its candidates.
 *
 * **Settle** (`dl-089` §4, ruling G): the previous report's proposals (its `.md`) against the `## Release health`
 * table of `retro-<previous version>`: `element` → adopted (effective when the linked metric improved or its floor
 * went from breached to held, else no effect yet); `covered`, `restated`, `superseded` → superseded; `declined`, no
 * row or no retrospective → not adopted (the last two: no disposition recorded); any other outcome → not adopted,
 * noted `unrecognised outcome "<x>"` (review F2). When the previous release is `kind: patch` (its report's
 * `release.kind`), no retrospective is read — a patch runs none (`dl-092` Q2 (ii)) — and every proposal settles as
 * `pending`, noted `disposed of by the next minor's retrospective (dl-167 (a))` (`bug-443`). A metric's own
 * `tolerance` that is neither `<N>pp` nor `<N>%`, or is in a unit none of its parts uses, is refused, exit 2
 * (review F4).
 *
 * Deterministic (REQ-SYS-07): no clock, no randomness; every list in catalogue order or sorted. It runs no git itself.
 *
 * Usage: node scripts/release-health/compare.cjs --release <vX.Y[.Z]> [--report <json>] [--out <md>] [--root <dir>]
 *          [--no-remeasure] [--offline] [--no-toolchain] [--any-node] [--max-workers <n>]
 * The last four go to a re-measurement only. Exit: 0 the report is written (its path on stdout; one stderr line per
 * untracked immediate finding) · 2 the comparison could not run (message on stderr).
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { dirname, isAbsolute, join } = require('node:path');
const yaml = require('js-yaml');

const { catalogueLocation, validateCatalogue } = require('./catalogue.cjs');
const measure = require('./measure.cjs');

const DIST_CLI = join(__dirname, '..', '..', 'dist', 'cli.js');
const VERSION_RE = /^v[0-9]+\.[0-9]+(\.[0-9]+)?$/;
const PREFIX = 'release-health compare: ';
const EPSILON = 1e-9;

class UsageError extends Error {}

/** Readings taken when the script runs, not at the point (`dl-089` §1; the measure header; approver ruling I). */
const RUN_TIME_READINGS = Object.freeze(['G15', 'Q17', 'E01', 'E02', 'E03', 'E04', 'E05']);

/** Q01 and Q02 are immediate only at a published tag: a red tree that was published (`dl-089` §5). */
const AT_TAG_ONLY = Object.freeze(['Q01', 'Q02']);

/** The element types that can track a finding (`dl-089` §4). */
const TRACKING_TYPES = Object.freeze(['bug', 'change-proposal', 'decision-log', 'task']);

const part = (path, unit, direction) => Object.freeze({ path, unit, direction });
const share = (path, direction) => part(path, 'share', direction);
const rel = (path, direction) => part(path, 'relative', direction);
const bool = (path = '') => part(path, 'boolean', 'up');
const ALL_KEYS = '*';

/**
 * The compared parts of every metric that is neither `info` nor `pending` (floors included, ruling H): `[path, unit,
 * direction]`, `''` the value itself, `'*'` every key of an object value. Held equal to the catalogue by a test.
 */
const COMPONENTS = Object.freeze({
  G01: [share('', 'up')],
  G02: [share('', 'up')],
  G03: [rel('median', 'down'), rel('p90', 'down'), share('share_over_500', 'down')],
  G04: [rel('mean', 'down'), share('share_over_72', 'down')],
  G05: [share('', 'up')],
  G06: [share('', 'up')],
  G07: [rel('', 'down')],
  G08: [share('conforming_share', 'up'), rel('approve_reject_with_ai', 'down')],
  G09: [share('', 'down')],
  G10: [share('', 'up')],
  G14: [rel('', 'down')],
  G15: [rel('stale_branches', 'down'), rel('duplicate_ids', 'down')],
  Q01: [bool()],
  Q02: [rel('failing', 'down'), rel('disabled', 'down')],
  Q03: [share('statements', 'up'), share('branches', 'up'), share('functions', 'up'), share('lines', 'up')],
  Q04: [share(ALL_KEYS, 'up')],
  Q05: [rel('complex', 'down'), rel('long', 'down')],
  Q06: [share('sources', 'down'), share('tests', 'down')],
  Q07: [rel('cycles', 'down'), rel('bypasses', 'down')],
  Q08: [rel('unused_runtime_dependencies', 'down'), rel('install_size_bytes', 'down')],
  Q09: [rel('', 'down')],
  Q10: [share('', 'up')],
  Q11: [share('', 'up')],
  Q12: [rel('', 'down')],
  Q13: [share('closure_ratio', 'up'), rel('open_unassigned', 'down')],
  Q14: [rel('count', 'down'), rel('median_age_days', 'down')],
  Q15: [share('', 'down')],
  Q17: [bool()],
  Q18: [share('', 'down')],
  Q19: [share('fix_share', 'down')],
  Q20: [rel('', 'up')],
  D01: [share('', 'up')],
  P01: [rel('', 'down')],
  P02: [rel('', 'down')],
  P03: [rel('', 'down')],
  P04: [rel('', 'down')],
  P05: [rel('', 'down')],
  P07: [bool()],
});

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const equals = (expected) => (v) => (v === null || v === undefined ? null : v === expected);
const allZero = (...keys) => (v) => (v && typeof v === 'object' ? keys.every((k) => v[k] === 0) : null);

/**
 * Each floor of the catalogue as a predicate over the entry's value: `true` held, `false` breached, `null` no reading.
 * Held equal to the catalogue's `kind: floor` metrics by a test.
 */
const FLOORS = Object.freeze({
  G01: equals(100),
  G05: equals(100),
  G06: equals(100),
  G07: equals(0),
  G08: (v) => {
    if (!v || typeof v !== 'object') return null;
    // A null share (no judged commit, F8 item 3) is no reading of that half; the other half still holds or breaches.
    const shareHeld = v.conforming_share === null || v.conforming_share === undefined ? true : v.conforming_share === 100;
    return shareHeld && v.approve_reject_with_ai === 0;
  },
  G10: equals(100),
  G14: equals(0),
  G15: allZero('stale_branches', 'duplicate_ids'),
  Q01: equals(true),
  Q02: allZero('failing', 'disabled'),
  Q04: (v) => (v && typeof v === 'object' ? Object.values(v).every((p) => isNumber(p) && p >= 90) : null),
  Q07: allZero('cycles', 'bypasses'),
  Q08: (v) => (v && typeof v === 'object' ? v.unused_runtime_dependencies === 0 : null),
  Q09: equals(0),
  Q10: equals(100),
  Q11: equals(100),
  Q12: (v) => (isNumber(v) ? v < 1000 : null),
  Q17: equals(true),
  Q20: (v) => (isNumber(v) ? v >= 0 : null),
  P01: equals(0),
  P02: equals(0),
  P03: equals(0),
  P04: equals(0),
  P05: equals(0),
  P07: equals(true),
});

// --- small helpers -----------------------------------------------------------------------------------

function compareVersions(a, b) {
  const pa = a.slice(1).split('.').map(Number);
  const pb = b.slice(1).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** The next minor after `version`: v0.2 → v0.3, v0.2.2 → v0.3 (approver ruling F). */
function nextMinor(version) {
  const [major, minor] = version.slice(1).split('.').map(Number);
  return `v${major}.${minor + 1}`;
}

/** A tolerance `Npp` or `N%`, or exit 2. */
function parseTolerance(text, unit, where) {
  const match = (unit === 'share' ? /^([0-9]+(?:\.[0-9]+)?)pp$/ : /^([0-9]+(?:\.[0-9]+)?)%$/).exec(String(text).trim());
  if (!match) throw new UsageError(`${where}: tolerance ${JSON.stringify(text)} is not ${unit === 'share' ? '<N>pp' : '<N>%'}`);
  return Number(match[1]);
}

/**
 * A metric's own `tolerance`, checked (review F4): `<N>pp` or `<N>%`, in a unit one of its compared parts uses —
 * never silently replaced by the default. Returns `{ unit, value }` or `null` when it declares none.
 */
function ownTolerance(def) {
  const own = def.tolerance;
  if (own === undefined || own === null) return null;
  const text = String(own).trim();
  const unit = /pp$/.test(text) ? 'share' : /%$/.test(text) ? 'relative' : null;
  if (unit === null) throw new UsageError(`metric ${def.id}: tolerance ${JSON.stringify(own)} is neither <N>pp (a share) nor <N>% (relative)`);
  const value = parseTolerance(text, unit, `metric ${def.id}`);
  const units = new Set((COMPONENTS[def.id] ?? []).map((p) => p.unit));
  if (COMPONENTS[def.id] && !units.has(unit)) {
    throw new UsageError(`metric ${def.id}: tolerance ${JSON.stringify(own)} is ${unit === 'share' ? 'in percentage points' : 'relative'}, but ${def.id} compares no ${unit === 'share' ? 'share' : 'relative'} part`);
  }
  return { unit, value };
}

/** The tolerance of `unit` for `def`: its own `tolerance` when it is written in that unit, else the default. */
function toleranceOf(def, unit, defaults) {
  const own = ownTolerance(def);
  if (own !== null && own.unit === unit) return own.value;
  const tolerance = defaults && defaults.tolerance ? defaults.tolerance : {};
  return parseTolerance(unit === 'share' ? tolerance.share ?? '2pp' : tolerance.relative ?? '10%', unit, 'catalogue defaults');
}

/** The parts to compare: the declared ones, else (a metric no table names yet) the value's own shape. */
function partsOf(def, current, previous) {
  const declared = COMPONENTS[def.id];
  const direction = def.direction === 'down' ? 'down' : 'up';
  const parts = declared ?? (typeof current === 'boolean' ? [bool()] : isNumber(current) ? [rel('', direction)] : current && typeof current === 'object' ? [rel(ALL_KEYS, direction)] : []);
  return parts.flatMap((p) => {
    if (p.path !== ALL_KEYS) return [p];
    const keys = [...new Set([...Object.keys(current ?? {}), ...Object.keys(previous ?? {})])].sort();
    return keys.map((key) => part(key, p.unit, p.direction));
  });
}

const at = (value, path) => (path === '' ? value : value && typeof value === 'object' ? value[path] : undefined);

/** One part's movement: `better` | `worse` | `same` | `null` (no reading on a side). */
function movement(p, current, previous, def, defaults) {
  const now = at(current, p.path);
  const before = at(previous, p.path);
  if (p.unit === 'boolean') {
    if (typeof now !== 'boolean' || typeof before !== 'boolean') return null;
    return now === before ? 'same' : now ? 'better' : 'worse';
  }
  if (!isNumber(now) || !isNumber(before)) return null;
  const delta = now - before;
  const tolerance = toleranceOf(def, p.unit, defaults);
  const beyond = p.unit === 'share' ? Math.abs(delta) > tolerance + EPSILON : before === 0 ? delta !== 0 : (Math.abs(delta) / Math.abs(before)) * 100 > tolerance + EPSILON;
  if (!beyond) return 'same';
  return (delta > 0) === (p.direction === 'up') ? 'better' : 'worse';
}

/** The floor verdict of `entry` (`held` | `breached`), `null` for a metric with no floor or no reading. */
function evaluateFloor(id, entry) {
  const predicate = FLOORS[id];
  if (!predicate || !entry || entry.status !== 'measured') return null;
  const held = predicate(entry.value);
  return held === null ? null : held ? 'held' : 'breached';
}

function flagsOf(current) {
  const flags = [];
  if (!current) return flags;
  if (current.small_sample === true) flags.push('small-sample');
  const raw = current.raw && typeof current.raw === 'object' ? current.raw : {};
  if (isNumber(raw.unchecked) && raw.unchecked > 0) flags.push(`unchecked ${raw.unchecked}`);
  if (isNumber(raw.unresolved) && raw.unresolved > 0) flags.push(`unresolved ${raw.unresolved}`);
  if ('node_pinned' in raw) flags.push(`node ${raw.node} (pinned ${raw.node_pinned ?? 'none'})`);
  return flags;
}

/**
 * The verdict of one metric (`dl-089` §3): `{ verdict, floor, flags }`. `current`/`previous` are report entries.
 */
function classifyMetric(def, current, previous, defaults) {
  if (def.status === 'retired') return { verdict: null, floor: null, flags: ['retired'] };
  if (!current || current.status === 'not-comparable') return { verdict: 'not-comparable', floor: null, flags: current && current.reason ? [current.reason] : [] };
  if (current.status !== 'measured') return { verdict: null, floor: null, flags: [`not-measurable: ${current.reason ?? 'no reason given'}`] };
  const flags = flagsOf(current);
  const floor = def.kind === 'floor' ? evaluateFloor(def.id, current) : null;
  const runTime = RUN_TIME_READINGS.includes(def.id);
  if (runTime) flags.push('run-time reading');
  if (def.kind === 'info') return { verdict: 'info', floor, flags };
  if (runTime) return { verdict: 'not-comparable', floor, flags };
  if (def.direction === 'pending') return { verdict: 'pending', floor, flags };
  if (!previous || previous.status !== 'measured') return { verdict: 'new', floor, flags };
  const moves = [];
  for (const p of partsOf(def, current.value, previous.value)) {
    const move = movement(p, current.value, previous.value, def, defaults);
    if (move === null) flags.push(`partial: ${p.path === '' ? 'value' : p.path}`);
    else moves.push(move);
  }
  if (moves.length === 0) return { verdict: 'not-comparable', floor, flags };
  const verdict = moves.includes('worse') ? 'regressed' : moves.includes('better') ? 'improved' : 'stable';
  return { verdict, floor, flags };
}

// --- comparing two reports ----------------------------------------------------------------------------

const entryOf = (report, id) => (report ? report.metrics.find((m) => m.id === id) : undefined);

/** The latest catalogue version after `from` that lists `id` under `key` (`added` | `redefined`), or `null`. */
function changedSince(catalogue, id, from, key) {
  const versions = (catalogue.changes ?? []).filter((c) => c.version > from && c.version <= catalogue.version && Array.isArray(c[key]) && c[key].includes(id)).map((c) => c.version);
  return versions.length === 0 ? null : Math.max(...versions);
}

/**
 * Compare `current` with `previous` under `catalogue` (`dl-089` §3). `history` holds the runs for the trend, the
 * current one included. `remeasure(previous)` re-measures a previous report taken with an older catalogue.
 */
async function compareReports({ catalogue, current, previous, history = [], remeasure }) {
  const defaults = catalogue.defaults ?? {};
  for (const def of catalogue.metrics) ownTolerance(def);
  const previousBasis = current.previous && current.previous.basis ? current.previous.basis : current.previous ? 'report' : null;
  const prior = previousBasis === '--previous' ? null : previous;
  let baseline = prior;
  let catalogueNote;
  let staleFrom = null;
  if (prior === null) catalogueNote = 'no previous report';
  else if (prior.catalogue_version === catalogue.version) catalogueNote = `the previous report used version ${prior.catalogue_version}; re-measured like-for-like: not needed`;
  else {
    let reason;
    if (typeof remeasure === 'function') {
      try {
        baseline = await remeasure(prior);
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
      }
    } else reason = 'not run (--no-remeasure)';
    if (reason === undefined) catalogueNote = `the previous report used version ${prior.catalogue_version}; re-measured like-for-like: yes`;
    else {
      baseline = prior;
      staleFrom = prior.catalogue_version;
      catalogueNote = `the previous report used version ${prior.catalogue_version}; re-measured like-for-like: no (${reason})`;
    }
  }

  const rows = catalogue.metrics.map((def) => {
    const now = entryOf(current, def.id);
    let before = baseline ? entryOf(baseline, def.id) : null;
    const extra = [];
    if (staleFrom !== null) {
      const redefined = changedSince(catalogue, def.id, staleFrom, 'redefined');
      if (redefined !== null) extra.push(`redefined in catalogue v${redefined}, not re-measured`);
      if (changedSince(catalogue, def.id, staleFrom, 'added') !== null) before = null;
    }
    let result = classifyMetric(def, now, before, defaults);
    if (extra.length > 0 && !['info', 'pending', null].includes(result.verdict) && result.verdict !== 'new') {
      result = { ...result, verdict: 'not-comparable', flags: [...result.flags, ...extra] };
    }
    return {
      id: def.id,
      name: def.name,
      kind: def.kind,
      previous: before && before.status === 'measured' ? before.value : null,
      value: now && now.status === 'measured' ? now.value : null,
      raw: now && now.raw ? now.raw : null,
      failing: now && Array.isArray(now.failing) ? now.failing : [],
      previous_floor: def.kind === 'floor' ? evaluateFloor(def.id, before) : null,
      verdict: result.verdict,
      floor: result.floor,
      flags: result.flags,
    };
  });

  const basis = current.measurement_point.basis;
  const findings = rows.filter((row) => {
    const def = catalogue.metrics.find((m) => m.id === row.id);
    return row.floor === 'breached' || (def.kind === 'trend' && row.verdict === 'regressed' && !row.flags.includes('small-sample'));
  }).map((row) => {
    const def = catalogue.metrics.find((m) => m.id === row.id);
    const immediate = def.immediate_bug === true && (!AT_TAG_ONLY.includes(row.id) || basis === 'published-tag');
    return { id: row.id, name: row.name, type: row.floor === 'breached' ? 'floor' : 'trend', immediate };
  });

  const runs = [...history].filter((r) => compareVersions(r.release.version, current.release.version) <= 0).sort((a, b) => compareVersions(a.release.version, b.release.version));
  return {
    release: current.release,
    measurement_point: current.measurement_point,
    previous: current.previous,
    catalogue: { version: catalogue.version, note: catalogueNote },
    toolchain: current.toolchain,
    metrics: catalogue.metrics.map((m) => ({ id: m.id, name: m.name, status: m.status })),
    rows,
    trend: { runs: runs.map((r) => ({ version: r.release.version, catalogue_version: r.catalogue_version, metrics: r.metrics })) },
    findings,
    tracked: null,
    proposals: null,
    previous_proposals: null,
  };
}

// --- propose ------------------------------------------------------------------------------------------

/** The last state of `type`'s machine in `memoryYaml` (its own `sequence`, else the defaults'). */
function lastState(memoryYaml, type) {
  const types = memoryYaml && memoryYaml.types ? memoryYaml.types : {};
  const own = types[type] && types[type].states && Array.isArray(types[type].states.sequence) ? types[type].states.sequence : null;
  const fallback = memoryYaml && memoryYaml.defaults && memoryYaml.defaults.states && Array.isArray(memoryYaml.defaults.states.sequence) ? memoryYaml.defaults.states.sequence : null;
  const sequence = own ?? fallback;
  return sequence && sequence.length > 0 ? sequence[sequence.length - 1] : null;
}

const searchCommand = (id) => `node dist/cli.js memory search ${id} --format json`;

/**
 * Search Memory for each finding and draft the Proposals (`dl-089` §4; approver rulings E, F). `search(id)` returns
 * the parsed output of `memory search <id> --format json`.
 */
async function propose(comparison, { search, memoryYaml }) {
  const tracked = [];
  const proposals = [];
  for (const finding of comparison.findings) {
    const result = await search(finding.id);
    const matches = (result && Array.isArray(result.matches) ? result.matches : [])
      .filter((m) => m && TRACKING_TYPES.includes(m.type) && m.status !== 'deprecated' && m.status !== lastState(memoryYaml, m.type))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (matches.length > 0) {
      // Review F1: a search is a substring match, so a match is a candidate the propose phase confirms, never final.
      tracked.push({ id: finding.id, name: finding.name, immediate: finding.immediate, elements: matches.map((m) => ({ id: m.id, type: m.type, status: m.status })) });
      continue;
    }
    const row = comparison.rows.find((r) => r.id === finding.id);
    proposals.push({
      id: `RH-${comparison.release.version}-${String(proposals.length + 1).padStart(2, '0')}`,
      metric: finding.id,
      name: finding.name,
      finding: finding.type === 'floor' ? `floor breached (value ${formatValue(row.value)})` : `regressed (previous ${formatValue(row.previous)}, value ${formatValue(row.value)})`,
      evidence: evidenceOf(row),
      element: finding.type === 'floor' ? 'bug' : 'decision-log',
      target: nextMinor(comparison.release.version),
      immediate: finding.immediate,
    });
  }
  return { ...comparison, tracked, proposals };
}

function evidenceOf(row) {
  const parts = [`value ${formatValue(row.value)}`];
  if (row.previous !== null) parts.push(`previous ${formatValue(row.previous)}`);
  if (row.raw) parts.push(`raw ${formatValue(row.raw)}`);
  if (row.failing.length > 0) parts.push(`failing (${row.failing.length}): ${row.failing.join(', ')}`);
  return parts.join('; ');
}

/** The proposals of a report's Markdown, in order: `{ id, metric, element }`. */
function parseProposals(markdown) {
  const out = [];
  const re = /^### (RH-v[0-9]+\.[0-9]+(?:\.[0-9]+)?-[0-9]{2}) — ([A-Z][0-9]{2})\b[^\n]*\n([\s\S]*?)(?=^### |^## |(?![\s\S]))/gm;
  for (const match of String(markdown).matchAll(re)) {
    const element = /^- Proposed element: (\S+)/m.exec(match[3]);
    out.push({ id: match[1], metric: match[2], element: element ? element[1] : null });
  }
  return out;
}

/** The disposition rows of a retrospective's `## Release health` section: RH id → { outcome, element }. */
function dispositions(retroText) {
  const out = new Map();
  if (retroText === null || retroText === undefined) return out;
  const text = String(retroText);
  const start = text.search(/^## Release health\s*$/m);
  if (start === -1) return out;
  const rest = text.slice(start).split('\n').slice(1);
  for (const line of rest) {
    if (/^## /.test(line)) break;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 3 || !/^RH-v[0-9.]+-[0-9]{2}$/.test(cells[1])) continue;
    out.set(cells[1], { outcome: cells[2], element: cells[3] ? cells[3] : null });
  }
  return out;
}

/** The note a patch's proposals settle with: a patch runs no retrospective (`bug-443`, release-planning v0.3.2 R8). */
const PATCH_PENDING_NOTE = "disposed of by the next minor's retrospective (dl-167 (a))";

/**
 * Settle each previous proposal (`dl-089` §4, approver ruling G): `{ id, metric, settled, outcome, element, note }`.
 * With `previousKind` `'patch'` every proposal is `pending` and `retroText` is not read (`bug-443`).
 */
function settle(previousProposals, retroText, comparison, previousKind) {
  if (previousKind === 'patch') {
    return previousProposals.map((p) => ({ id: p.id, metric: p.metric, settled: 'pending', outcome: null, element: null, note: PATCH_PENDING_NOTE }));
  }
  const rows = dispositions(retroText);
  return previousProposals.map((p) => {
    const row = rows.get(p.id);
    const base = { id: p.id, metric: p.metric };
    if (!row) return { ...base, settled: 'not adopted', outcome: null, element: null, note: retroText === null || retroText === undefined ? 'no disposition recorded (no retrospective)' : 'no disposition recorded' };
    const outcome = row.outcome.toLowerCase();
    if (outcome === 'element') {
      const metric = comparison.rows.find((r) => r.id === p.metric);
      const effective = metric !== undefined && (metric.verdict === 'improved' || (metric.previous_floor === 'breached' && metric.floor === 'held'));
      return { ...base, settled: effective ? 'adopted and effective' : 'adopted, no effect yet', outcome: row.outcome, element: row.element };
    }
    if (['covered', 'restated', 'superseded'].includes(outcome)) return { ...base, settled: 'superseded', outcome: row.outcome, element: row.element };
    if (outcome === 'declined') return { ...base, settled: 'not adopted', outcome: row.outcome, element: row.element };
    // Review F2: an outcome outside the retrospective's vocabulary is not adopted, and says why.
    return { ...base, settled: 'not adopted', outcome: row.outcome, element: row.element, note: `unrecognised outcome ${JSON.stringify(row.outcome)}` };
  });
}

// --- the Markdown ------------------------------------------------------------------------------------

function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (typeof value === 'object') return Object.keys(value).sort().map((k) => `${k}=${formatValue(value[k])}`).join(', ');
  return String(value);
}

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The report's Markdown (`report-layout.md`); byte-identical on the same comparison. */
function renderReport(comparison) {
  const c = comparison;
  const mp = c.measurement_point;
  const prev = c.previous;
  const previousLine = prev === null || prev === undefined
    ? 'none: every metric is new'
    : prev.basis === '--previous'
      ? `${prev.release} at ${prev.commit}, named by --previous: no report, every metric is new`
      : `${prev.release} at ${prev.commit}, report ${prev.report}`;
  const pinned = c.rows.map((r) => (r.raw && typeof r.raw === 'object' && 'node_pinned' in r.raw ? r.raw.node_pinned : undefined)).find((v) => v !== undefined);
  const toolchain = `Node ${c.toolchain.node}${pinned !== undefined ? ` (pinned ${pinned ?? 'none'}: measured with --any-node)` : ''}, npm ${c.toolchain.npm}, lockfile sha256 ${c.toolchain.lockfile_sha256}`;
  const lines = [
    `# Release health — ${c.release.version}`,
    '',
    '| | |',
    '|---|---|',
    `| Release | ${cell(`${c.release.id} (${c.release.kind})`)} |`,
    `| Measurement point | ${cell(`${mp.ref} at ${mp.commit} (${mp.basis})`)} |`,
    `| Previous run | ${cell(previousLine)} |`,
    `| Catalogue | ${cell(`version ${c.catalogue.version} (${c.catalogue.note})`)} |`,
    `| Toolchain | ${cell(toolchain)} |`,
    '',
  ];

  const count = (pred) => c.rows.filter(pred).length;
  const verdicts = ['improved', 'stable', 'regressed', 'new', 'not-comparable'].map((v) => `${v} ${count((r) => r.verdict === v)}`).join(' · ');
  const settled = c.previous_proposals ?? [];
  lines.push('## Summary', '');
  lines.push(`- Verdicts: ${verdicts}; info ${count((r) => r.verdict === 'info')}, pending ${count((r) => r.verdict === 'pending')}, not measurable ${count((r) => r.verdict === null)}.`);
  lines.push(`- Floors: held ${count((r) => r.floor === 'held')}, breached ${count((r) => r.floor === 'breached')}.`);
  lines.push(`- Findings: ${c.findings.length} (immediate ${c.findings.filter((f) => f.immediate).length}).`);
  lines.push(`- Proposals: ${c.proposals === null ? 'not drafted' : c.proposals.length}; findings with a candidate tracker: ${c.tracked === null ? '—' : c.tracked.length}.`);
  lines.push(`- Previous proposals settled: ${settled.length}.`, '');

  lines.push('## Comparison', '', '| id | Metric | Previous | Value | Raw | Verdict | Flags |', '|---|---|---|---|---|---|---|');
  for (const r of c.rows) {
    const verdict = [r.verdict ?? '—', r.floor].filter((v) => v !== null).join(', ');
    lines.push(`| ${r.id} | ${cell(r.name)} | ${cell(formatValue(r.previous))} | ${cell(formatValue(r.value))} | ${cell(formatValue(r.raw))} | ${cell(verdict)} | ${cell(r.flags.join('; '))} |`);
  }
  lines.push('');

  lines.push('## Trend', '');
  const runs = c.trend.runs;
  if (runs.length < 3) lines.push(`fewer than three runs (${runs.length}): no trend yet`, '');
  else {
    const last = runs.slice(-3);
    for (const m of c.metrics) {
      if (m.status === 'retired') continue;
      const values = last.map((run) => {
        const e = run.metrics.find((x) => x.id === m.id);
        const mark = run.catalogue_version !== c.catalogue.version ? ` (catalogue v${run.catalogue_version})` : '';
        return `${run.version}: ${e && e.status === 'measured' ? formatValue(e.value) : '—'}${mark}`;
      });
      lines.push(`- ${m.id} ${m.name}: ${values.join(' · ')}`);
    }
    lines.push('');
  }

  lines.push('## Findings', '');
  if (c.findings.length === 0) lines.push('None.');
  for (const f of c.findings) {
    const row = c.rows.find((r) => r.id === f.id);
    const what = f.type === 'floor' ? 'floor breached' : 'regressed';
    lines.push(`- ${f.id} ${f.name}: ${what}; ${evidenceOf(row)}${f.immediate ? '. Immediate: file through bug-ingest in this run (dl-089 §5)' : ''}`);
  }
  lines.push('');

  lines.push('## Proposals', '');
  if (c.proposals === null) lines.push('Not drafted: the propose step has not run (dl-089 §4).', '');
  else {
    if (c.tracked.length === 0 && c.proposals.length === 0) lines.push('None: no finding.', '');
    for (const t of c.tracked) {
      for (const e of t.elements) lines.push(`- ${t.id} — candidate tracker: ${e.id} (${e.status}; \`${searchCommand(t.id)}\`); the propose phase confirms it tracks the finding, else drafts a proposal${t.immediate ? '. Immediate: file through bug-ingest in this run unless it is confirmed (dl-089 §5)' : ''}`);
    }
    if (c.tracked.length > 0) lines.push('');
    for (const p of c.proposals) {
      lines.push(`### ${p.id} — ${p.metric} ${p.name}`, '');
      lines.push(`- Finding: ${p.metric} ${p.finding}`);
      lines.push(`- Evidence: ${p.evidence}`);
      lines.push(`- Proposed element: ${p.element}`);
      lines.push(`- Proposed target release: ${p.target}`);
      if (p.immediate) lines.push('- Immediate: file through bug-ingest in this run (dl-089 §5)');
      lines.push('');
    }
  }

  lines.push('## Previous proposals', '', '| Proposal | Linked element | Settled as |', '|---|---|---|');
  for (const s of settled) lines.push(`| ${s.id} | ${cell(s.element ?? '—')} | ${cell(s.note ? `${s.settled} (${s.note})` : s.settled)} |`);
  lines.push('');
  if (settled.length === 0) lines.push(c.previous_note ?? 'None.', '');

  lines.push('## Improvements', '');
  const improved = c.rows.filter((r) => r.verdict === 'improved');
  if (improved.length === 0) lines.push('None.');
  for (const r of improved) {
    const follows = settled.filter((s) => s.metric === r.id && s.settled.startsWith('adopted')).map((s) => s.id);
    lines.push(`- ${r.id} ${r.name}: ${formatValue(r.previous)} → ${formatValue(r.value)}${follows.length > 0 ? ` (follows ${follows.join(', ')})` : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}

// --- the command line ---------------------------------------------------------------------------------

function loadAjv() {
  const mod = require('ajv/dist/2020');
  return mod.default ?? mod;
}

function readJson(path, what) {
  if (!existsSync(path)) throw new UsageError(`no ${what} at ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new UsageError(`${what} ${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The default search: the code build's `memory search <id> --format json` at `root`. */
function cliSearch(root) {
  return (id) => {
    const result = spawnSync(process.execPath, [DIST_CLI, 'memory', 'search', id, '--format', 'json'], { cwd: root, encoding: 'utf-8' });
    if (result.status !== 0) {
      const line = String(result.stderr || result.error || '').trim().split('\n')[0];
      throw new UsageError(`could not search Memory for ${id} (\`${searchCommand(id)}\` exited ${result.status}): ${line}`);
    }
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new UsageError(`could not read \`${searchCommand(id)}\`'s output as JSON`);
    }
  };
}

/**
 * Compare the release `options.release` of the repository at `root`, write the Markdown and return
 * `{ path, comparison }`. Injectable: `search`, `remeasure` (`false` for none), `catalogue` (a path).
 */
async function compareRelease(root, options) {
  const version = String(options.release);
  if (!VERSION_RE.test(version)) throw new UsageError(`--release ${version} is not a release version (vX.Y or vX.Y.Z)`);
  let location;
  try {
    location = catalogueLocation(root);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const healthDir = location.replace(/[^/]+$/, '');
  const cataloguePath = options.catalogue ?? join(root, location);
  if (!existsSync(cataloguePath)) throw new UsageError(`no catalogue at ${cataloguePath}`);
  const catalogue = yaml.load(readFileSync(cataloguePath, 'utf-8'));
  const issues = validateCatalogue(catalogue);
  if (issues.length > 0) throw new UsageError(`the catalogue ${cataloguePath} breaks its rules: ${issues.join('; ')}`);

  const schemaPath = join(root, healthDir, 'release-health.schema.json');
  const Ajv2020 = loadAjv();
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(readJson(schemaPath, 'schema'));
  const load = (path, what) => {
    const report = readJson(path, what);
    if (!validate(report)) {
      const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim()).join('; ');
      throw new UsageError(`${what} ${path} does not validate against ${schemaPath}: ${errors}`);
    }
    return report;
  };

  const reportPath = options.report === undefined ? join(root, healthDir, `release-health-${version}.json`) : isAbsolute(options.report) ? options.report : join(process.cwd(), options.report);
  const current = load(reportPath, 'report');
  if (current.release.version !== version) throw new UsageError(`the report ${reportPath} is release ${current.release.version}, not --release ${version}`);
  if (current.catalogue_version !== catalogue.version) {
    throw new UsageError(`the report ${reportPath} was measured with catalogue version ${current.catalogue_version}, the catalogue ${cataloguePath} is version ${catalogue.version}: measure again`);
  }

  let previous = null;
  let previousMd = null;
  if (current.previous && current.previous.basis === 'report') {
    const previousPath = join(root, current.previous.report);
    if (!existsSync(previousPath)) throw new UsageError(`the previous report ${current.previous.report} that ${reportPath} names is absent`);
    previous = load(previousPath, 'previous report');
    if (previous.catalogue_version > catalogue.version) {
      throw new UsageError(`the previous report ${previousPath} used catalogue version ${previous.catalogue_version}, newer than the catalogue's ${catalogue.version}`);
    }
    previousMd = previousPath.replace(/\.json$/, '.md');
  }

  const dir = join(root, healthDir);
  const history = readdirSync(dir)
    .map((name) => /^release-health-(v[0-9.]+)\.json$/.exec(name))
    .filter((m) => m !== null && VERSION_RE.test(m[1]) && compareVersions(m[1], version) < 0)
    .map((m) => readJson(join(dir, m[0]), 'report'));
  history.push(current);

  const remeasure = options.remeasure === false ? undefined : options.remeasure ?? (async (report) => {
    // Review F3: the point's commit is immutable; its ref (a branch, a tag) may have moved since.
    return measure.measureRelease(root, {
      release: report.release.version,
      at: report.measurement_point.commit,
      ...(report.previous ? { previous: report.previous.commit } : {}),
      offline: options.offline === true,
      toolchain: options.toolchain !== false,
      anyNode: options.anyNode === true,
      ...(options.maxWorkers === undefined ? {} : { maxWorkers: options.maxWorkers }),
    });
  });

  let comparison = await compareReports({ catalogue, current, previous, history, remeasure });
  const memoryYamlPath = join(root, '.wingfoil', 'memory.yaml');
  const memoryYaml = existsSync(memoryYamlPath) ? yaml.load(readFileSync(memoryYamlPath, 'utf-8')) : {};

  // The previous run's proposals, settled against its retrospective (dl-089 §4), or pending for a patch (bug-443).
  let previousNote = null;
  let settled = [];
  if (previousMd !== null && existsSync(previousMd) && previous.release.kind === 'patch') {
    // A patch runs no retrospective (dl-092 Q2 (ii)): no retro-<patch> lookup, every proposal pending (bug-443).
    settled = settle(parseProposals(readFileSync(previousMd, 'utf-8')), null, comparison, 'patch');
  } else if (previousMd !== null && existsSync(previousMd)) {
    const retroPattern = memoryYaml && memoryYaml.types && memoryYaml.types['decision-log'] ? String(memoryYaml.types['decision-log'].path) : null;
    const retroPath = retroPattern === null ? null : join(root, retroPattern.replace('{id}', `retro-${previous.release.version}`));
    const retroText = retroPath !== null && existsSync(retroPath) ? readFileSync(retroPath, 'utf-8') : null;
    settled = settle(parseProposals(readFileSync(previousMd, 'utf-8')), retroText, comparison);
  } else if (previous !== null) {
    previousNote = `None: the previous run has no Markdown report (${current.previous.report.replace(/\.json$/, '.md')}), so no proposal to settle.`;
  }
  comparison = { ...comparison, previous_proposals: settled, previous_note: previousNote };
  comparison = await propose(comparison, { search: options.search ?? cliSearch(root), memoryYaml });

  const out = options.out === undefined ? reportPath.replace(/\.json$/, '.md') : isAbsolute(options.out) ? options.out : join(process.cwd(), options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderReport(comparison));
  return { path: out, comparison };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--offline') options.offline = true;
    else if (flag === '--no-toolchain') options.toolchain = false;
    else if (flag === '--any-node') options.anyNode = true;
    else if (flag === '--no-remeasure') options.remeasure = false;
    else if (flag === '--max-workers') {
      if (!/^[1-9][0-9]*$/.test(String(argv[i + 1]))) throw new UsageError(`--max-workers needs a positive integer, got ${argv[i + 1] === undefined ? 'nothing' : JSON.stringify(argv[i + 1])}`);
      options.maxWorkers = Number(argv[i + 1]);
      i += 1;
    } else if (['--release', '--report', '--out', '--root'].includes(flag)) {
      if (argv[i + 1] === undefined) throw new UsageError(`${flag} needs a value`);
      options[flag.slice(2)] = argv[i + 1];
      i += 1;
    } else throw new UsageError(`unknown argument ${flag}`);
  }
  if (options.release === undefined) throw new UsageError('missing required argument: --release <vX.Y[.Z]>');
  return options;
}

async function main(argv) {
  try {
    const options = parseArgs(argv);
    const root = options.root === undefined ? process.cwd() : isAbsolute(options.root) ? options.root : join(process.cwd(), options.root);
    const { path, comparison } = await compareRelease(root, options);
    // Review F1: every immediate finding is named, a candidate tracker or not (dl-089 §5).
    for (const finding of comparison.findings.filter((f) => f.immediate)) {
      const proposal = comparison.proposals.find((p) => p.metric === finding.id);
      const candidates = (comparison.tracked.find((t) => t.id === finding.id) ?? { elements: [] }).elements;
      const detail = proposal ? `(${proposal.id})` : `(candidate trackers: ${candidates.map((e) => `${e.id} (${e.status})`).join(', ')}; confirm one tracks it)`;
      process.stderr.write(`${PREFIX}immediate bug-ingest: ${finding.id} ${finding.name} ${detail}: file it through bug-ingest in this run (dl-089 §5)\n`);
    }
    process.stdout.write(`${path}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${PREFIX}${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

module.exports = {
  classifyMetric,
  evaluateFloor,
  compareReports,
  propose,
  parseProposals,
  settle,
  renderReport,
  compareRelease,
  main,
  FLOORS,
  COMPONENTS,
  RUN_TIME_READINGS,
};

if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
