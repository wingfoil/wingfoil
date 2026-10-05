/**
 * task-182 (`bug-055`, dl-122 S1) — the runtime-built secret fixtures are byte-identical to the source
 * literals they replaced, so every pattern test exercises exactly the bytes it did before.
 *
 * Each expected digest is the SHA-256 of the literal as it stood at `0b297169` (in
 * `test/validation/secret-scan.test.ts`, and `test/core/builtin-template-secret-scan.test.ts` for the
 * bare PEM header). A digest is not secret-shaped, so the literal itself never has to be written down.
 */
import { createHash } from 'crypto';
import {
  FAKE_API_KEY_ASSIGNMENT,
  FAKE_AWS_ACCESS_KEY_ID,
  FAKE_AWS_SECRET_ACCESS_KEY,
  FAKE_GCP_SERVICE_ACCOUNT_TYPE,
  FAKE_GITHUB_TOKEN,
  FAKE_JWT,
  FAKE_NPM_TOKEN_LINE,
  FAKE_PEM_HEADER,
  FAKE_PEM_RSA_HEADER,
  FAKE_SLACK_TOKEN,
} from './helpers/secret-fixtures';

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf-8').digest('hex');

describe('secret fixtures built at runtime equal the literals they replaced (bug-055, dl-122 S1)', () => {
  it.each([
    ['FAKE_PEM_RSA_HEADER', FAKE_PEM_RSA_HEADER, 31, '8bcac7908eb950419537b91e19adc83ce2c9cbfdacf4f81157fdadfec11f7017'],
    ['FAKE_PEM_HEADER', FAKE_PEM_HEADER, 27, '3021d90eb9437b2d8f30e8363695c4418b5e5f1870801b5c317e9398ee0f572d'],
    ['FAKE_API_KEY_ASSIGNMENT', FAKE_API_KEY_ASSIGNMENT, 39, '5b2a7d69a04a11cda691fe3ae1d20d63842f1e083b40829fbe7e65de24753e94'],
    ['FAKE_AWS_ACCESS_KEY_ID', FAKE_AWS_ACCESS_KEY_ID, 20, '228e2fa94b1e1b9c1d89cc194806f7582d814b3cad812a6a28994dd50eb9d1d5'],
    ['FAKE_AWS_SECRET_ACCESS_KEY', FAKE_AWS_SECRET_ACCESS_KEY, 40, '12676a43826fac629213eb7036d2be24ebb8d6d61f0a2e30232bd14897f46a13'],
    ['FAKE_GCP_SERVICE_ACCOUNT_TYPE', FAKE_GCP_SERVICE_ACCOUNT_TYPE, 25, 'f8c792f8e908ff42f50978a418f4e9bb365deb4022ad2d51302cd304378b6fbb'],
    ['FAKE_GITHUB_TOKEN', FAKE_GITHUB_TOKEN, 40, '0be4633d2b0f2e912beb32404f9fd3fd2801440a1c888cfce894624649a355cf'],
    ['FAKE_SLACK_TOKEN', FAKE_SLACK_TOKEN, 37, 'cc188008acf4268b56b106e1a9466048f64dd75e88aaed7fedc062436becd9a8'],
    ['FAKE_JWT', FAKE_JWT, 69, '4c472674fac9ba153146ff9db3dc1b30e013dbff2ed5ab9f50d4c14e22bc8fc5'],
    ['FAKE_NPM_TOKEN_LINE', FAKE_NPM_TOKEN_LINE, 30, 'febd2861449cf159cda4a0465dd07f946a2662ab2695a93a5419a28e817de9cf'],
  ])('%s is the replaced literal, byte for byte', (_name, value, length, digest) => {
    expect(value).toHaveLength(length);
    expect(sha256(value)).toBe(digest);
  });
});
