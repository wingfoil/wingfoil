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
 *   vulnerability reporting as its channel (Q3 (a));
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
import { existsSync, readFileSync } from 'node:fs';
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
    expect(text).toMatch(new RegExp(`^\\| ${major}\\.${minor}\\.x +\\| Yes +\\|$`, 'm'));
    expect(text).toContain('https://github.com/wingfoil/wingfoil/security/advisories/new');
    // A vulnerability is never filed as a public issue.
    expect(text).toMatch(/do \*\*not\*\* open a public issue/i);
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
