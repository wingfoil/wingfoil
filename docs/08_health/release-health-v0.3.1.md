# Release health — v0.3.1

| | |
|---|---|
| Release | patch-v0.3.1 (patch) |
| Measurement point | v0.3.1 at 870bd4406f3b9bba5ecde7a5f8198b80c2a98583 (published-tag) |
| Previous run | v0.3 at cc31d7a8ca3940c6ec96dca4e0ef77f32f52dfb1, report docs/08_health/release-health-v0.3.json |
| Catalogue | version 2 (the previous report used version 2; re-measured like-for-like: not needed) |
| Toolchain | Node v22.12.0, npm 10.9.0, lockfile sha256 e467bf4b0270c16721d967c8131e796703d37264a29b46b8d0378d54322bf115 |

## Summary

- Verdicts: improved 13 · stable 15 · regressed 6 · new 0 · not-comparable 3; info 9, pending 1, not measurable 2.
- Floors: held 15, breached 8.
- Findings: 10 (immediate 1: G14, confirmed tracked by bug-402, no bug filed).
- Proposals: 3 (reviewed by propose: G05, Q05, Q14); findings tracked by a confirmed tracker: G08 (dl-190), G14 (bug-402), Q07 (bug-345), Q09 and P03 (dl-173), Q20 (dl-191), P04 (bug-403).
- Previous proposals settled: 9.

## Comparison

