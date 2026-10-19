# Test results — v0.3.0

| Field | Value |
|---|---|
| Commit | `cc31d7a8ca3940c6ec96dca4e0ef77f32f52dfb1` |
| Tag | `v0.3.0` |
| CI run | https://github.com/wingfoil/wingfoil/actions/runs/39318377532 |
| Build | `0.3.0 (cc31d7a8ca3940c6ec96dca4e0ef77f32f52dfb1)` |
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
| branches | 6390 | 6560 | 97.4 |
| functions | 1992 | 2032 | 98.03 |
| lines | 8747 | 8772 | 99.71 |
