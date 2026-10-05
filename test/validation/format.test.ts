/**
 * task-251 (`dl-149`) — the `format:` key's shared pieces in `src/validation/format.ts`: one constant per
 * file kind, declared beside `ADAPTER_MANIFEST_FORMAT` (`task-177`), the Zod field every kind's schema
 * declares, and the loader pre-check that refuses a newer format with an actionable error.
 */
import { z } from 'zod';

import { ADAPTER_MANIFEST_FORMAT as AGENT_EXPORT } from '../../src/agent';
import {
  ADAPTER_MANIFEST_FORMAT,
  DIRECTIVE_FORMAT,
  DNA_YAML_FORMAT,
  E_INVALID_FORMAT,
  MEMORY_TEMPLATE_FORMAT,
  MEMORY_YAML_FORMAT,
  ROLES_YAML_FORMAT,
  WORKFLOW_FORMAT,
  WORKFLOWS_YAML_FORMAT,
  formatField,
  newerFormatIssue,
  refuseNewerFormat,
} from '../../src/validation/format';
import { EXIT_VALIDATION, ValidationError } from '../../src/validation';

describe('AC 5 — one format constant per file kind, beside ADAPTER_MANIFEST_FORMAT, all 1', () => {
  it.each([
    ['dna.yaml', DNA_YAML_FORMAT],
    ['memory.yaml', MEMORY_YAML_FORMAT],
    ['roles.yaml', ROLES_YAML_FORMAT],
    ['workflows.yaml', WORKFLOWS_YAML_FORMAT],
    ['a workflow file', WORKFLOW_FORMAT],
    ['directive frontmatter', DIRECTIVE_FORMAT],
    ['Memory template frontmatter', MEMORY_TEMPLATE_FORMAT],
    ['agent adapter manifest', ADAPTER_MANIFEST_FORMAT],
  ])('%s reads format 1 in this release', (_kind, format) => {
    expect(format).toBe(1);
  });

  it('ADAPTER_MANIFEST_FORMAT is declared once: src/agent re-exports the same constant', () => {
    expect(AGENT_EXPORT).toBe(ADAPTER_MANIFEST_FORMAT);
  });
});

describe('formatField — the optional integer every kind declares', () => {
  const schema = z.object({ format: formatField(1) });

  it.each([[{}], [{ format: 1 }]])('accepts %p', (value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each([[0], [-1], [1.5], ['1'], [null]])('refuses format %p on the `format` path', (format) => {
    const result = schema.safeParse({ format });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((issue) => issue.path.join('.'))).toEqual(['format']);
  });

  it('a newer format fails with the "upgrade WingFoil" message (the backstop for parses outside a loader)', () => {
    const result = schema.safeParse({ format: 3 });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('this file is written in format 3; this WingFoil reads up to format 1: upgrade WingFoil');
  });
});

describe('newerFormatIssue / refuseNewerFormat — the loader pre-check', () => {
  it.each([[{}], [{ format: 1 }], [{ format: 1.5 }], [{ format: 0 }], [{ format: '2' }], [null], [[1, 2]], ['text']])(
    'leaves %p to the structural pass',
    (data) => {
      expect(newerFormatIssue(data, 1, 'x.yaml')).toBeNull();
      expect(() => refuseNewerFormat(data, 1, 'x.yaml')).not.toThrow();
    },
  );

  it('names the file, the format, the highest supported one and "upgrade WingFoil", at exit 1', () => {
    expect(newerFormatIssue({ format: 2 }, 1, '.wingfoil/dna.yaml')).toEqual({
      code: E_INVALID_FORMAT,
      path: 'format',
      file: '.wingfoil/dna.yaml',
      message: 'this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil',
    });
    let thrown: unknown;
    try {
      refuseNewerFormat({ format: 2 }, 1, '.wingfoil/dna.yaml');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    const error = thrown as ValidationError;
    expect(error.exitCode).toBe(EXIT_VALIDATION);
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe(
      'E_INVALID_FORMAT format (.wingfoil/dna.yaml): this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil',
    );
  });
});
