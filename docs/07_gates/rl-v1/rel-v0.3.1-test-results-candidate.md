# Test results — d3826aab5a392429f7c6f8423752277e380cb098

| Field | Value |
|---|---|
| Commit | `d3826aab5a392429f7c6f8423752277e380cb098` |
| Tag | n/a |
| CI run | n/a |
| Build | `0.3.0 (d3826aab5a392429f7c6f8423752277e380cb098)` |
| Result | passed |

## Suites

| Suite | Files | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| unit | 395 | 7200 | 7200 | 0 | 0 |
| integration | 45 | 547 | 547 | 0 | 0 |
| BDD | 63 | 1109 | 1109 | 0 | 0 |
| smoke | 1 | 70 | 70 | 0 | 0 |
| API-docs | 1 | 1 | 1 | 0 | 0 |
| lint.clean | 1 | 1 | 1 | 0 | 0 |
| total | 506 | 8928 | 8928 | 0 | 0 |

One Jest run, classified per test file by the first rule that matches: `lint.clean` is `test/lint/lint-clean.test.ts`; `API-docs` is `test/docs/api-docs.test.ts`; `smoke` is `test/cli/e2e-smoke.test.ts`; `BDD` is a file whose leading block comment cites a `.feature` file of `docs/02_requirements/02_bdd/features/` (full path, relative path or bare name, ending in `.feature`); `integration` is a `*.integration.test.ts` file; `unit` is every other file. Skipped counts pending, skipped, todo and disabled tests. The result is failed on any failure, and also when Jest reports the run unsuccessful with none (a missed coverage threshold). The latency suites (`test/latency-suites.cjs`) run apart and are not in this run. The staging smoke is the CI run’s `stage` job.

## Coverage

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| statements | 11085 | 11155 | 99.37 |
| branches | 6788 | 6962 | 97.5 |
| functions | 2159 | 2199 | 98.18 |
| lines | 9271 | 9296 | 99.73 |
