/**
 * task-070-license-file (REQ-SYS-09, `spec-015` §1) — the MIT licence text the package claims.
 *
 * `package.json` declares `"license": "MIT"`, `README.md` §License and `dna.yaml` `project.license` say
 * MIT, yet before this task no `LICENSE` file existed — so the tarball carried the *claim* of a licence
 * and none of its text (found by `task-059`'s review). This file pins the three things that close that
 * gap:
 *
 * - **AC1** — a root `LICENSE` holds the full, unmodified MIT text with the approver-confirmed copyright
 *   line (`Copyright (c) 2026 Roberto Pompermaier`, confirmed by the approver on 2026-09-17).
 * - **AC2** — every place that names the licence names the same one.
 * - **AC3** — `npm pack` ships `LICENSE`. npm includes `LICENSE*` regardless of `files`, so the test also
 *   pins that `files` did not need editing to get there.
 *
 * Deterministic: the checks read committed files and `npm pack --dry-run`'s file selection, both pure
 * functions of the working tree. `--ignore-scripts` skips the `prepack` rebuild (`bug-022`): jest's
 * `globalSetup` has already built `dist/`, and rebuilding it here would race other workers.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withoutCallerNpmConfig } from './helpers/npm-env';

const REPO_ROOT = join(__dirname, '..', '..');
const LICENSE_PATH = join(REPO_ROOT, 'LICENSE');

/** The copyright line the approver confirmed (task-070 AC1) — asserted verbatim, never derived. */
const COPYRIGHT_LINE = 'Copyright (c) 2026 Roberto Pompermaier';

/** The operative MIT paragraphs (SPDX `MIT`), whitespace-normalised for comparison. */
const MIT_GRANT =
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and ' +
  'associated documentation files (the "Software"), to deal in the Software without restriction, ' +
  'including without limitation the rights to use, copy, modify, merge, publish, distribute, ' +
  'sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is ' +
  'furnished to do so, subject to the following conditions:';
const MIT_CONDITION =
  'The above copyright notice and this permission notice shall be included in all copies or ' +
  'substantial portions of the Software.';
const MIT_DISCLAIMER =
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT ' +
  'NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND ' +
  'NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, ' +
  'DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT ' +
  'OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.';

/** Collapses every whitespace run to one space so line wrapping in `LICENSE` is not significant. */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The `LICENSE` text, or `''` when the file is absent (so assertions fail with a readable diff). */
function licenseText(): string {
  return existsSync(LICENSE_PATH) ? readFileSync(LICENSE_PATH, 'utf-8') : '';
}

describe('LICENSE file (task-070) — AC1 full MIT text', () => {
  it('exists at the repository root', () => {
    expect(existsSync(LICENSE_PATH)).toBe(true);
  });

  it('is headed "MIT License" and carries the approver-confirmed copyright line', () => {
    const lines = licenseText().split('\n').map((l) => l.trim()).filter((l) => l !== '');
    expect(lines[0]).toBe('MIT License');
    expect(lines[1]).toBe(COPYRIGHT_LINE);
  });

  it('is exactly the MIT text — nothing added, removed or reordered', () => {
    // Equality, not containment: an extra restriction clause appended or slipped between paragraphs
    // would still *contain* all three MIT paragraphs, but it is no longer the MIT licence.
    const expected = normalise(
      ['MIT License', COPYRIGHT_LINE, MIT_GRANT, MIT_CONDITION, MIT_DISCLAIMER].join(' '),
    );
    expect(normalise(licenseText())).toBe(expected);
  });

  it('carries no placeholder left unfilled', () => {
    expect(licenseText()).not.toMatch(/\[(year|fullname|yyyy|name of copyright owner)\]|<year>|<owner>/i);
  });
});

describe('LICENSE file (task-070) — AC2 every licence claim agrees', () => {
  it('names the licence `package.json` declares', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { license?: string };
    expect(pkg.license).toBe('MIT');
    expect(licenseText().trimStart().startsWith(`${pkg.license} License`)).toBe(true);
  });

  it('matches the README §License section', () => {
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf-8');
    const section = /^## License\s*\n+([^\n]+)/m.exec(readme);
    expect(section?.[1]).toMatch(/^MIT\b/);
  });

  it('matches the `dna.yaml` project licence entry', () => {
    const dna = readFileSync(join(REPO_ROOT, '.wingfoil', 'dna.yaml'), 'utf-8');
    expect(dna).toMatch(/^ {2}license: MIT\s*$/m);
  });
});

describe('LICENSE file (task-070) — AC3 shipped in the tarball', () => {
  it('is packed by `npm pack` without being listed in `files`', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: withoutCallerNpmConfig(process.env),
    });
    const [result] = JSON.parse(raw) as { files: { path: string }[] }[];
    const paths = (result?.files ?? []).map((f) => f.path);
    expect(paths).toContain('LICENSE');

    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { files?: string[] };
    expect(pkg.files).not.toContain('LICENSE');
  });
});
