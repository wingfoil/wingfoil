/**
 * task-059-publish-metadata (`dl-018` T1, `spec-015` §1, REQ-SYS-09) — publish-surface acceptance tests.
 *
 * `task-007` delivered *packability*: `npm pack` yields a valid tarball (asserted by the sibling
 * `npm-distribution.test.ts`). It did not deliver *publishability* — `package.json` carried no
 * `repository`/`author`/`homepage`/`bugs` and no `publishConfig`, so `npm publish` could not attribute
 * the package, and `adr-009`'s provenance/OIDC promote step had no `repository.url` to attest against.
 * `spec-015` §1 fixes that field set as the contract; this file is its executable form.
 *
 * Scope is deliberately narrow — **metadata only**. The publish *gate* and *pipeline* (`prepublishOnly`,
 * `publish:staging`, `.github/workflows/publish.yml`; `spec-015` §2–§4) belong to `task-060`, and the
 * registry token (`spec-015` §5) to `task-061`, so nothing here asserts a script, a workflow file, or a
 * credential. What it does assert, per the task's T1 classification:
 *
 * - **red-first** — the four attribution fields and the `publishConfig` triple, all absent before this task.
 * - **characterization** — the `files` allowlist (reviewed, verdict "unchanged"), the absence of an
 *   `.npmignore` (`spec-015` §1 makes `files` the single source, avoiding the `files`/`.npmignore`
 *   double-negative), and the packed manifest being *exactly* `dist` + docs. These already held on
 *   `main`; the tests pin them as regression guards rather than fabricate a failure.
 *
 * On the manifest check: `npm-distribution.test.ts` asserts *inclusion* (`dist/cli.js` and `README.md`
 * are there) and two spot exclusions. That is satisfiable by a tarball that also ships something it
 * should not, so this file tightens it to an **exhaustive allowlist** — every packed path must be
 * `dist/**`, `README.md`, `LICENSE` (npm packs it regardless of `files`; task-070), or `package.json`.
 * A package that leaked the project's own `.wingfoil/` or `docs/04_memory/` or dropped `dist/` fails here.
 *
 * Deterministic: both the parsed `package.json` and `npm pack --dry-run`'s file selection are pure
 * functions of the working tree — no clock, no network, no ordering assumptions (path sets are
 * compared as sorted arrays). `--ignore-scripts` skips the `prepack` rebuild, since jest's
 * `globalSetup` (`test/global-setup.cjs`) has already built `dist/` before any worker starts.
 *
 * `task-074-fix-engines-node-floor` (`bug-023`) later added the `engines.node` guard at the bottom of
 * this file — the same "metadata only" boundary, one field over. Its own header explains why it is
 * computed from the installed tree rather than pinned to a value.
 *
 * `task-115-package-discovery-metadata-and-server-json` (`dl-093`, `dl-091`) added the discovery
 * metadata (`description`, `keywords`, `mcpName`), the root `server.json` of the MCP Registry listing
 * (`spec-015` §1a), and — the one exception to "nothing here asserts a script" — the version-sync
 * cases of `checkReleaseTag` (`spec-015` §4), which `spec-015` pins in this file because they keep
 * metadata copies equal. That block sits just before the task-074 one.
 *
 * `task-157-add-glama-json-glama-directory-listing` (`dl-093`) added the root `glama.json` of the Glama
 * listing (`spec-015` §1b), asserted right after the `server.json` block.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { checkReleaseTag } from '../../scripts/check-release-tag.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const PKG_PATH = join(REPO_ROOT, 'package.json');

/** The single GitHub `owner/repo` all three attribution URLs must agree on (`spec-015` §1). */
const REPO_SLUG = 'wingfoil/wingfoil';

/** The `spec-015` §1 publish surface, as far as this task's assertions reach into it. */
interface PublishManifest {
  readonly version?: string;
  /** task-115: the discovery metadata of `spec-015` §1 (`dl-093` points 1–3). */
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly mcpName?: string;
  readonly repository?: { readonly type?: string; readonly url?: string };
  readonly author?: string;
  readonly homepage?: string;
  readonly bugs?: { readonly url?: string };
  readonly publishConfig?: {
    readonly registry?: string;
    readonly access?: string;
    readonly provenance?: boolean;
  };
  readonly files?: readonly string[];
  readonly bin?: Readonly<Record<string, string>>;
  readonly license?: string;
  /** task-074: the advertised runtime floor, and the closure it has to be true of. */
  readonly engines?: { readonly node?: string };
  readonly dependencies?: Readonly<Record<string, string>>;
}

interface PackedFile {
  readonly path: string;
}

interface PackResult {
  readonly files: readonly PackedFile[];
}

const rawPackageJson = readFileSync(PKG_PATH, 'utf-8');
const pkg = JSON.parse(rawPackageJson) as PublishManifest;

let cachedPackedPaths: readonly string[] | undefined;

/**
 * The exact paths `npm pack` would ship, via the same file selection `npm publish` uses.
 *
 * Memoized: the manifest is a pure function of the working tree, so every case in this file observes
 * the same tarball, and the (~1s) `npm pack` subprocess is spawned once rather than per assertion.
 */
function packedPaths(): readonly string[] {
  if (cachedPackedPaths === undefined) {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    const [result] = JSON.parse(raw) as PackResult[];
    cachedPackedPaths = (result?.files ?? []).map((f) => f.path);
  }
  return cachedPackedPaths;
}

