#!/usr/bin/env node
/**
 * task-207 (`bug-132`, `bug-133`, `dl-099` §3) — a `wingfoil` for the e2e-smoke tests: it forwards every
 * invocation to the compiled CLI and can inject ONE declared fault into the invocations it matches, so a
 * test proves the smoke FAILS on that fault rather than only that it passes on a healthy build.
 *
 * Self-contained (Node built-ins only), so it also runs as a `wingfoil` bin placed on PATH.
 *
 * Environment (names below; the values are the test's):
 * - `SMOKE_PROXY_CLI` — the `cli.js` to forward to; default `<repository>/dist/cli.js`.
 * - `SMOKE_STAMP` — when set, `--version` prints it instead of forwarding (the staging stamp checks).
 * - `SMOKE_FAULT` — `<kind>@<argv prefix>`: the fault applies to every invocation whose space-joined argv
 *   starts with the prefix. Kinds:
 *   - `exit=<n>` — forward, then exit `<n>` instead of the CLI's own code (a wrong exit code);
 *   - `mute` — forward, but drop the CLI's stderr (a non-zero exit with no spec-005 §3 error);
 *   - `dirty` — forward, then leave an untracked file in the working directory (an uncommitted write);
 *   - `corrupt` — forward, then overwrite the file the new HEAD commit touched with unparseable
 *     frontmatter and commit that, so the tree stays clean (a schema-invalid artifact a writer left).
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const args = process.argv.slice(2);
const cli = process.env.SMOKE_PROXY_CLI || join(__dirname, '..', '..', '..', 'dist', 'cli.js');

if (args[0] === '--version' && process.env.SMOKE_STAMP !== undefined) {
  process.stdout.write(`${process.env.SMOKE_STAMP}\n`);
  process.exit(0);
}

const fault = /^([a-z]+)(?:=(\d+))?@(.+)$/.exec(process.env.SMOKE_FAULT ?? '');
const hit = fault !== null && args.join(' ').startsWith(fault[3]);
const kind = hit ? fault[1] : 'none';

const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf-8' });
process.stdout.write(run.stdout ?? '');
if (kind !== 'mute') process.stderr.write(run.stderr ?? '');

const git = (gitArgs) => spawnSync('git', gitArgs, { encoding: 'utf-8' });
if (kind === 'dirty') writeFileSync('smoke-fault-stray.txt', 'left behind by the proxy\n');
if (kind === 'corrupt') {
  const touched = git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).stdout.trim().split('\n')[0];
  writeFileSync(touched, '---\nid: [unclosed\n');
  git(['commit', '--quiet', '--all', '--message', `fault: corrupt ${touched}`]);
}
process.exit(kind === 'exit' ? Number(fault[2]) : (run.status ?? 1));
