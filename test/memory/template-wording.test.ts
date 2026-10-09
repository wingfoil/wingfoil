/**
 * task-209 — the Memory scaffolds tell the truth about `memory add` and `memory submit` (`bug-146`,
 * `dl-106` Action 3), and about the `supersedes:` trigger (`bug-219`).
 *
 * Two sets of scaffolds are checked, because both reach a reader:
 *
 * - the **built-in** ones `wingfoil init` writes into every new project (`templateScaffold`,
 *   `src/storage/templates.ts`), one per scaffolded type;
 * - **this repository's** ten, `.wingfoil/memory/templates/*.md`, the ones its own `memory add`
 *   copies.
 *
 * What `add` and `submit` actually do is `src/memory/add.ts` `renderAddDocument` (sets `id`, `title`,
 * `status`, and any `--tags` / `--set` value; the rest is copied verbatim) and
 * `src/memory/submit.ts` `renderSubmitDocument` (sets `status`, removes `rejection_reason`, and
 * nothing else): neither fills a field nor replaces a placeholder comment. The `supersedes:` trigger
 * (`src/core/memory-supersede.ts`) resolves the field as a full document id, and fires only on a type
 * whose machine has a `waiting` state leading to `superseded`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_TEMPLATE, resolveTemplate, templateScaffold } from '../../src/storage/templates';
import { splitFrontmatter } from '../../src/storage/frontmatter';

const REPO_TEMPLATES = join(__dirname, '..', '..', '.wingfoil', 'memory', 'templates');

const repoTemplates: [string, string][] = readdirSync(REPO_TEMPLATES)
  .filter((name) => name.endsWith('.md'))
  .sort()
  .map((name) => [name, readFileSync(join(REPO_TEMPLATES, name), 'utf-8')]);

const builtinTemplates: [string, string][] = templateScaffold(resolveTemplate(DEFAULT_TEMPLATE) as NonNullable<ReturnType<typeof resolveTemplate>>)
  .filter((file) => file.path.startsWith('.wingfoil/memory/templates/'))
  .map((file) => [file.path, file.content]);

/** The false promise `bug-146` reports, in any of the phrasings it was written in. */
const FALSE_PROMISE = /submit`?\s+replaces|fills\s+the\s+required\s+frontmatter|replaces\s+these\s+placeholder/;

/** The body's HTML comments, joined — the scaffold's own guidance to the author. */
function bodyComments(content: string): string {
  const { body } = splitFrontmatter(content);
  return [...body.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => (match[1] as string).replace(/\s+/g, ' ')).join('\n');
}

/** The sentence every scaffold carries, as one whitespace-normalized string. */
function expectTruthfulGuidance(content: string): void {
  const comments = bodyComments(content);
  expect(comments).not.toMatch(FALSE_PROMISE);
  // `add`: what it sets, and that the rest is copied.
  expect(comments).toContain('`wingfoil memory add` copies this scaffold, setting only `id`, `title` and `status`');
  // The author fills the fields and the body, before submitting.
  expect(comments).toContain('Fill the required frontmatter fields and replace these placeholder comments yourself');
  // `submit`: what it does, and what its commit declares.
  expect(comments).toContain(
    '`wingfoil memory submit` then checks the required fields, moves `status` forward and commits the document as you left it, naming in the commit body the content it carries',
  );
}

describe('the scaffolds say what `memory add` and `memory submit` do (task-209, bug-146)', () => {
  it('there are ten repository scaffolds and one built-in scaffold per scaffolded type', () => {
    expect(repoTemplates.map(([name]) => name)).toEqual([
      'adr.md',
      'bug.md',
      'change-proposal.md',
      'decision-log.md',
      'plan.md',
      'release-line.md',
      'release.md',
      'service.md',
      'task.md',
      'tech-spec.md',
    ]);
    expect(builtinTemplates.length).toBeGreaterThan(0);
  });

  it.each(repoTemplates)('this repository: %s', (_name, content) => {
    expectTruthfulGuidance(content);
  });

  it.each(builtinTemplates)('built-in (wingfoil init): %s', (_path, content) => {
    expectTruthfulGuidance(content);
  });
});

describe('the scaffolds tell the truth about `supersedes:` (task-209, bug-219)', () => {
  it.each(repoTemplates.filter(([name]) => name === 'adr.md' || name === 'tech-spec.md'))(
    'this repository: %s shows a full id, the form the trigger resolves',
    (_name, content) => {
      const line = content.split('\n').find((candidate) => candidate.startsWith('supersedes:')) as string;
      expect(line).toMatch(/e\.g\. "(adr|spec)-\d{3}-[a-z0-9-]+"/);
      expect(line).toContain('the full id');
    },
  );

  it.each(builtinTemplates.filter(([path]) => /\/(adr|tech-spec)\.md$/.test(path)))(
    'built-in (wingfoil init): %s says the starter project has neither the field nor the edge, and how to add both',
    (_path, content) => {
      expect(splitFrontmatter(content).frontmatter).not.toMatch(/^supersedes:/m);
      const comments = bodyComments(content);
      expect(comments).toContain('This starter scaffold has no `supersedes:` field, and the starter `memory.yaml` no `superseded` state');
      expect(comments).toContain('`waiting`');
      // review F3: the trigger fires only when an approve lands in the waiting state, so a gate precedes it.
      expect(comments).toContain('ends in a state listed in `gates`, then an approved state listed in `waiting`, then `superseded`');
      expect(comments).toContain('the trigger fires only when `memory approve` lands in that `waiting` state');
      expect(comments).toContain('the full id');
      expect(comments).toContain('`wingfoil memory deprecate`');
    },
  );

  it.each(builtinTemplates.filter(([path]) => !/\/(adr|tech-spec)\.md$/.test(path)))(
    'built-in (wingfoil init): %s does not mention `supersedes:`',
    (_path, content) => {
      expect(content).not.toContain('supersedes');
    },
  );
});
