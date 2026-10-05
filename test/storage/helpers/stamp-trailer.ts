/**
 * The build-signature paragraph `commitPaths` appends to every commit (task-192, `dl-111`), as a run
 * from `src/` writes it: no `build-info.json` exists there, so the stamp is `<semver> (unknown)`.
 * Suites that pin a whole commit message append this to the message the operation built.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKG_VERSION = (JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')) as { version: string }).version;

/** `\n\nWingFoil-Version: <semver> (unknown)` — what follows an operation's message in the commit. */
export const STAMP_TRAILER = `\n\nWingFoil-Version: ${PKG_VERSION} (unknown)`;