| id | Metric | Previous | Value | Raw | Verdict | Flags |
|---|---|---|---|---|---|---|
| G01 | Conventional subjects | 100 | 100 | conforming=727, total=727 | stable, held |  |
| G02 | Commit bodies | 37.81 | 58.32 | total=727, with_body=424 | improved |  |
| G03 | Commit size | median=9, p90=114, share_over_500=1.68 | median=2, p90=83, share_over_500=1.1 | commits=727, lines_total=36846, over_500=8 | improved |  |
| G04 | Subject length | mean=115.9, share_over_72=87.07 | mean=103.16, share_over_72=77.03 | characters=74999, over_72=560, total=727 | improved |  |
| G05 | Code commits citing an id | 99.87 | 97.96 | citing=48, total=49 | stable, breached |  |
| G06 | Approval evidence | 100 | 100 | conforming=83, total=83 | stable, held |  |
| G07 | Unknown identities | 22 | 0 | failing=0, total=769 | improved, held |  |
| G08 | AI attribution conformance | approve_reject_with_ai=94, conforming_share=58.3, distinct_trailers=[AI-Model: claude-opus-5-5, AI-Model: claude-opus-5-5[1m], Co-Authored-By: Claude <noreply@anthropic.com>, Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>] | approve_reject_with_ai=0, conforming_share=99.77, distinct_trailers=[AI-Model: claude-opus-5-5, Co-Authored-By: Claude <noreply@anthropic.com>] | approve_reject_with_ai=0, before_rule=0, conforming=425, judged=426, ratified_at=741bc1fa121065a5e4a11ce530c597106de65e48 | improved, breached |  |
| G09 | Verbs outside the grammar | 0.23 | 0 | outside=0, total=526, verbs_from=src/memory/audit.ts at the point | stable |  |
| G10 | Canonical arrow | 99.96 | 100 | canonical=360, total=360 | stable, held |  |
| G11 | Back-merges | 0.27 | 0 | back_merges=0, task_branches_merged=15 | info | small-sample |
| G12 | Code commits touching docs | 29.32 | 31.25 | total=16, touching_docs=5 | pending | small-sample |
| G13 | Flow volume | per_active_day=266.24, wf_share=69.67 | per_active_day=72.7, wf_share=72.49 | active_days=10, total=727, wf=527 | info |  |
| G14 | Secrets in diffs | 8 | 12 | blocking=12, warnings=0 | regressed, breached |  |
| G15 | Stale branches and duplicate ids | duplicate_ids=0, stale_branches=2 | duplicate_ids=0, stale_branches=0 | duplicate_ids=0, refs_from=live refs at run time, refs_read=25, stale_branches=0 | not-comparable, held | run-time reading |
| G16 | Tool-signed flow commits | 37.65 | 81.94 | signed=431, total=526 | info |  |
| Q01 | Build, typecheck, lint | true | true | build=0, lint=0, typecheck=0 | stable, held |  |
| Q02 | Tests | disabled=0, failing=0, total=8355 | disabled=0, failing=0, total=8928 | failed=0, failed_suites=0, passed=8928, skipped=0, todo=0, total=8928 | stable, held |  |
| Q03 | Coverage | branches=97.4, functions=98.03, lines=99.71, statements=99.34 | branches=97.51, functions=98.18, lines=99.73, statements=99.37 | branches_covered=6789, branches_total=6962, files=129, functions_covered=2159, functions_total=2199, lines_covered=9271, lines_total=9296, statements_covered=11085, statements_total=11155 | stable |  |
| Q04 | Critical-module branch coverage | src/memory/audit.ts=100, src/memory/commit-message.ts=100, src/memory/state-machine.ts=96.2 | src/memory/audit.ts=100, src/memory/commit-message.ts=100, src/memory/state-machine.ts=96.2 | src/memory/audit.ts covered=65, src/memory/audit.ts total=65, src/memory/commit-message.ts covered=93, src/memory/commit-message.ts total=93, src/memory/state-machine.ts covered=76, src/memory/state-machine.ts total=79 | stable, held |  |
| Q05 | Complexity | complex=36, long=19 | complex=41, long=20 | eslint version=10.6.0, files=137, functions_over_complexity=41, functions_over_lines=20, typescript-eslint version=8.62.1 | regressed |  |
| Q06 | Duplication | sources=0.21, tests=6.93 | sources=0.2, tests=7.14 | sources_duplicated=67, sources_lines=33524, tests_duplicated=7240, tests_lines=101419 | stable |  |
| Q07 | Cycles and layering | bypasses=6, cycles=2 | bypasses=3, cycles=2 | bypasses=3, cycles=2, recorded_deviations=3, typescript version=6.0.3 | improved, breached |  |
| Q08 | Dependency footprint | install_size_bytes=20330347, unused_runtime_dependencies=0 | install_size_bytes=22190954, unused_runtime_dependencies=0 | dependencies_bytes=18599916, own_unpacked_bytes=3591038, runtime_dependencies=4, runtime_dependencies_from=npm ls --omit=dev --depth=0, transitive_runtime_packages=96, unused=0 | stable, held |  |
| Q09 | Dangling process ids | 8 | 8 | dangling=8, references=4953, typescript version=6.0.3 | stable, breached |  |
| Q10 | Requirements cited by tests | 75 | — | — | — | not-measurable: the requirements: scope of patch-v0.3.1 (docs/04_memory/design/dls/retro-v0.3.md) names no REQ id at the point |
| Q11 | Runnable examples | 100 | 100 | executed=6, passed=6 | stable, held |  |
| Q12 | CLI latency | 260 | 479 | dna show marginal_p95_ms=108, dna show total_p95_ms=380, floor_p95_ms=412, load_1m_after=6.77, load_1m_before=8.54, machine=otherwise idle, memory history marginal_p95_ms=172, memory history total_p95_ms=443, memory search marginal_p95_ms=207, memory search total_p95_ms=479 | regressed, held |  |
| Q13 | Bug flow | added=263, closed=213, closure_ratio=80.99, open_unassigned=18 | added=15, closed=6, closure_ratio=40, open_unassigned=1 | added=15, closed=6, open=140, open low=122, open medium=18, open_unassigned=1 | regressed | small-sample |
| Q14 | Open decision-logs | count=36, median_age_days=9.34 | count=31, median_age_days=11.35 | in_discussion=31, oldest_age_days=40.26 | regressed |  |
| Q15 | Document divergences | 41.73 | 33.33 | added=15, classified=3, divergences=1, unclassified=12 | improved | small-sample |
| Q16 | Memory volume | comment_line_ratio=43.82, words_median=adr=902.5, bug=397, change-proposal=1115, decision-log=961, plan=1064, release=431.5, release-line=1163, service=318, task=2344, tech-spec=4413 | comment_line_ratio=43.39, words_median=adr=902.5, bug=394.5, change-proposal=1115, decision-log=918, plan=1233.5, release=483, release-line=1163, service=318, task=2437, tech-spec=4413 | adr documents=12, bug documents=414, change-proposal documents=2, comment_lines=14545, decision-log documents=204, non_blank_lines=33524, plan documents=100, release documents=7, release-line documents=1, service documents=22, task documents=304, tech-spec documents=17, typescript version=6.0.3 | info |  |
| Q17 | Install command | — | — | — | — | not-measurable: docs/user-guide.md states no version (a bold **X.Y.Z**) for its install command |
| Q18 | Fix share | 38.41 | 26.67 | classified_by=kind, counts=fix, deprecated=0, feature=11, fix=4, tasks=15, unclassified=0 | improved | small-sample |
| Q19 | Tasks added after commit-backlog | added_after=43, feature=20, fix=23, fix_share=53.49, unclassified=0 | added_after=1, feature=0, fix=1, fix_share=100, unclassified=0 | added_after=1, classified_by=kind, commit_backlog=a56b5aeeca16e0f4eeb36a4ed86acd0aad0b1106, feature=0, fix=1, unclassified=0 | regressed | small-sample |
| Q20 | Bug net flow | -50 | -9 | added=15, terminal=6 | improved, breached | small-sample |
| D01 | Determinism Index — outcome equivalence (O) | — | — | — | not-comparable | a patch release: D01 is measured on major and minor releases only (dl-089 §2) |
| P01 | Well-formed flow commits | 104 | 0 | checked=526, failing=0, unchecked=0 | improved, held |  |
| P02 | Legal transitions | 0 | 0 | checked=727, failing=0, unchecked=0 | stable, held |  |
| P03 | Produces present | 10 | 3 | checked=33, failing=3, unresolved=10 | improved, breached | unresolved 10 |
| P04 | Traceability chain | 13 | 8 | checked=1126, failing=8 | improved, breached |  |
| P05 | Roles and separation of duties | 1 | 0 | approvals=293, checked=293, failing=0, run_records=0, unchecked=0 | improved, held |  |
| P06 | Flow sequence between two runs | — | — | — | not-comparable | a patch release: P06 is measured with D01, on major and minor releases only |
| P07 | Byte-identical recomputation | true | true | identical=true, runs=2 | stable, held |  |
| E01 | GitHub stars | 0 | 0 | — | info | run-time reading |
| E02 | GitHub forks | 0 | 0 | — | info | run-time reading |
| E03 | GitHub watchers | 0 | 0 | — | info | run-time reading |
| E04 | 14-day traffic | clones=739, clones_unique=172, views=20, views_unique=5 | clones=541, clones_unique=143, views=21, views_unique=4 | — | info | run-time reading |
| E05 | npm downloads | last_month=775, last_week=193 | last_month=1179, last_week=404 | — | info | run-time reading |

