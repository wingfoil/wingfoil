/**
 * Secret-shaped fixture values, assembled at runtime (`security-secrets` directive S1, dl-122;
 * task-182, `bug-055`).
 *
 * A test that proves a `spec-007` §2 pattern needs a string of the shape that pattern matches. Written
 * as one source literal, that string is also what GitHub push protection, a mirror's scanner or a
 * data-loss tool sees, and one of them rejected this repository's pushes. So every value below is
 * joined from fragments that no pattern matches on their own: the file holds no secret-shaped literal,
 * and the value each test passes to `scanText` is byte-identical to the literal it replaced
 * (`test/validation/secret-fixtures.test.ts` pins each one by SHA-256).
 *
 * `test/validation/secret-scan.test.ts` › "dl-122 S1" runs the scanner over every tracked file under
 * `test/` and fails on any blocking match, so a fragment split that still matches is caught there.
 * Every value is obviously fake: none is, or was, a real credential.
 */

/** Join fragments into one fixture value. The point is the split in the source, not the function. */
function assemble(...fragments: readonly string[]): string {
  return fragments.join('');
}

/** `private-key-pem`, RSA variant. */
export const FAKE_PEM_RSA_HEADER = assemble('-----BEGIN RSA ', 'PRIVATE KEY-----');

/** `private-key-pem`, with no algorithm. */
export const FAKE_PEM_HEADER = assemble('-----BEGIN ', 'PRIVATE KEY-----');

/** `generic-api-key-assignment`: a whole `api_key: "…"` assignment. */
export const FAKE_API_KEY_ASSIGNMENT = assemble('api_key: "sk_live_', 'fake1234567890abcdef"');

/** `aws-access-key-id`: the bare key id. */
export const FAKE_AWS_ACCESS_KEY_ID = assemble('AKIA', 'FAKEFAKEFAKEFAKE');

/** `aws-secret-access-key`: the 40-character value only; the pattern also needs an `aws…key:` context. */
export const FAKE_AWS_SECRET_ACCESS_KEY = assemble('fAkEsEcReT1234567890', 'fAkEsEcReT1234567890');

/** `gcp-service-account-key`: the JSON `type` member of a service-account key. */
export const FAKE_GCP_SERVICE_ACCOUNT_TYPE = assemble('"type": ', '"service_account"');

/** `github-token`: a personal access token. */
export const FAKE_GITHUB_TOKEN = assemble('ghp', '_fakeFAKEfakeFAKEfakeFAKEfakeFAKEfake');

/** `slack-token`: a bot token. */
export const FAKE_SLACK_TOKEN = assemble('xox', 'b-fake-1234567890-fakefakefakefake');

/** `jwt-like`: header.payload.signature. */
export const FAKE_JWT = assemble('eyJ', 'hbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.fakefakefakefakefakefakefake');

/** `dotenv-style-secret-line` (and `generic-api-key-assignment`): an `NPM_TOKEN=` line. */
export const FAKE_NPM_TOKEN_LINE = assemble('NPM_TOKEN', '=fake1234567890abcdef');