describe('publish metadata (task-059) — spec-015 §1 attribution fields', () => {
  it('declares `repository` as a git URL pointing at the project repo', () => {
    expect(pkg.repository).toEqual({
      type: 'git',
      url: `git+https://github.com/${REPO_SLUG}.git`,
    });
  });

  it('declares `author` with the maintainer identity', () => {
    expect(pkg.author).toBe('Roberto Pompermaier <robypomper@gmail.com>');
  });

  it('declares `homepage` as the repo README URL', () => {
    expect(pkg.homepage).toBe(`https://github.com/${REPO_SLUG}#readme`);
  });

  it('declares `bugs` as the repo issue tracker', () => {
    expect(pkg.bugs).toEqual({ url: `https://github.com/${REPO_SLUG}/issues` });
  });

  it('points `repository`, `homepage` and `bugs` at one and the same repo', () => {
    // npm provenance (adr-009 step 4) attests the build against `repository.url`; three URLs drifting
    // apart is the failure mode that turns a cosmetic typo into a broken promote step.
    for (const url of [pkg.repository?.url, pkg.homepage, pkg.bugs?.url]) {
      expect(url).toContain(`github.com/${REPO_SLUG}`);
    }
  });
});

describe('publish metadata (task-059) — spec-015 §1 publishConfig', () => {
  it('targets the public npm registry with public access and provenance', () => {
    expect(pkg.publishConfig).toEqual({
      registry: 'https://registry.npmjs.org/',
      access: 'public',
      provenance: true,
    });
  });

  it('records only the prod registry — never a staging address or a credential (spec-015 §5)', () => {
    // §5's security boundary: non-secret prod config lives here in git; the Verdaccio staging address
    // is transient (`--registry` passed by `publish:staging`, task-060) and the auth token lives only
    // in the CI secret store (task-061). None of the three may leak into the committed manifest.
    expect(pkg.publishConfig?.registry).not.toContain('localhost');
    expect(rawPackageJson).not.toContain('_authToken');
    expect(rawPackageJson).not.toContain('NPM_TOKEN');
  });
});

