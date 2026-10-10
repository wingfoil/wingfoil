import { z } from 'zod';

import { emitUnknownFieldWarning, reportNotice, reportWarning, withDistinctWarnings, withNoticeSink, withWarningSink } from '../../src/validation/warning';

// spec-009 §2 — unknown-field warning policy. The diff MUST be raw-keys vs the schema's declared
// shape, never raw-vs-parsed: under .passthrough() the parsed object keeps every unknown key, so a
// raw-vs-parsed diff is always [] and the warning path is dead (the "known-defective mechanism").
describe('emitUnknownFieldWarning — passthrough unknown-field policy (spec-009 §2)', () => {
  let writes: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    writes = [];
    spy = jest.spyOn(process.stderr, 'write').mockImplementation((...args: unknown[]): boolean => {
      writes.push(String(args[0]));
      return true;
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('fires against genuinely unknown keys, diffing raw vs schema.shape', () => {
    const schema = z.object({ known: z.string() }).passthrough();
    const raw = { known: 'x', mysteryField: 'y', anotherUnknown: 1 };
    emitUnknownFieldWarning(raw, schema, 'cfg.yaml');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('mysteryField');
    expect(writes[0]).toContain('anotherUnknown');
    expect(writes[0]).toContain('cfg.yaml');
  });

  it('would be a no-op under the known-defective raw-vs-parsed diff, yet still warns', () => {
    const schema = z.object({ known: z.string() }).passthrough();
    const raw = { known: 'x', unknownKey: 'y' };
    // Demonstrate the trap concretely: .passthrough() copies unknownKey onto parsed, so the
    // defective `raw` vs `parsed` diff sees nothing to warn about.
    const parsed = schema.parse(raw) as Record<string, unknown>;
    const defectiveDiff = Object.keys(raw).filter((k) => !(k in parsed));
    expect(defectiveDiff).toEqual([]); // the WRONG mechanism is blind here
    // The correct mechanism (raw vs schema.shape) must still fire.
    emitUnknownFieldWarning(raw, schema, 'cfg.yaml');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('unknownKey');
  });

  it('stays silent when every raw key is declared in the schema shape', () => {
    const schema = z.object({ a: z.string(), b: z.number() }).passthrough();
    emitUnknownFieldWarning({ a: 'x', b: 1 }, schema, 'cfg.yaml');
    expect(writes).toHaveLength(0);
  });

  // spec-009 §2: "the same diff is applied recursively at each nesting level that itself has a
  // .passthrough() schema, so unknown fields inside nested config blocks are reported too, not
  // only at the document root." memory.yaml/dna.yaml/workflows.yaml all carry nested blocks, so a
  // root-only check would miss an unknown field buried inside one.
  it('recurses into a nested passthrough block and names the unknown field by its dotted path', () => {
    const nested = z.object({ known: z.string() }).passthrough();
    const schema = z.object({ block: nested }).passthrough();
    emitUnknownFieldWarning({ block: { known: 'x', mysteryNested: 'y' } }, schema, 'cfg.yaml');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('block.mysteryNested');
    // The bare key alone must not appear — only the path that locates the offending block.
    expect(writes[0]).not.toContain('unknown field(s) ignored: mysteryNested');
  });

  it('stays silent when a nested passthrough block contains only declared keys', () => {
    const nested = z.object({ known: z.string() }).passthrough();
    const schema = z.object({ block: nested }).passthrough();
    emitUnknownFieldWarning({ block: { known: 'x' } }, schema, 'cfg.yaml');
    expect(writes).toHaveLength(0);
  });

  // workflows.yaml's `phases:` is an array of nested passthrough phase objects — an unknown field
  // inside one phase must be reported with its array index in the path.
  it('recurses into an array of nested passthrough objects and reports the indexed path', () => {
    const phase = z.object({ name: z.string() }).passthrough();
    const schema = z.object({ phases: z.array(phase) }).passthrough();
    const raw = { phases: [{ name: 'a' }, { name: 'b', bogusStep: 1 }] };
    emitUnknownFieldWarning(raw, schema, 'workflows.yaml');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('phases[1].bogusStep');
    expect(writes[0]).toContain('workflows.yaml');
  });

  it('reports unknown fields at multiple nesting levels in a single warning', () => {
    const nested = z.object({ known: z.string() }).passthrough();
    const schema = z.object({ topKnown: z.string(), block: nested }).passthrough();
    const raw = { topKnown: 'x', topUnknown: 1, block: { known: 'y', deepUnknown: 2 } };
    emitUnknownFieldWarning(raw, schema, 'cfg.yaml');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('topUnknown');
    expect(writes[0]).toContain('block.deepUnknown');
  });
});

describe('withDistinctWarnings and the notice sink (task-228)', () => {
  let stderrSpy: jest.SpyInstance;
  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => stderrSpy.mockRestore());

  it('passes each distinct warning on once, rewritten, to the installed sink', () => {
    const seen: string[] = [];
    withWarningSink(
      (text) => seen.push(text),
      () =>
        withDistinctWarnings(
          () => {
            reportWarning('abc:x');
            reportWarning('abc:x');
            reportWarning('other');
          },
          (text) => text.replace('abc:', 'HEAD:'),
        ),
    );
    expect(seen).toEqual(['HEAD:x', 'other']);
  });

  it('outside any sink, a distinct warning is written to stderr once as `Warning: <text>`', () => {
    withDistinctWarnings(() => {
      reportWarning('twice');
      reportWarning('twice');
    });
    expect(stderrSpy.mock.calls.map((call) => call[0])).toEqual(['Warning: twice\n']);
  });

  it('a notice goes to its sink, or to stderr as a bare line', () => {
    const seen: string[] = [];
    withNoticeSink((text) => seen.push(text), () => reportNotice('banner'));
    expect(seen).toEqual(['banner']);
    reportNotice('bare');
    expect(stderrSpy.mock.calls.map((call) => call[0])).toEqual(['bare\n']);
  });
});
