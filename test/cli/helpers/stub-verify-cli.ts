/**
 * task-366 design D3 (a) — a checkout of `scripts/check-governance.cjs` whose `dist/cli.js` is a stub, so a test can
 * hand the script any answer of `wingfoil verify` (`spec-020` §6.1, T-32, T-33) with no seam in the script itself.
 *
 * {@link makeStubCheckout} makes a scratch directory holding:
 * - `scripts/check-governance.cjs` and `scripts/check-retrospective.cjs`, copied from this repository at test time;
 * - `dist/`, one symbolic link per entry of this repository's built `dist/` except `cli.js`;
 * - `node_modules`, a symbolic link to this repository's, for the packages the copied scripts require (`js-yaml`);
 * - `dist/cli.js`, a stub that writes the argv it was started with (the node options first, then the script path and
 *   its arguments) as JSON to the file `WF_STUB_VERIFY_ARGV` names, and then answers with the stdout, stderr and exit
 *   code of the JSON file `WF_STUB_VERIFY_ANSWER` names.
 *
 * {@link runWithStub} runs the copied script as a child process against a fixture root, with the answer it is given,
 * and reads back what the stub recorded (`null` when the stub never ran). `dist/` is built once by jest's `globalSetup`.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { spawnCapture, type SpawnedRun } from './spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..', '..');

/** The two scripts the checkout carries (design D3): the governance check and the retrospective reader it loads. */
const COPIED_SCRIPTS = ['check-governance.cjs', 'check-retrospective.cjs'] as const;

/** The stub that stands for `dist/cli.js`: it records its argv and answers as told. */
const STUB_SOURCE = `'use strict';
const { readFileSync, writeFileSync } = require('node:fs');
const argvFile = process.env.WF_STUB_VERIFY_ARGV;
if (argvFile) writeFileSync(argvFile, JSON.stringify([...process.execArgv, ...process.argv.slice(1)]));
const answer = JSON.parse(readFileSync(process.env.WF_STUB_VERIFY_ANSWER, 'utf-8'));
process.stdout.write(answer.stdout);
process.stderr.write(answer.stderr);
process.exitCode = answer.exit;
`;

/** A scratch checkout of the script with a stub `dist/cli.js`. */
export interface StubCheckout {
  /** The checkout's root (a real path, no symbolic link in it). */
  readonly dir: string;
  /** `<dir>/scripts/check-governance.cjs`. */
  readonly script: string;
  /** `<dir>/dist/cli.js`, the stub. */
  readonly cli: string;
}

/** What the stub `wingfoil verify` prints and how it exits. */
export interface StubAnswer {
  readonly stdout: string;
  readonly stderr: string;
  readonly exit: number;
}

/** What the copied script did, and the argv the stub recorded (`null`: the stub was never started). */
export interface StubRun extends SpawnedRun {
  readonly argv: readonly string[] | null;
}

/** Make a scratch checkout of the script with a stub `dist/cli.js` (design D3 (a)); the caller removes `dir`. */
export function makeStubCheckout(): StubCheckout {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wf-stub-verify-')));
  mkdirSync(join(dir, 'scripts'));
  for (const name of COPIED_SCRIPTS) copyFileSync(join(REPO_ROOT, 'scripts', name), join(dir, 'scripts', name));
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'));
  mkdirSync(join(dir, 'dist'));
  const built = join(REPO_ROOT, 'dist');
  for (const name of readdirSync(built).sort()) {
    if (name !== 'cli.js') symlinkSync(join(built, name), join(dir, 'dist', name));
  }
  const cli = join(dir, 'dist', 'cli.js');
  writeFileSync(cli, STUB_SOURCE, 'utf-8');
  return { dir, script: join(dir, 'scripts', 'check-governance.cjs'), cli };
}

let runs = 0;

/**
 * Run the checkout's script with `args` against `root` (`--root <root>` first), the stub answering with `answer`.
 * Each run writes its answer and reads its argv through files of its own under `<checkout>/runs/`.
 */
export function runWithStub(checkout: StubCheckout, root: string, answer: StubAnswer, args: readonly string[] = []): StubRun {
  runs += 1;
  const runDir = join(checkout.dir, 'runs', String(runs));
  mkdirSync(runDir, { recursive: true });
  const answerFile = join(runDir, 'answer.json');
  const argvFile = join(runDir, 'argv.json');
  writeFileSync(answerFile, JSON.stringify(answer), 'utf-8');
  const run = spawnCapture(process.execPath, [checkout.script, '--root', root, ...args], {
    env: { ...process.env, WF_STUB_VERIFY_ANSWER: answerFile, WF_STUB_VERIFY_ARGV: argvFile },
  });
  const argv = existsSync(argvFile) ? (JSON.parse(readFileSync(argvFile, 'utf-8')) as string[]) : null;
  return { ...run, argv };
}
