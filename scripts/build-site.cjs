#!/usr/bin/env node
/**
 * dl-129 §2 Q2 (b) and §3 Q3 (b) (task-234) — the documentation site and its `llms.txt`, both from ONE declared
 * list, `docs/site.yaml`:
 *
 *   - `assembleSite` copies the declared Markdown pages and directories to the same relative paths in an output
 *     directory, rewrites each relative link whose target is not in the site to the repository at the built commit,
 *     and writes `llms.txt` and a fixed `_config.yml` there. `.github/workflows/pages.yml` then adds TypeDoc's HTML
 *     under `api/` and renders the Markdown with GitHub's Jekyll builder.
 *   - `renderLlmsTxt` renders the index (llmstxt.org shape: `# title`, `> summary`, `## section`, `- [title](url):
 *     about`) with absolute URLs under `package.json` `homepage`, so the same bytes are right at the repository root
 *     and at the site root.
 *   - `checkSiteManifest` lists what is wrong with the declaration (a listed path that does not exist, an index
 *     entry that is not part of the site, an unknown npm script, a page Jekyll's Liquid would rewrite);
 *     `test/docs/llms-txt.test.ts` requires it to be empty on this repository (dl-116).
 *
 * Deterministic: no clock, no randomness, directory walks sorted. Requires only node: built-ins and js-yaml (dl-010).
 *
 * Usage (from the repository root, or with --root <dir>):
 *   node scripts/build-site.cjs llms              write llms.txt at the root
 *   node scripts/build-site.cjs llms --check      exit 1 when llms.txt differs from its render
 *   node scripts/build-site.cjs site --out <dir> --ref <commit>
 * Exit codes (spec-008): 0 done; 1 a problem in the declaration, a stale llms.txt or an unusable output directory;
 * 2 a usage error.
 */
'use strict';

const { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { dirname, join, posix } = require('node:path');

const { dump: yamlDump, load: yamlLoad } = require('js-yaml');

const MANIFEST = 'docs/site.yaml';

/**
 * Strings of a YAML list, or a thrown error naming the key.
 *
 * @param {unknown} value
 * @param {string} key
 * @returns {string[]}
 */
function stringList(value, key) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`${MANIFEST}: \`${key}\` must be a list of paths`);
  }
  return value;
}

/**
 * Parse `<root>/docs/site.yaml`; throws when it is missing or not of the declared shape.
 *
 * @param {string} root
 */
function readSiteManifest(root) {
  const raw = yamlLoad(readFileSync(join(root, MANIFEST), 'utf-8'));
  if (raw === null || typeof raw !== 'object') throw new Error(`${MANIFEST}: not a mapping`);
  if (typeof raw.title !== 'string' || typeof raw.summary !== 'string') {
    throw new Error(`${MANIFEST}: \`title\` and \`summary\` must be strings`);
  }
  const llms = raw.llms === undefined ? [] : raw.llms;
  if (!Array.isArray(llms)) throw new Error(`${MANIFEST}: \`llms\` must be a list of sections`);
  return {
    title: raw.title,
    summary: raw.summary,
    pages: stringList(raw.pages, 'pages'),
    files: stringList(raw.files, 'files'),
    llms: llms.map((section) => {
      if (section === null || typeof section !== 'object' || typeof section.section !== 'string') {
        throw new Error(`${MANIFEST}: every \`llms\` section needs a \`section\` name`);
      }
      const entries = section.entries === undefined ? [] : section.entries;
      if (!Array.isArray(entries)) throw new Error(`${MANIFEST}: \`entries\` of ${section.section} must be a list`);
      return {
        section: section.section,
        entries: entries.map((entry) => {
          if (entry === null || typeof entry !== 'object' || typeof entry.title !== 'string' || typeof entry.about !== 'string') {
            throw new Error(`${MANIFEST}: every entry of ${section.section} needs a \`title\` and an \`about\``);
          }
          return {
            title: entry.title,
            about: entry.about,
            path: typeof entry.path === 'string' ? entry.path : undefined,
            site_path: typeof entry.site_path === 'string' ? entry.site_path : undefined,
            built_by: typeof entry.built_by === 'string' ? entry.built_by : undefined,
          };
        }),
      };
    }),
  };
}

/**
 * Every file under `dir` (repository-relative, POSIX separators), sorted.
 *
 * @param {string} root
 * @param {string} dir
 * @returns {string[]}
 */
