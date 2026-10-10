#!/usr/bin/env node
/**
 * task-229 (`dl-130` step 1, spec-015 §3) — print the notes of one version's GitHub Release: the section of
 * `CHANGELOG.md` headed `## [X.Y.Z]` (optionally followed by ` - <date>`), up to the next `## ` heading, with
 * blank edge lines and a closing block of link reference definitions dropped.
 *
 * Run by `.github/workflows/publish.yml`'s `release` job BEFORE it waits for npm, so a missing section fails at
 * once. It reads only the requested section, so it works on a `release/X.Y` tree that lacks later minors'
 * sections (dl-159). Pure and offline.
 *
 * Usage: node scripts/changelog-section.cjs <X.Y.Z> [--changelog <path>]   (default: the repository's CHANGELOG.md)
 * Exit:  0 the notes on stdout · 1 no / several / an empty section, or an unreadable file · 2 usage error
 */
'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S/;

/**
 * The section of `text` for `version`.
 *
 * @param {string} text the CHANGELOG.md content
 * @param {string} version `X.Y.Z`, no leading `v`
 * @returns {{ ok: true, notes: string } | { ok: false, message: string }}
 */
function changelogSection(text, version) {
  if (!VERSION.test(version)) return { ok: false, message: `${JSON.stringify(version)} is not a version of the form X.Y.Z` };
  const lines = text.split(/\r?\n/);
  const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\](?:\\s.*)?$`);
  const starts = lines.flatMap((line, index) => (heading.test(line) ? [index] : []));
  const label = `\`## [${version}]\``;
  if (starts.length === 0) return { ok: false, message: `no section ${label} in the changelog` };
  if (starts.length > 1) return { ok: false, message: `${starts.length} sections ${label} in the changelog` };
  const start = starts[0] + 1;
  const next = lines.findIndex((line, index) => index >= start && line.startsWith('## '));
  const body = lines.slice(start, next === -1 ? lines.length : next);
  const isEdge = (line) => line.trim() === '' || LINK_DEFINITION.test(line);
  while (body.length > 0 && body[0].trim() === '') body.shift();
  while (body.length > 0 && isEdge(body[body.length - 1])) body.pop();
  if (body.length === 0) return { ok: false, message: `the section ${label} is empty` };
  return { ok: true, notes: body.join('\n') };
}

/**
 * @param {readonly string[]} argv the arguments after the script path
 * @returns {{ ok: true, version: string, changelog: string } | { ok: false, message: string }}
 */
function parseArgs(argv) {
  let version;
  let changelog = join(__dirname, '..', 'CHANGELOG.md');
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--changelog') {
      if (i + 1 >= argv.length) return { ok: false, message: 'option --changelog needs a path' };
      changelog = argv[(i += 1)];
    } else if (arg.startsWith('-')) {
      return { ok: false, message: `unknown option ${arg}` };
    } else if (version === undefined) {
      version = arg;
    } else {
      return { ok: false, message: `unexpected argument ${arg}` };
    }
  }
  if (version === undefined) return { ok: false, message: 'missing required argument: version' };
  if (!VERSION.test(version)) return { ok: false, message: `${JSON.stringify(version)} is not a version of the form X.Y.Z` };
  return { ok: true, version, changelog };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    process.stderr.write(`error: ${args.message}\nhint: usage: node scripts/changelog-section.cjs <X.Y.Z> [--changelog <path>]\n`);
    process.exitCode = 2;
  } else {
    let text;
    try {
      text = readFileSync(args.changelog, 'utf-8');
    } catch (error) {
      process.stderr.write(`error: cannot read ${args.changelog}: ${error.code ?? error.message}\n`);
      process.exitCode = 1;
    }
    if (text !== undefined) {
      const result = changelogSection(text, args.version);
      if (result.ok) process.stdout.write(`${result.notes}\n`);
      else process.stderr.write(`error: ${result.message}\n`);
      process.exitCode = result.ok ? 0 : 1;
    }
  }
}

module.exports = { changelogSection };
