/**
 * task-317 (`bug-247`): `spec-007` §2 and `SECRET_PATTERNS` (`src/validation/secret-scan.ts`) state the
 * same ten rules. `secret-scan.ts` declares that each `RegExp` is a mechanical translation of the spec's
 * YAML `regex:` string; this suite reads the real spec, applies exactly that translation, and requires
 * the sources and flags to be equal, together with the ids (in order), descriptions and severities.
 *
 * The translation modelled (`translate`), and nothing more:
 * 1. a leading `(?i)` becomes the `i` flag; `(?im)` too, the `m` dropped (the scan runs one line at a
 *    time, so `^` and `$` anchor to that line either way);
 * 2. a `(?-i:X)` group becomes `X` inline, and then every literal letter outside it, outside a `[...]`
 *    class and not after a `\`, is case-folded to `[Xx]` with no `i` flag (`caseless`, `bug-228`);
 * 3. any other inline modifier (`(?` followed by a letter or `-`), or a `(?-i:` group without a leading
 *    `(?i)`, throws `unmodelled inline modifier`: a spec edit the translation does not model fails loudly.
 *
 * Both sources are compared with `\/` normalized to `/`: the two are the same pattern in a RegExp
 * without the `u` flag, and V8 writes `/` as `\/` in a `source` (`new RegExp('[/]a/b').source` is
 * `[/]a\/b`). Characterization: the two agree today. It holds no secret-shaped literal (dl-122 S1).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { load } from 'js-yaml';

import { SECRET_PATTERNS } from '../../src/validation/secret-scan';

const REPO_ROOT = join(__dirname, '..', '..');
const SPEC = join(REPO_ROOT, 'docs', '04_memory', 'design', 'specs', 'spec-007-secret-hygiene-patterns.md');

interface SpecPattern {
  readonly id: string;
  readonly description: string;
  readonly severity: string;
  readonly regex: string;
}

/** The `patterns` of the first `yaml` fence between `### 2. Pattern set` and `### 3.` in spec-007. */
function specPatterns(): SpecPattern[] {
  const text = readFileSync(SPEC, 'utf-8');
  const start = text.indexOf('### 2. Pattern set');
  const end = text.indexOf('\n### 3.', start);
  if (start === -1 || end === -1) throw new Error('spec-007: §2 or §3 heading not found');
  const fence = /```yaml\n([\s\S]*?)\n```/.exec(text.slice(start, end));
  if (fence === null) throw new Error('spec-007 §2: no yaml fence');
  const document = load(fence[1] as string) as { patterns: SpecPattern[] };
  return document.patterns;
}

function unmodelled(spec: string): Error {
  return new Error(`unmodelled inline modifier in ${spec}`);
}

/** spec-007's YAML regex string as the `{ source, flags }` of the RegExp `secret-scan.ts` builds from it. */
function translate(spec: string): { source: string; flags: string } {
  let body = spec;
  const lead = /^\(\?(im|i)\)/.exec(body);
  if (lead !== null) body = body.slice(lead[0].length);
  const caseInsensitive = lead !== null;
  const hasCaseSensitiveGroup = body.includes('(?-i:');
  if (hasCaseSensitiveGroup && !caseInsensitive) throw unmodelled(spec);
  const fold = caseInsensitive && hasCaseSensitiveGroup;
  let out = '';
  let inClass = false;
  const groups: ('case-sensitive' | 'plain')[] = [];
  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index] as string;
    if (ch === '\\') {
      out += ch + (body[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      out += ch;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      out += ch;
      continue;
    }
    if (ch === '(') {
      if (body.startsWith('(?-i:', index)) {
        groups.push('case-sensitive');
        index += '(?-i:'.length - 1;
        continue;
      }
      if (body[index + 1] === '?' && /[A-Za-z-]/.test(body[index + 2] ?? '')) throw unmodelled(spec);
      groups.push('plain');
      out += ch;
      continue;
    }
    if (ch === ')') {
      if (groups.pop() !== 'case-sensitive') out += ch;
      continue;
    }
    if (fold && !groups.includes('case-sensitive') && /[A-Za-z]/.test(ch)) {
      out += `[${ch.toUpperCase()}${ch.toLowerCase()}]`;
      continue;
    }
    out += ch;
  }
  return { source: out, flags: caseInsensitive && !fold ? 'i' : '' };
}

function normalize(source: string): string {
  return source.split('\\/').join('/');
}

function comparable(value: { source: string; flags: string }): { source: string; flags: string } {
  return { source: normalize(value.source), flags: value.flags };
}

describe('spec-007 §2 and SECRET_PATTERNS state the same rules (bug-247, task-317)', () => {
  const spec = specPatterns();

  it('lists the same pattern ids, in the same order', () => {
    expect(spec.map((pattern) => pattern.id)).toEqual(SECRET_PATTERNS.map((pattern) => pattern.id));
  });

  describe.each(SECRET_PATTERNS.map((pattern) => [pattern.id, pattern] as const))('%s', (id, pattern) => {
    const entry = spec.find((candidate) => candidate.id === id);

    it('is in spec-007 §2 with the same description and severity', () => {
      expect(entry).toBeDefined();
      expect({ description: entry?.description, severity: entry?.severity }).toEqual({
        description: pattern.description,
        severity: pattern.severity,
      });
    });

    it("compiles the spec's regex: equal source and flags after the declared translation", () => {
      expect(comparable(translate((entry as SpecPattern).regex))).toEqual(
        comparable({ source: pattern.regex.source, flags: pattern.regex.flags }),
      );
    });
  });

  describe('the translation', () => {
    it('moves a leading (?i) to the i flag and keeps escapes', () => {
      expect(translate('(?i)ab\\sc')).toEqual({ source: 'ab\\sc', flags: 'i' });
    });

    it('moves a leading (?im) to the i flag, dropping the m', () => {
      expect(translate('(?im)^ab')).toEqual({ source: '^ab', flags: 'i' });
    });

    it('inlines a (?-i:...) group and case-folds the letters outside it and outside classes, with no flag', () => {
      expect(translate('(?i)(ab)(?-i:[a-z]+)x')).toEqual({ source: '([Aa][Bb])[a-z]+[Xx]', flags: '' });
    });

    it('throws on an inline modifier it does not model', () => {
      expect(() => translate('(?s)x')).toThrow(/unmodelled inline modifier/);
      expect(() => translate('(?-i:x)')).toThrow(/unmodelled inline modifier/);
    });
  });

  it('can fail: a one-character drift of a spec string is not equal to its pattern', () => {
    const entry = spec.find((candidate) => candidate.id === 'generic-api-key-assignment') as SpecPattern;
    const pattern = SECRET_PATTERNS.find((candidate) => candidate.id === 'generic-api-key-assignment');
    expect(entry.regex).toContain('{16,}');
    const drifted = entry.regex.replace('{16,}', '{15,}');
    expect(comparable(translate(drifted))).not.toEqual(
      comparable({ source: pattern?.regex.source ?? '', flags: pattern?.regex.flags ?? '' }),
    );
  });
});