function walk(root, dir) {
  const base = dir.replace(/\/+$/, '');
  const out = [];
  for (const name of readdirSync(join(root, base)).sort()) {
    const rel = `${base}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(root, rel));
    else out.push(rel);
  }
  return out;
}

/** @param {string} root @param {string} rel */
function isFile(root, rel) {
  return existsSync(join(root, rel)) && statSync(join(root, rel)).isFile();
}

/** @param {string} root @param {string} rel */
function isDirectory(root, rel) {
  return existsSync(join(root, rel)) && statSync(join(root, rel)).isDirectory();
}

/**
 * The repository files the site carries: the pages, then every file under each declared directory; sorted, unique.
 * Paths that do not exist are left out (checkSiteManifest reports them).
 *
 * @param {string} root
 * @param {{ pages: string[], files: string[] }} manifest
 * @returns {string[]}
 */
function siteFiles(root, manifest) {
  const found = new Set(manifest.pages.filter((p) => isFile(root, p)));
  for (const dir of manifest.files) if (isDirectory(root, dir)) for (const f of walk(root, dir)) found.add(f);
  return [...found].sort();
}

/** A Liquid opener, which Jekyll evaluates in every Markdown page it renders. */
const LIQUID = /\{\{|\{%/;

/**
 * The problems of the declaration, one line each, sorted and unique; `[]` when it is sound.
 *
 * @param {string} root
 * @param {ReturnType<typeof readSiteManifest>} manifest
 * @param {Readonly<Record<string, string>>} scripts  package.json `scripts`
 * @returns {string[]}
 */
function checkSiteManifest(root, manifest, scripts) {
  const problems = new Set();
  for (const page of manifest.pages) if (!isFile(root, page)) problems.add(`${MANIFEST}: listed path does not exist: ${page}`);
  for (const dir of manifest.files) if (!isDirectory(root, dir)) problems.add(`${MANIFEST}: listed path does not exist: ${dir}`);

  const inSite = new Set(siteFiles(root, manifest));
  for (const file of inSite) {
    if (file.endsWith('.md') && LIQUID.test(readFileSync(join(root, file), 'utf-8'))) {
      problems.add(`${MANIFEST}: page contains a Liquid tag, which Jekyll would evaluate: ${file}`);
    }
  }

  for (const section of manifest.llms) {
    for (const entry of section.entries) {
      if (entry.path !== undefined) {
        if (!isFile(root, entry.path)) problems.add(`${MANIFEST}: listed path does not exist: ${entry.path}`);
        else if (!inSite.has(entry.path)) problems.add(`${MANIFEST}: llms entry is not part of the site: ${entry.path}`);
      } else if (entry.site_path !== undefined) {
        if (entry.built_by === undefined || !Object.prototype.hasOwnProperty.call(scripts, entry.built_by)) {
          problems.add(`${MANIFEST}: unknown npm script: ${entry.built_by ?? ''}`);
        }
      } else {
        problems.add(`${MANIFEST}: llms entry has neither path nor site_path: ${entry.title}`);
      }
    }
  }
  return [...problems].sort();
}

/**
 * The llms.txt text: `# title`, `> summary`, then one `## section` per declared section with one line per entry,
 * its URL `homepage` + the entry's `path` or `site_path`. Ends with exactly one newline.
 *
 * @param {ReturnType<typeof readSiteManifest>} manifest
 * @param {string} homepage
 * @returns {string}
 */
function renderLlmsTxt(manifest, homepage) {
  const lines = [`# ${manifest.title}`, '', `> ${manifest.summary}`];
  for (const section of manifest.llms) {
    lines.push('', `## ${section.section}`, '');
    for (const entry of section.entries) {
      lines.push(`- [${entry.title}](${homepage}${entry.path ?? entry.site_path ?? ''}): ${entry.about}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * `repository.url` of package.json as a browsable URL: `git+https://github.com/o/r.git` → `https://github.com/o/r`.
 *
 * @param {{ repository?: { url?: string } | string }} pkg
 * @returns {string}
 */
function repositoryWebUrl(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
  return url.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/+$/, '');
}

/**
 * One link target as the site copy of `page` must carry it: unchanged when it is absolute, an anchor, outside the
 * repository or part of the site; otherwise the repository's view of it at `ref`.
 *
 * @param {string} target
 * @param {string} page  repository-relative path of the page holding the link
 * @param {{ root: string, inSite: Set<string>, siteDirs: Set<string>, repository: string, ref: string }} ctx
 * @returns {string}
 */
function siteLink(target, page, ctx) {
  if (target === '' || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) return target;
  const cut = target.search(/[?#]/);
  const pathPart = cut === -1 ? target : target.slice(0, cut);
  const suffix = cut === -1 ? '' : target.slice(cut);
  const resolved = posix.normalize(posix.join(posix.dirname(page), pathPart)).replace(/\/+$/, '');
  if (resolved === '..' || resolved.startsWith('../')) return target;
  if (ctx.inSite.has(resolved) || ctx.siteDirs.has(resolved)) return target;
  if (isFile(ctx.root, resolved)) return `${ctx.repository}/blob/${ctx.ref}/${resolved}${suffix}`;
  if (isDirectory(ctx.root, resolved)) {
    return `${ctx.repository}/tree/${ctx.ref}/${resolved === '.' ? '' : `${resolved}/`}${suffix}`;
  }
  return target;
}

/**
 * The site copy of a Markdown page: every relative `](target)`, `src="target"` and `href="target"` outside fenced
 * code blocks passes through {@link siteLink}.
 *
 * @param {string} text
 * @param {string} page
 * @param {Parameters<typeof siteLink>[2]} ctx
 * @returns {string}
 */
function rewriteLinks(text, page, ctx) {
  let fenced = false;
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return line
        .replace(/\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (_m, target, title) => `](${siteLink(target, page, ctx)}${title})`)
        .replace(/\b(src|href)="([^"]+)"/g, (_m, attr, target) => `${attr}="${siteLink(target, page, ctx)}"`);
    })
    .join('\n');
}

/**
 * Assemble the site's sources into `outDir`, which must not exist or be empty: the declared pages and directories
 * at their repository paths (Markdown links rewritten, see {@link rewriteLinks}), `llms.txt` and `_config.yml`.
 * Throws on a problem in the declaration or a non-empty `outDir`.
 *
 * @param {string} root
 * @param {string} outDir
 * @param {{ ref: string }} options  the commit the out-of-site links point at
 * @returns {{ files: string[] }}  the written paths, relative to `outDir`, sorted
 */
function assembleSite(root, outDir, options) {
  if (existsSync(outDir) && readdirSync(outDir).length > 0) throw new Error(`output directory is not empty: ${outDir}`);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  const manifest = readSiteManifest(root);
  const problems = checkSiteManifest(root, manifest, pkg.scripts ?? {});
  if (problems.length > 0) throw new Error(problems.join('\n'));

  const files = siteFiles(root, manifest);
  const inSite = new Set(files);
  const siteDirs = new Set();
  for (const file of files) {
    const base = posix.basename(file);
    if (base === 'README.md' || base === 'index.md') siteDirs.add(posix.dirname(file));
  }
  const ctx = { root, inSite, siteDirs, repository: repositoryWebUrl(pkg), ref: options.ref };

  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    const target = join(outDir, file);
    mkdirSync(dirname(target), { recursive: true });
    if (file.endsWith('.md')) writeFileSync(target, rewriteLinks(readFileSync(join(root, file), 'utf-8'), file, ctx));
    else copyFileSync(join(root, file), target);
  }
  writeFileSync(join(outDir, 'llms.txt'), renderLlmsTxt(manifest, pkg.homepage ?? ''));
  writeFileSync(join(outDir, '_config.yml'), yamlDump({ title: manifest.title, description: manifest.summary }, { lineWidth: -1 }));
  return { files: [...files, '_config.yml', 'llms.txt'].sort() };
}

/**
 * The CLI; returns the exit code.
 *
 * @param {string[]} argv
 * @returns {number}
 */
function main(argv) {
  const [command, ...rest] = argv;
  /** @type {Record<string, string | true>} */
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--check') options.check = true;
    else if ((arg === '--root' || arg === '--out' || arg === '--ref') && rest[i + 1] !== undefined) options[arg.slice(2)] = rest[++i];
    else {
      process.stderr.write(`build-site: unknown or incomplete option: ${arg}\n`);
      return 2;
    }
  }
  const root = typeof options.root === 'string' ? options.root : process.cwd();

  if (command === 'llms') {
    let manifest;
    let pkg;
    try {
      manifest = readSiteManifest(root);
      pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    } catch (error) {
      process.stderr.write(`build-site: ${error.message}\n`);
      return 1;
    }
    const problems = checkSiteManifest(root, manifest, pkg.scripts ?? {});
    if (problems.length > 0) {
      process.stderr.write(`${problems.join('\n')}\n`);
      return 1;
    }
    const text = renderLlmsTxt(manifest, pkg.homepage ?? '');
    const path = join(root, 'llms.txt');
    if (options.check === true) {
      if (!existsSync(path) || readFileSync(path, 'utf-8') !== text) {
        process.stderr.write(`build-site: llms.txt differs from its render from ${MANIFEST}; run: node scripts/build-site.cjs llms\n`);
        return 1;
      }
      process.stdout.write('build-site: llms.txt is current\n');
      return 0;
    }
    writeFileSync(path, text);
    process.stdout.write('build-site: wrote llms.txt\n');
    return 0;
  }

  if (command === 'site') {
    if (typeof options.out !== 'string' || typeof options.ref !== 'string' || options.check === true) {
      process.stderr.write('build-site: usage: build-site.cjs site --out <dir> --ref <commit> [--root <dir>]\n');
      return 2;
    }
    try {
      const { files } = assembleSite(root, options.out, { ref: options.ref });
      process.stdout.write(`build-site: assembled ${files.length} files in ${options.out}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`build-site: ${error.message}\n`);
      return 1;
    }
  }

  process.stderr.write('build-site: usage: build-site.cjs llms [--check] | site --out <dir> --ref <commit>  [--root <dir>]\n');
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { assembleSite, checkSiteManifest, main, readSiteManifest, renderLlmsTxt };
