/**
 * Community health files, shaped for ingestion (`task-214-add-community-health-files-shaped-ingestion`,
 * `dl-127-community-health-files` Q1–Q4 (a)).
 *
 * GitHub recognises a contributing guide, a code of conduct, a security policy, issue forms and a
 * pull-request template. `dl-127` adds each of them so that what a contributor submits can be ingested
 * as a Memory element without re-asking, and gives them to `user-docs`' `align-user-docs` phase so
 * that each release re-checks them. This suite pins what can be read offline:
 *
 * - `CONTRIBUTING.md` is a pointer to `COLLABORATION.md` and `dl-020` (Q1 (a));
 * - `CODE_OF_CONDUCT.md` is the Contributor Covenant 2.1 with its contact placeholder filled (Q2 (a));
 * - `SECURITY.md` supports the minor of `package.json`'s version and names GitHub private
 *   vulnerability reporting as its channel (Q3 (a)); `release-publishing`'s `release-commit` phase (the `tag` phase until task-219) names
 *   `SECURITY.md` among the files of the version bump commit, so a minor bump updates it too;
 * - the bug form's fields are the `bug` template's: its required frontmatter (`title` is the issue
 *   title, `severity` a required dropdown whose options are the template's), `release-origin`, and
 *   one field per body section the reporter writes;
 * - the proposal form asks for what `decision-log-ingest`'s `capture` records: the context, the
 *   options seen and the one preferred;
 * - `config.yml` turns blank issues off and sends questions and vulnerabilities elsewhere;
 * - the pull-request template points at `COLLABORATION.md` and asks for the element implemented;
 * - `align-user-docs` `produces:` lists every one of them (Q4 (a)).
 *
 * Not asserted here (it is GitHub's view, not the repository's): that
 * `gh api repos/wingfoil/wingfoil/community/profile` reports each file, and that private vulnerability
 * reporting is switched on. Both are the approver's post-merge checks (`dl-127` Actions 3–4).
 *
 * Offline and deterministic: files are read from the working tree, lists compared in a fixed order.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

const repoRoot = join(__dirname, '..', '..');

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

/** One element of a GitHub issue form's `body`. */
interface FormField {
  type: string;
  id?: string;
  attributes: { label?: string; options?: string[]; value?: string };
  validations?: { required?: boolean };
}

/** A GitHub issue form (`.github/ISSUE_TEMPLATE/*.yml`). */
interface IssueForm {
  name: string;
  description: string;
  title?: string;
  labels?: string[];
  body: FormField[];
}

function form(path: string): IssueForm {
  return load(read(path)) as IssueForm;
}

/** The input fields of a form (its `markdown` elements are prose, not fields), by `id`. */
function fields(issueForm: IssueForm): Map<string, FormField> {
  return new Map(issueForm.body.filter((field) => field.type !== 'markdown').map((field) => [field.id ?? '', field]));
}

/** The `## ` headings of a Memory template's body, in order. */
function templateSections(template: string): string[] {
  return [...template.matchAll(/^## (.+)$/gm)].map((match) => match[1]!.trim());
}

const COMMUNITY_FILES = [
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/proposal.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
] as const;

describe('task-214 — the community health files exist', () => {
  it.each(COMMUNITY_FILES)('%s is in the repository', (path) => {
    expect(existsSync(join(repoRoot, path))).toBe(true);
  });
});

describe('AC 1 — CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md (dl-127 Q1–Q3 (a))', () => {
  it('CONTRIBUTING.md points at COLLABORATION.md and dl-020, and stays short (Q1 (a))', () => {
    const text = read('CONTRIBUTING.md');
    expect(text).toContain('](COLLABORATION.md)');
    expect(text).toContain('dl-020-contribution-model');
    // A pointer, not a second copy of the contribution model.
    expect(text.split('\n').length).toBeLessThan(read('COLLABORATION.md').split('\n').length / 2);
  });

  it('CODE_OF_CONDUCT.md is the Contributor Covenant 2.1 with an enforcement contact filled in (Q2 (a))', () => {
    const text = read('CODE_OF_CONDUCT.md');
    expect(text.startsWith('# Contributor Covenant Code of Conduct\n')).toBe(true);
    expect(text).toContain('https://www.contributor-covenant.org/version/2/1/code_of_conduct.html');
    for (const heading of ['Our Pledge', 'Our Standards', 'Enforcement Responsibilities', 'Scope', 'Enforcement', 'Enforcement Guidelines', 'Attribution']) {
      expect(text).toMatch(new RegExp(`^## ${heading}$`, 'm'));
    }
    expect(text).not.toContain('[INSERT CONTACT METHOD]');
    expect(text).toMatch(/reported to the community leaders responsible for enforcement at\n\[[^\]]+\]\(mailto:[^)]+\)\./);
  });

  it('SECURITY.md supports the minor of package.json\'s version and reports through GitHub private vulnerability reporting (Q3 (a))', () => {
    const text = read('SECURITY.md');
    const { version } = JSON.parse(read('package.json')) as { version: string };
    const [major, minor] = version.split('.');
    if (!new RegExp(`^\\| ${major}\\.${minor}\\.x +\\| Yes +\\|$`, 'm').test(text)) {
      throw new Error(
        `SECURITY.md does not list ${major}.${minor}.x as supported, but package.json is ${version}: ` +
          'update SECURITY.md in the release bump commit (release-publishing, release-commit phase).',
      );
    }
    expect(text).toContain('https://github.com/wingfoil/wingfoil/security/advisories/new');
    // A vulnerability is never filed as a public issue.
    expect(text).toMatch(/do \*\*not\*\* open a public issue/i);
  });
});

