---
id: security
name: "Security"
type: directive
kind: custom
title: "Security"
tags: [custom, security, secrets]
ref: [P3.8]
scope: global
---

# Directive — Security

Custom stand-in directive (the P3.8 Security template). Applies to all roles.

> **Stand-in custom directive.** WingFoil ships its official built-in P3.8 templates, and
> `wingfoil init` installs them under `.wingfoil/directives/built-in/` (task-057). This repository's
> hand-authored configuration predates them, so this generic rule (adapted to the project
> methodology/tech-stack in `dna.yaml`) is kept here as `custom`; `ref: [P3.8]` names the built-in
> template it stands in for. Reconciling the stand-ins with the shipped templates is out of scope of
> bug-040, which corrected this note, and is not scheduled.

- Credential handling: never hardcode credentials, tokens, or secrets in source, config, or docs.
- Secrets stay out of version control; use environment/secret managers, not committed files.
- Validate and sanitize external input at boundaries.
- Principle of least privilege for any access the system grants.

> Source: Features §P3.8 (Security: credential handling, secrets). WingFoil's project-specific
> elaboration of this rule lives in the custom directive `security-secrets` (assigned globally).
