/**
 * task-375 (developer, green): the edges of `errorDetails`' rule for every `details` key (`spec-005` §3.1, `bug-303`)
 * that the red suite `test/core/error-details-keys.test.ts` does not reach — an `unreadable` entry that is issue-shaped
 * or empty, and a labelled (or undeclared) key whose value is `undefined`, an empty string, or an array that is not all
 * strings.
 */
import { errorDetails } from '../../src/core/error-details';
import { coreErr } from '../../src/core/types';

function refusal(details: Record<string, unknown>, message = 'refused') {
  const result = coreErr({ code: 'VALIDATION', message, details });
  if (result.ok) throw new Error('expected a refusal');
  return result.error;
}

describe('errorDetails — the edges of the details rule (task-375, spec-005 §3.1)', () => {
  it('an issue-shaped unreadable entry is read as an issue; an empty string adds nothing', () => {
    const details = { unreadable: ['', { file: 'docs/a.md', detail: 'bad frontmatter' }, { file: 'docs/b.md' }, 7] };
    expect(errorDetails(refusal(details, 'refused (docs/b.md)'))).toEqual([{ file: 'docs/a.md', detail: 'bad frontmatter' }]);
  });

  it('a labelled key holding undefined or an empty string adds nothing', () => {
    expect(errorDetails(refusal({ file: '', frontier: undefined, zeta: '' }))).toEqual([]);
  });

  it('an array that is not all strings is compact JSON', () => {
    expect(errorDetails(refusal({ argv: ['claude', 2] }))).toEqual([{ detail: 'argv: ["claude",2]' }]);
  });

  it('an error with no details renders nothing', () => {
    const result = coreErr({ code: 'VALIDATION', message: 'refused' });
    if (result.ok) throw new Error('expected a refusal');
    expect(errorDetails(result.error)).toEqual([]);
  });
});
