/**
 * task-333 AC 8–10 — the documents the agent-session refusal (`spec-018`, `dl-212` D1) and `bug-395` change:
 *
 * - AC 8 (characterization, checked at design and committed before red, D9): REQ-SEC-03
 *   (`docs/02_requirements/03_sard/05_security-compliance.md`) carries `spec-018`'s description ("from a session no
 *   agent marker marks"), names `amend` beside `approve` and `reject` in its Description and its Fit Criterion
 *   (`bug-395`) and the `E_AGENT_CONTEXT` refusal; P1.7, P1.8 and P4.14 each hold a scenario refused in an agent's
 *   session, so the acceptance tests trace to them;
 * - AC 9 (red-first): the `memory amend` entry of `docs/cli-reference.md` says why its authority refusal names
 *   `approve` (`dl-063` clause B) and names the agent-session refusal;
 * - AC 10 (red-first): AGENTS.md §5.1 states that agents never run `approve`, `reject` or `amend` and that the verbs
 *   refuse an agent's session; the `Reason:` section reserves `Co-Authored-By:` and `AI-Model:` on approvals; the
 *   "only when explicitly instructed" sentences are gone (the exact text of the design, `dl-137` R3/R4).
 *
 * Text is compared with whitespace runs (and Markdown blockquote markers) collapsed, so a re-wrap of a paragraph
 * does not break a pin; the words are pinned verbatim.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const read = (...path: string[]): string => readFileSync(join(REPO_ROOT, ...path), 'utf-8');

/** `text` with blockquote markers dropped and every whitespace run a single space. */
const flat = (text: string): string => text.replace(/^>[ \t]?/gm, '').replace(/\s+/g, ' ').trim();

/** The text from the line starting `start` to the next line starting `end` (exclusive), or to the end. */
function between(text: string, start: string, end: RegExp): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`not found: ${start}`);
  const rest = text.slice(from + start.length);
  const stop = rest.search(end);
  return start + (stop === -1 ? rest : rest.slice(0, stop));
}

describe('task-333 AC 8 — REQ-SEC-03 and the BDD scenarios trace the agent-session refusal (characterization)', () => {
  const sard = read('docs', '02_requirements', '03_sard', '05_security-compliance.md');
  const req = between(sard, '### REQ-SEC-03', /^### /m);
  const description = flat(between(req, '* **Description:**', /^\* \*\*Rationale:\*\*/m));
  const fit = flat(between(req, '* **Fit Criterion:**', /^\* \*\*Traceability:\*\*/m));

  it('the Description takes spec-018 Consequences\' wording and names amend beside approve and reject', () => {
    expect(description).toContain('Only a user holding the required approver role (per DNA), from a session no agent marker marks, may exercise an approval gate');
    expect(description).toContain('`approve`, `reject` **or** `amend`');
  });

  it('the Fit Criterion names amend, keeps the one verb-free authority message and adds E_AGENT_CONTEXT', () => {
    expect(fit).toContain('An `approve`, `reject` **or** `amend` attempt');
    expect(fit).toContain("\"user not authorized to approve type '<type>'\"");
    expect(fit).toContain("E_AGENT_CONTEXT: '<command>' needs the approver and does not run in an agent's session");
  });

  it('the Traceability names spec-018', () => {
    expect(flat(req)).toContain('spec-018-approval-binding-l0-agent-markers-attribution-trailers-and-the-approver-verb-refusal');
  });

  it.each([
    ['p1-memory', 'P1.7-memory-approve.feature', "Error - an approval is refused in an agent's session"],
    ['p1-memory', 'P1.8-memory-reject.feature', "Error - a rejection is refused in an agent's session"],
    ['p4-workflow', 'P4.14-approval-routing.feature', "Error - an approval phase is not recorded from an agent's session"],
  ])('%s/%s has the scenario "%s", quoting E_AGENT_CONTEXT', (folder, file, title) => {
    const feature = read('docs', '02_requirements', '02_bdd', 'features', folder, file);
    const titles = feature
      .split('\n')
      .filter((line) => /^ {2}Scenario( Outline)?: /.test(line))
      .map((line) => line.replace(/^ {2}Scenario( Outline)?: /, ''));
    expect(titles).toContain(title);
    expect(titles.filter((candidate) => candidate.includes("agent's session")).length).toBeGreaterThanOrEqual(1);
    expect(feature).toContain('E_AGENT_CONTEXT');
  });
});

describe('task-333 AC 9 — the memory amend entry of docs/cli-reference.md says why its refusal names approve (bug-395)', () => {
  const entry = flat(between(read('docs', 'cli-reference.md'), '### `wingfoil memory amend`', /^### /m));

  it('states that approve, reject and amend share one authority check and one message', () => {
    expect(entry).toContain(
      "not an approver → exit `1` (`error: user not authorized to approve type 'tech-spec'`): the message names `approve` because `approve`, `reject` and `amend` share one authority check and one message (REQ-SEC-03, `dl-063` clause B)",
    );
  });

  it("names the agent-session refusal: run in an agent's session → exit 1, E_AGENT_CONTEXT naming 'memory amend'", () => {
    expect(entry).toContain("run in an agent's session → exit `1` (`error: E_AGENT_CONTEXT: 'memory amend' needs the approver");
  });
});

describe('task-333 AC 10 — AGENTS.md §5.1 lands with the refusal (dl-212 ratification, spec-018 Consequences)', () => {
  const agents = flat(read('AGENTS.md'));

  it.each([
    [
      'memory.approve step 5',
      "5. Agents never run `memory approve`, `memory reject` or `memory amend`: the approver runs them from their own terminal, and the verbs refuse an agent's session with `E_AGENT_CONTEXT`, whatever its git identity (`dl-212` D1, `spec-018` §3; §4, §8).",
    ],
    [
      'memory.reject step 3',
      "3. Agents never run `memory reject`, nor `approve` or `amend`: the approver runs them from their own terminal, and the verbs refuse an agent's session (`E_AGENT_CONTEXT`, `spec-018` §3). A task with linked bugs: see the two-commit exception above.",
    ],
    [
      'the Reason: block, two reserved keys on an approval',
      '- **On an approval — an operation that writes an `Approver:` line — no line may begin with `Co-Authored-By:` or `AI-Model:` either**, in any letter case: an approval never carries an agent trailer (`spec-018` §3.3), so the CLI refuses such a reason at exit `2`.',
    ],
    [
      "§5.1's closing note (design D12)",
      "Approvals, rejections and amendments are the approver's own, run from the approver's terminal: the verbs refuse an agent's session, and an agent never writes one by hand (§8, `spec-018` §3).",
    ],
  ])('carries the new sentence of %s, verbatim', (_where, sentence) => {
    expect(agents).toContain(flat(sentence));
  });

  it.each(['Agents may execute `memory.approve`', 'Agents may execute `memory.reject`', "run only on the approver's instruction"])(
    'no longer says "%s"',
    (stale) => {
      expect(agents).not.toContain(stale);
    },
  );
});
