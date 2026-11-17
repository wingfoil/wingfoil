/**
 * task-358 (`bug-469`, approver ruling D1 (B); `spec-003-workflows-yaml-schema` Layer 3 as amended at the task's design
 * gate) — the binding of every check of this repository's workflows, as the task's design table classifies it: the
 * four `run` bindings, the checks bound `manual: true` "until a command" decides them, and the checks bound
 * `manual: true` "on purpose". Shared by `test/core/workflow-bindings-complete.test.ts` and
 * `test/core/workflow-manual-prose-checks.test.ts`; names are as `tokenName` cuts them.
 */

/** The four checks a command decides, and the argument vector each runs (design table rows R1–R4). */
export const RUN_BINDINGS: readonly (readonly [string, readonly string[]])[] = [
  ['retrospective.present', ['node', 'scripts/check-retrospective.cjs', '{element.path}']],
  ['agents-md.current', ['npm', 'test', '--', 'test/docs/agents-md.test.ts']],
  ['e2e-smoke.scenario', ['node', 'scripts/e2e-smoke.cjs', '--candidate']],
  ['mcp.registered', ['npm', 'run', 'check:mcp']],
];

/**
 * The 37 checks a command could decide but none does yet, bound `manual: true` until it exists (D1 (B), D4; design
 * rows M1–M15): the 44 of task-303's unbound list minus the 13 now bound `run`, plus `gate.slot-free` (task-349), the
 * two `100% …` halves of the split checks and the two mechanical halves of `bug-435` item 4, plus `downcast.in-scope`
 * (task-359, `dl-166` Q1 (b), approver ruling D2 (A): vision-change's scoped-downcast post-check).
 */
export const MANUAL_UNTIL_A_COMMAND = [
  'frontmatter.required',
  'secret-scan.clean',
  'change-proposal.target_release is not empty',
  'valid JSON; no duplicate IDs; no circular dependencies',
  'valid JSON parse',
  'no duplicate IDs',
  'no circular dependencies',
  'all releases where release-line={release-line.version} are status',
  '`npm run -s wingfoil -- --version` == the version package.json pins',
  'new pin >= old pin, and `npm view wingfoil versions` lists it',
  'the switch commit changes only package.json and package-lock.json',
  'change-proposals.swept',
  'ready-decision-logs.covered',
  'task.wave.declared',
  'waves.declared',
  'docs.examples.passing',
  'stop-the-line.clear',
  'growth.clear',
  'tech-spec.approved',
  'depends_on.acknowledged',
  'tests.exist',
  'tests.failing',
  'tests.unchanged',
  'all tasks where tags=[{release.version}] are status',
  'all bugs where tags=[{release.version}] are status',
  'phase-branch-merged-to-integration-branch',
  'staged version approved on npm, installable from the npm registry once its tarball answers HTTP 200, its GitHub Release created with the test reports attached and its MCP Registry listing published',
  'every catalogue metric has a value or an explicit not-measurable reason',
  'every regressed metric and every breached floor has a finding',
  "every finding is tracked by an element or carries an RH proposal in the report's Proposals section",
  'deprecated content excluded from agent context and default search',
  'gate.slot-free',
  '100% of MVP Canvas features covered',
  '100% of MVP Canvas features included',
  'feedback-notes.recorded',
  'proposals.disposed',
  'downcast.in-scope',
] as const;

/**
 * The 19 checks a human confirms on purpose (design rows P1–P3 and the manual names at `HEAD`): the 19 of task-298,
 * task-303 and task-348 minus the two mixed keys the splits replace and the two mechanical halves that move to the
 * other group, plus the two edge-case halves, `feedback-notes.restated` and `proposals.outcome-chosen`.
 */
export const MANUAL_ON_PURPOSE = [
  'each scenario atomic + testable; zero ambiguous adjectives/adverbs',
  'every REQ has a numeric/percentage/boolean Fit Criterion',
  'each story has >=1 happy path and >=1 edge/error path',
  'no ambiguous adjectives/adverbs',
  'each scenario atomic and testable',
  'every REQ has a clearly numeric, percentage-based, or boolean Fit Criterion',
  'spec-review.passed',
  'the wingfoil-cli directive re-checked against the new pin',
  'acceptance-criteria.consistent',
  'pinned-build.reads',
  'claims.rerun',
  'rereview.previous-reject',
  "user-facing docs aligned with the release's shipped CLI/feature surface",
  'demo.rendered',
  'secondary-sources.listed',
  'edge-case stories present',
  'edge-case stories generated',
  'feedback-notes.restated',
  'proposals.outcome-chosen',
] as const;