describe('publish metadata (task-059) — shipped file surface', () => {
  it('keeps `files` as the reviewed allowlist', () => {
    expect(pkg.files).toEqual(['dist', 'README.md']);
  });

  it('has no `.npmignore` — `files` is the single source (spec-015 §1)', () => {
    expect(existsSync(join(REPO_ROOT, '.npmignore'))).toBe(false);
  });

  it('packs exactly `dist` + docs — nothing else reaches the tarball', () => {
    const unexpected = packedPaths()
      .filter((p) => !p.startsWith('dist/') && p !== 'README.md' && p !== 'LICENSE' && p !== 'package.json')
      .sort();
    expect(unexpected).toEqual([]);
  });

  it('still packs the bin entrypoint and the README the tarball is required to carry (REQ-SYS-09)', () => {
    const paths = packedPaths();
    expect(paths).toContain('dist/cli.js');
    expect(paths).toContain('README.md');
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * task-115-package-discovery-metadata-and-server-json (`dl-093`, `dl-091`, `spec-015` §1/§1a/§4) —
 * the discovery metadata, the MCP Registry `server.json`, and the check that keeps its versions equal.
 *
 * `server.json` is the input of the MCP Registry listing. The registry verifies npm ownership by
 * reading `mcpName` in the *published* `package.json`, which must equal `server.json` `name`; and a
 * published listing's metadata cannot be changed afterwards. So the three copies of the version
 * (`package.json`, `server.json`, each `packages[]` entry) are asserted equal by the gate that already
 * asserts the tag (`checkReleaseTag`, `dl-093` point 5 option (a)).
 *
 * The full shape of `server.json` is validated against the registry's published JSON schema at
 * review time and recorded in the task's Execution Notes: a test cannot fetch it offline, so this
 * block pins the fields the spec names, and the schema limit a shared `description` must respect.
 * ---------------------------------------------------------------------------------------------- */

const SERVER_JSON_PATH = join(REPO_ROOT, 'server.json');

/** `dl-091` Q2 (iii) — the MCP namespace, permanent once published. */
const MCP_NAME = 'io.github.wingfoil/wingfoil';

/** The MCP Registry schema's `description.maxLength` (server.schema.json 2025-12-11). */
const REGISTRY_DESCRIPTION_MAX = 100;

/** The subset of the MCP Registry `server.json` this block asserts. */
interface ServerJson {
  readonly $schema?: string;
  readonly name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly version?: string;
  readonly repository?: { readonly url?: string; readonly source?: string };
  readonly packages?: readonly {
    readonly registryType?: string;
    readonly identifier?: string;
    readonly version?: string;
    readonly transport?: { readonly type?: string };
    readonly packageArguments?: readonly { readonly type?: string; readonly value?: string }[];
  }[];
}

function readServerJson(): ServerJson {
  return JSON.parse(readFileSync(SERVER_JSON_PATH, 'utf-8')) as ServerJson;
}

describe('discovery metadata (task-115) — spec-015 §1', () => {
  it('declares `mcpName` as the dl-091 namespace', () => {
    expect(pkg.mcpName).toBe(MCP_NAME);
  });

  it('declares a one-line `description` that carries the display name', () => {
    const description = pkg.description ?? '';
    expect(description).toContain('WingFoil');
    expect(description).not.toMatch(/[\r\n]/);
    // The same string is `server.json` `description`, which the registry caps.
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(REGISTRY_DESCRIPTION_MAX);
  });

  it('carries at least the spec-015 §1 keywords', () => {
    const minimum = [
      'mcp',
      'model-context-protocol',
      'mcp-server',
      'ai-agents',
      'cli',
      'workflow',
      'governance',
      'spec-driven-development',
      'claude-code',
    ];
    expect(minimum.filter((k) => !(pkg.keywords ?? []).includes(k))).toEqual([]);
  });

  it('carries the visibility-session additions and no duplicate keyword', () => {
    const keywords = pkg.keywords ?? [];
    for (const k of ['intent-engineering', 'context-engineering', 'developer-tools']) {
      expect(keywords).toContain(k);
    }
    expect(new Set(keywords).size).toBe(keywords.length);
  });
});

describe('MCP Registry listing (task-115) — spec-015 §1a `server.json`', () => {
  it('exists at the repository root', () => {
    expect(existsSync(SERVER_JSON_PATH)).toBe(true);
  });

  it('names the server as `mcpName` and describes it as `package.json` does', () => {
    const server = readServerJson();
    expect(server.name).toBe(pkg.mcpName);
    expect(server.description).toBe(pkg.description);
    expect(server.$schema).toMatch(/^https:\/\/static\.modelcontextprotocol\.io\/schemas\/[\d-]+\/server\.schema\.json$/);
  });

  it('points at the same repository as `package.json`', () => {
    expect(readServerJson().repository).toEqual({
      url: `https://github.com/${REPO_SLUG}`,
      source: 'github',
    });
  });

  it('lists exactly one npm package, `wingfoil`, over stdio with the argument `mcp`', () => {
    expect(readServerJson().packages).toEqual([
      {
        registryType: 'npm',
        identifier: 'wingfoil',
        version: pkg.version,
        transport: { type: 'stdio' },
        packageArguments: [{ type: 'positional', value: 'mcp' }],
      },
    ]);
  });

  it('is not shipped in the tarball — it is the listing input, not package content', () => {
    expect(pkg.files ?? []).not.toContain('server.json');
    expect(packedPaths()).not.toContain('server.json');
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * task-157-add-glama-json-glama-directory-listing (`dl-093`, release-planning-rel-v0.3 R7,
 * `spec-015` §1b) — the root `glama.json` through which the maintainer claims the Glama listing.
 *
 * Glama lets the owner of a personal repository claim a listing by signing in with GitHub; a
 * repository owned by an organisation (`wingfoil/wingfoil`, svc-003) is claimed only through a
 * `glama.json` at the repository root naming the maintainers' GitHub usernames.
 *
 * The schema the file's `$schema` names is `https://glama.ai/mcp/schemas/server.json` (JSON Schema
 * draft-07). Read on 2026-10-05, it declares one property, `maintainers` — required, an array of
 * unique strings, each a GitHub username — and no `additionalProperties` restriction. A test cannot
 * fetch it offline, so this block re-states that schema's constraints, and pins the top-level keys to
 * `$schema` and `maintainers` so that no field the schema does not declare is invented here.
 * ---------------------------------------------------------------------------------------------- */

const GLAMA_JSON_PATH = join(REPO_ROOT, 'glama.json');

/** The `$id` of Glama's schema for `glama.json`, read 2026-10-05. */
const GLAMA_SCHEMA_URL = 'https://glama.ai/mcp/schemas/server.json';

/** The approver's GitHub account (svc-001: the organisation was created from it). */
const APPROVER_GITHUB_LOGIN = 'robypomper';

function readGlamaJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(GLAMA_JSON_PATH, 'utf-8')) as Record<string, unknown>;
}

describe('Glama listing (task-157) — spec-015 §1b `glama.json`', () => {
  it('exists at the repository root', () => {
    expect(existsSync(GLAMA_JSON_PATH)).toBe(true);
  });

  it('names Glama\'s schema and declares only the keys that schema knows', () => {
    const glama = readGlamaJson();
    expect(glama.$schema).toBe(GLAMA_SCHEMA_URL);
    expect(Object.keys(glama).sort()).toEqual(['$schema', 'maintainers']);
  });

  it('satisfies the schema: `maintainers` is a required array of unique strings', () => {
    const maintainers = readGlamaJson().maintainers;
    expect(Array.isArray(maintainers)).toBe(true);
    const list = maintainers as unknown[];
    expect(list.every((m) => typeof m === 'string' && m.length > 0)).toBe(true);
    expect(new Set(list).size).toBe(list.length);
  });

  it('names the approver\'s GitHub account as the maintainer', () => {
    expect(readGlamaJson().maintainers).toEqual([APPROVER_GITHUB_LOGIN]);
  });

  it('is not shipped in the tarball — it is the listing claim, not package content', () => {
    expect(pkg.files).toEqual(['dist', 'README.md']);
    expect(packedPaths()).not.toContain('glama.json');
  });
});

describe('version sync (task-115) — spec-015 §4 `checkReleaseTag` over `server.json`', () => {
  const synced = { version: '0.2.2', packages: [{ version: '0.2.2' }] };

  it('accepts a tag and a `server.json` that both equal the package version', () => {
    const result = checkReleaseTag('v0.2.2', '0.2.2', synced);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('server.json');
  });

  it.each<[string, unknown]>([
    ['server.json `version` differs', { version: '0.2.1', packages: [{ version: '0.2.2' }] }],
    ['server.json `version` missing', { packages: [{ version: '0.2.2' }] }],
    ['the only package `version` differs', { version: '0.2.2', packages: [{ version: '0.2.1' }] }],
    ['a package `version` is missing', { version: '0.2.2', packages: [{}] }],
    [
      'one of several package versions differs',
      { version: '0.2.2', packages: [{ version: '0.2.2' }, { version: '0.2.0' }] },
    ],
    ['`packages` is empty', { version: '0.2.2', packages: [] }],
    ['`packages` is missing', { version: '0.2.2' }],
    ['`packages` is not an array', { version: '0.2.2', packages: { version: '0.2.2' } }],
    ['no server.json was read', undefined],
  ])('rejects when %s', (_case, server) => {
    const result = checkReleaseTag('v0.2.2', '0.2.2', server as Parameters<typeof checkReleaseTag>[2]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('server.json');
  });

  it('still rejects a tag mismatch even when `server.json` is in sync', () => {
    expect(checkReleaseTag('v0.2.1', '0.2.2', synced).ok).toBe(false);
  });

  it('passes on this repository: the gate step reads the real `server.json`', () => {
    // The same invocation `.github/workflows/publish.yml`'s gate job runs, with the tag it expects.
    const run = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'check-release-tag.cjs'), `v${pkg.version ?? ''}`], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('server.json');
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * task-074-fix-engines-node-floor (`bug-023`, `spec-015` §1, REQ-SYS-09) — the declared
 * `engines.node` floor, checked against what the dependency tree actually accepts.
 *
 * `bug-023`: `package.json` declared `engines.node >=18.0.0` while the installed `commander@15`
 * declares `>=22.12.0`, so the published manifest promised a runtime its own dependencies reject.
 * npm's behaviour on such a package (measured in task-074's Execution Notes) is to warn `EBADENGINE`
 * and install anyway by default, and to hard-fail only under `engine-strict=true` — i.e. a false
 * floor is not caught by installing, which is why it survived `task-059` and would survive
 * `task-060`'s staging smoke, since that smoke runs on CI's Node >= 22.
 *
 * The guard is therefore *computed from the installed tree*, never hard-coded: naming the offending
 * package would pass the day a different dependency raises its own floor. It walks the **production**
 * closure — `dependencies`, transitively — because `files: ["dist", "README.md"]` means that is
 * exactly what a consumer of `wingfoil` installs, and `engines` is a promise about that closure.
 * devDependencies are deliberately out of scope: they never reach a consumer.
 *
 * Range arithmetic is done here rather than with `semver`. `require('semver')` resolves to 6.3.1 in
 * this tree (no `subset`); semver 7 exists only nested under devDependencies, as a hoisting accident;
 * and declaring the dependency would mean editing `package-lock.json` beyond the engines mirror this
 * task already owns — moving resolutions, which is out of scope here. The
 * evaluator below covers the comparator forms npm `engines` ranges actually use and **throws on
 * anything it does not understand**, so an unreadable range fails the suite instead of being quietly
 * treated as satisfied. It has its own unit tests at the bottom of this file.
 *
 * Deterministic and side-effect free: pure reads of the root manifest and of each installed package's
 * own `package.json`; no clock, no network, results sorted by package name. In particular it spawns
 * **no** subprocess, so it adds no new instance of `bug-022` (`npm pack` without `--ignore-scripts`);
 * the `packedPaths()` helper above, which does pack, is untouched and already passes that flag.
 * ---------------------------------------------------------------------------------------------- */

/** A fully-resolved `major.minor.patch` triple. */
type Version = readonly [number, number, number];

/** A version as written inside a range — 1 to 3 declared parts (`18`, `18.14`, `22.12.0`). */
type VersionParts = readonly number[];

/** One package reached by walking the production dependency closure. */
interface ClosureEntry {
  readonly name: string;
  readonly version: string;
  /** The package's own `engines.node` range, or `undefined` when it declares none. */
  readonly enginesNode: string | undefined;
}

/** The shape of any `package.json` this guard reads out of `node_modules`. */
interface InstalledManifest {
  readonly name?: string;
  readonly version?: string;
  readonly engines?: { readonly node?: string };
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/** Parse `18`, `18.14` or `22.12.0` into its 1–3 declared parts. Throws on anything else. */
function parseVersionParts(raw: string): VersionParts {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(raw);
  if (match === null) throw new Error(`unsupported version literal in engines range: "${raw}"`);
  return [match[1], match[2], match[3]]
    .filter((part): part is string => part !== undefined)
    .map((part) => Number(part));
}

/** Widen declared parts to a full triple, filling the unspecified tail with zeros. */
function toVersion(parts: VersionParts): Version {
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** Exclusive upper bound of a bare/`=` X-range: `18` -> `19.0.0`, `18.14` -> `18.15.0`. */
function nextAfterParts(parts: VersionParts): Version {
  if (parts.length === 1) return [(parts[0] ?? 0) + 1, 0, 0];
  if (parts.length === 2) return [parts[0] ?? 0, (parts[1] ?? 0) + 1, 0];
  const exact = toVersion(parts);
  return [exact[0], exact[1], exact[2] + 1];
}

/** Exclusive upper bound of a `^` range — the next release allowed to break compatibility. */
function caretUpperBound(parts: VersionParts): Version {
  const [major = 0, minor = 0, patch = 0] = parts;
  if (major > 0 || parts.length === 1) return [major + 1, 0, 0];
  if (minor > 0 || parts.length === 2) return [0, minor + 1, 0];
  return [0, 0, patch + 1];
}

/** Exclusive upper bound of a `~` range — the next minor, or the next major when only one part. */
function tildeUpperBound(parts: VersionParts): Version {
  const [major = 0, minor = 0] = parts;
  if (parts.length === 1) return [major + 1, 0, 0];
  return [major, minor + 1, 0];
}

/** Does one comparator (`>=22.12.0`, `^20.19.0`, `>= 0.4`, `*`) admit `candidate`? */
function comparatorAllows(operator: string, literal: string, candidate: Version): boolean {
  if (literal === '*' || literal === 'x' || literal === 'X') {
    if (operator !== '') throw new Error(`unsupported engines comparator: "${operator}${literal}"`);
    return true;
  }
  const parts = parseVersionParts(literal);
  const lower = toVersion(parts);
  switch (operator) {
    case '>=':
      return compareVersions(candidate, lower) >= 0;
    case '>':
      return parts.length === 3
        ? compareVersions(candidate, lower) > 0
        : compareVersions(candidate, nextAfterParts(parts)) >= 0;
    case '<':
      return compareVersions(candidate, lower) < 0;
    case '<=':
      return parts.length === 3
        ? compareVersions(candidate, lower) <= 0
        : compareVersions(candidate, nextAfterParts(parts)) < 0;
    case '^':
      return (
        compareVersions(candidate, lower) >= 0 &&
        compareVersions(candidate, caretUpperBound(parts)) < 0
      );
    case '~':
      return (
        compareVersions(candidate, lower) >= 0 &&
        compareVersions(candidate, tildeUpperBound(parts)) < 0
      );
    case '':
    case '=':
      return (
        compareVersions(candidate, lower) >= 0 &&
        compareVersions(candidate, nextAfterParts(parts)) < 0
      );
    default:
      throw new Error(`unsupported engines comparator: "${operator}${literal}"`);
  }
}

/** One comparator of an `engines.node` range: an operator (possibly empty) and its version literal. */
interface Comparator {
  readonly operator: string;
  readonly literal: string;
}

/**
 * Split an npm `engines.node` range into its `||` alternatives, each a list of comparators.
 *
 * Supports whitespace-separated comparators, the `>= > <= < =` and `^ ~` operators (with or without a
 * space before the literal), partial X-ranges and `*`. Everything else — hyphen ranges, prereleases,
 * build metadata — throws, by design: see the header note. An empty range is one empty alternative.
 */
function parseRangeClauses(range: string): readonly (readonly Comparator[])[] {
  const trimmed = range.trim();
  if (trimmed === '') return [[]];
  if (/\s-\s/.test(trimmed)) throw new Error(`unsupported engines range (hyphen): "${range}"`);
  return trimmed.split('||').map((clause) => {
    const comparatorPattern = /(\^|~|>=|<=|>|<|=)?\s*(\d+(?:\.\d+){0,2}|[*xX])/g;
    const comparators: Comparator[] = [];
    let consumedTo = 0;
    for (const match of clause.matchAll(comparatorPattern)) {
      const at = match.index ?? 0;
      if (clause.slice(consumedTo, at).trim() !== '') {
        throw new Error(`unsupported engines range syntax: "${range}"`);
      }
      consumedTo = at + (match[0] ?? '').length;
      comparators.push({ operator: match[1] ?? '', literal: match[2] ?? '' });
    }
    if (clause.slice(consumedTo).trim() !== '') {
      throw new Error(`unsupported engines range syntax: "${range}"`);
    }
    if (comparators.length === 0) throw new Error(`unsupported engines range syntax: "${range}"`);
    return comparators;
  });
}

/**
 * Does every comparator of one `||` alternative admit `candidate`? Every comparator is evaluated (no
 * short-circuit), so an unsupported one throws even when an earlier one already rejected `candidate`.
 */
function clauseAllows(clause: readonly Comparator[], candidate: Version): boolean {
  return clause
    .map(({ operator, literal }) => comparatorAllows(operator, literal, candidate))
    .every(Boolean);
}

/**
 * Does an npm `engines.node` range admit `candidate`? Grammar: see `parseRangeClauses`. The whole
 * range is parsed before any alternative is evaluated, so unsupported syntax anywhere in it throws.
 */
function rangeAllows(range: string, candidate: Version): boolean {
  return parseRangeClauses(range)
    .map((clause) => clauseAllows(clause, candidate))
    .some(Boolean);
}

/** The lowest version one comparator admits, ignoring any upper bound it also sets. */
function comparatorLowerBound(operator: string, literal: string): Version {
  if (literal === '*' || literal === 'x' || literal === 'X') return [0, 0, 0];
  const parts = parseVersionParts(literal);
  switch (operator) {
    case '>':
      return parts.length === 3 ? [parts[0] ?? 0, parts[1] ?? 0, (parts[2] ?? 0) + 1] : nextAfterParts(parts);
    case '<':
    case '<=':
      return [0, 0, 0];
    default:
      return toVersion(parts);
  }
}

/** The lower bound of every comparator in a range, in order of appearance. */
function comparatorLowerBounds(range: string): readonly Version[] {
  return parseRangeClauses(range).flatMap((clause) =>
    clause.map(({ operator, literal }) => comparatorLowerBound(operator, literal)),
  );
}

/**
 * task-155 (`bug-047`, review fix): the lowest version **every** range admits — the least element of
 * the intersection of `ranges`, not the highest of each range's own minimum. The two differ on a gapped
 * range: `>=22.12.0` with `^20.19.0 || ^22.13.0 || >=24` gives 22.13.0, which max-of-minimums (22.12.0)
 * would miss, leaving no floor that both the satisfies guard and the equality guard accept.
 *
 * The intersection is a union of intervals, and each interval starts at some comparator's lower bound
 * (or at 0.0.0), so the answer is the smallest such candidate every range admits. An empty
 * intersection throws instead of yielding a floor no dependency set accepts.
 */
function closureFloor(ranges: readonly string[]): Version {
  const candidates = [[0, 0, 0] as Version, ...ranges.flatMap(comparatorLowerBounds)].sort(compareVersions);
  const floor = candidates.find((candidate) => ranges.every((range) => rangeAllows(range, candidate)));
  if (floor === undefined) {
    throw new Error(`no version every engines range admits: ${JSON.stringify(ranges)}`);
  }
  return floor;
}

/**
 * The single lowest Node version this package claims to run on.
 *
 * Deliberately narrow: only a plain `>=major.minor.patch` is accepted, so "the floor" is a
 * well-defined number rather than something inferred from a compound range. A maintainer who needs a
 * compound `engines.node` has to teach this guard what the advertised floor then means, instead of
 * silently weakening it.
 */
function parseNodeFloor(declared: string | undefined): Version {
  const match = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(declared ?? '');
  if (match === null) {
    throw new Error(
      `engines.node must be a plain ">=major.minor.patch" floor; found ${JSON.stringify(declared)}`,
    );
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Locate a package's manifest the way Node resolves it: `node_modules` upwards, bounded at the repo root. */
function resolveInstalledManifest(name: string, fromDir: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) return candidate;
    if (dir === REPO_ROOT) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

let cachedClosure: readonly ClosureEntry[] | undefined;

/**
 * Every package a consumer of `wingfoil` installs: the transitive closure of `dependencies` over the
 * installed tree, sorted by name. An unresolvable non-optional dependency is an error rather than a
 * silent gap — a guard that skips what it cannot find is a guard that passes for the wrong reason.
 */
function productionClosure(): readonly ClosureEntry[] {
  if (cachedClosure !== undefined) return cachedClosure;
  const entries: ClosureEntry[] = [];
  const visited = new Set<string>();
  const queue: { readonly name: string; readonly fromDir: string; readonly optional: boolean }[] =
    Object.keys(pkg.dependencies ?? {}).map((name) => ({
      name,
      fromDir: REPO_ROOT,
      optional: false,
    }));

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const item = queue[cursor];
    if (item === undefined) continue;
    const manifestPath = resolveInstalledManifest(item.name, item.fromDir);
    if (manifestPath === undefined) {
      if (item.optional) continue;
      throw new Error(
        `production dependency "${item.name}" is not installed (resolved from ${item.fromDir}) — ` +
          'install dependencies before running this suite',
      );
    }
    if (visited.has(manifestPath)) continue;
    visited.add(manifestPath);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as InstalledManifest;
    entries.push({
      name: manifest.name ?? item.name,
      version: manifest.version ?? 'unknown',
      enginesNode: manifest.engines?.node,
    });
    const ownDir = dirname(manifestPath);
    const optionalNames = new Set(Object.keys(manifest.optionalDependencies ?? {}));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      queue.push({ name: dependency, fromDir: ownDir, optional: optionalNames.has(dependency) });
    }
  }

  cachedClosure = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  return cachedClosure;
}

describe('publish surface (task-074) — `engines.node` vs the production dependency closure', () => {
  it('declares `engines.node` as a plain `>=major.minor.patch` floor (bug-023)', () => {
    expect(pkg.engines?.node).toMatch(/^>=\d+\.\d+\.\d+$/);
  });

  it('declares a floor every production dependency accepts (bug-023, REQ-SYS-09)', () => {
    const floor = parseNodeFloor(pkg.engines?.node);
    const rejected = productionClosure()
      .filter((entry) => entry.enginesNode !== undefined)
      .filter((entry) => !rangeAllows(entry.enginesNode ?? '', floor))
      .map((entry) => `${entry.name}@${entry.version} requires node ${entry.enginesNode ?? ''}`);
    // A non-empty list means the published manifest promises a Node version some dependency refuses:
    // npm warns EBADENGINE on install and hard-fails under `engine-strict=true`.
    expect(rejected).toEqual([]);
  });

  it('really walks the tree — the guard cannot pass by finding nothing', () => {
    // Without this, a broken walk (wrong root, or unresolved deps quietly skipped) would make the
    // check above vacuously green — the failure mode a "no violations" assertion cannot see alone.
    const closure = productionClosure();
    expect(closure.map((entry) => entry.name)).toContain('commander');
    expect(closure.filter((entry) => entry.enginesNode !== undefined).length).toBeGreaterThan(10);
  });
});

describe('publish surface (task-074) — the engines-range evaluator itself', () => {
  const rangeCases: [string, Version, boolean][] = [
    ['>=18', [22, 12, 0], true],
    ['>=22.12.0', [22, 12, 0], true],
    ['>=22.12.0', [22, 11, 9], false],
    ['>= 0.4', [22, 12, 0], true],
    ['>=18.14.1', [18, 14, 0], false],
    ['>18', [19, 0, 0], true],
    ['>18', [18, 20, 0], false],
    ['<24', [22, 12, 0], true],
    ['<=18', [18, 99, 0], true],
    ['^22.13.0', [22, 12, 0], false],
    ['^22.13.0', [22, 13, 0], true],
    ['^20.19.0 || ^22.13.0 || >=24', [22, 12, 0], false],
    ['^20.19.0 || ^22.13.0 || >=24', [24, 0, 0], true],
    ['^18.14.0 || ^20.0.0 || ^22.0.0 || >=24.0.0', [22, 12, 0], true],
    ['^0.4.2', [0, 4, 9], true],
    ['^0.4.2', [0, 5, 0], false],
    ['~22.12', [22, 12, 9], true],
    ['~22.12', [22, 13, 0], false],
    ['>=18 <23', [22, 12, 0], true],
    ['>=18 <23', [23, 0, 0], false],
    ['*', [22, 12, 0], true],
    ['22.12.0', [22, 12, 0], true],
    ['22', [22, 12, 0], true],
  ];

  it.each(rangeCases)('reads "%s" against %j as %s', (range, candidate, expected) => {
    expect(rangeAllows(range, candidate)).toBe(expected);
  });

  it.each([['1.2.3 - 2.0.0'], ['>=18.0.0-beta'], ['>=nonsense'], ['^^18'], ['>=*']])(
    'refuses "%s" rather than treating it as satisfied',
    (range) => {
      expect(() => rangeAllows(range, [22, 12, 0])).toThrow(/unsupported/);
    },
  );

  it.each([['^20 || >=22'], ['>=18'], ['18.0.0'], [undefined]])(
    'refuses %j as an advertised floor — it is not a single `>=major.minor.patch`',
    (declared) => {
      expect(() => parseNodeFloor(declared)).toThrow(/plain ">=major\.minor\.patch" floor/);
    },
  );

  it('reads a well-formed floor', () => {
    expect(parseNodeFloor('>=22.12.0')).toEqual([22, 12, 0]);
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * task-155-assert-lockfile-root-engines-equals-package-json-floor (`bug-046`, `bug-047`,
 * `spec-015` §1) — the two blind spots of the `engines.node` guard above.
 *
 * `bug-046`: `package-lock.json` carries its own copy of the root manifest (`packages[""]`), and
 * `npm ci` never compares it with `package.json` — measured in the bug for `engines`, and in its
 * 2026-09-22 addendum for the dependency ranges too. So a manifest edit that forgets the lock merges
 * green. The guard below asserts the whole mirror, `engines` first among it.
 *
 * `bug-047`: the guard above asserts only that the floor is *satisfied by* every production
 * dependency, so an over-tight floor (`>=24.0.0`, or `>=22.13.0`, which even the `@types/node`
 * major pin of `types-node-floor.test.ts` cannot see) passes. `spec-015` §1 says the floor "must
 * equal" the highest `engines.node` floor in the production closure, recomputed from the installed
 * tree; the equality half below is that sentence made executable. "The highest floor" is read as
 * the lowest version **every** production dependency admits — the least element of the intersection
 * of their ranges (`closureFloor`). For plain `>=` ranges that is their maximum; with a gapped range
 * (`^20.19.0 || ^22.13.0 || >=24`) it can sit above every range's own minimum, and only this reading
 * leaves a floor that the satisfies guard above and the equality guard below both accept.
 *
 * Same determinism as the block above: pure reads of `package.json`, `package-lock.json` and the
 * installed manifests; no network, no subprocess; comparisons are key-order-insensitive.
 * ---------------------------------------------------------------------------------------------- */

const LOCK_PATH = join(REPO_ROOT, 'package-lock.json');

/** A JSON object read from `package.json` or the lockfile root, as untyped data. */
type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * The manifest fields npm copies into the lockfile root (`packages[""]`). A field listed here that the
 * manifest declares must appear in the root with the same value, so a mirror that *dropped* it is
 * caught as well as one that changed it. npm may normalize some of them in the lock root (`bin`
 * paths, `funding` shape), so a new mismatch on those may be npm's rewrite rather than a stale mirror.
 */
const LOCK_ROOT_MIRRORED_FIELDS: readonly string[] = [
  'bin',
  'cpu',
  'dependencies',
  'devDependencies',
  'engines',
  'funding',
  'license',
  'name',
  'optionalDependencies',
  'os',
  'peerDependencies',
  'peerDependenciesMeta',
  'version',
  'workspaces',
];

/** Lockfile-root keys npm computes rather than copies — no manifest counterpart to compare with. */
const LOCK_ROOT_COMPUTED_FIELDS: ReadonlySet<string> = new Set(['hasInstallScript']);

/** The parsed `package.json`, as untyped data for the field-by-field mirror comparison. */
function rawManifest(): JsonRecord {
  return JSON.parse(rawPackageJson) as JsonRecord;
}

/** The lockfile's root entry, `packages[""]`. Throws when the lockfile has none (lockfileVersion < 2). */
function readLockRoot(lockPath: string): JsonRecord {
  const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as {
    readonly packages?: Readonly<Record<string, JsonRecord>>;
  };
  const root = lock.packages?.[''];
  if (root === undefined) throw new Error(`${lockPath} has no packages[""] root entry`);
  return root;
}

/** JSON with object keys sorted at every depth, so equality does not depend on key order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as JsonRecord;
    const body = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * task-155 (`bug-046`): the fields on which the lockfile root disagrees with the manifest, sorted.
 * Compared: every key the root carries (bar the computed ones) plus every mirrored field the manifest
 * declares. An empty list means the mirror is exact.
 */
function lockRootMirrorDrift(manifest: JsonRecord, root: JsonRecord): readonly string[] {
  const keys = new Set<string>([
    ...Object.keys(root).filter((key) => !LOCK_ROOT_COMPUTED_FIELDS.has(key)),
    ...LOCK_ROOT_MIRRORED_FIELDS.filter((key) => key in manifest),
  ]);
  return [...keys].filter((key) => canonicalJson(manifest[key]) !== canonicalJson(root[key])).sort();
}

function formatVersion(version: Version): string {
  return version.join('.');
}

/**
 * task-155 (`bug-047`, `spec-015` §1): why `declared` is not the floor of `closure`, or `undefined`
 * when it is. The floor is `closureFloor` over every entry that declares `engines.node`; the message
 * names the entries whose ranges have a comparator starting exactly there — the ones that set it.
 */
function floorEqualityViolation(
  declared: string | undefined,
  closure: readonly ClosureEntry[],
): string | undefined {
  const floor = parseNodeFloor(declared);
  const declaring = closure.filter((entry) => entry.enginesNode !== undefined);
  if (declaring.length === 0) throw new Error('the production closure declares no engines.node at all');
  const expected = closureFloor(declaring.map((entry) => entry.enginesNode ?? ''));
  const order = compareVersions(floor, expected);
  if (order === 0) return undefined;
  const holders = declaring
    .filter((entry) =>
      comparatorLowerBounds(entry.enginesNode ?? '').some((bound) => compareVersions(bound, expected) === 0),
    )
    .map((entry) => `${entry.name}@${entry.version}`)
    .join(', ');
  return (
    `engines.node ${declared ?? ''} is ${order > 0 ? 'above' : 'below'} the production closure's floor, ` +
    `the lowest version every dependency admits: ${formatVersion(expected)} (${holders})`
  );
}

describe('publish surface (task-155) — the lockfile root mirrors package.json (bug-046)', () => {
  const lockRoot = readLockRoot(LOCK_PATH);

  it('declares in the lockfile root exactly the `engines` package.json declares', () => {
    expect(lockRoot['engines']).toBeDefined();
    expect(lockRoot['engines']).toEqual(pkg.engines);
  });

  it('mirrors every manifest field the lockfile root carries — dependency ranges included', () => {
    expect(lockRootMirrorDrift(rawManifest(), lockRoot)).toEqual([]);
  });

  it('reports a lockfile root `engines` edited to differ', () => {
    const manifest = { name: 'x', version: '1.0.0', engines: { node: '>=22.12.0' } };
    const root = { name: 'x', version: '1.0.0', engines: { node: '>=18.0.0' } };
    expect(lockRootMirrorDrift(manifest, root)).toEqual(['engines']);
  });

  it('reports a lockfile root that dropped `engines` the manifest declares', () => {
    const manifest = { name: 'x', version: '1.0.0', engines: { node: '>=22.12.0' } };
    const root = { name: 'x', version: '1.0.0' };
    expect(lockRootMirrorDrift(manifest, root)).toEqual(['engines']);
  });

  it('reports a dependency range that drifted in the mirror only (bug-046 addendum)', () => {
    const manifest = { name: 'x', devDependencies: { '@types/node': '^22.20.4', jest: '^30.0.0' } };
    const root = { name: 'x', devDependencies: { '@types/node': '^18.19.130', jest: '^30.0.0' } };
    expect(lockRootMirrorDrift(manifest, root)).toEqual(['devDependencies']);
  });

  it('ignores key order and the lock-only `hasInstallScript` flag', () => {
    const manifest = { name: 'x', dependencies: { a: '^1.0.0', b: '^2.0.0' } };
    const root = { name: 'x', dependencies: { b: '^2.0.0', a: '^1.0.0' }, hasInstallScript: true };
    expect(lockRootMirrorDrift(manifest, root)).toEqual([]);
  });
});

describe('publish surface (task-155) — the floor equals the closure floor (bug-047)', () => {
  const closureFixture: readonly ClosureEntry[] = [
    { name: 'a', version: '1.0.0', enginesNode: '>=18.14.1' },
    { name: 'b', version: '1.0.0', enginesNode: '>=22.12.0' },
    { name: 'c', version: '1.0.0', enginesNode: '^18.14.0 || ^20.0.0 || ^22.0.0 || >=24.0.0' },
    { name: 'd', version: '1.0.0', enginesNode: undefined },
  ];

  /** A gapped range above the plain maximum: the shape eslint@10 declares (publish.yml header). */
  const gappedFixture: readonly ClosureEntry[] = [
    { name: 'a', version: '1.0.0', enginesNode: '>=18.14.1' },
    { name: 'b', version: '1.0.0', enginesNode: '>=22.12.0' },
    { name: 'c', version: '1.0.0', enginesNode: '^20.19.0 || ^22.13.0 || >=24' },
  ];

  it('declares exactly the floor of the production closure (spec-015 §1)', () => {
    expect(floorEqualityViolation(pkg.engines?.node, productionClosure())).toBeUndefined();
  });

  it.each([['>=24.0.0'], ['>=22.13.0'], ['>=22.12.1']])(
    'fails an over-tight floor %s, above the closure floor',
    (declared) => {
      expect(floorEqualityViolation(declared, closureFixture)).toMatch(/above .*22\.12\.0 \(b@1\.0\.0\)/);
    },
  );

  it('fails a floor below the closure floor too — equality, not a one-sided bound', () => {
    expect(floorEqualityViolation('>=18.14.1', closureFixture)).toMatch(/below/);
  });

  it('accepts the floor that equals the closure floor', () => {
    expect(floorEqualityViolation('>=22.12.0', closureFixture)).toBeUndefined();
  });

  it('takes the lowest version EVERY range admits, so a gapped range lifts the floor past the highest minimum', () => {
    // Max-of-minimums would say 22.12.0, which `c` rejects (it skips 21.x and 22.0–22.12): the
    // satisfies guard and the equality guard could then never both pass. 22.13.0 is the answer.
    expect(floorEqualityViolation('>=22.13.0', gappedFixture)).toBeUndefined();
    expect(floorEqualityViolation('>=22.12.0', gappedFixture)).toMatch(/below .*22\.13\.0 \(c@1\.0\.0\)/);
    expect(gappedFixture.every((entry) => rangeAllows(entry.enginesNode ?? '', [22, 13, 0]))).toBe(true);
  });

  it('refuses to compute a floor from a closure that declares none', () => {
    expect(() =>
      floorEqualityViolation('>=22.12.0', [{ name: 'a', version: '1.0.0', enginesNode: undefined }]),
    ).toThrow(/declares no engines\.node/);
  });

  const floorCases: [readonly string[], Version][] = [
    [['>=22.12.0'], [22, 12, 0]],
    [['>= 0.4', '>=18'], [18, 0, 0]],
    [['>18'], [19, 0, 0]],
    [['>18.1.2'], [18, 1, 3]],
    [['^20.19.0 || ^22.13.0 || >=24'], [20, 19, 0]],
    [['>=22.12.0', '^20.19.0 || ^22.13.0 || >=24'], [22, 13, 0]],
    [['>=23.0.0', '^20.19.0 || ^22.13.0 || >=24'], [24, 0, 0]],
    [['>=18 <23', '~22.12'], [22, 12, 0]],
    [['<24'], [0, 0, 0]],
    [['*'], [0, 0, 0]],
    [['22'], [22, 0, 0]],
  ];

  it.each(floorCases)('reads the lowest version every range of %j admits as %j', (ranges, expected) => {
    expect(closureFloor(ranges)).toEqual(expected);
  });

  it.each([[['>=24 <22']], [['>=24', '<22']]])(
    'refuses %j, whose intersection is empty, rather than inventing a floor',
    (ranges) => {
      expect(() => closureFloor(ranges)).toThrow(/no version every engines range admits/);
    },
  );
});
