---
id: "bug-055-secret-scan-fixture-literal-blocks-push-protection"
type: bug
title: "The secret scanner's own AWS test fixture is a secret-shaped literal, so GitHub push protection rejected the repository's first push and a permanent allowlist exception had to be created to ship it"
status: closed
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P3.8"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`test/validation/secret-scan.test.ts` proves each `spec-007` pattern by feeding `scanText` a string of
the shape that pattern matches. Those strings are **source literals**. GitHub push protection scans
everything pushed, so the first `git push` of this repository to `github.com:robypomper/wingfoil` was
rejected with `GH013 … Push cannot contain secrets`, naming that file at lines 66 and 68 across five
commits as an "Amazon AWS Secret Access Key". The value is deliberately fake — its only job is to have
the right *shape* — so the detection is a false positive in substance and a hard blocker in effect.
The approver cleared it through GitHub's allow-secret URL, which means a **standing allowlist
exception now exists on the repository**, created in order to ship a test fixture.

## Steps to Reproduce

Measured 2026-09-21 on `main` at `ba2cad0`, against the build in a clean worktree
(`npm ci` + `npm run build`, exit 0).

1. The fixture, `test/validation/secret-scan.test.ts:65-71`:

```
  it('flags an AWS secret access key assignment', () => {
    const result = scanText(
      'aws_secret_key: "fAkEsEcReT…<elided, 40 chars>…"\n',
      'fixture.txt',
    );
    expect(result.blocking.map((f) => f.patternId)).toContain('aws-secret-access-key');
  });
```

```
$ grep -n "fAkEsEcReT" test/validation/secret-scan.test.ts
68:      'aws_secret_key: "fAkEsEcReT…<elided, 40 chars>…"\n',
```

The value is 40 characters, which is what makes it match: `spec-007`'s `aws-secret-access-key` regex
(`src/validation/secret-scan.ts:64-70`) is
`/aws.{0,20}(secret|key).{0,5}[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/i`.

2. **The reported line numbers check out per commit** — the report named "lines 66 and 68 across five
   commits", and the literal does sit at 66 in the oldest and 68 in the others:

```
$ for s in 6e35188 79c3d94 9751d3c 6a3b02f f0076f9; do
    echo -n "$s -> "; git show $s:test/validation/secret-scan.test.ts | grep -n fAkEsEcReT | cut -d: -f1; done
6e35188 -> 66
79c3d94 -> 68
9751d3c -> 68
6a3b02f -> 68
f0076f9 -> 68
```

All five resolve, and all five are ordinary `task-043` / `task-057` / `task-061` work commits.

3. The remote is the one named in the report:

```
$ git remote -v
origin  git@github.com:robypomper/wingfoil.git (fetch)
origin  git@github.com:robypomper/wingfoil.git (push)
```

4. **The file is not one literal but twenty-four.** Running the project's own pattern set over the
   fixture file — which nothing in production ever does, see `dl-073` — reports:

```
$ node -e 'const s=require("./dist/validation/secret-scan.js");
           const t=s.scanText(require("fs").readFileSync("test/validation/secret-scan.test.ts","utf-8"),
                              "test/validation/secret-scan.test.ts");
           console.log(t.blocking.length, t.blocking.map(f=>f.patternId+"@"+f.line).slice(0,8));'
24 [ 'private-key-pem@52', 'generic-api-key-assignment@57', 'aws-access-key-id@62',
     'aws-secret-access-key@68', 'gcp-service-account-key@75', 'github-token@80',
     'slack-token@85', 'jwt-like@92' ]
```

GitHub flagged one of them. The other twenty-three are the same construction and differ only in
whether a third-party detector happens to recognise the shape.

## Expected Behavior

A repository whose own secret scan reports clean can be pushed. Proving a detection pattern does not
require committing a string that other scanners will detect.

## Actual Behavior

The repository was unpushable until a human created a permanent per-detection allowlist exception on
the GitHub side, and that exception now stands indefinitely on a project whose `security-secrets`
directive is one of its global, all-roles directives.

## Notes

### The suggested fix works — verified, without editing the file

Build the fixture value at runtime so the *file* contains no secret-shaped literal while `scanText`
receives the identical string. Confirmed by running the equivalence outside the test file:

```
$ node -e 'const {scanText}=require("./dist/validation/secret-scan.js");
  const literal="fAkEsEcReT…<elided>…";   // the literal this bug is about
  const built=("fAkE"+"sEcReT"+"1234567890").repeat(2);
  console.log("built === literal ?", built===literal, "| len", built.length);
  const r=scanText("aws_secret_key: \""+built+"\"\n","fixture.txt");
  console.log(r.blocking.map(f=>f.patternId),
              r.blocking.map(f=>f.patternId).includes("aws-secret-access-key")?"PASS":"FAIL");'
built === literal ? true | len 40
[ 'aws-secret-access-key' ] PASS
```

So the assertion is unchanged, the pattern is exercised on exactly the same bytes, and the coverage the
test provides is identical. `.repeat(2)` is one option among several — concatenation,
`String.fromCharCode`, a small helper — and which reads best is the implementer's call.

