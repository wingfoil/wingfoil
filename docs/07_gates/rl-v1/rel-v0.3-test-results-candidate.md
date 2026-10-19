# Test results — 2153f0f5ab79d05c07e625c631e96b4d11973b51

| Field | Value |
|---|---|
| Commit | `2153f0f5ab79d05c07e625c631e96b4d11973b51` |
| Tag | n/a |
| CI run | n/a |
| Build | `0.2.2 (2153f0f5ab79d05c07e625c631e96b4d11973b51)` |
| Result | passed |

## Suites

| Suite | Files | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| unit | 358 | 6711 | 6711 | 0 | 0 |
| integration | 41 | 491 | 491 | 0 | 0 |
| BDD | 59 | 1081 | 1081 | 0 | 0 |
| smoke | 1 | 70 | 70 | 0 | 0 |
| API-docs | 1 | 1 | 1 | 0 | 0 |
| lint.clean | 1 | 1 | 1 | 0 | 0 |
| total | 461 | 8355 | 8355 | 0 | 0 |

One Jest run, classified per test file by the first rule that matches: `lint.clean` is `test/lint/lint-clean.test.ts`; `API-docs` is `test/docs/api-docs.test.ts`; `smoke` is `test/cli/e2e-smoke.test.ts`; `BDD` is a file whose leading block comment cites a `.feature` file of `docs/02_requirements/02_bdd/features/` (full path, relative path or bare name, ending in `.feature`); `integration` is a `*.integration.test.ts` file; `unit` is every other file. Skipped counts pending, skipped, todo and disabled tests. The result is failed on any failure, and also when Jest reports the run unsuccessful with none (a missed coverage threshold). The latency suites (`test/latency-suites.cjs`) run apart and are not in this run. The staging smoke is the CI run’s `stage` job.

## Coverage

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| statements | 10406 | 10475 | 99.34 |
| branches | 6389 | 6560 | 97.39 |
| functions | 1992 | 2032 | 98.03 |
| lines | 8747 | 8772 | 99.71 |