describe('AC 1 — the release bump commit carries SECURITY.md', () => {
  // task-219 (dl-099 §1): the version bump moved out of `tag` into its own `release-commit` phase, which cuts
  // the candidate the staging rehearsal runs on.
  it('release-publishing\'s release-commit phase names SECURITY.md among the files of the version bump commit', () => {
    const workflow = load(read('.wingfoil/workflows/custom/release-publishing.yaml')) as {
      phases: { name: string; description: string }[];
    };
    const releaseCommit = workflow.phases.find((phase) => phase.name === 'release-commit')!;
    expect(releaseCommit.description).toContain('package.json');
    expect(releaseCommit.description).toContain('SECURITY.md');
  });
});

describe('AC 2 — the issue forms and the pull-request template', () => {
  const bugTemplate = read('.wingfoil/memory/templates/bug.md');

  it('the bug form asks for the bug template\'s required frontmatter: severity, with the template\'s values (title is the issue title)', () => {
    const bug = form('.github/ISSUE_TEMPLATE/bug.yml');
    const severityLine = bugTemplate.split('\n').find((line) => line.startsWith('severity:'))!;
    const values = severityLine.replace(/^.*REQUIRED — /, '').split('|').map((value) => value.trim());
    expect(values).toEqual(['critical', 'high', 'medium', 'low']);

    const severity = fields(bug).get('severity');
    expect(severity?.type).toBe('dropdown');
    expect(severity?.attributes.options).toEqual(values);
    expect(severity?.validations?.required).toBe(true);
    expect(bug.title).toBeDefined();
    expect(bug.labels).toEqual(['bug']);
  });

  it('the bug form asks for the WingFoil version as release-origin', () => {
    const version = fields(form('.github/ISSUE_TEMPLATE/bug.yml')).get('release-origin');
    expect(bugTemplate).toMatch(/^release-origin: /m);
    expect(version?.type).toBe('input');
    expect(version?.validations?.required).toBe(true);
  });

  it('the bug form has one field per body section the reporter writes, labelled as the template\'s heading', () => {
    const sections = templateSections(bugTemplate).filter((heading) => heading !== 'Triage & Execution Notes');
    expect(sections).toEqual(['Summary', 'Steps to Reproduce', 'Expected Behavior', 'Actual Behavior', 'Notes']);
    const textareas = form('.github/ISSUE_TEMPLATE/bug.yml')
      .body.filter((field) => field.type === 'textarea')
      .map((field) => field.attributes.label);
    expect(textareas).toEqual(sections);
  });

  it('the bug form requires what dl-127 lists (Steps, Expected, Actual) and leaves Notes optional', () => {
    const byLabel = new Map(form('.github/ISSUE_TEMPLATE/bug.yml').body.map((field) => [field.attributes.label, field]));
    for (const label of ['Summary', 'Steps to Reproduce', 'Expected Behavior', 'Actual Behavior']) {
      expect(byLabel.get(label)?.validations?.required).toBe(true);
    }
    expect(byLabel.get('Notes')?.validations?.required).not.toBe(true);
  });

  it('the proposal form asks for the context, the options seen and the one preferred (decision-log-ingest capture)', () => {
    const proposal = fields(form('.github/ISSUE_TEMPLATE/proposal.yml'));
    for (const id of ['context', 'options', 'preferred']) {
      expect(proposal.get(id)?.type).toBe('textarea');
      expect(proposal.get(id)?.validations?.required).toBe(true);
    }
    // The decision-log template's sections the form fills: Context, then Decision and Rationale from the preferred option.
    expect(templateSections(read('.wingfoil/memory/templates/decision-log.md')).slice(0, 3)).toEqual(['Context', 'Decision', 'Rationale']);
  });

  it('both forms tell the reporter how the issue becomes a Memory element: contributor plus the issue URL, no reported_by: (dl-163)', () => {
    for (const path of ['.github/ISSUE_TEMPLATE/bug.yml', '.github/ISSUE_TEMPLATE/proposal.yml']) {
      const intro = form(path).body.find((field) => field.type === 'markdown')?.attributes.value ?? '';
      expect(intro).toContain('COLLABORATION.md');
      expect(intro).toContain('contributor');
    }
    expect(read('COLLABORATION.md')).toMatch(/`contributor:`[^\n]*\n?[^\n]*issue URL/);
    expect(read('COLLABORATION.md')).toContain('`reported_by:`');
  });

  it('config.yml turns blank issues off and links Discussions and the private security channel', () => {
    const config = load(read('.github/ISSUE_TEMPLATE/config.yml')) as {
      blank_issues_enabled: boolean;
      contact_links: { name: string; url: string; about: string }[];
    };
    expect(config.blank_issues_enabled).toBe(false);
    expect(config.contact_links.map((link) => link.url)).toEqual([
      'https://github.com/wingfoil/wingfoil/discussions/categories/q-a',
      'https://github.com/wingfoil/wingfoil/security/advisories/new',
    ]);
  });

  it('the pull-request template points at COLLABORATION.md first and asks for the element the change implements', () => {
    const text = read('.github/PULL_REQUEST_TEMPLATE.md');
    const collaboration = text.indexOf('COLLABORATION.md');
    const implementsLine = text.search(/^Implements: /m);
    expect(collaboration).toBeGreaterThanOrEqual(0);
    expect(implementsLine).toBeGreaterThan(collaboration);
  });
});

