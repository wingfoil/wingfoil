'use strict';
/**
 * The release-health metric catalogue (`dl-089` §2; catalogue v2 by task-222): where it lives and the rules
 * it must keep. The measure and compare scripts (`scripts/release-health/measure.cjs`, `compare.cjs`,
 * tasks 231–233 and 241) read the catalogue through this module, so a catalogue that breaks a rule is
 * refused before anything is measured.
 *
 * Rules (`dl-089` §2): every metric has a unique id, a name, a definition, a scope (`window`, `snapshot`,
 * or `window+snapshot`) and a kind (`floor` with its floor, `trend` with its direction, or `info`). A metric
 * is never dropped silently: the `changes` log records, per catalogue version, the ids it added, redefined
 * and retired; every id ever added is still listed, and a retired one is marked `status: retired` with the
 * release that retired it (`retired_in`).
 *
 * Read-only and deterministic: issues are returned in document order; no clock, no randomness, no git.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

const SCOPES = ['window', 'snapshot', 'window+snapshot'];
const KINDS = ['floor', 'trend', 'info'];
const DIRECTIONS = ['up', 'down', 'pending'];
const STATUSES = ['active', 'retired'];
const ID_RE = /^[A-Z][0-9]{2}$/;
const CATALOGUE_FILE = 'metrics.yaml';

/** @param {unknown} value */
function isMapping(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value */
function blank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

/** @param {unknown} value */
function idList(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * The repository-relative path of the catalogue: `metrics.yaml` in the one directory `.wingfoil/dna.yaml`
 * declares as `paths.health` (`dl-089` §1 (A)).
 *
 * @param {string} root the repository root
 * @returns {string}
 */
function catalogueLocation(root) {
  const dna = /** @type {{ paths?: Record<string, unknown> }} */ (yaml.load(readFileSync(join(root, '.wingfoil', 'dna.yaml'), 'utf-8')));
  const health = dna && dna.paths ? dna.paths['health'] : undefined;
  if (!Array.isArray(health) || health.length !== 1 || typeof health[0] !== 'string') {
    throw new Error('.wingfoil/dna.yaml: paths.health must name exactly one directory');
  }
  const dir = health[0].endsWith('/') ? health[0] : `${health[0]}/`;
  return `${dir}${CATALOGUE_FILE}`;
}

/**
 * Check one metric entry; push its issues.
 *
 * @param {Record<string, unknown>} metric
 * @param {string} at the entry's label, e.g. `metrics[3] (G04)`
 * @param {string[]} issues
 */
function checkMetric(metric, at, issues) {
  for (const field of ['name', 'definition']) {
    if (blank(metric[field])) issues.push(`${at}: ${field} is missing`);
  }
  const scope = metric['scope'];
  if (scope === undefined) issues.push(`${at}: scope is missing`);
  else if (!SCOPES.includes(String(scope))) issues.push(`${at}: scope '${String(scope)}' is not one of ${SCOPES.join(', ')}`);
  const kind = metric['kind'];
  if (kind === undefined) issues.push(`${at}: kind is missing`);
  else if (!KINDS.includes(String(kind))) issues.push(`${at}: kind '${String(kind)}' is not one of ${KINDS.join(', ')}`);
  if (kind === 'floor' && metric['floor'] === undefined) issues.push(`${at}: a floor metric declares its floor`);
  if (kind === 'trend' && !DIRECTIONS.includes(String(metric['direction']))) {
    issues.push(`${at}: a trend metric declares its direction (${DIRECTIONS.slice(0, -1).join(', ')} or ${DIRECTIONS[DIRECTIONS.length - 1]})`);
  }
  const status = metric['status'] === undefined ? 'active' : String(metric['status']);
  if (!STATUSES.includes(status)) issues.push(`${at}: status '${status}' is not one of ${STATUSES.join(', ')}`);
  if (status === 'retired' && blank(metric['retired_in'])) {
    issues.push(`${at}: a retired metric names the release that retired it (retired_in)`);
  }
  if (status !== 'retired' && metric['retired_in'] !== undefined) issues.push(`${at}: retired_in is set on a metric that is not retired`);
}

/**
 * Check a parsed catalogue against `dl-089` §2's rules.
 *
 * @param {unknown} doc the parsed `metrics.yaml`
 * @returns {string[]} the issues, in document order; empty when the catalogue keeps every rule
 */
function validateCatalogue(doc) {
  if (!isMapping(doc) || !Array.isArray(doc['metrics']) || !Array.isArray(doc['changes']) || typeof doc['version'] !== 'number') {
    return ['the catalogue is not a mapping with version, metrics and changes'];
  }
  /** @type {string[]} */
  const issues = [];
  const metrics = /** @type {unknown[]} */ (doc['metrics']);
  const changes = /** @type {unknown[]} */ (doc['changes']);

  // The changes log: ascending versions, ending at the catalogue's version; each id added once.
  /** @type {Map<string, number>} */
  const addedIn = new Map();
  /** @type {Set<string>} */
  const retired = new Set();
  let last = 0;
  changes.forEach((change, i) => {
    if (!isMapping(change) || typeof change['version'] !== 'number') {
      issues.push(`changes[${i}]: not a mapping with a numeric version`);
      return;
    }
    const version = /** @type {number} */ (change['version']);
    if (version <= last) issues.push(`changes[${i}]: version ${version} does not follow version ${last}`);
    last = version;
    if (blank(change['source'])) issues.push(`changes[${i}]: source is missing (the decision-log that changed the catalogue)`);
    for (const id of idList(change['added'])) {
      if (addedIn.has(id)) issues.push(`changes: ${id} is added more than once`);
      else addedIn.set(id, version);
    }
    for (const id of idList(change['retired'])) retired.add(id);
  });
  if (last !== doc['version']) issues.push(`changes: the last entry is version ${last}, the catalogue is version ${String(doc['version'])}`);

  // The metrics: shape, unique ids, and agreement with the changes log.
  /** @type {Set<string>} */
  const listed = new Set();
  metrics.forEach((metric, i) => {
    if (!isMapping(metric)) {
      issues.push(`metrics[${i}]: not a mapping`);
      return;
    }
    const id = String(metric['id']);
    if (!ID_RE.test(id)) issues.push(`metrics[${i}]: id '${id}' is not a letter followed by two digits`);
    if (listed.has(id)) issues.push(`metrics[${i}]: duplicate id '${id}'`);
    listed.add(id);
    const at = `metrics[${i}] (${id})`;
    checkMetric(metric, at, issues);
    if (!addedIn.has(id)) issues.push(`${at}: no changes entry adds it`);
    if (metric['status'] === 'retired' && !retired.has(id)) issues.push(`${at}: retired, but no changes entry retires it`);
    if (metric['status'] !== 'retired' && retired.has(id)) issues.push(`${at}: a changes entry retires it, but its status is not retired`);
  });
  for (const [id, version] of addedIn) {
    if (!listed.has(id)) issues.push(`changes: ${id} was added in version ${version} and is no longer listed (retire it, never drop it)`);
  }
  return issues;
}

module.exports = { catalogueLocation, validateCatalogue, SCOPES, KINDS, DIRECTIONS };
