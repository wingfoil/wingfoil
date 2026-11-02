# Test results — c79a7612f925dddcf5c8c2d3b810831fa9d9b6fb

| Field | Value |
|---|---|
| Commit | `c79a7612f925dddcf5c8c2d3b810831fa9d9b6fb` |
| Tag | n/a |
| CI run | n/a |
| Build | `0.3.1 (c79a7612f925dddcf5c8c2d3b810831fa9d9b6fb)` |
| Result | passed |

## Suites

| Suite | Files | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| unit | 430 | 7831 | 7831 | 0 | 0 |
| integration | 51 | 589 | 589 | 0 | 0 |
| BDD | 67 | 1208 | 1208 | 0 | 0 |
| smoke | 1 | 70 | 70 | 0 | 0 |
| API-docs | 1 | 1 | 1 | 0 | 0 |
| lint.clean | 1 | 1 | 1 | 0 | 0 |
| total | 551 | 9700 | 9700 | 0 | 0 |

One Jest run, classified per test file by the first rule that matches: `lint.clean` is `test/lint/lint-clean.test.ts`; `API-docs` is `test/docs/api-docs.test.ts`; `smoke` is `test/cli/e2e-smoke.test.ts`; `BDD` is a file whose leading block comment cites a `.feature` file of `docs/02_requirements/02_bdd/features/` (full path, relative path or bare name, ending in `.feature`); `integration` is a `*.integration.test.ts` file; `unit` is every other file. Skipped counts pending, skipped, todo and disabled tests. The result is failed on any failure, and also when Jest reports the run unsuccessful with none (a missed coverage threshold). The latency suites (`test/latency-suites.cjs`) run apart and are not in this run. The staging smoke is the CI run’s `stage` job.

## Coverage

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| statements | 11297 | 11377 | 99.29 |
| branches | 6907 | 7099 | 97.29 |
| functions | 2218 | 2261 | 98.09 |
| lines | 9441 | 9470 | 99.69 |