describe('AC 3 — align-user-docs produces the community health files (dl-127 Q4 (a))', () => {
  const userDocs = load(read('.wingfoil/workflows/custom/user-docs.yaml')) as {
    version: number;
    phases: { name: string; produces?: string[] }[];
  };
  const produces = userDocs.phases.find((phase) => phase.name === 'align-user-docs')?.produces ?? [];

  it.each(['COLLABORATION.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', '.github/ISSUE_TEMPLATE/', '.github/PULL_REQUEST_TEMPLATE.md'])(
    'produces lists %s',
    (path) => {
      expect(produces).toContain(path);
    },
  );

  it('the workflow version moved past 1.3', () => {
    expect(userDocs.version).toBeGreaterThan(1.3);
  });
});

describe('task-297 — COLLABORATION.md documents the consumer feedback loop (dl-163 R1, R4, R5, S3f; bug-408)', () => {
  const SECTION = '## Consumer feedback — notes from projects that use WingFoil';
  const collaboration = read('COLLABORATION.md');
  const lines = collaboration.split('\n');

  /** The lines from `heading` (an exact `## ` line) to the next `## ` line, joined; '' when the heading is absent. */
  function section(text: string, heading: string): string {
    const all = text.split('\n');
    const start = all.indexOf(heading);
    if (start < 0) return '';
    const rest = all.slice(start + 1);
    const end = rest.findIndex((line) => /^## /.test(line));
    return [heading, ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
  }

  /** The lines from `heading` (an exact `### ` line) to the next `### ` line or the end; '' when absent. */
  function subsection(sec: string, heading: string): string {
    const all = sec.split('\n');
    const start = all.indexOf(heading);
    if (start < 0) return '';
    const rest = all.slice(start + 1);
    const end = rest.findIndex((line) => /^### /.test(line));
    return [heading, ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
  }

  function flat(s: string): string {
    return s.replace(/\s+/g, ' ');
  }

  const consumerFeedback = section(collaboration, SECTION);
  const sub = (heading: string): string => flat(subsection(consumerFeedback, heading));

  it('AC 1 / AC 2a — case 1: one Consumer feedback section between Credit and Ground rules, with the four headings in order (dl-163 S3f, D5)', () => {
    expect(lines.filter((line) => line === SECTION)).toHaveLength(1);
    const at = lines.indexOf(SECTION);
    const credit = lines.findIndex((line) => line.startsWith('## Credit'));
    const groundRules = lines.indexOf('## Ground rules');
    expect(credit).toBeGreaterThanOrEqual(0);
    expect(at).toBeGreaterThan(credit);
    expect(groundRules).toBeGreaterThan(at);
    expect([...consumerFeedback.matchAll(/^### (.+)$/gm)].map((match) => match[1]!.trim())).toEqual([
      'The feedback inbox',
      'The note format',
      'The sync points',
      'The sync procedure',
    ]);
  });

  it('AC 1 — case 2: the feedback inbox (dl-163 R1, S3b; D3 (a), D4 (a))', () => {
    const text = sub('### The feedback inbox');
    for (const fragment of [
      '`docs/wingfoil-feedback/`',
      '`README.md`',
      '`main`',
      '`feedback_inbox`',
      '`repository`',
      '`service-ingest`',
      'dl-163',
    ]) {
      expect(text).toContain(fragment);
    }
  });

  it('AC 1 — case 3: the note format (dl-163 R4) and the reported_by cite form read from spec-010', () => {
    const text = sub('### The note format');
    expect(text).toContain('`F-<nnn>-<slug>.md`');
    for (const field of ['id', 'title', 'kind', 'status', 'wingfoil_version', 'answered_by']) {
      expect(text).toContain(`\`${field}\``);
    }
    for (const kind of ['defect', 'gap', 'request']) {
      expect(text).toContain(`\`${kind}\``);
    }
    for (const status of ['open', 'needs-info', 'captured', 'resolved', 'declined', 'duplicate']) {
      expect(text).toContain(`\`${status}\``);
    }
    const spec = read('docs/04_memory/design/specs/spec-010-memory-frontmatter-schema.md');
    const cite = /`(<service id>\/F-<nnn>@<sha>)`/.exec(spec);
    expect(cite).not.toBeNull();
    expect(text).toContain(`\`${cite![1]}\``);
  });

  it('AC 1 — case 4: the sync points (dl-163 R5)', () => {
    const text = sub('### The sync points');
    for (const fragment of ['release-planning', 'pin', '`origin/main`', '`vX.Y.Z`', '`release/X.Y`', '`latest`', '`latest-X.Y`']) {
      expect(text).toContain(fragment);
    }
  });

  it('AC 1 — case 5: the sync procedure and the outcome → status mapping (dl-163 R3, S3d, R6; D2 (a))', () => {
    const text = sub('### The sync procedure');
    for (const fragment of ['`## Consumer feedback`', 'feedback-triage.md', '`## Scope changes`', 'git grep', '`answered_by`', 'never commits into']) {
      expect(text).toContain(fragment);
    }
    for (const outcome of ['covered', 'element', 'restated', 'superseded', 'declined', 'needs-info']) {
      expect(text).toContain(`\`${outcome}\``);
    }
  });

  it('case 6 (guard): no registered consumer repository is named — ids and repository names derived from the service files', () => {
    const dir = join(repoRoot, 'docs', '04_memory', 'services');
    const consumers = readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => {
        const parts = readFileSync(join(dir, name), 'utf8').split(/^---$/m);
        return (load(parts[1] ?? '') ?? {}) as { id?: string; kind?: string; url?: string; feedback_inbox?: string };
      })
      .filter((front) => front.kind === 'repository' && typeof front.feedback_inbox === 'string' && front.feedback_inbox !== '');
    expect(consumers.length).toBeGreaterThan(0);
    for (const consumer of consumers) {
      expect(typeof consumer.id).toBe('string');
      expect(collaboration).not.toContain(consumer.id!);
      if (consumer.url) {
        const repository = consumer.url.replace(/\/+$/, '').split('/').pop()!;
        expect(repository).not.toBe('');
        expect(collaboration).not.toContain(repository);
      }
    }
  });

  it('case 7: the COLLABORATION.md version moved (≥ 1.7, date ≥ 2026-10-24; doc-versioning, bug-314)', () => {
    const header = /^\*\*Version:\*\* (\d+)\.(\d+) · \*\*Date:\*\* (\d{4}-\d\d-\d\d)$/m.exec(collaboration);
    expect(header).not.toBeNull();
    expect(Number(header![1]) * 1000 + Number(header![2])).toBeGreaterThanOrEqual(1007);
    expect(header![3]! >= '2026-10-24').toBe(true);
  });

  it('AC 2b — case 8: the site page list still carries COLLABORATION.md (no llms.txt / site.yaml change)', () => {
    const site = load(read('docs/site.yaml')) as { pages: string[] };
    expect(site.pages).toContain('COLLABORATION.md');
  });
});
