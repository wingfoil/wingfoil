# Security policy

## Supported versions

Security fixes are made on the latest published minor of the npm package
[`wingfoil`](https://www.npmjs.com/package/wingfoil). Upgrade to its latest patch before reporting.

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Reporting a vulnerability

Please do **not** open a public issue, discussion or pull request for a vulnerability.

Report it privately through GitHub's private vulnerability reporting:
[open a draft security advisory](https://github.com/wingfoil/wingfoil/security/advisories/new)
(the repository's **Security** tab, then **Report a vulnerability**). Only you and the maintainers see
the report.

To let the report be captured without asking you again, give what the public bug form asks for:

- **Severity:** `critical`, `high`, `medium` or `low`, as you judge it;
- **WingFoil version:** the output of `wingfoil --version`;
- **Summary**, **Steps to Reproduce**, **Expected Behavior** and **Actual Behavior**;
- **Notes:** your environment, the impact you see, and a fix if you have one.

## What happens next

The report stays private while it is assessed and fixed. Once the fix is published, the vulnerability is
recorded in the repository as a `bug` element through `bug-ingest`, with you as its `contributor` unless
you ask not to be named, and the advisory is published (see [`COLLABORATION.md`](COLLABORATION.md)).