## Trend

- G01 Conventional subjects: v0.2: 100 · v0.3: 100 · v0.3.1: 100
- G02 Commit bodies: v0.2: 41.36 · v0.3: 37.81 · v0.3.1: 58.32
- G03 Commit size: v0.2: median=25, p90=224, share_over_500=2.34 · v0.3: median=9, p90=114, share_over_500=1.68 · v0.3.1: median=2, p90=83, share_over_500=1.1
- G04 Subject length: v0.2: mean=99.71, share_over_72=77.63 · v0.3: mean=115.9, share_over_72=87.07 · v0.3.1: mean=103.16, share_over_72=77.03
- G05 Code commits citing an id: v0.2: — · v0.3: 99.87 · v0.3.1: 97.96
- G06 Approval evidence: v0.2: 99.53 · v0.3: 100 · v0.3.1: 100
- G07 Unknown identities: v0.2: — · v0.3: 22 · v0.3.1: 0
- G08 AI attribution conformance: v0.2: approve_reject_with_ai=0, conforming_share=—, distinct_trailers=[Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>, Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>] · v0.3: approve_reject_with_ai=94, conforming_share=58.3, distinct_trailers=[AI-Model: claude-opus-5-5, AI-Model: claude-opus-5-5[1m], Co-Authored-By: Claude <noreply@anthropic.com>, Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>] · v0.3.1: approve_reject_with_ai=0, conforming_share=99.77, distinct_trailers=[AI-Model: claude-opus-5-5, Co-Authored-By: Claude <noreply@anthropic.com>]
- G09 Verbs outside the grammar: v0.2: 0.23 · v0.3: 0.23 · v0.3.1: 0
- G10 Canonical arrow: v0.2: 70.62 · v0.3: 99.96 · v0.3.1: 100
- G11 Back-merges: v0.2: 1.23 · v0.3: 0.27 · v0.3.1: 0
- G12 Code commits touching docs: v0.2: — · v0.3: 29.32 · v0.3.1: 31.25
- G13 Flow volume: v0.2: per_active_day=111.77, wf_share=60.29 · v0.3: per_active_day=266.24, wf_share=69.67 · v0.3.1: per_active_day=72.7, wf_share=72.49
- G14 Secrets in diffs: v0.2: 29 · v0.3: 8 · v0.3.1: 12
- G15 Stale branches and duplicate ids: v0.2: duplicate_ids=0, stale_branches=1 · v0.3: duplicate_ids=0, stale_branches=2 · v0.3.1: duplicate_ids=0, stale_branches=0
- G16 Tool-signed flow commits: v0.2: 0 · v0.3: 37.65 · v0.3.1: 81.94
- Q01 Build, typecheck, lint: v0.2: — · v0.3: true · v0.3.1: true
- Q02 Tests: v0.2: disabled=0, failing=0, total=2418 · v0.3: disabled=0, failing=0, total=8355 · v0.3.1: disabled=0, failing=0, total=8928
- Q03 Coverage: v0.2: branches=94.03, functions=98.94, lines=99.41, statements=98.58 · v0.3: branches=97.4, functions=98.03, lines=99.71, statements=99.34 · v0.3.1: branches=97.51, functions=98.18, lines=99.73, statements=99.37
- Q04 Critical-module branch coverage: v0.2: src/memory/audit.ts=64.7, src/memory/commit-message.ts=100, src/memory/state-machine.ts=93.75 · v0.3: src/memory/audit.ts=100, src/memory/commit-message.ts=100, src/memory/state-machine.ts=96.2 · v0.3.1: src/memory/audit.ts=100, src/memory/commit-message.ts=100, src/memory/state-machine.ts=96.2
- Q05 Complexity: v0.2: — · v0.3: complex=36, long=19 · v0.3.1: complex=41, long=20
- Q06 Duplication: v0.2: — · v0.3: sources=0.21, tests=6.93 · v0.3.1: sources=0.2, tests=7.14
- Q07 Cycles and layering: v0.2: — · v0.3: bypasses=6, cycles=2 · v0.3.1: bypasses=3, cycles=2
- Q08 Dependency footprint: v0.2: — · v0.3: install_size_bytes=20330347, unused_runtime_dependencies=0 · v0.3.1: install_size_bytes=22190954, unused_runtime_dependencies=0
- Q09 Dangling process ids: v0.2: — · v0.3: 8 · v0.3.1: 8
- Q10 Requirements cited by tests: v0.2: — · v0.3: 75 · v0.3.1: —
- Q11 Runnable examples: v0.2: 100 · v0.3: 100 · v0.3.1: 100
- Q12 CLI latency: v0.2: — · v0.3: 260 · v0.3.1: 479
- Q13 Bug flow: v0.2: — · v0.3: added=263, closed=213, closure_ratio=80.99, open_unassigned=18 · v0.3.1: added=15, closed=6, closure_ratio=40, open_unassigned=1
- Q14 Open decision-logs: v0.2: — · v0.3: count=36, median_age_days=9.34 · v0.3.1: count=31, median_age_days=11.35
- Q15 Document divergences: v0.2: — · v0.3: 41.73 · v0.3.1: 33.33
- Q16 Memory volume: v0.2: — · v0.3: comment_line_ratio=43.82, words_median=adr=902.5, bug=397, change-proposal=1115, decision-log=961, plan=1064, release=431.5, release-line=1163, service=318, task=2344, tech-spec=4413 · v0.3.1: comment_line_ratio=43.39, words_median=adr=902.5, bug=394.5, change-proposal=1115, decision-log=918, plan=1233.5, release=483, release-line=1163, service=318, task=2437, tech-spec=4413
- Q17 Install command: v0.2: — · v0.3: — · v0.3.1: —
- Q18 Fix share: v0.2: — · v0.3: 38.41 · v0.3.1: 26.67
- Q19 Tasks added after commit-backlog: v0.2: — · v0.3: added_after=43, feature=20, fix=23, fix_share=53.49, unclassified=0 · v0.3.1: added_after=1, feature=0, fix=1, fix_share=100, unclassified=0
- Q20 Bug net flow: v0.2: — · v0.3: -50 · v0.3.1: -9
- D01 Determinism Index — outcome equivalence (O): v0.2: — · v0.3: — · v0.3.1: —
- P01 Well-formed flow commits: v0.2: 297 · v0.3: 104 · v0.3.1: 0
- P02 Legal transitions: v0.2: 15 · v0.3: 0 · v0.3.1: 0
- P03 Produces present: v0.2: 0 · v0.3: 10 · v0.3.1: 3
- P04 Traceability chain: v0.2: 0 · v0.3: 13 · v0.3.1: 8
- P05 Roles and separation of duties: v0.2: 137 · v0.3: 1 · v0.3.1: 0
- P06 Flow sequence between two runs: v0.2: — · v0.3: — · v0.3.1: —
- P07 Byte-identical recomputation: v0.2: true · v0.3: true · v0.3.1: true
- E01 GitHub stars: v0.2: — · v0.3: 0 · v0.3.1: 0
- E02 GitHub forks: v0.2: — · v0.3: 0 · v0.3.1: 0
- E03 GitHub watchers: v0.2: — · v0.3: 0 · v0.3.1: 0
- E04 14-day traffic: v0.2: — · v0.3: clones=739, clones_unique=172, views=20, views_unique=5 · v0.3.1: clones=541, clones_unique=143, views=21, views_unique=4
- E05 npm downloads: v0.2: — · v0.3: last_month=775, last_week=193 · v0.3.1: last_month=1179, last_week=404

