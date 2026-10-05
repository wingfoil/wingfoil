/**
 * task-192 — `readBuildStamp` (`src/storage/build-stamp.ts`), the one reader of the build record
 * `dl-111` Q2 (a) has the `build` script write to `dist/build-info.json`.
 *
 * The stamp is `<package.json version> (<commit>)`: the commit comes from `build-info.json`, which
 * sits at the compiled root (`dist/`), one level above the module asking; `package.json` sits two
 * levels above it, in the `src/` and the `dist/` layout alike. Without a usable record the commit is
 * `unknown` (Q3 (i)), so a commit WingFoil writes always carries the trailer — "no trailer" keeps
 * meaning "not written by WingFoil".
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatVersionTrailer, readBuildStamp, WINGFOIL_VERSION_TRAILER_KEY } from '../../src/storage';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('readBuildStamp — `<semver> (<sha>)` from package.json + build-info.json (dl-111 Q2 (a), Q3 (i))', () => {
  let pkg: string;
  /** A module directory of the compiled layout: `<pkg>/dist/storage`. */
  let moduleDir: string;

  beforeEach(() => {
    pkg = mkdtempSync(join(tmpdir(), 'wf-build-stamp-'));
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'wingfoil', version: '1.2.3' }));
    mkdirSync(join(pkg, 'dist', 'storage'), { recursive: true });
    moduleDir = join(pkg, 'dist', 'storage');
  });
  afterEach(() => rmSync(pkg, { recursive: true, force: true }));

  const writeInfo = (content: string): void => writeFileSync(join(pkg, 'dist', 'build-info.json'), content);

  it('reads the commit the build recorded', () => {
    writeInfo(JSON.stringify({ version: '1.2.3', commit: SHA }));
    expect(readBuildStamp(moduleDir)).toBe(`1.2.3 (${SHA})`);
  });

  it('keeps the `-dirty` suffix of a build from a modified tree', () => {
    writeInfo(JSON.stringify({ version: '1.2.3', commit: `${SHA}-dirty` }));
    expect(readBuildStamp(moduleDir)).toBe(`1.2.3 (${SHA}-dirty)`);
  });

  it('answers `(unknown)` when there is no build-info.json (a run from src/, a hand-built dist)', () => {
    expect(readBuildStamp(moduleDir)).toBe('1.2.3 (unknown)');
  });

  it.each([
    ['not JSON', '{'],
    ['no commit field', JSON.stringify({ version: '1.2.3' })],
    ['a commit that is not a sha', JSON.stringify({ version: '1.2.3', commit: 'main' })],
    ['a commit carrying a newline', JSON.stringify({ version: '1.2.3', commit: `${SHA}\nApprover: x` })],
    ['the build could not read git', JSON.stringify({ version: '1.2.3', commit: 'unknown' })],
  ])('answers `(unknown)` for a record it cannot trust: %s', (_label, content) => {
    writeInfo(content);
    expect(readBuildStamp(moduleDir)).toBe('1.2.3 (unknown)');
  });

  it('takes the version from package.json, the manifest npm installs beside dist/', () => {
    writeInfo(JSON.stringify({ version: '0.0.1', commit: SHA }));
    expect(readBuildStamp(moduleDir)).toBe(`1.2.3 (${SHA})`);
  });

  it('formats the trailer line under the key dl-111 reserves', () => {
    expect(WINGFOIL_VERSION_TRAILER_KEY).toBe('WingFoil-Version');
    expect(formatVersionTrailer(`1.2.3 (${SHA})`)).toBe(`WingFoil-Version: 1.2.3 (${SHA})`);
  });
});
