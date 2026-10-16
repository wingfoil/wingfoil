/**
 * task-266 (`dl-159` Decision 6; approver ruling D4 (a)) — the developer's own edge cases of
 * `scripts/npm-dist-tag.cjs`, beside the red suite `npm-dist-tag.test.ts` (which leaves the case of a published
 * list holding only prereleases unpinned). Published prereleases are ignored when finding the highest version, so a
 * list of prereleases alone leaves nothing above the version: `latest`, with a message that says why.
 */
import { distTagFor } from '../../scripts/npm-dist-tag.cjs';

describe('distTagFor (task-266) — developer edge cases', () => {
  it('only prereleases published → latest, saying so', () => {
    expect(distTagFor('0.4.0', ['0.4.0-rc.1', '0.5.0-beta.2'])).toEqual({
      ok: true,
      distTag: 'latest',
      message: '0.4.0 is above every published version (only prereleases published): dist-tag latest (dl-159)',
    });
  });

  it('a version with build metadata is refused as not X.Y.Z, and a prerelease with build metadata as a prerelease', () => {
    expect(distTagFor('0.3.1+b1', [])).toEqual({ ok: false, message: '0.3.1+b1 is not a version of the form X.Y.Z' });
    expect(distTagFor('0.3.1-rc.1+b1', [])).toEqual({
      ok: false,
      message: '0.3.1-rc.1+b1 is a prerelease: only X.Y.Z versions are promoted (spec-015 §4)',
    });
  });

  it('a published entry that equals the version only as a prerelease does not count as already published', () => {
    const decision = distTagFor('0.4.0', ['0.3.0', '0.4.0-rc.1']);
    expect(decision.ok && decision.distTag).toBe('latest');
  });
});
