/**
 * The REQ-PERF-02 reference repository: 1,000 committed Memory documents, the measurement condition
 * `docs/02_requirements/03_sard/02_performance-nfr.md` states for every DNA/Memory query budget.
 *
 * Built by task-008-dna-memory-query-latency inside `test/core/query-latency.test.ts` and moved here
 * unchanged by task-154 (`bug-013`), so that the in-process budgets (that file) and the command-level
 * budgets (`test/cli/command-latency.test.ts`) measure the same repository rather than two
 * look-alikes. Everything in it is index-derived — no randomness, no wall clock (REQ-SYS-07).
 */
import { commitAll, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';

/** A keyword planted in a deterministic subset of titles (`index % 13`) and bodies (`index % 7`). */
export const KEYWORD = 'benchmarktoken';

// BDD P1.5 "Find a decision by keyword" (task-067), planted inside the reference repository rather
// than in a fixture of its own so the scenario is timed at REQ-PERF-02's 1,000-document scale, not
// against a two-document toy. Document 750 is `adr-050-doc` — a globally unique id (the `task-*`
// ids repeat across the seven release directories), already tagged `architecture` by the
// `index % TAGS.length` rotation exactly as the scenario's Background requires, and neither a
// `benchmarktoken` metadata hit (`750 % 13 !== 0`) nor a body hit (`750 % 7 !== 0`), so planting it
// leaves the keyword benchmark's match statistics untouched.
const P1_5_DOC_INDEX = 750;
export const P1_5_DOC_ID = 'adr-050-doc';
export const P1_5_TITLE = 'API design';
export const P1_5_TAG = 'architecture';
export const P1_5_QUERY = 'api';

const TAGS = ['architecture', 'infra', 'memory', 'dna', 'workflow'];
const STATUSES = ['draft', 'pending', 'backlog', 'in-progress'];

const DNA_YAML = `
version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

// Mirrors .wingfoil/memory.yaml's real path patterns (states omitted — not needed by the
// query primitives, and MemoryTypeEntry.states is optional).
const MEMORY_YAML = `
version: 1.1
types:
  release-line:
    path: "docs/04_memory/planning/{id}.md"
  release:
    path: "docs/04_memory/planning/{release-line}/{id}.md"
  task:
    path: "docs/04_memory/{release}/{id}.md"
  adr:
    path: "docs/04_memory/design/adrs/{id}.md"
  decision-log:
    path: "docs/04_memory/design/dls/{id}.md"
  tech-spec:
    path: "docs/04_memory/design/specs/{id}.md"
  bug:
    path: "docs/04_memory/bugs/{id}.md"
`;

/** Deterministic filler paragraph — index-derived only, no randomness/wall-clock (REQ-SYS-07). */
function fillerBody(index: number, includeKeyword: boolean): string {
  const line = `Deterministic reference-repository filler content for document ${index}, used only to give the benchmark fixture a realistic body size.`;
  const paragraph = Array.from({ length: 4 }, () => line).join(' ');
  return includeKeyword ? `${paragraph} This one mentions ${KEYWORD} in its body.` : paragraph;
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

interface FixtureDoc {
  readonly relativePath: string;
  readonly id: string;
}

/** Build the 1,000 (path, id) pairs — 700 tasks across 7 releases + 100 each of adr/dl/tech-spec. */
function planFixtureDocs(): FixtureDoc[] {
  const docs: FixtureDoc[] = [];
  for (let release = 1; release <= 7; release += 1) {
    for (let n = 0; n < 100; n += 1) {
      const id = `task-${pad(n)}-doc`;
      docs.push({ relativePath: `docs/04_memory/v0.${release}/${id}.md`, id });
    }
  }
  for (let n = 0; n < 100; n += 1) {
    const id = `adr-${pad(n)}-doc`;
    docs.push({ relativePath: `docs/04_memory/design/adrs/${id}.md`, id });
  }
  for (let n = 0; n < 100; n += 1) {
    const id = `dl-${pad(n)}-doc`;
    docs.push({ relativePath: `docs/04_memory/design/dls/${id}.md`, id });
  }
  for (let n = 0; n < 100; n += 1) {
    const id = `spec-${pad(n)}-doc`;
    docs.push({ relativePath: `docs/04_memory/design/specs/${id}.md`, id });
  }
  return docs;
}

/** The reference document's title: P1.5's Background document at {@link P1_5_DOC_INDEX}, a
 * `benchmarktoken` metadata hit on the `index % 13` rotation, or plain filler. */
function titleFor(index: number, metadataKeywordHit: boolean): string {
  if (index === P1_5_DOC_INDEX) return P1_5_TITLE;
  return metadataKeywordHit ? `Document ${index} ${KEYWORD}` : `Document ${index}`;
}

function docContent(doc: FixtureDoc, index: number, title: string, status: string, keywordInBody: boolean): string {
  const tag = TAGS[index % TAGS.length];
  return [
    '---',
    `id: ${doc.id}`,
    `title: "${title}"`,
    `tags: [ ${tag} ]`,
    `status: ${status}`,
    '---',
    '',
    fillerBody(index, keywordInBody),
    '',
  ].join('\n');
}

/**
 * The history target's post-creation commits (task-049): conventional CLAUDE.md §5.1 subjects rather
 * than the synthetic `transition ->` wording they replaced, so the benchmarked op exercises the real
 * parse paths — `parseMemoryOperation` on the subject, and an `Approver:`/`Reason:` body on the
 * `approve` commit. `start` was chosen in task-049 as a real subject this project writes
 * (`wf(task): start task-049-memory-history [backlog → in-progress]`) that the five-verb parser of the
 * time did not recognise; since task-126 (`dl-079` (A)) it is a declared verb, and the unrecognised-verb
 * case is covered by `test/memory/audit.test.ts` instead.
 */
const HISTORY_TARGET_COMMITS = [
  { status: 'pending', message: 'wf(task): submit task-000-doc' },
  {
    status: 'backlog',
    message:
      'wf(task): approve task-000-doc [pending → backlog]\n\nApprover: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: scheduled into the release',
  },
  { status: 'in-progress', message: 'wf(task): start task-000-doc [backlog → in-progress]' },
] as const;

export const HISTORY_APPROVE_REASON = 'scheduled into the release';

/** Write + commit the 1,000-document reference repository (REQ-PERF-02 measurement conditions). */
export function seedReferenceRepo(): { root: string; historyTarget: string; historyTargetId: string } {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);

  const docs = planFixtureDocs();
  if (docs.length !== 1000) {
    throw new Error(`fixture generator bug: expected exactly 1000 documents, got ${docs.length}`);
  }

  docs.forEach((doc, index) => {
    const status = STATUSES[index % STATUSES.length]!;
    const metadataKeywordHit = index % 13 === 0;
    const bodyKeywordHit = index % 7 === 0 && !metadataKeywordHit;
    writeFixtureFile(root, doc.relativePath, docContent(doc, index, titleFor(index, metadataKeywordHit), status, bodyKeywordHit));
  });

  commitAll(root, 'seed 1000-document reference repository (REQ-PERF-02)');

  // Give the memory-history target a few extra transitions — real `memory history` invocations walk
  // real, multi-commit history, not a single creation commit.
  const historyTarget = docs[0]!;
  for (const { status, message } of HISTORY_TARGET_COMMITS) {
    writeFixtureFile(root, historyTarget.relativePath, docContent(historyTarget, 0, 'Document 0', status, false));
    commitAll(root, message);
  }

  return { root, historyTarget: historyTarget.relativePath, historyTargetId: historyTarget.id };
}