## Findings

- G05 Code commits citing an id: floor breached; value 97.96; previous 99.87; raw citing=48, total=49; failing (1): 6cedee44376cb3b9665d4659dad1d61e69c40b75
- G08 AI attribution conformance: floor breached; value approve_reject_with_ai=0, conforming_share=99.77, distinct_trailers=[AI-Model: claude-opus-5-5, Co-Authored-By: Claude <noreply@anthropic.com>]; previous approve_reject_with_ai=94, conforming_share=58.3, distinct_trailers=[AI-Model: claude-opus-5-5, AI-Model: claude-opus-5-5[1m], Co-Authored-By: Claude <noreply@anthropic.com>, Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>]; raw approve_reject_with_ai=0, before_rule=0, conforming=425, judged=426, ratified_at=741bc1fa121065a5e4a11ce530c597106de65e48; failing (1): df89679a05b94596bd13b4ed3ecb1a15b0cd569c
- G14 Secrets in diffs: floor breached; value 12; previous 8; raw blocking=12, warnings=0; failing (12): 56e62b4980cbe82e8689145de277981aad7bda5b docs/05_plans/rl-v1/rel-v0.3/release-publishing-rel-v0.3-plan.md generic-api-key-assignment, 908dbe3647d68608291a2505a3a5abf71d59e9ce docs/05_plans/rl-v1/rel-v0.3/release-publishing-rel-v0.3-plan.md generic-api-key-assignment, 3a6102e2932febebdfc7d8d6cfddb595e301b3df docs/05_plans/rl-v1/rel-v0.3/bug-ingest-rel-v0.3-release-health-immediate-plan.md generic-api-key-assignment, 3a6102e2932febebdfc7d8d6cfddb595e301b3df docs/05_plans/rl-v1/rel-v0.3/bug-ingest-rel-v0.3-release-health-immediate-plan.md generic-api-key-assignment, 3a6102e2932febebdfc7d8d6cfddb595e301b3df docs/05_plans/rl-v1/rel-v0.3/bug-ingest-rel-v0.3-release-health-immediate-plan.md generic-api-key-assignment, a6089acd2b3cb034cea172c1873a6c8aa4a3f0bd docs/04_memory/bugs/bug-402-the-spec-007-generic-api-key-assignment-and-dotenv-patterns-flag-ordinary-code-such-as-const-token-stopthelinetoken-breaching-g14-with-no-secret.md generic-api-key-assignment, dffbdba1761ab743291e83bf01c81ad1f8eee703 docs/04_memory/bugs/bug-402-the-spec-007-generic-api-key-assignment-and-dotenv-patterns-flag-ordinary-code-such-as-const-token-stopthelinetoken-breaching-g14-with-no-secret.md generic-api-key-assignment, dffbdba1761ab743291e83bf01c81ad1f8eee703 docs/04_memory/bugs/bug-402-the-spec-007-generic-api-key-assignment-and-dotenv-patterns-flag-ordinary-code-such-as-const-token-stopthelinetoken-breaching-g14-with-no-secret.md generic-api-key-assignment, dffbdba1761ab743291e83bf01c81ad1f8eee703 docs/04_memory/bugs/bug-402-the-spec-007-generic-api-key-assignment-and-dotenv-patterns-flag-ordinary-code-such-as-const-token-stopthelinetoken-breaching-g14-with-no-secret.md generic-api-key-assignment, dffbdba1761ab743291e83bf01c81ad1f8eee703 docs/04_memory/bugs/bug-402-the-spec-007-generic-api-key-assignment-and-dotenv-patterns-flag-ordinary-code-such-as-const-token-stopthelinetoken-breaching-g14-with-no-secret.md generic-api-key-assignment, dffbdba1761ab743291e83bf01c81ad1f8eee703 docs/04_memory/bugs/bug-402-the-spec-007-generic-api-key-assignment-and-dotenv-patterns-flag-ordinary-code-such-as-const-token-stopthelinetoken-breaching-g14-with-no-secret.md generic-api-key-assignment, d699bb92be093c58bdcd43546cb4fce33d661476 docs/08_health/release-health-v0.3.md generic-api-key-assignment. Immediate: file through bug-ingest in this run (dl-089 §5)
- Q05 Complexity: regressed; value complex=41, long=20; previous complex=36, long=19; raw eslint version=10.6.0, files=137, functions_over_complexity=41, functions_over_lines=20, typescript-eslint version=8.62.1; failing (61): src/agent/execute.ts:511 Async function 'runPipeline': complexity 44, src/agent/launch.ts:272 Async function 'postRunFacts': complexity 20, src/agent/run-log.ts:184 Function 'fieldDefect': complexity 18, src/cli/program.ts:74 Async function 'buildProgram': complexity 17, src/cli/registrar.ts:104 Async method 'run': complexity 23, src/core/agent-execute.ts:51 Async arrow function: complexity 19, src/core/context.ts:795 Function 'assembleExecutionContext': complexity 36, src/core/index.ts:594 Async function 'runDnaMutation': complexity 16, src/core/index.ts:932 Async arrow function: complexity 28, src/core/memory-transition.ts:304 Function 'prepareMemoryTransitionAtRev': complexity 31, src/core/memory-transition.ts:518 Function 'requireWipSlot': complexity 16, src/core/workflow-adopt.ts:115 Function 'adoptOne': complexity 20, src/core/workflow-adopt.ts:211 Function 'workflowAdoptAtHead': complexity 25, src/core/workflow-core-checks.ts:162 Arrow function: complexity 33, src/core/workflow-create-remove.ts:232 Async function 'workflowRemove': complexity 19, src/core/workflow-deduction.ts:216 Function 'readFacts': complexity 20, src/core/workflow-diagnostics.ts:393 Function 'phaseEvidenceDiagnostics': complexity 18, src/core/workflow-exit-state.ts:210 Arrow function: complexity 38, src/core/workflow-exit-state.ts:222 Arrow function: complexity 22, src/core/workflow-exit-state.ts:289 Arrow function: complexity 22, src/core/workflow-list-show.ts:211 Function 'declaredEvidenceKinds': complexity 16, src/core/workflow-list-show.ts:290 Arrow function: complexity 23, src/core/workflow-next.ts:280 Function 'expectedCommit': complexity 22, src/core/workflow-next.ts:431 Function 'buildStep': complexity 24, src/core/workflow-rekey.ts:116 Function 'workflowRekeyAtHead': complexity 16, src/core/workflow-start-end.ts:225 Async function 'workflowStart': complexity 21, src/core/workflow-status.ts:163 Function 'instanceLines': complexity 16, src/directives/roles-edit.ts:153 Function 'setRoleAssignmentsInText': complexity 22, src/directives/roles-edit.ts:226 Function 'rewriteRole': complexity 18, src/dna/edit.ts:250 Function 'deepEqual': complexity 16, src/dna/path.ts:255 Function 'resolveDnaPath': complexity 21, src/memory/frontmatter-edit.ts:112 Function 'entryEnd': complexity 20, src/memory/schema.ts:60 Arrow function: complexity 18, src/memory/state-machine.ts:246 Function 'resolveTransitionTarget': complexity 19, src/storage/commit.ts:892 Function 'listPathsAtRevs': complexity 27, src/validation/id.ts:185 Function 'generateId': complexity 17, src/validation/secret-scan.ts:264 Function 'scanText': complexity 16, src/workflow/deduce.ts:1203 Method 'iterate': complexity 19, src/workflow/deduce.ts:1304 Method 'leaf': complexity 43, src/workflow/deduce.ts:1534 Method 'actionTarget': complexity 28, src/workflow/provenance.ts:217 Function 'resolveProvenance': complexity 19, src/agent/execute.ts:511 Async function 'runPipeline': 157 lines, src/cli/program.ts:74 Async function 'buildProgram': 196 lines, src/cli/registrar.ts:89 Function 'buildCliCommands': 124 lines, src/cli/registrar.ts:90 Arrow function: 122 lines, src/cli/registrar.ts:104 Async method 'run': 106 lines, src/core/context.ts:795 Function 'assembleExecutionContext': 105 lines, src/core/index.ts:932 Async arrow function: 114 lines, src/core/index.ts:1507 Async arrow function: 98 lines, src/core/memory-transition.ts:304 Function 'prepareMemoryTransitionAtRev': 170 lines, src/core/workflow-diagnostics.ts:234 Function 'workflowFileDiagnostics': 92 lines, src/core/workflow-exit-state.ts:194 Function 'compute': 170 lines, src/core/workflow-exit-state.ts:210 Arrow function: 152 lines, src/dna/path.ts:255 Function 'resolveDnaPath': 92 lines, src/mcp/memory-resource.ts:75 Function 'registerMemoryResources': 100 lines, src/memory/schema.ts:60 Arrow function: 84 lines, src/workflow/deduce.ts:1014 Method 'run': 83 lines, src/workflow/deduce.ts:1203 Method 'iterate': 99 lines, src/workflow/deduce.ts:1304 Method 'leaf': 149 lines, src/workflow/deduce.ts:1682 Function 'deduceWorkflowState': 89 lines, src/workflow/provenance.ts:217 Function 'resolveProvenance': 108 lines
- Q07 Cycles and layering: floor breached; value bypasses=3, cycles=2; previous bypasses=6, cycles=2; raw bypasses=3, cycles=2, recorded_deviations=3, typescript version=6.0.3; failing (5): bypass: src/cli/init-command.ts imports ../storage (src/storage), bypass: src/cli/program.ts imports ../storage (src/storage), bypass: src/mcp/prompt.ts imports ../storage (src/storage), cycle: src/agent/execute.ts → src/core/context.ts → src/memory/index.ts → src/memory/audit.ts → src/core/index.ts → src/core/agent-execute.ts, cycle: src/mcp/index.ts → src/mcp/server.ts
- Q09 Dangling process ids: floor breached; value 8; previous 8; raw dangling=8, references=4953, typescript version=6.0.3; failing (8): test/cli/program.integration.test.ts: task-999, test/core/helpers/reference-repo.ts: adr-050, test/core/memory-add-date-author.test.ts: bug-20260930, test/core/memory-approve.test.ts: task-999, test/core/memory-reject.test.ts: task-999, test/core/memory-submit.test.ts: task-999, test/core/relevance.test.ts: task-600, test/core/relevance.test.ts: task-900
- Q14 Open decision-logs: regressed; value count=31, median_age_days=11.35; previous count=36, median_age_days=9.34; raw in_discussion=31, oldest_age_days=40.26
- Q20 Bug net flow: floor breached; value -9; previous -50; raw added=15, terminal=6; failing (1): net flow -9: 6 bugs reached closed or deprecated, 15 were added
- P03 Produces present: floor breached; value 3; previous 10; raw checked=33, failing=3, unresolved=10; failing (3): release-submit-rel-v0.1-plan: docs/07_gates/rl-v1/rel-v0.1-test-results-candidate.md, retrospective-and-config-bootstrap-plan: docs/09_retrospectives/rl-v1/rel-v0.1-friction-inventory.md, retrospective-and-config-bootstrap-plan: docs/09_retrospectives/rl-v1/rel-v0.1-feedback-triage.md
- P04 Traceability chain: floor breached; value 8; previous 13; raw checked=1126, failing=8; failing (8): task-174-settle-mcp-prompts-contract-server-preflight-answer-tools: bdd mcp-prompts.feature, task-174-settle-mcp-prompts-contract-server-preflight-answer-tools: bdd test/mcp/mcp-prompts.feature, task-182-build-secret-shaped-fixtures-runtime-gate-test-scanner: bdd .md/.yaml/.feature, task-195-role-session-mcp-prompt-accepts-element-state-returns: bdd mcp-prompts.feature, task-195-role-session-mcp-prompt-accepts-element-state-returns: bdd test/mcp/mcp-prompts.feature, task-211-add-workflow-create-workflow-remove-req-sec: bdd /P3.3-directive-remove.feature, task-211-add-workflow-create-workflow-remove-req-sec: bdd /P4.8-workflow-create.feature, task-244-publish-release-test-results-coverage: bdd mcp-prompts.feature

