# A drifted copy of the command enumerations (task-187 fixture)

The code side the test pairs with this file: `dna` (`set`, `show`), `directive` (`assign`),
`directives` (`list`), `memory` (`add`, `submit`), and the flat commands `init` and `paths`.

## Context

Every `wingfoil` command — regardless of pillar (`memory`, `dna`, `directive`) or
flat command (`init`; `init` is a bootstrap command) — is consumed by two audiences.

### 1. Invocation grammar

- `<noun>` is a pillar namespace (`memory`, `dna`, `directive`, `agent`) or a
  flat command (`init`, `paths`, `audit`). The DNA pillar's verbs are `show`, `set`, and
  `teleport` (§9). The Directives pillar exposes two nouns — singular `directive` (`create`,
  `assign`) and plural `directives` () — each a `CoreModule.name`.

### 11. Which baseline each command reads

| Baseline | Commands |
|----------|----------|
| committed | `memory add`, `memory teleport`; `dna set`, `directive assign` |
| working tree | `dna show`, `paths`, `directives list` |

`init` reads no committed configuration.

### 12. Command-specific flags
