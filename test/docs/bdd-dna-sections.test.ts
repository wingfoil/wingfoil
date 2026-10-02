/**
 * BDD ↔ schema parity for the DNA sections (task-159, bug-105 / bug-106).
 *
 * `spec-002-dna-yaml-schema` (v1.1) removed `conventions` from `dna.yaml` and replaced the fixed
 * `tech_stack` object with `stacks`. Two acceptance steps kept asserting the retired shape, latent
 * because nothing executes `.feature` files (bug-106), and four user stories plus the narrative lines
 * transcribing them kept describing it (bug-105). This test pins the corrected contracts to the real
 * `DnaYaml` schema, so a later schema change that renames a section fails here rather than leaving
 * the acceptance contract silently stale:
 *
 * - the section-list steps of `P2.4-project-dna-config.feature` (scenario 1) and
 *   `P2.2-dna-show.feature` (scenario 1) quote exactly the schema's required top-level sections
 *   (`version` is a format field, not a section);
 * - no `p2-dna` feature, and none of the four stories they transcribe, names `conventions`.
 *
 * `tech_stack` is deliberately NOT checked: `dna show tech_stack` is a pinned read-side alias for
 * `stacks` (spec-002 Consequences; `test/core/dna-show.test.ts`), and `P2.1`'s refusal scenario names
 * it on purpose.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DnaYaml } from '../../src/dna/schema';

const repoRoot = join(__dirname, '..', '..');
const featuresDir = join(repoRoot, 'docs', '02_requirements', '02_bdd', 'features', 'p2-dna');
const storyMapPath = join(repoRoot, 'docs', '02_requirements', '01_user_story_map', '01_init-migrate.md');

/** The schema's required top-level keys other than the `version` format field, sorted. */
function requiredSections(): string[] {
  return Object.entries(DnaYaml.shape)
    .filter(([key, field]) => key !== 'version' && !field.isOptional())
    .map(([key]) => key)
    .sort();
}

/** The quoted names of the one step in `feature` that matches `stepPattern`, sorted. */
function quotedSectionsOfStep(feature: string, stepPattern: RegExp): string[] {
  const lines = readFileSync(join(featuresDir, feature), 'utf8')
    .split('\n')
    .filter((line) => stepPattern.test(line));
  expect(lines).toHaveLength(1);
  return [...lines[0].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
}

/** The text of the user story `storyId` in the story map, from its bullet to the next bullet or heading. */
function story(storyId: string): string {
  const text = readFileSync(storyMapPath, 'utf8');
  const start = text.indexOf(`${storyId}:`);
  expect(start).toBeGreaterThan(-1);
  const rest = text.slice(start);
  const end = rest.search(/\n(\* \*\*\[|#)/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('DNA sections named by the P2 acceptance contracts match the DnaYaml schema', () => {
  it('the schema declares at least one required section to compare against', () => {
    expect(requiredSections().length).toBeGreaterThan(0);
  });

  it('P2.4 scenario 1 quotes exactly the required sections', () => {
    expect(quotedSectionsOfStep('P2.4-project-dna-config.feature', /declares the sections/)).toEqual(
      requiredSections(),
    );
  });

  it('P2.2 scenario 1 quotes exactly the required sections', () => {
    expect(quotedSectionsOfStep('P2.2-dna-show.feature', /output includes the sections/)).toEqual(
      requiredSections(),
    );
  });

  it('no p2-dna feature names the retired `conventions` section', () => {
    const offending = readdirSync(featuresDir)
      .filter((name) => name.endsWith('.feature'))
      .sort()
      .filter((name) => /\bconventions\b/i.test(readFileSync(join(featuresDir, name), 'utf8')));
    expect(offending).toEqual([]);
  });

  it.each(['US-0A-05', 'US-0A-08', 'US-0B-03', 'US-0B-E1'])(
    '%s does not describe the DNA with the retired `conventions` section',
    (storyId) => {
      expect(story(storyId)).not.toMatch(/\bconventions\b/i);
    },
  );
});
