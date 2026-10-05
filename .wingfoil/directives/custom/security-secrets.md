---
id: security-secrets
name: "Security & secrets handling"
type: directive
kind: custom
title: "Security & secrets handling"
tags: [custom, security, secrets]
scope: global
ref: [docs/02_requirements/03_sard/05_security-compliance.md]
---

# Directive — Security & secrets handling

Custom WingFoil rule. Applies to all roles.

- Never commit credentials, tokens, or secrets to git (everything in `.wingfoil/` is versioned).
- No secrets in Memory documents, DNA, directives, or workflow files.
- MCP Resources are read-only; never expose a write path through the read channel.
- Validate and sanitize all external input at boundaries (Zod).

> Rationale: all project state is git-backed and shared with agents; leaked secrets would be
> permanent in history. Source: SARD §Security & Compliance.

## The secret scan, and how to document a credential without tripping it

Everything under `.wingfoil/` (here also the Memory under `docs/04_memory/`) is checked
by the secret scan (`spec-007-secret-hygiene-patterns`, REQ-SEC-08). It reads the **git index** — what
your next commit would contain — and **any blocking match fails the gate**. Nine of its ten patterns
block, including a JWT-shaped string and a `.env`-style line whose key names a credential
(`dl-036-secret-scan-warn-severity-vs-req-sec-08`). So a line that starts `NPM_TOKEN=` followed by
any value blocks, even inside a code fence, even in a document *about* tokens.

When a document genuinely needs to show such a line, use one of the three `spec-007` §3 exclusions.
Each downgrades the match to `info`: still reported, so the exemption stays auditable, but not failing.

- **Placeholder value** — the value is entirely `x`/`X`/`*`, or exactly `REDACTED`, `PLACEHOLDER` or
  `EXAMPLE` (any case). Prefer this; it keeps an example obviously fake at a glance:

NPM_TOKEN=REDACTED

- **Marked example fence** — put `<!-- example -->` or `<!-- placeholder -->` on its own line directly
  above a backtick code fence; every line inside that fence is exempt:

<!-- example -->
```
NPM_TOKEN=npm_example_value_not_a_real_token
```

- **Ignored path** — list a glob in `.wingfoil/security-ignore` at the project root (one glob per line,
  `#` comments) for a file that must hold a known-fake credential verbatim. A test fixture is built at
  runtime instead (S1 below). Adding a line there is a versioned hygiene exception: justify it in the
  commit message.

None of these makes a real credential safe to commit. A real token goes in a secret store, never in
a file. WingFoil's own npm publish holds none: since `adr-011` it stages through a stage-only npm
trusted publisher over GitHub OIDC, documented in `.github/workflows/publish.yml`.

**What a clean scan claims.** It claims **0 findings on the configuration store** (`.wingfoil/` and,
here, `docs/04_memory/`) and nothing more (`spec-007` §1, `dl-073` (C) and S1). It is not a
pre-publication check: it does not say that the repository holds no secret, nor that a remote's push
protection will accept a push. Publishing is governed separately: `package.json` `files` sets what the
npm package contains, and `spec-015` §5 how the publish authenticates.

## S1 — A fixture that must match a secret pattern is built at runtime

A test, script or fixture file that needs a secret-shaped value assembles it when it runs, by joining
fragments that are not themselves secret-shaped. It is never written as a single source literal that a
secret pattern matches. The assertion is unchanged: the built value is byte-identical to the literal it
replaces. This applies to every tracked file, not only to the configuration store, because every
scanner that meets the repository reads every file (`dl-122`, `dl-073` (B)).

- **Why.** GitHub push protection rejected this repository's pushes over a fake key written as a
  literal in the scanner's own tests (`bug-055`). Each rejection was cleared with a push-protection
  bypass on GitHub. Those bypasses stay load-bearing for any push of the full history, because the
  commits that carry the literal are never rewritten (`dl-035`).
- **How.** Import the value from `test/validation/helpers/secret-fixtures.ts`, or add it there. Each
  value there is pinned to the literal it replaced by a SHA-256 digest
  (`test/validation/secret-fixtures.test.ts`).
- **The check.** A suite test runs the `spec-007` scanner over every tracked file under `test/` and
  fails on any blocking match (`test/validation/secret-scan.test.ts`, block "dl-122 S1"). A line that
  must stay literal uses one of the three exclusions above.
