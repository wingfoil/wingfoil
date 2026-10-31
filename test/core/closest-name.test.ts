import { SUGGESTION_MAX_DISTANCE, closestName, levenshtein } from '../../src/core/closest-name';

describe('task-325 — the shared closest-name matcher (spec-008 §1)', () => {
  it('levenshtein counts insertions, deletions and substitutions', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('suggests the nearest candidate within the maximum distance', () => {
    expect(SUGGESTION_MAX_DISTANCE).toBe(2);
    expect(closestName('scrum-deliver', ['kanban-delivery', 'scrum-delivery'])).toBe('scrum-delivery');
  });

  it('suggests nothing when every candidate is farther than the maximum distance', () => {
    expect(closestName('ghost', ['scrum-delivery', 'sw-life-cycle'])).toBeUndefined();
  });

  it('never suggests the token itself and breaks a tie by code-unit order, whatever the candidate order', () => {
    expect(closestName('aaa', ['aac', 'aab'])).toBe('aab');
    expect(closestName('aaa', ['aab', 'aac'])).toBe('aab');
    expect(closestName('aab', ['aab'])).toBeUndefined();
  });
});
