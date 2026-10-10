/**
 * task-229 refactor — edge paths of the three release scripts that `red`'s suites do not reach
 * (`changelog-section.test.ts`, `wait-npm-version.test.ts`, `service-verify-sweep.test.ts` are frozen, testing T4).
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { changelogSection } from '../../scripts/changelog-section.cjs';
import { serviceSweep } from '../../scripts/service-verify-sweep.cjs';

const SCRIPTS = join(__dirname, '..', '..', 'scripts');

describe('changelog-section edges (task-229)', () => {
  it('reads a CRLF changelog and takes the last section up to the end of the file', () => {
    expect(changelogSection('# C\r\n\r\n## [1.0.0]\r\n\r\n- a\r\n- b\r\n', '1.0.0')).toEqual({ ok: true, notes: '- a\n- b' });
  });

  it('refuses a second positional argument (exit 2)', () => {
    const result = spawnSync(process.execPath, [join(SCRIPTS, 'changelog-section.cjs'), '1.0.0', '2.0.0'], { encoding: 'utf-8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^error: unexpected argument 2\.0\.0/);
  });
});

describe('wait-npm-version edges (task-229)', () => {
  it('refuses a second positional argument (exit 2)', () => {
    const result = spawnSync(process.execPath, [join(SCRIPTS, 'wait-npm-version.cjs'), 'v1.0.0', 'v2.0.0'], { encoding: 'utf-8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^error: unexpected argument v2\.0\.0/);
  });
});

describe('service-verify-sweep edges (task-229)', () => {
  it('reports a status outside the service machine, and frontmatter that is not a mapping', () => {
    const result = serviceSweep([
      { path: 's/a.md', text: '---\nid: a\nstatus: retired\nverify: x\n---\n' },
      { path: 's/b.md', text: '---\n- a list\n---\n' },
    ]);
    expect(result.listed).toEqual([]);
    expect(result.problems).toEqual([
      's/a.md: service a has status "retired", not one of the service machine\'s',
      's/b.md: unreadable frontmatter (not a mapping)',
    ]);
  });
});