## Proposals

Reviewed by the `propose` phase (facilitator) on 2026-10-27 from compare's draft: each candidate tracker was read
(`node dist/cli.js memory search <metric id> --format json`, then the element's status and body) and confirmed only
when its text names the finding. No metric at the published tag `v0.3.1` breaches G07 (0), G10 (100), Q01 (true) or
Q02 (8928 tests, 0 failing); G14's breach is confirmed tracked below, so **no bug is filed in this run**
(`dl-089` §5).

**Tracked: candidate confirmed**

- G08 — the one non-conforming commit, `df89679a` (2026-10-19, the post-tag cherry-pick of `dl-186`'s R1 amend,
  written by build 0.2.2), carries `Co-Authored-By:` without the `AI-Model:` trailer (`git show -s --format=%B
  df89679a`). `approve_reject_with_ai` is 0, and the conforming share rose from 58.3 to 99.77. **Confirmed `dl-190`**
  (`in-discussion`, v0.4): the residue of a corrected commit practice in pushed history. Candidate `dl-173` replaced
  (its G08 item is the window's opening, which this run no longer shows).
- G14 — the 12 blocking matches are all `generic-api-key-assignment` hits in prose: plans, `bug-402`'s own file and
  `release-health-v0.3.md` quote the code constructs `bug-402` describes. None is a secret: each hit was read in its
  commit with `scanText` from `dist/validation/secret-scan.js`. **Confirmed `bug-402`** (`triaged`, v0.4): the same
  pattern class, met in documents that quote it. Candidate `bug-363` replaced (no test fixture is among the 12).
- Q07 — **confirmed `bug-345`** (`triaged`, v0.4): the same 2 cycles; the bypasses fell from 6 to 3, and 3 are now
  recorded deviations. Candidate `bug-364` replaced (it names Q07 only as a comparison).
- Q09 — **confirmed `dl-173`** (`in-discussion`, v0.4), item 7: the same 8 fictional ids (`task-999`, `adr-050`,
  `bug-20260930`, `task-600`, `task-900`) that negative tests write on purpose.
- Q20 — value -9 (15 added, 6 terminal), up from -50: **confirmed `dl-191`** (`in-discussion`, v0.4), the absorbed
  share of the low-severity backlog (RH-v0.3-06, adopted).
- P03 — the 3 missing files are produces of two v0.1 plans
  (`release-submit-rel-v0.1-plan`, `retrospective-and-config-bootstrap-plan`), readable since `task-301` gave the six
  v0.1 plans their frontmatter: **confirmed `dl-173`** (`in-discussion`, v0.4), as RH-v0.3-07 was settled.
- P04 — the 8 failures are feature-file suffixes (`mcp-prompts.feature`, `/P3.3-directive-remove.feature`, …) and a
  prose citation (`.md/.yaml/.feature`) in tasks 174, 182, 195, 211 and 244: **confirmed `bug-403`** (`triaged`,
  v0.4), the same two causes (RH-v0.3-08, adopted).
- Candidates replaced with no tracker of their own: G05's `bug-364` (RH-v0.3.1-01), Q05's `bug-364` (RH-v0.3.1-02),
  Q14's `bug-357` (its fallback date, not the age: RH-v0.3.1-03).

### RH-v0.3.1-01 — G05 Code commits citing an id

- Finding: G05 floor breached (value 97.96; previous 99.87)
- Evidence: raw citing=48, total=49; the one failure is `6cedee44` (2026-10-21, `docs(bdd): P4.21 and REQ-STATE-11
  aligned with the identify-specs revisions of patch-v0.3.1`, touching two test allowlists). Its body names
  `release-planning-rel-v0.3.1-plan`, a feature id and a requirement id, but no id G05 counts. RH-v0.3-03, the same
  kind of one-off, was not adopted.
- Proposed element: none, or a `dl-173` item if the approver wants G05 to count plan, feature and requirement ids as
  citations (recommended disposition: accept as a one-off, 1 of 49 in a patch window)
- Proposed target release: v0.4

### RH-v0.3.1-02 — Q05 Complexity

- Finding: Q05 regressed (complex 36 → 41, long 19 → 20)
- Evidence: the functions over the thresholds that are new since v0.3.0 (`node -e` over the two reports' Q05
  failing lists): `adoptOne` (20) and `workflowAdoptAtHead` (25) in `src/core/workflow-adopt.ts`,
  `workflowRekeyAtHead` (16) in `src/core/workflow-rekey.ts`, `resolveProvenance` (19, 108 lines) in
  `src/workflow/provenance.ts`, `runDnaMutation` (16) in `src/core/index.ts`, and `deduceWorkflowState` grown to 89
  lines; the `leaf` method of `src/workflow/deduce.ts` went from complexity 42 to 43 and from 144 to 149 lines. These
  are the v0.3.1 features `workflow adopt` and `rekey` (task-293–295) and task-299's version raise.
- Proposed element: decision-log (whether dev-loop's `refactor` gate holds a complexity and length budget for the
  functions a task adds or grows, such as an eslint `complexity` / `max-lines-per-function` rule at warn on changed
  files)
- Proposed target release: v0.4

### RH-v0.3.1-03 — Q14 Open decision-logs

- Finding: Q14 regressed (count 36 → 31, median age 9.34 → 11.35 days)
- Evidence: raw in_discussion=31, oldest_age_days=40.26. The count fell, while the age rose because 21
  decision-logs assigned v0.4 wait for its `reconcile-governance`, which follows v0.3.2 (approver ruling of
  2026-10-26, `dl-186` revision).
- Proposed element: none (an expected effect of the deferred v0.4 planning; re-read at v0.4's run)
- Proposed target release: v0.4

## Previous proposals

| Proposal | Linked element | Settled as |
|---|---|---|
| RH-v0.3-01 | dl-189-how-long-a-wf-commit-subject-may-be-and-whether-a-subject-only-commit-is-acceptable | adopted and effective |
| RH-v0.3-02 | dl-189-how-long-a-wf-commit-subject-may-be-and-whether-a-subject-only-commit-is-acceptable | adopted and effective |
| RH-v0.3-03 | — | not adopted |
| RH-v0.3-04 | dl-190-the-residue-of-a-corrected-commit-practice-is-accepted-and-whether-the-governance-check-becomes-a-pre-push-gate | adopted and effective |
| RH-v0.3-05 | — | superseded |
| RH-v0.3-06 | dl-191-how-much-of-the-open-low-severity-bug-backlog-a-release-absorbs-and-whether-triage-bugs-sweeps-the-unassigned-bugs | adopted and effective |
| RH-v0.3-07 | dl-173-amend-the-release-health-catalogue-where-measure.cjs-had-to-choose-a-definition-that-changes-the-value | adopted and effective |
| RH-v0.3-08 | bug-403-p04-cannot-resolve-feature-file-path-suffixes-and-reads-prose-as-citations-and-four-tasks-cite-a-feature-file-that-does-not-exist | adopted and effective |
| RH-v0.3-09 | — | superseded |

## Improvements

- G02 Commit bodies: 37.81 → 58.32 (follows RH-v0.3-01)
- G03 Commit size: median=9, p90=114, share_over_500=1.68 → median=2, p90=83, share_over_500=1.1
- G04 Subject length: mean=115.9, share_over_72=87.07 → mean=103.16, share_over_72=77.03 (follows RH-v0.3-02)
- G07 Unknown identities: 22 → 0
- G08 AI attribution conformance: approve_reject_with_ai=94, conforming_share=58.3, distinct_trailers=[AI-Model: claude-opus-5-5, AI-Model: claude-opus-5-5[1m], Co-Authored-By: Claude <noreply@anthropic.com>, Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>] → approve_reject_with_ai=0, conforming_share=99.77, distinct_trailers=[AI-Model: claude-opus-5-5, Co-Authored-By: Claude <noreply@anthropic.com>]
- Q07 Cycles and layering: bypasses=6, cycles=2 → bypasses=3, cycles=2
- Q15 Document divergences: 41.73 → 33.33
- Q18 Fix share: 38.41 → 26.67
- Q20 Bug net flow: -50 → -9 (follows RH-v0.3-06)
- P01 Well-formed flow commits: 104 → 0 (follows RH-v0.3-04)
- P03 Produces present: 10 → 3 (follows RH-v0.3-07)
- P04 Traceability chain: 13 → 8 (follows RH-v0.3-08)
- P05 Roles and separation of duties: 1 → 0