Only the **value** needs building: the `aws_secret_key: "` context can stay a literal, because our own
pattern requires both halves and neither half alone matches:

```
$ node -e '…scanText("fAkEsEcReT…<elided>…\n")…'   ->  []          # value alone: no match
$ node -e '…scanText("aws_secret_key: \"" + value + "\"\n")…'          ->  [aws-secret-access-key]
```

**Not verified, and it should be**: whether GitHub's own AWS detector likewise needs the context (in
which case splitting the value is sufficient) or fires on a bare 40-char run near an `aws` token (in
which case the split must be arranged so no 40-char literal survives anywhere on the line). That is a
property of GitHub's detector, not of ours, and the only honest way to settle it is to push a branch
carrying the change and see. Whoever fixes this should do that rather than assume.

### It does not unblock the five historical commits, which is the whole reason the allow was needed

Push protection scans the *commits* being pushed, not the tip tree. Changing the file today leaves
`6e35188`, `79c3d94`, `9751d3c`, `6a3b02f` and `f0076f9` carrying the literal forever, so the
allowlist exception stays load-bearing for any fresh clone-and-push of full history. Rewriting those
commits was considered and **rejected**: `dl-035-task-branch-sync-with-main` (`ready`) forbids
rewriting history that carries state transitions, on the ground that "in WingFoil a state transition
*is* a git commit: `memory.approve`/`memory.reject` carry the approver identity and … a rebase
rewrites every one of them … here it rewrites the evidence" (`:73-78`). That constraint is not
negotiable for a fixture.

So the honest framing is: the fix stops the problem recurring on *new* commits; the exception is
permanent and should be recorded as such rather than quietly forgotten.

### Scope question the fixer must answer, not assume

Fix one literal (the one GitHub flagged) or all twenty-four (step 4)? Fixing one restores the push and
leaves twenty-three tripwires for the next detector GitHub or a downstream mirror enables. Fixing all
touches every test in the file and is a larger, duller diff. There is also a third shape — a shared
`buildFixture()` helper in the test file, so future patterns cannot reintroduce the problem by
copy-paste. This report does not choose.

### Severity `medium`

It blocked the repository's first publication outright, and the workaround was a standing security
exception on a project whose global directives include `security-secrets` — that is more than
cosmetic. Against a higher grade: no real credential was ever exposed (the value is fake and always
was), nothing in production is affected, the tests are correct, and the fix is small and provably
behaviour-preserving.

### Related

`dl-073-scan-surface-vs-publication-boundary` (filed in this batch — the decision this bug is the
occasion for: our declared scan surface excludes `test/` by design while the publication boundary
includes it), `spec-007-secret-hygiene-patterns` (`approved` — §1 scan surface, §2 the pattern this
fixture proves), `dl-036-secret-scan-warn-severity-vs-req-sec-08` (`ready` — the other gap between
REQ-SEC-08's wording and what the gate enforces), `bug-037-dotenv-secret-pattern-misses-prefixed-lines`,
`bug-038-init-skips-secret-scan-of-builtin-templates`, `task-043-secret-credential-hygiene` (authored
the fixture), `task-061-publish-secrets` (`6a3b02f`, `79c3d94`, `9751d3c` — three of the five named
commits), `task-057-builtin-directive-templates` (`f0076f9`), `dl-035-task-branch-sync-with-main`
(`ready` — why the five commits cannot be rewritten), `adr-009-npm-publishing-pipeline`,
`spec-015-packaging-publishing`, REQ-SEC-08, P3.8.

## Triage & Execution Notes

- **Recurred on 2026-09-29.** The push of v0.2.2's dev-loop (`4770a52c..071705dd`, 313 commits) was
  rejected by push protection (GH013, "Amazon AWS Secret Access Key") at commit `3513ecc5` (`task-111`),
  `test/validation/secret-scan.test.ts:68`, the same fixture literal. `task-111` changed only paths in
  that file, not the literal, but the new blob was a new detection. The approver cleared it again
  through the allow-secret URL ("used in tests"), and the push went through. So a **second** allowlist
  exception now exists. Any commit that touches this test file will be blocked again until the
  fixture stops being a secret-shaped literal.


Raised during the round-6 governance ingest (2026-09-21), from a real push attempt reported by the
approver. Filed unfixed — the agent stops at `open`.

What was verified here directly: the fixture line and its value, the pattern that matches it, the
per-commit line numbers (66 in the oldest commit, 68 in the other four — matching the reported
"lines 66 and 68"), that all five shas resolve to ordinary work commits, the remote URL, the
twenty-four-findings count over the whole file, and that a runtime-built value keeps the assertion
passing on byte-identical input.

What was **not** verified, and is reported as received rather than as measured: the `GH013` rejection
itself and the approver's use of the allow-secret URL. Both happened outside this repository, on
GitHub, and no push or network operation was performed from here — deliberately, since re-testing a
push protection block is not something an agent should do on the approver's remote. The corroboration
above (the exact per-commit line numbers falling out of the file's own history) is strong, but it is
corroboration, not reproduction.

Also not attempted, per instruction: editing `test/validation/secret-scan.test.ts`.
