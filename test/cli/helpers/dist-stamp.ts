/**
 * The build stamp the compiled CLI prints for `--version` and writes in every commit's
 * `WingFoil-Version:` trailer (task-192, `dl-111`): `<package.json version> (<commit>)`, the commit
 * read from the `dist/build-info.json` that `npm run build` wrote — in a test run, the one
 * `test/global-setup.cjs` built.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');

/** `<semver> (<commit>)` of the compiled `dist/`. Read when called, after the global setup built it. */
export function distBuildStamp(): string {
  const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { version: string };
  const { commit } = JSON.parse(readFileSync(join(REPO_ROOT, 'dist', 'build-info.json'), 'utf-8')) as { commit: string };
  return `${version} (${commit})`;
}

/** The trailer paragraph the compiled CLI appends to an operation's commit message. */
export function distStampTrailer(): string {
  return `\n\nWingFoil-Version: ${distBuildStamp()}`;
}
